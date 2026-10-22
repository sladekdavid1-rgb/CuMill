// Přímý import .kicad_pcb (KiCad 6–10). Výstup: deska v mm, osa Y nahoru.
import * as G from './geom.js';

// ---------- S-výrazy ----------
export function parseSexpr(text) {
  let i = 0;
  const n = text.length;
  const stack = [[]];
  while (i < n) {
    const ch = text.charCodeAt(i);
    if (ch === 40) { // (
      const node = []; stack[stack.length - 1].push(node); stack.push(node); i++;
    } else if (ch === 41) { // )
      stack.pop(); i++;
    } else if (ch === 34) { // "
      let s = ''; i++;
      while (i < n) {
        const c = text[i];
        if (c === '\\') { const nx = text[i + 1]; s += nx === 'n' ? '\n' : nx; i += 2; continue; }
        if (c === '"') { i++; break; }
        s += c; i++;
      }
      stack[stack.length - 1].push({ s });
    } else if (ch <= 32) {
      i++;
    } else {
      let j = i;
      while (j < n) { const c = text.charCodeAt(j); if (c <= 32 || c === 40 || c === 41) break; j++; }
      stack[stack.length - 1].push(text.slice(i, j)); i = j;
    }
  }
  return stack[0][0];
}
const name = node => Array.isArray(node) ? node[0] : undefined;
const str = a => (a && typeof a === 'object' && !Array.isArray(a)) ? a.s : a;
const kids = (node, nm) => node.filter(c => Array.isArray(c) && c[0] === nm);
const kid = (node, nm) => node.find(c => Array.isArray(c) && c[0] === nm);
const num = (node, nm, idx = 1, def = 0) => { const k = kid(node, nm); return k && k[idx] !== undefined ? parseFloat(str(k[idx])) : def; };
const pt = (node, nm) => { const k = kid(node, nm); return k ? [parseFloat(str(k[1])), -parseFloat(str(k[2]))] : null; };
const at = node => { const k = kid(node, 'at'); return k ? { x: parseFloat(str(k[1])), y: -parseFloat(str(k[2])), a: k[3] !== undefined ? parseFloat(str(k[3])) : 0 } : { x: 0, y: 0, a: 0 }; };
function layersOf(node) {
  const l = kid(node, 'layers'); if (l) return l.slice(1).map(str);
  const s = kid(node, 'layer'); return s ? [str(s[1])] : [];
}
function strokeWidth(node) {
  const st = kid(node, 'stroke');
  if (st) return num(st, 'width', 1, 0);
  return num(node, 'width', 1, 0);
}
function isFilled(node) {
  const f = kid(node, 'fill');
  if (!f) return false;
  const v = str(f[1]);
  return v === 'yes' || v === 'solid' || v === 'true';
}
function ptsList(node) {
  const p = kid(node, 'pts'); if (!p) return [];
  const out = [];
  for (const c of p.slice(1)) {
    if (name(c) === 'xy') out.push([parseFloat(str(c[1])), -parseFloat(str(c[2]))]);
    else if (name(c) === 'arc') {
      const a = G.arc3Pts(pt(c, 'start'), pt(c, 'mid'), pt(c, 'end'));
      for (const q of a) out.push(q);
    }
  }
  return pos(G.dedupe(out, true));
}
// kladná orientace (CCW) – jinak by sjednocení NonZero vyrušilo překrývající se tvary
const pos = p => G.area(p) < 0 ? p.slice().reverse() : p;
export const COPPER = ['F.Cu', 'B.Cu'];
function copperLayers(list) {
  const out = new Set();
  for (const l of list) {
    if (l === '*.Cu' || l === 'F&B.Cu') { out.add('F.Cu'); out.add('B.Cu'); }
    else if (COPPER.includes(l)) out.add(l);
  }
  return [...out];
}

// ---------- grafika (gr_* / fp_*) jako tvary ----------
// tf: funkce převodu lokálního bodu na deskový
function graphicToGeom(node, tf) {
  const kind = name(node).slice(3); // line, arc, circle, rect, poly, curve
  const w = strokeWidth(node), filled = isFilled(node);
  const P = p => tf(p);
  if (kind === 'line') return { lines: [[P(pt(node, 'start')), P(pt(node, 'end'))]], w };
  if (kind === 'arc') {
    let pts;
    if (kid(node, 'mid')) pts = G.arc3Pts(P(pt(node, 'start')), P(pt(node, 'mid')), P(pt(node, 'end')));
    else { // starý formát: start = střed, end = začátek, angle
      const c = P(pt(node, 'start')), s = P(pt(node, 'end'));
      pts = G.arcCenterPts(c, s, -num(node, 'angle'));
    }
    return { lines: [pts], w };
  }
  if (kind === 'circle') {
    const c = P(pt(node, 'center')), e = P(pt(node, 'end'));
    const r = Math.hypot(e[0] - c[0], e[1] - c[1]);
    return { loops: [G.circle(c[0], c[1], r)], w, filled };
  }
  if (kind === 'rect') {
    const s = pt(node, 'start'), e = pt(node, 'end');
    const loop = [[s[0], s[1]], [e[0], s[1]], [e[0], e[1]], [s[0], e[1]]].map(P);
    return { loops: [pos(loop)], w, filled };
  }
  if (kind === 'poly') return { loops: [pos(ptsList(node).map(P))], w, filled };
  if (kind === 'curve') {
    const p = ptsList(node).map(P);
    if (p.length === 4) {
      const out = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32, u = 1 - t;
        out.push([0, 1].map(k => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]));
      }
      return { lines: [out], w };
    }
    return { lines: [p], w };
  }
  return null;
}
function geomToCopper(g) {
  const out = [];
  if (!g) return out;
  if (g.lines) for (const p of G.strokeOpen(g.lines, Math.max(g.w, 0.001))) out.push(p);
  if (g.loops) {
    for (const l of g.loops) if (l.length > 2 && g.filled) out.push(l);
    if (g.w > 0) for (const p of G.strokeClosed(g.loops.filter(l => l.length > 1), g.w)) out.push(p);
  }
  return out;
}

// ---------- pad ----------
function padShape(pad, cx, cy, ang) {
  const shape = str(pad[3]);
  const sz = kid(pad, 'size');
  const w = sz ? parseFloat(str(sz[1])) : 0, h = sz ? parseFloat(str(sz[2] ?? sz[1])) : w;
  switch (shape) {
    case 'circle': return [G.circle(cx, cy, w / 2)];
    case 'rect': return [G.rectPoly(cx, cy, w, h, ang)];
    case 'oval': return [G.oval(cx, cy, w, h, ang)];
    case 'roundrect': {
      const ratio = num(pad, 'roundrect_rratio', 1, 0.25);
      const ch = kid(pad, 'chamfer');
      if (ch && ch.length > 1) {
        const cr = num(pad, 'chamfer_ratio', 1, 0.2);
        const set = new Set(ch.slice(1).map(str));
        // KiCad top = -y (dolů v souboru) -> po převrácení Y je to +y
        const corners = { tl: set.has('top_left'), tr: set.has('top_right'), bl: set.has('bottom_left'), br: set.has('bottom_right') };
        return [pos(G.placePoly(G.chamferRectLocal(w, h, cr * Math.min(w, h), corners), cx, cy, ang))];
      }
      return [G.roundRect(cx, cy, w, h, ratio * Math.min(w, h), ang)];
    }
    case 'trapezoid': {
      const d = kid(pad, 'rect_delta');
      const ddx = d ? parseFloat(str(d[1])) / 2 : 0, ddy = d ? parseFloat(str(d[2])) / 2 : 0;
      const dx = w / 2, dy = h / 2;
      // rohy podle KiCadu (Y dolů), převrátit Y
      const loc = [[-dx - ddy, dy + ddx], [dx + ddy, dy - ddx], [dx - ddy, -dy + ddx], [-dx + ddy, -dy - ddx]].map(([x, y]) => [x, -y]);
      return [pos(G.placePoly(loc, cx, cy, ang))];
    }
    case 'custom': {
      const opts = kid(pad, 'options');
      const anchor = opts ? str((kid(opts, 'anchor') || [])[1]) : 'circle';
      const out = [anchor === 'rect' ? G.rectPoly(cx, cy, w, h, ang) : G.circle(cx, cy, w / 2)];
      const prims = kid(pad, 'primitives');
      if (prims) {
        const tf = ([x, y]) => { const [u, v] = G.rot(x, y, ang); return [cx + u, cy + v]; };
        for (const pr of prims.slice(1)) {
          if (!Array.isArray(pr)) continue;
          const g = graphicToGeom(pr, tf);
          if (!g) continue;
          if (g.loops && name(pr) !== 'gr_circle' && !kid(pr, 'fill')) g.filled = true; // gr_poly v padu je plný
          if (name(pr) === 'gr_circle' && g.w === 0) g.filled = true;
          for (const p of geomToCopper(g)) out.push(p);
        }
      }
      return out;
    }
    default: return [G.circle(cx, cy, Math.max(w, h) / 2)];
  }
}

// ---------- hlavní převod ----------
export function loadKicad(text, fileName = 'deska.kicad_pcb') {
  const root = parseSexpr(text);
  if (!root || root[0] !== 'kicad_pcb') throw new Error('Soubor není deska KiCadu (.kicad_pcb).');
  const version = num(root, 'version', 1, 0);
  const warnings = [];
  const shapes = { 'F.Cu': { polys: [], tracks: new Map() }, 'B.Cu': { polys: [], tracks: new Map() } };
  const holes = [];
  const pads = [];
  const trackEnds = { 'F.Cu': [], 'B.Cu': [] }; // pro kontrolu pájení shora
  const zonesFill = { 'F.Cu': [], 'B.Cu': [] };
  const vias = [];
  const edgeLines = [], edgeLoops = [];
  let copperText = 0, unfilledZones = 0;
  const layerUse = { 'F.Cu': 0, 'B.Cu': 0 };

  // tabulka sítí ze starých formátů (net 3 "GND")
  const netTable = new Map();
  for (const n of kids(root, 'net')) if (n.length >= 3) netTable.set(str(n[1]), str(n[2]));
  const netOf = node => {
    const k = kid(node, 'net'); if (!k) return '';
    if (k.length >= 3) return str(k[2]);
    const v = str(k[1]);
    return netTable.has(v) ? netTable.get(v) : v;
  };
  const addTrack = (layer, pts, w, net) => {
    if (!shapes[layer]) return;
    const key = w.toFixed(4);
    if (!shapes[layer].tracks.has(key)) shapes[layer].tracks.set(key, { w, lines: [] });
    shapes[layer].tracks.get(key).lines.push(pts);
    trackEnds[layer].push({ p: pts[0], net, w }, { p: pts[pts.length - 1], net, w });
    layerUse[layer]++;
  };
  const other = {}; // vrstva -> {lines:[], loops:[]} pro frézování další geometrie
  // potisk (F.SilkS / B.SilkS): čáry, tvary a texty – pro gravírování a export pro laser
  const silk = { 'F.SilkS': { lines: [], loops: [], texts: [] }, 'B.SilkS': { lines: [], loops: [], texts: [] } };
  const padPolys = { 'F.Cu': [], 'B.Cu': [] }; // plošky a průchody (potisk se jim vyhne)
  const SILK = { 'F.SilkS': 'F.SilkS', 'B.SilkS': 'B.SilkS', 'F.Silkscreen': 'F.SilkS', 'B.Silkscreen': 'B.SilkS' };
  // proměnné textů z rohového razítka (${TITLE}, ${REVISION}, ${COMMENT1} …)
  const tb = kid(root, 'title_block') || [];
  const tvar = { TITLE: str((kid(tb, 'title') || [])[1]) || '', REVISION: str((kid(tb, 'rev') || [])[1]) || '', COMPANY: str((kid(tb, 'company') || [])[1]) || '', ISSUE_DATE: str((kid(tb, 'date') || [])[1]) || '', CURRENT_DATE: new Date().toISOString().slice(0, 10) };
  for (const c of kids(tb, 'comment')) tvar['COMMENT' + str(c[1])] = str(c[2]) || '';
  const vars = t => String(t).replace(/\$\{([A-Z0-9_]+)\}/g, (m, k) => tvar[k] ?? '').replace(/^\s+|\s+$/g, '');
  const textOf = (node, value, tfPos, fpAngle) => {
    value = vars(value);
    const lay = SILK[str((kid(node, 'layer') || [])[1])];
    if (!lay) return;
    const eff = kid(node, 'effects') || [];
    const hidden = node.some(c => c === 'hide') || (kid(node, 'hide') && str(kid(node, 'hide')[1]) !== 'no') || eff.some(c => c === 'hide') || (kid(eff, 'hide') && str(kid(eff, 'hide')[1]) !== 'no');
    if (hidden || !value) return;
    const font = kid(eff, 'font') || [];
    const size = kid(font, 'size');
    const h = size ? parseFloat(str(size[1])) : 1, w = size ? parseFloat(str(size[2] ?? size[1])) : h;
    const th = kid(font, 'thickness') ? parseFloat(str(kid(font, 'thickness')[1])) : h * 0.15;
    const just = (kid(eff, 'justify') || []).slice(1).map(str);
    const a = at(node);
    const [x, y] = tfPos ? tfPos([a.x, a.y]) : [a.x, a.y];
    let ang = a.a;
    if (fpAngle !== undefined) { const n = ((ang % 360) + 360) % 360; if (n > 90 && n <= 270) ang -= 180; } // texty pouzder čitelně
    silk[lay].texts.push({ text: value, x, y, angle: ang, h, w, thick: th, justify: just, mirror: just.includes('mirror') });
  };
  const OTHER_SKIP = /\.(Paste|Mask|Adhes|Adhesive|CrtYd|Courtyard)$/;
  const addGraphic = (node, tf, fromFootprint) => {
    const lay = str((kid(node, 'layer') || [])[1]);
    if (SILK[lay]) { const g = graphicToGeom(node, tf); if (g?.lines) silk[SILK[lay]].lines.push(...g.lines); if (g?.loops) silk[SILK[lay]].loops.push(...g.loops); }
    if (lay && lay !== 'Edge.Cuts' && !COPPER.includes(lay) && !OTHER_SKIP.test(lay)) {
      // grafika pouzder jen z uživatelských vrstev (ne Fab/Silk – tam jsou obrysy součástek)
      if (!fromFootprint || /^(User|Dwgs|Cmts|Eco)/.test(lay)) {
        const g = graphicToGeom(node, tf);
        if (g) {
          if (!other[lay]) other[lay] = { lines: [], loops: [] };
          if (g.lines) for (const l of g.lines) other[lay].lines.push(l);
          if (g.loops) for (const l of g.loops) if (l.length > 2) other[lay].loops.push(l);
        }
      }
      return;
    }
    if (lay === 'Edge.Cuts') {
      const g = graphicToGeom(node, tf);
      if (g?.lines) for (const l of g.lines) edgeLines.push(l);
      if (g?.loops) for (const l of g.loops) edgeLoops.push(l);
    } else if (COPPER.includes(lay)) {
      for (const p of geomToCopper(graphicToGeom(node, tf))) shapes[lay].polys.push(p);
      layerUse[lay]++;
    }
  };
  const ident = p => p;

  let aux = null;
  const setup = kid(root, 'setup');
  if (setup) { const a = pt(setup, 'aux_axis_origin'); if (a) aux = a; }

  for (const node of root.slice(1)) {
    if (!Array.isArray(node)) continue;
    const nm = node[0];
    if (nm === 'segment') {
      const lay = str((kid(node, 'layer') || [])[1]);
      addTrack(lay, [pt(node, 'start'), pt(node, 'end')], num(node, 'width'), netOf(node));
    } else if (nm === 'arc') {
      const lay = str((kid(node, 'layer') || [])[1]);
      addTrack(lay, G.arc3Pts(pt(node, 'start'), pt(node, 'mid'), pt(node, 'end')), num(node, 'width'), netOf(node));
    } else if (nm === 'via') {
      const p = at(node), size = num(node, 'size'), drill = num(node, 'drill');
      let lays = layersOf(node);
      if (str(node[1]) === 'blind' || str(node[1]) === 'micro') warnings.push({ level: 'warn', text: 'Slepé/mikro průchody nejsou doma vyrobitelné – beru je jako běžné.' });
      lays = copperLayers(lays.length ? (lays.length === 2 ? ['F.Cu', 'B.Cu'] : lays) : ['F.Cu', 'B.Cu']);
      for (const l of lays) { shapes[l].polys.push(G.circle(p.x, p.y, size / 2)); padPolys[l]?.push(G.circle(p.x, p.y, size / 2)); }
      const net = netOf(node);
      holes.push({ x: p.x, y: p.y, d: drill, plated: true, kind: 'via', ref: 'via', net });
      vias.push({ x: p.x, y: p.y, net });
    } else if (nm === 'zone') {
      const fps = kids(node, 'filled_polygon');
      const isRule = !!kid(node, 'keepout');
      const net = netOf(node);
      const zl = copperLayers(layersOf(node));
      if (!fps.length && !isRule && zl.length && kid(node, 'fill') && kid(node, 'polygon')) {
        const f = kid(node, 'fill'); if (str(f[1]) === 'yes' || f.length > 1) unfilledZones++;
      }
      for (const fp of fps) {
        const lay = str((kid(fp, 'layer') || [])[1]) || zl[0];
        if (!shapes[lay]) continue;
        const poly = ptsList(fp);
        if (poly.length > 2) { shapes[lay].polys.push(poly); zonesFill[lay].push({ poly, net }); layerUse[lay]++; }
      }
    } else if (nm.startsWith('gr_')) {
      if (nm === 'gr_text' || nm === 'gr_text_box') {
        const lay = str((kid(node, 'layer') || [])[1]);
        if (COPPER.includes(lay)) copperText++;
        if (nm === 'gr_text') textOf(node, str(node[1]));
        continue;
      }
      addGraphic(node, ident);
    } else if (nm === 'footprint' || nm === 'module') {
      const fa = at(node);
      const tf = ([x, y]) => { const [u, v] = G.rot(x, y, fa.a); return [fa.x + u, fa.y + v]; };
      let ref = '';
      for (const pr of kids(node, 'property')) if (str(pr[1]) === 'Reference') ref = str(pr[2]);
      if (!ref) for (const t of kids(node, 'fp_text')) if (str(t[1]) === 'reference') ref = str(t[2]);
      let value = '';
      for (const pr of kids(node, 'property')) if (str(pr[1]) === 'Value') value = str(pr[2]);
      if (!value) for (const t of kids(node, 'fp_text')) if (str(t[1]) === 'value') value = str(t[2]);
      const subst = t => String(t).replace(/\$\{REFERENCE\}/g, ref).replace(/\$\{VALUE\}/g, value);
      for (const pr of kids(node, 'property')) if (kid(pr, 'layer')) textOf(pr, subst(str(pr[2])), tf, fa.a);
      for (const t of kids(node, 'fp_text')) textOf(t, subst(str(t[2])), tf, fa.a);
      const fpLayer = str((kid(node, 'layer') || [])[1]);
      for (const ch of node) {
        if (!Array.isArray(ch)) continue;
        if (ch[0] === 'pad') {
          const type = str(ch[2]);
          const pa = at(ch);
          const [cx, cy] = tf([pa.x, pa.y]);
          // KiCad ukládá úhel padu absolutně (včetně natočení pouzdra)
          const ang = pa.a;
          const lays = copperLayers(layersOf(ch));
          const sz = kid(ch, 'size');
          const pw = sz ? parseFloat(str(sz[1])) : 0, ph = sz ? parseFloat(str(sz[2] ?? sz[1])) : pw;
          const dr = kid(ch, 'drill');
          let drill = null;
          if (dr && (type === 'thru_hole' || type === 'np_thru_hole')) {
            let k = 1, ovalD = false;
            if (str(dr[1]) === 'oval') { ovalD = true; k = 2; }
            const dw = parseFloat(str(dr[k])), dh = ovalD && dr[k + 1] !== undefined && !Array.isArray(dr[k + 1]) ? parseFloat(str(dr[k + 1])) : dw;
            const off = kid(dr, 'offset');
            let ox = 0, oy = 0;
            if (off) { ox = parseFloat(str(off[1])); oy = -parseFloat(str(off[2])); }
            const [rx, ry] = G.rot(ox, oy, ang);
            drill = { x: cx + rx, y: cy + ry, w: dw, h: dh };
          }
          const npthNoCopper = type === 'np_thru_hole' && drill && Math.max(pw, ph) <= Math.max(drill.w, drill.h) + 0.01;
          const padNet = netOf(ch);
          const num_ = str(ch[1]);
          if (!npthNoCopper) {
            const poly = padShape(ch, cx, cy, ang);
            for (const l of lays) for (const p of poly) { shapes[l].polys.push(p); padPolys[l]?.push(p); }
          }
          if (type === 'thru_hole' || type === 'np_thru_hole' || type === 'smd' || type === 'connect') {
            pads.push({ ref, pad: num_, x: cx, y: cy, w: pw, h: ph, ang, layers: lays, tht: type === 'thru_hole', net: padNet, fpLayer });
          }
          if (drill && drill.w > 0) {
            const h = { x: drill.x, y: drill.y, d: Math.min(drill.w, drill.h), plated: type === 'thru_hole', kind: type === 'thru_hole' ? 'pad' : 'npth', ref: ref + (num_ ? '.' + num_ : ''), net: padNet };
            if (Math.abs(drill.w - drill.h) > 1e-6) {
              const len = Math.abs(drill.w - drill.h) / 2;
              const along = drill.w > drill.h ? G.rot(len, 0, ang) : G.rot(0, len, ang);
              h.slot = { x1: drill.x - along[0], y1: drill.y - along[1], x2: drill.x + along[0], y2: drill.y + along[1] };
            }
            holes.push(h);
          }
        } else if (typeof ch[0] === 'string' && ch[0].startsWith('fp_') && ch[0] !== 'fp_text') {
          addGraphic(['gr_' + ch[0].slice(3), ...ch.slice(1)], tf, true);
        } else if (ch[0] === 'fp_text') {
          const lay = str((kid(ch, 'layer') || [])[1]);
          if (COPPER.includes(lay) && !kid(ch, 'hide') && !(kid(ch, 'effects') && kid(kid(ch, 'effects'), 'hide'))) copperText++;
        } else if (ch[0] === 'zone') {
          for (const fp of kids(ch, 'filled_polygon')) {
            const lay = str((kid(fp, 'layer') || [])[1]);
            if (shapes[lay]) shapes[lay].polys.push(ptsList(fp));
          }
        }
      }
    }
  }

  if (copperText) warnings.push({ level: 'warn', text: `Text na mědi (${copperText}×) se nenačítá – frézou by ho stejně nešlo udělat čitelně.` });
  if (unfilledZones) warnings.push({ level: 'error', text: `Zóna mědi není vylitá (${unfilledZones}×). V KiCadu dej „Vylít všechny zóny“ (B) a ulož.` });

  // sjednocení mědi po vrstvách
  const copper = {};
  for (const l of COPPER) {
    const parts = shapes[l].polys.slice();
    for (const { w, lines } of shapes[l].tracks.values()) for (const p of G.strokeOpen(lines, w)) parts.push(p);
    copper[l] = parts.length ? G.union(parts) : [];
  }

  // měď, které se má gravírovaný potisk vyhnout: plošky (+ průchody) a spoje
  const silkAvoid = { pads: {}, tracks: {} };
  for (const l of COPPER) {
    silkAvoid.pads[l] = padPolys[l].length ? G.union(padPolys[l]) : [];
    const tr = [];
    for (const { w, lines } of shapes[l].tracks.values()) for (const p of G.strokeOpen(lines, w)) tr.push(p);
    silkAvoid.tracks[l] = tr.length ? G.union(tr) : [];
  }
  return {
    source: 'kicad', fileName, version, silkAvoid,
    name: fileName.replace(/\.kicad_pcb$/i, ''),
    copper, holes, pads, vias, trackEnds, zonesFill, layerUse,
    edge: { lines: edgeLines, loops: edgeLoops }, other, silk,
    aux, warnings,
  };
}
