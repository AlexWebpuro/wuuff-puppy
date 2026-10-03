/* Geometría de las placas Wuuff — réplica de placa_nube.scad y llavero_nombre.scad
   (OpenSCAD 2021.01). Todas las medidas en mm. Necesita ClipperLib. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.WuuffGeom = factory;
})(typeof self !== 'undefined' ? self : this, function (ClipperLib, GLYPHS) {
  const S = 1000;                 // escala de Clipper (1 µm)
  const ARC = 0.01 * S;           // tolerancia de arcos
  const HB = 1000 / 1024;         // OpenSCAD 2021 avanza las letras a 1000/1024 del tamaño del contorno
  const CL = ClipperLib;

  // ---------- utilidades de polígonos ----------
  const toInt = polys => polys.map(p => p.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) })));
  const toMM = paths => paths.map(p => p.map(q => [q.X / S, q.Y / S]));

  function boolOp(type, subj, clip, fill) {
    const c = new CL.Clipper();
    c.AddPaths(subj, CL.PolyType.ptSubject, true);
    if (clip) c.AddPaths(clip, CL.PolyType.ptClip, true);
    const out = new CL.Paths();
    const ft = fill || CL.PolyFillType.pftNonZero;
    c.Execute(type, out, ft, ft);
    return out;
  }
  const union = (a, b) => boolOp(CL.ClipType.ctUnion, b ? a.concat(b) : a, null);
  const diff = (a, b) => boolOp(CL.ClipType.ctDifference, a, b);
  const inter = (a, b) => boolOp(CL.ClipType.ctIntersection, a, b);

  function offR(paths, r) {          // offset(r = …) de OpenSCAD
    const co = new CL.ClipperOffset(2, ARC);
    co.AddPaths(paths, CL.JoinType.jtRound, CL.EndType.etClosedPolygon);
    const out = new CL.Paths(); co.Execute(out, r * S); return out;
  }
  function offD(paths, d) {          // offset(delta = …)
    const co = new CL.ClipperOffset(1e6, ARC);
    co.AddPaths(paths, CL.JoinType.jtMiter, CL.EndType.etClosedPolygon);
    const out = new CL.Paths(); co.Execute(out, d * S); return out;
  }
  const closing = (p, r) => offR(offR(p, r), -r);   // offset(r=-c) offset(r=c)
  const translate = (paths, dx, dy) => paths.map(p => p.map(q => ({ X: q.X + Math.round(dx * S), Y: q.Y + Math.round(dy * S) })));

  function circle(cx, cy, d, fn) {   // circle() de OpenSCAD con $fn
    const r = d / 2, pts = [];
    for (let i = 0; i < fn; i++) { const a = 2 * Math.PI * i / fn; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return toInt([pts]);
  }
  function hull(paths) {             // envolvente convexa (monotone chain)
    const pts = paths.flat().map(q => [q.X, q.Y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop();
    return [lo.concat(up).map(([X, Y]) => ({ X, Y }))];
  }
  function bounds(paths) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of paths) for (const q of p) { x0 = Math.min(x0, q.X); x1 = Math.max(x1, q.X); y0 = Math.min(y0, q.Y); y1 = Math.max(y1, q.Y); }
    return { x0: x0 / S, y0: y0 / S, x1: x1 / S, y1: y1 / S, w: (x1 - x0) / S, h: (y1 - y0) / S };
  }
  const area = paths => paths.reduce((s, p) => s + CL.Clipper.Area(p), 0) / (S * S);

  // ---------- texto (como text() de OpenSCAD) ----------
  function anchoTabla(font, s) {     // ancho_texto() de anchos_fuentes.scad, en em
    let w = 0; for (const ch of s) { const g = font.glyphs[ch]; w += g ? g.a : 0.62; } return w;
  }
  function texto(font, s, size, spacing, halign, valign) {
    const k = size / 0.72 / font.upm;           // unidades de fuente -> mm
    const chars = [...s];
    const polys = []; let pen = 0, asc = 0, desc = 0;
    chars.forEach((ch, i) => {
      const g = font.glyphs[ch]; if (!g) return;
      for (const c of g.c) {
        const pts = []; for (let j = 0; j < c.length; j += 2) pts.push([pen + c[j] * k, c[j + 1] * k]);
        polys.push(pts);
      }
      if (g.c.length) { asc = Math.max(asc, g.y1 * size / 0.72 * HB); desc = Math.max(desc, -g.y0 * size / 0.72 * HB); }
      const kern = i < chars.length - 1 ? (font.kern[ch + chars[i + 1]] || 0) : 0;
      pen += (g.h + kern) * size / 0.72 * HB * spacing;
    });
    const width = pen;
    const dx = halign === 'center' ? -width / 2 : halign === 'right' ? -width : 0;
    const dy = valign === 'center' ? (desc - asc) / 2 : valign === 'top' ? -asc : valign === 'bottom' ? desc : 0;
    const moved = polys.map(p => p.map(([x, y]) => [x + dx, y + dy]));
    return union(toInt(moved));
  }

  // ---------- PLACA NUBE (placa_nube.scad) ----------
  function placaNube(nombre, o = {}) {
    const P = Object.assign({ ancho: 38, alto: 33, tamMax: 11, tamMin: 6, margen: 4, despY: -2.5, espaciado: 1,
      grosor: 3, altoLetras: 1, ondas: 7, amp: 0.045, giro: 25, redondez: 4.5, dAgujero: 4.5, margenAgujero: 2.2,
      nfc: true, dNfc: 25, holgura: 0.6, pared: 1.2, piso: 0.6 }, o);
    const font = GLYPHS.titan;
    const a10 = anchoTabla(font, nombre) * 10 / 0.72 * P.espaciado;
    const anchoF = Math.max(P.ancho, a10 * P.tamMin / 10 + 2 * P.margen);
    const util = anchoF - 2 * P.margen;
    const tam = Math.min(P.tamMax, 10 * util / Math.max(a10, 0.01));
    const rCav = (P.dNfc + P.holgura) / 2;
    const altoF = P.nfc ? Math.max(P.alto, P.margenAgujero + P.dAgujero + 2 * P.pared + 2 * rCav + 2.2) : P.alto;
    const rad = t => t * Math.PI / 180;
    const rSup = (t, a, b, n) => 1 / Math.pow(Math.pow(Math.abs(Math.cos(rad(t))) / a, n) + Math.pow(Math.abs(Math.sin(rad(t))) / b, n), 1 / n);
    const rNube = t => rSup(t, anchoF / 2, altoF / 2, P.redondez) *
      (1 + P.amp * Math.sin(rad(P.ondas * t + P.giro)) + P.amp * 0.45 * Math.sin(rad((P.ondas - 2) * t + 2.3 * P.giro)));
    const pts = []; for (let i = 0; i < 240; i++) { const t = i * 360 / 240, r = rNube(t); pts.push([r * Math.cos(rad(t)), r * Math.sin(rad(t))]); }
    const contorno = offR(offD(union(toInt([pts])), -1.2), 1.2);
    const yAg = rNube(90) - P.margenAgujero - P.dAgujero / 2;
    const agujero = circle(0, yAg, P.dAgujero, 64);
    const base = diff(contorno, agujero);
    const txt = translate(texto(font, nombre, tam, P.espaciado, 'center', 'center'), 0, P.despY);
    const letras = inter(txt, diff(offD(contorno, -1), agujero));
    const yMax = yAg - P.dAgujero / 2 - P.pared - rCav, yMin = -rNube(270) + P.pared + 0.6 + rCav;
    return { tipo: 'nube', base, letras, grosor: P.grosor, altoLetras: P.altoLetras, tamLetra: tam,
      agujero: { x: 0, y: yAg, d: P.dAgujero },
      nfc: P.nfc ? { x: 0, y: (yMax + yMin) / 2, d: P.dNfc, z: P.piso, cabe: yMax >= yMin } : null };
  }

  // ---------- PLACA SILUETA (llavero_nombre.scad, argolla arriba + medallón NFC) ----------
  function placaSilueta(nombre, o = {}) {
    const P = Object.assign({ tam: 8.5, espaciado: 0.98, contorno: 2.2, sombraX: 0.3, sombraY: 1.3, rellenar: 1.3,
      grosor: 3, altoLetras: 1.2, dArgolla: 10, dAgujero: 4.5, pos: 0.5, sep: 1.2,
      nfc: true, dNfc: 25, holgura: 0.6, pared: 2.2, piso: 0.6 }, o);
    const font = GLYPHS.bagel;
    const txt = texto(font, nombre, P.tam, P.espaciado, 'left', 'baseline');
    const sil = offR(closing(union(txt, translate(txt, P.sombraX, -P.sombraY)), P.rellenar), P.contorno);
    const largo = anchoTabla(font, nombre) * P.tam / 0.72 * P.espaciado;
    const altoN = font.asc * P.tam / 0.72;
    const rCav = (P.dNfc + P.holgura) / 2;
    const cN = [largo / 2 + P.sombraX / 2, altoN / 2 - P.sombraY / 2];
    const cA = [largo * P.pos + P.sombraX / 2,
      Math.max(altoN + P.dAgujero / 2 + P.sep, P.nfc ? cN[1] + rCav + 1.2 + P.dAgujero / 2 : -99)];
    const pest = hull(circle(cA[0], cA[1], P.dArgolla, 64).concat(circle(cA[0], cA[1] - P.dArgolla * 0.35, P.dArgolla * 0.8, 64)));
    let u = union(sil, pest);
    if (P.nfc) u = union(u, circle(cN[0], cN[1], 2 * (rCav + P.pared), 128));
    const base = diff(closing(u, 1.2), circle(cA[0], cA[1], P.dAgujero, 64));
    const letras = diff(txt, circle(cA[0], cA[1], P.dAgujero + 2, 64));
    return { tipo: 'silueta', base, letras, grosor: P.grosor, altoLetras: P.altoLetras, tamLetra: P.tam,
      agujero: { x: cA[0], y: cA[1], d: P.dAgujero },
      nfc: P.nfc ? { x: cN[0], y: cN[1], d: P.dNfc, z: P.piso, cabe: true } : null };
  }


  // ---------- PLACA FIGURA: huella Wuuff o gato (placa_figura.scad) ----------
  const HUELLA = [[-0.1501,0.4591],[-0.1706,0.4559],[-0.1904,0.4491],[-0.2091,0.4400],[-0.2267,0.4288],[-0.2419,0.4146],[-0.2553,0.3986],[-0.2676,0.3817],[-0.2772,0.3632],[-0.2841,0.3435],[-0.2905,0.3237],[-0.2954,0.3035],[-0.2967,0.2826],[-0.2978,0.2618],[-0.3102,0.2470],[-0.3309,0.2480],[-0.3517,0.2503],[-0.3724,0.2487],[-0.3924,0.2429],[-0.4119,0.2355],[-0.4302,0.2255],[-0.4461,0.2119],[-0.4600,0.1965],[-0.4720,0.1794],[-0.4810,0.1606],[-0.4884,0.1411],[-0.4945,0.1211],[-0.4980,0.1006],[-0.4995,0.0798],[-0.5000,0.0589],[-0.4984,0.0381],[-0.4941,0.0177],[-0.4884,-0.0024],[-0.4813,-0.0220],[-0.4715,-0.0403],[-0.4604,-0.0580],[-0.4488,-0.0754],[-0.4348,-0.0907],[-0.4190,-0.1044],[-0.4029,-0.1177],[-0.3852,-0.1286],[-0.3662,-0.1372],[-0.3531,-0.1520],[-0.3600,-0.1715],[-0.3695,-0.1901],[-0.3751,-0.2101],[-0.3792,-0.2306],[-0.3831,-0.2511],[-0.3842,-0.2719],[-0.3819,-0.2926],[-0.3782,-0.3131],[-0.3728,-0.3333],[-0.3646,-0.3524],[-0.3546,-0.3707],[-0.3434,-0.3883],[-0.3298,-0.4041],[-0.3143,-0.4181],[-0.2976,-0.4306],[-0.2795,-0.4408],[-0.2601,-0.4485],[-0.2400,-0.4540],[-0.2194,-0.4578],[-0.1987,-0.4595],[-0.1778,-0.4593],[-0.1570,-0.4574],[-0.1363,-0.4549],[-0.1157,-0.4519],[-0.0952,-0.4480],[-0.0748,-0.4436],[-0.0543,-0.4393],[-0.0338,-0.4355],[-0.0132,-0.4327],[0.0077,-0.4323],[0.0284,-0.4345],[0.0490,-0.4382],[0.0694,-0.4424],[0.0898,-0.4468],[0.1102,-0.4509],[0.1309,-0.4541],[0.1516,-0.4568],[0.1723,-0.4589],[0.1932,-0.4597],[0.2140,-0.4584],[0.2346,-0.4552],[0.2548,-0.4502],[0.2745,-0.4431],[0.2930,-0.4336],[0.3101,-0.4217],[0.3259,-0.4080],[0.3401,-0.3928],[0.3519,-0.3756],[0.3621,-0.3574],[0.3710,-0.3386],[0.3772,-0.3186],[0.3812,-0.2982],[0.3840,-0.2775],[0.3840,-0.2567],[0.3805,-0.2361],[0.3763,-0.2157],[0.3716,-0.1954],[0.3629,-0.1764],[0.3540,-0.1576],[0.3614,-0.1400],[0.3802,-0.1309],[0.3985,-0.1210],[0.4148,-0.1080],[0.4307,-0.0945],[0.4455,-0.0798],[0.4576,-0.0628],[0.4687,-0.0452],[0.4791,-0.0271],[0.4869,-0.0078],[0.4928,0.0123],[0.4976,0.0325],[0.5000,0.0533],[0.5000,0.0741],[0.4987,0.0949],[0.4959,0.1156],[0.4904,0.1357],[0.4833,0.1553],[0.4749,0.1744],[0.4637,0.1920],[0.4502,0.2079],[0.4349,0.2221],[0.4172,0.2331],[0.3979,0.2410],[0.3781,0.2474],[0.3575,0.2504],[0.3367,0.2488],[0.3160,0.2465],[0.2994,0.2563],[0.2970,0.2770],[0.2962,0.2978],[0.2923,0.3183],[0.2860,0.3382],[0.2794,0.3580],[0.2707,0.3769],[0.2590,0.3941],[0.2459,0.4104],[0.2313,0.4252],[0.2142,0.4372],[0.1957,0.4468],[0.1763,0.4544],[0.1559,0.4585],[0.1350,0.4597],[0.1142,0.4586],[0.0940,0.4535],[0.0755,0.4439],[0.0581,0.4325],[0.0416,0.4197],[0.0271,0.4047],[0.0123,0.3901],[-0.0073,0.3872],[-0.0232,0.4005],[-0.0373,0.4158],[-0.0533,0.4292],[-0.0706,0.4409],[-0.0887,0.4513],[-0.1084,0.4577],[-0.1292,0.4597]];
  function placaFigura(forma, nombre, o = {}) {
    const P = Object.assign({ anchoHuella: 44, anchoGato: 40, tamMax: 10, tamMin: 5.5, espaciado: 1, grosor: 3, altoLetras: 1,
      dAgujero: 4.5, margenAgujero: 2.2, nfc: true, dNfc: 25, holgura: 0.6, pared: 1.2, piso: 0.6 }, o);
    const gato = forma === 'gato', font = GLYPHS.titan;
    const FR = 0.74, YT = gato ? -0.06 : -0.07;
    const rCav = (P.dNfc + P.holgura) / 2;
    const a10 = anchoTabla(font, nombre) * 10 / 0.72 * P.espaciado;
    const W = Math.max(gato ? P.anchoGato : P.anchoHuella, a10 * P.tamMin / 10 / FR);
    const tam = Math.min(P.tamMax, 10 * FR * W / Math.max(a10, 0.01));
    const arriba = (gato ? 0.38 : 0.3883) * W, abajo = -(gato ? 0.38 : 0.4324) * W;
    const yN = gato ? abajo + P.pared + 0.6 + rCav
      : ((arriba - P.margenAgujero - P.dAgujero - P.pared - rCav) + (abajo + P.pared + 0.6 + rCav)) / 2;
    const yA = gato ? Math.max(arriba - P.margenAgujero - P.dAgujero / 2, (P.nfc ? yN + rCav + P.pared : 0) + P.dAgujero / 2)
      : arriba - P.margenAgujero - P.dAgujero / 2;
    const oreja = (s, pts, r) => hull(pts.reduce((acc, [x, y]) => acc.concat(circle(s * x * W, y * W, 2 * r * W, 64)), []));
    let contorno, detalles = [];
    if (gato) {
      const rad = t => t * Math.PI / 180;
      const rSup = (t, a, b, n) => 1 / Math.pow(Math.pow(Math.abs(Math.cos(rad(t))) / a, n) + Math.pow(Math.abs(Math.sin(rad(t))) / b, n), 1 / n);
      const pts = []; for (let i = 0; i < 240; i++) { const t = i * 1.5, r = rSup(t, 0.5 * W, 0.38 * W, 2.4); pts.push([r * Math.cos(rad(t)), r * Math.sin(rad(t))]); }
      const E = [[0.06, 0.33], [0.41, 0.24], [0.36, 0.58]], I = [[0.19, 0.37], [0.33, 0.33], [0.32, 0.48]];
      const pest = hull(circle(0, yA, P.dAgujero + 5, 64).concat(circle(0, yA - 3.3, (P.dAgujero + 5) * 0.8, 64)));
      contorno = closing(union(toInt([pts]).concat(oreja(1, E, 0.06), oreja(-1, E, 0.06), pest)), 0.06 * W);
      detalles = union(oreja(1, I, 0.022).concat(oreja(-1, I, 0.022)));
    } else {
      contorno = union(toInt([HUELLA.map(([x, y]) => [x * W, y * W])]));
    }
    const agujero = circle(0, yA, P.dAgujero, 64);
    const base = diff(contorno, agujero);
    const txt = translate(texto(font, nombre, tam, P.espaciado, 'center', 'center'), 0, YT * W);
    const letras = union(inter(txt, diff(offD(contorno, -1), agujero)), detalles);
    return { tipo: forma, base, letras, grosor: P.grosor, altoLetras: P.altoLetras, tamLetra: tam,
      agujero: { x: 0, y: yA, d: P.dAgujero }, nfc: P.nfc ? { x: 0, y: yN, d: P.dNfc, z: P.piso, cabe: true } : null };
  }

  // Árbol de contornos (exterior + huecos) para extruir en Three.js
  function formas(paths) {
    const c = new CL.Clipper(); c.AddPaths(paths, CL.PolyType.ptSubject, true);
    const tree = new CL.PolyTree();
    c.Execute(CL.ClipType.ctUnion, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    const res = [];
    (function walk(node) {
      for (const ch of node.Childs()) {
        if (!ch.IsHole()) {
          res.push({ exterior: toMM([ch.Contour()])[0], huecos: ch.Childs().map(h => toMM([h.Contour()])[0]) });
          for (const h of ch.Childs()) walk(h);
        }
      }
    })(tree);
    return res;
  }

  return { placaNube, placaSilueta, placaFigura, formas, bounds, area, toMM, soportado: ch => ch in GLYPHS.titan.glyphs && ch in GLYPHS.bagel.glyphs };
});
