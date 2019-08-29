module EtherIPv4;

export {
    # Similar to Site::private_address_space without the ipv6 addresses
    global local_nets = {
       192.168.0.0/16,
       127.0.0.0/8,
       172.16.0.0/12,
       10.0.0.0/8,
       100.64.0.0/10
    };

    redef enum Log::ID += { LOG_DEV, LOG_NET };

    global Verbose = F &redef;

    # Discard from the final output any tracked devices that are public IPs
    global Use_public = F &redef;

    type TrackedIP: record {
        # The tracked source address
        dev_src_ip: addr &log;

        # The most commonly used machine address with the dev_src_ip
        inferred_mac: string &log;

        first_seen: time &log;

        # All of the observed macs and their frequency
        seen_macs: table[string] of count ;

        device_type: enum { DEVICE, ROUTER, GATEWAY } &log;

        possible_vlan: count &log  &optional;
        possible_subnet: subnet &log &optional;
        possible_r_subnet: subnet &log &optional;

        # Note unused fields for now
        # seen_routes:   table[addr] of string;
        # seen_ports:    set[port];

    };

    # Table that maps every ip address to a TrackedIP object for quick lookup
    global all_src_ips: table[addr] of TrackedIP;

    type TrackedSubnet: record {
        net: subnet &log &optional;
        net_tree: vector of subnet;
        vlan: count &log &optional;
        num_devices: count &log;
        num_strange: count &log &optional;
        router_mac: string &log &optional;
    };

    # Table that maps every src mac address to every src ip address found together in a packet.
    global mac_src_ip_emitted: table[string] of set[addr];

    # Table that maps every src mac address to every vlan tag found in a packet.
    global mac_src_vlan_emitted: table[string] of set[count];

    # Table that tracks every src ip address issued with a specific vlan tag.
    global vlan_ip_emitted: table[count] of set[addr];

    # Table used to track communication with devices outside of a vlan.
    global vlan_ip_strange: table[count] of set[addr];

    # Table of tables that models the arp table of each mac originating traffic
    global mac_src_routing_table: table[string] of table[string] of addr;

    # build_vlans constructs possible vlans based on the src ip addresses
    # and their corresponding vlan tag. It will produce results only as good as
    # the input.
    global build_vlans: function(vlan_ip_tbl_set: table[count] of set[addr], p: bool) : table[count] of TrackedSubnet;

    # find_routers lists all mac addrs with more than one source ip this signifies
    # that the network interface is attached to a router or that the device has 
    # multiple ip addresses or something funky is going on.
    global find_routers: function(p: bool): table[subnet] of string;

    # find_link_local counts of all the mac addrs with just one src ip
    global find_link_local: function(p: bool): count;

    # infer_subnet uses the devices in `ip_set` to build a set of `subnet`s.
    # These subnets are generated recursively splitting the address space into
    # contiguous blocks.
    global infer_subnet: function(ip_set: set[addr]): vector of subnet;

}


event raw_packet(p: raw_pkt_hdr)
{
    # if the packet is ipv4 and has a mac src process it.
    if ((p?$ip) && (p$l2?$src)) {
        local dev_src_ip: addr = p$ip$src;

        local dev: TrackedIP;
        if (dev_src_ip !in all_src_ips) {
            dev$first_seen = network_time();
            dev$dev_src_ip = dev_src_ip;
            dev$inferred_mac = "";

            all_src_ips[dev_src_ip] = dev;
        } else {
            dev = all_src_ips[dev_src_ip];
        }
        local dev_src_mac = p$l2$src;

        if (dev_src_mac !in dev$seen_macs) {
            dev$seen_macs[dev_src_mac] = 1;
        } else {
            dev$seen_macs[dev_src_mac] = dev$seen_macs[dev_src_mac] + 1;
        }

        local s: set[addr];
        if (dev_src_mac !in mac_src_ip_emitted) {
            mac_src_ip_emitted[dev_src_mac] = s;
        } else {
            s = mac_src_ip_emitted[dev_src_mac];
        }
        add s[dev_src_ip];
    }


    # Check if the packet is a vlan tagged ipv4 packet inside of an ethernet frame
    # If so add it to the data structures defined above
    if (p?$ip && p$l2?$src && p$l2?$vlan) {
        local mac_src= p$l2$src;
        local ip_src = p$ip$src;
        local vlan = p$l2$vlan;

        local g: set[count];
        if (mac_src !in mac_src_vlan_emitted) {
            mac_src_vlan_emitted[mac_src] = g;
        } else {
            g = mac_src_vlan_emitted[mac_src];
        }
        add g[vlan];

        local h: set[addr];
        if (vlan !in vlan_ip_emitted) {
            vlan_ip_emitted[vlan] = h;
            local t: set[addr];
            vlan_ip_strange[vlan] = t;
        } else {
            h = vlan_ip_emitted[vlan];
        }
        add h[ip_src];
    }
}


function power(base: count, exponent: count): count 
{
    local v = 1;
    local i = 0;
    while (i < exponent) {
      v = v * base;
      i += 1;
    }
    return v;
}


function recurse_subnet(ip_c_set: set[count], level: count, output_set: set[subnet])
{
    local contiguous_blocks = vector(24, 16, 8);
    local e: count = contiguous_blocks[level];

    local divisor = power(2, e);

    local block_sets: table[count] of set[count];
    for (c in ip_c_set) {

        local t = c / divisor;
        local s: set[count];
        if (t in block_sets) {
           s = block_sets[t];
        }
        add s[c];
        block_sets[t] = s;

    }

    local res: set[subnet];
    for (cnt in block_sets) {
        local iv: index_vec = [divisor*cnt];
        local sn = counts_to_addr(iv);
        add res[sn/(32 - e)];
        add output_set[sn/(32 - e)];

        # recurse here; if below has 1 or more subnet do not return
        if (level < (|contiguous_blocks| - 1)) {
            recurse_subnet(block_sets[cnt], level + 1, output_set);
            #res = res & sub_res;
        }
    }
}

function net_sort(a: subnet, b: subnet): int
{
    local c: int = addr_to_counts(subnet_to_addr(a))[0];
    local d: int = addr_to_counts(subnet_to_addr(b))[0];
    return d - c;
}


function infer_subnet(ip_set: set[addr]): vector of subnet
{
    # Create an ip mask using a bitwise 'and' across all ips in the passed set

    local ip_c_set: set[count];

    for (_ip in ip_set) {
        if (Use_public || Site::is_private_addr(_ip)) {
            local j: index_vec = addr_to_counts(_ip);
            add ip_c_set[j[0]];
        }
    }

    local res: set[subnet];
    recurse_subnet(ip_c_set, 0, res);

    local v :vector of subnet = vector();
    for (sn in res) {
        v += sn;
    }

    sort(v, net_sort);
    return v;
}


function build_vlans(vlan_ip_tbl_set: table[count] of set[addr], p: bool) : table[count] of TrackedSubnet
{
    local vlan_subnets: table[count] of TrackedSubnet;

    for (_vlan in vlan_ip_tbl_set) {
        local set_ip = vlan_ip_tbl_set[_vlan];
        local strange = vlan_ip_strange[_vlan];

        # filter and track all observed IPs that are not part of local_networks
        for (_ip in set_ip) {
            if (addr_to_subnet(_ip) !in local_nets) {
                add strange[_ip];
            }
        }

        set_ip = set_ip - strange;

        local snet_tree = infer_subnet(set_ip);
        local t_snet: TrackedSubnet = [$net_tree=snet_tree, $vlan=_vlan, $num_devices=|set_ip|, $num_strange=|strange|];

        vlan_subnets[_vlan] = t_snet;

        if (p) {
            print _vlan, snet_tree, |set_ip|;
            if (|strange| > 0) {
                print "non local to vlan", _vlan, strange;
            }
        }
    };

    return vlan_subnets;
}


function find_routers(p: bool): table[subnet] of string
{
    local r_t: table[subnet] of string;

    for (mac_src in mac_src_ip_emitted) {
        local ip_set = mac_src_ip_emitted[mac_src];

        for (_ip in ip_set) {
            if (_ip !in local_nets) {
                delete ip_set[_ip];
            }
        }
        if (|ip_set| > 1) {
            local sn = infer_subnet(ip_set);
            # TODO make the TrackedSubnet object
            # print mac_src, infer_subnet(ip_set);
            #if (sn in r_t) {
                #NOTE the subnet is not unique
            #   ;
            #
            #_t[sn] = mac_src;
        }
    }

    return r_t;
}


function find_link_local(p: bool): count
{
    local cnt = 0;
    for (mac_src in mac_src_ip_emitted) {
        local ip_set = mac_src_ip_emitted[mac_src];
        if (|ip_set| == 1) {
            cnt += 1;
        }
    }
    return cnt;
}


# produces verbose output to std-out
function verbose_output_summary()
{
    local cnt = find_link_local(T);
    print fmt("Seen: %d devices that could be link local", cnt);
}
