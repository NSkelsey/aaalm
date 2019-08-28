@load policy/protocols/conn/known-hosts
@load policy/protocols/conn/mac-logging
@load policy/protocols/conn/vlan-logging

@load identify_routers

module Track;

redef Known::use_host_store = F;
redef Site::local_nets = {
   192.168.0.0/16,
   127.0.0.0/8,
   172.16.0.0/12,
   10.0.0.0/8,
   100.64.0.0/10
};
redef Known::host_tracking = LOCAL_HOSTS;

export {
    redef enum Log::ID += { LOG };

    type TrackedDevice: record {
        first_seen: time &log;

        seen_domains:   set[string];
        seen_macs:      table[string] of count;
        seen_routes:    table[addr] of string;
        seen_protos:    set[port];

        dev_src_ip: addr &log;

        # name is the domain name that a DNS server inside provided for the given IP.
        name: string &log;
        # unique_mac is the machine address code observed used by a single IP src/mac src pair.
        unique_mac: string &log;
        # user_agent is the UA header (or host header) observed in a cleartext HTTP request or response
        user_agent: string &log;
    };

    global all_ips: table[addr] of TrackedDevice;
    global a_record_map: table[addr] of set[string];
    global ua_map: table[addr] of set[string];

    const break_interval = 1day &redef;
}


event raw_packet(p: raw_pkt_hdr) {
    # if the packet is ipv4, has a mac src and is in all_ips
    if ((p?$ip) && (p$l2?$src)) {
        local dev_src_ip = p$ip$src;

        local dev: TrackedDevice;
        if (dev_src_ip !in all_ips) {
            dev$first_seen = network_time();
            dev$dev_src_ip=dev_src_ip;
            dev$user_agent = "";
            dev$name = "";
            dev$unique_mac = "";

            all_ips[dev_src_ip] = dev;
        } else {
            dev = all_ips[dev_src_ip];
        }
        local dev_src_mac = p$l2$src;

        if (dev_src_mac !in dev$seen_macs) {
            dev$seen_macs[dev_src_mac] = 1;
        } else {
            dev$seen_macs[dev_src_mac] = dev$seen_macs[dev_src_mac] + 1;
        }
    }
}


event zeek_init()
{
}

event log_software(rec: Software::Info) {
    print "Saw software version!!", rec;
}

event DNS::log_dns(rec: DNS::Info) {
    # Only extract A records of known devices in the network
    if (rec?$qtype && rec$qtype == 1 && rec?$answers && |rec$answers| > 0) {
       local e = extract_ip_addresses(rec$answers[0]);
       if (|e| < 1) {
         return;
       }

       local resp_addr = to_addr(e[0]);
       local req_domain = rec$query;

       local s: set[string];
       if (resp_addr !in a_record_map) {
            a_record_map[resp_addr] = s;
       }
       add s[req_domain];
    }
}

event HTTP::log_http(rec: HTTP::Info) {
    if (rec?$user_agent) {
        local c = rec$id$orig_h;
        local s: set[string];
        if (c !in ua_map) {
            ua_map[c] = s;
        }
        add s[rec$user_agent];
    }

    if (rec?$host) {
        local server = rec$id$resp_h;
        local g: set[string];
        if (server !in ua_map) {
            ua_map[server] = g;
        }
            add g[rec$host];
    }
}

function proc_dev(d: TrackedDevice) : TrackedDevice {
    local h_cnt = 0;
    if (|d$seen_macs| == 1) {
        for (mac in d$seen_macs) {
            d$unique_mac = mac;
        }
    }

    d$name = "";
    for (n in d$seen_domains) {
        d$name = n;
    }

    return d;
}


event zeek_done() {
    local cnt: count = 0;
    local found: count = 0;
    for (_ip in a_record_map) {
        local s = a_record_map[_ip];
        if (_ip in all_ips) {
            all_ips[_ip]$seen_domains = s;
            found += 1;
        } else {
            cnt += 1;
        }
    }

    for (_ip in ua_map) {
        if (_ip in all_ips) {
            local d = all_ips[_ip];
            for (ua in ua_map[_ip]) {
                d$user_agent = ua;
            }
        }
    }


    local vlan_subnets = Routers::build_vlans(Routers::vlan_ip_emitted, T);
    local router_subnets = Routers::find_routers(F);

    #print vlan_subnets;

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
        local pd = proc_dev(all_ips[_ip]);

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

        local o = fmt("%s,%s,%s,%s", pd$dev_src_ip, pd$unique_mac, pd$name, poss_router_mac);

        if (poss_vlan != 0) {
            o = o + fmt(",%s,%s", poss_vlan, poss_vlan_subnet);
        } else {
            o = o + ",0,";
        }

        print o;
    }
    #Routers::output_summary();
}
