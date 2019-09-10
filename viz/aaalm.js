const chart_sizes = [{w: 1112, h: 645, x_c:940}, {w: 1400, h: 1112, x_c:1407}, {w: 4451, h: 3148, x_c:3443}];
const paper_sizes = [{w: "29.7cm", h: "21cm"}, {w: "42cm", h: "29.7cm"}, {w: "118.8cm", h: "84cm"}];

const colors = d3.schemeCategory10;
//const colors = ["#F1AFB6", "#F4BEA1", "#F9E1A8", "#ADE3C8", "#BAE5E3", "#6390B9", "#C24F8E", "#E3B4C9"];

const grid = {
    width: -1,
    height: -1,
    x_correct: -1,
    // Per node spacing
    x_offset: 50,
    y_offset: 40,
    x_pad: 50,
    y_pad: 40,
    r: 3,
    group_pad: 300
};


let size = 0;
let earliestDate = new Date();
let title = "";

let files = [];
let worker = null;


function setGridSize(idx) {
    grid.width = chart_sizes[idx].w;
    grid.height = chart_sizes[idx].h;
    grid.x_correct = chart_sizes[idx].x_c;
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
        if (f.lastModifiedDate < earliestDate) {
            earliestDate = f.lastModifiedDate;
        }
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
    if (files.length != 5) {
        errorMessage("Not enough or no files selected");
        return;
    }

    title = document.getElementById("net-title").value;

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
        const requiredFiles = new Set(["device", "subnet", "net_route", "router", "tracedroute"]);
        let B = new Set();
        let map = new Map();

        values.forEach(d => {
            let non_exten_name = d.name.split('.')[0]
            B.add(non_exten_name);
            map.set(non_exten_name, d.tsv);
        });

        let C = symmetricDifference(requiredFiles, B);

        if (C.size != 0) {
            let e = `There are incorrectly named and/or extra files: ${C}`;
            errorMessage(e);
            throw e;
        }

        return map;
    }).then(buildMap);
}


function setupHTML(metadata) {
  d3.select("#title > h2")
    .text(`${metadata.title} LAN map`);

  d3.select("#title > i")
    .text(`on ${metadata.date} by ${metadata.host}`);

  let now = new Date().toLocaleDateString();
  d3.select("#creationDate")
    .text(`on ${now}`);

  d3.select("#totDev")
    .text(metadata.num_dev);

  d3.select("#totSN")
    .text(metadata.num_subnets);

  d3.select("#totNets")
    .text(metadata.num_nets);

  d3.select("#credit").style("display", "inline-block");
  d3.select("#legend").style("display", "flex");
}


function ip2int(ip) {
    let s = ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
    return s;
}


function orientToDegrees(j) {
  return j*-90;
}


function orientToRotation(j) {
  return "rotate("+orientToDegrees(j)+")";
}

function intersection(setA, setB) {
  var _intersection = new Set();
  for (var elem of setB) {
    if (setA.has(elem)) {
      _intersection.add(elem);
    }
  }
  return _intersection;
}

function merge_routes(net_routes, sn_map, routers) {
  let routerMap = new Map();
  routers.forEach((d, i) => {
      d.name = "R"+(i+1);

      d.route_path_name = `RP${i+0}`;
      d.routes = [];

      routerMap.set(d.mac, d);
      if (i < 2) {
        d.x = 4;
        d.y = i;
      } else {
        d.x = 6 - i;
        d.y = 2;
      }
  });

  let link_local = new Set(["LCN-1"]);
  routerMap.forEach(v=>link_local.add(`${v.name}-1`));

  sn_map.forEach(s=> {
    if (s.link_local == "T") {
      link_local.add(`${s.name}-1`);
    }
  });

  let netSets = [link_local];

  net_routes.forEach(d => {
    r = routerMap.get(d.router_mac);
    s = sn_map.get(d.net);

    let set = new Set([`${r.name}-2`, `${s.name}-1`]);
    netSets.push(set);
  })

  outputSets = [];

  for (let i = 0; i < netSets.length; i++) {
    workingSet = netSets[i];

    let g_poses = []
    for (let g = 0; g < outputSets.length; g++) {
      let s = outputSets[g];
      let o = intersection(s, workingSet);
      if (o.size > 0) {
          workingSet.forEach(e=>s.add(e));
          g_poses.push(g)
      }
    }
    if (g_poses.length == 0) {
      outputSets.push(workingSet);
    } else {
      let f = g_poses.reduce((accum, idx)=> {
        s = outputSets[idx];
        s.forEach(d=>accum.add(d));
        return accum;
      }, new Set());

      outputSets = outputSets.filter((_, i) => {
        return g_poses.indexOf(i) == -1;
      });

      outputSets.push(f);
    }
    g_poses = [];
  }

  return outputSets;
}

function processTracedroutes(traced_routes, deviceMap, grid) {

  function make_path_coords(dev_src_ip) {
    let dev = deviceMap.get(dev_src_ip);

    let x_pos = dev.x*grid.x_offset + dev.subnet.fit.x;
    let y_pos = dev.y*grid.y_offset + dev.subnet.fit.y;

    return [x_pos, y_pos];
  }

  let tr_route_map = new Map();

  traced_routes.forEach(d => {
    let s = `${d.originator}-${d.dst}-${d.proto}`;

    let o = {
        name: s,
        originator: d.originator,
        dst: d.dst,
        stops: [],
        positions: [],
    };

    for (let y = 0; y < 10; y++) {
        o.stops.push(new Set());
        o.positions.push([]);
    }

    if (tr_route_map.has(s)) {
        o = tr_route_map.get(s);
    } else {
        tr_route_map.set(s, o);
    }
    o.stops[d.ttl].add(d.emitter);

    let coords = make_path_coords(d.emitter);
    o.positions[d.ttl].push(coords);
  });


  for (let v of tr_route_map.values()) {
    v.simple_path = v.positions.filter(d=>d.length > 0);
    v.simple_path = v.simple_path.map(d=>d[0]);

    // push the originating host to the front of the line
    v.simple_path.unshift(make_path_coords(v.originator));

    if (v[v.simple_path.length-1] != v.dst && deviceMap.has(v.dst)) {
        v.simple_path.push(make_path_coords(v.dst));
    }
  };

  let tr_list = Array.from(tr_route_map.values());
  return tr_list;
}




function processDevices(prefix, devices, j) {
  // Compute x and y position for each device inside of its subnet
  let subnet_base = ip2int(prefix);

  let sorted_devices = devices.map(d => {d.ip = ip2int(d.dev_src_ip); return d;})
    .sort((a,b) => a.ip - b.ip);

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

  return ctr;
}


function deleteForm() {
  let element = document.getElementById("wizard");
  element.parentNode.removeChild(element);
}


function drawSVG(subnets, routers, tr_list, grid) {
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
    .attr("stroke", d => d.color)
    .attr("stroke-width", 1.0)
    .attr("fill", "none")

  let line = d3.line()
    .x(d=>d[0])
    .y(d=>d[1]);

  const connections = svg.selectAll("path.traceroutepath")
  .data(tr_list).join("path")
    .attr("stroke", (d,i)=>colors[i])
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", "2px")
    .attr("stroke-opacity", 0.7)
    .attr("class", "traceroutepath")
    .attr("fill", "none")
    .attr("d", d=>line(d.simple_path));

  let router = svg.selectAll("g.router")
    .data(routers).join("g")
      .attr("class", "router")
      .attr("transform", d =>
          `translate(${d.x*grid.x_offset}, ${d.y*grid.y_offset})`)

  router.append("text")
    .attr("transform", "translate(-20, -12)")
    .attr("text-anchor", "start")
    .text(d=> { v = d.mac.split(":"); return `${v[0]}::${v[5]}` })
  .clone(true).lower()
    .attr("stroke", "white");

  router.filter(d=> {
      return d.obj_type != "EtherIPv4::GATEWAY";
  })
    .append("use")
    .attr("href", "#router-inline")
    .attr("transform", "translate(-7, -7)");

  router.filter(d=> d.obj_type == "EtherIPv4::GATEWAY")
    .append("use")
    .attr("href", "#gateway-inline")
    .attr("transform", "translate(-9, -5)");

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

  node.filter(d=> d.subnet.net !="0.0.0.0/0")
  .append("text")
    .attr("x", 5)
    .attr("y", 5)
    .attr("text-anchor", "start")
    .attr("transform", "rotate(0)")
    .text(d => d.val)
  .clone(true).lower()
    .attr("stroke", "white");

  node.filter(d=> d.subnet.net == "0.0.0.0/0")
  .append("text")
    .attr("x", 5)
    .attr("y", 5)
    .attr("text-anchor", "start")
    .attr("transform", "rotate(-15)")
    .text(d => d.dev_src_ip)

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

  center_dot.append("text")
    .attr("x", -40)
    .attr("y", -14)
    .text("Link Layer")
}

function layoutPCBPaths(subnets, routers, net_routes, grid) {
    let pcb_args = {
        border_gap: 55, // TODO
        timeout: 1000, // Unused by lib
        vias_cost: 0,
        samples: 8, // max 32
        grid_resolution: 1, // max 4
        distance_metric: 0, // max 4
        quantization: 1, // max 64
        flood_range: 2, // max 5
        x_range: 1, // max 5
        y_range: 1 // max 5
    };
    let a = pcb_args;

    //run pcb solver web worker thread, register output listner
    if (worker !== null) worker.terminate();
    worker = new Worker('js-pcb/worker.js');
    worker.addEventListener('message', function(event)
    {
        if (event.data.length)
        {
            //view the pcb output
            console.log("Calling view_pcb", event.data);
            js_pcb.view_pcb(event.data, 1, grid.x_correct);
        }
    }, false);

    //post to solver thread
    let compiled_template = compileTemplate(subnets, routers, net_routes, grid);
    worker.postMessage([js_pcb.dsn2pcb(compiled_template, a.border_gap),
                        a.timeout, 1, a.samples, a.vias_cost,
                        a.grid_resolution, a.quantization, a.distance_metric,
                        a.flood_range, a.x_range, a.y_range]);

}


function buildMap(valueMap) {
  promises = [];

  // TODO process subnets in subroutine
  let subnets = valueMap.get("subnet");

  let sn_map = new Map();
  subnets.forEach((sn, i)=> {
    sn.devices = [];
    sn.ip = ip2int(sn.net.split('/')[0]);
    sn_map.set(sn.net, sn);
    sn.name = "S"+(i+1)
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

  let interface_box = {
    w: 6 * grid.x_offset,
    h: 3 * grid.x_offset,
  };


  deviceMap = new Map();

  subnets.forEach(function(subnet, j) {
    let ctr = processDevices(subnet.net.split("/")[0], subnet.devices, j);

    subnet.devices.forEach(d=> {
        d.subnet = subnet;
        deviceMap.set(d.dev_src_ip, d);
    });

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

    subnet.name = "S"+(j+1)
  });

  let packer = new Packer(grid.width, grid.height);
  subnets.sort(function(a,b) { return (b.h*b.w < a.h*a.w); });

  let packable_elems = [interface_box].concat(subnets);
  let success = packer.fit(packable_elems);

  if (!success) {
    errorMessage(`Could not fit ${subnets.length} subnets and ${devices.length}
        devices on the page`);
    return;
  }

  let net_routes = valueMap.get("net_route");

  let routers = valueMap.get("router");

  let net_route_sets = merge_routes(net_routes, sn_map, routers);

  let traced_routes = valueMap.get("tracedroute");

  let tr_list = processTracedroutes(traced_routes, deviceMap, grid);

  let metadata = {
    title: title,
    date: earliestDate.toLocaleDateString(),
    host: window.location.hostname,
    num_dev: devices.length,
    num_subnets: subnets.length,
    num_nets: net_route_sets.length
  };

  setupHTML(metadata);

  deleteForm();

  drawSVG(subnets, routers, tr_list, grid);

  layoutPCBPaths(subnets, routers, net_route_sets, grid);
}
