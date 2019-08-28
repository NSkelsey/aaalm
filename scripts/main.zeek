@load base/utils/directions-and-hosts
@load base/utils/site

@load policy/protocols/conn/known-hosts
@load policy/protocols/conn/mac-logging
@load policy/protocols/conn/vlan-logging

#@load identify_routers
#@load identify_link_local
#@load ./identify_paths

event zeek_done() {
  #Routers::output_summary();
}
