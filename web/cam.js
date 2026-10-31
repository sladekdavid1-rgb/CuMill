// CAM: izolace, vrtání, kolíčky, frézování děr a další geometrie, ořez -> G-kód pro GRBL (UGS / Candle)
import * as G from './geom.js';
import { textToLines } from './text.js';

export const APP = 'KiMill';
export const VERSION = '1.5';

export const TOOL_TYPES = { v: 'V-fréza', end: 'Fréza', drill: 'Vrták' };
export function defaultTools() {
  return [
    { id: 'v30', name: 'V-fréza 30° hrot 0,1', type: 'v', dia: 0.1, vTip: 0.1, vAngle: 30, feed: 400, plunge: 100, spindle: 12000, step: 0.05 },
    { id: 'e18', name: 'Fréza Ø1,8', type: 'end', dia: 1.8, feed: 120, plunge: 60, spindle: 12000, step: 0.6 },
    { id: 'e10', name: 'Fréza Ø1,0', type: 'end', dia: 1.0, feed: 100, plunge: 50, spindle: 12000, step: 0.3 },
    { id: 'd04', name: 'Vrták Ø0,4', type: 'drill', dia: 0.4, feed: 300, plunge: 300, spindle: 12000, step: 0.5 },
    { id: 'd10', name: 'Vrták Ø1,0', type: 'drill', dia: 1.0, feed: 300, plunge: 300, spindle: 12000, step: 0.5 },
    { id: 'd25', name: 'Vrták Ø2,5', type: 'drill', dia: 2.5, feed: 300, plunge: 300, spindle: 12000, step: 0.5 },
  ];
}
export function defaults() {
  return {
    machine: { spindle: 12000, arcs: true, fitTol: 0.005, dwell: 2, zTravel: 2, zEnd: 35, zApproach: 0.3, rapid: 1500, homeAtEnd: true, decimals: 4 },
    tools: defaultTools(),
    setup: { origin: 'pin-ll', offX: 0, offY: 0, rot: 0, mirrorAxis: 'h', blankW: 100, blankH: 70, blankT: 1.2 },
    pins: { mode: 'auto', source: 'holes', holeDia: 3.2, patW: 88, patH: 58, dia: 2.5, method: 'drill', tool: 'd25', millTool: 'e18', depth: 6, exclude: true },
    iso: { layers: { 'F.Cu': true, 'B.Cu': true }, tool: 'v30', width: 0.18, depth: 0.1, passes: 1, overlap: 15, clearOverlap: 40, climb: true, clip: true, step: 0, edgeSlow: true, edgeFeed: 150 },
    drill: { depthMode: 'auto', through: 0.3, depth: 1.7, millAbove: 0.3, millTool: 'e10', side: 'auto' },
    geo: { tool: 'e18', pocketOverlap: 40 },
    cut: { enabled: true, tool: 'e18', depth: 1.8, step: null, tabs: 0, tabW: 2, tabH: 0.6, climb: true },
    rest: { F: false, B: false, tool: 'e18', depth: 0.1, overlap: 40, isoOverlap: 0.1, minDist: 0 },
    silk: { F: false, B: false, tool: 'v30', depth: 0.08, texts: true, graphics: true, avoid: 'tracks', margin: 0.15 },
    ov: {}, // přepsané parametry jednotlivých operací {klíč: {feed, plunge, spindle, step, depth}}
  };
}
// nastavení vázané na konkrétní desku (pamatuje se u desky, přežije změny v KiCadu)
export function boardDefaults() {
  return { holes: { groups: {}, single: {} }, nets: {}, islands: [], areas: [], geo: { layers: {}, objs: {} }, pins: [], tabs: null };
}

// ---------- pomocné ----------
const ascii = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?').replace(/[()]/g, '');
export const fileSafe = s => ascii(s).replace(/[^A-Za-z0-9._-]+/g, '_');
const fmtMM = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');
const has = v => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && !isFinite(v));

export function getTool(S, id, type) {
  let t = S.tools.find(x => x.id === id);
  if (!t || (type && !type.includes(t.type))) t = S.tools.find(x => !type || type.includes(x.type));
  return t || null;
}
// teoretická šířka řezu nástroje v dané hloubce
export function toolWidth(t, depth) {
  if (!t) return 0;
  if (t.type === 'v') return t.vTip + 2 * depth * Math.tan(t.vAngle / 2 * Math.PI / 180);
  return t.dia;
}
export function toolLabel(t) {
  if (!t) return '—';
  return t.name || (t.type === 'v' ? `V ${t.vAngle}° ${t.vTip}` : `${TOOL_TYPES[t.type]} Ø${fmtMM(t.dia)}`);
}
// parametry operace: nástroj z knihovny, přepsané hodnoty operace mají přednost
// hloubka vrtání: auto = tloušťka desky + délka špičky vrtáku (úhel hrotu, výchozí 118°) + přesah,
// aby díra měla celý průměr až na spodní straně; jinak pevná hloubka z nastavení
export const drillTip = tool => { const a = (+tool?.tipAngle || 118) * Math.PI / 180; return (tool?.dia || 0) / 2 / Math.tan(a / 2); };
export function drillDepth(S, tool) {
  if (S.drill.depthMode === 'fixed') return S.drill.depth;
  return Math.round(((S.setup.blankT || 1.6) + drillTip(tool) + (S.drill.through ?? 0.3)) * 100) / 100;
}
export function opParams(S, key, tool, base = {}) {
  const o = S.ov[key] || {};
  const pick = (k, def) => has(o[k]) ? +o[k] : def;
  return {
    feed: pick('feed', tool?.feed ?? 300), plunge: pick('plunge', tool?.plunge ?? 100),
    spindle: pick('spindle', tool?.spindle ?? S.machine.spindle), step: pick('step', has(base.step) && base.step > 0 ? +base.step : tool?.step ?? 0.5),
    depth: pick('depth', base.depth),
  };
}
export const isoWidth = S => S.iso.width;
// ---------- souřadnicové transformace stran ----------
// strana 'top' = pohled shora jako v KiCadu, 'bottom' = deska otočená (zrcadlení)
// otočení desky na stroji ve stupních (po směru hodin při pohledu shora), 0 ≤ r < 360
export const boardRot = S => { const v = +S.setup?.rot; if (!isFinite(v)) return 0; const r = Math.round(((v % 360) + 360) % 360 * 100) / 100; return r >= 360 ? 0 : r; };
// funkce otočení bodu kolem (cx, cy) a její inverze
export function rotFns(S, cx, cy) {
  const rot = boardRot(S);
  if (!rot) return { rot, R: p => p, Ri: p => p, c: 1, s: 0 };
  const a = -rot * Math.PI / 180, snap = v => Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v;
  const c = snap(Math.cos(a)), s = snap(Math.sin(a));
  return { rot, c, s,
    R: ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c],
    Ri: ([x, y]) => [cx + (x - cx) * c + (y - cy) * s, cy - (x - cx) * s + (y - cy) * c] };
}
export function makeSides(board, s, pinsDesign) {
  let cx, cy;
  if (pinsDesign.length >= 2) {
    const bb = G.bbox([pinsDesign.map(p => [p.x, p.y])]);
    cx = (bb.minX + bb.maxX) / 2; cy = (bb.minY + bb.maxY) / 2;
  } else { cx = (board.bb.minX + board.bb.maxX) / 2; cy = (board.bb.minY + board.bb.maxY) / 2; }
  const axis = s.setup.mirrorAxis;
  // otočení desky na stroji (po směru hodinových ručiček při pohledu shora) kolem středu
  const { rot, R, Ri } = rotFns(s, cx, cy);
  const mk = (mirror) => {
    const mir = mirror ? (axis === 'h' ? ([x, y]) => [x, 2 * cy - y] : ([x, y]) => [2 * cx - x, y]) : (p => p);
    const m = p => mir(R(p)), mInv = p => Ri(mir(p));
    // nula
    const bb = G.bbox((board.outlines || [board.outline]).map(l => l.map(m)));
    let o, desc;
    switch (s.setup.origin) {
      case 'pin-ll': {
        if (pinsDesign.length) {
          const pts = pinsDesign.map(p => m([p.x, p.y]));
          pts.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
          o = pts[0]; desc = 'stred leveho dolniho kolicku';
        } else { o = [bb.minX, bb.minY]; desc = 'levy dolni roh desky (kolicky nejsou)'; }
        break;
      }
      case 'board-c': o = [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2]; desc = 'stred desky'; break;
      case 'aux': o = board.aux ? m(board.aux) : [bb.minX, bb.minY]; desc = board.aux ? 'pomocny pocatek KiCadu (aux origin)' : 'levy dolni roh desky'; break;
      case 'abs': o = m([0, 0]); desc = 'pocatek souradnic KiCadu'; break;
      default: o = [bb.minX, bb.minY]; desc = 'levy dolni roh desky (obrys)';
    }
    const ox = o[0] - s.setup.offX, oy = o[1] - s.setup.offY;
    if (s.setup.offX || s.setup.offY) desc += `, posun X${s.setup.offX} Y${s.setup.offY}`;
    const fwd = p => { const q = m(p); return [q[0] - ox, q[1] - oy]; };
    const inv = ([x, y]) => mInv([x + ox, y + oy]);
    if (rot) desc += `, deska otocena o ${String(rot).replace('.', ',')} st.`;
    return { mirror, fwd, inv, desc, axis, rot, R, Ri, center: [cx, cy] };
  };
  return { top: mk(false), bottom: mk(true) };
}
const tPaths = (paths, tf) => paths.map(p => p.map(tf));

// ---------- G-kód ----------
class GCode {
  constructor(s, meta) {
    this.s = s; this.d = s.machine.decimals; this.lines = [];
    this.x = null; this.y = null; this.z = s.machine.zTravel; this.f = null;
    this.cutLen = 0; this.rapidLen = 0; this.plungeLen = 0; this.feedTime = 0;
    this.moves = []; // [{t:'cut'|'rapid', pts:[[x,y]...]}]
    this.meta = meta;
  }
  n(v) { let r = v.toFixed(this.d); if (r.includes('.')) r = r.replace(/0+$/, '').replace(/\.$/, ''); return r === '-0' ? '0' : r; }
  push(l) { this.lines.push(l); }
  comment(t) { this.lines.push(`(${ascii(t).slice(0, 70)})`); }
  _mv(t, x, y) {
    const last = this.moves[this.moves.length - 1];
    const from = [this.x ?? 0, this.y ?? 0];
    if (last && last.t === t) last.pts.push([x, y]);
    else this.moves.push({ t, pts: [from, [x, y]] });
  }
  rapidZ(z) { if (this.z !== null && Math.abs(this.z - z) < 1e-6) return; this.push(`G0 Z${this.n(z)}`); this.z = z; }
  rapidXY(x, y) {
    if (this.x !== null && Math.abs(this.x - x) < 1e-6 && Math.abs(this.y - y) < 1e-6) return;
    this.rapidLen += Math.hypot(x - (this.x ?? 0), y - (this.y ?? 0));
    this._mv('rapid', x, y);
    this.push(`G0 X${this.n(x)} Y${this.n(y)}`); this.x = x; this.y = y;
  }
  feedZ(z, f) {
    const dz = Math.abs(z - (this.z ?? 0));
    this.plungeLen += dz; this.feedTime += dz / f;
    this.push(`G1 Z${this.n(z)}${this.f !== f ? ' F' + this.n(f) : ''}`); this.z = z; this.f = f;
  }
  cut(x, y, f, z) {
    let l = 'G1';
    const dx = this.x === null || Math.abs(this.x - x) > 1e-6, dy = this.y === null || Math.abs(this.y - y) > 1e-6;
    const dz = z !== undefined && (this.z === null || Math.abs(this.z - z) > 1e-6);
    if (!dx && !dy && !dz) return;
    const L = Math.hypot(x - (this.x ?? 0), y - (this.y ?? 0), dz ? z - this.z : 0);
    this.cutLen += L; this.feedTime += L / f;
    if (dx) l += ` X${this.n(x)}`; if (dy) l += ` Y${this.n(y)}`; if (dz) l += ` Z${this.n(z)}`;
    if (this.f !== f) l += ` F${this.n(f)}`;
    this._mv('cut', x, y);
    this.push(l); this.x = x; this.y = y; if (dz) this.z = z; this.f = f;
  }
  // oblouk G2/G3 do (x,y) se středem (cx,cy); pts = body oblouku pro náhled
  arc(x, y, cx, cy, ccw, f, pts, sweep) {
    const r = Math.hypot(x - cx, y - cy);
    const L = r * Math.abs(sweep);
    this.cutLen += L; this.feedTime += L / f;
    // I, J vztažené k zaokrouhlené aktuální poloze (GRBL kontroluje shodu poloměrů)
    const px = +this.n(this.x), py = +this.n(this.y);
    let l = `${ccw ? 'G3' : 'G2'} X${this.n(x)} Y${this.n(y)} I${this.n(cx - px)} J${this.n(cy - py)}`;
    if (this.f !== f) l += ` F${this.n(f)}`;
    for (const q of pts.slice(1)) this._mv('cut', q[0], q[1]);
    this.push(l); this.x = x; this.y = y; this.f = f;
  }
  // souvislá dráha z aktuální polohy přes body pts (pts[0] = aktuální poloha):
  // rovné úseky sloučí, oblouky zapíše jako G2/G3
  path(pts, f) {
    const segs = fitPath(pts, this.s.machine.arcs !== false, this.s.machine.fitTol || 0.005);
    for (const sg of segs) {
      if (sg.arc) this.arc(sg.end[0], sg.end[1], sg.cx, sg.cy, sg.ccw, f, sg.pts, sg.sweep);
      else this.cut(sg.end[0], sg.end[1], f);
    }
  }
  // kompletní soubor
  build(body, range) {
    const m = this.s.machine, meta = this.meta;
    const time = this.minutes();
    const head = [];
    const c = t => head.push(`(${ascii(t).slice(0, 72)})`);
    c(`${APP} ${VERSION} - ${meta.board}`);
    c(`Operace: ${meta.title}`);
    c(`Nastroj: ${meta.tool}`);
    for (const t of meta.notes || []) c(t);
    c(`Nula XY: ${meta.origin}`);
    c(`Nula Z: ${meta.zero || 'povrch medi'}`);
    c(`Strana: ${meta.side}`);
    if (range && G.bbValid(range)) c(`Rozsah X ${this.n(range.minX)} .. ${this.n(range.maxX)}  Y ${this.n(range.minY)} .. ${this.n(range.maxY)}`);
    c(`Odhad casu: ${time < 1 ? '< 1' : Math.round(time)} min`);
    c(`Vytvoreno: ${new Date().toLocaleString('cs-CZ')}`);
    const pre = ['G21', 'G90', 'G94', 'G17', `G0 Z${this.n(m.zTravel)}`, `S${Math.round(meta.spindle ?? m.spindle)} M3`];
    if (m.dwell > 0) pre.push(`G4 P${this.n(m.dwell)}`);
    const post = [`G0 Z${this.n(m.zEnd)}`, 'M5'];
    if (m.homeAtEnd) post.push('G0 X0 Y0');
    post.push('M2');
    return head.concat(pre, body, post).join('\n') + '\n';
  }
  minutes() {
    const m = this.s.machine;
    return this.feedTime + (this.rapidLen + Math.abs(m.zEnd - m.zTravel)) / Math.max(100, m.rapid) + (this.s.machine.dwell || 0) / 60;
  }
}


// ---------- proložení dráhy úsečkami a oblouky ----------
function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
// nejdelší úsečka od i (všechny mezilehlé body do tolerance)
function lineRun(pts, i, tol) {
  let best = i + 1;
  for (let j = i + 2; j < pts.length && j - i < 2000; j++) {
    let ok = true;
    for (let k = i + 1; k < j; k++) if (distToSeg(pts[k], pts[i], pts[j]) > tol) { ok = false; break; }
    if (!ok) break;
    best = j;
  }
  return best;
}
// nejdelší oblouk od i (body na kružnici do tolerance, stejný směr, krok < 45°)
function arcRun(pts, i, tol) {
  let best = null;
  const n = pts.length;
  for (let j = i + 3; j < n && j - i < 800; j++) {
    const m = (i + j) >> 1;
    const c = G.circleFrom3(pts[i], pts[m], pts[j]);
    if (!c || c.r < 0.05 || c.r > 100) { if (best) break; continue; }
    let ok = true, dir = 0, sweep = 0;
    let a0 = Math.atan2(pts[i][1] - c.cy, pts[i][0] - c.cx);
    for (let k = i + 1; k <= j; k++) {
      const q = pts[k];
      if (Math.abs(Math.hypot(q[0] - c.cx, q[1] - c.cy) - c.r) > tol) { ok = false; break; }
      const a1 = Math.atan2(q[1] - c.cy, q[0] - c.cx);
      let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) > Math.PI / 4 || Math.abs(d) < 1e-9) { ok = false; break; }
      const sg = Math.sign(d);
      if (dir && sg !== dir) { ok = false; break; }
      dir = sg; sweep += d; a0 = a1;
      // průhyb tětivy mezi body musí být v toleranci (jinak by oblouk vybočil z polygonu)
      const half = Math.abs(d) / 2;
      if (c.r * (1 - Math.cos(half)) > tol) { ok = false; break; }
    }
    if (!ok) { if (best) break; continue; }
    if (Math.abs(sweep) > 1.8 * Math.PI) break; // max ~324°, GRBL plný kruh nechceme
    best = { j, cx: c.cx, cy: c.cy, ccw: dir > 0, sweep };
  }
  return best;
}
// proložení oblouky je pomalé – výsledek se pamatuje k dané dráze (pole bodů z mezipaměti drah)
const fitMemo = new WeakMap();
export function fitPath(pts, arcs = true, tol = 0.005) {
  const k = (arcs ? 'a' : 'l') + tol;
  let m = fitMemo.get(pts);
  if (m && m[k]) return m[k];
  const out = fitPathRaw(pts, arcs, tol);
  if (!m) { m = {}; fitMemo.set(pts, m); }
  m[k] = out;
  return out;
}
function fitPathRaw(pts, arcs, tol) {
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    const lj = lineRun(pts, i, tol);
    const a = arcs ? arcRun(pts, i, tol) : null;
    if (a && a.j > lj + 1) {
      out.push({ arc: true, end: pts[a.j], cx: a.cx, cy: a.cy, ccw: a.ccw, sweep: a.sweep, pts: pts.slice(i, a.j + 1) });
      i = a.j;
    } else {
      out.push({ arc: false, end: pts[lj] });
      i = lj;
    }
  }
  return out;
}

// spojí otevřené úseky, které na sebe navazují (konec = začátek), do delších tahů
function mergeOpen(segs, tol = 1e-4) {
  const closed = segs.filter(s => s.closed), open = segs.filter(s => !s.closed).map(s => ({ ...s, pts: s.pts.slice() }));
  const eq = (a, b) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
  const key = p => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
  let changed = true;
  while (changed) {
    changed = false;
    const starts = new Map();
    open.forEach((s, i) => { if (!s.dead) starts.set(key(s.pts[0]), i); });
    for (let i = 0; i < open.length; i++) {
      const s = open[i]; if (s.dead) continue;
      const j = starts.get(key(s.pts[s.pts.length - 1]));
      if (j === undefined || j === i || open[j].dead || !eq(open[j].pts[0], s.pts[s.pts.length - 1])) continue;
      s.pts = s.pts.concat(open[j].pts.slice(1)); open[j].dead = true; starts.delete(key(open[j].pts[0])); changed = true;
    }
  }
  const res = closed.slice();
  for (const s of open) {
    if (s.dead) continue;
    const p = s.pts;
    if (p.length > 3 && eq(p[0], p[p.length - 1])) res.push({ pts: p.slice(0, -1), closed: true });
    else res.push(s);
  }
  return res;
}

// ---------- pořadí drah (nejbližší soused) ----------
// items: [{pts, closed}] -> stejné položky natočené / otočené, seřazené
export function orderPaths(items, start = [0, 0]) {
  const rest = items.map(it => ({ ...it }));
  const out = [];
  let cur = start;
  while (rest.length) {
    let best = -1, bestD = Infinity, bestIdx = 0, bestRev = false;
    for (let i = 0; i < rest.length; i++) {
      const it = rest[i], p = it.pts;
      if (it.closed) {
        for (let k = 0; k < p.length; k++) {
          const d = (p[k][0] - cur[0]) ** 2 + (p[k][1] - cur[1]) ** 2;
          if (d < bestD) { bestD = d; best = i; bestIdx = k; }
        }
      } else {
        const a = p[0], b = p[p.length - 1];
        const da = (a[0] - cur[0]) ** 2 + (a[1] - cur[1]) ** 2, db = (b[0] - cur[0]) ** 2 + (b[1] - cur[1]) ** 2;
        if (da < bestD) { bestD = da; best = i; bestRev = false; }
        if (db < bestD && !it.keepDir) { bestD = db; best = i; bestRev = true; }
      }
    }
    const it = rest.splice(best, 1)[0];
    if (it.closed) {
      const p = it.pts;
      it.pts = p.slice(bestIdx).concat(p.slice(0, bestIdx));
      it.pts.push(it.pts[0]);
    } else if (bestRev) it.pts = it.pts.slice().reverse();
    cur = it.pts[it.pts.length - 1];
    out.push(it);
    bestRev = false;
  }
  return out;
}
function orderPoints(pts, start = [0, 0]) {
  const rest = pts.slice(), out = [];
  let cur = start;
  while (rest.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < rest.length; i++) { const d = (rest[i].x - cur[0]) ** 2 + (rest[i].y - cur[1]) ** 2; if (d < bd) { bd = d; bi = i; } }
    const p = rest.splice(bi, 1)[0]; out.push(p); cur = [p.x, p.y];
  }
  // 2-opt (krátké seznamy)
  if (out.length > 3 && out.length < 400) {
    const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    let improved = true, guard = 0;
    while (improved && guard++ < 30) {
      improved = false;
      for (let i = 0; i < out.length - 2; i++) for (let j = i + 2; j < out.length - 1; j++) {
        if (D(out[i], out[i + 1]) + D(out[j], out[j + 1]) > D(out[i], out[j]) + D(out[i + 1], out[j + 1]) + 1e-9) {
          const seg = out.slice(i + 1, j + 1).reverse(); out.splice(i + 1, seg.length, ...seg); improved = true;
        }
      }
    }
  }
  return out;
}

// ---------- kolíčky přípravku ----------
// kolíčky přípravku: režim (auto = jen u oboustranné desky), zdroj (díry desky / vzor / ručně)
export function isoLayersOf(board, S) {
  return ['B.Cu', 'F.Cu'].filter(l => board.used[l] && S.iso.layers[l] !== false && board.hasCopper[l]);
}
// strana pro díry, geometrii a ořez: automaticky ta, ze které se frézuje měď (u jedné frézované
// vrstvy právě ta – i když je deska v KiCadu dvouvrstvá), u obou stran ta poslední (horní)
export function workSideOf(board, S) {
  if (S.drill.side === 'top' || S.drill.side === 'bottom') return S.drill.side;
  const iso = isoLayersOf(board, S);
  if (iso.length === 1) return iso[0] === 'B.Cu' ? 'bottom' : 'top';
  if (iso.length === 2) return 'top';
  return board.used['F.Cu'] || !board.used['B.Cu'] ? 'top' : 'bottom';
}
// strany, ze kterých se bude frézovat (izolace, potisk, díry a ořez)
export function sidesUsed(board, S) {
  const set = new Set(isoLayersOf(board, S).map(l => l === 'B.Cu' ? 'bottom' : 'top'));
  const sg = S.silk || {};
  if (sg.F && board.silk?.['F.SilkS']) set.add('top');
  if (sg.B && board.silk?.['B.SilkS']) set.add('bottom');
  if (board.holes.length || S.cut.enabled) set.add(workSideOf(board, S));
  return set;
}
export function pinsActive(board, S) {
  const m = S.pins.mode || 'auto';
  if (m === 'never') return false;
  if (m === 'always') return true;
  return sidesUsed(board, S).size === 2;
}
export function findPins(board, s, B) {
  const p = s.pins;
  if (!pinsActive(board, s)) return { pins: [], info: (p.mode || 'auto') === 'auto' ? null : null };
  if (p.source === 'manual') {
    const list = (B?.pins || []).map(q => {
      const h = board.holes.find(h => !h.slot && Math.hypot(h.x - q.x, h.y - q.y) < 0.05);
      return { x: h ? h.x : q.x, y: h ? h.y : q.y, fromHole: !!h, manual: true };
    });
    return { pins: list, info: list.length ? `Kolíčky ručně: ${list.length}.` : 'Ruční kolíčky: zatím žádné – přidej je v náhledu nástrojem Kolíček.' };
  }
  if (p.source === 'holes') {
    const hs = board.holes.filter(h => !h.slot && Math.abs(h.d - p.holeDia) < 0.051);
    if (hs.length >= 2) return { pins: hs.map(h => ({ x: h.x, y: h.y, fromHole: true })), info: `Kolíčky v ${hs.length} dírách Ø${fmtMM(p.holeDia)} desky.` };
    return { pins: [], info: `Deska nemá díry Ø${fmtMM(p.holeDia)} pro kolíčky – kolíčky vynechány (přepni na vzor ${fmtMM(p.patW)} × ${fmtMM(p.patH)} nebo je umísti ručně).` };
  }
  const cx = (board.bb.minX + board.bb.maxX) / 2, cy = (board.bb.minY + board.bb.maxY) / 2;
  const pins = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: cx + a * p.patW / 2, y: cy + b * p.patH / 2, fromHole: false }));
  return { pins, info: `Kolíčky ve vzoru ${fmtMM(p.patW)} × ${fmtMM(p.patH)} mm kolem středu desky.` };
}
// polotovar ve strojovém natočení: střed na desce, šířka v ose X stroje.
// inside(x, y, r) = kruh (návrh) leží celý na polotovaru; size = rozměr otočené desky na stroji
export function blankRect(board, S) {
  const cx = (board.bb.minX + board.bb.maxX) / 2, cy = (board.bb.minY + board.bb.maxY) / 2;
  const { R } = rotFns(S, cx, cy);
  const bb = G.bbox((board.outlines || [board.outline]).map(l => l.map(R)));
  const mx = (bb.minX + bb.maxX) / 2, my = (bb.minY + bb.maxY) / 2, W = S.setup.blankW, H = S.setup.blankH;
  const inside = (x, y, r) => { const [u, v] = R([x, y]); return u - r >= mx - W / 2 && u + r <= mx + W / 2 && v - r >= my - H / 2 && v + r <= my + H / 2; };
  return { W, H, inside, size: { w: bb.maxX - bb.minX, h: bb.maxY - bb.minY } };
}
// kontrola polohy kolíčků
function pinChecks(board, S, pins, checks, markers) {
  const r = (S.pins.dia || 2.5) / 2;
  const blank = blankRect(board, S);
  const cutTool = getTool(S, S.cut.tool, ['end']);
  const cutR = S.cut.enabled ? (cutTool?.dia || 1.8) / 2 : 0;
  const distOutline = (x, y) => { let m = Infinity; for (const loop of [...(board.outlines || [board.outline]), ...board.inner]) for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); m = Math.min(m, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)); } return m; };
  pins.forEach((p, i) => {
    const probs = [];
    const onBoard = (board.outlines || [board.outline]).some(o => G.pointInPoly(p.x, p.y, o)) && !board.inner.some(h => G.pointInPoly(p.x, p.y, h));
    if (onBoard && !p.fromHole) probs.push('leží na desce mimo díru');
    if (!p.fromHole) {
      const disk = [G.circle(p.x, p.y, r)];
      for (const L of ['F.Cu', 'B.Cu']) if (board.hasCopper[L] && G.intersection(board.copper[L], disk).length) { probs.push(`zasahuje do mědi ${L}`); break; }
    }
    if (!blank.inside(p.x, p.y, r)) probs.push(`je mimo polotovar ${S.setup.blankW} × ${S.setup.blankH}`);
    if (!onBoard && cutR && distOutline(p.x, p.y) < r + 2 * cutR + 0.2) probs.push('je v dráze ořezu desky');
    p.problems = probs;
    if (probs.length) {
      checks.push({ level: 'error', text: `Kolíček ${i + 1} (X ${fmtMM(p.x)}, Y ${fmtMM(-p.y)}) ${probs.join(', ')}.`, markers: true });
      markers.push({ x: p.x, y: p.y, text: 'kolíček' });
    }
  });
}
// ---------- díry: přiřazení nástroje ----------
export const holeKey = h => `${h.x.toFixed(2)},${h.y.toFixed(2)}`;
export const groupKey = h => (h.slot ? 'S' : '') + h.d.toFixed(2);
// automatické přiřazení skupiny
function autoAct(S, d, slot) {
  const drills = S.tools.filter(t => t.type === 'drill').sort((a, b) => a.dia - b.dia);
  const mill = getTool(S, S.drill.millTool, ['end']);
  if (!drills.length) return { a: 'mill', tool: mill?.id };
  const max = drills[drills.length - 1].dia;
  if (d > max + S.drill.millAbove && mill) return { a: 'mill', tool: mill.id };
  const pool = slot ? drills.filter(t => t.dia <= d + 0.001) : drills;
  const use = (pool.length ? pool : drills).reduce((a, b) => Math.abs(b.dia - d) < Math.abs(a.dia - d) - 1e-9 ? b : a);
  return { a: 'drill', tool: use.id };
}
export function holeActions(board, S, B) {
  const groups = new Map();
  for (const h of board.holes) {
    const k = groupKey(h);
    if (!groups.has(k)) groups.set(k, { key: k, d: h.d, slot: !!h.slot, holes: [], plated: false });
    const g = groups.get(k); g.holes.push(h); if (h.plated) g.plated = true;
  }
  const acts = new Map(); // holeKey -> {a, tool, dia, src}
  const valid = act => act && (act.a === 'skip' || (act.a === 'drill' && getTool(S, act.tool, ['drill'])?.id === act.tool) || (act.a === 'mill' && getTool(S, act.tool, ['end'])?.id === act.tool));
  const list = [];
  for (const g of [...groups.values()].sort((a, b) => a.d - b.d || (a.slot - b.slot))) {
    const auto = autoAct(S, g.d, g.slot);
    const gAct = valid(B.holes.groups[g.key]) ? B.holes.groups[g.key] : null;
    let singles = 0;
    for (const h of g.holes) {
      const sAct = valid(B.holes.single[holeKey(h)]) ? B.holes.single[holeKey(h)] : null;
      if (sAct) singles++;
      acts.set(holeKey(h), { ...(sAct || gAct || auto), src: sAct ? 'single' : gAct ? 'group' : 'auto' });
    }
    list.push({ key: g.key, d: g.d, slot: g.slot, plated: g.plated, count: g.holes.length, auto, act: gAct, singles });
  }
  return { list, acts };
}
export function actLabel(S, act) {
  if (!act) return '';
  if (act.a === 'skip') return 'vynechat';
  const t = getTool(S, act.tool);
  if (act.a === 'mill') return `frézovat ${toolLabel(t)}${act.dia ? ` na Ø${fmtMM(act.dia)}` : ''}`;
  return toolLabel(t);
}

// ---------- další geometrie: nastavení vrstvy / objektu ----------
export function geoLayerSet(S, B, lay) {
  return { on: false, mode: 'in', depth: 0.5, full: true, tool: S.geo.tool, ...(B.geo.layers[lay] || {}) };
}
export function geoObjSet(S, B, o) {
  const s = { ...geoLayerSet(S, B, o.layer), ...(B.geo.objs[o.key] || {}) };
  if (!o.closed && s.mode !== 'line') s.mode = 'line';
  return s;
}

// ---------- mezipaměť drah: při změně ořezu, můstků, děr… se izolace nepočítá znovu ----------
const geoCache = new WeakMap();
function cached(board, key, fn) {
  let m = geoCache.get(board);
  if (!m) { m = new Map(); geoCache.set(board, m); }
  if (m.has(key)) { const v = m.get(key); m.delete(key); m.set(key, v); return v; }
  const v = fn();
  m.set(key, v);
  while (m.size > 12) m.delete(m.keys().next().value);
  return v;
}
// otisk transformace strany (je afinní – stačí tři body)
const tfPrint = tf => [[0, 0], [1, 0], [0, 1]].map(p => tf.fwd(p).map(v => Math.round(v * 1e9) / 1e9)).join(';');

// ---------- bod pro měření Z dotykem: měď, která zůstane i po izolaci a odfrézování ----------
// přednostně rámeček polotovaru vně desky (tam bývá krokodýlek sondy), co nejblíž nule
export function probePoints(board, S, sides, pins = []) {
  const out = {};
  const outl = board.outlines || [board.outline];
  const w = S.iso.width, cutT = getTool(S, S.cut.tool, ['end']);
  const isoReach = S.iso.clip ? 0 : w + (Math.max(1, S.iso.passes) - 1) * w * (1 - S.iso.overlap / 100);
  const d = Math.max(isoReach, S.cut.enabled ? (cutT?.dia || 1.8) + 0.2 : 0) + 1.5;
  const blank = blankRect(board, S);
  const pinR = (S.pins.dia || 2.5) / 2 + 1.5;
  const cand = [];
  for (const ring of G.offset(outl, d)) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t < L; t += 2) cand.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]);
    }
  }
  const ok = p => blank.inside(p[0], p[1], 1.5) && !pins.some(q => Math.hypot(q.x - p[0], q.y - p[1]) < pinR) && !outl.some(o => G.pointInPoly(p[0], p[1], o));
  const good = cand.filter(ok);
  for (const sd of ['top', 'bottom']) {
    const tf = sides[sd]; if (!tf) continue;
    let best = null, bd = Infinity;
    for (const p of good) { const q = tf.fwd(p), dd = Math.hypot(q[0], q[1]); if (dd < bd) { bd = dd; best = q; } }
    if (best) out[sd] = { x: Math.round(best[0] * 10) / 10, y: Math.round(best[1] * 10) / 10, where: 'frame' };
    else {
      // bez rámečku (polotovar = deska): největší kus mědi, bod hluboko uvnitř
      let pt = null, area = 0;
      for (const L of [sd === 'bottom' ? 'B.Cu' : 'F.Cu']) for (const it of board.islands?.[L] || []) {
        const a = Math.abs(G.area(it.outer)); if (a <= area) continue;
        const inner = G.offset([it.outer], -Math.min(1.5, Math.sqrt(a) / 4));
        if (inner.length && inner[0].length) { area = a; pt = inner[0][0]; }
      }
      if (pt) { const q = tf.fwd(pt); out[sd] = { x: Math.round(q[0] * 10) / 10, y: Math.round(q[1] * 10) / 10, where: 'copper' }; }
    }
  }
  return out;
}

// ---------- výpočet všech operací ----------
export function computeAll(board, S, B) {
  B = B || boardDefaults();
  const t0 = performance.now();
  const checks = [], markers = [], ops = [];
  const w = S.iso.width;
  const { pins, info: pinInfo } = findPins(board, S, B);
  if (pinInfo) checks.push({ level: 'info', text: pinInfo });
  const pinsOn = pinsActive(board, S);
  if (pinsOn && pins.length) pinChecks(board, S, pins, checks, markers);
  const sides = makeSides(board, S, pins);
  const used = board.used;
  const isoLayers = isoLayersOf(board, S);
  const workSide = workSideOf(board, S);
  const firstSide = isoLayers.length ? (isoLayers[0] === 'B.Cu' ? 'bottom' : 'top') : workSide;
  const sideName = sd => sd === 'bottom' ? `SPODNI - ZRCADLENO pres ${S.setup.mirrorAxis === 'h' ? 'vodorovnou' : 'svislou'} osu` : 'HORNI (pohled shora)';
  const boardName = board.name;
  let seq = 0;
  const nextNo = () => String(seq++).padStart(2, '0');
  const zText = 'povrch medi (sonda)';
  const M = S.machine;
  const mkG = (meta, prm) => new GCode(S, { board: boardName, zero: zText, spindle: prm.spindle, ...meta });
  const prmNote = prm => `F${prm.feed} zanoreni F${prm.plunge} S${prm.spindle}`;

  // --- kolíčky (vrtat vrtákem, nebo vyfrézovat na přesný průměr)
  if (pinsOn && pins.length) {
    const sd = sides[firstSide];
    const mill = S.pins.method === 'mill';
    const tool = mill ? getTool(S, S.pins.millTool, ['end']) : getTool(S, S.pins.tool, ['drill', 'end']);
    const dia = S.pins.dia || tool?.dia || 2.5;
    const prm = opParams(S, 'pins', tool, { depth: S.pins.depth });
    const pts = orderPoints(pins.map(p => { const [x, y] = sd.fwd([p.x, p.y]); return { x, y }; }));
    const g = mkG({ title: `Diry pro kolicky pripravku D${dia}`, tool: toolLabel(tool) + (mill ? ` - frezovat na D${dia}` : ''), origin: sd.desc, side: sideName(firstSide), notes: [`Hloubka ${prm.depth} mm skrz desku do MDF, krok ${prm.step}, ${prmNote(prm)}`] }, prm);
    const body = []; g.lines = body;
    if (mill) {
      const r = (tool?.dia || 1.8) / 2;
      if (dia <= (tool?.dia || 1.8) + 0.02) { checks.push({ level: 'error', text: `Kolíček Ø${fmtMM(dia)} nejde vyfrézovat frézou Ø${fmtMM(tool?.dia || 0)}.` }); }
      else {
        const loops = pts.map(q => { let c = G.offset([G.circle(q.x, q.y, dia / 2)], -r)[0]; if (G.area(c) < 0) c = c.slice().reverse(); if (!S.cut.climb) c = c.slice().reverse(); return { pts: c.concat([c[0]]), closed: true }; });
        millLoops(g, loops, depthList(prm.depth, prm.step), prm, M);
      }
    } else {
      if (tool && Math.abs(tool.dia - dia) > 0.05) checks.push({ level: 'warn', text: `Kolíček Ø${fmtMM(dia)} vrtá ${toolLabel(tool)} – jiný průměr. Přepni na frézování, nebo vyber vrták Ø${fmtMM(dia)}.` });
      drillHoles(g, pts, prm.depth, prm.plunge, prm.step, S, tool?.dia);
    }
    ops.push({ id: 'pins', key: 'pins', no: nextNo(), kind: 'pins', title: `Kolíčky přípravku Ø${fmtMM(dia)}`, short: `kolicky_D${dia}`, side: firstSide, toolRef: mill ? 'pins.millTool' : 'pins.tool', toolTypes: mill ? ['end'] : ['drill', 'end'], toolId: tool?.id, tool: toolLabel(tool) + (mill ? ` → Ø${fmtMM(dia)}` : ''), toolDia: mill ? (tool?.dia || 1.8) : (tool?.dia || dia), prm, fields: mill ? ['feed', 'plunge', 'spindle', 'step', 'depth'] : ['plunge', 'spindle', 'step', 'depth'], gcode: g.build(body, G.bbox([pts.map(p => [p.x, p.y])])), moves: g.moves, minutes: g.minutes(), count: pts.length, points: mill ? null : pts });
  }

  // --- izolace + odfrézování oblastí mědi
  const pinSet = pinsOn && (S.pins.exclude || S.pins.source === 'manual') ? pins.filter(p => p.fromHole) : [];
  const isoTool = getTool(S, S.iso.tool, ['v', 'end']);
  // --- gravírování potisku (F.SilkS / B.SilkS) V-frézou – hned po izolaci téže strany (stejný nástroj)
  const silkDone = new Set();
  const genSilk = SL => {
    const sg = S.silk || {};
    if (silkDone.has(SL) || !sg[SL === 'B.SilkS' ? 'B' : 'F'] || !board.silk?.[SL]) return;
    silkDone.add(SL);
    const src = board.silk[SL], CuL = SL === 'B.SilkS' ? 'B.Cu' : 'F.Cu', sd = CuL === 'B.Cu' ? 'bottom' : 'top', tf = sides[sd];
    const tool = getTool(S, sg.tool, ['v', 'end']);
    if (!tool) return;
    const prm = opParams(S, 'silk:' + SL, tool, { depth: sg.depth, step: sg.depth });
    let lines = [];
    if (sg.graphics !== false) { lines.push(...src.lines); for (const l of src.loops) lines.push(l.concat([l[0]])); }
    if (sg.texts !== false) for (const t of src.texts) lines.push(...textToLines(t));
    lines = lines.filter(l => l.length > 1);
    if (!lines.length) return; // na vrstvě nic není
    // vyhnout se mědi (plošky, spoje), ať se nepřeruší vodivé spojení
    const tw = toolWidth(tool, prm.depth) / 2 + (sg.margin ?? 0.15);
    let avoid = [];
    if (sg.avoid === 'pads' || sg.avoid === 'tracks') avoid.push(...(board.silkAvoid?.pads?.[CuL] || []));
    if (sg.avoid === 'tracks') avoid.push(...(board.silkAvoid?.tracks?.[CuL] || []));
    if (sg.avoid === 'copper') avoid.push(...(board.copper[CuL] || []));
    const before = lines.reduce((a, l) => a + G.pathLength(l, false), 0);
    if (avoid.length && lines.length) lines = G.clipLinesOutside(lines, G.offset(avoid, tw));
    // jen uvnitř desky
    const inside = G.offset(board.outlines || [board.outline], -0.2);
    if (inside.length) lines = G.clipLinesInside(lines, inside);
    const after = lines.reduce((a, l) => a + G.pathLength(l, false), 0);
    if (!lines.length) { checks.push({ level: 'warn', text: `${SL}: po vynechání mědi nezbylo nic k gravírování.` }); return; }
    if (before - after > 0.5 && sg.avoid !== 'none') checks.push({ level: 'info', text: `${SL}: ${Math.round((1 - after / before) * 100)} % potisku se negravíruje – leží na mědi (${{ pads: 'ploškách', tracks: 'ploškách a spojích', copper: 'mědi' }[sg.avoid] || 'mědi'}).` });
    const items = orderPaths(lines.map(l => ({ pts: l.map(tf.fwd), closed: false })));
    const g = mkG({ title: `Gravirovani potisku ${SL}`, tool: toolLabel(tool), origin: tf.desc, side: sideName(sd), notes: [`Hloubka ${prm.depth} mm, ${items.length} car, ${prmNote(prm)}`] }, prm);
    const body = []; g.lines = body;
    millLoops(g, items, depthList(prm.depth, prm.step), prm, M);
    ops.push({ id: 'silk:' + SL, key: 'silk:' + SL, no: nextNo(), kind: 'silk', layer: SL, title: `Gravírování potisku ${SL === 'B.SilkS' ? 'spodního' : 'horního'}${sd === 'bottom' ? ' (zrcadleně)' : ''}`, short: `${SL === 'B.SilkS' ? 'B' : 'F'}silk_gravirovani${sd === 'bottom' ? '_ZRCADLENO' : ''}`, side: sd, toolRef: 'silk.tool', toolTypes: ['v', 'end'], toolId: tool.id, tool: toolLabel(tool), toolDia: toolWidth(tool, prm.depth), prm, fields: ['feed', 'plunge', 'spindle', 'step', 'depth'], gcode: g.build(body, G.bbox(items.map(o => o.pts))), moves: g.moves, minutes: g.minutes(), count: items.length });
  };
  for (const L of isoLayers) {
    const sd = L === 'B.Cu' ? 'bottom' : 'top';
    const tf = sides[sd];
    const key = 'iso-' + L;
    const prm = opParams(S, key, isoTool, { depth: S.iso.depth, step: S.iso.step });
    const isl = board.islands[L] || [];
    // průjezdy každého ostrůvku: úprava kusu > úprava sítě > výchozí
    const passOf = isl.map(it => {
      const n = it.net && has(B.nets[it.net]) ? +B.nets[it.net] : S.iso.passes;
      return Math.max(1, Math.round(n));
    });
    for (const io of B.islands.filter(o => o.layer === L)) {
      const idx = isl.findIndex(it => G.pointInPoly(io.x, io.y, it.outer) && !it.holes.some(h => G.pointInPoly(io.x, io.y, h)));
      if (idx < 0) checks.push({ level: 'warn', text: `${L}: upravený kus mědi (X ${fmtMM(io.x)}, Y ${fmtMM(-io.y)} v KiCadu) už na desce není – úprava se nepoužije.` });
      else passOf[idx] = Math.max(1, Math.round(io.passes));
    }
    for (const n of Object.keys(B.nets)) if (board.source === 'kicad' && !isl.some(it => it.net === n) && !(board.islands[L === 'F.Cu' ? 'B.Cu' : 'F.Cu'] || []).some(it => it.net === n)) checks.push({ level: 'warn', text: `Síť „${n}“ s vlastním počtem průjezdů na desce není.` });
    const maxP = isl.length ? Math.max(...passOf) : Math.max(1, Math.round(S.iso.passes));
    const isoKey = JSON.stringify(['iso', L, tfPrint(tf), w, S.iso.overlap, S.iso.climb, S.iso.clip, S.iso.clearOverlap, maxP, passOf, B.areas.filter(a => (a.type === 'block' || a.type === 'clear') && (a.layer === L || a.layer === 'both')), board.source]);
    const { ordered, clearRings } = cached(board, isoKey, () => {
    const copperT = tPaths(board.copper[L], tf.fwd);
    const outlinesT = (board.outlines || [board.outline]).map(l => l.map(tf.fwd));
    const region = S.iso.clip ? G.offset(outlinesT, w * 0.75) : null;
    const blocks = B.areas.filter(a => a.type === 'block' && (a.layer === L || a.layer === 'both')).map(a => G.union([a.pts.map(tf.fwd)])).flat();
    const forbidden = maxP > 1 ? G.offset(copperT, w / 2 - 0.003) : null;
    const items = [];
    // ořez drah najednou (rychlé): uzavřená dráha, kterou ořez nezměnil, zůstává uzavřená
    // Clipper může otevřené dráhy otočit – směr (sousledně/nesousledně) se po ořezu obnoví podle původní dráhy
    const batch = (segs, regionPaths, inside) => {
      if (!segs.length || !regionPaths || !regionPaths.length) return segs;
      const lines = segs.map(sg => sg.closed ? sg.pts.concat([sg.pts[0]]) : sg.pts);
      const cell = 0.25, grid = new Map(), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      lines.forEach((l, si) => l.forEach((p, vi) => { const k = key(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([si, vi]); }));
      const find = p => { for (const [si, vi] of grid.get(key(p[0], p[1])) || []) { const q = lines[si][vi]; if (Math.abs(q[0] - p[0]) < 2e-4 && Math.abs(q[1] - p[1]) < 2e-4) return [si, vi]; } return null; };
      const res = inside ? G.clipLinesInside(lines, regionPaths) : G.clipLinesOutside(lines, regionPaths);
      const out = [];
      for (let q of res) {
        if (q.length < 2) continue;
        // směr podle dvou po sobě jdoucích původních vrcholů
        for (let k = 0; k + 1 < q.length; k++) {
          const a = find(q[k]), b = find(q[k + 1]);
          if (a && b && a[0] === b[0] && a[1] !== b[1]) {
            const n = lines[a[0]].length - (segs[a[0]].closed ? 1 : 0);
            const fwd = ((b[1] - a[1]) % n + n) % n, bwd = ((a[1] - b[1]) % n + n) % n;
            if (bwd < fwd) q = q.slice().reverse();
            break;
          }
        }
        const a0 = q[0], a1 = q[q.length - 1];
        const src = find(q[0]) || find(q[1]), pass = src ? segs[src[0]].pass : undefined;
        if (q.length > 3 && Math.abs(a0[0] - a1[0]) < 1e-6 && Math.abs(a0[1] - a1[1]) < 1e-6) out.push({ pts: q.slice(0, -1), closed: true, pass });
        else out.push({ pts: q, closed: false, keepDir: true, pass });
      }
      return out;
    };
    let ringsAll = [], ringsSub = [];
    for (let i = 0; i < maxP; i++) {
      const d = w / 2 + i * w * (1 - S.iso.overlap / 100);
      const subset = isl.map((_, k) => k).filter(k => passOf[k] > i);
      if (!subset.length && isl.length) break;
      const all = !isl.length || subset.length === isl.length;
      const src = all ? copperT : subset.flatMap(k => [isl[k].outer, ...isl[k].holes]).map(p => p.map(tf.fwd));
      for (let r of G.offset(src, d)) {
        if (r.length < 3) continue;
        if (S.iso.climb) r = r.slice().reverse();
        (all ? ringsAll : ringsSub).push({ pts: r, closed: true, pass: i });
      }
    }
    let segs = ringsAll.concat(batch(ringsSub, forbidden, false));
    if (blocks.length) segs = batch(segs, blocks, false);
    if (region) segs = batch(segs, region, true);
    segs = mergeOpen(segs);
    for (const sg of segs) items.push(sg);
    // oblasti k odfrézování (čištění mědi mezi cestami, volitelně všechna měď)
    const clears = B.areas.filter(a => a.type === 'clear' && (a.layer === L || a.layer === 'both'));
    let clearRings = 0;
    for (const a of clears) {
      const A = G.union([a.pts.map(tf.fwd)]);
      let C = a.all ? A : G.difference(A, G.offset(copperT, w / 2));
      if (blocks.length) C = G.difference(C, blocks);
      const step = Math.max(0.01, w * (1 - S.iso.clearOverlap / 100));
      for (let k = 0; k < 4000; k++) {
        const R = k === 0 ? C : G.offset(C, -k * step);
        if (!R.length) break;
        for (let r of R) { if (!S.iso.climb) r = r.slice().reverse(); if (r.length > 2) { items.push({ pts: r, closed: true, edge: k === 0 }); clearRings++; } }
      }
    }
    const ordered = orderPaths(items);
    // síť každé dráhy (nejbližší kus mědi) – pro barvy v náhledu a komentáře v G-kódu
    const uniform = passOf.every(n => n === maxP);
    // krajní průjezd = první (u plošky) nebo poslední (u zbylé mědi) – jede se pomaleji kvůli otřepu
    for (const it of ordered) if (it.edge === undefined) it.edge = it.pass === undefined || it.pass === 0 || (uniform && it.pass === maxP - 1);
    if (isl.length && (board.source === 'kicad' || !uniform)) {
      for (const it of ordered) {
        const q = tf.inv(it.pts[Math.floor(it.pts.length / 2)]);
        let best = null, bd = Infinity;
        for (const isx of isl) {
          const bb = isx.bb;
          const dx = Math.max(bb.minX - q[0], 0, q[0] - bb.maxX), dy = Math.max(bb.minY - q[1], 0, q[1] - bb.maxY);
          if (Math.hypot(dx, dy) > bd) continue;
          for (const ring of [isx.outer, ...isx.holes]) for (let k = 0; k < ring.length; k++) {
            const d = Math.hypot(ring[k][0] - q[0], ring[k][1] - q[1]);
            if (d < bd) { bd = d; best = isx; }
          }
        }
        if (board.source === 'kicad') it.net = best?.net || '';
        if (!uniform && best && it.pass !== undefined && it.pass === passOf[isl.indexOf(best)] - 1) it.edge = true;
      }
    }
    return { ordered, clearRings };
    });
    const isoMulti = prm.step > 0 && prm.step < prm.depth - 1e-6 && (S.iso.step > 0 || has(S.ov[key]?.step));
    const isoDepths = isoMulti ? depthList(prm.depth, prm.step) : [prm.depth];
    const theo = toolWidth(isoTool, prm.depth);
    const edgeF = S.iso.edgeSlow !== false && +S.iso.edgeFeed > 0 && +S.iso.edgeFeed < prm.feed ? +S.iso.edgeFeed : 0;
    // krajní (pomalé) průjezdy nikdy jako první: nejdřív vnitřní průjezdy, krajní až na konci (dokončení u mědi)
    const seq = edgeF ? cached(board, isoKey + '|krajni-nakonec', () => {
      const open = o => o.closed ? { ...o, pts: o.pts.slice(0, -1) } : o; // orderPaths přidá uzavírací bod znovu
      const inner = ordered.filter(o => !o.edge), edge = ordered.filter(o => o.edge);
      if (!inner.length || !edge.length) return ordered;
      const a = orderPaths(inner.map(open)), last = a[a.length - 1].pts[a[a.length - 1].pts.length - 1];
      return a.concat(orderPaths(edge.map(open), last));
    }) : ordered;
    const g = mkG({
      title: `Izolace ${L}${sd === 'bottom' ? ' zrcadleno' : ''}`, origin: tf.desc, side: sideName(sd),
      tool: `${toolLabel(isoTool)}, sirka rezu ${w} mm${isoTool?.type === 'v' ? ` (teoreticky ${theo.toFixed(3)})` : ''}`,
      notes: [`Hloubka ${prm.depth} mm${isoMulti ? ` po ${prm.step} (${isoDepths.length} kroky)` : ''}, ${maxP > 1 ? 'az ' + maxP : '1'} prujezd(y), ${prmNote(prm)}`, ...(edgeF ? [`Krajni prujezdy u medi (prvni a posledni) F${edgeF}`] : [])],
    }, prm);
    const body = []; g.lines = body;
    const nEdge = edgeF ? seq.filter(o => o.edge).length : 0;
    let lastNet = null;
    for (const it of seq) {
      const p = it.pts;
      if (it.net !== undefined && it.net !== lastNet) { g.comment('sit ' + (it.net || '?')); lastNet = it.net; }
      const f = it.edge && edgeF ? edgeF : prm.feed;
      isoDepths.forEach((z, di) => {
        if (di === 0 || !it.closed) { g.rapidZ(M.zTravel); g.rapidXY(p[0][0], p[0][1]); g.rapidZ(M.zApproach); }
        g.feedZ(-z, prm.plunge);
        g.path(p, f);
      });
      g.rapidZ(M.zTravel);
    }
    ops.push({ id: key, key, no: nextNo(), kind: 'iso', layer: L, title: `Izolace ${L === 'B.Cu' ? 'spodní' : 'horní'} mědi${sd === 'bottom' ? ' (zrcadleně)' : ''}`, short: `${L === 'B.Cu' ? 'Bcu' : 'Fcu'}_izolace${sd === 'bottom' ? '_ZRCADLENO' : ''}_V${w.toFixed(2)}`, side: sd, toolRef: 'iso.tool', toolTypes: ['v', 'end'], toolId: isoTool?.id, tool: `${toolLabel(isoTool)} · šířka ${fmtMM(w, 3)}`, toolDia: w, prm, fields: ['feed', 'plunge', 'spindle', 'step', 'depth'], gcode: g.build(body, G.bbox(seq.map(o => o.pts))), moves: g.moves, minutes: g.minutes(), count: seq.length, extra: [clearRings ? `${clearRings} drah čištění` : '', nEdge ? `${nEdge} krajních drah F${edgeF}` : ''].filter(Boolean).join(' · '), netPaths: seq.map(o => ({ net: o.net || '', edge: !!(edgeF && o.edge), pts: o.closed ? o.pts.concat([o.pts[0]]) : o.pts })) });
    { const gc = cached(board, 'gap|' + L + '|' + w, () => { const c = [], m = []; gapCheck(board, L, w, c, m); return { c, m }; }); checks.push(...gc.c); markers.push(...gc.m); }
    genSilk(L === 'B.Cu' ? 'B.SilkS' : 'F.SilkS');
    // --- zbylá měď druhým nástrojem (velké plochy mimo pás izolace)
    const rs = S.rest || {};
    if (rs[L === 'B.Cu' ? 'B' : 'F']) {
      const tool = getTool(S, rs.tool, ['end', 'v']);
      if (tool) {
        const rkey = 'rest-' + L;
        const prm = opParams(S, rkey, tool, { depth: rs.depth ?? S.iso.depth, step: rs.depth ?? S.iso.depth });
        const tw = toolWidth(tool, prm.depth), r = tw / 2;
        const minP = isl.length ? Math.min(...passOf) : maxP;
        const reach = w / 2 + (minP - 1) * w * (1 - S.iso.overlap / 100) + w / 2; // vnější hrana izolace
        // odstup okraje frézy od mědi: ručně (min. vzdálenost od cest), jinak podle pásu izolace
        const keepD = +rs.minDist > 0 ? Math.max(w / 2 + 0.02, +rs.minDist) : Math.max(w / 2 + 0.02, reach - Math.max(0, +rs.isoOverlap || 0));
        const step = Math.max(0.02, tw * (1 - (rs.overlap ?? 40) / 100));
        const rKey = JSON.stringify(['rest', L, tfPrint(tf), keepD, r, step, S.iso.climb, B.areas.filter(a => a.type === 'block' && (a.layer === L || a.layer === 'both'))]);
        const { paths: rp, area } = cached(board, rKey, () => {
          const copperT = tPaths(board.copper[L], tf.fwd);
          const outl = G.union((board.outlines || [board.outline]).map(l => l.map(tf.fwd)));
          let A = G.difference(outl, G.offset(copperT, keepD));
          if (board.inner?.length) A = G.difference(A, board.inner.map(l => l.map(tf.fwd)));
          const blocks = B.areas.filter(a => a.type === 'block' && (a.layer === L || a.layer === 'both')).map(a => G.union([a.pts.map(tf.fwd)])).flat();
          if (blocks.length) A = G.difference(A, blocks);
          const area = A.reduce((a, q) => a + G.area(q), 0);
          const out = [];
          for (let k = 0; k < 4000; k++) {
            const R = G.offset(A, -(r + k * step));
            if (!R.length) break;
            for (let q of R) { if (q.length < 3) continue; if (!S.iso.climb) q = q.slice().reverse(); out.push({ pts: q, closed: true }); }
          }
          return { paths: orderPaths(out), area };
        });
        if (rp.length) {
          const g = mkG({ title: `Odstraneni zbyle medi ${L}${sd === 'bottom' ? ' zrcadleno' : ''}`, tool: toolLabel(tool), origin: tf.desc, side: sideName(sd), notes: [`Hloubka ${prm.depth} mm, ${rp.length} drah, prekryv ${rs.overlap ?? 40} %, odstup od medi ${fmtMM(keepD, 2)} mm, ${prmNote(prm)}`] }, prm);
          const body = []; g.lines = body;
          millLoops(g, rp, [prm.depth], prm, M);
          ops.push({ id: rkey, key: rkey, no: nextNo(), kind: 'rest', layer: L, title: `Zbylá měď ${L === 'B.Cu' ? 'spodní' : 'horní'}${sd === 'bottom' ? ' (zrcadleně)' : ''}`, short: `${L === 'B.Cu' ? 'Bcu' : 'Fcu'}_zbyla_med${sd === 'bottom' ? '_ZRCADLENO' : ''}`, side: sd, toolRef: 'rest.tool', toolTypes: ['end', 'v'], toolId: tool.id, tool: toolLabel(tool), toolDia: tw, prm, fields: ['feed', 'plunge', 'spindle', 'depth'], gcode: g.build(body, G.bbox(rp.map(o => o.pts))), moves: g.moves, minutes: g.minutes(), count: rp.length, extra: `${Math.round(area)} mm²` });
        } else checks.push({ level: 'info', text: `${L}: zbylá měď – nástroj ${toolLabel(tool)} se mezi izolaci nikam nevejde.` });
      }
    }
  }
  // potisk strany bez izolace (např. holá strana jednostranné desky)
  genSilk('B.SilkS'); genSilk('F.SilkS');
  if (!isoLayers.length) checks.push({ level: 'warn', text: 'Žádná vrstva mědi k izolaci.' });

  // --- díry
  const { list: holeList, acts } = holeActions(board, S, B);
  const pinKeys = new Set(pinSet.map(p => holeKey(p)));
  const sdw = sides[workSide];
  const byDrill = new Map(), byMill = new Map();
  for (const h of board.holes) {
    if (pinKeys.has(holeKey(h))) continue;
    const act = acts.get(holeKey(h));
    if (act.a === 'skip') continue;
    const m = act.a === 'drill' ? byDrill : byMill;
    if (!m.has(act.tool)) m.set(act.tool, []);
    m.get(act.tool).push({ h, act });
  }
  for (const [tid, list] of [...byDrill.entries()].sort((a, b) => getTool(S, a[0]).dia - getTool(S, b[0]).dia)) {
    const tool = getTool(S, tid);
    const key = 'drill:' + tid;
    const prm = opParams(S, key, tool, { depth: drillDepth(S, tool) });
    const pts = orderPoints(list.map(({ h }) => {
      const [x, y] = sdw.fwd([h.x, h.y]);
      const o = { x, y };
      if (h.slot) o.slot = [sdw.fwd([h.slot.x1, h.slot.y1]), sdw.fwd([h.slot.x2, h.slot.y2])];
      return o;
    }));
    const diam = new Map(); for (const { h } of list) { const k = fmtMM(h.d); diam.set(k, (diam.get(k) || 0) + 1); }
    for (const { h } of list) {
      if (tool.dia < h.d - 0.25) { checks.push({ level: 'warn', text: `Díry Ø${fmtMM(h.d)} vrtá ${toolLabel(tool)} – výrazně menší.` }); break; }
    }
    for (const { h } of list) if (tool.dia > h.d + 0.15) { checks.push({ level: 'warn', text: `Díry Ø${fmtMM(h.d)} vrtá ${toolLabel(tool)} – větší než díra.` }); break; }
    const g = mkG({ title: `Vrtani D${tool.dia}`, tool: toolLabel(tool), origin: sdw.desc, side: sideName(workSide), notes: [`Diry: ${[...diam].map(([d, n]) => `${n}x D${d}`).join(', ')}`, `Hloubka ${prm.depth} mm, krok ${prm.step || 'bez'}, ${prmNote(prm)}`] }, prm);
    const body = []; g.lines = body;
    drillHoles(g, pts, prm.depth, prm.plunge, prm.step, S, tool.dia);
    const slots = pts.filter(p => p.slot).length;
    if (slots) checks.push({ level: 'info', text: `${slots === 1 ? '1 oválná díra (drážka)' : slots + ' oválné díry (drážky)'} vrtákem Ø${fmtMM(tool.dia)} – vrtá se řadou překrývajících se děr.` });
    ops.push({ id: key, key, no: nextNo(), kind: 'drill', title: `Vrtání Ø${fmtMM(tool.dia)} mm`, short: `vrtani_D${tool.dia}`, side: workSide, toolId: tid, tool: toolLabel(tool), toolDia: tool.dia, prm, fields: ['plunge', 'spindle', 'step', 'depth'], gcode: g.build(body, G.bbox([pts.map(p => [p.x, p.y])])), moves: g.moves, minutes: g.minutes(), count: pts.length, points: pts, extra: diam.size > 1 ? [...diam].map(([d, n]) => `${n}× Ø${d}`).join(', ') : '' });
  }

  // frézované díry (podle frézy)
  for (const [tid, list] of byMill) {
    const tool = getTool(S, tid);
    const key = 'mill:' + tid;
    const prm = opParams(S, key, tool, { depth: S.cut.depth, step: S.cut.step });
    const r = tool.dia / 2;
    const items = [];
    for (const { h, act } of list) {
      const d = act.dia || h.d;
      if (d <= tool.dia + 0.02) {
        checks.push({ level: 'error', text: `Díru Ø${fmtMM(d)}${h.ref ? ' (' + h.ref + ')' : ''} nejde vyfrézovat frézou Ø${fmtMM(tool.dia)}.` });
        markers.push({ x: h.x, y: h.y, text: 'díra < fréza' }); continue;
      }
      const shape = h.slot ? G.capsule(h.slot.x1, h.slot.y1, h.slot.x2, h.slot.y2, d) : G.circle(h.x, h.y, d / 2);
      for (let p of G.offset([shape.map(sdw.fwd)], -r)) { if (G.area(p) < 0) p = p.slice().reverse(); if (!S.cut.climb) p = p.reverse(); items.push({ pts: p, closed: true }); }
    }
    if (!items.length) continue;
    const ordered = orderPaths(items);
    const g = mkG({ title: `Frezovani der`, tool: toolLabel(tool), origin: sdw.desc, side: sideName(workSide), notes: [`${ordered.length} der, hloubka ${prm.depth} mm po ${prm.step}, ${prmNote(prm)}`] }, prm);
    const body = []; g.lines = body;
    millLoops(g, ordered, depthList(prm.depth, prm.step), prm, M);
    ops.push({ id: key, key, no: nextNo(), kind: 'mill', title: `Frézování děr – ${toolLabel(tool)}`, short: `diry_frezou_F${tool.dia}`, side: workSide, toolId: tid, tool: toolLabel(tool), toolDia: tool.dia, prm, fields: ['feed', 'plunge', 'spindle', 'step', 'depth'], gcode: g.build(body, G.bbox(ordered.map(o => o.pts))), moves: g.moves, minutes: g.minutes(), count: ordered.length });
  }

  // --- další geometrie z vrstev
  const geoBy = new Map();
  for (const [lay, objs] of Object.entries(board.geo || {})) {
    for (const o of objs) {
      const st = geoObjSet(S, B, o);
      if (!st.on) continue;
      const tool = getTool(S, st.tool, ['end', 'v']);
      if (!tool) continue;
      if (!geoBy.has(tool.id)) geoBy.set(tool.id, []);
      geoBy.get(tool.id).push({ o, st });
    }
  }
  for (const [tid, list] of geoBy) {
    const tool = getTool(S, tid);
    const key = 'geo:' + tid;
    const prm = opParams(S, key, tool, {});
    const r = tool.type === 'v' ? 0 : tool.dia / 2;
    const jobs = []; // {pts, closed, depth, rings?}
    for (const { o, st } of list) {
      const depth = st.full ? S.cut.depth : +st.depth;
      const pT = o.pts.map(sdw.fwd);
      const loops = [];
      if (st.mode === 'line') loops.push({ pts: pT, closed: o.closed });
      else if (st.mode === 'out') {
        for (let p of G.offset([pT], r)) { if (G.area(p) > 0 === S.cut.climb) p = p.slice().reverse(); loops.push({ pts: p, closed: true }); }
      } else if (st.mode === 'in') {
        const res = G.offset([pT], -r);
        if (!res.length) { checks.push({ level: 'error', text: `${o.layer}: tvar je menší než fréza Ø${fmtMM(tool.dia)} – nevyfrézuje se.` }); markers.push({ x: (o.bb.minX + o.bb.maxX) / 2, y: (o.bb.minY + o.bb.maxY) / 2 }); }
        for (let p of res) { if (G.area(p) < 0 === S.cut.climb) p = p.slice().reverse(); loops.push({ pts: p, closed: true }); }
      } else if (st.mode === 'pocket') {
        const step = Math.max(0.02, tool.dia * (1 - S.geo.pocketOverlap / 100));
        const rings = [];
        for (let k = 0; k < 2000; k++) { const R = G.offset([pT], -(r + k * step)); if (!R.length) break; rings.push(R); }
        if (!rings.length) { checks.push({ level: 'error', text: `${o.layer}: kapsa je menší než fréza Ø${fmtMM(tool.dia)}.` }); }
        // kapsa od středu ven
        for (const R of rings.reverse()) for (let p of R) { if (G.area(p) < 0 === S.cut.climb) p = p.slice().reverse(); loops.push({ pts: p, closed: true }); }
      }
      if (loops.length) jobs.push({ loops, depth, pocket: st.mode === 'pocket', start: loops[0].pts[0] });
    }
    if (!jobs.length) continue;
    // pořadí objektů podle nejbližšího startu
    const ordJobs = orderPoints(jobs.map(j => ({ x: j.start[0], y: j.start[1], j }))).map(o => o.j);
    const g = mkG({ title: `Dalsi geometrie`, tool: toolLabel(tool), origin: sdw.desc, side: sideName(workSide), notes: [`${ordJobs.length} tvaru, krok ${prm.step}, ${prmNote(prm)}`] }, prm);
    const body = []; g.lines = body;
    let n = 0;
    for (const j of ordJobs) {
      const depths = depthList(j.depth, prm.step);
      if (j.pocket) {
        // kapsa: každá hloubka projede všechny kruhy
        // kapsa od středu ven: mezi kruhy se přejíždí řezem v hloubce (vše už vyfrézované nebo uvnitř kapsy)
        g.rapidZ(M.zTravel); g.rapidXY(j.loops[0].pts[0][0], j.loops[0].pts[0][1]); g.rapidZ(M.zApproach);
        for (const z of depths) {
          j.loops.forEach((L2, li) => {
            const p = L2.closed ? L2.pts.concat([L2.pts[0]]) : L2.pts;
            if (li === 0) { g.cut(p[0][0], p[0][1], prm.feed); g.feedZ(-z, prm.plunge); }
            else g.cut(p[0][0], p[0][1], prm.feed);
            g.path(p, prm.feed);
          });
        }
        g.rapidZ(M.zTravel);
        n += j.loops.length;
      } else {
        const loops = orderPaths(j.loops.map(l => ({ ...l, keepDir: true })));
        millLoops(g, loops, depths, prm, M);
        n += loops.length;
      }
    }
    ops.push({ id: key, key, no: nextNo(), kind: 'geo', title: `Další geometrie – ${toolLabel(tool)}`, short: `geometrie_F${tool.dia}`, side: workSide, toolId: tid, tool: toolLabel(tool), toolDia: tool.type === 'v' ? 0.2 : tool.dia, prm, fields: ['feed', 'plunge', 'spindle', 'step'], gcode: g.build(body, null), moves: g.moves, minutes: g.minutes(), count: ordJobs.length });
  }

  // --- ořez
  let cutTabs = null;
  if (S.cut.enabled) {
    const tool = getTool(S, S.cut.tool, ['end']);
    const prm = opParams(S, 'cut', tool, { depth: S.cut.depth, step: S.cut.step });
    const D = tool?.dia || 1.8, r = D / 2;
    const items = [];
    const outT = (board.outlines || [board.outline]).map(l => l.map(sdw.fwd));
    const innT = board.inner.map(l => l.map(sdw.fwd));
    const tree = G.polyTree(G.offset(G.difference(outT, innT), r));
    for (const node of tree) {
      let o = node.outer; if ((G.area(o) > 0) === S.cut.climb) o = o.slice().reverse();
      for (let hh of node.holes) { if ((G.area(hh) < 0) === S.cut.climb) hh = hh.slice().reverse(); items.push({ pts: hh, closed: true, kind: 'inner' }); }
      items.push({ pts: o, closed: true, kind: 'outer' });
    }
    const lost = board.inner.length - tree.reduce((a, n) => a + n.holes.length, 0);
    if (lost > 0) checks.push({ level: 'error', text: `${lost} vnitřní výřez je menší než fréza Ø${fmtMM(D)} – nevyfrézuje se.` });
    const ordered = [];
    let cur = [0, 0];
    for (const k of ['inner', 'outer']) { const part = orderPaths(items.filter(i => i.kind === k), cur); for (const p of part) ordered.push(p); if (part.length) cur = part[part.length - 1].pts[0]; }
    const depths = depthList(prm.depth, prm.step);
    // můstky: automaticky rovnoměrně po obrysu, nebo ručně umístěné (B.tabs, souřadnice KiCadu)
    const tabLen = S.cut.tabW + D;
    const tabMap = new Map(); // položka -> intervaly [a,b] po délce dráhy
    const addIv = (it, c) => {
      const L = G.pathLength(it.pts, false);
      const a = c - tabLen / 2, b = c + tabLen / 2;
      const list = tabMap.get(it) || []; tabMap.set(it, list);
      if (a < 0) { list.push([a + L, L + 1e-9], [-1e-9, b]); } else if (b > L) { list.push([a, L + 1e-9], [-1e-9, b - L]); } else list.push([a, b]);
    };
    const pointAt = (p, c) => { // bod a směr na dráze ve vzdálenosti c
      let acc = 0;
      for (let k = 1; k < p.length; k++) {
        const L = Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
        if (acc + L >= c || k === p.length - 1) { const t = L ? Math.max(0, Math.min(1, (c - acc) / L)) : 0; return { x: p[k - 1][0] + (p[k][0] - p[k - 1][0]) * t, y: p[k - 1][1] + (p[k][1] - p[k - 1][1]) * t, dx: p[k][0] - p[k - 1][0], dy: p[k][1] - p[k - 1][1] }; }
        acc += L;
      }
      return { x: p[0][0], y: p[0][1], dx: 1, dy: 0 };
    };
    const nearestOn = (p, q) => { // nejbližší místo na dráze: vzdálenost a poloha po délce
      let acc = 0, best = { d: Infinity, c: 0 };
      for (let k = 1; k < p.length; k++) {
        const [x0, y0] = p[k - 1], [x1, y1] = p[k], dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
        const t = L2 ? Math.max(0, Math.min(1, ((q[0] - x0) * dx + (q[1] - y0) * dy) / L2)) : 0;
        const d = Math.hypot(q[0] - x0 - t * dx, q[1] - y0 - t * dy);
        if (d < best.d) best = { d, c: acc + t * L };
        acc += L;
      }
      return best;
    };
    const tabsOut = [];
    const pushOut = (it, c, idx, problem) => {
      const q = pointAt(it.pts, c);
      const a = sdw.inv([q.x, q.y]), b = sdw.inv([q.x + q.dx, q.y + q.dy]);
      tabsOut.push({ x: a[0], y: a[1], ang: Math.atan2(b[1] - a[1], b[0] - a[0]), idx, problem });
    };
    const manualTabs = Array.isArray(B?.tabs);
    if (manualTabs) {
      B.tabs.forEach((t, idx) => {
        const q = sdw.fwd([t.x, t.y]);
        let best = null;
        for (const it of ordered) { const n = nearestOn(it.pts, q); if (!best || n.d < best.d) best = { ...n, it }; }
        if (!best || best.d > D + 3) {
          tabsOut.push({ x: t.x, y: t.y, ang: 0, idx, problem: 'mimo dráhu ořezu' });
          checks.push({ level: 'warn', text: `Můstek ${idx + 1} neleží na dráze ořezu – nepoužije se.` });
          markers.push({ x: t.x, y: t.y });
          return;
        }
        addIv(best.it, best.c); pushOut(best.it, best.c, idx, null);
      });
    } else if (S.cut.tabs > 0) {
      for (const it of ordered) if (it.kind === 'outer') {
        const L = G.pathLength(it.pts, false);
        for (let i = 0; i < S.cut.tabs; i++) { const c = L * (i + 0.5) / S.cut.tabs; addIv(it, c); pushOut(it, c, -1, null); }
      }
    }
    const nTabs = [...tabMap.values()].length ? tabsOut.filter(t => !t.problem).length : 0;
    // výška můstku se měří od spodku desky (tloušťka cuprextitu), ne ode dna ořezu
    const boardT = Math.min(S.setup.blankT || prm.depth, prm.depth);
    if (nTabs && S.cut.tabH >= boardT) checks.push({ level: 'warn', text: `Výška můstku ${fmtMM(S.cut.tabH)} mm není menší než tloušťka desky ${fmtMM(boardT)} mm – fréza nad můstkem nic nevyřízne.` });
    cutTabs = { list: tabsOut, len: tabLen, width: D, manual: manualTabs, paths: ordered.map(it => it.pts.map(sdw.inv)) };
    const g = mkG({ title: `Orez desky`, tool: toolLabel(tool), origin: sdw.desc, side: sideName(workSide), notes: [`Hloubka ${prm.depth} mm po ${prm.step} mm (${depths.length} kroky)${nTabs ? `, ${nTabs} mustky ${fmtMM(S.cut.tabW)} x ${fmtMM(S.cut.tabH)} mm` : ', bez mustku'}, ${prmNote(prm)}`] }, prm);
    const body = []; g.lines = body;
    const tabTop = Math.min(-0.05, -Math.min(S.setup.blankT || prm.depth, prm.depth) + S.cut.tabH);
    for (const it of ordered) {
      const p = it.pts;
      const tabs = tabMap.get(it) || null;
      g.rapidZ(M.zTravel); g.rapidXY(p[0][0], p[0][1]); g.rapidZ(M.zApproach);
      for (const dz of depths) {
        const z = -dz;
        if (tabs && z < tabTop) {
          // souvislé úseky (v můstku / mimo) se zapíšou vcelku, aby zůstaly oblouky G2/G3
          let run = null;
          const flush = () => {
            if (!run) return;
            if (g.z === null || Math.abs(g.z - run.z) > 1e-6) g.feedZ(run.z, prm.plunge);
            g.path(run.pts, prm.feed); run = null;
          };
          for (const q of withTabs(p, tabs)) {
            const zz = q.tab ? tabTop : z;
            if (run && Math.abs(run.z - zz) > 1e-9) flush();
            if (!run) run = { z: zz, pts: [[q.x0, q.y0]] };
            run.pts.push([q.x, q.y]);
          }
          flush();
        } else {
          g.feedZ(z, prm.plunge);
          g.path(p, prm.feed);
        }
      }
      g.rapidZ(M.zTravel);
    }
    if (ordered.length) ops.push({ id: 'cut', key: 'cut', no: nextNo(), kind: 'cut', title: 'Ořez desky', short: `orez_F${D}`, side: workSide, toolRef: 'cut.tool', toolTypes: ['end'], toolId: tool?.id, tool: toolLabel(tool), toolDia: D, prm, fields: ['feed', 'plunge', 'spindle', 'step'], gcode: g.build(body, G.bbox(ordered.map(o => o.pts))), moves: g.moves, minutes: g.minutes(), count: ordered.length });
  }

  // --- souhrnné kontroly
  const bs = board.size;
  const ms = blankRect(board, S).size, mw = ms.w, mh = ms.h; // rozměr (otočené) desky na stroji (X × Y)
  const fits = mw <= S.setup.blankW && mh <= S.setup.blankH;
  if (!fits) {
    const turned = mh <= S.setup.blankW && mw <= S.setup.blankH && mw > S.setup.blankW;
    checks.push({ level: 'error', text: `Deska ${fmtMM(mw)} × ${fmtMM(mh)} mm (X × Y na stroji) se nevejde na polotovar ${S.setup.blankW} × ${S.setup.blankH} mm.${turned ? ' Zkus desku otočit o 90° (Deska a nula → Otočení desky na stroji).' : ''}` });
  }
  const dOp = ops.filter(o => o.kind === 'drill');
  if (dOp.some(o => o.prm.depth < S.setup.blankT + 0.1)) checks.push({ level: 'warn', text: `Hloubka vrtání je menší než tloušťka desky ${fmtMM(S.setup.blankT)} mm + 0,1.` });
  else { const short = dOp.filter(o => o.prm.depth < S.setup.blankT + drillTip(getTool(S, o.toolId)) - 0.01); if (short.length) checks.push({ level: 'warn', text: `Vrtání ${short.map(o => 'Ø' + fmtMM(o.toolDia)).join(', ')}: hloubka nepokryje špičku vrtáku – díra nebude mít na spodní straně plný průměr (potřeba aspoň tloušťka desky + ${short.map(o => fmtMM(drillTip(getTool(S, o.toolId)), 2)).join(' / ')} mm).` }); }
  const cOp = ops.find(o => o.kind === 'cut');
  if (cOp && cOp.prm.depth < S.setup.blankT) checks.push({ level: 'error', text: `Hloubka ořezu ${fmtMM(cOp.prm.depth)} mm neprojde deskou ${fmtMM(S.setup.blankT)} mm.` });
  if (used['F.Cu'] && used['B.Cu'] && isoLayers.length === 1) checks.push({ level: 'info', text: `Deska má v KiCadu obě vrstvy mědi, frézuje se jen ${isoLayers[0] === 'B.Cu' ? 'spodní B.Cu' : 'horní F.Cu'} – vyrobí se jako jednostranná (díry a ořez ${workSide === 'bottom' ? 'zespodu' : 'shora'}, bez otáčení).` });
  if (used['F.Cu'] && used['B.Cu'] && isoLayers.length === 2 && board.vias) {
    if (board.vias.length) checks.push({ level: 'info', text: `${board.vias.length} průchodů (via) – deska nemá prokovy, protáhnout drátkem a zapájet z obou stran.`, via: true });
    const top = topSolder(board);
    if (top.length) checks.push({ level: 'info', text: `${top.length} vývodů THT má cestu nebo zónu nahoře – pájet i shora:`, list: top });
  }
  if (new Set(ops.map(o => o.side)).size === 2 && !(pinsOn && pins.length)) checks.push({ level: 'warn', text: 'Deska se otáčí (frézuje se z obou stran), ale bez kolíčků přípravku – otočení nebude přesné.' });
  for (const w2 of board.warnings) checks.unshift(w2);
  const probePts = probePoints(board, S, sides, pinsOn ? pins : []);

  return { ops, checks, markers, holeList, holeActs: acts, pins, pinsOn, cutTabs, pinDia: S.pins.dia || 2.5, sides, workSide, firstSide, isoLayers, isoWidth: w, probePts, ms: performance.now() - t0 };
}

// uzavřené smyčky frézou po hloubkových krocích (díry, prořezy)
function millLoops(g, loops, depths, prm, M) {
  for (const it of loops) {
    let p = it.pts;
    g.rapidZ(M.zTravel); g.rapidXY(p[0][0], p[0][1]); g.rapidZ(M.zApproach);
    for (const z of depths) {
      // otevřená čára: další hloubka jede zpátky (bez přejezdu nízko nad materiálem)
      if (!it.closed && g.z !== null && Math.hypot(g.x - p[0][0], g.y - p[0][1]) > 1e-6) p = p.slice().reverse();
      g.feedZ(-z, prm.plunge);
      g.path(p, prm.feed);
    }
    g.rapidZ(M.zTravel);
  }
}

function depthList(depth, step) {
  const out = [];
  step = Math.max(0.01, step || depth);
  for (let z = step; z < depth - 1e-6; z += step) out.push(+z.toFixed(4));
  out.push(depth);
  return out;
}

function drillHoles(g, pts, depth, feed, peck, s, bit) {
  const zA = s.machine.zApproach, zT = s.machine.zTravel;
  const plunge = (z0) => {
    if (peck > 0 && depth > peck + 1e-6) {
      let z = 0;
      while (z < depth - 1e-6) {
        const nz = Math.min(depth, z + peck);
        if (z > 0) g.rapidZ(-z + 0.1);
        g.feedZ(-nz, feed);
        z = nz;
        if (z < depth - 1e-6) g.rapidZ(zA);
      }
    } else g.feedZ(-depth, feed);
    g.rapidZ(zA);
  };
  g.rapidZ(zT);
  for (const p of pts) {
    if (p.slot) {
      const [a, b] = p.slot;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / ((bit || 1) * 0.35)));
      g.rapidZ(zT); // mezi dírami v bezpečné výšce (kolíčky, prohnutí desky)
      for (let k = 0; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
        g.rapidXY(x, y); g.rapidZ(zA); plunge(); // uvnitř drážky stačí nízký přejezd
      }
    } else {
      g.rapidZ(zT); // mezi dírami v bezpečné výšce (kolíčky, prohnutí desky)
      g.rapidXY(p.x, p.y);
      g.rapidZ(zA);
      plunge();
    }
  }
  g.rapidZ(zT);
}

// rozdělí uzavřenou dráhu na úseky s příznakem můstku
function withTabs(p, tabs) {
  const res = [];
  let acc = 0;
  const inTab = s => tabs.some(([a, b]) => s > a && s < b);
  for (let k = 1; k < p.length; k++) {
    const [x0, y0] = p[k - 1], [x1, y1] = p[k];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const cuts = [0];
    for (const [a, b] of tabs) { if (a > acc && a < acc + L) cuts.push(a - acc); if (b > acc && b < acc + L) cuts.push(b - acc); }
    cuts.push(L); cuts.sort((u, v) => u - v);
    for (let c = 1; c < cuts.length; c++) {
      if (cuts[c] - cuts[c - 1] < 1e-7) continue;
      const t0 = cuts[c - 1] / L, t1 = cuts[c] / L, mid = acc + (cuts[c - 1] + cuts[c]) / 2;
      res.push({ x0: x0 + (x1 - x0) * t0, y0: y0 + (y1 - y0) * t0, x: x0 + (x1 - x0) * t1, y: y0 + (y1 - y0) * t1, tab: inTab(mid) });
    }
    acc += L;
  }
  return res;
}

// ostrůvky mědi, které se po odsazení o polovinu nástroje slijí = fréza mezi nimi neprojde
function gapCheck(board, L, w, checks, markers) {
  const isl = board.islands[L];
  if (!isl || isl.length < 2) return;
  const grown = G.polyTree(G.offset(board.copper[L], w / 2 - 0.002));
  if (grown.length >= isl.length) return;
  const groups = grown.map(() => []);
  isl.forEach((it, idx) => {
    const [x, y] = it.outer[0];
    for (let g = 0; g < grown.length; g++) {
      if (G.pointInPoly(x, y, grown[g].outer) && !grown[g].holes.some(h => G.pointInPoly(x, y, h))) { groups[g].push(idx); break; }
    }
  });
  let n = 0;
  for (const grp of groups) {
    if (grp.length < 2) continue;
    // najdi místa dotyku mezi dvojicemi
    const ex = grp.map(i => ({ i, poly: G.offset([isl[i].outer], w / 2), bb: G.bbox([isl[i].outer]) }));
    for (let a = 0; a < ex.length; a++) for (let b = a + 1; b < ex.length; b++) {
      const A = ex[a].bb, B = ex[b].bb;
      if (A.maxX + w < B.minX || B.maxX + w < A.minX || A.maxY + w < B.minY || B.maxY + w < A.minY) continue;
      const inter = G.intersection(ex[a].poly, ex[b].poly);
      if (!inter.length) continue;
      const bb = G.bbox(inter);
      markers.push({ x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2, layer: L, text: 'mezera < fréza' });
      n++;
    }
  }
  if (n) checks.push({ level: 'error', text: `${L}: ${n}× je mezera mezi mědí užší než fréza (${fmtMM(w, 3)} mm) – zůstal by zkrat. Místa jsou v náhledu označená.` , markers: true });
}

// vývody THT s cestou/zónou na horní straně (deska bez prokovů -> pájet shora)
function topSolder(board) {
  if (!board.trackEnds) return [];
  const out = [];
  const ends = board.trackEnds['F.Cu'];
  const zones = board.zonesFill?.['F.Cu'] || [];
  for (const p of board.pads) {
    if (!p.tht || !p.layers.includes('F.Cu') || !p.net || p.net.startsWith('unconnected')) continue;
    const rad = Math.max(p.w, p.h) / 2 + 0.01;
    let hit = ends.some(e => e.net === p.net && Math.hypot(e.p[0] - p.x, e.p[1] - p.y) <= rad + e.w / 2);
    if (!hit) {
      // zóna stejné sítě připojená k padu (plně nebo termálními můstky): vzorky na kružnici těsně za padem
      const rr = rad + 0.15;
      const samples = Array.from({ length: 24 }, (_, k) => [p.x + rr * Math.cos(k * Math.PI / 12), p.y + rr * Math.sin(k * Math.PI / 12)]);
      hit = zones.some(z => z.net === p.net && samples.some(([x, y]) => G.pointInPoly(x, y, z.poly)));
    }
    if (hit) out.push(`${p.ref}.${p.pad}`);
  }
  return out.sort((a, b) => a.localeCompare(b, 'cs', { numeric: true }));
}

// převod drah operace do souřadnic návrhu (pro náhled)
export function movesToDesign(op, sides) {
  const inv = sides[op.side].inv;
  return op.moves.map(m => ({ t: m.t, pts: m.pts.map(inv) }));
}
