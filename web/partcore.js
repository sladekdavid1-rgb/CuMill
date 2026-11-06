// Díl: jádro bez DOM – čtení programů z Fusionu 360 (postprocesor Grbl), příprava pro GRBL,
// limity nástrojů, kontroly a simulace úběru materiálu přes celou zakázku. Používá ho UI i worker.
import { parseGcode } from './gparse.js';
import { HeightSim, simTool } from './gsim.js';

const r2 = v => Math.round(v * 100) / 100;
const cz = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');

// ---------- hlavička Fusionu: (T1 D=6 CR=0 TAPER=45deg - ZMIN=-10 - flat end mill) ----------
const KIND_OF = s => {
  s = (s || '').toLowerCase();
  if (/ball/.test(s)) return 'ball';
  if (/chamfer|engrav|v-?bit|v mill|countersink|dovetail|spot/.test(s)) return 'v';
  if (/drill|reamer|tap\b|boring/.test(s)) return 'drill';
  return 'end'; // flat / bull nose / face / slot…
};
export function fusionTools(text) {
  const out = {};
  const re = /\(\s*T(\d+)\s+D=([\d.]+)\s+CR=([\d.]+)(?:\s+TAPER=([\d.]+)\s*deg)?(?:\s*-\s*ZMIN=(-?[\d.]+))?(?:\s*-\s*([^)]*))?\)/gi;
  for (const m of text.slice(0, 200000).matchAll(re)) {
    const n = +m[1], desc = (m[6] || '').trim(), kind = KIND_OF(desc), cr = +m[3];
    out[n] = { n, dia: +m[2], cr, taper: m[4] != null ? +m[4] : null, zmin: m[5] != null ? +m[5] : null, desc, kind: kind === 'end' && cr > 0 && Math.abs(cr - +m[2] / 2) < 1e-3 ? 'ball' : kind };
  }
  return out;
}
const TYPE_CZ = { end: 'fréza', ball: 'kulová fréza', v: 'V-fréza', drill: 'vrták' };
export const hdrLabel = h => h ? `T${h.n} ${TYPE_CZ[h.kind]} Ø${cz(h.dia)}${h.kind === 'v' && h.taper ? ` ${cz(h.taper * 2, 0)}°` : ''}${h.desc ? ` (${h.desc})` : ''}` : 'nástroj neuveden';

// ---------- příprava pro GRBL: M6 pryč, vrtací cykly rozepsat, nepodporované příkazy nahlásit ----------
const fmt = v => (Math.round(v * 10000) / 10000).toString();
export function prepGcode(src) {
  const lines = src.split(/\r?\n/), out = [], notes = [], errors = [], warns = [];
  let abs = true, x = 0, y = 0, z = 0, unit = 1, cyc = null, ret = 98, cycN = 0, m6 = 0;
  const P = { R: null, Z: null, Q: null, P: null, F: null }; let initZ = 0;
  const tools = new Set();
  const flag = (set, msg) => { if (!set.includes(msg)) set.push(msg); };
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const clean = raw.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').trim().toUpperCase();
    if (!clean) { out.push(raw); continue; }
    const words = clean.match(/[A-Z][-+]?(\d+\.?\d*|\.\d+)/g) || [];
    const gs = [], ms = [], w = {};
    for (const wd of words) { const k = wd[0], v = parseFloat(wd.slice(1)); if (k === 'G') gs.push(Math.round(v * 10) / 10); else if (k === 'M') ms.push(v); else if (k !== 'N') w[k] = v; }
    if (w.T !== undefined) tools.add(w.T);
    let line = raw;
    // výměna nástroje – GRBL M6 nezná; výměnu řídí průvodce KiMillu
    if (ms.includes(6)) { m6++; line = line.replace(/\bM0?6(?!\d)/gi, '').trim(); if (!line.replace(/\([^)]*\)/g, '').replace(/[TN]\d+/gi, '').trim()) line = `(${raw.replace(/[()]/g, '').trim()} – výměnu nástroje řídí KiMill)`; }
    // korekce poloměru a délky nástroje GRBL neumí
    if (gs.includes(41) || gs.includes(42)) flag(errors, `korekce poloměru nástroje G41/G42 (řádek ${li + 1}) – GRBL ji neumí, vypni ji v postprocesoru („Compensation type: In computer“)`);
    if (gs.includes(43)) flag(errors, `korekce délky nástroje G43 (řádek ${li + 1}) – GRBL zná jen G43.1`);
    if (gs.includes(28) || gs.includes(30)) flag(warns, `G28/G30 (řádek ${li + 1}) jede na polohu uloženou ve stroji – ověř ji, nebo ji v postprocesoru vypni`);
    if (gs.includes(64) || gs.includes(61.1)) { line = line.replace(/G6(4|1\.1)(?![\d.])/gi, '').trim(); flag(notes, 'G64 vynecháno (GRBL ho nezná)'); }
    if (gs.includes(98) || gs.includes(99)) { ret = gs.includes(99) ? 99 : 98; line = line.replace(/G9[89](?![\d.])/gi, '').trim(); }
    if (gs.includes(20)) unit = 25.4; if (gs.includes(21)) unit = 1;
    if (gs.includes(90)) abs = true; if (gs.includes(91)) abs = false;
    const cycG = gs.find(g => g === 81 || g === 82 || g === 83 || g === 73);
    if (gs.includes(80)) cyc = null;
    const motionG = gs.find(g => g === 0 || g === 1 || g === 2 || g === 3);
    if (cycG != null || (cyc && motionG == null && (w.X !== undefined || w.Y !== undefined))) {
      if (cycG != null) { cyc = cycG; initZ = z; }
      for (const k of ['R', 'Z', 'Q', 'P', 'F']) if (w[k] !== undefined) P[k] = w[k] * (k === 'P' ? 1 : unit);
      if (!abs) { flag(errors, `vrtací cyklus v přírůstkových souřadnicích G91 (řádek ${li + 1}) – nejde rozepsat`); out.push(line); continue; }
      const nx = w.X !== undefined ? w.X * unit : x, ny = w.Y !== undefined ? w.Y * unit : y;
      const R = P.R ?? z, Zb = P.Z ?? z, clear = ret === 99 ? R : Math.max(initZ, R);
      const o = [`(cyklus G${cyc} rozepsán pro GRBL)`];
      if (z < R) o.push(`G0 Z${fmt(R)}`);
      o.push(`G0 X${fmt(nx)} Y${fmt(ny)}`, `G0 Z${fmt(R)}`);
      const feed = P.F ? ` F${fmt(P.F)}` : '';
      if (cyc === 83 || cyc === 73) {
        const q = Math.abs(P.Q || 0) > 1e-6 ? Math.abs(P.Q) : R - Zb;
        let cur = R, first = true;
        while (cur > Zb + 1e-6) {
          const nz = Math.max(Zb, cur - q);
          if (!first) o.push(cyc === 83 ? `G0 Z${fmt(Math.min(R, cur + 0.25))}` : '');
          o.push(`G1 Z${fmt(nz)}${first ? feed : ''}`);
          if (nz > Zb + 1e-6) o.push(cyc === 83 ? `G0 Z${fmt(R)}` : `G0 Z${fmt(nz + 0.25)}`);
          cur = nz; first = false;
        }
      } else {
        o.push(`G1 Z${fmt(Zb)}${feed}`);
        if (cyc === 82 && P.P) o.push(`G4 P${fmt(P.P > 50 ? P.P / 1000 : P.P)}`);
      }
      o.push(`G0 Z${fmt(clear)}`);
      out.push(...o.filter(Boolean));
      x = nx; y = ny; z = clear; cycN++;
      continue;
    }
    // poloha (pro rozepsání cyklů)
    if (motionG != null || w.X !== undefined || w.Y !== undefined || w.Z !== undefined) {
      if (!gs.includes(53) && !gs.includes(28) && !gs.includes(30) && !gs.includes(92) && !gs.includes(10)) {
        if (w.X !== undefined) x = abs ? w.X * unit : x + w.X * unit;
        if (w.Y !== undefined) y = abs ? w.Y * unit : y + w.Y * unit;
        if (w.Z !== undefined) z = abs ? w.Z * unit : z + w.Z * unit;
      }
    }
    out.push(line);
  }
  if (m6) notes.push(`výměna nástroje M6 vynechána (${m6}×) – nástroj vyměníš v průvodci`);
  if (cycN) notes.push(`vrtací cykly rozepsány na běžné pohyby (${cycN} děr)`);
  return { text: out.join('\n'), notes, errors, warns, tools: [...tools] };
}

// ---------- posun programu v polotovaru (X/Y absolutních souřadnic; oblouky I J jsou relativní) ----------
export function offsetXY(src, dx, dy) {
  if (!dx && !dy) return src;
  let abs = true, unit = 1;
  const sh = (v, d) => (Math.round((parseFloat(v) + d / unit) * 10000) / 10000).toString();
  return src.split('\n').map(line => {
    // kód bez komentářů rozdělit, komentáře nechat
    const parts = line.split(/(\([^)]*\)|;.*$)/);
    const code = parts.filter((x, i) => i % 2 === 0).join(' ').toUpperCase();
    const gs = (code.match(/G\s*\d+(\.\d+)?/g) || []).map(g => parseFloat(g.replace(/G\s*/, '')));
    if (gs.includes(20)) unit = 25.4; if (gs.includes(21)) unit = 1;
    if (gs.includes(90)) abs = true; if (gs.includes(91)) abs = false;
    if (!abs || gs.some(g => g === 53 || g === 28 || g === 30 || g === 92 || g === 10 || g === 4)) return line;
    return parts.map((x, i) => i % 2 ? x : x.replace(/([XY])\s*([-+]?(?:\d+\.?\d*|\.\d+))/gi, (m, a, v) => a + sh(v, a.toUpperCase() === 'X' ? dx : dy))).join('');
  }).join('\n');
}

// ---------- statistika programu ----------
export function progStats(g) {
  let maxF = 0, maxPlunge = 0, maxS = 0, minZcut = Infinity;
  const P = g.pos;
  for (let s = 0; s < g.n / 2; s++) {
    const a = s * 2; if (g.kind[a] === 0) continue;
    const st = g.lineState[g.line[a]]; if (!st) continue;
    const dxy = Math.hypot(P[a * 3 + 3] - P[a * 3], P[a * 3 + 4] - P[a * 3 + 1]), dz = P[a * 3 + 5] - P[a * 3 + 2];
    const f = st[3];
    if (dz < -1e-4 && dxy < Math.abs(dz) * 0.5) { if (f > maxPlunge) maxPlunge = f; }
    else if (f > maxF) maxF = f;
    if (P[a * 3 + 5] < minZcut) minZcut = P[a * 3 + 5];
  }
  for (const st of g.lineState) if (st && st[4] > maxS) maxS = st[4];
  return { maxF, maxPlunge, maxS, minZcut: isFinite(minZcut) ? minZcut : null };
}

// ---------- nástroje: spárování s knihovnou, limity ----------
export function matchTool(tools, h) {
  if (!h) return null;
  const ok = t => t.type === h.kind && Math.abs((t.type === 'v' ? (t.dia > t.vTip ? t.dia : t.vTip) : t.dia) - h.dia) < 0.011 && (h.kind !== 'v' || !h.taper || !t.vAngle || Math.abs(t.vAngle - h.taper * 2) < 1);
  return tools.find(ok) || (h.kind === 'v' ? tools.find(t => t.type === 'v' && Math.abs((t.vTip ?? t.dia) - h.dia) < 0.011) : null) || null;
}
export function toolFromHeader(h, stats) {
  const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  const t = { id, name: '', type: h.kind, dia: h.dia, feed: Math.round(stats?.maxF || 300), plunge: Math.round(stats?.maxPlunge || 100), spindle: Math.round(stats?.maxS || 12000), step: r2(Math.max(0.1, h.dia / 4)) };
  if (h.kind === 'v') { t.vAngle = h.taper ? r2(h.taper * 2) : 90; t.vTip = 0; }
  return t;
}
export const LIM_KEYS = ['maxFeed', 'maxPlunge', 'maxSpindle', 'cutLen', 'slotDoc'];
export const LIM_CZ = { maxFeed: 'Max. posuv', maxPlunge: 'Max. zanoření', maxSpindle: 'Max. otáčky', cutLen: 'Řezná délka', slotDoc: 'Max. hloubka v plném záběru' };
const has = v => v !== undefined && v !== null && v !== '' && isFinite(+v) && +v > 0;
// limity nástroje pro materiál: hodnoty u materiálu mají přednost před výchozími u nástroje
export function effLimits(S, tool, material) {
  const out = {};
  if (!tool) return out;
  const ov = (material && S.limits?.by?.[material]?.[tool.id]) || {};
  for (const k of LIM_KEYS) { if (has(ov[k])) out[k] = +ov[k]; else if (has(tool[k])) out[k] = +tool[k]; }
  return out;
}

// ---------- polotovar: obdélník v souřadnicích programu a výška vrchu ----------
export const ORIGINS = [['ll', 'levý přední roh'], ['lr', 'pravý přední roh'], ['ul', 'levý zadní roh'], ['ur', 'pravý zadní roh'], ['c', 'střed'], ['custom', 'vlastní']];
export function stockGeom(stock) {
  const w = +stock.w || 100, h = +stock.h || 60, t = +stock.t || 10;
  let x0 = 0, y0 = 0;
  switch (stock.xy) {
    case 'lr': x0 = -w; break;
    case 'ul': y0 = -h; break;
    case 'ur': x0 = -w; y0 = -h; break;
    case 'c': x0 = -w / 2; y0 = -h / 2; break;
    case 'custom': x0 = +stock.x0 || 0; y0 = +stock.y0 || 0; break;
  }
  const zTop = stock.z === 'bottom' ? t : (stock.z === 'custom' ? +stock.zTop || 0 : 0);
  return { rect: { minX: x0, minY: y0, maxX: x0 + w, maxY: y0 + h }, zTop, T: t, w, h };
}
export const originText = stock => {
  const o = ORIGINS.find(x => x[0] === stock.xy)?.[1] || 'levý přední roh';
  const z = stock.z === 'bottom' ? 'spodek polotovaru (stůl)' : stock.z === 'custom' ? `vrch polotovaru je v Z ${cz(+stock.zTop || 0)}` : 'vrch polotovaru';
  return stock.xy === 'custom' ? `X/Y: roh polotovaru je v X ${cz(+stock.x0 || 0)} Y ${cz(+stock.y0 || 0)}; Z: ${z}` : `X/Y: ${o} polotovaru; Z: ${z}`;
};

// ---------- kontroly bez simulace (limity F / S, spodek polotovaru, příkazy) ----------
// level: 'err' = nejde spustit, 'lim' = spustí se jen s výslovným potvrzením, 'warn', 'info'
export function staticIssues(prog, lim, geom, machine = {}) {
  const I = [], st = prog.stats, prep = prog.prep;
  for (const e of prep.errors) I.push({ level: 'err', code: 'cmd', text: e });
  for (const w of prep.warns) I.push({ level: 'warn', code: 'cmd', text: w });
  if (prep.tools.length > 1) I.push({ level: 'lim', code: 'tools', text: `program používá víc nástrojů (T${prep.tools.join(', T')}) – GRBL je nevymění; ve Fusionu ulož každý nástroj zvlášť` });
  if (!prog.toolId) I.push({ level: 'lim', code: 'tool', text: 'nástroj není přiřazený z knihovny – limity ani simulace nemají s čím počítat' });
  if (lim.maxFeed && st.maxF > lim.maxFeed + 1e-6) I.push({ level: 'lim', code: 'feed', text: `posuv F${cz(st.maxF, 0)} je nad limitem nástroje F${cz(lim.maxFeed, 0)}`, val: st.maxF, max: lim.maxFeed });
  if (lim.maxPlunge && st.maxPlunge > lim.maxPlunge + 1e-6) I.push({ level: 'lim', code: 'plunge', text: `zanoření F${cz(st.maxPlunge, 0)} je nad limitem nástroje F${cz(lim.maxPlunge, 0)}`, val: st.maxPlunge, max: lim.maxPlunge });
  if (lim.maxSpindle && st.maxS > lim.maxSpindle + 1e-6) I.push({ level: 'lim', code: 'spindle', text: `otáčky S${cz(st.maxS, 0)} jsou nad limitem nástroje S${cz(lim.maxSpindle, 0)}`, val: st.maxS, max: lim.maxSpindle });
  if (machine.maxS > 0 && st.maxS > machine.maxS + 1e-6) I.push({ level: 'lim', code: 'spindle$30', text: `program chce S${cz(st.maxS, 0)}, stroj umí nejvýš S${cz(machine.maxS, 0)} ($30) – vřeteno pojede pomaleji, než počítal Fusion`, val: st.maxS, max: machine.maxS });
  if (st.minZcut != null && geom) {
    const below = (geom.zTop - geom.T) - st.minZcut;
    if (below > 1 + 1e-6) I.push({ level: 'lim', code: 'bottom', text: `zajede ${cz(below, 2)} mm pod spodek polotovaru (do podložky / stolu)` });
    else if (below > 0.01) I.push({ level: 'info', code: 'bottom', text: `prořízne ${cz(below, 2)} mm pod spodek polotovaru (do podložky)` });
    const depth = geom.zTop - st.minZcut;
    if (lim.cutLen && depth > lim.cutLen + 0.05) I.push({ level: 'warn', code: 'depth', text: `nejhlubší místo je ${cz(depth, 2)} mm pod vrchem polotovaru, řezná délka nástroje je ${cz(lim.cutLen, 2)} mm – simulace ověří, jestli se stopka dotkne materiálu` });
  }
  if (prog.g && !prog.g.cutBB) I.push({ level: 'warn', code: 'empty', text: 'program nemá žádný řezný pohyb' });
  return I;
}

// ---------- simulace úběru materiálu přes všechny programy v pořadí ----------
// progs: [{ id, text, tool: {type,dia,vTip,vAngle,tipAngle}|null, lim }]
export function simulateJob(geomIn, progs, { rapid = 1500, onProgress } = {}) {
  const geom = geomIn;
  const sim = new HeightSim(geom.rect, geom.T, 2e6, geom.zTop, 0.05);
  const res = [];
  const TOL_RAPID = Math.max(0.1, sim.cell * 1.2), TOL = Math.max(0.05, sim.cell * 0.6);
  let totalSegs = 0;
  const parsed = progs.map(p => { const g = parseGcode(p.text, { rapid }); totalSegs += g.n / 2; return g; });
  let doneSegs = 0, lastProg = Date.now();
  progs.forEach((p, pi) => {
    const g = parsed[pi], P = g.pos;
    const tdef = p.tool ? { ...p.tool, cone: true } : { type: 'end', dia: 0.5 };
    const tool = simTool(tdef), r = tool.type === 'v' && tool.R != null ? tool.R : tool.r;
    const lim = p.lim || {};
    const issues = new Map(); // kód -> souhrn
    const add = (code, level, ex, a, text) => {
      let it = issues.get(code);
      if (!it) issues.set(code, it = { code, level, worst: ex, n: 0, line: g.line[a], x: P[a * 3 + 3], y: P[a * 3 + 4], z: P[a * 3 + 5], text, marks: [] });
      it.n++;
      if (ex > it.worst) { it.worst = ex; it.line = g.line[a]; it.x = P[a * 3 + 3]; it.y = P[a * 3 + 4]; it.z = P[a * 3 + 5]; }
      if (it.marks.length < 40 && (!it.marks.length || Math.hypot(it.marks.at(-1).x - P[a * 3 + 3], it.marks.at(-1).y - P[a * 3 + 4]) > Math.max(1, r * 2))) it.marks.push({ x: P[a * 3 + 3], y: P[a * 3 + 4], z: P[a * 3 + 5], line: g.line[a] });
    };
    let removed = 0, firstCut = null;
    // okno pro odhad šířky záběru (u krátkých úseček se počítá přes víc segmentů)
    let wLen = 0, wArea = 0, wEx = 0, wA = 0;
    const win = Math.max(r * 1.5, 1);
    const st = sim.stat = { ex: 0, n: 0, cells: 0 };
    const cellA = sim.cell * sim.cell;
    for (let s = 0; s < g.n / 2; s++) {
      const a = s * 2, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[a * 3 + 3], by = P[a * 3 + 4], bz = P[a * 3 + 5];
      st.ex = 0; st.n = 0; st.cells = 0;
      sim.segment(ax, ay, az, bx, by, bz, tool);
      if (++doneSegs % 20000 === 0 && onProgress && Date.now() - lastProg > 150) { lastProg = Date.now(); onProgress(doneSegs / totalSegs); }
      if (!st.n) { if (g.kind[a] !== 0 && wLen > 0) { wLen += Math.hypot(bx - ax, by - ay); } continue; }
      const area = st.n * cellA; removed += area;
      if (g.kind[a] === 0) { if (st.ex > TOL_RAPID) add('rapid', 'lim', st.ex, a, 'rychloposuv (G0) skrz materiál'); continue; }
      const dxy = Math.hypot(bx - ax, by - ay), dz = bz - az;
      if (firstCut == null && st.ex > TOL) firstCut = { ex: st.ex, a };
      if (lim.cutLen && st.ex > lim.cutLen + TOL) add('shank', 'lim', st.ex, a, 'materiál nad řeznou délkou – stopka nebo upínací část se dotkne materiálu');
      if (dz < -1e-4 && dxy < Math.abs(dz) * 0.5) {
        // svislé zanoření do materiálu (vrták je na to stavěný)
        if (st.ex > Math.max(0.2, TOL) && p.tool?.type !== 'drill') add('plunge', 'warn', st.ex, a, 'svislé zanoření přímo do materiálu (bez rampy / šroubovice)');
        continue;
      }
      // šířka záběru: odebraná plocha / (průměr × délka dráhy) v okně
      wLen += dxy; wArea += area; if (st.ex > wEx) { wEx = st.ex; wA = a; }
      if (wLen >= win) {
        const frac = wArea / (2 * r * wLen);
        if (lim.slotDoc && frac > 0.6 && wEx > lim.slotDoc + TOL) add('slot', 'lim', wEx, wA, 'plný záběr (drážka) hlouběji, než nástroj snese');
        wLen = 0; wArea = 0; wEx = 0;
      }
    }
    sim.stat = null;
    const list = [...issues.values()];
    if (removed < cellA * 4 && g.cutBB) list.push({ code: 'air', level: 'warn', n: 1, text: 'program neodebral žádný materiál (jede ve vzduchu) – zkontroluj nulu Z, polotovar nebo pořadí programů', line: null, worst: 0, marks: [] });
    if (pi === 0 && firstCut && firstCut.ex > 3 && (!lim.slotDoc || firstCut.ex > lim.slotDoc * 1.5)) {
      const a = firstCut.a;
      list.push({ code: 'zero', level: 'lim', n: 1, worst: firstCut.ex, line: g.line[a], x: P[a * 3 + 3], y: P[a * 3 + 4], z: P[a * 3 + 5], text: `hned první řez je ${cz(firstCut.ex, 1)} mm pod povrchem polotovaru – sedí nula Z (vrch / spodek) a tloušťka polotovaru?`, marks: [{ x: P[a * 3 + 3], y: P[a * 3 + 4], z: P[a * 3 + 5], line: g.line[a] }] });
    }
    for (const it of list) {
      if (it.code === 'rapid') it.text = `rychloposuv (G0) skrz materiál, až ${cz(it.worst, 2)} mm${it.n > 1 ? ` (${it.n}×)` : ''} – předchozí program tu materiál neodebral`;
      else if (it.code === 'shank') it.text = `materiál ${cz(it.worst, 2)} mm nad špičkou, řezná délka je ${cz(lim.cutLen, 2)} mm – stopka se dotkne materiálu${it.n > 1 ? ` (${it.n}×)` : ''}`;
      else if (it.code === 'slot') it.text = `plný záběr ${cz(it.worst, 2)} mm hluboko, limit nástroje ${cz(lim.slotDoc, 2)} mm${it.n > 1 ? ` (${it.n}×)` : ''} – chybí hrubování, nebo je jiný přídavek?`;
      else if (it.code === 'plunge') it.text = `svislé zanoření přímo do materiálu až ${cz(it.worst, 2)} mm${it.n > 1 ? ` (${it.n}×)` : ''} – fréza bez rampy může prasknout`;
    }
    res.push({ id: p.id, issues: list, removed: r2(removed) });
  });
  onProgress?.(1);
  return { results: res, cell: sim.cell };
}
