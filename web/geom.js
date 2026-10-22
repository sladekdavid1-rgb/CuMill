// Geometrie: tvary, oblouky a booleovské operace (Clipper). Jednotky mm, osa Y nahoru.
const CL = () => globalThis.ClipperLib;
export const SCALE = 10000; // 0,1 µm
export const ARC_TOL = 0.0015; // mm, max odchylka náhrady oblouku (FlatCAM 64 kroků/kruh ≈ 0,0012 mm při r = 1 mm)

// ---------- převody ----------
export function toClip(paths) {
  return paths.map(p => p.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })));
}
export function fromClip(paths) {
  return paths.map(p => p.map(q => [q.X / SCALE, q.Y / SCALE]));
}

// ---------- základní míry ----------
export function area(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
export function bbox(paths, bb) {
  bb = bb || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of paths) for (const [x, y] of p) {
    if (x < bb.minX) bb.minX = x; if (x > bb.maxX) bb.maxX = x;
    if (y < bb.minY) bb.minY = y; if (y > bb.maxY) bb.maxY = y;
  }
  return bb;
}
export function bbValid(bb) { return bb && isFinite(bb.minX) && bb.maxX >= bb.minX; }
export function pathLength(p, closed) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  if (closed && p.length > 1) L += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
  return L;
}
export function pointInPoly(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// bod v ploše (sudo-liché pravidlo přes všechny obrysy)
export function pointInPaths(x, y, paths) {
  let c = 0;
  for (const p of paths) if (pointInPoly(x, y, p)) c++;
  return c % 2 === 1;
}

// ---------- oblouky a tvary ----------
export function arcSteps(r, sweep) {
  if (r <= ARC_TOL) return 4;
  const step = 2 * Math.acos(Math.max(-1, 1 - ARC_TOL / r));
  return Math.max(4, Math.ceil(Math.abs(sweep) / step));
}
// body oblouku od a0 o úhel sweep (rad, + = CCW), včetně koncových bodů
export function arcPts(cx, cy, r, a0, sweep, out) {
  out = out || [];
  const n = arcSteps(r, sweep);
  for (let i = 0; i <= n; i++) {
    const a = a0 + sweep * i / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}
export function circle(cx, cy, r) {
  const n = Math.max(12, arcSteps(r, 2 * Math.PI));
  const p = [];
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return p;
}
// střed a poloměr z tří bodů; null když jsou na přímce
export function circleFrom3(p1, p2, p3) {
  const [ax, ay] = p1, [bx, by] = p2, [cx, cy] = p3;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { cx: ux, cy: uy, r: Math.hypot(ax - ux, ay - uy) };
}
// oblouk zadaný začátkem, bodem uprostřed a koncem -> lomená čára
export function arc3Pts(s, m, e) {
  const c = circleFrom3(s, m, e);
  if (!c) return [s, e];
  const a0 = Math.atan2(s[1] - c.cy, s[0] - c.cx);
  const am = Math.atan2(m[1] - c.cy, m[0] - c.cx);
  const a1 = Math.atan2(e[1] - c.cy, e[0] - c.cx);
  const norm = a => { while (a < 0) a += 2 * Math.PI; while (a >= 2 * Math.PI) a -= 2 * Math.PI; return a; };
  let ccw = norm(a1 - a0), toMid = norm(am - a0);
  let sweep = toMid <= ccw ? ccw : -(2 * Math.PI - ccw);
  if (Math.abs(sweep) < 1e-9) sweep = 2 * Math.PI;
  const pts = arcPts(c.cx, c.cy, c.r, a0, sweep);
  pts[0] = [s[0], s[1]]; pts[pts.length - 1] = [e[0], e[1]];
  return pts;
}
// oblouk ze středu, začátku a úhlu (stupně, + = CCW v souřadnicích Y nahoru)
export function arcCenterPts(c, s, angleDeg) {
  const r = Math.hypot(s[0] - c[0], s[1] - c[1]);
  const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
  return arcPts(c[0], c[1], r, a0, angleDeg * Math.PI / 180);
}
export function rot(x, y, deg) {
  if (!deg) return [x, y];
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}
export function placePoly(pts, cx, cy, deg) {
  return pts.map(([x, y]) => { const [u, v] = rot(x, y, deg); return [cx + u, cy + v]; });
}
// zaoblený obdélník se středem v počátku
export function roundRectLocal(w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r < 1e-6) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const x = w / 2 - r, y = h / 2 - r, p = [];
  arcPts(x, -y, r, -Math.PI / 2, Math.PI / 2, p);
  arcPts(x, y, r, 0, Math.PI / 2, p);
  arcPts(-x, y, r, Math.PI / 2, Math.PI / 2, p);
  arcPts(-x, -y, r, Math.PI, Math.PI / 2, p);
  return dedupe(p, true);
}
export function rectPoly(cx, cy, w, h, deg) { return placePoly(roundRectLocal(w, h, 0), cx, cy, deg); }
export function roundRect(cx, cy, w, h, r, deg) { return placePoly(roundRectLocal(w, h, r), cx, cy, deg); }
export function oval(cx, cy, w, h, deg) { return roundRect(cx, cy, w, h, Math.min(w, h) / 2, deg); }
// obdélník se sraženými rohy (KiCad chamfer), rohy: tl,tr,bl,br v souřadnicích Y nahoru (top = +y)
export function chamferRectLocal(w, h, c, corners) {
  const x = w / 2, y = h / 2, p = [];
  const cut = k => corners[k] ? c : 0;
  // od levého dolního rohu proti směru hodinových ručiček
  if (cut('bl')) p.push([-x, -y + c], [-x + c, -y]); else p.push([-x, -y]);
  if (cut('br')) p.push([x - c, -y], [x, -y + c]); else p.push([x, -y]);
  if (cut('tr')) p.push([x, y - c], [x - c, y]); else p.push([x, y]);
  if (cut('tl')) p.push([-x + c, y], [-x, y - c]); else p.push([-x, y]);
  return p;
}
export function capsule(x1, y1, x2, y2, w) {
  const r = w / 2, L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 1e-9) return circle(x1, y1, r);
  const a = Math.atan2(y2 - y1, x2 - x1), p = [];
  arcPts(x2, y2, r, a - Math.PI / 2, Math.PI, p);
  arcPts(x1, y1, r, a + Math.PI / 2, Math.PI, p);
  return p;
}
export function dedupe(p, closed) {
  const out = [];
  for (const q of p) {
    const l = out[out.length - 1];
    if (!l || Math.abs(l[0] - q[0]) > 1e-7 || Math.abs(l[1] - q[1]) > 1e-7) out.push(q);
  }
  if (closed && out.length > 2) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) out.pop();
  }
  return out;
}
export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// ---------- Clipper ----------
function fill(name) {
  const F = CL().PolyFillType;
  return name === 'evenodd' ? F.pftEvenOdd : F.pftNonZero;
}
export function union(paths, rule = 'nonzero') {
  const C = CL(), c = new C.Clipper(), sol = new C.Paths();
  c.AddPaths(toClip(paths.filter(p => p.length > 2)), C.PolyType.ptSubject, true);
  c.Execute(C.ClipType.ctUnion, sol, fill(rule), fill(rule));
  return fromClip(sol);
}
function boolOp(type, a, b, ra = 'nonzero', rb = 'nonzero') {
  const C = CL(), c = new C.Clipper(), sol = new C.Paths();
  c.AddPaths(toClip(a.filter(p => p.length > 2)), C.PolyType.ptSubject, true);
  c.AddPaths(toClip(b.filter(p => p.length > 2)), C.PolyType.ptClip, true);
  c.Execute(type, sol, fill(ra), fill(rb));
  return fromClip(sol);
}
export const difference = (a, b, ra, rb) => boolOp(CL().ClipType.ctDifference, a, b, ra, rb);
export const intersection = (a, b, ra, rb) => boolOp(CL().ClipType.ctIntersection, a, b, ra, rb);
export const xor = (a, b) => boolOp(CL().ClipType.ctXor, a, b);

// odsazení uzavřených ploch (delta > 0 ven)
export function offset(paths, delta) {
  const C = CL(), co = new C.ClipperOffset(2, ARC_TOL * SCALE), sol = new C.Paths();
  co.AddPaths(toClip(paths.filter(p => p.length > 2)), C.JoinType.jtRound, C.EndType.etClosedPolygon);
  co.Execute(sol, delta * SCALE);
  return fromClip(sol);
}
// otevřené čáry s tloušťkou (kulaté konce) – cesty DPS
export function strokeOpen(lines, width) {
  const C = CL(), co = new C.ClipperOffset(2, ARC_TOL * SCALE), sol = new C.Paths();
  const closedOnes = [], open = [];
  for (const l of lines) (l.length === 1 ? closedOnes : open).push(l);
  co.AddPaths(toClip(open.filter(l => l.length > 1)), C.JoinType.jtRound, C.EndType.etOpenRound);
  co.Execute(sol, width / 2 * SCALE);
  const res = fromClip(sol);
  for (const l of closedOnes) res.push(circle(l[0][0], l[0][1], width / 2));
  return res;
}
// uzavřená lomená čára s tloušťkou (obrys kružnice/obdélníku)
export function strokeClosed(loops, width) {
  const C = CL(), co = new C.ClipperOffset(2, ARC_TOL * SCALE), sol = new C.Paths();
  co.AddPaths(toClip(loops), C.JoinType.jtRound, C.EndType.etClosedLine);
  co.Execute(sol, width / 2 * SCALE);
  return fromClip(sol);
}
// ořez otevřených i uzavřených drah plochou -> otevřené úseky uvnitř
export function clipLinesInside(lines, region) {
  const C = CL(), c = new C.Clipper(), tree = new C.PolyTree();
  c.AddPaths(toClip(lines), C.PolyType.ptSubject, false);
  c.AddPaths(toClip(region), C.PolyType.ptClip, true);
  c.Execute(C.ClipType.ctIntersection, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return fromClip(C.Clipper.OpenPathsFromPolyTree(tree));
}
// strom ploch: [{outer, holes:[]}]
export function polyTree(paths) {
  const C = CL(), c = new C.Clipper(), tree = new C.PolyTree();
  c.AddPaths(toClip(paths.filter(p => p.length > 2)), C.PolyType.ptSubject, true);
  c.Execute(C.ClipType.ctUnion, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  const out = [];
  const walk = node => {
    for (const ch of node.Childs()) {
      if (!ch.IsHole()) {
        const item = { outer: fromClip([ch.Contour()])[0], holes: [] };
        for (const h of ch.Childs()) { item.holes.push(fromClip([h.Contour()])[0]); walk(h); }
        out.push(item);
      }
    }
  };
  walk(tree);
  return out;
}
export function cleanPaths(paths, dist = 0.0005) {
  const C = CL();
  return fromClip(C.Clipper.CleanPolygons(toClip(paths), dist * SCALE));
}
// ořez čar plochou -> úseky vně
export function clipLinesOutside(lines, region) {
  const C = CL(), c = new C.Clipper(), tree = new C.PolyTree();
  c.AddPaths(toClip(lines), C.PolyType.ptSubject, false);
  c.AddPaths(toClip(region), C.PolyType.ptClip, true);
  c.Execute(C.ClipType.ctDifference, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return fromClip(C.Clipper.OpenPathsFromPolyTree(tree));
}
