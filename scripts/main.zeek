# TODO check for ALL_IPs
@load base/utils/directions-and-hosts
@load base/utils/site

@load policy/protocols/conn/mac-logging
@load policy/protocols/conn/vlan-logging

@load ether_ipv4

module EtherIPv4;

event zeek_init() {
    Log::create_stream(EtherIPv4::LOG_DEV, [$columns=EtherIPv4::TrackedIP, $path="device"]);
    Log::create_stream(EtherIPv4::LOG_NET, [$columns=EtherIPv4::TrackedSubnet, $path="subnet"]);
}

event zeek_done() {
    local vlan_subnets = build_vlans(vlan_ip_emitted, T);
    local router_subnets = find_routers(F);

    local subnet_vlan: table[subnet] of set[count];

    # TODO generate TrackedSubnet objects
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


    print "RS", router_subnets;
    print "VS", vlan_subnets;
    output_summary();

    for (_ip in all_ips) {
        local pd = all_ips[_ip];
        for (mac in pd$seen_macs) {
            # TODO sort by order and pick the first
            pd$inferred_mac = mac;
        }

        # TODO document these functions
        local vs: table[subnet] of set[count] = filter_subnet_table(addr_to_subnet(_ip), subnet_vlan);
        local rs: table[subnet] of string = filter_subnet_table(addr_to_subnet(_ip), router_subnets);

        local poss_vlan_subnet: subnet = 255.255.255.255/32;
        local poss_vlan: count = 0;

        for (sn in vs) {
            for (vlan in vs[sn]) {
                poss_vlan = vlan;
            }
            poss_vlan_subnet = sn;
        }

        local poss_router_mac = "";
        local poss_router_subnet: subnet = 255.255.255.255/32;
        for (sn in rs) {
            poss_router_mac = rs[sn];
            poss_router_subnet = sn;
        }

        # TODO assign correct type
        pd$device_type = DEVICE;
        pd$possible_vlan = poss_vlan;

        # TODO decide which is more specific and assign based on that
        pd$possible_subnet = poss_vlan_subnet;
        pd$possible_r_subnet = poss_router_subnet;

        Log::write(LOG_DEV, pd);
    }
}
