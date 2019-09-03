function compileTemplate(subnets, routers, net_routes, grid) {
  let w = grid.width, h = grid.height;

  let routeableNodes = [
      {type: "N", x: 190, y: 80 },
      {type: "N", x: 70, y: 70 },
      {type: "N", x: 100, y: 170 }
  ];

  let obstacles = [
      {name: "10.0.0", x: 0, y: 0, w: 0, h: 0},
      {name: "10.0.0", x: 0, y: 100, w: 10, h: 10}
  ];

  let nets = [
      {name: "N1", target: "N2"},
      {name: "N2", target: "N3"},
      {name: "N3", target: "N1"}
  ];

  let placeTargets = "\n";

  routeableNodes.forEach((d,i)=> {
    placeTargets += `(place ${d.type+(i+1)} ${d.x} ${d.y} front 0)
`;
  });
  console.log(placeTargets);

  let netString = ""
  nets.forEach(o => {
      let b = `
          (net RP${o.name}
            (pins ${o.name}-2 ${o.target}-1)
          )`;

      netString += b;
  });

  let netNames = nets.map(d=>`RP${d.name}`).join(" ");

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
      (place S2 0 ${h/2} front 0)
    )
  )
  (library
    (image SUBNET
      (pin RectHuge 1 0 0)
    )
    (image NODE
      (pin Rect[T] 1 -12 12)
      (pin Rect[T] 2 12 -12)
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
    return compiled_template;
}
