function ip2int(ip) {
    let s = ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
    return s;
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
  const devices = [

  const subnets = [
    {prefix: "10.0.0.0" nm: 24,
      devices: [
            {name: "10.0.0.1"},
            {name: "10.0.0.2"},
            {name: "10.0.0.3"},
            {name: "10.0.0.4"},
            {name: "10.0.0.5"},
            {name: "10.0.0.52"},
            {name: "10.0.0.59"},
            {name: "10.0.0.123"},
            {name: "10.0.0.153"},
            {name: "10.0.0.175"},
        ];
    {prefix: "10.0.0.0" nm: 24},
    {prefix: "10.0.0.0" nm: 24},
  ];

  // Compute x and y position for each device inside of its subnet
  let subnet_base = ip2int("10.0.0.0");
  let last_ip = ip2int(devices[0].name);

  let ctr = 0;
  for(let i = 0; i < devices.length; i++) {
    let d = devices[i];
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
    d.x = pos % base;
    d.y = Math.floor(pos / base);
    ctr++;
    last_ip = ip;
  }

  let empty_grid = [];
  for (let i = 0; i < ctr; i ++) {
      let o = {name:"10.0.0."+i};
      setXY(o, subnet_base);
      empty_grid.push(o);
  }

  const grid = {x_offset: 50, y_offset: 50, y_pad: 100, r: 8, x_offset: 10};

  const svg = d3.select("#viz").append("svg")
    .style("width", "1000")
    .style("height", "1000")
    .style("font", "10px monospace")
    .style("margin", "5px");

  const subnet_points = svg.append("g")
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", 3)
  .selectAll("g")
  .data(empty_grid)
  .join("g")
    .attr("transform", d => `
      translate(${d.x*50+10},${d.y*50+120})
    `);

  subnet_points.append("circle")
    .attr("fill", "#999")
    .attr("r", grid.r/2.0);

  const node = svg.append("g")
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", 3)
  .selectAll("g")
  .data(devices)
  .join("g")
    .attr("transform", d => `
      translate(${d.x*50+10},${d.y*50+120})
    `);

  node.append("circle")
    .attr("fill", "#555")
    .attr("r", grid.r);

  node.append("text")
    .attr("x", 10)
    .attr("font-size", "2.0em")
    .attr("text-anchor", "start")
    .attr("transform", "rotate(-45.0)")
    .text(d => "." + d.val)
  .clone(true).lower()
    .attr("stroke", "white");
}
