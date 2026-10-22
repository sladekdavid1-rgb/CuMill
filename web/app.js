// CuMill – hlavní logika aplikace
import { loadKicad } from './kicad.js';
import { parseGerber, parseExcellon, classifyFile } from './gerber.js';
import { finalizeBoard, emptyBoard } from './board.js';
import * as CAM from './cam.js';
import * as G from './geom.js';
import { Viewer, opColor } from './view.js';
import { GcodeViewer } from './gview.js';
import { initMachine } from './machine.js';
import * as T from './theme.js';
import { textToLines } from './text.js';
T.apply();

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const cz = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('cs-CZ', { maximumFractionDigits: d });
const pl = (n, a, b, c) => n === 1 ? a : n >= 2 && n <= 4 ? b : c; // 1 vrták, 2 vrtáky, 5 vrtáků
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : null; };
const clone = o => JSON.parse(JSON.stringify(o));

// ---------- nastavení ----------
const LS = 'cumill.settings.v2';
function merge(def, val) {
  if (val === undefined || val === null) return def;
  if (typeof def !== 'object' || def === null || Array.isArray(def)) return typeof val === typeof def ? val : def;
  if (Object.keys(def).length === 0) return typeof val === 'object' ? val : def; // volné mapy
  const o = {};
  for (const k of Object.keys(def)) o[k] = merge(def[k], val[k]);
  return o;
}
function loadSettings() { try { return merge(CAM.defaults(), JSON.parse(localStorage.getItem(LS))); } catch { return CAM.defaults(); } }
function saveSettings() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch {} }
let S = loadSettings();
try { const old = JSON.parse(localStorage.getItem(LS) || '{}'); if (old.pins && old.pins.enabled === false && !old.pins.mode) S.pins.mode = 'never'; } catch {}
const get = (k) => k.split('.').reduce((o, p) => o?.[p], S);
const set = (k, v) => { const ps = k.split('.'); let o = S; for (const p of ps.slice(0, -1)) o = o[p]; o[ps[ps.length - 1]] = v; };

// nastavení desky (úpravy děr, mědi, geometrie)
let B = CAM.boardDefaults();
const boardKey = () => 'cumill.board.' + (st.board?.name || '');
function loadBoardSettings() { try { B = merge(CAM.boardDefaults(), JSON.parse(localStorage.getItem(boardKey()))); } catch { B = CAM.boardDefaults(); } }
function saveBoardSettings() { try { localStorage.setItem(boardKey(), JSON.stringify(B)); } catch {} }

// ---------- stav ----------
const st = {
  board: null, res: null, sources: [], // [{name, handle? | file? | path?, lastModified}]
  sel: null, enabled: {}, visible: {}, mode: 'design', tool: 'pan',
  layers: { 'F.Cu': true, 'B.Cu': true, netColors: false, holes: true, geo: true, paths: true, pathsTop: true, pathsBot: true, toolWidth: true, rapids: false },
  pick: null, // výběr v náhledu {kind, items|layer+idx}
  groupSel: new Set(), // zaškrtnuté skupiny děr v tabulce
  outDir: null, // handle (prohlížeč) nebo cesta (vlastní okno)
};

// ---------- hostitel: vlastní okno (nativní soubory) / prohlížeč (File System Access) ----------
const host = { native: false };
const H = { 'X-CuMill': '1' };
async function api(path, body) {
  const r = await fetch('/api/' + path, body === undefined ? { headers: H } : { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r;
}
async function detectHost() { try { const j = await (await api('caps')).json(); host.native = !!j.native; } catch { host.native = false; } }

// ---------- IndexedDB (nedávné soubory, výstupní složky) ----------
const db = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('cumill', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('kv', mode); const r = fn(t.objectStore('kv')); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); };
  return { get: k => tx('readonly', s => s.get(k)).catch(() => null), set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => null) };
})();
async function ensurePerm(h, mode = 'read') {
  try { if ((await h.queryPermission({ mode })) === 'granted') return true; return (await h.requestPermission({ mode })) === 'granted'; } catch { return false; }
}

// ---------- načtení desky ----------
async function readSource(s) {
  if (s.path) {
    const r = await api('read?path=' + encodeURIComponent(s.path));
    s.lastModified = +r.headers.get('X-Mtime') || 0;
    return { name: s.name, text: await r.text() };
  }
  const f = s.handle ? await s.handle.getFile() : s.file;
  s.lastModified = f.lastModified;
  return { name: f.name, text: await f.text() };
}
async function statSource(s) {
  if (s.path) { const j = await (await api('stat?path=' + encodeURIComponent(s.path))).json(); return j.mtime; }
  if (s.handle) return (await s.handle.getFile()).lastModified;
  return s.lastModified;
}
function buildBoard(files) {
  const kicad = files.find(f => /\.kicad_pcb$/i.test(f.name));
  if (kicad) return finalizeBoard(loadKicad(kicad.text, kicad.name));
  const names = files.map(f => f.name);
  let prefix = names.length > 1 ? names.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); }) : names[0].replace(/\.[^.]+$/, '');
  prefix = prefix.replace(/[-_.]+$/, '') || 'deska';
  const b = emptyBoard(prefix);
  const used = [];
  for (const f of files) {
    const kind = classifyFile(f.name, f.text);
    if (kind === 'F.Cu' || kind === 'B.Cu') { const g = parseGerber(f.text); b.copper[kind] = g.polys; g.warnings.forEach(w => b.warnings.push({ level: 'warn', text: `${f.name}: ${w}` })); used.push(`${kind} ← ${f.name}`); }
    else if (kind === 'Edge.Cuts') { const g = parseGerber(f.text); for (const l of g.centerLines) b.edge.lines.push(l); used.push(`obrys ← ${f.name}`); }
    else if (kind === 'drill') { for (const h of parseExcellon(f.text)) b.holes.push(h); used.push(`díry ← ${f.name}`); }
  }
  if (!used.length) throw new Error('V souborech jsem nenašel měď, obrys ani díry. Vyber gerbery F_Cu / B_Cu / Edge_Cuts a .drl.');
  b.warnings.unshift({ level: 'info', text: 'Načteno z gerberů: ' + used.join(', ') + '. Sítě (pájení shora, průjezdy po sítích) a další vrstvy potřebují .kicad_pcb.' });
  if (!b.holes.length) b.warnings.push({ level: 'warn', text: 'Chybí vrtací soubor (.drl) – nebudou díry.' });
  return finalizeBoard(b);
}
async function loadSources(sources, { keepView = false } = {}) {
  const prjSrc = sources.find(s => /\.cumill$/i.test(s.name));
  if (prjSrc) { try { await openProject((await readSource(prjSrc)).text); } catch (e) { toast(e.message, true); } return; }
  busy(true);
  try {
    const files = [];
    for (const s of sources) files.push(await readSource(s));
    const board = buildBoard(files);
    const sameBoard = st.board && st.board.name === board.name;
    st.board = board; st.sources = sources;
    loadBoardSettings();
    viewer.setBoard(board);
    $('#empty').classList.add('hidden');
    $('#btnReload').disabled = false; $('#btnSave').disabled = false; $('#btnProject').disabled = false; $('#btnLaser').disabled = false;
    if (!sameBoard) { st.sel = null; st.enabled = {}; st.visible = {}; st.pick = null; st.groupSel.clear(); hist.list = []; hist.pos = -1; }
    renderBoardInfo(); renderSettings();
    recompute(true);
    if (!keepView || !sameBoard) requestAnimationFrame(() => viewer.fit());
    addRecent(board.name, sources);
    document.title = `${board.name} – CuMill`;
    st.outDir = await db.get((host.native ? 'outp:' : 'out:') + board.name);
  } catch (e) {
    console.error(e);
    toast('Nepodařilo se načíst: ' + e.message, true);
  } finally { busy(false); }
}
async function addRecent(name, sources) {
  const rec = { name, time: Date.now() };
  if (sources.every(s => s.path)) rec.paths = sources.map(s => s.path);
  else if (sources.every(s => s.handle)) rec.handles = sources.map(s => s.handle);
  else return;
  rec.kind = /\.kicad_pcb$/i.test(sources[0].name) ? 'KiCad' : 'Gerber';
  const list = (await db.get('recent')) || [];
  await db.set('recent', [rec, ...list.filter(r => r.name !== name)].slice(0, 8));
}
async function renderRecent() {
  const list = ((await db.get('recent')) || []).filter(r => host.native ? r.paths : r.handles);
  const box = $('#recent'); box.innerHTML = '';
  if (!list.length) return;
  box.append(el('h3', {}, 'Nedávné'));
  for (const r of list) {
    box.append(el('button', { onclick: async () => {
      if (r.paths) return loadSources(r.paths.map(p => ({ path: p, name: p.split(/[\\/]/).pop() })));
      const ok = await Promise.all(r.handles.map(h => ensurePerm(h)));
      if (ok.every(Boolean)) loadSources(r.handles.map(h => ({ handle: h, name: h.name }))); else toast('Bez povolení ke čtení souboru to nejde.', true);
    } }, el('span', { class: 'chip' }, r.kind), r.name, el('small', {}, new Date(r.time).toLocaleDateString('cs-CZ'))));
  }
}
async function openDialog() {
  try {
    if (host.native) {
      const start = st.sources[0]?.path;
      const j = await (await api('open', { start: start || '' })).json();
      if (j.paths?.length) loadSources(pickSources(j.paths.map(p => ({ path: p, name: p.split(/[\\/]/).pop() }))));
    } else if ('showOpenFilePicker' in window) {
      const hs = await window.showOpenFilePicker({ id: 'cumill-open', multiple: true, types: [{ description: 'Deska KiCad, gerbery, vrtání', accept: { 'application/octet-stream': ['.kicad_pcb', '.cumill', '.gbr', '.gtl', '.gbl', '.gko', '.gm1', '.gml', '.drl', '.xln', '.exc'] } }] });
      if (hs.length) loadSources(pickSources(hs.map(h => ({ handle: h, name: h.name }))));
    } else $('#fileInput').click();
  } catch (e) { if (e.name !== 'AbortError') toast(e.message, true); }
}
function pickSources(list) { const p = list.find(s => /\.cumill$/i.test(s.name)); if (p) return [p]; const k = list.find(s => /\.kicad_pcb$/i.test(s.name)); return k ? [k] : list; }

// ---------- výpočet (na pozadí ve worker vlákně, záložně v hlavním) ----------
let recTimer = null, jobId = 0, worker = null, workerBoard = null;
function getWorker() {
  if (worker === null) {
    try {
      worker = new Worker('worker.js');
      worker.onmessage = e => onComputed(e.data);
      worker.onerror = e => { console.error(e); worker = false; recompute(true); };
    } catch { worker = false; }
  }
  return worker;
}
const pending = new Map(); // id -> {S, board}
function onComputed({ id, res, error }) {

  const job = pending.get(id); pending.delete(id);
  if (id !== jobId || !job || job.board !== st.board) return; // zastaralý výpočet
  busy(false);
  if (error) { console.error(error); toast('Chyba výpočtu: ' + error.split('\n')[0], true); return; }
  res.sides = CAM.makeSides(job.board, job.S, res.pins);
  const unpack = a => { const o = new Array(a.length >> 1); for (let i = 0; i < o.length; i++) o[i] = [a[2 * i], a[2 * i + 1]]; return o; };
  for (const op of res.ops) {
    op.moves = op.moves.map(m => ({ t: m.t, pts: unpack(m.p) }));
    if (op.netPaths) op.netPaths = op.netPaths.map(n => ({ net: n.net, pts: unpack(n.p) }));
  }
  applyResult(res);
}
// ---------- Zpět / Znovu (nastavení i úpravy desky) ----------
const hist = { list: [], pos: -1, skip: false };
function snapshot() {
  if (hist.skip) { hist.skip = false; return; }
  const j = JSON.stringify({ S, B });
  if (hist.list[hist.pos] === j) return;
  hist.list = hist.list.slice(0, hist.pos + 1); hist.list.push(j);
  if (hist.list.length > 150) hist.list.shift();
  hist.pos = hist.list.length - 1;
}
function undoRedo(d) {
  const k = hist.pos + d;
  if (k < 0 || k >= hist.list.length) { toast(d < 0 ? 'Není co vrátit.' : 'Není co opakovat.'); return; }
  hist.pos = k; const j = JSON.parse(hist.list[k]);
  S = merge(CAM.defaults(), j.S); B = merge(CAM.boardDefaults(), j.B);
  saveSettings(); saveBoardSettings(); st.pick = null; viewer.setOpts({ selection: null });
  hist.skip = true; renderSettings(); recompute(true);
  toast(d < 0 ? 'Vráceno zpět.' : 'Znovu provedeno.');
}
function recompute(now) {
  clearTimeout(recTimer);
  if (!st.board) return;
  snapshot();
  busy(true);
  recTimer = setTimeout(() => {
    const id = ++jobId;
    const Sx = clone(S), Bx = clone(B);
    const w = getWorker();
    if (w) {
      pending.set(id, { S: Sx, board: st.board });
      const send = workerBoard !== st.board;
      try {
        w.postMessage({ id, board: send ? st.board : null, S: Sx, B: Bx });
        workerBoard = st.board;
        return;
      } catch (e) { console.error(e); worker = false; pending.delete(id); }
    }
    try {
      const res = CAM.computeAll(st.board, S, B);
      applyResult(res);
    } catch (e) { console.error(e); toast('Chyba výpočtu: ' + e.message, true); }
    busy(false);
  }, now ? 10 : 150);
}
function applyResult(res) {
  st.res = res;
  if (!res.ops.find(o => o.id === st.sel)) st.sel = res.ops.find(o => o.kind === 'iso')?.id || res.ops[0]?.id || null;
  viewer.setOpts({ opId: st.sel, visible: st.visible, areas: B.areas, geoOn: o => CAM.geoObjSet(S, B, o).on, selection: st.pick });
  viewer.setResult(res);
  renderOps(); renderChecks(); renderSteps(); renderHoleTable(); renderCopperEdits(); renderGeoLayers(); renderPinList(); renderTabList(); refreshVisibility(); renderSummaries(); renderBoardInfo(); renderInspector();
  if (gvs.tab === 'gcode') showGcode(gvs.cur?.startsWith('op:') ? 'op:' + st.sel : gvs.cur);
  if (machineUI) machineUI.refresh();
}
function boardChanged() { saveBoardSettings(); recompute(); }

// ---------- formulář nastavení ----------
const ICON = {
  tools: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/></svg>',
  board: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h4M17 15h4M7 5v4M17 15v4"/></svg>',
  pins: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  iso: '<svg viewBox="0 0 24 24"><path d="M4 16h6a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3h4"/><path d="M4 20h7a5 5 0 0 0 5-5v-2a3 3 0 0 1 3-3h1" opacity=".5"/></svg>',
  drill: '<svg viewBox="0 0 24 24"><path d="M12 3v11M9 6l3 3 3-3M9 10l3 3 3-3"/><circle cx="12" cy="19" r="2"/></svg>',
  geo: '<svg viewBox="0 0 24 24"><path d="M4 18 9 6l5 9 2-4 4 7z"/></svg>',
  cut: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 3"/></svg>',
  machine: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
};
const toolOpts = types => S.tools.filter(t => types.includes(t.type)).map(t => [t.id, CAM.toolLabel(t)]);
const SECTIONS = [
  { id: 'tools', title: 'Knihovna nástrojů', icon: 'tools',
    sum: () => `${S.tools.length} ${pl(S.tools.length, 'nástroj', 'nástroje', 'nástrojů')}`,
    fields: [{ type: 'toollist', wide: true }] },
  { id: 'setup', title: 'Deska a nula', icon: 'board', open: true,
    sum: () => st.board ? `${cz(st.board.size.w)} × ${cz(st.board.size.h)} mm` : '',
    fields: [
      { k: 'setup.origin', label: 'Nula XY', type: 'select', wide: true, options: [['pin-ll', 'Střed levého dolního kolíčku'], ['board-ll', 'Levý dolní roh desky'], ['board-c', 'Střed desky'], ['aux', 'Pomocný počátek KiCadu'], ['abs', 'Počátek souřadnic KiCadu']] },
      { k: 'setup.offX', label: 'Posun nuly X', unit: 'mm' }, { k: 'setup.offY', label: 'Posun nuly Y', unit: 'mm' },
      { k: 'setup.mirrorAxis', label: 'Otočení desky na spodní stranu', type: 'seg', wide: true, options: [['h', 'Horní hranou dolů'], ['v', 'Přes svislou osu']] },
      { k: 'setup.blankW', label: 'Polotovar šířka', unit: 'mm' }, { k: 'setup.blankH', label: 'Polotovar výška', unit: 'mm' },
      { k: 'setup.blankT', label: 'Tloušťka cuprextitu', unit: 'mm' },
    ] },
  { id: 'pins', title: 'Přípravek s kolíčky', icon: 'pins',
    sum: () => !st.res ? '' : !st.res.pinsOn ? ((S.pins.mode || 'auto') === 'never' ? 'vypnuto' : 'jednostranná – bez') : st.res.pins.length ? `${st.res.pins.length}× Ø${cz(S.pins.dia)}` : 'žádné',
    fields: [
      { k: 'pins.mode', label: 'Kolíčky přípravku', type: 'seg', wide: true, options: [['auto', 'Automaticky'], ['always', 'Vždy'], ['never', 'Nikdy']] },
      { type: 'hint', show: () => (S.pins.mode || 'auto') === 'auto', html: () => 'Automaticky = jen když se frézuje měď z obou stran (deska se otáčí).' },
      { k: 'pins.source', label: 'Umístění', type: 'seg', wide: true, options: [['holes', 'Do děr desky'], ['pattern', 'Vzor'], ['manual', 'Ručně']], show: () => S.pins.mode !== 'never' },
      { k: 'pins.holeDia', label: 'Průměr děr desky', unit: 'mm', show: () => S.pins.mode !== 'never' && S.pins.source === 'holes' },
      { k: 'pins.patW', label: 'Rozteč X', unit: 'mm', show: () => S.pins.mode !== 'never' && S.pins.source === 'pattern' },
      { k: 'pins.patH', label: 'Rozteč Y', unit: 'mm', show: () => S.pins.mode !== 'never' && S.pins.source === 'pattern' },
      { type: 'pinlist', wide: true, show: () => S.pins.mode !== 'never' && S.pins.source === 'manual' },
      { k: 'pins.dia', label: 'Průměr kolíčku', unit: 'mm', show: () => S.pins.mode !== 'never' },
      { k: 'pins.depth', label: 'Hloubka (do MDF)', unit: 'mm', show: () => S.pins.mode !== 'never' },
      { k: 'pins.method', label: 'Díra pro kolíček', type: 'seg', wide: true, options: [['drill', 'Vrtat'], ['mill', 'Frézovat na průměr']], show: () => S.pins.mode !== 'never' },
      { k: 'pins.tool', label: 'Vrták', type: 'tool', types: ['drill', 'end'], wide: true, show: () => S.pins.mode !== 'never' && S.pins.method !== 'mill' },
      { k: 'pins.millTool', label: 'Fréza', type: 'tool', types: ['end'], wide: true, show: () => S.pins.mode !== 'never' && S.pins.method === 'mill' },
      { k: 'pins.exclude', label: 'Díry desky s kolíčky vynechat z běžného vrtání', type: 'check', show: () => S.pins.mode !== 'never' && S.pins.source === 'holes' },
    ] },
  { id: 'iso', title: 'Izolace mědi', icon: 'iso', open: true,
    sum: () => `${cz(S.iso.width, 3)} mm · ${S.iso.passes}×`,
    fields: [
      { type: 'layers', wide: true },
      { k: 'iso.tool', label: 'Nástroj', type: 'tool', types: ['v', 'end'], wide: true },
      { k: 'iso.depth', label: 'Hloubka', unit: 'mm' },
      { k: 'iso.width', label: 'Šířka řezu', unit: 'mm' },
      { type: 'hint', html: () => { const t = CAM.getTool(S, S.iso.tool, ['v', 'end']); const th = CAM.toolWidth(t, S.iso.depth); const diff = Math.abs(th - S.iso.width) > 0.0005; return `Teoretická šířka v hloubce ${cz(S.iso.depth)} mm: <b>${cz(th, 3)} mm</b>${diff ? ` · <a href="#" data-act="isoReset">použít</a>` : ' ✓'}<br><span class="muted">Šířku můžeš přepsat (korekce nuly Z) – hloubka se nemění.</span>`; } },
      { k: 'iso.passes', label: 'Počet průjezdů', type: 'int' },
      { k: 'iso.overlap', label: 'Překrytí průjezdů', unit: '%' },
      { k: 'iso.clearOverlap', label: 'Překrytí při odfrézování', unit: '%' },
      { k: 'iso.climb', label: 'Směr frézování', type: 'seg', wide: true, options: [[true, 'Sousledně (climb)'], [false, 'Nesousledně']] },
      { k: 'iso.clip', label: 'Ořezat dráhy obrysem desky', type: 'check' },
      { k: 'iso.step', label: 'Krok hloubky (0 = jedním průjezdem)', unit: 'mm', wide: true },
      { type: 'hint', show: () => S.iso.step > 0 && S.iso.step < S.iso.depth, html: () => `Pojede ${Math.ceil(S.iso.depth / S.iso.step - 1e-6)}× do hloubky ${cz(S.iso.depth)} mm po ${cz(S.iso.step)} mm.` },
      { type: 'copperedits', wide: true },
    ] },
  { id: 'drill', title: 'Díry', icon: 'drill', open: true,
    sum: () => { if (!st.res) return ''; const n = st.res.ops.filter(o => o.kind === 'drill').length; return `${n} ${pl(n, 'vrták', 'vrtáky', 'vrtáků')}`; },
    fields: [
      { k: 'drill.depth', label: 'Hloubka vrtání', unit: 'mm' }, { k: 'drill.millAbove', label: 'Frézovat díry větší o', unit: 'mm' },
      { k: 'drill.millTool', label: 'Fréza na velké díry (auto)', type: 'tool', types: ['end'], wide: true },
      { k: 'drill.side', label: 'Díry, geometrie a ořez ze strany', type: 'select', wide: true, options: [['auto', 'Automaticky (strana poslední mědi)'], ['top', 'Shora'], ['bottom', 'Zespodu (zrcadleně)']] },
      { type: 'holetable', wide: true },
    ] },
  { id: 'geo', title: 'Další geometrie', icon: 'geo',
    sum: () => { const n = Object.keys(st.board?.geo || {}).length; return n ? `${n} ${pl(n, 'vrstva', 'vrstvy', 'vrstev')}` : 'žádná'; },
    fields: [
      { k: 'geo.tool', label: 'Výchozí nástroj', type: 'tool', types: ['end', 'v'], wide: true },
      { k: 'geo.pocketOverlap', label: 'Překrytí v kapse', unit: '%' },
      { type: 'geolayers', wide: true },
    ] },
  { id: 'silk', title: 'Gravírování potisku', icon: 'geo',
    sum: () => (S.silk?.F || S.silk?.B) ? [S.silk.F && 'F', S.silk.B && 'B'].filter(Boolean).join(' + ') + ` · ${cz(S.silk.depth)} mm` : 'vypnuto',
    fields: [
      { type: 'hint', html: () => st.board && !st.board.silk ? 'Potisk jde gravírovat jen z desky KiCad (.kicad_pcb).' : 'Texty a čáry z vrstev potisku (stejným písmem jako KiCad) vyryje V-fréza hned po izolaci téže strany.' },
      { k: 'silk.F', label: 'Horní potisk F.SilkS', type: 'check' },
      { k: 'silk.B', label: 'Spodní potisk B.SilkS (zrcadleně)', type: 'check' },
      { k: 'silk.tool', label: 'Nástroj', type: 'tool', types: ['v', 'end'], wide: true, show: () => S.silk.F || S.silk.B },
      { k: 'silk.depth', label: 'Hloubka', unit: 'mm', show: () => S.silk.F || S.silk.B },
      { k: 'silk.margin', label: 'Odstup od mědi', unit: 'mm', show: () => S.silk.F || S.silk.B },
      { k: 'silk.avoid', label: 'Na mědi negravírovat', type: 'select', wide: true, options: [['tracks', 'Plošky a spoje (doporučeno)'], ['pads', 'Jen plošky'], ['copper', 'Veškerou měď (jen holý laminát)'], ['none', 'Nic – gravírovat všude']], show: () => S.silk.F || S.silk.B },
      { k: 'silk.texts', label: 'Texty', type: 'check', show: () => S.silk.F || S.silk.B },
      { k: 'silk.graphics', label: 'Čáry a obrysy součástek', type: 'check', show: () => S.silk.F || S.silk.B },
    ] },
  { id: 'cut', title: 'Ořez desky', icon: 'cut',
    sum: () => S.cut.enabled ? `${CAM.toolLabel(CAM.getTool(S, S.cut.tool, ['end']))} · ${cz(S.cut.depth)} mm` : 'vypnuto',
    fields: [
      { k: 'cut.enabled', label: 'Vyříznout desku podle obrysu (Edge.Cuts)', type: 'check' },
      { k: 'cut.tool', label: 'Nástroj', type: 'tool', types: ['end'], wide: true, show: () => S.cut.enabled },
      { k: 'cut.depth', label: 'Hloubka (= „celá tloušťka“)', unit: 'mm' },
      { k: 'cut.step', label: 'Krok hloubky', unit: 'mm', placeholder: () => String(CAM.getTool(S, S.cut.tool, ['end'])?.step ?? '').replace('.', ',') },
      { type: 'hint', html: () => { const st = S.cut.step > 0 ? S.cut.step : CAM.getTool(S, S.cut.tool, ['end'])?.step || S.cut.depth; return `Ořez a frézované díry: ${Math.ceil(S.cut.depth / st - 1e-6)} kroky po ${cz(st)} mm${S.cut.step > 0 ? '' : ' (podle nástroje)'}.`; } },
      { type: 'tablist', wide: true, show: () => S.cut.enabled },
      { k: 'cut.tabs', label: 'Počet můstků', type: 'int', show: () => S.cut.enabled && !Array.isArray(B.tabs) },
      { k: 'cut.tabW', label: 'Šířka můstku', unit: 'mm', show: () => S.cut.enabled && (Array.isArray(B.tabs) || S.cut.tabs > 0) },
      { k: 'cut.tabH', label: 'Výška můstku', unit: 'mm', show: () => S.cut.enabled && (Array.isArray(B.tabs) || S.cut.tabs > 0) },
      { k: 'cut.climb', label: 'Směr frézování (ořez, díry, geometrie)', type: 'seg', wide: true, options: [[true, 'Sousledně (climb)'], [false, 'Nesousledně']] },
    ] },
  { id: 'machine', title: 'Stroj a G-kód', icon: 'machine',
    sum: () => `Z${S.machine.zTravel} / ${S.machine.zEnd}`,
    fields: [
      { k: 'machine.dwell', label: 'Prodleva po rozjezdu', unit: 's' },
      { k: 'machine.zTravel', label: 'Bezpečná výška Z', unit: 'mm' }, { k: 'machine.zApproach', label: 'Najetí nad materiál', unit: 'mm' },
      { k: 'machine.zEnd', label: 'Z na konci', unit: 'mm' }, { k: 'machine.rapid', label: 'Rychloposuv (pro odhad)', unit: 'mm/min' },
      { k: 'machine.decimals', label: 'Desetinná místa', type: 'select', options: [[3, '3 (µm)'], [4, '4 (jako FlatCAM)']] },
      { k: 'machine.fitTol', label: 'Tolerance (FlatCAM: 0,005)', unit: 'mm' },
      { k: 'machine.arcs', label: 'Oblouky jako G2/G3 (plynulejší, kratší program)', type: 'check' },
      { k: 'machine.homeAtEnd', label: 'Na konci najet na X0 Y0', type: 'check' },
      { type: 'hint', html: () => 'Otáčky S, posuvy a kroky jsou u nástrojů v knihovně; u každého programu vpravo je jde přepsat. Program začíná <b>S… M3</b> – vřeteno se rozjede samo.' },
    ] },
];
const inputs = {}; // k -> funkce pro obnovu hodnoty v políčku
function renderSettings() {
  const root = $('#settings'); const scroll = root.scrollTop; root.innerHTML = '';
  for (const sec of SECTIONS) {
    const d = el('details', { class: 'sec', 'data-id': sec.id });
    const openKey = 'cumill.open.' + sec.id;
    const saved = localStorage.getItem(openKey);
    d.open = saved === null ? !!sec.open : saved === '1';
    d.addEventListener('toggle', () => localStorage.setItem(openKey, d.open ? '1' : '0'));
    d.append(el('summary', {}, el('span', { class: 'ico', html: ICON[sec.icon] }), sec.title, el('span', { class: 'sum', 'data-sum': sec.id })));
    const box = el('div', { class: 'fields' });
    for (const f of sec.fields) box.append(renderField(f));
    d.append(box);
    root.append(d);
  }
  root.append(el('div', { class: 'resetrow' },
    el('button', { class: 'btn small', onclick: () => { if (confirm('Vrátit všechna nastavení (i knihovnu nástrojů) na výchozí hodnoty?')) { S = CAM.defaults(); saveSettings(); renderSettings(); recompute(); } } }, 'Výchozí nastavení'),
    el('button', { class: 'btn small', onclick: exportSettings }, 'Export nastavení'),
    el('button', { class: 'btn small', onclick: importSettings }, 'Import')));
  refreshVisibility(); renderSummaries(); renderHoleTable(); renderCopperEdits(); renderGeoLayers(); renderToolList(); renderPinList(); renderTabList();
  root.scrollTop = scroll;
}
function numInput(getV, setV, { unit, int, placeholder, text } = {}) {
  const box = el('div', { class: 'inp' });
  const inp = el('input', { type: 'text', inputmode: text ? 'text' : 'decimal', spellcheck: 'false' });
  const show = () => { const v = getV(); inp.value = v === null || v === undefined || v === '' ? '' : text ? v : String(v).replace('.', ','); };
  show();
  if (placeholder !== undefined) inp.placeholder = placeholder;
  const commit = () => {
    if (text) { setV(inp.value); return; }
    if (inp.value.trim() === '' && placeholder !== undefined) { setV(null); return; }
    const v = num(inp.value);
    if (v === null) { show(); return; }
    setV(int ? Math.round(v) : v);
  };
  inp.addEventListener('input', () => { clearTimeout(inp._t); inp._t = setTimeout(commit, 500); });
  inp.addEventListener('change', () => { clearTimeout(inp._t); commit(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(inp._t); commit(); }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !text) {
      e.preventDefault();
      const cur = num(inp.value) ?? num(inp.placeholder) ?? 0;
      const stp = int ? 1 : (Math.abs(cur) < 1 ? 0.01 : Math.abs(cur) < 10 ? 0.1 : Math.abs(cur) < 1000 ? 10 : 100) * (e.shiftKey ? 10 : 1);
      inp.value = String(+(cur + (e.key === 'ArrowUp' ? stp : -stp)).toFixed(4)).replace('.', ','); clearTimeout(inp._t); commit();
    }
  });
  box.append(inp);
  if (unit) box.append(el('span', { class: 'u' }, unit));
  box._show = show;
  return box;
}
function selectBox(options, value, onChange) {
  const sel = el('select');
  for (const [v, t] of options) { const o = el('option', { value: JSON.stringify(v) }, t); if (JSON.stringify(v) === JSON.stringify(value)) o.selected = true; sel.append(o); }
  sel.addEventListener('change', () => onChange(JSON.parse(sel.value)));
  return el('div', { class: 'inp' }, sel);
}
function renderField(f) {
  if (f.type === 'hint') { const h = el('div', { class: 'hint' }); h._f = f; h.innerHTML = f.html(); return h; }
  for (const [t, id] of [['holetable', 'holeTable'], ['layers', 'isoLayers'], ['copperedits', 'copperEdits'], ['geolayers', 'geoLayers'], ['toollist', 'toolList'], ['pinlist', 'pinList'], ['tablist', 'tabList']]) if (f.type === t) { const d = el('div', { class: 'f wide', id }); d._f = f; return d; }
  if (f.type === 'check') {
    const inp = el('input', { type: 'checkbox' }); inp.checked = !!get(f.k);
    inp.addEventListener('change', () => { set(f.k, inp.checked); changed(f.k); });
    const lab = el('label', { class: 'f check' }, inp, f.label); lab._f = f; return lab;
  }
  const wrap = el('div', { class: 'f' + (f.wide ? ' wide' : '') }); wrap._f = f;
  wrap.append(el('label', {}, f.label));
  if (f.type === 'seg') {
    const seg = el('div', { class: 'seg2' });
    for (const [v, t] of f.options) {
      const b = el('button', { type: 'button', class: get(f.k) === v ? 'on' : '' }, t);
      b.addEventListener('click', () => { set(f.k, v); seg.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); changed(f.k); });
      seg.append(b);
    }
    wrap.append(seg); return wrap;
  }
  if (f.type === 'select') { wrap.append(selectBox(f.options, get(f.k), v => { set(f.k, v); changed(f.k); })); return wrap; }
  if (f.type === 'tool') { wrap.append(selectBox(toolOpts(f.types), CAM.getTool(S, get(f.k), f.types)?.id, v => { set(f.k, v); changed(f.k); })); return wrap; }
  const box = numInput(() => get(f.k), v => { set(f.k, v); changed(f.k); }, { unit: f.unit, int: f.type === 'int', text: f.type === 'text', placeholder: f.placeholder ? f.placeholder() : undefined });
  inputs[f.k] = box._show;
  wrap.append(box);
  return wrap;
}
function refreshVisibility() {
  document.querySelectorAll('#settings .fields > *').forEach(n => {
    const f = n._f; if (!f) return;
    n.style.display = f.show && !f.show() ? 'none' : '';
    if (f.type === 'hint' && f.html) n.innerHTML = f.html();
  });
  renderIsoLayers();
}
function renderSummaries() { for (const sec of SECTIONS) { const n = document.querySelector(`[data-sum="${sec.id}"]`); if (n) n.textContent = sec.sum(); } }
function changed(k) {
  // šířka řezu se předvyplní výpočtem při změně nástroje nebo hloubky
  if (k === 'iso.tool' || k === 'iso.depth') { S.iso.width = +CAM.toolWidth(CAM.getTool(S, S.iso.tool, ['v', 'end']), S.iso.depth).toFixed(3); inputs['iso.width']?.(); }
  saveSettings(); refreshVisibility(); renderSummaries(); recompute();
}
$('#settings').addEventListener('click', e => {
  const a = e.target.closest('[data-act="isoReset"]');
  if (a) { e.preventDefault(); S.iso.width = +CAM.toolWidth(CAM.getTool(S, S.iso.tool, ['v', 'end']), S.iso.depth).toFixed(3); inputs['iso.width']?.(); changed(); }
});

function renderIsoLayers() {
  const box = $('#isoLayers'); if (!box) return;
  box.innerHTML = '';
  box.append(el('label', {}, 'Vrstvy k izolaci'));
  const row = el('div', { class: 'seg2' });
  for (const [l, t] of [['B.Cu', 'Spodní B.Cu'], ['F.Cu', 'Horní F.Cu']]) {
    const avail = st.board ? st.board.hasCopper[l] : true;
    const usedL = st.board ? st.board.used[l] : true;
    const on = avail && usedL && S.iso.layers[l] !== false;
    const b = el('button', { type: 'button', class: on ? 'on' : '', title: !avail ? 'Vrstva nemá měď' : !usedL ? 'Jen pady bez cest – jednostranná deska' : '' }, t + (st.board && avail && !usedL ? ' (jen pady)' : ''));
    if (!avail) b.disabled = true;
    b.addEventListener('click', () => {
      if (st.board && !usedL) { st.board.used[l] = true; S.iso.layers[l] = true; }
      else S.iso.layers[l] = !(S.iso.layers[l] !== false);
      changed();
    });
    row.append(b);
  }
  box.append(row);
}

// ---------- knihovna nástrojů ----------
function renderToolList() {
  const box = $('#toolList'); if (!box) return;
  box.innerHTML = '';
  const tbl = el('div', { class: 'tlist' });
  for (const t of S.tools) {
    tbl.append(el('div', { class: 'trow' },
      el('span', { class: 'ttype ' + t.type }, CAM.TOOL_TYPES[t.type]),
      el('span', { class: 'tname' }, CAM.toolLabel(t)),
      el('span', { class: 'muted' }, `F${t.feed} · S${t.spindle}`)));
  }
  box.append(tbl, el('button', { class: 'btn small', style: 'margin-top:8px', onclick: openToolDialog }, 'Upravit knihovnu…'));
}
function openToolDialog() {
  const dlg = $('#toolDlg'), body = $('#toolBody');
  const draw = () => {
    body.innerHTML = '';
    const t = el('table', { class: 'ttable' });
    t.append(el('tr', {}, ...['Typ', 'Název', 'Ø / hrot', 'Úhel', 'Posuv F', 'Zanoření', 'Otáčky S', 'Krok', ''].map(h => el('th', {}, h))));
    for (const tool of S.tools) {
      const cell = (k, opts = {}) => el('td', {}, numInput(() => tool[k], v => { tool[k] = v; if (k === 'dia' && tool.type === 'v') tool.vTip = v; }, opts));
      const nameInp = el('input', { type: 'text', value: tool.name || '' });
      nameInp.addEventListener('change', () => { tool.name = nameInp.value; });
      t.append(el('tr', {},
        el('td', {}, selectBox(Object.entries(CAM.TOOL_TYPES), tool.type, v => { tool.type = v; if (v === 'v' && !tool.vAngle) { tool.vAngle = 30; tool.vTip = tool.dia || 0.1; } draw(); })),
        el('td', {}, el('div', { class: 'inp' }, nameInp)),
        tool.type === 'v' ? el('td', {}, numInput(() => tool.vTip, v => { tool.vTip = v; tool.dia = v; }, { unit: 'mm' })) : cell('dia', { unit: 'mm' }),
        tool.type === 'v' ? cell('vAngle', { unit: '°' }) : el('td', { class: 'muted' }, '—'),
        cell('feed'), cell('plunge'), cell('spindle', { int: true }), cell('step', { unit: 'mm' }),
        el('td', {}, el('button', { class: 'iconbtn', title: 'Smazat nástroj', onclick: () => { if (S.tools.length > 1) { S.tools = S.tools.filter(x => x !== tool); draw(); } } }, '✕'))));
    }
    body.append(t);
    body.append(el('div', { class: 'tadd' },
      ...[['v', '+ V-fréza'], ['end', '+ Fréza'], ['drill', '+ Vrták']].map(([ty, txt]) => el('button', { class: 'btn small', onclick: () => {
        const id = ty[0] + Date.now().toString(36);
        const base = ty === 'v' ? { dia: 0.1, vTip: 0.1, vAngle: 30, feed: 400, plunge: 100, step: 0.05 } : ty === 'end' ? { dia: 1.0, feed: 100, plunge: 50, step: 0.3 } : { dia: 0.8, feed: 300, plunge: 300, step: 0.5 };
        S.tools.push({ id, name: '', type: ty, spindle: 12000, ...base }); draw();
      } }, txt))),
      el('p', { class: 'muted' }, 'Název můžeš nechat prázdný – vytvoří se z průměru. Hodnoty F, S, zanoření a krok se použijí ve všech programech s tímto nástrojem, pokud je u programu nepřepíšeš.'));
  };
  draw();
  dlg.showModal();
  dlg.onclose = () => { saveSettings(); renderSettings(); recompute(); };
}
$('#toolClose').addEventListener('click', () => $('#toolDlg').close());

// ---------- díry ----------
function holeActControls(onApply, opts = {}) {
  // výběr akce + nástroje + cílového průměru
  const state = { a: opts.a || 'drill', tool: opts.tool, dia: opts.dia ?? null };
  const wrap = el('div', { class: 'actbar' });
  const draw = () => {
    wrap.innerHTML = '';
    const types = state.a === 'mill' ? ['end'] : ['drill'];
    if (!CAM.getTool(S, state.tool, types) || CAM.getTool(S, state.tool, types).id !== state.tool) state.tool = CAM.getTool(S, null, types)?.id;
    wrap.append(selectBox([['auto', 'Automaticky'], ['drill', 'Vrtat'], ['mill', 'Frézovat'], ['skip', 'Vynechat']], state.a, v => { state.a = v; draw(); }));
    if (state.a === 'drill' || state.a === 'mill') wrap.append(selectBox(toolOpts(types), state.tool, v => { state.tool = v; }));
    if (state.a === 'mill') wrap.append(numInput(() => state.dia, v => { state.dia = v; }, { unit: 'mm', placeholder: 'Ø díry' }));
    wrap.append(el('button', { class: 'btn small primary', onclick: () => onApply(state.a === 'auto' ? null : state.a === 'skip' ? { a: 'skip' } : state.a === 'mill' ? { a: 'mill', tool: state.tool, dia: state.dia || null } : { a: 'drill', tool: state.tool }) }, opts.label || 'Použít'));
  };
  draw();
  return wrap;
}
function renderHoleTable() {
  const box = $('#holeTable'); if (!box) return;
  box.innerHTML = '';
  if (!st.res?.holeList?.length) { box.append(el('p', { class: 'muted' }, st.board ? 'Deska nemá díry.' : '')); return; }
  box.append(el('label', {}, 'Průměry v projektu – zaškrtni a nastav hromadně'));
  const t = el('table', { class: 'map' }, el('tr', {}, el('th', {}, ''), el('th', {}, 'Díra'), el('th', {}, 'Počet'), el('th', {}, 'Nástroj')));
  for (const m of st.res.holeList) {
    const cb = el('input', { type: 'checkbox' }); cb.checked = st.groupSel.has(m.key);
    cb.addEventListener('change', () => { cb.checked ? st.groupSel.add(m.key) : st.groupSel.delete(m.key); renderHoleTable(); highlightGroups(); });
    const act = m.act || m.auto;
    t.append(el('tr', { class: st.groupSel.has(m.key) ? 'on' : '' }, el('td', {}, cb),
      el('td', {}, (m.slot ? 'drážka ' : '') + 'Ø' + cz(m.d) + (m.plated ? '' : ' NP')),
      el('td', {}, m.count + '×' + (m.singles ? ` (${m.singles} jednotl.)` : '')),
      el('td', { class: m.act ? '' : 'auto' }, (m.act ? '' : 'auto: ') + CAM.actLabel(S, act))));
  }
  box.append(t);
  if (st.groupSel.size) {
    box.append(el('div', { class: 'muted', style: 'margin:8px 0 4px' }, `Vybrané skupiny (${st.groupSel.size}):`));
    box.append(holeActControls(act => {
      for (const k of st.groupSel) { if (act) B.holes.groups[k] = act; else delete B.holes.groups[k]; }
      st.groupSel.clear(); boardChanged(); toast('Nastaveno pro vybrané průměry.');
    }));
  } else box.append(el('div', { class: 'muted', style: 'margin-top:6px' }, 'Jednotlivé díry vybereš v náhledu nástrojem Výběr (klik, Shift+klik, obdélník).'));
  if (Object.keys(B.holes.single).length) box.append(el('button', { class: 'btn small', style: 'margin-top:6px', onclick: () => { B.holes.single = {}; boardChanged(); } }, `Zrušit nastavení jednotlivých děr (${Object.keys(B.holes.single).length})`));
}
function highlightGroups() {
  if (!st.board) return;
  if (st.groupSel.size) st.pick = { kind: 'holes', items: st.board.holes.filter(h => st.groupSel.has(CAM.groupKey(h))) };
  viewer.setOpts({ selection: st.pick }); renderInspector();
}

// ---------- úpravy mědi ----------
function renderCopperEdits() {
  const box = $('#copperEdits'); if (!box) return;
  box.innerHTML = '';
  box.append(el('label', {}, 'Průjezdy podle sítí'));
  const nets = [...new Set(['F.Cu', 'B.Cu'].flatMap(l => (st.board?.islands[l] || []).map(i => i.net)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs', { numeric: true }));
  const list = el('div', { class: 'elist' });
  for (const [n, p] of Object.entries(B.nets)) list.append(el('div', { class: 'erow' }, el('span', {}, n), el('b', {}, p + '×'), el('button', { class: 'iconbtn', title: 'Zrušit', onclick: () => { delete B.nets[n]; boardChanged(); } }, '✕')));
  for (const [i, o] of B.islands.entries()) list.append(el('div', { class: 'erow' }, el('span', {}, `kus mědi ${o.layer} (X ${cz(o.x, 1)}, Y ${cz(-o.y, 1)})`), el('b', {}, o.passes + '×'), el('button', { class: 'iconbtn', title: 'Zrušit', onclick: () => { B.islands.splice(i, 1); boardChanged(); } }, '✕')));
  if (!list.childNodes.length) list.append(el('div', { class: 'muted' }, 'Všechno podle výchozího počtu průjezdů.'));
  box.append(list);
  if (nets.length) {
    let pickNet = nets.includes('GND') ? 'GND' : nets[0], pickN = 3;
    box.append(el('div', { class: 'actbar' },
      selectBox(nets.map(n => [n, n]), pickNet, v => { pickNet = v; }),
      numInput(() => pickN, v => { pickN = v; }, { int: true, unit: '×' }),
      el('button', { class: 'btn small', onclick: () => { B.nets[pickNet] = Math.max(1, pickN); boardChanged(); } }, 'Přidat')));
  }
  box.append(el('label', { style: 'margin-top:10px' }, 'Oblasti'));
  const al = el('div', { class: 'elist' });
  B.areas.forEach((a, i) => al.append(el('div', { class: 'erow' + (st.pick?.kind === 'area' && st.pick.items.includes(a) ? ' on' : '') },
    el('span', { class: 'adot ' + (a.type === 'block' ? 'block' : 'clear') }), el('span', { style: 'cursor:pointer', onclick: () => { st.pick = { kind: 'area', items: [a] }; viewer.setOpts({ selection: st.pick }); renderInspector(); } }, `${areaName(a)} · ${layerName(a.layer)}`),
    el('button', { class: 'iconbtn', title: 'Smazat oblast', onclick: () => { B.areas.splice(i, 1); if (st.pick?.kind === 'area') st.pick = null; boardChanged(); } }, '✕'))));
  if (!B.areas.length) al.append(el('div', { class: 'muted' }, 'Nakresli v náhledu nástrojem „Odfrézovat“ nebo „Zakázat“.'));
  box.append(al);
}
const areaName = a => a.type === 'block' ? 'Zákaz frézování' : a.all ? 'Odfrézovat vše (i měď)' : 'Odfrézovat mezi mědí';
const layerName = l => l === 'both' ? 'obě strany' : l;

// ---------- kolíčky: ruční umístění ----------
function renderPinList() {
  const box = $('#pinList'); if (!box) return;
  box.innerHTML = '';
  const list = B.pins || [];
  box.append(el('label', {}, `Ruční kolíčky (${list.length})`));
  const l = el('div', { class: 'elist' });
  list.forEach((p, i) => {
    const pr = st.res?.pins?.[i];
    l.append(el('div', { class: 'erow' + (st.pick?.kind === 'pin' && st.pick.idx === i ? ' on' : '') },
      el('span', { class: 'adot ' + (pr?.problems?.length ? 'block' : 'clear') }),
      el('span', { style: 'cursor:pointer', onclick: () => { st.pick = { kind: 'pin', idx: i }; viewer.setOpts({ selection: st.pick }); renderInspector(); renderPinList(); } }, `${i + 1}: X ${cz(p.x, 2)}, Y ${cz(-p.y, 2)}${pr?.fromHole ? ' (v díře)' : ''}`),
      el('button', { class: 'iconbtn', title: 'Smazat kolíček', onclick: () => removePin(i) }, '✕')));
  });
  if (!list.length) l.append(el('div', { class: 'muted' }, 'Klikni do náhledu nástrojem Kolíček (K).'));
  box.append(l);
  box.append(el('div', { class: 'actbar' },
    el('button', { class: 'btn small', onclick: () => setTool('pin') }, 'Přidat v náhledu'),
    list.length ? el('button', { class: 'btn small', onclick: () => { B.pins = []; st.pick = null; boardChanged(); } }, 'Smazat vše') : null));
}
// ---------- můstky ořezu: automaticky / ručně ----------
function renderTabList() {
  const box = $('#tabList'); if (!box) return;
  box.innerHTML = '';
  const manual = Array.isArray(B.tabs);
  const seg = el('div', { class: 'seg2' },
    el('button', { type: 'button', class: manual ? '' : 'on', onclick: () => { if (!manual) return; B.tabs = null; st.pick = null; boardChanged(); refreshVisibility(); } }, 'Automaticky'),
    el('button', { type: 'button', class: manual ? 'on' : '', onclick: () => { if (manual) return; ensureManualTabs(); boardChanged(); refreshVisibility(); } }, 'Ručně'));
  box.append(el('label', {}, 'Můstky'), seg);
  if (!manual) { box.append(el('div', { class: 'muted small', style: 'margin-top:4px' }, 'Rozmístí se rovnoměrně po obrysu. Táhni je v náhledu nástrojem Můstek (M) – pak se přepne na ruční.')); return; }
  const list = B.tabs, info = st.res?.cutTabs?.list || [];
  const l = el('div', { class: 'elist', style: 'margin-top:6px' });
  list.forEach((t, i) => {
    const r = info.find(q => q.idx === i);
    l.append(el('div', { class: 'erow' + (st.pick?.kind === 'tab' && st.pick.idx === i ? ' on' : '') },
      el('span', { class: 'adot ' + (r?.problem ? 'block' : 'clear') }),
      el('span', { style: 'cursor:pointer', onclick: () => { st.pick = { kind: 'tab', idx: i }; viewer.setOpts({ selection: st.pick }); renderInspector(); renderTabList(); } }, `${i + 1}: X ${cz(t.x, 2)}, Y ${cz(-t.y, 2)}${r?.problem ? ' – ' + r.problem : ''}`),
      el('button', { class: 'iconbtn', title: 'Smazat můstek', onclick: () => removeTab(i) }, '✕')));
  });
  if (!list.length) l.append(el('div', { class: 'muted' }, 'Bez můstků. Klikni na dráhu ořezu nástrojem Můstek (M).'));
  box.append(l);
  box.append(el('div', { class: 'actbar' },
    el('button', { class: 'btn small', onclick: () => setTool('tab') }, 'Přidat v náhledu'),
    list.length ? el('button', { class: 'btn small', onclick: () => { B.tabs = []; st.pick = null; boardChanged(); } }, 'Smazat vše') : null));
}
function ensureManualTabs() {
  if (!Array.isArray(B.tabs)) { B.tabs = (st.res?.cutTabs?.list || []).filter(t => !t.problem).map(t => ({ x: +t.x.toFixed(4), y: +t.y.toFixed(4) })); }
  if (!S.cut.enabled) { S.cut.enabled = true; saveSettings(); renderSettings(); }
}
// přichycení na dráhu ořezu (souřadnice KiCadu)
function snapTab(p, scale) {
  const paths = st.res?.cutTabs?.paths || [];
  let best = null;
  for (const P of paths) for (let k = 1; k < P.length; k++) {
    const [x0, y0] = P[k - 1], [x1, y1] = P[k], dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - x0) * dx + (p[1] - y0) * dy) / L2)) : 0;
    const x = x0 + t * dx, y = y0 + t * dy, d = Math.hypot(p[0] - x, p[1] - y);
    if (!best || d < best.d) best = { x, y, d, ang: Math.atan2(dy, dx) };
  }
  return best && best.d < Math.max(3, 25 / scale) ? best : null;
}
function removeTab(i) { if (!Array.isArray(B.tabs)) return; B.tabs.splice(i, 1); if (st.pick?.kind === 'tab') st.pick = null; boardChanged(); }
function ensureManual() {
  if (S.pins.source !== 'manual') {
    // převezme dosavadní kolíčky (díry / vzor) jako výchozí ruční polohy
    B.pins = (st.res?.pinsOn ? st.res.pins : []).map(p => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) }));
    S.pins.source = 'manual'; saveSettings(); renderSettings();
  }
  if ((S.pins.mode || 'auto') === 'never') { S.pins.mode = 'always'; saveSettings(); renderSettings(); }
}
function snapPin(p, scale) {
  const tol = Math.max(1.2, 10 / scale);
  let best = null, bd = Infinity;
  for (const h of st.board.holes) { if (h.slot) continue; const d = Math.hypot(h.x - p[0], h.y - p[1]); if (d < tol && d < bd) { bd = d; best = h; } }
  if (best) return { x: best.x, y: best.y, hole: true };
  const g = 0.5; return { x: Math.round(p[0] / g) * g, y: Math.round(p[1] / g) * g, hole: false };
}
function removePin(i) { B.pins.splice(i, 1); if (st.pick?.kind === 'pin') st.pick = null; boardChanged(); }
// ---------- další geometrie ----------
const GEO_MODES = [['in', 'Prořez uvnitř (otvor)'], ['out', 'Prořez vně (díl)'], ['pocket', 'Kapsa (celá plocha)'], ['line', 'Po čáře (rytí)']];
function geoEditor(cur, onSet, { objMode = false, closed = true } = {}) {
  const wrap = el('div', { class: 'geoed' });
  const on = el('input', { type: 'checkbox' }); on.checked = !!cur.on;
  on.addEventListener('change', () => onSet({ on: on.checked }));
  wrap.append(el('label', { class: 'f check' }, on, objMode ? 'Frézovat tento tvar' : 'Frézovat tvary z této vrstvy'));
  const modes = closed ? GEO_MODES : GEO_MODES.filter(m => m[0] === 'line');
  const g = el('div', { class: 'fields tight' });
  g.append(el('div', { class: 'f wide' }, el('label', {}, 'Způsob'), selectBox(modes, closed ? cur.mode : 'line', v => onSet({ mode: v }))));
  const full = el('input', { type: 'checkbox' }); full.checked = !!cur.full;
  full.addEventListener('change', () => onSet({ full: full.checked }));
  g.append(el('div', { class: 'f' }, el('label', {}, 'Hloubka'), cur.full ? el('div', { class: 'inp dis' }, el('input', { value: `celá (${cz(S.cut.depth)})`, disabled: true })) : numInput(() => cur.depth, v => onSet({ depth: v }), { unit: 'mm' })));
  g.append(el('label', { class: 'f check', style: 'grid-column:auto;align-self:end;height:30px' }, full, 'Celá tloušťka'));
  g.append(el('div', { class: 'f wide' }, el('label', {}, 'Nástroj'), selectBox(toolOpts(['end', 'v']), CAM.getTool(S, cur.tool, ['end', 'v'])?.id, v => onSet({ tool: v }))));
  wrap.append(g);
  return wrap;
}
function renderGeoLayers() {
  const box = $('#geoLayers'); if (!box) return;
  box.innerHTML = '';
  const geo = st.board?.geo || {};
  if (!Object.keys(geo).length) { box.append(el('p', { class: 'muted' }, st.board?.source === 'gerber' ? 'Další vrstvy jdou jen z .kicad_pcb.' : 'Deska nemá tvary v dalších vrstvách (User.*, Dwgs, Cmts, Eco…). Nakresli je v KiCadu do např. User.1.')); return; }
  for (const [lay, objs] of Object.entries(geo)) {
    const cur = CAM.geoLayerSet(S, B, lay);
    const nOv = objs.filter(o => B.geo.objs[o.key]).length;
    const sec = el('div', { class: 'geolayer' + (cur.on ? ' on' : '') });
    sec.append(el('div', { class: 'gl-head' }, el('b', {}, lay), el('span', { class: 'muted' }, `${objs.length} ${pl(objs.length, 'tvar', 'tvary', 'tvarů')}${nOv ? `, ${nOv} upraveno` : ''}`)));
    sec.append(geoEditor(cur, patch => { B.geo.layers[lay] = { ...cur, ...patch }; saveBoardSettings(); renderGeoLayers(); recompute(); }));
    if (nOv) sec.append(el('button', { class: 'btn small', onclick: () => { for (const o of objs) delete B.geo.objs[o.key]; boardChanged(); } }, 'Zrušit úpravy jednotlivých tvarů'));
    box.append(sec);
  }
  box.append(el('div', { class: 'muted', style: 'margin-top:6px' }, 'Jednotlivý tvar nastavíš kliknutím v náhledu (nástroj Výběr).'));
}

// ---------- pravý panel: programy ----------
function fileName(op) { return `${CAM.fileSafe(st.board.name)}_${op.no}_${op.short}.nc`; }
const ICO_EYE = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICO_CODE = '<svg viewBox="0 0 24 24"><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></svg>';
const ICO_DL = '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/></svg>';
const FIELD_LABEL = { feed: 'Posuv F', plunge: 'Zanoření', spindle: 'Otáčky S', step: 'Krok hloubky', depth: 'Hloubka' };
function opEditor(op) {
  const wrap = el('div', { class: 'opedit', onclick: e => e.stopPropagation() });
  const tool = CAM.getTool(S, op.toolId);
  if (op.toolRef) wrap.append(el('div', { class: 'f wide' }, el('label', {}, 'Nástroj'), selectBox(toolOpts(op.toolTypes), op.toolId, v => { set(op.toolRef, v); changed(op.toolRef); renderSettings(); })));
  const g = el('div', { class: 'fields tight' });
  const ov = S.ov[op.key] || {};
  for (const f of op.fields) {
    let lab = FIELD_LABEL[f];
    if ((op.kind === 'drill' || op.kind === 'pins') && f === 'plunge') lab = 'Posuv Z';
    if ((op.kind === 'drill' || op.kind === 'pins') && f === 'step') lab = 'Krok vrtání';
    if (op.kind === 'iso' && f === 'depth') lab = 'Hloubka izolace';
    let base = f === 'depth' ? (op.kind === 'pins' ? S.pins.depth : op.kind === 'drill' ? S.drill.depth : op.kind === 'iso' ? S.iso.depth : S.cut.depth) : f === 'spindle' ? (tool?.spindle ?? '') : tool?.[f];
    if (f === 'step' && op.kind === 'iso') base = S.iso.step > 0 ? S.iso.step : 'bez kroků';
    if (f === 'step' && (op.kind === 'cut' || op.kind === 'mill') && S.cut.step > 0) base = S.cut.step;
    g.append(el('div', { class: 'f' }, el('label', {}, lab + (ov[f] != null ? ' •' : '')),
      numInput(() => ov[f] ?? null, v => { S.ov[op.key] = { ...(S.ov[op.key] || {}), [f]: v }; if (v === null) delete S.ov[op.key][f]; saveSettings(); recompute(); }, { placeholder: String(base ?? '').replace('.', ','), int: f === 'spindle', unit: f === 'spindle' ? 'ot' : f === 'feed' || f === 'plunge' ? 'mm/min' : 'mm' })));
  }
  wrap.append(g);
  wrap.append(el('div', { class: 'muted small' }, 'Prázdné = podle nástroje z knihovny. ', Object.keys(ov).length ? el('a', { href: '#', onclick: e => { e.preventDefault(); delete S.ov[op.key]; saveSettings(); recompute(); } }, 'Vrátit vše na nástroj') : ''));
  return wrap;
}
function renderOps() {
  const box = $('#ops'); const scroll = box.parentElement.parentElement.scrollTop; box.innerHTML = '';
  const res = st.res; if (!res) return;
  let total = 0;
  for (const op of res.ops) {
    const on = st.enabled[op.id] !== false;
    if (on) total += opMin(op);
    const cb = el('input', { type: 'checkbox', title: 'Uložit tento program' }); cb.checked = on;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', () => { st.enabled[op.id] = cb.checked; renderOps(); renderSteps(); });
    const vis = st.visible[op.id] !== false;
    const selc = op.id === st.sel;
    const card = el('div', { class: 'op' + (selc ? ' sel' : '') + (on ? '' : ' off'), onclick: () => { st.sel = op.id; viewer.setOpts({ opId: op.id }); if (st.mode === 'machine') viewer.fit(); renderOps(); if (gvs.tab === 'gcode') showGcode('op:' + op.id); } },
      cb,
      el('div', { class: 't' }, el('span', { class: 'no' }, op.no), el('i', { class: 'dot', style: `background:${opColor(op)}` }), op.title),
      el('div', { class: 'btns' },
        el('button', { class: 'iconbtn', title: vis ? 'Skrýt v náhledu' : 'Zobrazit v náhledu', style: vis ? '' : 'opacity:.35', html: ICO_EYE, onclick: e => { e.stopPropagation(); st.visible[op.id] = !vis; viewer.setOpts({ visible: st.visible }); renderOps(); } }),
        el('button', { class: 'iconbtn', title: 'Zobrazit G-kód', html: ICO_CODE, onclick: e => { e.stopPropagation(); showCode(op); } }),
        el('button', { class: 'iconbtn', title: 'Stáhnout jen tento soubor', html: ICO_DL, onclick: e => { e.stopPropagation(); download(fileName(op), op.gcode); } })),
      el('div', { class: 'meta' }, el('span', { class: 'side ' + (op.side === 'bottom' ? 'bottom' : 'up') }, op.side === 'bottom' ? 'zespodu' : 'shora'), el('span', {}, op.tool),
        el('span', {}, `${op.count} ${op.kind === 'drill' || op.kind === 'pins' ? pl(op.count, 'díra', 'díry', 'děr') : op.kind === 'geo' ? pl(op.count, 'tvar', 'tvary', 'tvarů') : pl(op.count, 'dráha', 'dráhy', 'drah')}`),
        el('span', {}, `F${op.prm.feed} S${op.prm.spindle}`), el('span', {}, `≈ ${opMin(op) < 1 ? '<1' : Math.round(opMin(op))} min`), op.extra ? el('span', {}, op.extra) : null),
      el('div', { class: 'file', title: fileName(op) }, fileName(op)),
      selc ? opEditor(op) : null);
    box.append(card);
  }
  $('#totalTime').textContent = res.ops.length ? `celkem ≈ ${Math.round(total)} min` : '';
  box.parentElement.parentElement.scrollTop = scroll;
}
function renderChecks() {
  const box = $('#checks'); box.innerHTML = '';
  const res = st.res; if (!res) return;
  const sym = { error: '!', warn: '!', info: 'i', ok: '✓' };
  const items = res.checks.slice();
  const nErr = items.filter(c => c.level === 'error').length, nWarn = items.filter(c => c.level === 'warn').length;
  if (!items.some(c => c.markers)) items.unshift({ level: 'ok', text: `Izolace projde: všechny mezery mědi jsou širší než šířka řezu ${cz(res.isoWidth, 3)} mm.` });
  for (const c of items) {
    const div = el('div', { class: 'chk ' + c.level }, el('span', { class: 'ic' }, sym[c.level]), el('div', {}, c.text));
    if (c.list?.length) {
      const counts = new Map(); for (const x of c.list) counts.set(x, (counts.get(x) || 0) + 1);
      div.lastChild.append(el('div', { class: 'list' }, [...counts].map(([x, n]) => el('span', {}, n > 1 ? `${x} (${n}×)` : x))));
    }
    box.append(div);
  }
  const b = $('#checkBadge');
  b.className = 'badge ' + (nErr ? 'err' : nWarn ? 'warn' : 'ok');
  b.textContent = nErr ? `${nErr} ${pl(nErr, 'chyba', 'chyby', 'chyb')}` : nWarn ? `${nWarn} upozornění` : 'v pořádku';
}
function buildSteps() {
  const res = st.res, b = st.board; if (!res) return [];
  const steps = [];
  const ops = res.ops.filter(o => st.enabled[o.id] !== false);
  const T = S.setup;
  steps.push({ h: `Upni polotovar ${T.blankW} × ${T.blankH} mm (cuprextit ${cz(T.blankT)} mm) na přípravek.`, tag: '' });
  steps.push({ h: `Nula XY: <b>${esc(originCz())}</b>. Nula Z vždy sondou na měď.`, tag: '' });
  let lastSide = null, lastTool = null;
  for (const op of ops) {
    if (lastSide && op.side !== lastSide) {
      steps.push({ h: op.side === 'top'
        ? `Otoč desku ${T.mirrorAxis === 'h' ? '<b>horní hranou dolů</b>' : '<b>přes svislou osu</b> (levý okraj doprava)'} a nasaď ji zpět na kolíčky. Nula XY zůstává stejná.`
        : 'Otoč desku na spodní stranu a nasaď na kolíčky.', tag: '' });
    }
    lastSide = op.side;
    const f = `<code>${esc(fileName(op))}</code>`;
    const chg = op.toolId !== lastTool ? `${esc(op.tool)}, nula Z na měď, ` : '';
    lastTool = op.toolId;
    if (op.kind === 'pins') steps.push({ h: `${chg}pusť ${f}: díry pro kolíčky skrz desku do přípravku (${cz(op.prm.depth)} mm). Pak zasuň kolíčky.`, tag: 'Stroj' });
    else if (op.kind === 'iso') steps.push({ h: `${chg}změř výškovou mapu a pusť ${f} – ${op.side === 'bottom' ? 'spodní měď (zrcadleně)' : 'horní měď'}.`, tag: 'Stroj + mapa' });
    else if (op.kind === 'drill') steps.push({ h: `${chg}pusť ${f} (${op.count} ${pl(op.count, 'díra', 'díry', 'děr')}).`, tag: 'Stroj' });
    else steps.push({ h: `${chg}pusť ${f} – ${esc(op.title.toLowerCase())}.`, tag: 'Stroj' });
  }
  if (res.pinsOn && res.pins?.some(p => p.fromHole) && ops.some(o => o.kind === 'pins') && S.pins.source === 'holes') steps.push({ h: `Díry pro kolíčky převrtej na Ø${cz(S.pins.holeDia)}.`, tag: '' });
  if (res.checks.find(c => c.via) && b.vias.length) steps.push({ h: `Protáhni ${b.vias.length} průchodů drátkem a zapájej z obou stran.`, tag: '' });
  const top = res.checks.find(c => c.list && /shora/.test(c.text));
  if (top) steps.push({ h: `Vývody s cestou nahoře (${top.list.length}) pájej i shora – seznam je v kontrolách.`, tag: '' });
  return steps;
}
function originCz() {
  return { 'pin-ll': st.res?.pins?.length ? 'střed levého dolního kolíčku' : 'levý dolní roh desky (kolíčky nejsou)', 'board-ll': 'levý dolní roh desky', 'board-c': 'střed desky', aux: 'pomocný počátek KiCadu', abs: 'počátek souřadnic KiCadu' }[S.setup.origin] + (S.setup.offX || S.setup.offY ? ` (posun X ${cz(S.setup.offX)}, Y ${cz(S.setup.offY)})` : '');
}
function renderSteps() { const ol = $('#steps'); ol.innerHTML = ''; for (const s of buildSteps()) ol.append(el('li', { html: s.h + (s.tag ? `<span class="tag">${s.tag}</span>` : '') })); }
function renderBoardInfo() {
  const b = st.board, box = $('#boardInfo'); box.innerHTML = '';
  if (!b) { box.append(el('span', { class: 'muted' }, 'Žádná deska')); return; }
  box.append(el('span', { class: 'name', title: b.fileName }, b.name));
  box.append(el('span', { class: 'chip' }, `${cz(b.size.w)} × ${cz(b.size.h)} mm`));
  for (const [l, c] of [['F.Cu', '#de5648'], ['B.Cu', '#548ce0']]) if (b.used[l]) box.append(el('span', { class: 'chip' }, el('i', { style: `background:${c}` }), l));
  box.append(el('span', { class: 'chip' }, `${b.holes.length} děr`));
  box.append(el('span', { class: 'chip' }, b.source === 'kicad' ? 'KiCad' : 'Gerber'));
}

// ---------- náhled, výběr, inspektor ----------
const viewer = new Viewer($('#cv'), (p, hole) => {
  const r = $('#readout');
  if (!p || !st.res) { r.textContent = ''; return; }
  const op = st.res.ops.find(o => o.id === st.sel);
  const sd = st.res.sides[op ? op.side : st.res.firstSide];
  let design, mach;
  if (st.mode === 'machine') { mach = p; design = viewer.toDesign(p); } else { design = p; mach = sd.fwd(p); }
  const n = v => v.toFixed(3).padStart(8);
  let t = `stroj  X${n(mach[0])}  Y${n(mach[1])}\nKiCad  X${n(design[0])}  Y${n(-design[1])}`;
  if (hole) { const a = st.res.holeActs?.get(CAM.holeKey(hole)); t += `\n${hole.ref ? hole.ref + '  ' : ''}díra Ø${cz(hole.d)}${hole.slot ? ' (drážka)' : ''}${hole.plated === false ? ' NPTH' : ''}${a ? '  → ' + CAM.actLabel(S, a) : ''}`; }
  r.textContent = t;
});
const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const nearLine = (p, pts, closed, tol) => { for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) if (distSeg(p, pts[i - 1], pts[i % pts.length]) < tol) return true; return false; };
function hitTest(p, scale) {
  const b = st.board; if (!b) return null;
  const tol = 6 / scale;
  // můstky ořezu (ruční)
  if (Array.isArray(B.tabs) && st.res?.cutTabs) {
    const L = st.res.cutTabs.len / 2 + tol;
    const q = st.res.cutTabs.list.find(t => Math.hypot(t.x - p[0], t.y - p[1]) < L);
    if (q) return { kind: 'tab', idx: q.idx };
  }
  // kolíčky (ruční)
  if (st.res?.pinsOn && S.pins.source === 'manual') {
    const i = st.res.pins.findIndex(q => Math.hypot(q.x - p[0], q.y - p[1]) < Math.max((S.pins.dia || 2.5) / 2, tol));
    if (i >= 0) return { kind: 'pin', idx: i };
  }
  // díry
  if (st.layers.holes) {
    let best = null, bd = Infinity;
    for (const h of b.holes) { const d = Math.hypot(h.x - p[0], h.y - p[1]); if (d < Math.max(h.d / 2, tol) && d < bd) { bd = d; best = h; } }
    if (best) return { kind: 'holes', items: [best] };
  }
  // oblasti
  for (const a of B.areas.slice().reverse()) if (G.pointInPoly(p[0], p[1], a.pts) || nearLine(p, a.pts, true, tol)) return { kind: 'area', items: [a] };
  // tvary dalších vrstev
  if (st.layers.geo) for (const objs of Object.values(b.geo || {})) for (const o of objs) {
    if (p[0] < o.bb.minX - tol || p[0] > o.bb.maxX + tol || p[1] < o.bb.minY - tol || p[1] > o.bb.maxY + tol) continue;
    if (nearLine(p, o.pts, o.closed, tol)) return { kind: 'geo', items: [o] };
  }
  // kusy mědi (horní vrstva pohledu první)
  const order = st.mode === 'machine' && st.res?.ops.find(o => o.id === st.sel)?.side === 'bottom' ? ['B.Cu', 'F.Cu'] : ['F.Cu', 'B.Cu'];
  for (const l of order) {
    if (!st.layers[l] || !b.used[l]) continue;
    const idx = (b.islands[l] || []).findIndex(it => p[0] >= it.bb.minX && p[0] <= it.bb.maxX && p[1] >= it.bb.minY && p[1] <= it.bb.maxY && G.pointInPoly(p[0], p[1], it.outer) && !it.holes.some(hh => G.pointInPoly(p[0], p[1], hh)));
    if (idx >= 0) return { kind: 'island', layer: l, idx, pt: p, net: b.islands[l][idx].net };
  }
  return null;
}
viewer.onPick = (p, add, scale) => {
  const hit = hitTest(p, scale);
  if (hit?.kind === 'tab') { st.pick = hit; viewer.setOpts({ selection: st.pick }); renderInspector(); renderTabList(); return; }
  if (hit?.kind === 'pin') { st.pick = hit; viewer.setOpts({ selection: st.pick }); renderInspector(); renderPinList(); return; }
  if (add && hit && st.pick && st.pick.kind === hit.kind && (hit.kind === 'holes' || hit.kind === 'geo')) {
    const it = hit.items[0]; const i = st.pick.items.indexOf(it);
    if (i >= 0) st.pick.items.splice(i, 1); else st.pick.items.push(it);
    if (!st.pick.items.length) st.pick = null;
  } else st.pick = hit;
  st.groupSel.clear();
  viewer.setOpts({ selection: st.pick }); renderInspector(); renderHoleTable();
};
viewer.onRect = (rect, add) => {
  const bb = G.bbox([rect]);
  const inside = (x, y) => x >= bb.minX && x <= bb.maxX && y >= bb.minY && y <= bb.maxY;
  const holes = st.board.holes.filter(h => inside(h.x, h.y));
  if (holes.length) {
    const base = add && st.pick?.kind === 'holes' ? st.pick.items : [];
    st.pick = { kind: 'holes', items: [...new Set([...base, ...holes])] };
  } else {
    const objs = Object.values(st.board.geo || {}).flat().filter(o => o.bb.minX >= bb.minX && o.bb.maxX <= bb.maxX && o.bb.minY >= bb.minY && o.bb.maxY <= bb.maxY);
    st.pick = objs.length ? { kind: 'geo', items: objs } : null;
  }
  viewer.setOpts({ selection: st.pick }); renderInspector();
};
viewer.onArea = (pts, tool) => {
  const a = { id: Date.now().toString(36), type: tool === 'block' ? 'block' : 'clear', all: false, layer: defaultAreaLayer(), pts };
  B.areas.push(a);
  st.pick = { kind: 'area', items: [a] };
  viewer.setOpts({ selection: st.pick, areas: B.areas });
  boardChanged();
};
function defaultAreaLayer() {
  const op = st.res?.ops.find(o => o.id === st.sel);
  if (op?.kind === 'iso') return op.layer;
  return st.board.used['F.Cu'] ? 'F.Cu' : 'B.Cu';
}
function renderInspector() {
  const box = $('#inspector'); box.innerHTML = '';
  const p = st.pick;
  if (!p || !st.board || !st.res) { box.classList.remove('on'); return; }
  box.classList.add('on');
  const head = (t, sub) => box.append(el('div', { class: 'ihead' }, el('b', {}, t), sub ? el('span', { class: 'muted' }, sub) : null, el('button', { class: 'iconbtn', title: 'Zrušit výběr (Esc)', onclick: () => { st.pick = null; viewer.setOpts({ selection: null }); renderInspector(); } }, '✕')));
  if (p.kind === 'holes') {
    const by = new Map(); for (const h of p.items) { const k = (h.slot ? 'drážka ' : '') + 'Ø' + cz(h.d); by.set(k, (by.get(k) || 0) + 1); }
    head(`${p.items.length} ${pl(p.items.length, 'díra', 'díry', 'děr')}`, [...by].map(([k, n]) => `${n}× ${k}`).join(', '));
    if (p.items.length === 1) { const h = p.items[0]; const a = st.res.holeActs.get(CAM.holeKey(h)); box.append(el('div', { class: 'muted' }, `${h.ref || ''} → ${CAM.actLabel(S, a)} (${a.src === 'single' ? 'nastaveno jednotlivě' : a.src === 'group' ? 'podle skupiny' : 'automaticky'})`)); }
    const first = st.res.holeActs.get(CAM.holeKey(p.items[0]));
    box.append(holeActControls(act => {
      for (const h of p.items) { if (act) B.holes.single[CAM.holeKey(h)] = act; else delete B.holes.single[CAM.holeKey(h)]; }
      boardChanged(); toast(`Nastaveno pro ${p.items.length} ${pl(p.items.length, 'díru', 'díry', 'děr')}.`);
    }, { a: first?.src === 'single' ? first.a : 'drill', tool: first?.tool, dia: first?.dia, label: 'Použít na vybrané' }));
    const keys = [...new Set(p.items.map(CAM.groupKey))];
    box.append(el('button', { class: 'btn small', style: 'margin-top:6px', onclick: () => { keys.forEach(k => st.groupSel.add(k)); highlightGroups(); renderHoleTable(); document.querySelector('[data-id="drill"]').open = true; } }, `Vybrat celé skupiny (${keys.length}) v tabulce děr`));
  } else if (p.kind === 'island') {
    const it = st.board.islands[p.layer][p.idx];
    head(`Kus mědi ${p.layer}`, it.net ? `síť ${it.net}` : 'síť neznámá');
    const ex = B.islands.find(o => o.layer === p.layer && G.pointInPoly(o.x, o.y, it.outer));
    let nI = ex?.passes ?? (it.net && B.nets[it.net]) ?? S.iso.passes;
    box.append(el('label', { class: 'ilab' }, 'Průjezdy kolem tohoto kusu'));
    box.append(el('div', { class: 'actbar' }, numInput(() => nI, v => { nI = v; }, { int: true, unit: '×' }),
      el('button', { class: 'btn small primary', onclick: () => { const o = ex || { layer: p.layer, x: p.pt[0], y: p.pt[1] }; o.passes = Math.max(1, nI); if (!ex) B.islands.push(o); boardChanged(); } }, 'Nastavit'),
      ex ? el('button', { class: 'btn small', onclick: () => { B.islands.splice(B.islands.indexOf(ex), 1); boardChanged(); } }, 'Zrušit') : null));
    if (it.net) {
      let nN = B.nets[it.net] ?? S.iso.passes;
      box.append(el('label', { class: 'ilab' }, `Průjezdy pro celou síť ${it.net}`));
      box.append(el('div', { class: 'actbar' }, numInput(() => nN, v => { nN = v; }, { int: true, unit: '×' }),
        el('button', { class: 'btn small primary', onclick: () => { B.nets[it.net] = Math.max(1, nN); boardChanged(); } }, 'Nastavit'),
        B.nets[it.net] != null ? el('button', { class: 'btn small', onclick: () => { delete B.nets[it.net]; boardChanged(); } }, 'Zrušit') : null));
    }
    box.append(el('div', { class: 'muted small' }, `Výchozí ${S.iso.passes}×. Kus má přednost před sítí.`));
  } else if (p.kind === 'geo') {
    const o0 = p.items[0];
    head(p.items.length > 1 ? `${p.items.length} tvarů` : `Tvar ve vrstvě ${o0.layer}`, p.items.length > 1 ? '' : `${o0.closed ? 'uzavřený' : 'otevřená čára'}, ${cz(o0.bb.maxX - o0.bb.minX)} × ${cz(o0.bb.maxY - o0.bb.minY)} mm`);
    const cur = CAM.geoObjSet(S, B, o0);
    box.append(geoEditor(cur, patch => { for (const o of p.items) B.geo.objs[o.key] = { ...(B.geo.objs[o.key] || {}), ...CAM.geoObjSet(S, B, o), ...patch }; saveBoardSettings(); renderInspector(); renderGeoLayers(); recompute(); }, { objMode: true, closed: p.items.every(o => o.closed) }));
    if (p.items.some(o => B.geo.objs[o.key])) box.append(el('button', { class: 'btn small', onclick: () => { for (const o of p.items) delete B.geo.objs[o.key]; boardChanged(); } }, 'Podle nastavení vrstvy'));
  } else if (p.kind === 'tab') {
    const q = B.tabs?.[p.idx], r = st.res.cutTabs?.list.find(t => t.idx === p.idx);
    if (!q) { st.pick = null; box.classList.remove('on'); return; }
    head(`Můstek ${p.idx + 1}`, `${cz(S.cut.tabW)} × ${cz(S.cut.tabH)} mm (šířka × výška)`);
    const g = el('div', { class: 'fields tight' });
    g.append(el('div', { class: 'f' }, el('label', {}, 'X (KiCad)'), numInput(() => +q.x.toFixed(3), v => { q.x = v; boardChanged(); }, { unit: 'mm' })));
    g.append(el('div', { class: 'f' }, el('label', {}, 'Y (KiCad)'), numInput(() => +(-q.y).toFixed(3), v => { q.y = -v; boardChanged(); }, { unit: 'mm' })));
    box.append(g);
    if (r?.problem) box.append(el('div', { class: 'chk warn' }, el('span', { class: 'ic' }, '!'), el('div', {}, 'Můstek je ' + r.problem + ' – nepoužije se.')));
    else box.append(el('div', { class: 'muted small' }, 'Táhni ho v náhledu nástrojem Můstek (M) – drží se na dráze ořezu.'));
    box.append(el('button', { class: 'btn small', onclick: () => removeTab(p.idx) }, 'Smazat můstek (Del)'));
  } else if (p.kind === 'pin') {
    const q = B.pins?.[p.idx], pr = st.res.pins?.[p.idx];
    if (!q) { st.pick = null; box.classList.remove('on'); return; }
    head(`Kolíček ${p.idx + 1}`, pr?.fromHole ? 'v díře desky' : 'mimo díry desky');
    const g = el('div', { class: 'fields tight' });
    g.append(el('div', { class: 'f' }, el('label', {}, 'X (KiCad)'), numInput(() => +q.x.toFixed(3), v => { q.x = v; boardChanged(); }, { unit: 'mm' })));
    g.append(el('div', { class: 'f' }, el('label', {}, 'Y (KiCad)'), numInput(() => +(-q.y).toFixed(3), v => { q.y = -v; boardChanged(); }, { unit: 'mm' })));
    box.append(g);
    if (pr?.problems?.length) box.append(el('div', { class: 'chk error' }, el('span', { class: 'ic' }, '!'), el('div', {}, 'Kolíček ' + pr.problems.join(', ') + '.')));
    else box.append(el('div', { class: 'muted small' }, 'Poloha v pořádku. Táhni ho v náhledu, přichytí se k díře nebo na rastr 0,5 mm.'));
    box.append(el('button', { class: 'btn small', onclick: () => removePin(p.idx) }, 'Smazat kolíček (Del)'));
  } else if (p.kind === 'area') {
    const a = p.items[0];
    head(areaName(a), layerName(a.layer));
    const g = el('div', { class: 'fields tight' });
    g.append(el('div', { class: 'f wide' }, el('label', {}, 'Co dělat'), selectBox([['clear', 'Odfrézovat měď mezi cestami'], ['all', 'Odfrézovat všechnu měď v oblasti'], ['block', 'Zakázat frézování v oblasti']], a.type === 'block' ? 'block' : a.all ? 'all' : 'clear', v => { a.type = v === 'block' ? 'block' : 'clear'; a.all = v === 'all'; boardChanged(); })));
    g.append(el('div', { class: 'f wide' }, el('label', {}, 'Vrstva'), selectBox([['F.Cu', 'Horní F.Cu'], ['B.Cu', 'Spodní B.Cu'], ['both', 'Obě strany']], a.layer, v => { a.layer = v; boardChanged(); })));
    box.append(g);
    box.append(el('button', { class: 'btn small', onclick: () => { B.areas.splice(B.areas.indexOf(a), 1); st.pick = null; boardChanged(); } }, 'Smazat oblast (Del)'));
  }
}
function renderLayerChips() {
  const box = $('#layerChips'); box.innerHTML = '';
  const chips = [['F.Cu', 'F.Cu', '#de5648'], ['B.Cu', 'B.Cu', '#548ce0'], ['netColors', 'Barvy sítí', 'conic-gradient(#e55,#ec5,#5c7,#59e,#c5e,#e55)'], ['holes', 'Díry', '#ddd'], ['geo', 'Geometrie', '#c3a0ff'], ['paths', 'Dráhy', '#ffd166'], ['pathsTop', 'Dráhy shora', '#ffd166'], ['pathsBot', 'Dráhy zespodu', '#7fdcff'], ['toolWidth', 'Šířka nástroje', '#ffd16688'], ['rapids', 'Přejezdy', '#999']];
  for (const [k, t, c] of chips) {
    const ch = el('span', { class: 'lchip' + (st.layers[k] ? ' on' : '') }, el('i', { style: `background:${c}` }), t);
    ch.addEventListener('click', () => { st.layers[k] = !st.layers[k]; viewer.setOpts({ layers: st.layers }); renderLayerChips(); });
    box.append(ch);
  }
}
function setTool(t) {
  st.tool = t;
  document.querySelectorAll('#toolMode button').forEach(x => x.classList.toggle('on', x.dataset.tool === t));
  viewer.cancelDraft(); viewer.setOpts({ tool: t });
  $('#cv').dataset.tool = t;
  const hint = { pan: '', select: 'Klik = výběr díry, kusu mědi, tvaru nebo oblasti · Shift = přidat · tažení = obdélník děr · Esc = zpět na posun', clear: 'Táhni obdélník, nebo klikej body mnohoúhelníku (uzavři klikem na první bod / Enter) · Esc zruší / zpět na posun', block: 'Oblast, kde se nemá frézovat: obdélník tažením, nebo body klikáním · Enter dokončí · Esc zruší / zpět na posun', pin: 'Klik = přidat kolíček (přichytí se k díře nebo na rastr 0,5 mm) · tažení kolíčku = posun · Del = smazat vybraný · Esc = zpět na posun', tab: 'Klik na dráhu ořezu = přidat můstek · tažení můstku = posun po dráze · Del = smazat vybraný · Esc = zpět na posun' }[t];
  $('#toolHint').textContent = hint; $('#toolHint').classList.toggle('on', !!hint);
}
document.querySelectorAll('#toolMode button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
document.querySelectorAll('#viewMode button').forEach(b => b.addEventListener('click', () => {
  st.mode = b.dataset.mode;
  document.querySelectorAll('#viewMode button').forEach(x => x.classList.toggle('on', x === b));
  viewer.setOpts({ mode: st.mode }); viewer.fit();
}));
$('#btnFit').addEventListener('click', () => viewer.fit());

// ---------- uložení ----------
function download(name, text) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function stepsText() {
  const tmp = document.createElement('div');
  const lines = [`CuMill – postup výroby: ${st.board.name}`, `Vytvořeno ${new Date().toLocaleString('cs-CZ')}`, ''];
  buildSteps().forEach((s, i) => { tmp.innerHTML = s.h; lines.push(`${i + 1}. ${tmp.textContent}${s.tag ? ' [' + s.tag + ']' : ''}`); });
  lines.push('', 'Kontroly:');
  for (const c of st.res.checks) { lines.push(`- ${c.text}`); if (c.list?.length) lines.push('  ' + c.list.join(', ')); }
  lines.push('', 'Programy:');
  for (const op of st.res.ops.filter(o => st.enabled[o.id] !== false)) lines.push(`- ${fileName(op)}: ${op.title}, ${op.tool}, F${op.prm.feed} S${op.prm.spindle}, ≈ ${Math.max(1, Math.round(opMin(op)))} min`);
  return lines.join('\r\n') + '\r\n';
}
async function saveAll(pickNew = false) {
  if (!st.res) return;
  const ops = st.res.ops.filter(o => st.enabled[o.id] !== false);
  if (!ops.length) { toast('Není vybraný žádný program.', true); return; }
  const files = ops.map(o => [fileName(o), o.gcode]);
  files.push([`${CAM.fileSafe(st.board.name)}_postup.txt`, stepsText()]);
  const prefix = CAM.fileSafe(st.board.name) + '_';
  try {
    if (host.native) {
      let dir = !pickNew && st.outDir ? st.outDir : null;
      if (!dir) {
        const start = st.outDir || (st.sources[0]?.path ? st.sources[0].path.replace(/[\\/][^\\/]*$/, '') : '');
        const j = await (await api('pick-dir', { start })).json();
        if (!j.path) return;
        dir = j.path; st.outDir = dir; db.set('outp:' + st.board.name, dir);
      }
      const j = await (await api('write', { dir, files: files.map(([name, text]) => ({ name, text })), cleanPrefix: prefix })).json();
      toast(`Uloženo ${j.written} souborů do ${dir}${j.removed ? ` (odstraněno ${j.removed} starých)` : ''}.`, false, [['Jiná složka…', () => saveAll(true)]]);
      return;
    }
    if (!('showDirectoryPicker' in window)) { for (const [n, t] of files) download(n, t); toast(`Staženo ${files.length} souborů.`); return; }
    let dir = !pickNew && st.outDir && await ensurePerm(st.outDir, 'readwrite') ? st.outDir : null;
    if (!dir) {
      dir = await window.showDirectoryPicker({ id: 'cumill-out', mode: 'readwrite', startIn: st.outDir || st.sources[0]?.handle || 'documents' });
      st.outDir = dir; db.set('out:' + st.board.name, dir);
    }
    const keep = new Set(files.map(f => f[0]));
    let removed = 0;
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && name.startsWith(prefix) && /_\d\d_.+\.nc$/.test(name) && !keep.has(name)) { try { await dir.removeEntry(name); removed++; } catch {} }
    for (const [n, t] of files) { const fh = await dir.getFileHandle(n, { create: true }); const w = await fh.createWritable(); await w.write(t); await w.close(); }
    toast(`Uloženo ${files.length} souborů do složky „${dir.name}“${removed ? ` (odstraněno ${removed} starých)` : ''}.`, false, [['Jiná složka…', () => saveAll(true)]]);
  } catch (e) { if (e.name !== 'AbortError') toast('Uložení selhalo: ' + e.message, true); }
}
function showCode(op) {
  $('#codeTitle').textContent = fileName(op);
  const lines = op.gcode.split('\n');
  $('#codeBody').textContent = lines.length > 6000 ? lines.slice(0, 6000).join('\n') + `\n\n… (${lines.length - 6000} dalších řádků)` : op.gcode;
  $('#codeDlg').showModal();
}
$('#codeClose').addEventListener('click', () => $('#codeDlg').close());
function exportSettings() { download('cumill-nastaveni.json', JSON.stringify(S, null, 2)); }
function importSettings() {
  const i = el('input', { type: 'file', accept: '.json' });
  i.addEventListener('change', async () => { try { S = merge(CAM.defaults(), JSON.parse(await i.files[0].text())); saveSettings(); renderSettings(); recompute(); toast('Nastavení načteno.'); } catch { toast('Neplatný soubor nastavení.', true); } });
  i.click();
}

// ---------- drobnosti UI ----------
let toastT;
function toast(msg, err = false, actions = []) {
  const t = $('#toast'); t.innerHTML = ''; t.append(msg);
  for (const [txt, fn] of actions) { const b = el('button', { class: 'btn small', style: 'margin-left:10px' }, txt); b.addEventListener('click', () => { t.classList.remove('on'); fn(); }); t.append(b); }
  t.className = 'toast on' + (err ? ' err' : '') + (actions.length ? ' act' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), actions.length ? 7000 : err ? 6000 : 3500);
}
function busy(on) { $('#busy').classList.toggle('on', on); }

$('#btnOpen').addEventListener('click', openDialog);
$('#btnOpen2').addEventListener('click', openDialog);
$('#fileInput').addEventListener('change', e => { const fs = [...e.target.files]; if (fs.length) loadSources(pickSources(fs.map(f => ({ file: f, name: f.name })))); e.target.value = ''; });
$('#btnReload').addEventListener('click', () => st.sources.length && loadSources(st.sources, { keepView: true }));
$('#btnSave').addEventListener('click', () => saveAll(false));
const stage = $('#stage');
stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('dragover'); });
stage.addEventListener('dragleave', e => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('dragover'); });
stage.addEventListener('drop', async e => {
  e.preventDefault(); stage.classList.remove('dragover');
  const items = [...e.dataTransfer.items].filter(i => i.kind === 'file');
  const list = [];
  for (const it of items) {
    let h = null;
    try { if (it.getAsFileSystemHandle) h = await it.getAsFileSystemHandle(); } catch {}
    if (h && h.kind === 'directory') { for await (const [n, c] of h.entries()) if (c.kind === 'file' && /\.(kicad_pcb|gbr|gtl|gbl|gko|gm1|drl|xln)$/i.test(n)) list.push({ handle: c, name: n }); }
    else if (h) list.push({ handle: h, name: h.name });
    else { const f = it.getAsFile(); if (f) list.push({ file: f, name: f.name }); }
  }
  const gfiles = list.filter(x => isGcodeName(x.name));
  if (gfiles.length) { addGcodeFiles(await Promise.all(gfiles.map(async x => ({ name: x.name, text: await (x.handle ? await x.handle.getFile() : x.file).text() })))); return; }
  if (list.length) { loadSources(pickSources(list)); if (list.some(s => s.file) && $('#chkWatch').checked) toast('Přetažený soubor se nedá sledovat – pro sledování změn otevři desku tlačítkem Otevřít.'); }
});
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); openSettingsDlg(); }
  else if ((e.ctrlKey || e.metaKey) && !typing && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y') && gvs.tab !== 'machine') { e.preventDefault(); undoRedo(e.key.toLowerCase() === 'y' || e.shiftKey ? 1 : -1); }
  else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); gvs.tab === 'gcode' ? openGcodeDialog() : openDialog(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(e.shiftKey); }
  else if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) { e.preventDefault(); if (st.sources.length) loadSources(st.sources, { keepView: true }); }
  else if (e.key === 'F2') { e.preventDefault(); setTab('board'); }
  else if (e.key === 'F3') { e.preventDefault(); setTab('gcode'); }
  else if (e.key === 'F4') { e.preventDefault(); setTab('machine'); }
  else if (typing) return;
  else if (gvs.tab === 'machine') { /* klávesy řeší záložka Stroj */ }
  else if (gvs.tab === 'gcode') { if ([' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && !$('#gcode').contains(document.activeElement)) { e.preventDefault(); $('#gcode').dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: false })); } }
  else if (e.key === 'Escape') {
    // 1. rozkreslená oblast, 2. návrat z nástroje (kolíček, oblast, výběr) na posun, 3. zrušení výběru
    if (viewer.draft) viewer.cancelDraft();
    else if (st.tool !== 'pan') setTool('pan');
    else { st.pick = null; viewer.setOpts({ selection: null }); renderInspector(); }
  }
  else if (e.key === 'Enter' && viewer.draft) viewer.finishDraft();
  else if (e.key === 'Backspace' && viewer.draft) { e.preventDefault(); viewer.undoDraft(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && st.pick?.kind === 'pin') { removePin(st.pick.idx); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && st.pick?.kind === 'tab') { removeTab(st.pick.idx); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && st.pick?.kind === 'area') { for (const a of st.pick.items) B.areas.splice(B.areas.indexOf(a), 1); st.pick = null; boardChanged(); }
  else if (!e.ctrlKey && !e.altKey) { const m = { h: 'pan', v: 'select', o: 'clear', z: 'block', k: 'pin', m: 'tab' }[e.key.toLowerCase()]; if (m) setTool(m); }
});

// sledování změn souboru (uložení v KiCadu)
const chkWatch = $('#chkWatch');
chkWatch.checked = localStorage.getItem('cumill.watch') !== '0';
chkWatch.addEventListener('change', () => localStorage.setItem('cumill.watch', chkWatch.checked ? '1' : '0'));
setInterval(async () => {
  if (!chkWatch.checked || !st.sources.length || !st.sources.every(s => s.handle || s.path)) return;
  try {
    for (const s of st.sources) {
      const m = await statSource(s);
      if (s.lastModified && m && m !== s.lastModified) {
        await new Promise(r => setTimeout(r, 400)); // KiCad dopisuje soubor
        await loadSources(st.sources, { keepView: true });
        toast('Deska změněna v KiCadu – přepočítáno.');
        return;
      }
    }
  } catch {}
}, 1500);

// spojení se spouštěčem (v režimu prohlížeče ukončí program po zavření okna)
setInterval(() => fetch('/api/ping', { cache: 'no-store' }).catch(() => {}), 2000);


// ---------- záložka G-kód (vizualizér jako v Candle) ----------
const gvs = { tab: 'board', gv: null, ext: [], cur: null, lastText: null };
function getGv() {
  if (!gvs.gv) {
    gvs.gv = new GcodeViewer($('#gcode'), { rapid: S.machine.rapid || 1500, onOpenFile: openGcodeDialog });
    gvs.gv.onSource = id => showGcode(id);
  }
  return gvs.gv;
}
function setTab(tab) {
  gvs.tab = tab;
  for (const b of $('#mainTab').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
  $('#stage').hidden = tab !== 'board';
  $('#gcode').hidden = tab !== 'gcode';
  $('#machine').hidden = tab !== 'machine';
  document.querySelector('main.layout').classList.toggle('mmode', tab === 'machine');
  if (tab === 'machine') getMachine().show();
  if (tab === 'gcode') { getGv(); showGcode(gvs.cur && findGSource(gvs.cur) ? gvs.cur : (st.sel ? 'op:' + st.sel : gvs.ext[0]?.id)); }
  else viewer.draw();
}
$('#mainTab').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
function gSources() {
  const list = [];
  if (st.res) for (const op of st.res.ops) list.push({ id: 'op:' + op.id, label: `${op.no} · ${op.title}` });
  for (const x of gvs.ext) list.push({ id: x.id, label: `Soubor · ${x.name}` });
  return list;
}
function findGSource(id) {
  if (!id) return null;
  if (id.startsWith('op:')) { const op = st.res?.ops.find(o => o.id === id.slice(3)); return op ? { op } : null; }
  const x = gvs.ext.find(e => e.id === id); return x ? { ext: x } : null;
}
// ---------- kalibrace odhadu času (podle skutečných běhů na stroji) ----------
const TC_LS = 'cumill.timecal.v1';
const timeCalData = () => { try { return JSON.parse(localStorage.getItem(TC_LS) || '{}'); } catch { return {}; } };
function timeFactor(kind) { const d = timeCalData()[kind]; return d && d.n ? d.f : 1; }
function timeCal(kind, ratio) {
  if (!(ratio > 0.3 && ratio < 4)) return;
  const d = timeCalData(), c = d[kind] || { f: 1, n: 0 };
  c.f = c.n ? (c.f * Math.min(c.n, 5) + ratio) / (Math.min(c.n, 5) + 1) : ratio; c.n++;
  d[kind] = c; try { localStorage.setItem(TC_LS, JSON.stringify(d)); } catch {}
  renderOps();
}
const opMin = op => op.minutes * timeFactor(op.kind);
// ---------- deník výroby ----------
const JR_LS = 'cumill.journal.v1';
const journal = () => { try { return { runs: [], tools: {}, ...JSON.parse(localStorage.getItem(JR_LS) || '{}') }; } catch { return { runs: [], tools: {} }; } };
const journalSave = J => { try { localStorage.setItem(JR_LS, JSON.stringify(J)); } catch {} };

// ---------- projekt (.cumill): deska + nastavení + úpravy + výšková mapa v jednom souboru ----------
async function saveProject() {
  if (!st.board) { toast('Nejdřív načti desku.', true); return; }
  const files = [];
  for (const src of st.sources) { const f = await readSource(src); files.push({ name: f.name, path: src.path || null, text: f.text }); }
  const map = machineUI?.getMap?.() || null;
  const prj = { cumillProject: 1, version: CAM.VERSION, saved: new Date().toISOString(), board: st.board.name, files, S, B, enabled: st.enabled, map };
  download(`${CAM.fileSafe(st.board.name)}.cumill`, JSON.stringify(prj));
  toast('Projekt uložen (deska, nastavení, úpravy' + (map ? ', výšková mapa' : '') + ').');
}
async function openProject(text) {
  const prj = JSON.parse(text);
  if (!prj.cumillProject) throw new Error('Soubor není projekt CuMillu.');
  S = merge(CAM.defaults(), prj.S); saveSettings();
  try { localStorage.setItem('cumill.board.' + prj.board, JSON.stringify(prj.B)); } catch {}
  // deska: aktuální soubor z KiCadu, pokud ještě existuje (a jde sledovat změny), jinak uložená kopie
  let sources = null;
  if (host.native && prj.files.every(f => f.path)) {
    try { for (const f of prj.files) await api('stat?path=' + encodeURIComponent(f.path)); sources = prj.files.map(f => ({ path: f.path, name: f.name })); } catch { sources = null; }
  }
  if (!sources) sources = prj.files.map(f => ({ file: new File([f.text], f.name), name: f.name }));
  await loadSources(sources);
  if (prj.enabled) { st.enabled = prj.enabled; renderOps(); }
  if (prj.map) getMachine().setMap(prj.map);
  toast(`Projekt ${prj.board} načten${prj.map ? ' i s výškovou mapou' : ''}.`);
}

// ---------- export pro laser (SVG, stejná nula jako frézování) ----------
const LASER_LS = 'cumill.laser.v1';
function openLaserDlg() {
  if (!st.board || !st.res) { toast('Nejdřív načti desku.', true); return; }
  const o = (() => { try { return { silkF: true, silkB: false, maskF: false, maskB: false, outline: true, origin: true, maskGrow: 0.05, ...JSON.parse(localStorage.getItem(LASER_LS) || '{}') }; } catch { return {}; } })();
  const d = el('dialog', { class: 'mdlg' });
  const chk = (k, label) => { const i = el('input', { type: 'checkbox' }); i.checked = !!o[k]; i.addEventListener('change', () => o[k] = i.checked); return el('label', { class: 'f check' }, i, label); };
  const grow = el('input', { value: String(o.maskGrow).replace('.', ',') });
  d.append(el('div', { class: 'dlghead' }, el('b', {}, 'Export pro laser (SVG)')),
    el('div', { class: 'dlgbody' },
      el('p', { class: 'muted small' }, 'Pro každou stranu jeden SVG v souřadnicích stroje (stejná nula jako G-kódy, spodní strana zrcadleně). Barvy = vrstvy v LightBurnu: potisk černě, maska modře, obrys červeně, nula zeleně.'),
      chk('silkF', 'Potisk horní F.SilkS'), chk('silkB', 'Potisk spodní B.SilkS'),
      chk('maskF', 'Maska horní – plošky k odpálení'), chk('maskB', 'Maska spodní – plošky k odpálení'),
      el('div', { class: 'f' }, el('label', {}, 'Zvětšit plošky masky o'), el('div', { class: 'inp' }, grow, el('span', { class: 'u' }, 'mm'))),
      chk('outline', 'Obrys desky'), chk('origin', 'Křížek v nule stroje (pro zarovnání)')),
    el('div', { class: 'dlgfoot' }, el('button', { class: 'btn', onclick: () => d.close() }, 'Zrušit'),
      el('button', { class: 'btn primary', onclick: () => { o.maskGrow = num(grow.value) ?? 0.05; try { localStorage.setItem(LASER_LS, JSON.stringify(o)); } catch {} d.close(); exportLaser(o); } }, 'Exportovat')));
  document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
}
function exportLaser(o) {
  const b = st.board, res = st.res;
  if (!b.silk && (o.silkF || o.silkB)) toast('Potisk je jen v desce KiCad (.kicad_pcb).', true);
  let n = 0;
  for (const side of ['top', 'bottom']) {
    const F = side === 'top' ? 'F' : 'B';
    const want = { silk: o['silk' + F] && b.silk, mask: o['mask' + F] };
    if (!want.silk && !want.mask) continue;
    const tf = res.sides[side].fwd;
    const groups = [];
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0; // rozsah včetně nuly stroje
    const pathD = (polys, closed) => polys.map(p => 'M' + p.map(q => { const [x, y] = tf(q); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); return `${x.toFixed(4)},${(-y).toFixed(4)}`; }).join('L') + (closed ? 'Z' : '')).join('');
    if (want.silk) {
      const src = b.silk[F + '.SilkS'];
      const lines = [...src.lines, ...src.loops.map(l => l.concat([l[0]]))];
      let d1 = pathD(lines, false);
      const texts = src.texts.map(t => `<path d="${pathD(textToLines(t), false)}" stroke-width="${t.thick.toFixed(3)}"/>`).join('');
      groups.push(`<g id="potisk" fill="none" stroke="#000000" stroke-width="0.15" stroke-linecap="round" stroke-linejoin="round"><path d="${d1}"/>${texts}</g>`);
    }
    if (want.mask) {
      let pads = b.silkAvoid?.pads?.[F + '.Cu'] || [];
      if (o.maskGrow) pads = G.offset(pads, o.maskGrow);
      groups.push(`<g id="maska" fill="#0000FF" stroke="none"><path fill-rule="evenodd" d="${pathD(pads, true)}"/></g>`);
    }
    if (o.outline) groups.push(`<g id="obrys" fill="none" stroke="#FF0000" stroke-width="0.1"><path d="${pathD([b.outline, ...b.inner], true)}"/></g>`);
    // rozsah: obrys desky a nula stroje
    pathD([b.outline], true);
    x0 -= 2; y0 -= 2; x1 += 2; y1 += 2;
    if (o.origin) groups.push(`<g id="nula" fill="none" stroke="#00E000" stroke-width="0.1"><path d="M-1.5,0L1.5,0M0,-1.5L0,1.5"/><circle cx="0" cy="0" r="0.6"/></g>`);
    const W = x1 - x0, H = y1 - y0;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- CuMill ${CAM.VERSION} – ${b.name}, strana ${side === 'top' ? 'horní' : 'spodní (zrcadleně)'}; souřadnice stroje v mm, nula = ${originCz()} -->\n<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(3)}mm" height="${H.toFixed(3)}mm" viewBox="${x0.toFixed(3)} ${(-y1).toFixed(3)} ${W.toFixed(3)} ${H.toFixed(3)}">\n${groups.join('\n')}\n</svg>\n`;
    download(`${CAM.fileSafe(b.name)}_laser_${side === 'top' ? 'horni' : 'spodni_ZRCADLENO'}.svg`, svg);
    n++;
  }
  toast(n ? `Exportováno ${n} SVG pro laser.` : 'Nic nevybráno.', !n);
}

// ---------- okno Nastavení (vše na jednom místě) + barevná témata ----------
T.onChange(() => { if (typeof viewer !== 'undefined') { viewer.draw(); } renderOps?.(); gvs.gv?.draw(); machineUI?.redraw(); renderLayerChips?.(); });
const SET_PAGES = [['look', 'Vzhled'], ['colors', 'Barvy tématu'], ['defaults', 'Výchozí hodnoty desky'], ['machine', 'Stroj a G-kód'], ['probe', 'Sonda a výšková mapa'], ['keys', 'Klávesy pendantu'], ['backup', 'Zálohy']];
let setPage = 'look';
function openSettingsDlg(page) {
  let d = $('#setDlg');
  if (!d) {
    d = el('dialog', { id: 'setDlg', class: 'wide setdlg' });
    d.addEventListener('close', () => { renderSettings(); recompute(); });
    document.body.append(d);
  }
  if (page) setPage = page;
  renderSettingsDlg();
  if (!d.open) d.showModal();
}
function renderSettingsDlg() {
  const d = $('#setDlg'); d.innerHTML = '';
  const nav = el('nav', { class: 'setnav' }, ...SET_PAGES.map(([k, t]) => el('button', { class: k === setPage ? 'on' : '', onclick: () => { setPage = k; renderSettingsDlg(); } }, t)));
  const body = el('div', { class: 'setbody' });
  d.append(el('div', { class: 'dlghead' }, el('b', {}, 'Nastavení'), el('button', { class: 'iconbtn', title: 'Zavřít (Esc)', onclick: () => d.close() }, '✕')), el('div', { class: 'setwrap' }, nav, body));
  ({ look: setLook, colors: setColors, defaults: setDefaults, machine: setMachine, probe: setProbe, keys: setKeys, backup: setBackup })[setPage](body);
}
const swatch = c => el('span', { class: 'swatches' }, ...['bg', 'panel', 'cu', 'stage', 'fcu', 'bcu', 'opIsoF', 'simFr'].map(k => el('i', { style: `background:${c[k]}` })));
function setLook(B) {
  const st = T.getState(), cur = T.current();
  B.append(el('h3', {}, 'Barevné téma'));
  const grid = el('div', { class: 'themegrid' });
  for (const t of T.allThemes()) grid.append(el('button', { class: 'themecard' + (t.id === st.active ? ' on' : ''), onclick: () => { T.setActive(t.id); renderSettingsDlg(); } }, swatch(t.c), el('b', {}, t.name), el('small', {}, t.preset ? 'hotové' : 'vlastní')));
  B.append(grid);
  const row = el('div', { class: 'mrow' },
    el('button', { class: 'btn small', onclick: () => { T.createCustom(cur.id); setPage = 'colors'; renderSettingsDlg(); } }, cur.preset ? 'Vytvořit vlastní téma z tohoto' : 'Duplikovat'),
    !cur.preset ? el('button', { class: 'btn small', onclick: () => { setPage = 'colors'; renderSettingsDlg(); } }, 'Upravit barvy') : null,
    !cur.preset ? el('button', { class: 'btn small', onclick: () => { if (confirm(`Smazat téma „${cur.name}“?`)) { T.remove(cur.id); renderSettingsDlg(); } } }, 'Smazat') : null,
    el('button', { class: 'btn small', onclick: () => download(`tema_${cur.name.replace(/[^\p{L}\p{N}]+/gu, '_')}.json`, T.exportTheme(cur.id)) }, 'Exportovat'),
    el('button', { class: 'btn small', onclick: () => pickFile('.json', txt => { try { T.importTheme(txt); renderSettingsDlg(); toast('Téma načteno.'); } catch (e) { toast(e.message, true); } }) }, 'Importovat'));
  B.append(row);
  if (!cur.preset) {
    const name = el('input', { value: cur.name });
    name.addEventListener('change', () => { T.rename(cur.id, name.value.trim() || cur.name); renderSettingsDlg(); });
    const light = el('input', { type: 'checkbox', checked: cur.light });
    light.addEventListener('change', () => T.setLight(cur.id, light.checked));
    B.append(el('div', { class: 'f' }, el('label', {}, 'Název tématu'), el('div', { class: 'inp' }, name)), el('label', { class: 'f check' }, light, 'Světlé téma (ovládací prvky Windows ve světlé variantě)'));
  }
  B.append(el('h3', {}, 'Velikost rozhraní'));
  B.append(el('div', { class: 'seg2' }, ...[80, 90, 100, 110, 125, 150].map(z => el('button', { class: (st.zoom || 100) === z ? 'on' : '', onclick: () => { T.setZoom(z); renderSettingsDlg(); } }, z + ' %'))));
}
function setColors(B) {
  const cur = T.current();
  if (cur.preset) {
    B.append(el('p', { class: 'muted' }, `Hotové téma „${cur.name}“ nejde měnit. Vytvoř si z něj vlastní kopii a uprav cokoliv.`),
      el('button', { class: 'btn primary', onclick: () => { T.createCustom(cur.id); renderSettingsDlg(); } }, 'Vytvořit vlastní téma z tohoto'));
    return;
  }
  B.append(el('p', { class: 'muted small' }, `Téma „${cur.name}“ – změny se hned projeví v celé aplikaci. Průhlednost: posuvník vedle barvy.`));
  let group = null, box = null;
  for (const [k, label, g] of T.KEYS) {
    if (g !== group) { group = g; B.append(el('h3', {}, g)); box = el('div', { class: 'colgrid' }); B.append(box); }
    const hex = cur.c[k] || '#000000', rgb = hex.slice(0, 7), a = hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) : 255;
    const pick = el('input', { type: 'color', value: rgb });
    const alpha = el('input', { type: 'range', min: 0, max: 255, value: a, title: 'Průhlednost' });
    const txt = el('input', { class: 'hex', value: hex });
    const commit = v => { T.setColor(cur.id, k, v); txt.value = v; };
    const fromPick = () => commit(pick.value + (+alpha.value < 255 ? (+alpha.value).toString(16).padStart(2, '0') : ''));
    pick.addEventListener('input', fromPick); alpha.addEventListener('input', fromPick);
    txt.addEventListener('change', () => { const v = txt.value.trim(); if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) { pick.value = v.slice(0, 7); alpha.value = v.length === 9 ? parseInt(v.slice(7), 16) : 255; commit(v.toLowerCase()); } else txt.value = cur.c[k]; });
    box.append(el('label', { class: 'colrow' }, el('span', {}, label), pick, alpha, txt));
  }
}
const SKIP_TYPES = new Set(['holetable', 'layers', 'copperedits', 'geolayers', 'toollist', 'pinlist', 'tablist']);
function setFields(B, secs) {
  for (const sec of SECTIONS.filter(x => secs.includes(x.id))) {
    B.append(el('h3', {}, sec.title));
    const box = el('div', { class: 'fields' });
    for (const f of sec.fields) { if (SKIP_TYPES.has(f.type)) continue; const n = renderField(f); if (f.show && !f.show()) n.style.display = 'none'; box.append(n); }
    if (sec.id === 'tools') box.append(el('div', { class: 'f wide' }, el('button', { class: 'btn small', onclick: openToolDialog }, 'Upravit knihovnu nástrojů…')));
    B.append(box);
  }
}
function setDefaults(B) {
  B.append(el('p', { class: 'muted small' }, 'Stejná nastavení jako v panelu vlevo, přehledně na jednom místě. Úpravy jednotlivých děr, mědi, geometrie, kolíčků a můstků se dělají v náhledu a pamatují se u desky.'));
  setFields(B, ['tools', 'setup', 'pins', 'iso', 'drill', 'geo', 'silk', 'cut']);
}
function setMachine(B) {
  setFields(B, ['machine']);
  B.append(el('h3', {}, 'Kalibrace odhadu času'), el('p', { class: 'muted small' }, 'Po každém celém běhu na stroji se porovná skutečný čas s odhadem a příští odhady se upraví.'));
  const d = timeCalData(), names = { iso: 'Izolace', drill: 'Vrtání', mill: 'Frézování děr', cut: 'Ořez', pins: 'Kolíčky', geo: 'Geometrie', silk: 'Gravírování potisku', soubor: 'Cizí soubory' };
  const t = el('table', { class: 'keys' });
  for (const [k, v] of Object.entries(d)) t.append(el('tr', {}, el('td', {}, names[k] || k), el('td', {}, `× ${cz(v.f, 2)}`), el('td', { class: 'muted' }, `${v.n} ${pl(v.n, 'běh', 'běhy', 'běhů')}`)));
  B.append(Object.keys(d).length ? t : el('div', { class: 'muted small' }, 'Zatím žádný dokončený běh.'),
    el('div', { class: 'mrow' }, el('button', { class: 'btn small', onclick: () => { localStorage.removeItem(TC_LS); renderSettingsDlg(); renderOps(); } }, 'Vynulovat kalibraci')));
}
function setProbe(B) { getMachine().renderProbeInto(B); }
function setKeys(B) { getMachine().renderKeysInto(B, () => renderSettingsDlg()); }
function pickFile(accept, cb) { const i = el('input', { type: 'file', accept }); i.addEventListener('change', async () => { if (i.files[0]) cb(await i.files[0].text()); }); i.click(); }
function setBackup(B) {
  const keys = () => Object.keys(localStorage).filter(k => k.startsWith('cumill.'));
  B.append(el('h3', {}, 'Záloha všeho'),
    el('p', { class: 'muted small' }, 'Nastavení, knihovna nástrojů, témata, stroj a pendant, i úpravy všech desek (díry, oblasti, kolíčky, můstky…) do jednoho souboru.'),
    el('div', { class: 'mrow' },
      el('button', { class: 'btn', onclick: () => download(`cumill_zaloha_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ cumillBackup: 1, data: Object.fromEntries(keys().map(k => [k, localStorage.getItem(k)])) }, null, 1)) }, 'Exportovat vše'),
      el('button', { class: 'btn', onclick: () => pickFile('.json', txt => { try { const j = JSON.parse(txt); if (!j.cumillBackup) throw new Error('Soubor není záloha CuMillu.'); if (!confirm('Nahradit současné nastavení zálohou? Aplikace se pak načte znovu.')) return; for (const [k, v] of Object.entries(j.data)) localStorage.setItem(k, v); location.reload(); } catch (e) { toast(e.message, true); } }) }, 'Obnovit ze zálohy…')),
    el('h3', {}, 'Jen nastavení desky (bez témat a úprav desek)'),
    el('div', { class: 'mrow' }, el('button', { class: 'btn small', onclick: exportSettings }, 'Export nastavení'), el('button', { class: 'btn small', onclick: importSettings }, 'Import')),
    el('h3', {}, 'Výchozí stav'),
    el('div', { class: 'mrow' },
      el('button', { class: 'btn small', onclick: () => { if (confirm('Vrátit nastavení desky a knihovnu nástrojů na výchozí hodnoty?')) { S = CAM.defaults(); saveSettings(); renderSettingsDlg(); recompute(); } } }, 'Výchozí nastavení desky'),
      el('button', { class: 'btn small', onclick: () => { if (confirm('Smazat úplně všechna nastavení, témata a úpravy desek? Doporučuju nejdřív Exportovat vše.')) { for (const k of keys()) localStorage.removeItem(k); location.reload(); } } }, 'Smazat vše')));
}
$('#btnSettings').addEventListener('click', () => openSettingsDlg());
$('#btnProject').addEventListener('click', () => saveProject());
$('#btnLaser').addEventListener('click', () => openLaserDlg());

// ---------- záložka Stroj ----------
let machineUI = null;
function getMachine() {
  if (!machineUI) machineUI = initMachine({
    api, toast, download, fileName, boardSimInfo, timeCal, timeFactor, journal, journalSave,
    getS: () => S, getRes: () => st.res, boardName: () => st.board?.name || '',
    isEnabled: op => st.enabled[op.id] !== false, originDesc: originCz,
    boardOutlineBB: side => st.board && st.res ? G.bbox([st.board.outline.map(st.res.sides[side].fwd)]) : null,
    boardHoles: side => st.board && st.res ? st.board.holes.filter(h => !h.slot).map(h => { const [x, y] = st.res.sides[side].fwd([h.x, h.y]); return { x, y, d: h.d }; }) : [],
    openGcodeFiles: async () => {
      if (host.native) {
        const j = await (await api('open', { start: '', kind: 'gcode' })).json();
        return j.paths?.length ? Promise.all(j.paths.map(p => readSource({ path: p, name: p.split(/[\\/]/).pop() }))) : [];
      }
      return new Promise(res => { const i = el('input', { type: 'file', multiple: true, accept: '.nc,.ngc,.gcode,.gc,.tap,.cnc,.txt' }); i.addEventListener('change', async () => res(await Promise.all([...i.files].map(async f => ({ name: f.name, text: await f.text() }))))); i.click(); });
    },
  });
  return machineUI;
}
// polotovar a motiv mědi ve strojových souřadnicích strany, na které program běží
function boardSimInfo(op) {
  const b = st.board, res = st.res; if (!b || !res) return {};
  const tf = res.sides[op.side].fwd;
  const obb = G.bbox([b.outline.map(tf)]);
  const su = S.setup;
  const cx = (obb.minX + obb.maxX) / 2, cy = (obb.minY + obb.maxY) / 2;
  const rot = (obb.maxX - obb.minX > obb.maxY - obb.minY) !== (su.blankW > su.blankH);
  const W = rot ? su.blankH : su.blankW, H = rot ? su.blankW : su.blankH;
  const stock = { minX: Math.min(cx - W / 2, obb.minX - 1), minY: Math.min(cy - H / 2, obb.minY - 1), maxX: Math.max(cx + W / 2, obb.maxX + 1), maxY: Math.max(cy + H / 2, obb.maxY + 1) };
  const layer = op.side === 'bottom' ? 'B.Cu' : 'F.Cu';
  const v = [];
  const lines = (polys, z) => { for (const poly of polys) for (let i = 0; i < poly.length; i++) { const p = tf(poly[i]), q = tf(poly[(i + 1) % poly.length]); v.push(p[0], p[1], z, q[0], q[1], z); } };
  lines(b.copper[layer] || [], 0.005);
  lines([b.outline, ...b.inner], 0.005);
  const tool = S.tools.find(t => t.id === op.toolId) || { type: op.kind === 'iso' ? 'v' : 'end', dia: op.toolDia || 0.2, vTip: 0.1, vAngle: 30 };
  // dřívější programy na téže straně (simulace navazuje)
  const i = res.ops.indexOf(op);
  const prev = res.ops.slice(0, i).filter(o => o.side === op.side && st.enabled[o.id] !== false).map(o => ({ text: o.gcode, tool: S.tools.find(t => t.id === o.toolId) || { type: 'end', dia: o.toolDia } }));
  return { stock, motif: new Float32Array(v), tool, prev, T: su.blankT || 1.6 };
}
function showGcode(id) {
  const gv = getGv();
  const src = findGSource(id);
  gv.setSources(gSources(), src ? id : '');
  if (!src) { gvs.cur = null; gv.clear(st.res ? 'Vyber program nahoře, nebo otevři soubor .nc.' : 'Načti desku (záložka Deska), nebo otevři libovolný soubor .nc – i z FlatCAMu.'); return; }
  const keepView = gvs.cur === id;
  gvs.cur = id;
  if (src.op) {
    const op = src.op;
    if (keepView && gvs.lastText === op.gcode) return;
    gvs.lastText = op.gcode;
    gv.load(op.gcode, { name: fileName(op), ...boardSimInfo(op), keepView });
    if (st.sel !== op.id) { st.sel = op.id; viewer.setOpts({ opId: op.id }); renderOps(); }
  } else {
    if (keepView && gvs.lastText === src.ext.text) return;
    gvs.lastText = src.ext.text;
    gv.load(src.ext.text, { name: src.ext.name, keepView });
  }
}
function addGcodeFiles(files) { // [{name, text}]
  let last = null;
  for (const f of files) {
    const old = gvs.ext.find(e => e.name === f.name);
    if (old) { old.text = f.text; last = old.id; }
    else { const x = { id: 'ext:' + Date.now().toString(36) + gvs.ext.length, name: f.name, text: f.text }; gvs.ext.push(x); last = x.id; }
  }
  if (!last) return;
  gvs.cur = null; // vynutit nové načtení
  if (gvs.tab !== 'gcode') { gvs.cur = last; setTab('gcode'); } else showGcode(last);
}
async function openGcodeDialog() {
  try {
    if (host.native) {
      const j = await (await api('open', { start: '', kind: 'gcode' })).json();
      if (j.paths?.length) addGcodeFiles(await Promise.all(j.paths.map(async p => readSource({ path: p, name: p.split(/[\\/]/).pop() }))));
    } else $('#gcodeInput').click();
  } catch (e) { toast(e.message, true); }
}
$('#gcodeInput').addEventListener('change', async e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) addGcodeFiles(await Promise.all(fs.map(async f => ({ name: f.name, text: await f.text() })))); });
const isGcodeName = n => /\.(nc|ngc|gcode|gc|tap|cnc)$/i.test(n);
{
  const gbox = $('#gcode');
  gbox.addEventListener('dragover', e => { e.preventDefault(); gbox.classList.add('dragover'); });
  gbox.addEventListener('dragleave', e => { if (!gbox.contains(e.relatedTarget)) gbox.classList.remove('dragover'); });
  gbox.addEventListener('drop', async e => {
    e.preventDefault(); gbox.classList.remove('dragover');
    const fs = [...e.dataTransfer.files];
    if (fs.length) addGcodeFiles(await Promise.all(fs.map(async f => ({ name: f.name, text: await f.text() }))));
  });
}

function bindPinHandlers() {
viewer.onPinDown = (p, scale) => {
  if (st.tool === 'tab') {
    const cur = st.res?.cutTabs?.list || [];
    const tol = Math.max((st.res?.cutTabs?.len || 4) / 2, 10 / scale);
    const q = cur.filter(t => !t.problem || Array.isArray(B.tabs)).find(t => Math.hypot(t.x - p[0], t.y - p[1]) < tol);
    if (!q) return null;
    const wasAuto = !Array.isArray(B.tabs);
    const k = wasAuto ? cur.filter(t => !t.problem).indexOf(q) : q.idx;
    ensureManualTabs(); if (wasAuto) { saveBoardSettings(); refreshVisibility(); renderTabList(); }
    st.pick = { kind: 'tab', idx: k }; viewer.setOpts({ selection: st.pick }); renderInspector();
    return k;
  }
  const list = B.pins || [];
  const tol = Math.max(1.5, 10 / scale);
  // ve zdroji díry/vzor se tažením převezmou do ručního režimu
  const cur = S.pins.source === 'manual' ? list : (st.res?.pinsOn ? st.res.pins : []);
  const i = cur.findIndex(q => Math.hypot(q.x - p[0], q.y - p[1]) < tol);
  if (i < 0) return null;
  ensureManual();
  st.pick = { kind: 'pin', idx: i }; viewer.setOpts({ selection: st.pick }); renderInspector();
  return i;
};
viewer.onPinMove = (i, p, scale) => {
  if (st.tool === 'tab') { const q = snapTab(p, scale); if (!q) return; B.tabs[i] = { x: +q.x.toFixed(4), y: +q.y.toFixed(4) }; viewer.opts.tabPreview = { x: q.x, y: q.y, ang: q.ang }; viewer.draw(false); return; } const q = snapPin(p, scale); B.pins[i] = { x: q.x, y: q.y }; viewer.opts.pinPreview = { i, x: q.x, y: q.y }; viewer.draw(false); };
viewer.onPinUp = () => { viewer.opts.pinPreview = null; viewer.opts.tabPreview = null; boardChanged(); };
viewer.onPinAdd = (p, scale) => {
  if (st.tool === 'tab') {
    if (!st.res?.cutTabs) { toast('Nejdřív zapni Ořez desky.', true); return; }
    const q = snapTab(p, scale);
    if (!q) { toast('Klikni přímo na dráhu ořezu.', true); return; }
    ensureManualTabs();
    B.tabs.push({ x: +q.x.toFixed(4), y: +q.y.toFixed(4) });
    st.pick = { kind: 'tab', idx: B.tabs.length - 1 };
    boardChanged(); refreshVisibility();
    return;
  }
  ensureManual();
  const q = snapPin(p, scale);
  B.pins.push({ x: q.x, y: q.y });
  st.pick = { kind: 'pin', idx: B.pins.length - 1 };
  boardChanged();
  toast(q.hole ? 'Kolíček přidán do díry desky.' : `Kolíček přidán (X ${cz(q.x, 2)}, Y ${cz(-q.y, 2)}).`);
};

}
bindPinHandlers();
window._cm = { saveProject, openProject, exportLaser, undoRedo, getMachine: () => getMachine(), recompute, gvs, setTab, addGcodeFiles, st, viewer, hitTest, loadSources, saveAll, host, get B() { return B; }, get S() { return S; } }; // ladění
(async () => {
  await detectHost();
  renderSettings();
  renderLayerChips();
  viewer.setOpts({ layers: st.layers });
  setTool('pan');
  renderRecent();
  // testovací načtení: ?open=<cesta na stejném serveru>
  const qOpen = new URLSearchParams(location.search).get('open');
  if (qOpen) fetch(qOpen).then(r => r.blob()).then(b => { const n = qOpen.split('/').pop(); loadSources([{ file: new File([b], n), name: n }]); });
})();
