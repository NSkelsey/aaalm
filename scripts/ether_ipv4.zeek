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

    # Discard from the final output any tracked devices that are public IPs
    global use_public = F &redef;

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
        net: subnet &log;
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

    # infer_subnet uses the devices in `ip_set` to build a `subnet`.
    #
    # To generate the mask a bitwise `and` is performed over every addr in ip_set.
    # The prefix is calculated from the size of the `ip_set` and extended by the
    # constant factor `f`.
    #
    # Normally only a fraction of the actual devices inside of a subnet will be
    # observed communicating. Extending the prefix by a constant factor expirementally
    # improved the resulting subnets. Your mileage may vary.
    global infer_subnet: function(ip_set: set[addr], f: count): subnet;

    # output_summary produces verbose output to std-out
    global output_summary: function();
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


function infer_subnet(ip_d_set: set[addr], f: count): subnet
{
    # Create an ip mask using a bitwise 'and' across all ips in the passed set
    local iv: index_vec = [4294967295]; # 255.255.255.255
    print "inferring net";

    local ip_set: set[addr];
    for (_ip in ip_d_set) {
        if (use_public || Site::is_private_addr(_ip)) {
          add ip_set[_ip];
        }
    }

    local s: double = |ip_set|;
    local avg: double = 0.0;

    local d_set: set[double];
    for (_ip in ip_set) {
        print _ip;
        local c: index_vec = addr_to_counts(_ip);
        iv[0] = iv[0] & c[0];

        avg += c[0] / s;
        add d_set[c[0]];
    }

    local var: double = 0.0;
    for (d in d_set) {
        var = var + (d - avg)*(d - avg);
    }

    local snet_mask = counts_to_addr(iv);

    local a: vector of count = [double_to_count(avg)];

    local good_ip_set: set[addr];
    for (d in d_set) {
        local delta_sigma = 2 * sqrt(var);
        if (d < (avg - delta_sigma) || d > (avg + delta_sigma)) {
            print "fuori", d;
            next;
        }
        local j: vector of count = [double_to_count(d)];
        add good_ip_set[counts_to_addr(j)];
    }

    local biv: index_vec = [4294967295]; # 255.255.255.255
    for (_ip in good_ip_set) {
        local x: index_vec = addr_to_counts(_ip);
        biv[0] = biv[0] & x[0];
    }

    local good_snet_mask = counts_to_addr(biv);
    print iv[0], avg, var, sqrt(var), biv[0];

    # Generate the prefix adding the constant factor.
    local b = f;#//floor(log10(|ip_set|)/log10(2))+f;
    local snet_prefix = double_to_count(b);

    return mask_addr(snet_mask, 32-snet_prefix);
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

        local snet = infer_subnet(set_ip, 8);
        local t_snet: TrackedSubnet = [$net=snet, $vlan=_vlan, $num_devices=|set_ip|, $num_strange=|strange|];

        vlan_subnets[_vlan] = t_snet;

        if (p) {
            print _vlan, snet, |set_ip|;
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
            local sn = infer_subnet(ip_set, 8);
            #print mac_src, infer_subnet(ip_set);
            if (sn in r_t) {
                #NOTE the subnet is not unique
                ;
            }
            r_t[sn] = mac_src;
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


function output_summary()
{
    print "Observed subnets:";
    local vlan_subnets = build_vlans(vlan_ip_emitted, T);
    print vlan_subnets;
    print "";
    print "Routers with subnets behind:";
    print find_routers(T);
    local cnt = find_link_local(T);
    print "";
    print fmt("Seen: %d devices that could be link local", cnt);
}
