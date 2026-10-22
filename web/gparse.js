// Čtení G-kódu pro vizualizér: pohyby, oblouky, časy, rozsahy.
// Výstup jsou ploché pole (Float32Array) – rychlé pro WebGL i pro hledání.

const ARC_TOL = 0.01; // mm – rozdělení oblouků pro kreslení

export function parseGcode(text, opts = {}) {
  const rapid = opts.rapid || 1500;
  const lines = text.split(/\r?\n/);
  const warn = new Set();
  // stav stroje
  let x = 0, y = 0, z = 0, f = 0, s = 0, motion = 0, abs = true, unit = 1, spindle = false, plane = 17;
  let t = 0; // čas v minutách
  // výstupní pole (rostoucí)
  let cap = 1 << 16, n = 0;
  let P = new Float32Array(cap * 3), T = new Float32Array(cap), K = new Uint8Array(cap), Ln = new Uint32Array(cap);
  const grow = () => {
    cap *= 2;
    const P2 = new Float32Array(cap * 3); P2.set(P); P = P2;
    const T2 = new Float32Array(cap); T2.set(T); T = T2;
    const K2 = new Uint8Array(cap); K2.set(K); K = K2;
    const L2 = new Uint32Array(cap); L2.set(Ln); Ln = L2;
  };
  // vrcholy segmentů jdou po dvojicích (GL_LINES)
  const seg = (ax, ay, az, ta, bx, by, bz, tb, kind, li) => {
    if (n + 2 > cap) grow();
    P[n * 3] = ax; P[n * 3 + 1] = ay; P[n * 3 + 2] = az; T[n] = ta; K[n] = kind; Ln[n] = li; n++;
    P[n * 3] = bx; P[n * 3 + 1] = by; P[n * 3 + 2] = bz; T[n] = tb; K[n] = kind; Ln[n] = li; n++;
  };
  const lineStart = new Float64Array(lines.length + 1); // čas začátku řádku
  const lineEnd = new Float64Array(lines.length + 1);
  const lineState = []; // [x,y,z,f,s] po řádku (pro informace)
  const bb = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  const cutBB = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, minZ: Infinity };
  const addBB = (px, py, pz, cut) => {
    if (px < bb.minX) bb.minX = px; if (px > bb.maxX) bb.maxX = px;
    if (py < bb.minY) bb.minY = py; if (py > bb.maxY) bb.maxY = py;
    if (pz < bb.minZ) bb.minZ = pz; if (pz > bb.maxZ) bb.maxZ = pz;
    if (cut) { if (px < cutBB.minX) cutBB.minX = px; if (px > cutBB.maxX) cutBB.maxX = px; if (py < cutBB.minY) cutBB.minY = py; if (py > cutBB.maxY) cutBB.maxY = py; if (pz < cutBB.minZ) cutBB.minZ = pz; }
  };
  let cutLen = 0, rapidLen = 0, moves = 0, arcs = 0, firstMove = true;
  addBB(0, 0, 0, false);

  for (let li = 0; li < lines.length; li++) {
    lineStart[li] = t;
    let l = lines[li];
    // komentáře ( ) a ;
    l = l.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').trim().toUpperCase();
    if (!l || l[0] === '%') { lineEnd[li] = t; lineState[li] = null; continue; }
    const words = l.match(/[A-Z][-+]?(\d+\.?\d*|\.\d+)/g) || [];
    const w = {}; const gs = []; const ms = [];
    for (const wd of words) {
      const k = wd[0], v = parseFloat(wd.slice(1));
      if (k === 'G') gs.push(v); else if (k === 'M') ms.push(v); else if (k !== 'N') w[k] = v;
    }
    let dwell = 0;
    for (const g of gs) {
      if (g === 0 || g === 1 || g === 2 || g === 3) motion = g;
      else if (g === 90) abs = true; else if (g === 91) abs = false;
      else if (g === 20) unit = 25.4; else if (g === 21) unit = 1;
      else if (g === 17 || g === 18 || g === 19) { plane = g; if (g !== 17) warn.add('Oblouky v rovině G18/G19 se kreslí zjednodušeně.'); }
      else if (g === 4) dwell = (w.P ?? w.X ?? 0) / 60;
      else if (g === 38.2 || g === 38.3 || g === 38.4 || g === 38.5) warn.add('Program obsahuje měření sondou (G38) – v náhledu se nezobrazí.');
      else if (g === 28 || g === 30) warn.add('Program obsahuje G28/G30 (návrat do výchozí polohy) – v náhledu se nezobrazí.');
      else if (g === 53) warn.add('Program obsahuje strojové souřadnice G53.');
    }
    for (const m of ms) { if (m === 3 || m === 4) spindle = true; if (m === 5) spindle = false; }
    if (w.F !== undefined) f = w.F * unit;
    if (w.S !== undefined) s = w.S;
    if (dwell) { t += dwell; lineEnd[li] = t; lineState[li] = [x, y, z, f, s]; continue; }
    const has = w.X !== undefined || w.Y !== undefined || w.Z !== undefined;
    if (!has || gs.includes(4)) { lineEnd[li] = t; lineState[li] = [x, y, z, f, s]; continue; }
    const nx = w.X !== undefined ? (abs ? w.X * unit : x + w.X * unit) : x;
    const ny = w.Y !== undefined ? (abs ? w.Y * unit : y + w.Y * unit) : y;
    const nz = w.Z !== undefined ? (abs ? w.Z * unit : z + w.Z * unit) : z;
    moves++;
    if (motion === 0 || motion === 1 || (motion > 1 && plane !== 17)) {
      const L = Math.hypot(nx - x, ny - y, nz - z);
      const v = motion === 0 ? rapid : Math.max(1, f || rapid);
      const t1 = t + L / v;
      seg(x, y, z, t, nx, ny, nz, t1, motion === 0 ? 0 : 1, li);
      if (motion === 0) rapidLen += L; else cutLen += L;
      addBB(nx, ny, nz, motion !== 0);
      if (firstMove) { addBB(x, y, z, false); firstMove = false; }
      t = t1;
    } else {
      // oblouk G2/G3 v rovině XY (I/J nebo R), se šroubovicí v Z
      arcs++;
      let cx, cy;
      if (w.R !== undefined) {
        const r = w.R * unit, dx = nx - x, dy = ny - y, d = Math.hypot(dx, dy);
        const h = Math.sqrt(Math.max(0, r * r - d * d / 4));
        const sgn = (motion === 2 ? 1 : -1) * (r < 0 ? -1 : 1);
        cx = x + dx / 2 - sgn * h * dy / d; cy = y + dy / 2 + sgn * h * dx / d;
      } else { cx = x + (w.I || 0) * unit; cy = y + (w.J || 0) * unit; }
      const r = Math.hypot(x - cx, y - cy);
      const a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx);
      let sw = a1 - a0;
      if (motion === 3) { while (sw <= 1e-9) sw += 2 * Math.PI; } else { while (sw >= -1e-9) sw -= 2 * Math.PI; }
      if (Math.hypot(nx - x, ny - y) < 1e-9 && r > 1e-9) sw = motion === 3 ? 2 * Math.PI : -2 * Math.PI;
      const L = Math.hypot(r * sw, nz - z);
      const v = Math.max(1, f || rapid);
      const step = r > ARC_TOL ? 2 * Math.acos(1 - ARC_TOL / r) : Math.PI / 4;
      const k = Math.max(2, Math.ceil(Math.abs(sw) / step));
      let px = x, py = y, pz = z, pt = t;
      for (let i = 1; i <= k; i++) {
        const a = a0 + sw * i / k;
        const qx = i === k ? nx : cx + r * Math.cos(a), qy = i === k ? ny : cy + r * Math.sin(a), qz = z + (nz - z) * i / k;
        const qt = t + (L / v) * i / k;
        seg(px, py, pz, pt, qx, qy, qz, qt, 1, li);
        addBB(qx, qy, qz, true);
        px = qx; py = qy; pz = qz; pt = qt;
      }
      cutLen += L;
      t += L / v;
    }
    x = nx; y = ny; z = nz;
    lineEnd[li] = t;
    lineState[li] = [x, y, z, f, s];
  }
  lineStart[lines.length] = lineEnd[lines.length] = t;
  if (!isFinite(bb.minX)) Object.assign(bb, { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 });
  return {
    lines, n, pos: P.subarray(0, n * 3), time: T.subarray(0, n), kind: K.subarray(0, n), line: Ln.subarray(0, n),
    lineStart, lineEnd, lineState, total: t, bb, cutBB: isFinite(cutBB.minX) ? cutBB : null,
    cutLen, rapidLen, moves, arcs, warnings: [...warn],
  };
}

// poloha nástroje v čase tt (binární hledání v segmentech)
export function toolAt(g, tt) {
  if (!g.n) return { x: 0, y: 0, z: 0, seg: -1, line: 0 };
  const segs = g.n / 2;
  let lo = 0, hi = segs - 1;
  if (tt <= g.time[0]) return { x: g.pos[0], y: g.pos[1], z: g.pos[2], seg: -1, line: g.line[0] };
  if (tt >= g.time[g.n - 1]) { const i = g.n - 1; return { x: g.pos[i * 3], y: g.pos[i * 3 + 1], z: g.pos[i * 3 + 2], seg: segs - 1, line: g.line[i] }; }
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g.time[m * 2] <= tt) lo = m; else hi = m - 1; }
  const a = lo * 2, b = a + 1, ta = g.time[a], tb = g.time[b];
  const u = tb > ta ? Math.min(1, Math.max(0, (tt - ta) / (tb - ta))) : 1;
  return {
    x: g.pos[a * 3] + (g.pos[b * 3] - g.pos[a * 3]) * u,
    y: g.pos[a * 3 + 1] + (g.pos[b * 3 + 1] - g.pos[a * 3 + 1]) * u,
    z: g.pos[a * 3 + 2] + (g.pos[b * 3 + 2] - g.pos[a * 3 + 2]) * u,
    seg: lo, line: g.line[a],
  };
}

// řádek, který běží v čase tt
export function lineAt(g, tt) {
  let lo = 0, hi = g.lines.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g.lineStart[m] <= tt) lo = m; else hi = m - 1; }
  // přeskoč prázdné řádky se stejným časem dopředu k pohybu
  return lo;
}
