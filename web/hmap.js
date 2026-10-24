// Výšková mapa (jako v Candle): body měření, vyhnutí se dírám, interpolace,
// úprava G-kódu podle mapy a soubory .map kompatibilní s Candle.

// mapa: { x0, y0, w, h, nx, ny, centers, z: [nx*ny] (řádky po Y), zc: [(nx-1)*(ny-1)] středy, at: [[x,y]] skutečná místa měření }
export function newMap({ x0, y0, w, h, nx, ny, centers = false }) {
  nx = Math.max(2, Math.round(nx)); ny = Math.max(2, Math.round(ny));
  const m = { x0, y0, w: Math.max(0.1, w), h: Math.max(0.1, h), nx, ny, centers, z: new Array(nx * ny).fill(null), zc: centers ? new Array((nx - 1) * (ny - 1)).fill(null) : [], at: [], time: null };
  m.at = points(m).map(p => [p.x, p.y]);
  return m;
}

// všechny body mapy: nejdřív mřížka, pak středy; k = index v m.z / m.zc
export function points(m) {
  const out = [];
  const dx = m.w / (m.nx - 1), dy = m.h / (m.ny - 1);
  for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) out.push({ x: m.x0 + i * dx, y: m.y0 + j * dy, grid: true, k: j * m.nx + i });
  if (m.centers) for (let j = 0; j < m.ny - 1; j++) for (let i = 0; i < m.nx - 1; i++) out.push({ x: m.x0 + (i + 0.5) * dx, y: m.y0 + (j + 0.5) * dy, grid: false, k: j * (m.nx - 1) + i });
  return out;
}
export const getZ = (m, p) => p.grid ? m.z[p.k] : m.zc[p.k];
export function setZ(m, p, v) { if (p.grid) m.z[p.k] = v; else m.zc[p.k] = v; }
export const measured = m => m.z.every(v => v != null) && (!m.centers || m.zc.every(v => v != null));

// úsečky sítě pro zobrazení (indexy do points())
export function edges(m) {
  const e = [], N = m.nx * m.ny;
  for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) {
    const a = j * m.nx + i;
    if (i < m.nx - 1) e.push([a, a + 1]);
    if (j < m.ny - 1) e.push([a, a + m.nx]);
  }
  if (m.centers) for (let j = 0; j < m.ny - 1; j++) for (let i = 0; i < m.nx - 1; i++) {
    const c = N + j * (m.nx - 1) + i, a = j * m.nx + i;
    e.push([c, a], [c, a + 1], [c, a + m.nx], [c, a + m.nx + 1]);
  }
  return e;
}

// posunout body z děr (holes: [{x, y, d}]) – hledá nejbližší volné místo po kružnicích
export function avoidHoles(m, holes, margin = 0.6) {
  const pts = points(m);
  const bad = (x, y) => holes.some(h => Math.hypot(h.x - x, h.y - y) < h.d / 2 + margin);
  let moved = 0;
  m.at = pts.map(p => {
    if (!bad(p.x, p.y)) return [p.x, p.y];
    for (let r = 0.25; r <= 4; r += 0.25) {
      const n = Math.max(8, Math.round(2 * Math.PI * r / 0.25));
      let best = null;
      for (let k = 0; k < n; k++) {
        const a = k / n * 2 * Math.PI, x = p.x + r * Math.cos(a), y = p.y + r * Math.sin(a);
        if (x < m.x0 - 1e-9 || x > m.x0 + m.w + 1e-9 || y < m.y0 - 1e-9 || y > m.y0 + m.h + 1e-9) continue;
        if (!bad(x, y)) { best = [x, y]; break; }
      }
      if (best) { moved++; return best; }
    }
    return [p.x, p.y];
  });
  return moved;
}

// pořadí měření „hadem“, ať se zbytečně nepřejíždí
export function probeOrder(m) {
  const pts = points(m).map((p, i) => ({ ...p, i, x: m.at[i]?.[0] ?? p.x, y: m.at[i]?.[1] ?? p.y }));
  const rowOf = p => p.grid ? Math.floor(p.k / m.nx) * 2 : Math.floor(p.k / (m.nx - 1)) * 2 + 1;
  const rows = new Map();
  for (const p of pts) { const r = rowOf(p); if (!rows.has(r)) rows.set(r, []); rows.get(r).push(p); }
  const out = [];
  [...rows.keys()].sort((a, b) => a - b).forEach((r, n) => { const row = rows.get(r).sort((a, b) => a.x - b.x); if (n % 2) row.reverse(); out.push(...row); });
  return out;
}

// hodnoty relativně k prvnímu bodu (referenční bod = levý dolní roh mapy)
export function normalize(m) {
  const ref = m.z[0]; if (ref == null) return 0;
  m.z = m.z.map(v => v == null ? v : +(v - ref).toFixed(4));
  m.zc = m.zc.map(v => v == null ? v : +(v - ref).toFixed(4));
  return ref;
}

// ---------- interpolace ----------
const cubic = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
export function interp(m, x, y) {
  const dx = m.w / (m.nx - 1), dy = m.h / (m.ny - 1);
  let u = (x - m.x0) / dx, v = (y - m.y0) / dy;
  u = Math.max(0, Math.min(m.nx - 1, u)); v = Math.max(0, Math.min(m.ny - 1, v));
  const i = Math.min(m.nx - 2, Math.floor(u)), j = Math.min(m.ny - 2, Math.floor(v));
  const fu = u - i, fv = v - j;
  const Z0 = (a, b) => m.z[b * m.nx + a] ?? 0;
  const Zx = (a, b) => a < 0 ? 2 * Z0(0, b) - Z0(1, b) : a > m.nx - 1 ? 2 * Z0(m.nx - 1, b) - Z0(m.nx - 2, b) : Z0(a, b);
  // mimo mřížku lineárně prodloužit (rovina zůstane rovinou)
  const Z = (a, b) => b < 0 ? 2 * Zx(a, 0) - Zx(a, 1) : b > m.ny - 1 ? 2 * Zx(a, m.ny - 1) - Zx(a, m.ny - 2) : Zx(a, b);
  if (m.centers) {
    // čtverec rozdělený středem na 4 trojúhelníky, lineárně
    const a = Z(i, j), b = Z(i + 1, j), c = Z(i + 1, j + 1), d = Z(i, j + 1), e = m.zc[j * (m.nx - 1) + i] ?? (a + b + c + d) / 4;
    const px = fu - 0.5, py = fv - 0.5;
    let p1, p2, z1, z2; // trojúhelník se středem (0,0) a dvěma rohy
    if (py <= px && py <= -px) { p1 = [-0.5, -0.5]; p2 = [0.5, -0.5]; z1 = a; z2 = b; }
    else if (py >= px && py >= -px) { p1 = [0.5, 0.5]; p2 = [-0.5, 0.5]; z1 = c; z2 = d; }
    else if (px > 0) { p1 = [0.5, -0.5]; p2 = [0.5, 0.5]; z1 = b; z2 = c; }
    else { p1 = [-0.5, 0.5]; p2 = [-0.5, -0.5]; z1 = d; z2 = a; }
    const det = p1[0] * p2[1] - p2[0] * p1[1];
    const l1 = (px * p2[1] - p2[0] * py) / det, l2 = (p1[0] * py - px * p1[1]) / det;
    return e + l1 * (z1 - e) + l2 * (z2 - e);
  }
  // bikubická (Catmull-Rom) jako v Candle
  const col = k => cubic(Z(i - 1, j + k), Z(i, j + k), Z(i + 1, j + k), Z(i + 2, j + k), fu);
  return cubic(col(-1), col(0), col(1), col(2), fv);
}

// barevná škála jako v Candle: modrá (nízko) → azurová → zelená → žlutá → červená (vysoko); t 0..1
const RAMP = [[0.15, 0.3, 0.95], [0.1, 0.8, 0.95], [0.2, 0.85, 0.3], [0.98, 0.88, 0.15], [0.95, 0.22, 0.15]];
export function ramp(t) {
  t = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i, a = RAMP[i], b = RAMP[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export const rampCss = (n = 5) => 'linear-gradient(90deg,' + Array.from({ length: n }, (_, i) => { const c = ramp(i / (n - 1)); return `rgb(${c.map(v => Math.round(v * 255)).join(',')}) ${Math.round(i / (n - 1) * 100)}%`; }).join(',') + ')';
// interpolovaná plocha mapy na jemné mřížce (pro barevné zobrazení)
export function surface(m, maxN = 70) {
  const k = Math.max(m.w, m.h) / maxN;
  const sx = Math.max(2, Math.min(maxN, Math.ceil(m.w / k) + 1)), sy = Math.max(2, Math.min(maxN, Math.ceil(m.h / k) + 1));
  const z = new Float32Array(sx * sy); let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) { const v = interp(m, m.x0 + m.w * i / (sx - 1), m.y0 + m.h * j / (sy - 1)); z[j * sx + i] = v; }
  for (const v of [...m.z, ...m.zc]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { x0: m.x0, y0: m.y0, w: m.w, h: m.h, nx: sx, ny: sy, z, lo, hi };
}

// ---------- úprava programu ----------
// Rovné pohyby se rozdělí na úseky ≤ seg, oblouky se nahradí úsečkami (tolerance tol) a ke Z se přičte mapa.
export function applyToGcode(text, m, { seg = 1, tol = 0.005, decimals = 4 } = {}) {
  const lines = text.split(/\r?\n/), out = [];
  let x = 0, y = 0, z = 0, abs = true, motion = 0, unit = 1, known = false;
  const f = v => { const s = v.toFixed(decimals); return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s; };
  out.push(`(Vyskova mapa: ${m.nx}x${m.ny}${m.centers ? ' se stredy' : ''}, oblast X${f(m.x0)} Y${f(m.y0)} ${f(m.w)}x${f(m.h)} mm)`);
  for (const raw of lines) {
    const l = raw.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').trim().toUpperCase();
    if (!l) { out.push(raw); continue; }
    if (l.startsWith('$')) { out.push(raw); continue; }
    const w = {}, gs = [];
    let rest = l;
    for (const mm of l.matchAll(/([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g)) { if (mm[1] === 'G') gs.push(+mm[2]); else w[mm[1]] = +mm[2]; }
    for (const g of gs) {
      if ([0, 1, 2, 3].includes(g)) motion = g;
      else if (g === 90) abs = true; else if (g === 91) abs = false;
      else if (g === 20) unit = 25.4; else if (g === 21) unit = 1;
      else if (g === 53 || g === 28 || g === 30 || g === 92 || g === 10 || (g >= 38 && g < 39)) { out.push(raw); known = false; rest = null; break; }
    }
    if (rest === null) continue;
    if (!abs) throw new Error('Program používá relativní souřadnice (G91) – výškovou mapu na něj nejde použít.');
    const has = 'X' in w || 'Y' in w || 'Z' in w;
    if (!has || gs.includes(4)) { out.push(raw); continue; }
    const nx = 'X' in w ? w.X * unit : x, ny = 'Y' in w ? w.Y * unit : y, nz = 'Z' in w ? w.Z * unit : z;
    // ostatní slova (F, S, M…) zůstanou na prvním úseku
    const extra = Object.entries(w).filter(([k]) => !'XYZIJKR'.includes(k)).map(([k, v]) => k + v).join(' ');
    const emit = (g, pts) => {
      pts.forEach((p, n) => out.push(`G${g} X${f(p[0])} Y${f(p[1])} Z${f(p[2] + interp(m, p[0], p[1]))}${n === 0 && extra ? ' ' + extra : ''}`));
    };
    if (!known) {
      // první pohyb – výchozí poloha neznámá, nedělit
      out.push(`G${motion} X${f(nx)} Y${f(ny)} Z${f(nz + interp(m, nx, ny))}${extra ? ' ' + extra : ''}`);
    } else if (Math.min(z, nz) >= 1) {
      // vysoko nad deskou: jen posunout koncový bod, nedělit
      out.push(`G${motion <= 1 ? motion : 1} X${f(nx)} Y${f(ny)} Z${f(nz + interp(m, nx, ny))}${extra ? ' ' + extra : ''}`);
    } else if (motion === 0 || motion === 1) {
      const L = Math.hypot(nx - x, ny - y), n = Math.max(1, Math.ceil(L / seg));
      const pts = [];
      for (let k = 1; k <= n; k++) pts.push([x + (nx - x) * k / n, y + (ny - y) * k / n, z + (nz - z) * k / n]);
      emit(motion, pts);
    } else {
      let cx, cy;
      if ('R' in w) {
        const r = w.R * unit, dx = nx - x, dy = ny - y, d = Math.hypot(dx, dy), hh = Math.sqrt(Math.max(0, r * r - d * d / 4));
        const sgn = (motion === 2 ? 1 : -1) * (r < 0 ? -1 : 1);
        cx = x + dx / 2 - sgn * hh * dy / d; cy = y + dy / 2 + sgn * hh * dx / d;
      } else { cx = x + (w.I || 0) * unit; cy = y + (w.J || 0) * unit; }
      const r = Math.hypot(x - cx, y - cy), a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx);
      let sw = a1 - a0;
      if (motion === 3) { while (sw <= 1e-9) sw += 2 * Math.PI; } else { while (sw >= -1e-9) sw -= 2 * Math.PI; }
      if (Math.hypot(nx - x, ny - y) < 1e-9) sw = motion === 3 ? 2 * Math.PI : -2 * Math.PI;
      const stepA = r > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / r)) : Math.PI / 4;
      const n = Math.max(2, Math.ceil(Math.abs(sw) / stepA), Math.ceil(Math.abs(sw) * r / seg));
      const pts = [];
      for (let k = 1; k <= n; k++) { const a = a0 + sw * k / n; pts.push(k === n ? [nx, ny, nz] : [cx + r * Math.cos(a), cy + r * Math.sin(a), z + (nz - z) * k / n]); }
      emit(1, pts);
    }
    x = nx; y = ny; z = nz; known = true;
  }
  return out.join('\n');
}

// ---------- soubory .map (formát Candle) ----------
// 1. řádek: X;Y;šířka;výška oblasti, 2.: body X;body Y;Z dole;Z nahoře, 3.: typ interpolace;krok X;krok Y,
// pak řádky hodnot (po Y). Středy (rozšíření KiMillu) jako řádky „C;…“ na konci – Candle je nečte.
export function toMapFile(m, { zBottom = -1, zTop = 1 } = {}) {
  const n = v => v == null ? '0' : String(+(+v).toFixed(4));
  const L = [];
  L.push([m.x0, m.y0, m.w, m.h].map(n).join(';'));
  L.push([m.nx, m.ny, zBottom, zTop].map(n).join(';'));
  L.push(['0', n(m.w / Math.max(1, (m.nx - 1) * 4)), n(m.h / Math.max(1, (m.ny - 1) * 4))].join(';'));
  for (let j = 0; j < m.ny; j++) L.push(m.z.slice(j * m.nx, (j + 1) * m.nx).map(n).join(';'));
  if (m.centers) for (let j = 0; j < m.ny - 1; j++) L.push('C;' + m.zc.slice(j * (m.nx - 1), (j + 1) * (m.nx - 1)).map(n).join(';'));
  return L.join('\r\n') + '\r\n';
}
export function fromMapFile(text) {
  const L = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const num = s => s.split(';').map(v => parseFloat(v.replace(',', '.')));
  const [x0, y0, w, h] = num(L[0]), [nx, ny] = num(L[1]);
  if (![x0, y0, w, h, nx, ny].every(Number.isFinite) || nx < 2 || ny < 2) throw new Error('Neplatný soubor výškové mapy.');
  const rows = L.slice(3).filter(l => !l.startsWith('C;')), crow = L.filter(l => l.startsWith('C;'));
  if (rows.length < ny) throw new Error('V souboru mapy chybí řádky hodnot.');
  const m = newMap({ x0, y0, w, h, nx, ny, centers: crow.length === ny - 1 });
  for (let j = 0; j < ny; j++) { const r = num(rows[j]); for (let i = 0; i < nx; i++) m.z[j * nx + i] = Number.isFinite(r[i]) ? r[i] : 0; }
  if (m.centers) for (let j = 0; j < ny - 1; j++) { const r = num(crow[j].slice(2)); for (let i = 0; i < nx - 1; i++) m.zc[j * (nx - 1) + i] = Number.isFinite(r[i]) ? r[i] : 0; }
  return m;
}
