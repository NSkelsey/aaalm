function ip2int(ip) {
    let s = ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
    return s;
}

function makePath(devices) {
  let p = [{x:0, y:0}, {x:1, y:0}];
  for (let i = 0; i < devices.length - 1; i++) {
      p.push(devices[i], devices[i+1])
  }
  return p;
}


function orientToDegrees(j) {
  return j*-90;
}

function orientToRotation(j) {
  return "rotate("+orientToDegrees(j)+")";
}

function processDevices(prefix, devices, j) {
  // Compute x and y position for each device inside of its subnet
  let subnet_base = ip2int(prefix);
  let last_ip = ip2int(devices[0].name);

  let ctr = 2;
  for(let i = 0; i < devices.length; i++) {
    let d = devices[i];
    d.orientation = j;

    let ip = ip2int(d.name);
    d.val = ip - subnet_base;

    let diff = ip - last_ip;
    if (diff > 1) {
      let s = Math.ceil(diff / 32.0);
      console.log(diff, s, ctr);
      ctr = ctr + s;
    }
    let pos = ctr;

    let base = 8
    d.pos = ctr;
    d.x = pos % base + 1;
    d.y = Math.floor(pos / base);
    ctr++;
    last_ip = ip;
  }

  return ctr;
}

buildMap([]);

function setXY(d, subnet_base) {
    let i = ip2int(d.name);
    let pos = i - subnet_base;

    d.pos = pos;
    d.x = pos % 8;
    d.y = Math.floor(pos / 8);
}

function buildMap(values) {

  const subnets = [
    { prefix: "10.0.0.0", nm: 24,
      class: "A",
      devices: [
        {name: "10.0.0.1", type: "gateway"},
        {name: "10.0.0.2", type: "router"},
        {name: "10.0.0.3"},
        {name: "10.0.0.4"},
        {name: "10.0.0.5"},
        {name: "10.0.0.52"},
        {name: "10.0.0.59"},
        {name: "10.0.0.123"},
        {name: "10.0.0.153"},
        {name: "10.0.0.175"},
        {name: "10.0.0.255"}
      ]
    },
    {prefix: "10.0.4.0", nm: 24,
      class: "A",
      devices: [
        {name: "10.0.4.19", type: "router"},
        {name: "10.0.4.20"},
        {name: "10.0.4.21"},
        {name: "10.0.4.22"},
        {name: "10.0.4.100"},
        {name: "10.0.4.101"}
       ]
    },
    {prefix: "4.0.2.0", nm: 24,
      class: "B",
      devices: [
        {name: "4.0.2.1", type: "gateway"},
        {name: "4.0.2.19"},
        {name: "4.0.2.20"},
        {name: "4.0.2.30"},
        {name: "4.0.2.40"},
        {name: "4.0.2.100"},
        {name: "4.0.2.255"}
       ]
    },
    {prefix: "2.0.2.0", nm: 24,
      class: "B",
      devices: [
        {name: "2.0.2.1", type: "gateway"},
        {name: "2.0.2.2"},
        {name: "2.0.2.3"},
        {name: "2.0.2.4"},
        {name: "2.0.2.5", type: "router"},
        {name: "2.0.2.6"},
        {name: "2.0.2.7"},
        {name: "2.0.2.8"},
        {name: "2.0.2.9"},
        {name: "2.0.2.10"},
        {name: "2.0.2.11"},
        {name: "2.0.2.12"},
        {name: "2.0.2.22"},
        {name: "2.0.2.32"},
        {name: "2.0.2.50"},
        {name: "2.0.2.240"},
        {name: "2.0.2.241"},
        {name: "2.0.2.242"}
       ]
    }
  ];

  let devices = subnets[0].devices;

  const grid = {width: 1000,
                height: 900,
                x_offset: 50,
                y_offset: 50,
                y_pad: 100,
                x_pad: 180,
                r: 8,
                group_pad: 300};

  let line = d3.line()
    .curve(d3.curveStep)
    //.x(d=>d.x*grid.x_offset)
    //.y(d=>d.y*grid.y_offset);
    .x(d=>d[0]*grid.x_offset)
    .y(d=>d[1]*grid.y_offset);

  subnets.forEach(function(subnet, j) {
    let ctr = processDevices(subnet.prefix, subnet.devices, j);

    // j is a value 1 through 4 (left, up, right, down)
    subnet.orientation = j;

    let colors = ["green", "blue", "yellow", "purple"];

    subnet.empty_grid = [];
    for (let i = 0; i < ctr; i ++) {
      let o = {color: colors[j]};
      o.x = i % 8 + 1;
      o.y = Math.floor(i / 8);
      subnet.empty_grid.push(o);
    }

    subnet.path = line(makePath(subnet.devices));
  });

  const svg = d3.select("#map")
    .style("width", grid.width)
    .style("height", grid.height)
    .style("font", "10px monospace")
    .style("margin", "5px");

  const subnet_group = svg.selectAll("g.subnet-group")
    .data(subnets)
  .enter().append("g")
    .attr("class", "subnet-group")
    .attr("transform", function(d,i) {
        console.log("yeah", d, i);
        let t = `translate(${grid.width/2}, ${grid.height/2})`;
        let r = orientToRotation(d.orientation);
        return t + " "+ r;
    })

  subnet_group.append("rect")
    .attr("width", 8 * grid.x_offset)
    .attr("height", d => d.empty_grid.length % 8 * grid.y_offset )
    .attr("fill", "url(#diagonalHatch)");

  let path = []
  for (let i = 0; i < 400; i++) {
    let s = hindex2xy(i, 16)
    console.log(i, s);
    path.push(s);
  }

  const connections = subnet_group.append("g")
    .attr("stroke", "#999")
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", "2")
    .attr("class", "hil-path")
    .attr("fill", "none")
  .append("path")
    .attr("d", line(path));

  console.log(line(path));

  /*
  .append("path")
    .attr("fill", "none")
    .attr("d", d => {
        return d.path;
    })*/

  const subnet_points = subnet_group.append("g")
    .attr("class", "grid-points")
  .selectAll("g.grid-points")
    .data(d => d.empty_grid)
  .join("g")
    .attr("class", "grid-point")
    .attr("transform", d => `
      translate(${d.x*grid.x_offset},${d.y*grid.y_offset})
    `)

  subnet_points.append("circle")
    .attr("fill", d => d.color)
    .attr("r", grid.r/2.0);

  const node = subnet_group.append("g")
    .attr("class", "nodes")
  .selectAll("g.node")
  .data(d => d.devices)
  .join("g")
    .attr("class", "node")
    .attr("transform", d => `
      translate(${d.x*grid.x_offset},${d.y*grid.y_offset})
    `);

  node.append("circle")
    .attr("fill", "#555")
    .attr("r", grid.r);

  node.append("text")
    .attr("x", 10)
    .attr("font-size", "2.0em")
    .attr("text-anchor", "start")
    .attr("transform", d => {
        let i = d.orientation;
        let s = i*90 - 45;
        return `rotate(${s})`;
    })
    .text(d => "." + d.val)
  .clone(true).lower()
    .attr("stroke", "white");

  const center_dot = svg.append("g")
    .attr("id", "tap")
    .attr("transform", `translate(${grid.width/2}, ${grid.height/2})`)
  .append("circle")
    .attr("r", `${grid.r*2}`)
    .attr("fill", "#a31d21")
}
