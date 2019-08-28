@load base/utils/directions-and-hosts
@load base/utils/site

@load policy/protocols/conn/mac-logging
@load policy/protocols/conn/vlan-logging

@load ether_ipv4

module EtherIPv4

event zeek_init() {
    Log::create_stream(EtherIPv4::LOG, [$columns=EtherIPv4::TrackedIP, $path="device.log"]);
    Log::create_stream(EtherIPv4::LOG, [$columns=EtherIPv4::TrackedSubnet, $path="subnet.log"]);
}

event zeek_done() {
    local vlan_subnets = build_vlans(vlan_ip_emitted, T);
    local router_subnets = find_routers(F);

    local subnet_vlan: table[subnet] of set[count];

    for (vlan in vlan_subnets) {
        local sn = vlan_subnets[vlan];
        local t: set[count] = set();

        if (sn !in subnet_vlan) {
            subnet_vlan[sn] = t;
        } else {
            t = subnet_vlan[sn];
        }
        add t[vlan];
    }


    #print "RS", router_subnets;
    #print "VS", vlan_subnets;

    print "==========";

    print "ip_address,mac_address,domain_name,possible_router_mac,possible_vlan,possible_vlan_subnet";
    for (_ip in all_ips) {
        local pd = all_ips[_ip];
        for (mac in d$seen_macs) {
            # TODO sort by order and pick the first
            pd$inferred_mac = mac;
        }

        local vs: table[subnet] of set[count] = filter_subnet_table(addr_to_subnet(_ip), subnet_vlan);
        local rs: table[subnet] of string = filter_subnet_table(addr_to_subnet(_ip), router_subnets);

        local poss_router_mac = "";
        for (sn in rs) {
            poss_router_mac = rs[sn];
        }

        local poss_vlan_subnet: subnet;
        local poss_vlan: count = 0;
        for (sn in vs) {
            for (vlan in vs[sn]) {
                poss_vlan = vlan;
            }
            poss_vlan_subnet = sn;
        }

        local o = fmt("%s,%s,%s,%s", pd$dev_src_ip, pd$inferred_mac, "", poss_router_mac);

        if (poss_vlan != 0) {
            o = o + fmt(",%s,%s", poss_vlan, poss_vlan_subnet);
        } else {
            o = o + ",0,";
        }

        print o;
    }}
