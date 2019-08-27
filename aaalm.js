function setupHTML(metadata) {
  let t = d3.select("#title > h2");
  t.text(`${metadata.name} LAN map`);

  let i = d3.select("#title > i");
  i.text(`on ${metadata.date} from ${metadata.iface}`);

  let c = d3.select("#creationDate");
  let now = new Date().toLocaleString();
  c.text(`on ${now}`);
}

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
  let subnet_base = ip2int(prefix+".0");
  let last_ip = ip2int(devices[0].name);

  let ctr = 3;
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
    { prefix: "10.0.0", nm: 24,
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
    {prefix: "10.0.4", nm: 24,
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
    {prefix: "4.0.2", nm: 24,
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
    {prefix: "2.0.2", nm: 24,
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
    },
    {
      prefix: "2.0.3", nm: 24,
      devices: [
        {name: "2.0.3.1"},
        {name: "2.0.3.3"},
        {name: "2.0.3.4"},
        {name: "2.0.3.5"}
      ]
    }
  ];

  let metadata = {
    name: "Eurospar",
    date: "20/08/2019",
    iface: "mora.local",
    tracedroutes: [
        {
            originator: "10.0.0.1",
            route: ["10.0.2.0", "10.0.4.19"]

        },
        {
            originator: "2.0.2.4",
            route: ["2.0.2.1", "10.0.4.3", "", "10.0.0.59"]
        },
        {
            originator: "2.0.2.4",
            route: ["2.0.2.1", "10.0.4.3", "", "10.0.0.175"]
        },
        {
            originator: "10.0.4.100",
            route: ["10.0.4.19", "", "4.0.2.1", "", "4.0.2.100"]
        }
    ]
  };

  setupHTML(metadata);

  let devices = subnets[0].devices;

  const grid = {width: 1112,
                height: 645,
                // Per node spacing
                x_offset: 50,
                y_offset: 40,
                y_pad: 40,
                x_pad: 0,
                r: 3,
                group_pad: 300};

  let line = d3.line()
    .curve(d3.curveStep)
    //.x(d=>d.x*grid.x_offset)
    //.y(d=>d.y*grid.y_offset);
    .x(d=>d[0]*grid.x_offset - 12)
    .y(d=>d[1]*grid.y_offset - 12);

  const colors = ["#F1AFB6", "#F4BEA1", "#F9E1A8", "#ADE3C8", "#BAE5E3", "#6390B9", "#C24F8E", "#E3B4C9"];

  subnets.forEach(function(subnet, j) {
    let ctr = processDevices(subnet.prefix, subnet.devices, j);

    // j is a value 1 through 4 (left, up, right, down)
    subnet.orientation = j;



    subnet.empty_grid = [];
    for (let i = 0; i < ctr; i ++) {
      let o = {color: colors[j]};
      o.x = i % 8 + 1;
      o.y = Math.floor(i / 8);
      subnet.empty_grid.push(o);
    }
    subnet.color = colors[j];

    subnet.w = (8+1) * grid.x_offset;
    subnet.h = (Math.ceil(subnet.empty_grid.length / 8) + 1) * grid.y_offset;

    subnet.path = line(makePath(subnet.devices));
  });

  let packer = new Packer(grid.width, grid.height);
  subnets.sort(function(a,b) { return (b.h*b.w < a.h*a.w); });
  packer.fit(subnets);

  const svg = d3.select("#map")
    .style("width", grid.width)
    .style("height", grid.height)
  .append("g")
    .attr("class", "margin")
    .attr("transform", `translate(${grid.x_pad}, ${grid.y_pad})`)




  const subnet_group = svg.selectAll("g.subnet-group")
    .data(subnets)
  .enter().append("g")
    .attr("class", "subnet-group")
    .attr("transform", d => {
      let r = '';
      let t = `translate(${d.fit.x}, ${d.fit.y})`;
      if (d.rotate) {
        r = 'rotate(90)';
      }
      console.log(d);
      return t + ' ' + r
    });

  subnet_group.append("rect")
    .attr("transform", `translate(${grid.x_offset/2}, ${-grid.y_offset/2})`)
    .attr("width", d => d.w - grid.x_offset)
    .attr("height", d => d.h - grid.y_offset)
    .attr("rx", 4)
    .attr("fill", d => d.color)
    //.attr("fill-opacity", 0.2);


  let tracedNodes = [
    { x: 9, y: 1, d: 0, c: 0},
    { x: 9, y: 3, d: 0, c: 7},
    { x: 9, y: 5, d: 0, c: 2},
    { x: 13, y: 2, d: 1, c: 1},
    { x: 13, y: 3, d: 3, c: 4},
    { x: 9, y: 9, d: 0, c:3},
  ];

  let tracedNode = svg.selectAll("g.traced-node")
  .data(tracedNodes).join("g")
    .attr("class", "traced-node")
    .attr("transform", d=>`translate(${d.x*grid.x_offset}, ${d.y*grid.y_offset})`)

  tracedNode.append("rect")
    .attr("transform", d => {
        let t = `translate(${-grid.x_offset/2 - 5}, ${-grid.y_offset/2})`;
        let r = `rotate(${d.d * 90})`;
        return r + ' ' + t;
    })
    .attr("width", grid.x_offset - 2)
    .attr("height", grid.y_offset)
    .attr("rx", 4)
    .attr("fill", d=>colors[d.c])


  tracedNode.append("circle")
    .attr("r", grid.r*2)
    .attr("fill", "white")
    .attr("stroke", "black")

  tracedNode.append("path")
    .attr("stroke", "#777777")
    .attr("stroke-width", "2px")
    .attr("stroke-opacity", 0.7)
    .attr("stroke-linejoin", "round")
    .attr("fill", "none")
    .attr("d", "M-12,-12L-4,-4")

  let tracedPaths = [
    { x1: 9, y1: 1, x2: 4, y2: 2},
    { x1: 9, y1: 1, x2: 10, y2: 0},
    { x1: 9, y1: 5, x2: 10, y2: 0},
    { x1: 13, y1: 2, x2: 10, y2: 0},
    { x1: 13, y1: 2, x2: 13, y2: 3},
    { x1: 13, y1: 3, x2: 9, y2: 9},
    { x1: 9, y1: 9, x2: 9, y2: 1},
  ];

  const connections = svg.selectAll("path.tracepath")
  .data(tracedPaths).join("path")
    .attr("stroke", "#777777")
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", "2px")
    .attr("stroke-opacity", 0.7)
    .attr("class", "tracepath")
    .attr("fill", "none")
    .attr("d", d=>line([[d.x1, d.y1],[d.x2,d.y2]]));

  const subnet_label = subnet_group.append("g")
    .attr("class", "label")
    .attr("transform", `translate(${grid.x_offset}, 0)`);

  subnet_label.append("text")
    .attr("x", 10)
    .attr("y", 5)
    .text(d => d.prefix + ".0/" + d.nm)
  .clone(true).lower()
    .attr("stroke", "white");

  subnet_label.append("circle")
    .attr("fill", "#000")
    .attr("r", grid.r);

    /*
  let path = []
  for (let i = 0; i < 400; i++) {
    let s = hindex2xy(i, 16)
    //console.log(i, s);
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
   */
  //console.log(line(path));

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
    .attr("x", 5)
    .attr("y", 5)
    .attr("text-anchor", "start")
    .attr("transform", "rotate(-30)")
    .text(d => d.val)
  .clone(true).lower()
    .attr("stroke", "white");

  const center_dot = svg.append("g")
    .attr("id", "tap")
    .attr("transform", `translate(${4*grid.x_offset}, ${2*grid.y_offset})`)

  center_dot.append("circle")
    .attr("r", `${grid.r*2}`)
    .attr("fill", "white")
    .attr("stroke", "black")
    .attr("stroke-width", "1px")

  center_dot.append("circle")
    .attr("r", `${grid.r*1.0}`)
    .attr("fill", "#a31d21")

  center_dot.append("path")
    .attr("stroke", "#777777")
    .attr("stroke-width", "2px")
    .attr("stroke-opacity", 0.7)
    .attr("stroke-linejoin", "round")
    .attr("fill", "none")
    .attr("d", "M-12,-12L-4,-4")


}
