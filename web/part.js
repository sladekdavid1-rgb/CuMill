// Režim Díl: zakázka z hotových programů (.nc) z Fusionu 360 – pořadí, nástroje z knihovny,
// polotovar, limity, kontroly a simulace úběru materiálu přes všechny programy.
import { parseGcode } from './gparse.js';
import { GcodeViewer } from './gview.js';
import * as PC from './partcore.js';

const cz = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('cs-CZ', { maximumFractionDigits: d });
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.max(1, Math.round(m))} min`;
const LVL = { err: 0, lim: 1, warn: 2, info: 3 };
const LVL_CZ = { err: 'nejde spustit', lim: 'vyžaduje potvrzení', warn: 'pozor', info: 'info' };
const DB_KEY = 'part.job.v1';
export const newJob = () => ({ name: '', files: [], stock: { w: 100, h: 60, t: 10, xy: 'll', z: 'top', x0: 0, y0: 0, zTop: 0 }, material: '', sel: null });

export function initPart(ctx) {
  const { el, numInput, selectBox } = ctx;
  let job = newJob();
  const cache = new Map(); // id souboru -> odvozená data (podle textu)
  const P = { job: () => job };
  let simState = { key: null, busy: false, progress: 0, results: null, error: null, cell: 0 };
  let selIssue = null;

  // ---------- odvozená data programu ----------
  function info(f) {
    let c = cache.get(f.id);
    if (c && c.text === f.text) return c;
    const hdr = PC.fusionTools(f.text);
    const prep = PC.prepGcode(f.text);
    const g = parseGcode(prep.text, { rapid: ctx.getS().machine.rapid || 1500 });
    const stats = PC.progStats(g);
    const used = prep.tools.length ? prep.tools[0] : null;
    const h = (used != null && hdr[used]) || Object.values(hdr)[0] || null;
    // názvy operací z Fusionu: komentáře na samostatném řádku za hlavičkou, např. „(Adaptive2)“
    const ops = [];
    const lines = f.text.split(/\r?\n/);
    let seenG = false;
    for (const l of lines.slice(0, 400000)) {
      const t = l.trim();
      if (!t) continue;
      if (/^\(/.test(t) && /\)$/.test(t)) { if (seenG && !/^\(T\d+\s+D=/i.test(t) && !/rozepsán|výměnu|omezeno/i.test(t)) { const nm = t.slice(1, -1).trim(); if (nm && nm.length < 48 && !ops.includes(nm)) ops.push(nm); } continue; }
      if (/^[GMTSFXYZ]/i.test(t)) seenG = true;
    }
    c = { text: f.text, hdr, h, prep, g, stats, ops: ops.slice(0, 8), minutes: g.total };
    cache.set(f.id, c);
    return c;
  }
  const S = () => ctx.getS();
  const toolOf = f => S().tools.find(t => t.id === f.toolId) || null;
  const geom = () => PC.stockGeom(job.stock);
  const limOf = f => PC.effLimits(S(), toolOf(f), job.material);
  const simDef = t => t ? { type: t.type, dia: t.type === 'v' ? (t.dia > (t.vTip ?? 0) ? t.dia : t.vTip) : t.dia, vTip: t.type === 'v' ? (t.vTip ?? 0) : undefined, vAngle: t.vAngle, tipAngle: t.tipAngle, cone: true } : null;
  const onFiles = () => job.files.filter(f => f.on !== false);

  // ---------- zakázka ----------
  let saveT = null;
  function changed({ sim = true, render = true } = {}) {
    clearTimeout(saveT); saveT = setTimeout(() => { ctx.db.set(DB_KEY, job); ctx.onJobChange?.(); }, 400);
    if (sim) scheduleSim();
    if (render) renderAll();
  }
  async function restore() {
    const j = await ctx.db.get(DB_KEY);
    if (j && Array.isArray(j.files)) job = { ...newJob(), ...j, stock: { ...newJob().stock, ...(j.stock || {}) } };
    for (const f of job.files) autoTool(f);
    scheduleSim(true);
  }
  function autoTool(f) {
    if (f.toolId && S().tools.some(t => t.id === f.toolId)) return;
    const m = PC.matchTool(S().tools, info(f).h);
    f.toolId = m ? m.id : null;
  }
  // přidání souborů: stejný název = nová verze (přenahrání z Fusionu)
  function addFiles(list) {
    let added = 0, upd = 0;
    for (const x of list) {
      const old = job.files.find(f => f.name === x.name);
      if (old) { old.text = x.text; if (x.path) old.path = x.path; old.mtime = x.mtime || Date.now(); cache.delete(old.id); autoTool(old); upd++; continue; }
      const f = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: x.name, path: x.path || null, text: x.text, on: true, toolId: null, mtime: x.mtime || Date.now() };
      autoTool(f);
      job.files.push(f); added++;
    }
    // nové soubory seřadit podle názvu (Fusion čísluje 1001, 1002… nebo podle operací), ruční pořadí starých zůstane
    if (added && added === job.files.length) job.files.sort((a, b) => a.name.localeCompare(b.name, 'cs', { numeric: true }));
    if (!job.name && job.files.length) job.name = job.files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]?\d+$/, '') || 'Díl';
    if (!job.sel && job.files.length) job.sel = job.files[0].id;
    changed();
    ctx.toast(`${added ? `Přidáno ${added} ${added === 1 ? 'program' : added < 5 ? 'programy' : 'programů'}` : ''}${added && upd ? ', ' : ''}${upd ? `aktualizováno ${upd}` : ''}.`);
  }
  async function reloadFromDisk() {
    let n = 0, miss = 0;
    for (const f of job.files) {
      if (!f.path) continue;
      try { const r = await ctx.readPath(f.path); if (r.text !== f.text) { f.text = r.text; cache.delete(f.id); autoTool(f); n++; } } catch { miss++; }
    }
    changed();
    ctx.toast(n ? `Načteno znovu: ${n} ${n === 1 ? 'program se změnil' : 'programy se změnily'}.` : miss ? 'Některé soubory na disku už nejsou – zůstávají uložené kopie.' : 'Žádný program se nezměnil.', !!miss);
  }
  function setJob(j) {
    job = { ...newJob(), ...j, stock: { ...newJob().stock, ...(j?.stock || {}) } };
    cache.clear(); simState = { key: null, busy: false, progress: 0, results: null, error: null };
    for (const f of job.files) autoTool(f);
    changed();
  }

  // ---------- kontroly ----------
  function issuesOf(f, { machine = null } = {}) {
    const c = info(f), lim = limOf(f);
    const I = PC.staticIssues({ stats: c.stats, prep: c.prep, toolId: f.toolId, g: c.g }, lim, geom(), machine || {});
    for (const n of c.prep.notes) I.push({ level: 'info', code: 'prep', text: n });
    // nástroj v hlavičce vs. přiřazený
    const t = toolOf(f), h = c.h;
    if (t && h) {
      const td = t.type === 'v' ? (t.dia > (t.vTip ?? 0) ? t.dia : t.vTip) : t.dia;
      if (t.type !== h.kind || Math.abs(td - h.dia) > 0.011) I.push({ level: 'lim', code: 'mismatch', text: `přiřazený nástroj (${ctx.toolLabel(t)}) neodpovídá nástroji z Fusionu (${PC.hdrLabel(h)})` });
    }
    const sr = simState.results?.find(r => r.id === f.id);
    if (sr && simState.key === simKey()) for (const it of sr.issues) I.push({ ...it, sim: true });
    else if (f.on !== false && f.toolId) I.push({ level: 'info', code: 'nosim', text: simState.busy ? 'simulace úběru běží…' : 'simulace úběru zatím neproběhla' });
    I.sort((a, b) => LVL[a.level] - LVL[b.level]);
    return I;
  }
  const worst = I => I.reduce((m, i) => Math.min(m, LVL[i.level]), 9);

  // ---------- simulace ----------
  let simT = null, worker = null, simId = 0;
  function simKey() {
    const g = geom();
    return JSON.stringify([g.rect, g.zTop, g.T, job.material, onFiles().map(f => [f.id, f.text.length, f.text.slice(-200), f.toolId, JSON.stringify(toolOf(f)), JSON.stringify(limOf(f))])]);
  }
  function scheduleSim(now) { clearTimeout(simT); simT = setTimeout(runSim, now ? 30 : 600); }
  function getWorker() {
    if (worker === null) {
      try { worker = new Worker('partworker.js', { type: 'module' }); worker.onmessage = e => onSim(e.data); worker.onerror = e => { console.error(e); worker = false; }; }
      catch { worker = false; }
    }
    return worker;
  }
  function runSim() {
    const key = simKey();
    if (key === simState.key && simState.results) return;
    const files = onFiles().filter(f => f.toolId);
    if (!files.length) { simState = { key, busy: false, progress: 0, results: [], error: null }; renderAll(); return; }
    const id = ++simId;
    const msg = { id, geom: geom(), rapid: S().machine.rapid || 1500, progs: files.map(f => ({ id: f.id, text: info(f).prep.text, tool: simDef(toolOf(f)), lim: limOf(f) })) };
    simState = { ...simState, busy: true, progress: 0, pendingKey: key };
    renderSimBar();
    const w = getWorker();
    if (w) w.postMessage(msg);
    else setTimeout(() => { try { onSim({ id, result: PC.simulateJob(msg.geom, msg.progs, { rapid: msg.rapid }) }); } catch (e) { onSim({ id, error: e.message }); } }, 10);
  }
  function onSim(d) {
    if (d.id !== simId) return;
    if (d.progress != null && !d.result) { simState.progress = d.progress; renderSimBar(); return; }
    if (d.error) { simState = { ...simState, busy: false, error: d.error }; ctx.toast('Simulace úběru selhala: ' + d.error, true); renderAll(); return; }
    simState = { key: simState.pendingKey, busy: false, progress: 1, results: d.result.results, cell: d.result.cell, error: null };
    renderAll();
    ctx.onJobChange?.();
  }
  P.simDone = () => !simState.busy && simState.key === simKey();
  P.waitSim = async (ms = 60000) => { const t0 = Date.now(); scheduleSim(true); while (!P.simDone() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 100)); return P.simDone(); };

  // ---------- výsledek pro záložky Stroj / G-kód (jako u desky) ----------
  function res() {
    if (!job.files.length) return null;
    const ops = job.files.map((f, i) => {
      const c = info(f), t = toolOf(f);
      return {
        id: f.id, no: i + 1, kind: 'part', side: 'top', part: true,
        title: f.name.replace(/\.[^.]+$/, '') + (c.ops.length ? ` – ${c.ops.slice(0, 3).join(', ')}` : ''),
        short: f.name.replace(/\.[^.]+$/, ''), fileName: f.name,
        tool: t ? ctx.toolLabel(t) : PC.hdrLabel(c.h), toolId: t?.id || null, toolDia: t?.dia || c.h?.dia || 1,
        prm: { feed: Math.round(c.stats.maxF), plunge: Math.round(c.stats.maxPlunge), spindle: Math.round(c.stats.maxS) },
        gcode: c.prep.text, minutes: c.minutes, stats: c.stats, lim: limOf(f),
      };
    });
    return { ops, part: true, probePts: {}, pinsOn: false };
  }
  P.res = res;
  P.isEnabled = op => job.files.find(f => f.id === op.id)?.on !== false;
  P.issues = (op, machine) => { const f = job.files.find(x => x.id === op.id); return f ? issuesOf(f, { machine }) : []; };
  P.originText = () => PC.originText(job.stock);
  P.stockText = () => { const g = geom(); return `${cz(g.w, 1)} × ${cz(g.h, 1)} × ${cz(g.T, 1)} mm${job.material ? ', ' + job.material : ''}`; };
  // polotovar, nástroj a předchozí programy pro 3D simulaci (Stroj, G-kód)
  const prevObjs = new Map();
  function simInfo(op, withMarks = false) {
    const g = geom(), i = job.files.findIndex(f => f.id === op.id); if (i < 0) return {};
    const f = job.files[i];
    const prev = job.files.slice(0, i).filter(x => x.on !== false && x.toolId).map(x => {
      const text = info(x).prep.text; let o = prevObjs.get(x.id);
      if (!o || o.text !== text || o.toolKey !== JSON.stringify(toolOf(x))) { o = { text, tool: simDef(toolOf(x)), g: info(x).g, toolKey: JSON.stringify(toolOf(x)) }; prevObjs.set(x.id, o); }
      return o;
    });
    const r = { stock: g.rect, T: g.T, zTop: g.zTop, part: true, prev, tool: simDef(toolOf(f)) || { type: 'end', dia: info(f).h?.dia || 1, cone: true } };
    if (withMarks) r.marks = marksOf(f);
    return r;
  }
  P.simInfo = op => simInfo(op);
  function marksOf(f) {
    const sr = simState.results?.find(r => r.id === f.id); if (!sr) return null;
    const out = [];
    for (const it of sr.issues) for (const m of it.marks || []) out.push({ ...m, level: it.level === 'lim' || it.level === 'err' ? 'err' : 'warn', sel: selIssue && selIssue.f === f.id && selIssue.code === it.code && m.line === it.line });
    return out;
  }

  // ---------- UI ----------
  const root = ctx.root;
  root.innerHTML = '';
  const left = el('div', { class: 'pt-left' }), mid = el('div', { class: 'pt-mid' }), right = el('div', { class: 'pt-right' });
  root.append(left, mid, right);
  const simBar = el('div', { class: 'pt-simbar' });
  const gvBox = el('div', { class: 'pt-gv' });
  mid.append(simBar, gvBox);
  let gv = null;
  function getGv() {
    if (!gv) { gv = new GcodeViewer(gvBox, { rapid: S().machine.rapid || 1500, onOpenFile: () => openFiles() }); gv.onSource = id => { job.sel = id; selIssue = null; changed({ sim: false }); }; }
    return gv;
  }
  let gvKey = null;
  function showSel() {
    const v = getGv();
    v.setSources(job.files.map((f, i) => ({ id: f.id, label: `${i + 1} · ${f.name}${f.on === false ? ' (vypnuto)' : ''}` })), job.sel || '');
    const f = job.files.find(x => x.id === job.sel);
    if (!f) { gvKey = null; v.clear(job.files.length ? 'Vyber program vlevo.' : 'Přidej programy z Fusionu 360 (.nc) – tlačítkem vlevo nebo přetažením sem.'); return; }
    const si = simInfo({ id: f.id }, true), c = info(f);
    const key = JSON.stringify([f.id, c.prep.text.length, c.prep.text.slice(-100), si.stock, si.zTop, si.T, si.tool, si.prev.map(p => p.text.length)]);
    if (key === gvKey) { v.setMarks(si.marks); return; }
    const keep = gvKey && JSON.parse(gvKey)[0] === f.id;
    gvKey = key;
    v.load(c.prep.text, { name: f.name, ...si, g: c.g, keepView: keep });
  }

  async function openFiles() {
    try { const list = await ctx.openGcodeFiles(); if (list?.length) addFiles(list); } catch (e) { ctx.toast(e.message, true); }
  }
  P.openFiles = openFiles;
  P.addFiles = addFiles;

  function renderSimBar() {
    simBar.innerHTML = '';
    const files = onFiles();
    const total = files.reduce((s, f) => s + info(f).minutes, 0);
    const all = files.flatMap(f => issuesOf(f));
    const nErr = all.filter(i => i.level === 'err').length, nLim = all.filter(i => i.level === 'lim').length, nWarn = all.filter(i => i.level === 'warn').length;
    simBar.append(
      el('b', {}, job.name || 'Díl'),
      el('span', { class: 'muted' }, `${files.length} ${files.length === 1 ? 'program' : files.length < 5 && files.length ? 'programy' : 'programů'} · celkem ≈ ${fmtMin(total)}`),
      el('span', { class: 'pt-sp' }),
      simState.busy ? el('span', { class: 'pt-busy' }, el('i', { style: `width:${Math.round(simState.progress * 100)}%` }), `Simulace úběru ${Math.round(simState.progress * 100)} %`)
        : el('span', { class: 'chip ' + (nErr || nLim ? 'bad' : nWarn ? 'warnc' : 'okc') }, nErr ? `${nErr} nejde spustit` : nLim ? `${nLim} k potvrzení` : nWarn ? `${nWarn} varování` : 'Kontroly v pořádku'));
  }

  function progCard(f, i) {
    const c = info(f), t = toolOf(f), I = issuesOf(f), w = worst(I);
    const tools = S().tools;
    const toolSel = el('select', { title: 'Nástroj z knihovny – podle něj se hlídají limity a počítá simulace' },
      el('option', { value: '' }, '— vyber nástroj z knihovny —'),
      ...tools.map(x => el('option', { value: x.id, selected: x.id === f.toolId }, ctx.toolLabel(x) + (x.type === 'v' ? '' : ''))));
    toolSel.addEventListener('change', () => { f.toolId = toolSel.value || null; changed(); });
    const card = el('div', { class: 'pcard' + (job.sel === f.id ? ' sel' : '') + (f.on === false ? ' off' : '') + (w === 0 ? ' e' : w === 1 ? ' l' : w === 2 ? ' w' : ''), draggable: 'true', 'data-id': f.id });
    const chk = el('input', { type: 'checkbox', title: 'Zahrnout do výroby' }); chk.checked = f.on !== false;
    chk.addEventListener('change', () => { f.on = chk.checked; changed(); });
    chk.addEventListener('click', e => e.stopPropagation());
    const mv = d => { const j = i + d; if (j < 0 || j >= job.files.length) return; job.files.splice(i, 1); job.files.splice(j, 0, f); changed(); };
    const zr = c.g.cutBB ? `Z ${cz(c.stats.minZcut, 2)} … ${cz(c.g.bb.maxZ, 1)}` : 'bez řezu';
    card.append(...[
      el('div', { class: 'pc-h' },
        el('span', { class: 'pc-grip', title: 'Přetáhni pro změnu pořadí' }, '⋮⋮'), chk,
        el('span', { class: 'pc-no' }, String(i + 1)),
        el('b', { class: 'pc-name', title: f.path || f.name }, f.name),
        el('span', { class: 'muted small' }, '≈ ' + fmtMin(c.minutes)),
        el('button', { class: 'iconbtn sm', title: 'Posunout nahoru', onclick: e => { e.stopPropagation(); mv(-1); } }, '▲'),
        el('button', { class: 'iconbtn sm', title: 'Posunout dolů', onclick: e => { e.stopPropagation(); mv(1); } }, '▼'),
        el('button', { class: 'iconbtn sm', title: 'Odebrat ze zakázky', onclick: e => { e.stopPropagation(); if (confirm(`Odebrat „${f.name}“ ze zakázky?`)) { job.files = job.files.filter(x => x !== f); if (job.sel === f.id) job.sel = job.files[0]?.id || null; changed(); } } }, '✕')),
      c.ops.length ? el('div', { class: 'pc-ops muted small' }, c.ops.join(' · ')) : null,
      el('div', { class: 'pc-hdr small' }, el('span', { class: 'muted' }, 'Fusion: '), PC.hdrLabel(c.h)),
      el('div', { class: 'pc-tool' }, el('div', { class: 'inp' }, toolSel),
        c.h && !t ? el('button', { class: 'btn small', title: 'Založit nástroj podle hlavičky z Fusionu (průměr, typ, F, S) a přiřadit ho', onclick: e => { e.stopPropagation(); const nt = PC.toolFromHeader(c.h, c.stats); S().tools.push(nt); ctx.toolsChanged(); f.toolId = nt.id; for (const o of job.files) if (!o.toolId) autoTool(o); changed(); ctx.toast(`Nástroj ${ctx.toolLabel(nt)} přidán do knihovny – doplň mu limity v záložce Nástroje.`); } }, '+ Do knihovny') : null),
      el('div', { class: 'pc-st muted small' }, [c.stats.maxF ? `F ${cz(c.stats.maxF, 0)}` : null, c.stats.maxPlunge ? `zanoření ${cz(c.stats.maxPlunge, 0)}` : null, c.stats.maxS ? `S ${cz(c.stats.maxS, 0)}` : null, zr].filter(Boolean).join(' · ')),
      I.filter(x => x.level !== 'info').length ? el('div', { class: 'pc-iss' }, ...I.filter(x => x.level !== 'info').slice(0, 3).map(x => el('div', { class: 'pi ' + x.level }, x.text)), I.filter(x => x.level !== 'info').length > 3 ? el('div', { class: 'muted small' }, `… a další v Kontrolách`) : null) : null].filter(Boolean));
    card.addEventListener('click', () => { if (job.sel !== f.id) { job.sel = f.id; selIssue = null; changed({ sim: false }); } });
    toolSel.addEventListener('click', e => e.stopPropagation());
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/kimill-prog', f.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('drag'); });
    card.addEventListener('dragend', () => card.classList.remove('drag'));
    card.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/kimill-prog')) { e.preventDefault(); card.classList.add('over'); } });
    card.addEventListener('dragleave', () => card.classList.remove('over'));
    card.addEventListener('drop', e => {
      const id = e.dataTransfer.getData('text/kimill-prog'); card.classList.remove('over');
      if (!id || id === f.id) return; e.preventDefault(); e.stopPropagation();
      const from = job.files.findIndex(x => x.id === id); const it = job.files.splice(from, 1)[0];
      const to = job.files.indexOf(f); job.files.splice(to + (from <= to ? 1 : 0), 0, it); changed();
    });
    return card;
  }

  function stockCard() {
    const s = job.stock;
    const box = el('div', { class: 'pt-card' }, el('h3', {}, 'Polotovar a nula'));
    const grid = el('div', { class: 'pt-grid' });
    const fld = (label, inp) => el('label', { class: 'f' }, el('span', {}, label), inp);
    grid.append(
      fld('Šířka X', numInput(() => s.w, v => { s.w = v; changed(); }, { unit: 'mm' })),
      fld('Hloubka Y', numInput(() => s.h, v => { s.h = v; changed(); }, { unit: 'mm' })),
      fld('Tloušťka Z', numInput(() => s.t, v => { s.t = v; changed(); }, { unit: 'mm' })),
      fld('Materiál', selectBox([['', '— bez materiálu (výchozí limity) —'], ...(S().limits?.mats || []).map(m => [m, m])], job.material || '', v => { job.material = v; changed(); })),
      fld('Nula X/Y ve Fusionu', selectBox(PC.ORIGINS.map(([k, t]) => [k, t[0].toUpperCase() + t.slice(1) + (k === 'custom' ? '' : ' polotovaru')]), s.xy, v => { s.xy = v; changed(); })),
      fld('Nula Z ve Fusionu', selectBox([['top', 'Vrch polotovaru'], ['bottom', 'Spodek polotovaru (stůl)'], ['custom', 'Vlastní']], s.z, v => { s.z = v; changed(); })));
    if (s.xy === 'custom') grid.append(fld('Levý přední roh X', numInput(() => s.x0, v => { s.x0 = v; changed(); }, { unit: 'mm' })), fld('Levý přední roh Y', numInput(() => s.y0, v => { s.y0 = v; changed(); }, { unit: 'mm' })));
    if (s.z === 'custom') grid.append(fld('Vrch polotovaru je v Z', numInput(() => s.zTop, v => { s.zTop = v; changed(); }, { unit: 'mm' })));
    box.append(grid, el('div', { class: 'hint' }, 'Zadej to stejně jako ve Fusionu v Setup → Stock a WCS. Podle toho KiMill simuluje úběr a hlídá, jestli program nejede skrz materiál, který tam ještě je. Limity se berou podle materiálu (záložka Nástroje).'));
    // rozsah programů vůči polotovaru
    const g = geom(); let bb = null;
    for (const f of onFiles()) { const b = info(f).g.cutBB; if (!b) continue; bb = bb ? { minX: Math.min(bb.minX, b.minX), minY: Math.min(bb.minY, b.minY), maxX: Math.max(bb.maxX, b.maxX), maxY: Math.max(bb.maxY, b.maxY) } : { ...b }; }
    if (bb) {
      const out = bb.minX < g.rect.minX - 5 || bb.minY < g.rect.minY - 5 || bb.maxX > g.rect.maxX + 5 || bb.maxY > g.rect.maxY + 5;
      box.append(el('div', { class: 'muted small' + (out ? ' pt-warn' : '') }, `Programy řežou v X ${cz(bb.minX, 1)} … ${cz(bb.maxX, 1)}, Y ${cz(bb.minY, 1)} … ${cz(bb.maxY, 1)} mm${out ? ' – hodně mimo polotovar, sedí nula X/Y a rozměr?' : ''}.`));
    }
    return box;
  }

  function renderLeft() {
    left.innerHTML = '';
    const nm = el('input', { type: 'text', value: job.name || '', placeholder: 'název dílu' });
    nm.addEventListener('change', () => { job.name = nm.value.trim(); changed({ sim: false }); });
    nm.addEventListener('keydown', e => e.stopPropagation());
    const head = el('div', { class: 'pt-card' },
      el('h3', {}, 'Zakázka'),
      el('div', { class: 'inp' }, nm),
      el('div', { class: 'mrow' },
        el('button', { class: 'btn small primary', onclick: openFiles, title: 'Programy z Fusionu 360 (postprocesor Grbl) – každý nástroj zvlášť. Stejný název = nová verze.' }, '+ Přidat programy…'),
        el('button', { class: 'btn small', disabled: !job.files.some(f => f.path), onclick: reloadFromDisk, title: 'Znovu načíst programy ze složky (po novém exportu z Fusionu)' }, 'Načíst znovu'),
        el('button', { class: 'btn small', onclick: () => ctx.openProjects(), title: 'Uložit zakázku jako projekt / otevřít projekt' }, 'Projekt…'),
        job.files.length ? el('button', { class: 'btn small', onclick: () => { if (confirm('Začít novou prázdnou zakázku? (Uložené projekty zůstanou.)')) { ctx.newJob?.(); setJob(newJob()); } } }, 'Nová') : null));
    left.append(head);
    const list = el('div', { class: 'pt-list' });
    if (!job.files.length) list.append(el('div', { class: 'pt-empty' }, el('p', {}, 'Ve Fusionu 360 ulož každý nástroj jako samostatný program (Post Process → Grbl), pak je sem přidej najednou nebo přetáhni.'), el('p', { class: 'muted small' }, 'KiMill přečte nástroj z hlavičky, přiřadí ho z knihovny, ohlídá limity a nasimuluje úběr materiálu přes všechny programy.')));
    job.files.forEach((f, i) => list.append(progCard(f, i)));
    left.append(list, stockCard());
  }

  function renderRight() {
    right.innerHTML = '';
    right.append(el('div', { class: 'phead' }, el('h2', {}, 'Kontroly')));
    const box = el('div', { class: 'pt-checks' });
    let any = false;
    job.files.forEach((f, i) => {
      if (f.on === false) return;
      const I = issuesOf(f).filter(x => x.level !== 'info' || x.code === 'nosim' || x.code === 'prep');
      if (!I.length) return; any = true;
      box.append(el('div', { class: 'pt-ch' }, `${i + 1} · ${f.name}`));
      for (const it of I) {
        const row = el('div', { class: 'pt-is ' + it.level + (it.line != null ? ' link' : '') + (selIssue && selIssue.f === f.id && selIssue.code === it.code ? ' sel' : ''), title: it.line != null ? 'Ukázat místo v náhledu' : '' },
          el('span', { class: 'lv' }, LVL_CZ[it.level]),
          el('span', {}, (it.line != null ? `řádek ${it.line + 1}: ` : '') + it.text));
        if (it.line != null) row.addEventListener('click', () => {
          selIssue = { f: f.id, code: it.code };
          if (job.sel !== f.id) { job.sel = f.id; changed({ sim: false }); } else renderAll();
          const v = getGv(); v.gotoLine?.(it.line); v._scrollToLine?.(it.line, true);
          if (it.x != null && v.cam) { v.cam.tx = it.x; v.cam.ty = it.y; v.cam.tz = it.z ?? 0; v.draw(); }
        });
        box.append(row);
      }
    });
    if (!any) box.append(el('p', { class: 'muted pad' }, job.files.length ? 'Bez nálezů.' : 'Po přidání programů se tu objeví kontroly.'));
    right.append(box);
    right.append(el('div', { class: 'phead' }, el('h2', {}, 'Postup')));
    const ol = el('ol', { class: 'steps' });
    ol.append(el('li', {}, `Upni polotovar ${P.stockText()}.`), el('li', {}, `Nula: ${P.originText()}.`));
    let last = null;
    onFiles().forEach(f => { const t = toolOf(f); const lab = t ? ctx.toolLabel(t) : PC.hdrLabel(info(f).h); if (lab !== last) ol.append(el('li', {}, `Nasaď ${lab}, změř Z.`)); ol.append(el('li', {}, `Spusť ${f.name} (≈ ${fmtMin(info(f).minutes)}).`)); last = lab; });
    right.append(ol, el('p', { class: 'muted small pad' }, 'Výrobou tě provede průvodce v záložce Stroj.'));
  }

  function renderAll() {
    if (root.hidden) { dirty = true; return; }
    dirty = false;
    renderLeft(); renderRight(); renderSimBar(); showSel();
  }
  let dirty = true;
  P.show = () => { if (dirty) renderAll(); else { renderSimBar(); showSel(); } gv?._resize?.(); };
  P.render = () => renderAll();
  P.toolsChanged = () => { for (const f of job.files) autoTool(f); cache.forEach(() => {}); changed(); };
  P.setJob = setJob;
  P.restore = restore;
  P.reload = reloadFromDisk;
  P.info = f => info(f);
  P.simState = () => simState;
  P.gv = () => getGv();
  // přetažení souborů do záložky
  root.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); root.classList.add('dragover'); } });
  root.addEventListener('dragleave', e => { if (e.target === root) root.classList.remove('dragover'); });
  root.addEventListener('drop', async e => {
    root.classList.remove('dragover');
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    const fs = [...e.dataTransfer.files].filter(f => /\.(nc|ngc|gcode|gc|tap|cnc|txt)$/i.test(f.name));
    if (!fs.length) { ctx.toast('Přetáhni soubory .nc (G-kód z Fusionu).', true); return; }
    addFiles(await Promise.all(fs.map(async f => ({ name: f.name, text: await f.text(), path: f.path || null, mtime: f.lastModified }))));
  });
  return P;
}
