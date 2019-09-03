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
    Log::create_stream(EtherIPv4::LOG_NET_ROUT, [$columns=EtherIPv4::TrackedNetRoute, $path="net_route"]);
}


function log_nets(t: table[subnet] of TrackedSubnet)
{
    for (s in t) {
        local tracked_net = t[s];
        Log::write(LOG_NET, tracked_net);
    }
}


function log_devices(t: table[addr] of TrackedIP)
{
    for (ip in t) {
        local tracked_ip = t[ip];
        if (UsePublic || Site::is_private_addr(ip)) {
            Log::write(LOG_DEV, tracked_ip);
        }
    }
}

function log_routers(t: table[string] of TrackedRouter)
{
    for (mac in t) {
        local tracked_router = t[mac];
        Log::write(LOG_ROUT, tracked_router);
    }
}


event zeek_done()
{
    local all_ips: set[addr];
    local all_subnets_table: table[subnet] of TrackedSubnet;

    for (ip in all_src_ips) {
        add all_ips[ip];
    }

    local all_subnets_vec = infer_subnets(all_ips);
    for (i in all_subnets_vec) {
        local net = all_subnets_vec[i];
        local tracked_net: TrackedSubnet = [
            $net=net, $link_local=F, $num_devices=0
        ];
        all_subnets_table[net] = tracked_net;
    }

    local all_link_local_ips = find_link_local();

    for (ip in all_src_ips) {
        local t_ip = all_src_ips[ip];

        local vs: vector of subnet = matching_subnets(ip/32, all_subnets_table);

        local tr = all_subnets_table[vs[0]];
        if (ip in all_link_local_ips) {
            tr$link_local = T;
        }

        t_ip$possible_subnet = tr$net;
    }

    local mac_to_router = find_routers();
    local subnet_to_router : table[subnet] of TrackedRouter;

    for (mac in mac_to_router) {
        local router: TrackedRouter = mac_to_router[mac];

        for (i in router$routed_subnets) {
            local s = router$routed_subnets[i];

            subnet_to_router[s] = router;

            local net_route: TrackedNetRoute = [
                $net=s, $router_mac=mac
            ];

            Log::write(LOG_NET_ROUT, net_route);
        }
    }

    log_routers(mac_to_router);
    log_nets(all_subnets_table);
    log_devices(all_src_ips);
}
