module Routers;

export {
    # Similar to Site::private_address_space without the ipv6 addresses
    global local_nets = {
       192.168.0.0/16,
       127.0.0.0/8,
       172.16.0.0/12,
       10.0.0.0/8,
       100.64.0.0/10
    };

    global mac_src_ip_emitted: table[string] of set[addr];
    global mac_src_vlan_emitted: table[string] of set[count];

    global vlan_ip_emitted: table[count] of set[addr];
    global vlan_ip_strange: table[count] of set[addr];

    global mac_src_routing_table: table[string] of table[string] of addr;

    global find_link_local: function(p: bool): count;
    global build_vlans: function(vlan_ip_tbl_set: table[count] of set[addr], p: bool) : table[count] of subnet;
    global find_routers: function(p: bool): table[subnet] of string;
    global output_summary: function();
}

event raw_packet(p: raw_pkt_hdr)
{
    # Check if the packet is a vlan tagged ipv4 packet inside of an ethernet frame
    # If so add it to the data structures defined above
    if (p?$ip && p$l2?$src && p$l2?$vlan) {
        local mac_src= p$l2$src;
        local ip_src = p$ip$src;
        local vlan = p$l2$vlan;

        local s: set[addr];
        local g: set[count];
        if (mac_src !in mac_src_ip_emitted) {
            mac_src_ip_emitted[mac_src] = s;
            mac_src_vlan_emitted[mac_src] = g;
        } else {
            s = mac_src_ip_emitted[mac_src];
            g = mac_src_vlan_emitted[mac_src];
        }
        add s[ip_src];
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

# infer_subnet uses the devices in `ip_set` to build a `subnet`.
#
# To generate the mask a bitwise `and` is performed over every addr in ip_set.
# The prefix is calculated from the size of the `ip_set` and extended by the
# constant factor `f`.
#
# Normally only a fraction of the actual devices inside of a subnet will be
# observed communicating. Extending the prefix by a constant factor expirementally
# improved the resulting subnets. Your mileage may vary.
function infer_subnet(ip_set: set[addr], f: count): subnet
{
    # Create an ip mask using a bitwise 'and' across all ips in the passed set
    local iv: index_vec = [4294967295]; # 255.255.255.255
    for (_ip in ip_set) {
        local c: index_vec = addr_to_counts(_ip);
        iv[0] = iv[0] & c[0];
    }
    local snet_mask = counts_to_addr(iv);

    # Generate the prefix adding the constant factor.
    local b = floor(log10(|ip_set|)/log10(2))+f;
    local snet_prefix = double_to_count(b);

    return mask_addr(snet_mask, 32-snet_prefix);
}

# build_vlans constructs possible vlans based on the src ip addresses
# and their corresponding vlan tag. It will produce results only as good as
# the input.
function build_vlans(vlan_ip_tbl_set: table[count] of set[addr], p: bool) : table[count] of subnet
{
    local vlan_subnets: table[count] of subnet;

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

        local snet = infer_subnet(set_ip, 6);

        vlan_subnets[_vlan] = snet;

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
    # List all mac addrs with more than one src ip
    local r_t: table[subnet] of string;

    for (mac_src in mac_src_ip_emitted) {
        local ip_set = mac_src_ip_emitted[mac_src];

        for (_ip in ip_set) {
            if (_ip !in local_nets) {
                delete ip_set[_ip];
            }
        }
        if (|ip_set| > 1) {
            local sn = infer_subnet(ip_set, 6);
            #print mac_src, infer_subnet(ip_set);
            if (sn in r_t) {
                #print "OMG subnet not unique!!";
                ;
            }
            r_t[sn] = mac_src;
        }
    }

    return r_t;
}

function find_link_local(p: bool): count
{
    # List all mac addrs with just one src ip
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
    find_routers(T);
    local cnt = find_link_local(T);
    print "";
    print fmt("Seen: %d devices that could be link local", cnt);
}
