function compileTemplate(subnets, routers, net_routes, grid) {
  let w = grid.width, h = grid.height;


  let xOff = x=> x*grid.x_offset+25;
  let yOff = y=> y*grid.y_offset+25;

  let routeableNodes = [];

  routers.forEach((d,i)=>{
    let o = {
      name: "R"+(i+1),
      x: xOff(d.x),
      y: yOff(d.y)
    };
    routeableNodes.push(o);
  });

  let subnetConnectors = [];

  subnets.forEach((d,i)=>{
    let o = {
      name: "S"+(i+1),
      x: d.fit.x + grid.x_offset,
      y: d.fit.y
    };
    d.name = o.name;
    subnetConnectors.push(o);
  })

  subnetCString = "\n";
  subnetConnectors.forEach((d,i)=> {
    subnetCString += `(place ${d.name} ${d.x} ${d.y} front 0)
`;
  });


  let placeTargets = "\n";
  routeableNodes.forEach((d,i)=> {
    placeTargets += `(place ${d.name} ${d.x} ${d.y} front 0)
`;
  });


  let netString = "";
  net_routes.forEach(o => {
      // TODO convert {o.fin} into a list
      let b = `
          (net ${o.name}
            (pins ${o.start}-2 ${o.fin}-1)
          )`;

      netString += b;
  });

  let netNames = net_routes.map(d=>d.name).join(" ");
  console.log(netNames);
  console.log(netString);

  const compiled_template = `
(pcb /place/holder
  (structure
    (layer F.Cu)
    (layer D.Cu)
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
    (component NODE
${placeTargets}
    )
    (component SUBNET
      (place S1 0 0 front 0)
${subnetCString}
    )
  )
  (library
    (image SUBNET
      (pin Round[A] 1 0 0)
    )
    (image NODE
      (pin Rect[T] 1 -12 -12)
      (pin Rect[T] 2 12 12)
    )
    (padstack Round[A]
      (shape (circle F.Cu 10))
      (shape (circle B.Cu 10))
    )
    (padstack RectHuge
      (shape (rect F.Cu 0 0 ${grid.x_offset} ${grid.y_offset}))
    )
    (padstack Rect[T]
      (shape (rect F.Cu -4 -4 4 4))
      (shape (rect B.Cu -4 -4 4 4))
    )
    (padstack "Via"
      (shape (circle F.Cu 8))
      (shape (circle B.Cu 8))
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
