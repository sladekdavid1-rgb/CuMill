// Gerber RS-274X (vč. maker a polarity) a Excellon. Výstup v mm, Y nahoru.
import * as G from './geom.js';

// ---------- výrazy v makrech ----------
function evalExpr(src, vars) {
  const s = src.replace(/\s+/g, '').replace(/[xX]/g, '*');
  let i = 0;
  const peek = () => s[i];
  function prim() {
    if (peek() === '(') { i++; const v = expr(); i++; return v; }
    if (peek() === '-') { i++; return -prim(); }
    if (peek() === '+') { i++; return prim(); }
    if (peek() === '$') {
      i++; let j = i; while (/[0-9]/.test(s[j])) j++;
      const v = vars[parseInt(s.slice(i, j))] ?? 0; i = j; return v;
    }
    let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
    const v = parseFloat(s.slice(i, j)); i = j; return isNaN(v) ? 0 : v;
  }
  function term() { let v = prim(); while (peek() === '*' || peek() === '/') { const o = s[i++]; const r = prim(); v = o === '*' ? v * r : v / r; } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  return expr();
}

function macroShapes(macro, params) {
  const vars = {}; params.forEach((v, k) => vars[k + 1] = v);
  const dark = [], clear = [];
  for (const raw of macro) {
    const st = raw.trim();
    if (!st || /^0(\s|$)/.test(st)) continue;
    if (st.startsWith('$')) { const m = st.match(/^\$(\d+)=(.*)$/); if (m) vars[parseInt(m[1])] = evalExpr(m[2], vars); continue; }
    const a = st.split(',').map(t => evalExpr(t, vars));
    const code = a[0];
    let poly = [], exp = 1;
    if (code === 1) { // kruh: exp, průměr, x, y[, rot]
      exp = a[1]; const [x, y] = G.rot(a[3], a[4], a[5] || 0); poly = [G.circle(x, y, a[2] / 2)];
    } else if (code === 20 || code === 2) { // vektorová čára: exp, šířka, sx, sy, ex, ey, rot
      exp = a[1]; const w = a[2], r = a[7] || 0;
      const [sx, sy] = [a[3], a[4]], [ex, ey] = [a[5], a[6]];
      const ang = Math.atan2(ey - sy, ex - sx), nx = -Math.sin(ang) * w / 2, ny = Math.cos(ang) * w / 2;
      poly = [[[sx + nx, sy + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [sx - nx, sy - ny]].map(([x, y]) => G.rot(x, y, r))];
    } else if (code === 21) { // středový obdélník: exp, w, h, cx, cy, rot
      exp = a[1]; const r = a[6] || 0;
      poly = [G.rectPoly(0, 0, a[2], a[3], 0).map(([x, y]) => G.rot(x + a[4], y + a[5], r))];
    } else if (code === 22) { // starý: levý dolní roh
      exp = a[1]; const r = a[6] || 0;
      poly = [[[0, 0], [a[2], 0], [a[2], a[3]], [0, a[3]]].map(([x, y]) => G.rot(x + a[4], y + a[5], r))];
    } else if (code === 4) { // obrys: exp, n, x0, y0, ..., rot
      exp = a[1]; const n = a[2]; const pts = [];
      for (let k = 0; k <= n; k++) pts.push([a[3 + 2 * k], a[4 + 2 * k]]);
      const r = a[3 + 2 * (n + 1)] || 0;
      poly = [G.dedupe(pts.map(([x, y]) => G.rot(x, y, r)), true)];
    } else if (code === 5) { // pravidelný mnohoúhelník: exp, n, cx, cy, průměr, rot
      exp = a[1]; const n = a[2], r = a[6] || 0, pts = [];
      for (let k = 0; k < n; k++) { const t = 2 * Math.PI * k / n; pts.push(G.rot(a[3] + a[5] / 2 * Math.cos(t), a[4] + a[5] / 2 * Math.sin(t), r)); }
      poly = [pts.map(([x, y]) => G.rot(x, y, r))];
    } else if (code === 7) { // termál: cx, cy, vnější, vnitřní, mezera, rot
      const [cx, cy, od, id, gap, r] = a.slice(1);
      const ring = G.difference([G.circle(cx, cy, od / 2)], [G.circle(cx, cy, id / 2)]);
      const cross = [G.rectPoly(cx, cy, od * 1.2, gap, 0), G.rectPoly(cx, cy, gap, od * 1.2, 0)];
      poly = G.difference(ring, cross).map(p => p.map(([x, y]) => G.rot(x, y, r || 0)));
    } else if (code === 6) { // moiré – jen vnější kruh
      poly = [G.circle(a[1], a[2], a[3] / 2)];
    } else continue;
    // jednoduché tvary vždy CCW, jinak by se v NonZero sjednocení navzájem rušily
    poly = poly.map(pp => G.area(pp) < 0 ? pp.slice().reverse() : pp);
    (exp === 0 ? clear : dark).push(...poly);
  }
  let res = G.union(dark);
  if (clear.length) res = G.difference(res, clear);
  return res;
}

// tvar clony umístěný do bodu (flash)
function apertureAt(ap, x, y) {
  return ap.shape.map(p => p.map(([u, v]) => [u + x, v + y]));
}
function makeAperture(type, params, macros) {
  let shape, dia = 0;
  if (type === 'C') { dia = params[0]; shape = [G.circle(0, 0, dia / 2)]; }
  else if (type === 'R') { shape = [G.rectPoly(0, 0, params[0], params[1], 0)]; dia = Math.min(params[0], params[1]); }
  else if (type === 'O') { shape = [G.oval(0, 0, params[0], params[1], 0)]; dia = Math.min(params[0], params[1]); }
  else if (type === 'P') {
    const n = params[1], r = params[2] || 0, pts = [];
    for (let k = 0; k < n; k++) { const t = 2 * Math.PI * k / n + r * Math.PI / 180; pts.push([params[0] / 2 * Math.cos(t), params[0] / 2 * Math.sin(t)]); }
    shape = [pts]; dia = params[0];
  } else if (macros[type]) { shape = macroShapes(macros[type], params); }
  else { shape = [G.circle(0, 0, 0.1)]; }
  // otvor v cloně (nepodstatné pro frézování mědi) se ignoruje
  return { type, params, shape, dia };
}

export function parseGerber(text, opts = {}) {
  const warnings = [];
  const toMM = { v: 1 };
  let fmt = { xi: 4, xd: 6, yi: 4, yd: 6, zeros: 'L' };
  const apertures = {}, macros = {};
  let cur = null, x = 0, y = 0, interp = 1, multiQuad = true, region = false, regionPts = [], regionContours = [];
  let polarity = 'D';
  const layers = []; // [{pol, shapes:[]}]
  let current = { pol: 'D', shapes: [], strokes: new Map() };
  layers.push(current);
  const centerLines = []; // pro obrys desky
  let fileFunction = '';
  let stepRepeat = false;

  const coord = (s, axis) => {
    if (s.includes('.')) return parseFloat(s) * toMM.v;
    const dec = axis === 'x' ? fmt.xd : fmt.yd, int = axis === 'x' ? fmt.xi : fmt.yi;
    let neg = false; if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
    if (fmt.zeros === 'T') s = s.padEnd(int + dec, '0');
    const v = parseInt(s, 10) / Math.pow(10, dec);
    return (neg ? -v : v) * toMM.v;
  };
  const addStroke = (pts) => {
    if (!cur) return;
    centerLines.push(pts);
    const ap = apertures[cur];
    if (!ap) return;
    if (ap.type === 'C' || ap.type === 'O' && Math.abs(ap.params[0] - ap.params[1]) < 1e-9) {
      const key = ap.dia.toFixed(5);
      if (!current.strokes.has(key)) current.strokes.set(key, { w: ap.dia, lines: [] });
      current.strokes.get(key).lines.push(pts);
    } else {
      // jiná clona tažená po čáře: obálka tvaru v každém úseku
      for (let k = 1; k < pts.length; k++) {
        const s = apertureAt(ap, pts[k - 1][0], pts[k - 1][1]).flat(), e = apertureAt(ap, pts[k][0], pts[k][1]).flat();
        current.shapes.push(G.convexHull(s.concat(e)));
      }
    }
  };
  const setPolarity = (p) => {
    if (p === polarity) return;
    polarity = p; current = { pol: p, shapes: [], strokes: new Map() }; layers.push(current);
  };

  // rozdělení na příkazy: rozšířené %...% a běžné ...*
  const tokens = text.match(/%[^%]*%|[^*%]+\*/g) || [];
  for (let raw of tokens) {
    raw = raw.trim();
    if (raw.startsWith('%')) {
      const body = raw.slice(1, -1);
      const blocks = body.split('*').map(s => s.trim()).filter(Boolean);
      const head = blocks[0] || '';
      if (head.startsWith('FS')) {
        const m = head.match(/FS([LTD])?([AI])?.*X(\d)(\d)Y(\d)(\d)/);
        if (m) fmt = { zeros: m[1] === 'T' ? 'T' : 'L', xi: +m[3], xd: +m[4], yi: +m[5], yd: +m[6] };
      } else if (head.startsWith('MO')) {
        toMM.v = head.includes('IN') ? 25.4 : 1;
      } else if (head.startsWith('AM')) {
        macros[head.slice(2)] = blocks.slice(1);
      } else if (head.startsWith('AD')) {
        const m = head.match(/^ADD(\d+)([A-Za-z_$.][^,]*?)(?:,(.*))?$/);
        if (m) {
          const isMacro = !!macros[m[2]];
          const params = m[3] ? m[3].split('X').map(v => parseFloat(v) * (isMacro ? 1 : toMM.v)) : [];
          const ap = makeAperture(m[2], params, macros);
          // makro počítá v jednotkách souboru – výsledný tvar přepočítat
          if (isMacro && toMM.v !== 1) ap.shape = ap.shape.map(pp => pp.map(([u, v]) => [u * toMM.v, v * toMM.v]));
          apertures['D' + m[1]] = ap;
        }
      } else if (head.startsWith('LP')) {
        setPolarity(head[2] === 'C' ? 'C' : 'D');
      } else if (head.startsWith('TF')) {
        if (head.includes('FileFunction')) fileFunction = head;
      } else if (head.startsWith('SR')) {
        if (/X[2-9]|Y[2-9]/.test(head)) stepRepeat = true;
      } else if (head.startsWith('LM') || head.startsWith('LR') || head.startsWith('LS')) {
        if (!/LMN|LR0|LS1/.test(head)) warnings.push('Gerber používá zrcadlení/otočení/měřítko (LM/LR/LS) – není podporováno.');
      }
      continue;
    }
    let cmd = raw.slice(0, -1);
    if (cmd.startsWith('G04') || !cmd) continue;
    if (cmd === 'M02' || cmd === 'M00' || cmd === 'M01') continue;
    // G kódy
    let m;
    while ((m = cmd.match(/^G0*(\d+)/))) {
      const g = +m[1];
      if (g === 1) interp = 1; else if (g === 2) interp = 2; else if (g === 3) interp = 3;
      else if (g === 74) multiQuad = false; else if (g === 75) multiQuad = true;
      else if (g === 36) { region = true; regionPts = []; regionContours = []; }
      else if (g === 37) {
        if (regionPts.length > 2) regionContours.push(regionPts);
        // kontury jedné oblasti = jeden útvar (sudo-liché uvnitř oblasti)
        if (regionContours.length) for (const p of G.union(regionContours, 'evenodd')) current.shapes.push(p);
        region = false; regionPts = []; regionContours = [];
      } else if (g === 70) toMM.v = 25.4; else if (g === 71) toMM.v = 1;
      else if (g === 54 || g === 55) { /* výběr clony následuje */ }
      cmd = cmd.slice(m[0].length);
    }
    if (!cmd) continue;
    if (/^D(\d+)$/.test(cmd) && +cmd.slice(1) >= 10) { cur = cmd; continue; }
    const cm = cmd.match(/^(?:X([+-]?[\d.]+))?(?:Y([+-]?[\d.]+))?(?:I([+-]?[\d.]+))?(?:J([+-]?[\d.]+))?(?:D0*([123]))?$/);
    if (!cm) continue;
    const nx = cm[1] !== undefined ? coord(cm[1], 'x') : x;
    const ny = cm[2] !== undefined ? coord(cm[2], 'y') : y;
    const ci = cm[3] !== undefined ? coord(cm[3], 'x') : 0;
    const cj = cm[4] !== undefined ? coord(cm[4], 'y') : 0;
    const d = cm[5] ? +cm[5] : (cm[1] !== undefined || cm[2] !== undefined ? 1 : 0);
    if (d === 2) {
      if (region && regionPts.length > 2) regionContours.push(regionPts);
      if (region) regionPts = [[nx, ny]];
    } else if (d === 1) {
      let pts;
      if (interp === 1) pts = [[x, y], [nx, ny]];
      else {
        let cx, cy;
        if (multiQuad) { cx = x + ci; cy = y + cj; }
        else { // jednokvadrantový: vyber střed se stejným poloměrem
          let best = null;
          for (const sx of [1, -1]) for (const sy of [1, -1]) {
            const ccx = x + sx * Math.abs(ci), ccy = y + sy * Math.abs(cj);
            const err = Math.abs(Math.hypot(x - ccx, y - ccy) - Math.hypot(nx - ccx, ny - ccy));
            const a0 = Math.atan2(y - ccy, x - ccx), a1 = Math.atan2(ny - ccy, nx - ccx);
            let sw = a1 - a0; if (interp === 3) { while (sw <= 0) sw += 2 * Math.PI; } else { while (sw >= 0) sw -= 2 * Math.PI; }
            if (Math.abs(sw) <= Math.PI / 2 + 1e-6 && (!best || err < best.err)) best = { err, cx: ccx, cy: ccy };
          }
          cx = best ? best.cx : x + ci; cy = best ? best.cy : y + cj;
        }
        const r = Math.hypot(x - cx, y - cy);
        const a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx);
        let sw = a1 - a0;
        if (interp === 3) { while (sw <= 1e-9) sw += 2 * Math.PI; } else { while (sw >= -1e-9) sw -= 2 * Math.PI; }
        if (Math.hypot(nx - x, ny - y) < 1e-7 && multiQuad) sw = interp === 3 ? 2 * Math.PI : -2 * Math.PI;
        pts = G.arcPts(cx, cy, r, a0, sw);
        pts[pts.length - 1] = [nx, ny];
      }
      if (region) { if (!regionPts.length) regionPts = [[x, y]]; for (const q of pts.slice(1)) regionPts.push(q); }
      else addStroke(pts);
    } else if (d === 3) {
      const ap = apertures[cur];
      if (ap) for (const p of apertureAt(ap, nx, ny)) current.shapes.push(p);
    }
    x = nx; y = ny;
  }
  if (stepRepeat) warnings.push('Gerber používá opakování (step & repeat) – načtena jen první kopie.');

  // složení vrstev podle polarity
  let result = [];
  const build = (L) => {
    const parts = L.shapes.slice();
    for (const { w, lines } of L.strokes.values()) for (const p of G.strokeOpen(lines, w)) parts.push(p);
    return parts;
  };
  for (const L of layers) {
    const parts = build(L);
    if (!parts.length) continue;
    if (L.pol === 'D') result = result.length ? G.union(result.concat(parts)) : G.union(parts);
    else result = G.difference(result, parts);
  }
  return { polys: result, centerLines, fileFunction, warnings };
}

// ---------- Excellon ----------
export function parseExcellon(text) {
  const holes = [];
  const tools = {};
  let unit = 1, zeros = 'TZ', intD = 3, decD = 3, fmtSet = false;
  let tool = null, x = 0, y = 0, plated = null, header = true, rout = false, routStart = null, absolute = true;
  const lines = text.split(/\r?\n/);
  const num = (s, isX) => {
    if (s.includes('.')) return parseFloat(s) * unit;
    let neg = false; if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
    let v;
    if (zeros === 'TZ') v = parseInt(s, 10) / Math.pow(10, decD); // koncové nuly zachovány, úvodní vynechány
    else v = parseInt(s.padEnd(intD + decD, '0'), 10) / Math.pow(10, decD); // LZ: úvodní zachovány, koncové vynechány
    return (neg ? -v : v) * unit;
  };
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith(';')) {
      if (/Plated|PTH/i.test(line) && /TA\.AperFunction/.test(line)) plated = !/NonPlated|NPTH/i.test(line);
      const f = line.match(/FORMAT=\{?(\d):(\d)/); if (f) { intD = +f[1]; decD = +f[2]; fmtSet = true; }
      continue;
    }
    if (line === 'M48') { header = true; continue; }
    if (line === '%' || line === 'M95') { header = false; continue; }
    if (/^(METRIC|M71)/.test(line)) { unit = 1; if (!fmtSet) { intD = 3; decD = 3; } if (/TZ/.test(line)) zeros = 'TZ'; if (/LZ/.test(line)) zeros = 'LZ'; const f = line.match(/0+\.(0+)/); if (f) decD = f[1].length; continue; }
    if (/^(INCH|M72)/.test(line)) { unit = 25.4; if (!fmtSet) { intD = 2; decD = 4; } if (/TZ/.test(line)) zeros = 'TZ'; if (/LZ/.test(line)) zeros = 'LZ'; continue; }
    if (line === 'G90') { absolute = true; continue; }
    if (line === 'G91') { absolute = false; continue; }
    let m = line.match(/^T(\d+)(.*)$/);
    if (m) {
      const id = +m[1];
      const c = m[2].match(/C([\d.]+)/);
      if (c) tools[id] = { d: parseFloat(c[1]) * unit, plated };
      tool = id;
      continue;
    }
    if (line === 'M15') { rout = true; continue; }
    if (line === 'M16' || line === 'M17') { rout = false; routStart = null; continue; }
    if (/^G0?0(?!\d)/.test(line)) { // pojezd v režimu frézování drážky
      const xm = line.match(/X([+-]?[\d.]+)/), ym = line.match(/Y([+-]?[\d.]+)/);
      if (xm) x = num(xm[1]); if (ym) y = num(ym[1]);
      routStart = [x, y];
      continue;
    }
    const slot = line.match(/^(.*?)G85(.*)$/);
    const parsePt = (s, px, py) => {
      const xm = s.match(/X([+-]?[\d.]+)/), ym = s.match(/Y([+-]?[\d.]+)/);
      let nx = xm ? num(xm[1]) : px, ny = ym ? num(ym[1]) : py;
      if (!absolute) { nx = px + (xm ? num(xm[1]) : 0); ny = py + (ym ? num(ym[1]) : 0); }
      return [nx, ny];
    };
    if (slot) {
      const a = parsePt(slot[1], x, y), b = parsePt(slot[2], a[0], a[1]);
      const t = tools[tool];
      if (t) holes.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, d: t.d, plated: t.plated !== false, slot: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, kind: 'pad' });
      x = b[0]; y = b[1];
      continue;
    }
    if (/^(G01)?X|^(G01)?Y/.test(line)) {
      const [nx, ny] = parsePt(line.replace(/^G01/, ''), x, y);
      const t = tools[tool];
      if (rout && routStart && /^G01/.test(line) && t) {
        holes.push({ x: (routStart[0] + nx) / 2, y: (routStart[1] + ny) / 2, d: t.d, plated: t.plated !== false, slot: { x1: routStart[0], y1: routStart[1], x2: nx, y2: ny }, kind: 'pad' });
      } else if (t && !rout) {
        holes.push({ x: nx, y: ny, d: t.d, plated: t.plated !== false, kind: t.plated === false ? 'npth' : 'pad' });
      }
      x = nx; y = ny;
    }
  }
  return holes;
}

// rozpoznání vrstvy podle názvu souboru / obsahu
export function classifyFile(name, text) {
  const n = name.toLowerCase();
  if (/\.(drl|xln|exc|txt|nc|tap)$/.test(n) && /^\s*(M48|;)/m.test(text.slice(0, 2000)) && !/%FS/.test(text.slice(0, 3000))) return 'drill';
  if (/\.drl$/.test(n)) return 'drill';
  const ff = (text.match(/%TF\.FileFunction,([^*%]*)/) || [])[1] || '';
  if (/^Copper,L1,Top/i.test(ff)) return 'F.Cu';
  if (/^Copper,L\d+,Bot/i.test(ff)) return 'B.Cu';
  if (/^Profile/i.test(ff)) return 'Edge.Cuts';
  if (ff) return 'other';
  if (/f[._-]cu|\.gtl$|top.?copper|copper.?top/.test(n)) return 'F.Cu';
  if (/b[._-]cu|\.gbl$|bottom.?copper|copper.?bot/.test(n)) return 'B.Cu';
  if (/edge[._-]cuts|\.gko$|\.gm1$|\.gml$|outline|profile/.test(n)) return 'Edge.Cuts';
  return 'other';
}
