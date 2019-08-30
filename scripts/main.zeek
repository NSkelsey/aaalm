@load base/utils/site

@load policy/protocols/conn/mac-logging
@load policy/protocols/conn/vlan-logging

@load ether_ipv4

module EtherIPv4;


event zeek_init()
{
    Log::create_stream(EtherIPv4::LOG_DEV, [$columns=EtherIPv4::TrackedIP, $path="device"]);
    Log::create_stream(EtherIPv4::LOG_NET, [$columns=EtherIPv4::TrackedSubnet, $path="subnet"]);
    Log::create_stream(EtherIPv4::LOG_ROUT, [$columns=EtherIPv4::TrackedRouter, $path="router"]);
}


event zeek_done()
{
    local vlan_subnets = build_vlans(vlan_ip_emitted, F);


    local subnet_to_vlan: table[subnet] of set[count];

    for (vlan in vlan_subnets) {
        local tracked_snet_vlan = vlan_subnets[vlan];

        local net_tree = tracked_snet_vlan$net_tree;
        local j = 0;
        while (j < |net_tree|) {
            local sn = net_tree[j];
            j += 1;

            local t: set[count];


            local hack = matching_subnets(sn, subnet_to_vlan);

            if (|hack| == 0 || subnet_width(hack[0]) != subnet_width(sn)) {
                subnet_to_vlan[sn] = set();
                tracked_snet_vlan$net=sn;
                Log::write(LOG_NET, tracked_snet_vlan);
            } else {
                t = subnet_to_vlan[sn];
            }
            add t[vlan];
        }

    }

    local router_subnets = find_routers();
    local subnet_to_router : table[subnet] of TrackedRouter;

    for (mac in router_subnets) {
        local router: TrackedRouter = router_subnets[mac];

        Log::write(LOG_ROUT, router);

        # NOTE this collides and overwrites some subnets
        for (i in router$routed_subnets) {
            local s = router$routed_subnets[i];
            subnet_to_router[s] = router;
        }
    }


    if (Verbose) {
        print "Vlan-Subnets", vlan_subnets;
        print "Subnets-to-Vlan", subnet_to_vlan;
        print "MACs-to-Routers", router_subnets;
        print "Subnets-to-Routers", subnet_to_router;
        verbose_output_summary();
    }

    for (_ip in all_src_ips) {
        local pd = all_src_ips[_ip];

        if (!UsePublic && !Site::is_private_addr(_ip)) {
            next;
        }

        for (mac in pd$seen_macs) {
            # TODO sort by order and pick the first; count different macs
            pd$inferred_mac = mac;
        }

        local vs: vector of subnet = matching_subnets(_ip/32, subnet_to_vlan);

        local bcast = 255.255.255.255/32;
        local poss_vlan_subnet: subnet = bcast;
        local poss_vlan: count = 0;

        if (|vs| > 0) {
            poss_vlan_subnet = vs[0];
            local vlan_choices = subnet_to_vlan[vs[0]];
            if (|vlan_choices| == 1) {
                for (q in vlan_choices) {
                    poss_vlan = q;
                }
            }
        }

        local rs: vector of subnet = matching_subnets(_ip/32, subnet_to_router);

        local poss_router_mac = "";
        local poss_router_subnet: subnet = bcast;

        if (|rs| > 0) {
            poss_router_subnet = rs[0];
            poss_router_mac = subnet_to_router[rs[0]]$mac;
        }

        pd$possible_subnet = poss_vlan_subnet;

        # TODO decide which is more specific and assign based on that
        if (poss_vlan_subnet == bcast) {
            pd$possible_subnet = poss_router_subnet;
        }

        pd$possible_r_subnet = poss_router_subnet;

        Log::write(LOG_DEV, pd);
    }
}
