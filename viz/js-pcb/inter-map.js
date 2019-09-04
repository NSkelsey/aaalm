function compileTemplate(subnets, routers, net_routes, grid) {
  // TODO handle case where routes are empty
  let w = grid.width, h = grid.height;


  let xOff = x=> x*grid.x_offset+25;
  let yOff = y=> y*grid.y_offset+25;


  let g = routers.map(d=>`${d.name}-1`).join(" ")
  subnets.forEach(s=> {
    if (s.link_local == "T") {
      g = `${g} ${s.name}-1`;
    }
  });
  let netString = `
    (net LCNP
      (pins LCN-1 ${g})
    )`;
  let netNames = "LCNP";

  let routeableNodes = [];

  routers.forEach((d,i)=>{
    let o = {
      name: "R"+(i+1),
      x: xOff(d.x),
      y: yOff(d.y)
    };
    routeableNodes.push(o);

    let paths = d.routes.map(p=>`${p.target}-1`).join(" ");

    netNames += ` ${d.route_path_name}`;
    let b = `
    (net ${d.route_path_name}
      (pins ${d.name}-2 ${paths})
    )`;

    netString += b;
  });

  console.log(netNames);
  console.log(netString);


  let subnetConnectors = [];

  subnets.forEach((d,i)=>{
    let o = {
      name: d.name,
      x: d.fit.x + grid.x_offset/2,
      y: d.fit.y + grid.y_offset/2
    };
    subnetConnectors.push(o);
  })

  subnetCString = "";
  subnetConnectors.forEach((d,i)=> {
    subnetCString += `
        (place ${d.name} ${d.x} ${d.y} front 0)
`;
  });


  let placeTargets = "";
  routeableNodes.forEach((d,i)=> {
    placeTargets += `
        (place ${d.name} ${d.x} ${d.y} front 0)
`;
  });

  const compiled_template = `
(pcb /place/holder
  (structure
    (layer A.Cu)
    (layer B.Cu)
    (layer C.Cu)
    (boundary
      (path pcb 0 ${w} ${h} 0 ${h} 0 0 ${w} 0)
    )
    (via "Via")
    (rule
      (width 2)
      (clearance 2)
      (clearance 2)
      (clearance 2)
    )
  )
  (placement
    (component OBSDEV
      (place LCN ${grid.x_offset/2} ${grid.y_offset/2} front 0)
    )
    (component NODE
${placeTargets}
    )
    (component SUBNET
      (place S1 0 0 front 0)
${subnetCString}
    )
  )
  (library
    (image OBSDEV
      (pin Round[A] 1 0 0)
    )
    (image SUBNET
      (pin Round[A] 1 0 0)
      (pin RectHuge 2 0 0)
    )
    (image NODE
      (pin Rect[T] 1 -12 -12)
      (pin Rect[T] 2 12 12)
    )
    (padstack Round[A]
      (shape (circle A.Cu 10))
      (shape (circle B.Cu 10))
      (shape (circle C.Cu 10))
    )
    (padstack RectHuge
      (shape (rect A.Cu ${grid.x_offset/4} ${-grid.y_offset/2} ${grid.x_offset*8} ${grid.y_offset/2}))
      (shape (rect B.Cu ${grid.x_offset/4} ${-grid.y_offset/2} ${grid.x_offset*8} ${grid.y_offset/2}))
      (shape (rect C.Cu ${grid.x_offset/4} ${-grid.y_offset/2} ${grid.x_offset*8} ${grid.y_offset/2}))
    )
    (padstack Rect[T]
      (shape (rect A.Cu -4 -4 4 4))
      (shape (rect B.Cu -4 -4 4 4))
      (shape (rect C.Cu -4 -4 4 4))
    )
    (padstack "Via"
      (shape (circle A.Cu 8))
      (shape (circle B.Cu 8))
      (shape (circle C.Cu 8))
    )
  )
  (network
${netString}
    (class kicad_default "" ${netNames}
      (circuit
        (use_via Via)
      )
      (rule
        (width 2)
        (clearance 4)
      )
    )
  )
)
`;
    console.log(compiled_template);
    return compiled_template;
}
