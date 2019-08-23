# aaalm

This package generates a network map suitable for printing on A3 paper or A4 from a packet capture file.

This package can also monitor a network to infer the structure of the local area network the tap is connected to.

For the best results consider running traceroute when monitoring.

[nice looking network map]()

## Installation



## Really Quick Usage

After following the installation instructions, generate the `edge-topo.log` file from a packet capture file with lots of inter device communication.

Then __if you are not worried about the sensitivity of your information__ browse to [this website](https://nskelsey.com/parse) to parse the file and generate an svg of the network topology.

## Usage

```zsh
> python -m http.server -b localhost
```


## TODO

- [ ] installation and usage docs
- [ ] Zoom and animate details inside of networks
