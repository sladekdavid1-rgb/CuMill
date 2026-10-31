// Panelizace: víc desek (i stejných) na jednom polotovaru – sloučení do jedné „panelové desky“,
// kterou zpracuje běžný výpočet drah (programy pak jdou po nástrojích přes všechny desky).
import * as G from './geom.js';
import { finalizeBoard } from './board.js';

export const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const label = i => i < 26 ? LABELS[i] : LABELS[Math.floor(i / 26) - 1] + LABELS[i % 26];

// transformace jedné desky: otočení o rot (°, proti směru hodin) kolem středu a posun tak,
// aby levý dolní roh otočené desky ležel v (x, y)
export function placement(board, inst) {
  const bb = board.bb, cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  const r = ((inst.rot || 0) % 360 + 360) % 360, a = r * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  // zrcadlení (pohled zespodu): přes svislou osu středem desky, před otočením
  const flip = !!inst.flip;
  const rotP = ([x, y]) => { if (flip) x = 2 * cx - x; return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };
  const rb = G.bbox([board.outline.map(rotP)]);
  const dx = inst.x - rb.minX, dy = inst.y - rb.minY;
  const fwd = p => { const q = rotP(p); return [q[0] + dx, q[1] + dy]; };
  return { fwd, rot: r, flip, w: rb.maxX - rb.minX, h: rb.maxY - rb.minY };
}

// sloučí desky do jedné; insts = [{label, name, x, y, rot, board}] (board = načtená a dokončená deska)
export function buildPanelBoard(name, insts) {
  const P = {
    source: insts.every(i => i.board.source === 'kicad') ? 'kicad' : 'gerber', fileName: name, name, panel: true,
    copper: { 'F.Cu': [], 'B.Cu': [] }, holes: [], pads: [], vias: [], trackEnds: { 'F.Cu': [], 'B.Cu': [] }, zonesFill: { 'F.Cu': [], 'B.Cu': [] },
    layerUse: { 'F.Cu': 0, 'B.Cu': 0 }, edge: { lines: [], loops: [] }, other: {}, aux: null, warnings: [],
    silk: { 'F.SilkS': { lines: [], loops: [], texts: [] }, 'B.SilkS': { lines: [], loops: [], texts: [] } },
    silkAvoid: { pads: { 'F.Cu': [], 'B.Cu': [] }, tracks: { 'F.Cu': [], 'B.Cu': [] } },
    panelParts: [], instances: [],
  };
  for (const inst of insts) {
    const b = inst.board, pl = placement(b, inst), T = pl.fwd, L = inst.label;
    // zrcadlená deska: obrátit pořadí bodů, ať zůstane směr obrysů (vnější / díry)
    const pts = a => pl.flip ? a.map(T).reverse() : a.map(T);
    const polys = ps => ps.map(pts);
    // které vrstvy mědi desky se použijí a kam v panelu padnou (zrcadlená: B.Cu ↔ F.Cu)
    const keep = inst.cu === 'F.Cu' || inst.cu === 'B.Cu' ? inst.cu : null;
    const swap = l => l === 'F.Cu' ? 'B.Cu' : l === 'B.Cu' ? 'F.Cu' : l === 'F.SilkS' ? 'B.SilkS' : l === 'B.SilkS' ? 'F.SilkS' : l;
    const dst = l => pl.flip ? swap(l) : l;
    const ang = a => (pl.flip ? -(a || 0) : (a || 0)) + pl.rot;
    const net = n => n ? `${L}:${n}` : '';
    const ref = r => r ? `${L}·${r}` : r;
    for (const l of ['F.Cu', 'B.Cu']) {
      if (keep && l !== keep) continue;
      const d = dst(l);
      P.copper[d].push(...polys(b.copper[l] || []));
      for (const e of b.trackEnds?.[l] || []) P.trackEnds[d].push({ ...e, p: T(e.p), net: net(e.net) });
      for (const z of b.zonesFill?.[l] || []) P.zonesFill[d].push({ ...z, poly: pts(z.poly), net: net(z.net) });
      P.layerUse[d] += b.layerUse ? b.layerUse[l] || 0 : (b.copper[l]?.length || 0);
      P.silkAvoid.pads[d].push(...polys(b.silkAvoid?.pads?.[l] || []));
      P.silkAvoid.tracks[d].push(...polys(b.silkAvoid?.tracks?.[l] || []));
    }
    for (const h of b.holes) {
      const [x, y] = T([h.x, h.y]);
      const hh = { ...h, x, y, ref: ref(h.ref), net: net(h.net), inst: L };
      if (h.slot) { const a = T([h.slot.x1, h.slot.y1]), c = T([h.slot.x2, h.slot.y2]); hh.slot = { x1: a[0], y1: a[1], x2: c[0], y2: c[1] }; }
      P.holes.push(hh);
    }
    for (const p of b.pads || []) { const [x, y] = T([p.x, p.y]); P.pads.push({ ...p, x, y, ang: ang(p.ang), ref: ref(p.ref), net: net(p.net) }); }
    for (const v of b.vias || []) { const [x, y] = T([v.x, v.y]); P.vias.push({ ...v, x, y, net: net(v.net) }); }
    for (const [lay, g] of Object.entries(b.other || {})) {
      const o = P.other[lay] || (P.other[lay] = { lines: [], loops: [] });
      o.lines.push(...polys(g.lines || [])); o.loops.push(...polys(g.loops || []));
    }
    for (const sl of ['F.SilkS', 'B.SilkS']) {
      const s = b.silk?.[sl]; if (!s) continue;
      if (keep && (sl === 'F.SilkS') !== (keep === 'F.Cu')) continue; // potisk jen u použité strany
      const d = dst(sl);
      P.silk[d].lines.push(...polys(s.lines || [])); P.silk[d].loops.push(...polys(s.loops || []));
      for (const t of s.texts || []) { const [x, y] = T([t.x, t.y]); P.silk[d].texts.push({ ...t, x, y, angle: ang(t.angle), mirror: pl.flip ? !t.mirror : t.mirror }); }
    }
    for (const w of b.warnings || []) P.warnings.push({ ...w, text: `Deska ${L} (${inst.name}): ${w.text}` });
    const outer = pts(b.outline), inner = (b.inner || []).map(pts);
    P.panelParts.push({ outer, inner, label: L });
    P.instances.push({ label: L, name: inst.name, outer, w: pl.w, h: pl.h, x: inst.x, y: inst.y, rot: pl.rot, flip: pl.flip, cu: keep });
  }
  if (!P.panelParts.length) P.panelParts.push({ outer: [[0, 0], [10, 0], [10, 10], [0, 10]], inner: [], label: '' });
  const out = finalizeBoard(P);
  if (!insts.length) out.warnings.push({ level: 'warn', text: 'Panel je prázdný – přidej desky (Přidat projekt / Přidat desku).' });
  return out;
}

// desky se nesmí překrývat a mezi nimi musí projet fréza ořezu
export function panelOverlaps(board, minGap) {
  const parts = board.panelParts || [], out = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = G.offset([parts[i].outer], minGap / 2), b = G.offset([parts[j].outer], minGap / 2);
    if (G.intersection(a, b).length) out.push([parts[i].label, parts[j].label]);
  }
  return out;
}

// automatické rozmístění: největší desky první, každá na nejnižší a nejlevější volné místo
// (kandidáti = počátek a rohy už umístěných desek); maxW/maxH = využitelná plocha polotovaru
export function autoArrange(items, gap, maxW, maxH = Infinity) {
  const order = items.map((it, i) => i).sort((a, b) => items[b].w * items[b].h - items[a].w * items[a].h || a - b);
  const placed = [], out = new Array(items.length);
  const free = (x, y, w, h) => placed.every(r => x >= r.x + r.w + gap - 1e-6 || r.x >= x + w + gap - 1e-6 || y >= r.y + r.h + gap - 1e-6 || r.y >= y + h + gap - 1e-6);
  for (const i of order) {
    const { w, h } = items[i];
    const cands = [[0, 0]];
    for (const r of placed) { cands.push([r.x + r.w + gap, r.y], [r.x, r.y + r.h + gap], [r.x + r.w + gap, 0], [0, r.y + r.h + gap]); }
    let best = null;
    for (const lim of [[maxW, maxH], [maxW, Infinity], [Infinity, Infinity]]) {
      for (const [x, y] of cands) {
        if (x + w > lim[0] + 1e-6 || y + h > lim[1] + 1e-6 || !free(x, y, w, h)) continue;
        const ext = Math.max(y + h, ...placed.map(r => r.y + r.h)) * 1000 + Math.max(x + w, ...placed.map(r => r.x + r.w));
        const key = [ext, y, x];
        if (!best || key[0] < best.k[0] - 1e-6 || (Math.abs(key[0] - best.k[0]) < 1e-6 && (key[1] < best.k[1] - 1e-6 || (Math.abs(key[1] - best.k[1]) < 1e-6 && key[2] < best.k[2])))) best = { x, y, k: key };
      }
      if (best) break;
    }
    placed.push({ x: best.x, y: best.y, w, h }); out[i] = { x: best.x, y: best.y };
  }
  return out;
}
