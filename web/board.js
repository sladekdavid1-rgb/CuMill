// Společné zpracování načtené desky: obrys z Edge.Cuts, rozměry, statistiky.
import * as G from './geom.js';

const TOL = 0.02;
// spojí úseky obrysu do uzavřených smyček
export function chainEdges(lines, loops) {
  const out = loops.filter(l => l.length > 2).map(l => G.dedupe(l, true));
  const segs = lines.filter(l => l.length > 1).map(l => l.slice());
  const near = (a, b) => Math.abs(a[0] - b[0]) < TOL && Math.abs(a[1] - b[1]) < TOL;
  const open = [];
  while (segs.length) {
    let cur = segs.pop();
    let grown = true;
    while (grown) {
      grown = false;
      if (near(cur[0], cur[cur.length - 1]) && cur.length > 2) break;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const e = cur[cur.length - 1], b = cur[0];
        if (near(e, s[0])) cur = cur.concat(s.slice(1));
        else if (near(e, s[s.length - 1])) cur = cur.concat(s.slice(0, -1).reverse());
        else if (near(b, s[s.length - 1])) cur = s.slice(0, -1).concat(cur);
        else if (near(b, s[0])) cur = s.slice(1).reverse().concat(cur);
        else continue;
        segs.splice(i, 1); grown = true; break;
      }
    }
    if (cur.length > 2 && near(cur[0], cur[cur.length - 1])) out.push(G.dedupe(cur, true));
    else open.push(cur);
  }
  return { loops: out, open };
}

// dokončí desku: obrys, plocha desky, rozměry, varování
export function finalizeBoard(b) {
  if (b.panelParts) return finalizePanel(b);
  const { loops, open } = chainEdges(b.edge.lines, b.edge.loops);
  if (open.length) b.warnings.push({ level: 'error', text: `Obrys desky (Edge.Cuts) není uzavřený – ${open.length} volných konců. Beru obdélník kolem mědi.` });
  let outline = null, inner = [];
  if (loops.length) {
    const sorted = loops.slice().sort((a, c) => Math.abs(G.area(c)) - Math.abs(G.area(a)));
    outline = sorted[0];
    // vnitřní smyčky = výřezy uvnitř hlavního obrysu
    for (const l of sorted.slice(1)) {
      const [x, y] = l[0];
      if (G.pointInPoly(x, y, outline)) inner.push(l); else b.warnings.push({ level: 'warn', text: 'Obrys obsahuje smyčku mimo hlavní desku – ignoruji ji.' });
    }
  }
  if (!outline) {
    const bb = G.bbox([...b.copper['F.Cu'], ...b.copper['B.Cu']]);
    if (G.bbValid(bb)) {
      const m = 1;
      outline = [[bb.minX - m, bb.minY - m], [bb.maxX + m, bb.minY - m], [bb.maxX + m, bb.maxY + m], [bb.minX - m, bb.maxY + m]];
      if (!b.edge.lines.length && !b.edge.loops.length) b.warnings.push({ level: 'warn', text: 'Deska nemá obrys (Edge.Cuts) – ořez jde podle obdélníku kolem mědi + 1 mm.' });
    } else {
      outline = [[0, 0], [10, 0], [10, 10], [0, 10]];
    }
  }
  if (G.area(outline) < 0) outline = outline.slice().reverse();
  inner = inner.map(l => G.area(l) > 0 ? l.slice().reverse() : l);
  b.outline = outline;
  b.outlines = [outline];
  b.inner = inner;
  b.bb = G.bbox([outline]);
  return finishBoard(b);
}
// panel: víc samostatných obrysů (každá deska svůj), výřezy všech desek
function finalizePanel(b) {
  b.outlines = b.panelParts.map(p => G.area(p.outer) < 0 ? p.outer.slice().reverse() : p.outer);
  b.outline = b.outlines[0];
  b.inner = b.panelParts.flatMap(p => p.inner).map(l => G.area(l) > 0 ? l.slice().reverse() : l);
  b.bb = G.bbox(b.outlines);
  return finishBoard(b);
}
function finishBoard(b) {
  b.size = { w: b.bb.maxX - b.bb.minX, h: b.bb.maxY - b.bb.minY };
  b.hasCopper = { 'F.Cu': b.copper['F.Cu'].length > 0, 'B.Cu': b.copper['B.Cu'].length > 0 };
  // vrstva je „použitá“, má-li cesty/zóny; samotné pady THT na druhé straně jednostranné desky se nefrézují
  b.used = {};
  for (const l of ['F.Cu', 'B.Cu']) b.used[l] = b.layerUse ? b.layerUse[l] > 0 : b.hasCopper[l];
  if (!b.used['F.Cu'] && !b.used['B.Cu']) for (const l of ['F.Cu', 'B.Cu']) b.used[l] = b.hasCopper[l];
  // další geometrie z ostatních vrstev: uzavřené smyčky a otevřené čáry jako objekty
  b.geo = {};
  for (const [lay, g] of Object.entries(b.other || {})) {
    const { loops, open: op } = chainEdges(g.lines, g.loops);
    const objs = [];
    for (const l of loops) objs.push({ closed: true, pts: G.area(l) < 0 ? l.slice().reverse() : l });
    for (const l of op) if (l.length > 1) objs.push({ closed: false, pts: l });
    objs.forEach((o, i) => {
      o.layer = lay; o.bb = G.bbox([o.pts]);
      const cx = (o.bb.minX + o.bb.maxX) / 2, cy = (o.bb.minY + o.bb.maxY) / 2;
      o.key = `${lay}@${cx.toFixed(2)},${cy.toFixed(2)},${(o.bb.maxX - o.bb.minX).toFixed(2)}x${(o.bb.maxY - o.bb.minY).toFixed(2)}${o.closed ? '' : 'o'}`;
      o.id = lay + '#' + i;
    });
    if (objs.length) b.geo[lay] = objs;
  }
  // ostrůvky mědi
  b.islands = {};
  for (const l of ['F.Cu', 'B.Cu']) b.islands[l] = b.hasCopper[l] ? G.polyTree(b.copper[l]) : [];
  // síť každého ostrůvku (z padů, konců cest a průchodů uvnitř)
  for (const l of ['F.Cu', 'B.Cu']) {
    const probes = [];
    for (const p of b.pads || []) if (p.layers.includes(l) && p.net) probes.push([p.x, p.y, p.net]);
    for (const e of b.trackEnds?.[l] || []) if (e.net) probes.push([e.p[0], e.p[1], e.net]);
    for (const v of b.vias || []) if (v.net) probes.push([v.x, v.y, v.net]);
    for (const isl of b.islands[l]) {
      isl.bb = G.bbox([isl.outer]);
      isl.net = '';
      for (const [x, y, n] of probes) {
        if (x < isl.bb.minX || x > isl.bb.maxX || y < isl.bb.minY || y > isl.bb.maxY) continue;
        if (G.pointInPoly(x, y, isl.outer) && !isl.holes.some(h => G.pointInPoly(x, y, h))) { isl.net = n; break; }
      }
    }
  }
  return b;
}

export function emptyBoard(name) {
  return {
    source: 'gerber', fileName: name, name,
    copper: { 'F.Cu': [], 'B.Cu': [] }, holes: [], pads: [], vias: [],
    trackEnds: null, zonesFill: null,
    edge: { lines: [], loops: [] }, other: {}, aux: null, warnings: [],
  };
}
