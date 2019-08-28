# aaalm

aaalm is a zeek package that infers the structure of an IPv4 network over Ethernet from communication among hosts.

It will discover gateways, routers, and associate devices to subnets and vlans based on a series of hueristics from raw packets and network connections. It can even infer routing paths if the analyzed traffic contains icmp responses to a traceroute.

The tool inside of `/viz` can then interpret this information to generate a map suitable for printing on A4 paper or even bigger on A3 -- hence the name -- the A3 Lan Mapper.

[nice looking network map]()


## Installation

todo

## Usage

After following the installation instructions, run zeek with the following command with a packet capture file with lots of inter device communication.

```zsh
> zeek -b ... # todo
# note the Verbose flag with provided lots of output.
```

The `topology.log` file will contain the inferred network structure.

Simply navigate to the `viz/index.html` file with your browser and follow the instructions to generate a map.

#### Visualizing routing paths

If your packet capture file contains traffic from programs like traceroute, it's possible to visualize these paths.

Add `@load ./scripts/identify_paths.zeek` to `main.zeek` to generate `net_paths.log`.


## Notes

### Performance

Note that this package uses the `raw_packet` event to analyze __every packet__ contained in a pcap or observed on the monitored interface.
If you are using a cluster to monitor gigabit loads __do not use__ this package __in realtime__.
Execution against __hundreds of megabytes__ of traffic produces meaningful output in __less than thirty seconds__.

If you are monitoring traffic in tens or hundreds gigabits per second but do not already know your network's layout, you may have __other problems__.

### Techniques Used

#### Placing devices in subnets
By using observed vlan tags as a key - if the traffic contains them - it is exceedingly simple to segment groups of IP addresses into their respective subnets.

For each new vlan observed, any tagged traffic with a new `ip_src` address is recorded inside of the vlan's bucket.

todo -- what event is generated

#### Identifying routers
Router identification works by tracking unique MACs inside of the `l2_header` and storing the set of `ip_src` addresses.

#### Identifying gateways
Gateway identification works similiarly but, handles the special case where emitted traffic seems destined for `0.0.0.0/32`

