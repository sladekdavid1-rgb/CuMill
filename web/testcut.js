// Zkušební řezy (test materiálu): jeden tvar nebo matice variant F / S / hloubka / krok / zanoření.
// Čistý generátor G-kódu – bez DOM, testovatelný v Node.

export const SHAPES = { line: 'Čára', rect: 'Obdélník', tri: 'Trojúhelník', circle: 'Kruh', pocket: 'Kapsa', drill: 'Vrtání' };
export const VARS = { feed: 'Posuv F', spindle: 'Otáčky S', depth: 'Hloubka', step: 'Krok Z', plunge: 'Zanoření' };
export const UNITS = { feed: 'mm/min', spindle: 'ot/min', depth: 'mm', step: 'mm', plunge: 'mm/min' };
export const Z_MIN = 0.05; // nejmenší krok a hloubka (zaokrouhlení hodnot Z)

const r4 = v => Math.round(v * 1e4) / 1e4;
const fmt = v => { const s = r4(v).toFixed(4).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
export const roundZ = v => Math.max(Z_MIN, +(Math.round(v / Z_MIN) * Z_MIN).toFixed(2));
const roundVar = (k, v) => k === 'depth' || k === 'step' ? +roundZ(v).toFixed(2) : k === 'spindle' ? Math.round(v / 100) * 100 : Math.round(v);

// hodnoty jedné osy matice
export function axisValues(ax) {
  if (!ax || !ax.key) return [null];
  const n = Math.max(1, Math.min(12, Math.round(ax.n || 1)));
  const out = [];
  for (let i = 0; i < n; i++) out.push(roundVar(ax.key, n === 1 ? ax.from : ax.from + (ax.to - ax.from) * i / (n - 1)));
  return out;
}

// rozměr tvaru (obrys dráhy po korekci) – kvůli rozložení buněk
function shapeGeom(t) {
  const r = (t.tool?.dia || 0) / 2;
  const off = t.comp === 'outside' ? r : t.comp === 'inside' ? -r : 0;
  switch (t.shape) {
    case 'line': return { w: t.len, h: 0, pad: r };
    case 'rect': return { w: t.w, h: t.h, pad: Math.max(0, off) + r };
    case 'tri': return { w: t.side, h: t.side * Math.sqrt(3) / 2, pad: Math.max(0, off * 2) + r };
    case 'circle': return { w: t.dia, h: t.dia, pad: Math.max(0, off) + r };
    case 'pocket': return t.pocketShape === 'circle' ? { w: t.dia, h: t.dia, pad: 0 } : { w: t.w, h: t.h, pad: 0 };
    case 'drill': return { w: 0, h: 0, pad: r };
  }
  return { w: 0, h: 0, pad: 0 };
}

// uzavřený obrys (body proti směru hodinových ručiček) posunutý o off (+ ven)
function closedPath(t, x0, y0) {
  const r = (t.tool?.dia || 0) / 2;
  const off = t.comp === 'outside' ? r : t.comp === 'inside' ? -r : 0;
  if (t.shape === 'rect') {
    const a = x0 - off, b = y0 - off, c = x0 + t.w + off, d = y0 + t.h + off;
    if (c - a < 1e-3 || d - b < 1e-3) return null;
    return [[a, b], [c, b], [c, d], [a, d]];
  }
  if (t.shape === 'tri') {
    // rovnostranný trojúhelník: základna dole, offset rovnoběžně se stranami (inradius se mění o off)
    const s = t.side, h = s * Math.sqrt(3) / 2, cx = x0 + s / 2, cy = y0 + h / 3;
    const ri = s / (2 * Math.sqrt(3)) + off; if (ri <= 1e-3) return null;
    const R = 2 * ri;
    return [-150, -30, 90].map(a => a * Math.PI / 180).map(a => [cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return null;
}
// sousledné frézování (vřeteno CW): vnější obrys po směru hodin, vnitřní proti směru
function wantCW(t) { const inside = t.comp === 'inside' || t.shape === 'pocket'; return t.climb ? !inside : inside; }

// G-kód jedné buňky (začíná a končí v bezpečné výšce)
function cellCode(t, p, x0, y0, M) {
  const out = [], sz = M.zTravel, za = M.zApproach;
  const passes = []; for (let z = 0; z < p.depth - 1e-6;) { z = Math.min(p.depth, z + p.step); passes.push(z); }
  const plunge = z => out.push(`G1 Z${fmt(-z)} F${fmt(p.plunge)}`);
  const approach = (x, y) => { out.push(`G0 X${fmt(x)} Y${fmt(y)}`, `G0 Z${fmt(za)}`); };
  const r = (t.tool?.dia || 0) / 2;
  if (t.shape === 'drill') {
    const x = x0, y = y0; approach(x, y);
    passes.forEach((z, i) => {
      if (i) out.push(`G0 Z${fmt(-passes[i - 1] + 0.1)}`); // zpět nad dno díry
      plunge(z); if (i < passes.length - 1) out.push(`G0 Z${fmt(za)}`); // výplach třísek
    });
    out.push(`G0 Z${fmt(sz)}`);
    return out;
  }
  if (t.shape === 'line') {
    approach(x0, y0);
    let at = 0;
    for (const z of passes) {
      plunge(z);
      const nx = at === 0 ? x0 + t.len : x0; out.push(`G1 X${fmt(nx)} Y${fmt(y0)} F${fmt(p.feed)}`); at = 1 - at;
    }
    out.push(`G0 Z${fmt(sz)}`);
    return out;
  }
  const cw = wantCW(t);
  if (t.shape === 'circle' || (t.shape === 'pocket' && t.pocketShape === 'circle')) {
    const cx = x0 + t.dia / 2, cy = y0 + t.dia / 2;
    const off = t.shape === 'pocket' ? -r : t.comp === 'outside' ? r : t.comp === 'inside' ? -r : 0;
    const R = t.dia / 2 + off;
    if (R <= 1e-3 && t.shape !== 'pocket') throw new Error('Kruh je menší než nástroj.');
    // kapsa: soustředné kružnice od středu ven, krok = průměr × (1 − překrytí)
    const rings = [];
    if (t.shape === 'pocket') { const so = Math.max(0.05, (t.tool?.dia || 1) * (1 - (t.overlap ?? 40) / 100)); for (let rr = R; rr > 1e-3; rr -= so) rings.unshift(rr); if (!rings.length) throw new Error('Kapsa je menší než nástroj.'); }
    else rings.push(R);
    approach(cx + (t.shape === 'pocket' ? 0 : R), cy);
    for (const z of passes) {
      plunge(z);
      for (const rr of rings) {
        out.push(`G1 X${fmt(cx + rr)} Y${fmt(cy)} F${fmt(p.feed)}`);
        out.push(`${cw ? 'G2' : 'G3'} X${fmt(cx + rr)} Y${fmt(cy)} I${fmt(-rr)} J0`);
      }
      if (t.shape === 'pocket') out.push(`G1 X${fmt(cx)} Y${fmt(cy)}`);
    }
    out.push(`G0 Z${fmt(sz)}`);
    return out;
  }
  // obdélník, trojúhelník, obdélníková kapsa
  let loops = [];
  if (t.shape === 'pocket') {
    const so = Math.max(0.05, (t.tool?.dia || 1) * (1 - (t.overlap ?? 40) / 100));
    const a0 = x0 + r, b0 = y0 + r, c0 = x0 + t.w - r, d0 = y0 + t.h - r;
    if (c0 - a0 < -1e-6 || d0 - b0 < -1e-6) throw new Error('Kapsa je menší než nástroj.');
    for (let k = 0; ; k++) {
      const a = a0 + k * so, b = b0 + k * so, c = c0 - k * so, d = d0 - k * so;
      if (c - a < -1e-6 || d - b < -1e-6) break;
      loops.unshift(c - a < 1e-6 || d - b < 1e-6 ? [[a, b], [c, d]] : [[a, b], [c, b], [c, d], [a, d]]);
      if (c - a < 2 * so && d - b < 2 * so) { // střed ještě dočistit
        const mx = (a + c) / 2, my = (b + d) / 2; if (c - a > 1e-6 || d - b > 1e-6) loops.unshift([[Math.min(a + so, mx), Math.min(b + so, my)], [Math.max(c - so, mx), Math.max(d - so, my)]]);
        break;
      }
    }
  } else {
    const pts = closedPath(t, x0, y0); if (!pts) throw new Error('Tvar je po korekci nástroje příliš malý.');
    loops = [pts];
  }
  const orient = pts => { if (pts.length < 3) return pts; let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return (a < 0) === cw ? pts : pts.slice().reverse(); };
  loops = loops.map(orient);
  approach(loops[0][0][0], loops[0][0][1]);
  for (const z of passes) {
    plunge(z);
    for (const pts of loops) {
      out.push(`G1 X${fmt(pts[0][0])} Y${fmt(pts[0][1])} F${fmt(p.feed)}`);
      for (let i = 1; i < pts.length; i++) out.push(`G1 X${fmt(pts[i][0])} Y${fmt(pts[i][1])}`);
      if (pts.length > 2) out.push(`G1 X${fmt(pts[0][0])} Y${fmt(pts[0][1])}`);
    }
    out.push(`G1 X${fmt(loops[0][0][0])} Y${fmt(loops[0][0][1])}`);
  }
  out.push(`G0 Z${fmt(sz)}`);
  return out;
}

// t: { shape, len, w, h, side, dia, pocketShape, overlap, comp, climb, tool:{dia,type,name},
//      base:{feed, plunge, spindle, depth, step}, matrix:{on, rows:{key,from,to,n}, cols:{…}}, gap,
//      x, y (počátek = levý dolní roh buňky [0,0], relativně), skip:Set('r,c'),
//      after:'up'|'start'|'next'|'park', nextDX, nextDY, parkX, parkY (strojově), material }
// M: { zTravel, zApproach, zEnd, dwell }
export function buildTest(t, M) {
  const g = shapeGeom(t);
  const rowsV = t.matrix?.on ? axisValues(t.matrix.rows) : [null];
  const colsV = t.matrix?.on ? axisValues(t.matrix.cols) : [null];
  const cellW = g.w + 2 * g.pad, cellH = g.h + 2 * g.pad;
  const gap = Math.max(0, t.gap ?? 3);
  const pitchX = cellW + gap, pitchY = cellH + gap;
  const cells = [];
  for (let r = 0; r < rowsV.length; r++) for (let c = 0; c < colsV.length; c++) {
    const p = { ...t.base };
    if (rowsV[r] != null) p[t.matrix.rows.key] = rowsV[r];
    if (colsV[c] != null) p[t.matrix.cols.key] = colsV[c];
    p.depth = +roundZ(p.depth).toFixed(2); p.step = +Math.min(p.depth, roundZ(p.step)).toFixed(2);
    // u řádku/sloupce „pod sebou“ (čára, vrtání) se buňky rozestaví podle velikosti
    const x = t.x + c * pitchX + g.pad, y = t.y + r * pitchY + g.pad;
    cells.push({ r, c, p, x, y, skip: !!t.skip?.has(`${r},${c}`), aggr: (p.feed / Math.max(1, p.spindle)) * p.step * (1 + p.depth / 5) + p.plunge / 1e5 });
  }
  const run = cells.filter(c => !c.skip).sort((a, b) => a.aggr - b.aggr);
  if (!run.length) throw new Error('Všechny buňky jsou vynechané.');
  const warn = [];
  const T = t.thickness || 0;
  for (const c of run) {
    for (const k of ['feed', 'plunge', 'spindle', 'depth', 'step']) if (!(c.p[k] > 0)) throw new Error(`Neplatná hodnota ${VARS[k]} v buňce ${c.r + 1}/${c.c + 1}.`);
    if (T && c.p.depth > T + 0.001) warn.push(`buňka ${c.r + 1}/${c.c + 1}: hloubka ${fmt(c.p.depth)} mm je větší než tloušťka materiálu ${fmt(T)} mm`);
  }
  const head = [`(KiMill – test materiálu${t.material ? ': ' + t.material.replace(/[()]/g, '') : ''})`, `(Nástroj: ${(t.tool?.name || '').replace(/[()]/g, '')}, tvar: ${SHAPES[t.shape]})`, 'G21', 'G90', 'G94', 'G17', `G0 Z${fmt(M.zTravel)}`];
  const out = head.slice();
  let S = null;
  for (const c of run) {
    c.lineStart = out.length;
    out.push(`(Bunka ${c.r + 1}/${c.c + 1}: F${fmt(c.p.feed)} Z${fmt(c.p.plunge)} S${fmt(c.p.spindle)} hloubka ${fmt(c.p.depth)} krok ${fmt(c.p.step)})`);
    if (S !== c.p.spindle) { out.push(`S${fmt(c.p.spindle)} M3`, `G4 P${fmt(S == null ? (M.dwell ?? 2) : 1)}`); S = c.p.spindle; }
    out.push(...cellCode(t, c.p, c.x, c.y, M));
    c.lineEnd = out.length - 1;
  }
  const W = colsV.length * pitchX - gap, H = rowsV.length * pitchY - gap;
  out.push(`G0 Z${fmt(Math.max(M.zEnd ?? M.zTravel, M.zTravel))}`, 'M5');
  const after = t.after || 'up';
  let next = null;
  if (after === 'start') out.push(`G0 X${fmt(t.x)} Y${fmt(t.y)}`);
  if (after === 'next') { next = { x: t.x + (t.nextDX ?? W + gap), y: t.y + (t.nextDY ?? 0) }; out.push(`G0 X${fmt(next.x)} Y${fmt(next.y)}`); }
  if (after === 'park' && t.parkX != null && t.parkY != null) out.push(`G0 X${fmt(t.parkX)} Y${fmt(t.parkY)}`); // parkX/Y v relativních souřadnicích (přepočteno z uložené strojové polohy)
  out.push('M2');
  return { text: out.join('\n'), cells, run, rowsV, colsV, size: { w: W, h: H }, bbox: { minX: t.x, minY: t.y, maxX: t.x + W, maxY: t.y + H }, next, warn };
}
