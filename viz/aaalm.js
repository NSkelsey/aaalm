let files = [];

let chart_sizes = [{w: 1112, h: 645}, {w: 1400, h: 1112}, {w: 4451, h: 3148}];
let paper_sizes = [{w: "29.7cm", h: "21cm"}, {w: "42cm", h: "29.7cm"}, {w: "118.8cm", h: "84cm"}];
let size = 0;

const grid = {
    width: -1,
    height: -1,
    // Per node spacing
    x_offset: 50,
    y_offset: 40,
    x_pad: 50,
    y_pad: 40,
    r: 3,
    group_pad: 300
};


function setGridSize(idx) {
    grid.width = chart_sizes[idx].w;
    grid.height = chart_sizes[idx].h;

    let e = document.getElementById("resize-page");
    e.style.width = paper_sizes[idx].w;
    e.style.height = paper_sizes[idx].h;
}


function symmetricDifference(A, B) {
  var _difference = new Set(A);
  for (var elem of B) {
    if (_difference.has(elem)) {
      _difference.delete(elem);
    } else {
      _difference.add(elem);
    }
  }
  return _difference;
}


function handleFileSelect(evt) {
    files = evt.target.files;

    let id = "file-list";

    var output = [];
    for (var i = 0, f; f = files[i]; i++) {
        output.push('<li><strong>', escape(f.name), '</strong> (', f.type || 'n/a', ') - ',
        f.size, ' bytes, last modified: ',
        f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
        '</li>');
    }
    document.getElementById(id).innerHTML = output.join('');
}

function errorMessage(msg) {
    document.getElementById("error-msg").innerHTML = `Error: ${msg}`
}

function dropZeekTSVHeaders(raw_text) {
  let all_lines = raw_text.split("\n");
  all_lines = all_lines.slice(6);

  all_lines.splice(1,1);
  all_lines.pop();
  all_lines.pop();

  all_lines[0] = all_lines[0].replace("#fields\t", "");

  return all_lines.join("\n");
}

function processFiles(evt) {
    if (files.length != 4) {
        errorMessage("Not enough or no files selected");
        return;
    }

    var e = document.getElementById("size-pick");
    setGridSize(e.value);

    let promises = [];
    for (var i = 0, f; f = files[i]; i++) {

        if (!f.type.match('text.*')) {
            continue;
        }

        var reader = new FileReader();

        p = new Promise((resolve, reject) => {
            reader.onload = (function(file) {
                return function(e) {
                    let data = e.target.result;
                    let c = dropZeekTSVHeaders(data);
                    let o = {
                        name: file.name,
                        tsv: d3.tsvParse(c)
                    };
                    resolve(o);
                }
            })(f);

            reader.readAsText(f);
        })
        promises.push(p);
    }
    Promise.all(promises).then(values => {
        const requiredFiles = new Set(["device.log", "subnet.log", "net_route.log", "router.log"]);
        let B = new Set();
        let map = new Map();

        values.forEach(d => {
            B.add(d.name)
            map.set(d.name.split('.')[0], d.tsv);
        });

        let C = symmetricDifference(requiredFiles, B);

        if (C.size != 0) {
            let e = 'There are missing and extra files';
            errorMessage(e);
            throw e;
        }

        return map;
    }).then(buildMap);
}

function setupHTML(metadata) {
  d3.select("#title > h2")
    .text(`${metadata.name} LAN map`);

  d3.select("#title > i")
    .text(`on ${metadata.date} from ${metadata.iface}`);

  let now = new Date().toLocaleString();
  d3.select("#creationDate")
    .text(`on ${now}`);

  d3.select("#totDev")
    .text(metadata.num_dev);

  d3.select("#totSN")
    .text(metadata.num_subnets);

  d3.select("#totVLAN")
    .text(metadata.num_vlans);

  d3.select("#credit").style("display", "block");
  d3.select("#legend").style("display", "flex");
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
  let subnet_base = ip2int(prefix);

  let sorted_devices = devices.map(d => {d.ip = ip2int(d.dev_src_ip); return d;})
    .sort((a,b) => a.ip - b.ip);

  console.log("SORTING", sorted_devices);

  let ctr = 3;

  if (devices.length == 0) {
    return ctr;
  }

  let last_ip = sorted_devices.ip
  for(let i = 0; i < sorted_devices.length; i++) {
    let d = sorted_devices[i];
    d.orientation = j;

    let ip = ip2int(d.dev_src_ip);
    //d.val = ip - subnet_base;
    d.val = d.dev_src_ip.split(".").pop();

    let diff = ip - last_ip;
    if (diff > 1) {
      let s = Math.ceil(diff / 128.0);
      s = Math.min(3, s);
      console.log(diff, s, ctr);
      ctr = ctr + s;
    }
    let pos = ctr;

    let base = 8
    d.pos = ctr;
    d.x = pos % base;
    d.y = Math.floor(pos / base);
    console.log(d.dev_src_ip, d.x, d.y)
    ctr++;
    last_ip = ip;
  }

  return ctr;
}


function deleteForm() {
  let element = document.getElementById("wizard");
  element.parentNode.removeChild(element);
}

function buildMap(valueMap) {
  promises = [];

  let subnets = valueMap.get("subnet");

  let sn_map = new Map();
  subnets.forEach(sn=> {
    sn.devices = [];
    sn.ip = ip2int(sn.net.split('/')[0]);
    sn_map.set(sn.net, sn);
  });

  subnets.sort((a,b) => a.ip - b.ip);

  let devices = valueMap.get("device");

  let has_pub_internet = sn_map.has("0.0.0.0/0");

  devices.forEach(d=> {

    let t = sn_map.get(d.possible_subnet);
    if (t) {
      t.devices.push(d);
    } else {
      if (has_pub_internet) {
        t = sn_map.get("0.0.0.0/0");
      } else {
        console.log(`No subnet for ${d.dev_src_ip} found`);
      }
    }
  });

  let c_vlans = new Set(subnets.map(d=>d.vlan));

  let metadata = {
    name: "",
    date: "20/08/2019",
    iface: "mora.local",
    num_dev: devices.length,
    num_subnets: subnets.length,
    num_vlans: c_vlans.size
  };

  let interface_box = {
    w: 6 * grid.x_offset,
    h: 3 * grid.x_offset,
  };

  setupHTML(metadata);

  let line = d3.line()
    .curve(d3.curveStep)
    //.x(d=>d.x*grid.x_offset)
    //.y(d=>d.y*grid.y_offset);
    .x(d=>d[0]*grid.x_offset)
    .y(d=>d[1]*grid.y_offset);

    //const colors = ["#F1AFB6", "#F4BEA1", "#F9E1A8", "#ADE3C8", "#BAE5E3", "#6390B9", "#C24F8E", "#E3B4C9"];
    const colors = d3.schemePastel1;

  subnets.forEach(function(subnet, j) {
    let ctr = processDevices(subnet.net.split("/")[0], subnet.devices, j);

    // j is a value 1 through 4 (left, up, right, down)
    subnet.orientation = j;

    subnet.empty_grid = [];
    for (let i = 0; i < ctr; i ++) {
      let o = {color: colors[j%9]};
      o.x = i % 8;
      o.y = Math.floor(i / 8);
      subnet.empty_grid.push(o);
    }
    subnet.color = colors[j%9];

    subnet.w = (8+1) * grid.x_offset;
    subnet.h = (Math.ceil(subnet.empty_grid.length / 8) + 1) * grid.y_offset;

    console.log(subnet.net, subnet.w, subnet.h);

    subnet.path = line(makePath(subnet.devices));
  });

  //subnets = subnets.filter(d => d.devices.length);

  let packer = new Packer(grid.width, grid.height);
  subnets.sort(function(a,b) { return (b.h*b.w < a.h*a.w); });


  let packable_elems = [interface_box].concat(subnets);
  let success = packer.fit(packable_elems);

  if (!success) {
    errorMessage(`Could not fit ${subnets.length} subnets and ${devices.length}
        devices on the page`);
    return;
  }

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
      return t + ' ' + r
    });

  subnet_group.append("rect")
    .attr("transform", `translate(${-grid.x_offset/2}, ${-grid.y_offset/2})`)
    .attr("width", d => d.w - grid.x_offset)
    .attr("height", d => d.h - grid.y_offset)
    .attr("rx", 4)
    .attr("fill", d => d.color)
    //.attr("fill-opacity", 0.2);


  let routers = valueMap.get("router");

  let routerMap = new Map();
  routers.forEach((d, i) => {
      routerMap.set(d.mac, d);
      if (i < 2) {
        d.x = 4;
        d.y = i;
      } else {
        d.x = 6 - i;
        d.y = 2;
      }
  });

  let net_routes = valueMap.get("net_route");

  net_routes.forEach(d => {
    r = routerMap.get(d.router_mac);
    s = sn_map.get(d.net);

    console.log(d, r, s);
    d.x1 = r.x;
    d.y1 = r.y;
    d.x2 = s.fit.x / grid.x_offset;
    d.y2 = s.fit.y / grid.y_offset;
  })

  net_routes = net_routes.concat(subnets.map(d => {
    if (d.link_local == "T") {
        return {
          x1: 0,
          y1: 0,
          x2: d.fit.x / grid.x_offset,
          y2: d.fit.y / grid.y_offset
        };
    }
    return -1;
  }).filter(d=>d != -1 ));

  const connections = svg.selectAll("path.tracepath")
    .data(net_routes).join("path")
    .attr("stroke", "#777777")
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", "2px")
    .attr("stroke-opacity", 0.7)
    .attr("class", "tracepath")
    .attr("fill", "none")
    .attr("d", d=>line([[d.x1, d.y1],[d.x2,d.y2]]));

  let router = svg.selectAll("g.router")
    .data(routers).join("g")
      .attr("class", "router")
      .attr("transform", d =>
          `translate(${d.x*grid.x_offset}, ${d.y*grid.y_offset})`)

  router.append("text")
    .attr("transform", "translate(-23, -12)")
    .attr("text-anchor", "start")
    .text(d=> { v = d.mac.split(":"); return `${v[0]}::${v[5]}` });

  router.append("circle")
    .attr("r", grid.r*2)
    .attr("fill", "white")
    .attr("stroke", "black");

  router.append("path")
    .attr("stroke", "#777777")
    .attr("stroke-width", "2px")
    .attr("stroke-opacity", 0.7)
    .attr("stroke-linejoin", "round")
    .attr("fill", "none")
    .attr("d", "M12,12L4,4")

  const subnet_label = subnet_group.append("g")
    .attr("class", "label")
    .attr("transform", `translate(0, 0)`);

  subnet_label.append("text")
    .attr("x", 10)
    .attr("y", 5)
    .text(d => d.net)
  .clone(true).lower()
    .attr("stroke", "white");

  subnet_label.append("circle")
    .attr("fill", "#000")
    .attr("r", grid.r);

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
    .attr("transform", "rotate(0)")
    .text(d => d.val)
  .clone(true).lower()
    .attr("stroke", "white");

  const center_dot = svg.append("g")
    .attr("id", "tap")
    .attr("transform", `translate(0, 0)`)

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

  deleteForm();
}
