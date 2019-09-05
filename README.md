# aaalm

aaalm is a zeek package that passively infers the structure of an IPv4 network over Ethernet from communication among hosts.

It will discover gateways, routers, and associate devices to subnets and gateways based on hueristics from analysis of raw packets and connections. It can even infer routing paths if the analyzed traffic contains icmp responses to a traceroute.

The tool inside of `/viz` can then interpret this information to generate a diagram suitable for printing on A4 paper or even bigger on A3, hence the name, the A3 Lan Mapper.

Here are some examples:

![aws vps diagram](https://raw.githubusercontent.com/nskelsey/aaalm/master/static/aws-vps.png)

The same diagram in A4.

![printed a4 diagram](https://raw.githubusercontent.com/nskelsey/aaalm/master/static/white-boarded-c.jpg)

My network at home.

![My home network](https://raw.githubusercontent.com/nskelsey/aaalm/master/static/home.png)


## Installation

Install [Zeek](https://docs.zeek.org/en/stable/quickstart/) and its package manager [zkg](https://docs.zeek.org/projects/package-manager/en/stable/quickstart.html).

Use the `zkg` to download and install the pacakge.

```zsh
> zkg install aaalm
```

Otherwise clone this repository.


## Usage

Run zeek with the following command with a packet capture file with lots of inter device communication.

```zsh
> zeek -r path/to/file.pcap -b main.zeek
```


Editing  `Verbose` flag will output a set of subnets that can be used as a starting point to define the `Sites::local_nets` set.

```zsh
> zeek -r path/to/file.pcap -b main.zeek -e "redef EtherIPv4::Verbose = T;"
```

The `devices.log` file will contain the inferred network structure, while `subnet.log` will contain the identifed local networks.


### Generating the graphics

Visit [my site](https://nskelsey.com/aaalm) to try it out.

The DIY version requires that you can run a webserver locally. With python3 it's easy:

```
> python -m http.server -b localhost
```

Now navigate to [the index](https://localhost:8000/) with your browser and follow the instructions to generate a map.

## Notes

### Performance

Note that this package uses the `raw_packet` event to analyze __every packet__ contained in a pcap or observed on the monitored interface.
If you are using a cluster to monitor gigabit loads __do not use__ this package __in realtime__.
Execution against __hundreds of megabytes__ of traffic produces meaningful output in __less than thirty seconds__.

If you are monitoring traffic in tens or hundreds of gigabits per second but do not already know your network's layout, you may have __other problems__.

#### TODO Visualizing routing paths

If your packet capture file contains traffic from programs like traceroute, it's possible to visualize these paths.

Add `@load tracedroute.zeek` to `main.zeek` to generate `route.log`.

### Techniques Used

#### Placing devices in subnets
By using observed vlan tags as a key - if the traffic contains them - it's simple to segment groups of IP addresses into their respective subnets.

For more precise subnet grouping, the script in `merge/find_subnet.py` will compute a series of statistical tests to determine probable subnet groupings. The script will modify `*.log` the files to improve the quality of subnet groupings if the default behavoir is insufficient.

#### Identifying routers

Router identification works by tracking unique MACs inside of the `l2_header` and storing the set of `ip_src` addresses, then simply checking if these MACs are originating traffic with multiple source IP addresses.

#### Identifying gateways

Gateway identification works similiarly but, denotes the special case where emitted traffic seems originates from a public IP address.
