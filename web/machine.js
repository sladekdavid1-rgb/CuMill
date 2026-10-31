// Záložka „Stroj“: náhrada UGS a Candle – připojení ke GRBL, ovládání, posílání programu,
// výšková mapa, průvodce výrobou desky a pendant (klávesy F13–F24).
import { GcodeViewer } from './gview.js';
import * as HM from './hmap.js';
import * as TC from './testcut.js';
import * as MAT from './materials.js';

const LS = 'cumill.machine.v1';
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const cz = (v, d = 3) => v == null || !Number.isFinite(v) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const num = s => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : null; };
const fmt = v => String(+(+v).toFixed(4));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ERRORS = { 1: 'chybí písmeno příkazu', 2: 'chybná hodnota', 3: 'neznámý $ příkaz', 5: 'homing není zapnutý', 8: 'příkaz jen v klidu (Idle)', 9: 'stroj je v alarmu – odemkni ($X) nebo udělej homing', 15: 'pohyb by překročil rozsah stroje', 16: 'neplatný jog příkaz', 17: 'laserový režim', 20: 'nepodporovaný příkaz', 22: 'není nastavený posuv F', 24: 'dva příkazy pohybu na řádku', 33: 'neplatný cíl pohybu (oblouk)', 36: 'nepoužitá slova v příkazu' };
const ALARMS = { 1: 'koncový spínač (tvrdý limit) – po resetu je nutný homing', 2: 'pohyb mimo rozsah stroje (měkký limit)', 3: 'reset během pohybu – poloha nemusí sedět, udělej homing', 4: 'sonda byla sepnutá už před měřením', 5: 'sonda se nedotkla – zkontroluj klip a hloubku měření', 6: 'homing přerušen', 7: 'homing: dveře', 8: 'homing: nepodařilo se odjet od spínače', 9: 'homing: spínač nenalezen' };
const STATE_CZ = { Idle: 'Připraven', Run: 'Běží', Hold: 'Pozastaveno', Jog: 'Pojíždí', Alarm: 'Alarm', Door: 'Dveře', Check: 'Kontrola', Home: 'Homing', Sleep: 'Spánek', Odpojeno: 'Odpojeno', 'Připojuji': 'Připojuji' };
const SETTING_NAMES = { 0: 'Délka kroku (µs)', 1: 'Prodleva vypnutí motorů (ms)', 2: 'Invertovat kroky (maska)', 3: 'Invertovat směr (maska)', 4: 'Invertovat enable', 5: 'Invertovat koncové spínače', 6: 'Invertovat sondu', 10: 'Hlášení stavu', 11: 'Odchylka v rozích (mm)', 12: 'Tolerance oblouků (mm)', 13: 'Palce', 20: 'Měkké limity', 21: 'Tvrdé limity', 22: 'Homing', 23: 'Směr homingu (maska)', 24: 'Homing pomalu (mm/min)', 25: 'Homing rychle (mm/min)', 26: 'Homing debounce (ms)', 27: 'Homing odjezd (mm)', 30: 'Max. otáčky', 31: 'Min. otáčky', 32: 'Laserový režim', 100: 'X kroků/mm', 101: 'Y kroků/mm', 102: 'Z kroků/mm', 110: 'X max. rychlost (mm/min)', 111: 'Y max. rychlost', 112: 'Z max. rychlost', 120: 'X zrychlení (mm/s²)', 121: 'Y zrychlení', 122: 'Z zrychlení', 130: 'X rozsah (mm)', 131: 'Y rozsah (mm)', 132: 'Z rozsah (mm)' };

// akce pendantu a výchozí klávesy (stejně jako zkratky v UGS z repozitáře pendantu)
const ACTIONS = [
  ['jogX+', 'Jog X+', 'F13'], ['jogX-', 'Jog X−', 'F14'], ['jogY+', 'Jog Y+', 'F15'], ['jogY-', 'Jog Y−', 'F16'], ['jogZ+', 'Jog Z+', 'F17'], ['jogZ-', 'Jog Z−', 'F18'],
  ['hold', 'Pauza / pokračovat', 'F21'], ['start', 'Start programu', 'F22'], ['stop', 'Stop', 'F23'], ['unlock', 'Odemknout ($X)', 'F24'],
  ['zeroX', 'Nula X', 'S-F13'], ['zeroY', 'Nula Y', 'S-F14'], ['zeroZ', 'Nula Z', 'S-F15'], ['probeZ', 'Změřit Z sondou', 'S-F16'], ['home', 'Homing', 'S-F17'], ['rtz', 'Návrat na X0 Y0 Z0', 'S-F18'],
  ['feedMul', 'Rychlost jogu ×10', 'S-F19'], ['feedDiv', 'Rychlost jogu ÷10', 'S-F20'], ['feedP1k', 'Rychlost jogu +1000', 'S-F21'],
  ['xy001', 'Krok XY 0,01', 'C-F13'], ['xy01', 'Krok XY 0,1', 'C-F14'], ['xy1', 'Krok XY 1', 'C-F15'], ['xy10', 'Krok XY 10', 'C-F16'], ['xyMul', 'Krok XY ×10', 'C-F17'], ['xyPlus', 'Krok XY +', 'C-F18'],
  ['z001', 'Krok Z 0,01', 'C-F19'], ['z01', 'Krok Z 0,1', 'C-F20'], ['z1', 'Krok Z 1', 'C-F21'], ['z10', 'Krok Z 10', 'C-F22'], ['zPlus', 'Krok Z +', 'C-F23'],
  ['rtxy', 'Návrat na X0 Y0', ''], ['zeroAll', 'Nula X Y Z', ''],
];

export function initMachine(ctx) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
  const M = {
    on: false, port: saved.port || '', ports: [], token: '',
    st: { state: 'Odpojeno', mpos: null, wpos: null, wco: [0, 0, 0], fs: [0, 0], ov: [100, 100, 100], pn: '' },
    settings: {},
    jog: { xy: saved.jog?.xy ?? 1, z: saved.jog?.z ?? 0.1, feed: saved.jog?.feed ?? 1000 },
    probe: { type: 'clip', fast: 100, slow: 20, search: 10, retract: 0.5, double: true, plate: 0, clear: 2, tipDia: 2, xySearch: 10, cornerOff: 10, startH: 10, spot: 'auto', spotX: 0, spotY: 0, ...(saved.probe || {}) },
    setter: { on: false, x: null, y: null, z: -5, search: 30, ref: null, ...(saved.setter || {}) },
    lastTool: saved.lastTool || '', zTool: saved.zTool || '',
    lastRun: saved.lastRun || null,
    modeCfg: { cncMax: null, laserMax: null, ...(saved.modeCfg || {}) }, // null = převezme se z $30 stroje v daném režimu
    mapCfg: { nx: 5, ny: 4, centers: false, holes: true, margin: 0.6, zmin: -1.5, clear: 1, onBoard: true, ...(saved.mapCfg || {}) },
    keymap: { ...Object.fromEntries(ACTIONS.map(a => [a[0], a[2]])), ...(saved.keymap || {}) },
    zfeed: 100,
    prog: null, // { src, name, orig, text, op, tool, side }
    useMap: true, skips: [], stream: { done: 0, total: 0, streaming: false, paused: false },
    hmap: null, hmapMeta: null, mapping: false, mapAbort: false, mapSel: -1,
    checkRun: false, files: [], wizard: { i: 0, done: {} }, log: [],
    test: { toolId: '', material: '', thickness: 3, shape: 'rect', len: 20, w: 10, h: 10, side: 12, dia: 8, pocketShape: 'rect', overlap: 40, comp: 'center', climb: true, base: null, matrix: { on: false, rows: { key: 'feed', from: 200, to: 600, n: 3 }, cols: { key: 'depth', from: 0.2, to: 1, n: 3 } }, gap: 3, x: null, y: null, after: 'next', nextDX: null, nextDY: 0, park: null, skip: [], ...(saved.test || {}) },
  };
  const save = () => { try { localStorage.setItem(LS, JSON.stringify({ test: M.test, port: M.port, jog: M.jog, probe: M.probe, mapCfg: M.mapCfg, modeCfg: M.modeCfg, keymap: M.keymap, setter: M.setter, lastTool: M.lastTool, zTool: M.zTool, lastRun: M.lastRun })); } catch {} };

  // ---------- API ----------
  const call = async (path, body) => {
    const r = await ctx.api('m/' + path, body ?? {});
    return r.json();
  };
  const cmd = async (line, wait = false, timeout = 30) => {
    const r = await call('cmd', { line, wait, timeout });
    if (wait && !r.ok) {
      const code = +(r.resp || '').replace(/\D/g, '');
      throw new Error(`${line}: ${r.resp?.startsWith('ALARM') ? 'alarm – ' + (ALARMS[code] || r.resp) : ERRORS[code] || r.resp || 'chyba'}`);
    }
    return r;
  };
  const rt = (...bytes) => call('rt', { bytes }).catch(e => ctx.toast(e.message, true));
  const safeRun = fn => async (...a) => { try { await fn(...a); } catch (e) { ctx.toast(e.message, true); log('! ' + e.message, 'err'); } };

  // ---------- DOM ----------
  const resumeBox = el('div', { class: 'mresume', hidden: true });
  const journalPane = el('div', { class: 'mpane', hidden: true });
  const root = $('#machine');
  root.innerHTML = '';
  const left = el('aside', { class: 'mleft' }), center = el('section', { class: 'mcenter' }), right = el('aside', { class: 'mright' });
  root.append(left, center, right);

  // připojení
  const portSel = el('select', { class: 'mport' });
  const btnConn = el('button', { class: 'btn primary', onclick: safeRun(() => M.on ? disconnect() : connect()) }, 'Připojit');
  const badge = el('div', { class: 'mstate' }, 'Odpojeno');
  const bHome = el('button', { class: 'btn small', title: 'Homing ($H)', onclick: safeRun(() => act('home')) }, 'Homing');
  const bUnlock = el('button', { class: 'btn small', title: 'Odemknout ($X)', onclick: safeRun(() => act('unlock')) }, 'Odemknout');
  const bReset = el('button', { class: 'btn small', title: 'Měkký reset GRBL (Ctrl+X)', onclick: () => rt(0x18) }, 'Reset');
  left.append(card('Připojení',
    el('div', { class: 'mrow' }, portSel, el('button', { class: 'iconbtn', title: 'Znovu načíst porty', onclick: safeRun(refreshPorts), html: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>' }), btnConn),
    badge, el('div', { class: 'mrow' }, bHome, bUnlock, bReset)));

  // souřadnice
  const dro = {};
  const droBox = el('div', { class: 'dro' });
  for (const a of ['X', 'Y', 'Z']) {
    const w = el('button', { class: 'dro-w', title: `Klikni a zadej, jaká má být relativní souřadnice ${a} v tomto místě (stroj se nepohne)`, onclick: () => editAxis(a) }, '—');
    const m = el('span', { class: 'dro-m', title: 'Strojová (absolutní) souřadnice od homingu' }, '—');
    const z = el('button', { class: 'btn small', title: `Nulovat ${a} (G10 L20)`, onclick: safeRun(() => zeroAxes(a)) }, '0');
    dro[a] = { w, m };
    droBox.append(el('span', { class: 'dro-a' }, a), w, m, z);
  }
  const gotoInp = { X: el('input', { placeholder: 'X' }), Y: el('input', { placeholder: 'Y' }), Z: el('input', { placeholder: 'Z' }) };
  // režim: 'work' = pracovní souřadnice (od nuly desky), 'rel' = o kolik od aktuální polohy, 'mach' = strojové (G53)
  let gotoMode = 'work';
  const gotoHint = el('div', { class: 'muted small' });
  function renderGotoHint() {
    if (gotoMode !== 'mach') { gotoHint.textContent = gotoMode === 'rel' ? 'O kolik se posunout od aktuální polohy (např. Z 5 = o 5 mm nahoru).' : 'Poloha od nuly desky (pracovní souřadnice).'; return; }
    const r = ['X', 'Y', 'Z'].map((a, i) => { const pos = (M.st.mpos?.[i] || 0) > 0.5 || (M.st.wco?.[i] || 0) > 0.5, tr = cz(travel(a), 0); return `${a} ${pos ? `0 až ${tr}` : `0 až −${tr}`}`; });
    gotoHint.textContent = `Rozsah stroje: ${r.join(' · ')}. U záporné osy stačí napsat kladné číslo (Z 30 = Z −30).`;
  }
  const gotoSeg = el('div', { class: 'seg2', title: 'Pracovně = poloha od nuly desky · O kolik = posun od aktuální polohy · Strojově = souřadnice stroje (G53)' },
    el('button', { class: 'on', onclick: e => { gotoMode = 'work'; segOn(e.target); renderGotoHint(); } }, 'Pracovně'),
    el('button', { onclick: e => { gotoMode = 'rel'; segOn(e.target); renderGotoHint(); } }, 'O kolik'),
    el('button', { onclick: e => { gotoMode = 'mach'; segOn(e.target); renderGotoHint(); } }, 'Strojově'));
  left.append(card('Souřadnice',
    el('div', { class: 'dro-head' }, el('span'), el('span', {}, 'relativní'), el('span', {}, 'strojové'), el('span')), droBox,
    el('div', { class: 'mrow' }, el('button', { class: 'btn small', onclick: safeRun(() => zeroAxes('XYZ')) }, 'Vše na 0'), el('button', { class: 'btn small', title: 'Zrušit dočasný posun nuly G92 (G92.1)', onclick: safeRun(() => cmd('G92.1', true)) }, 'Zrušit G92')),
    el('div', { class: 'mrow' }, el('button', { class: 'btn small', onclick: safeRun(() => act('rtxy')) }, 'Na X0 Y0'), el('button', { class: 'btn small', onclick: safeRun(() => act('rtz')) }, 'Na X0 Y0 Z0')),
    el('div', { class: 'mlabel' }, 'Přejeď na'),
    el('div', { class: 'mrow goto' }, gotoInp.X, gotoInp.Y, gotoInp.Z, el('button', { class: 'btn small', onclick: safeRun(gotoXYZ) }, 'Jeď')), gotoSeg, gotoHint));

  // jog
  const stepsXY = [0.01, 0.05, 0.1, 1, 10, 50, 100], stepsZ = [0.01, 0.05, 0.1, 1, 10];
  const xyChips = el('div', { class: 'chipsel' }), zChips = el('div', { class: 'chipsel' });
  const feedInp = el('input', { class: 'feed', value: M.jog.feed });
  feedInp.addEventListener('change', () => { const v = num(feedInp.value); if (v > 0) { M.jog.feed = v; save(); } renderJog(); });
  const jb = (label, axis, dir, cls = '') => {
    const b = el('button', { class: 'jogb ' + cls, title: `${axis}${dir > 0 ? '+' : '−'} – klik = krok, podržet = plynule` }, label);
    holdButton(b, () => jogStep(axis, dir), () => jogStart(axis, dir), jogStop);
    return b;
  };
  left.append(card('Pojezd (jog)',
    el('div', { class: 'jogpad' },
      el('span'), jb('Y+', 'Y', 1), el('span'), jb('Z+', 'Z', 1, 'z'),
      jb('X−', 'X', -1), el('span', { class: 'jogc' }, 'XY'), jb('X+', 'X', 1), el('span'),
      el('span'), jb('Y−', 'Y', -1), el('span'), jb('Z−', 'Z', -1, 'z')),
    el('div', { class: 'mlabel' }, 'Krok XY (mm)'), xyChips, el('div', { class: 'mlabel' }, 'Krok Z (mm)'), zChips,
    el('div', { class: 'mrow' }, el('span', { class: 'mlabel' }, 'Rychlost'), feedInp, el('span', { class: 'muted' }, 'mm/min'),
      el('button', { class: 'btn small', onclick: () => feedAct('feedDiv') }, '/10'), el('button', { class: 'btn small', onclick: () => feedAct('feedMul') }, '×10'))));

  // vřeteno a korekce
  const sInp = el('input', { class: 'feed', value: ctx.getS().machine.spindle || 12000 });
  const ovRow = (label, key, minus10, minus1, reset, plus1, plus10) => {
    const v = el('b', { class: 'ovv' }, '100 %');
    const row = el('div', { class: 'ovrow' }, el('span', {}, label), v,
      el('button', { class: 'btn small', onclick: minus10 }, '−10'), el('button', { class: 'btn small', onclick: minus1 }, '−1'),
      el('button', { class: 'btn small', onclick: reset }, '100'), el('button', { class: 'btn small', onclick: plus1 }, '+1'), el('button', { class: 'btn small', onclick: plus10 }, '+10'));
    row._v = v; return row;
  };
  const zf = d => safeRun(async () => { M.zfeed = d === 0 ? 100 : Math.max(10, Math.min(200, M.zfeed + d)); await call('zfeed', { pct: M.zfeed }); renderOv(); })();
  const ovF = ovRow('Posuv XY', 'f', () => rt(0x92), () => rt(0x94), () => rt(0x90), () => rt(0x93), () => rt(0x91));
  const ovZ = ovRow('Posuv Z', 'z', () => zf(-10), () => zf(-1), () => zf(0), () => zf(1), () => zf(10));
  ovZ.title = 'Posuv zanoření v ose Z – mění se v řádcích, které ještě nejsou ve stroji (projeví se s malým zpožděním)';
  const ovS = ovRow('Otáčky', 's', () => rt(0x9B), () => rt(0x9D), () => rt(0x99), () => rt(0x9C), () => rt(0x9A));
  const ovR = el('div', { class: 'ovrow' }, el('span', {}, 'Rychloposuv'), el('b', { class: 'ovv' }, '100 %'),
    el('button', { class: 'btn small', onclick: () => rt(0x97) }, '25'), el('button', { class: 'btn small', onclick: () => rt(0x96) }, '50'), el('button', { class: 'btn small', onclick: () => rt(0x95) }, '100'));
  left.append(card('Vřeteno a korekce',
    el('div', { class: 'mrow' }, el('span', { class: 'mlabel' }, 'S'), sInp, el('button', { class: 'btn small', onclick: safeRun(() => cmd(`M3 S${num(sInp.value) || 12000}`, true)) }, 'Zapnout'), el('button', { class: 'btn small', onclick: safeRun(() => cmd('M5', true)) }, 'Vypnout')),
    ovF, ovZ, ovS, ovR,
    el('div', { class: 'mrow' }, el('button', { class: 'btn small', onclick: safeRun(() => act('probeZ')) }, 'Změřit Z sondou'),
      el('button', { class: 'btn small', title: 'Nový nástroj je stejně dlouhý jako předchozí (např. vrtáky ze sady) – nula Z zůstane, měřit není potřeba', onclick: safeRun(() => sameZ()) }, 'Z stejné jako předchozí')),
    el('div', { class: 'muted small' }, 'Měření: klip na mědi / dotyková sonda. „Z stejné“ = nástroj stejné délky, Z se nemění.')));
  // režim stroje: CNC (vřeteno, $32=0) / laser ($32=1) a max. otáčky / výkon S ($30)
  const modeInfo = el('div', { class: 'muted small' });
  const modeSeg = el('div', { class: 'seg2' }), maxInps = {};
  const maxInp = k => { const i = el('input', { value: modeMax(k === 'laserMax') }); i.addEventListener('keydown', e => e.stopPropagation()); i.addEventListener('change', () => { const v = Math.round(num(i.value)); if (v > 0) { M.modeCfg[k] = v; save(); } i.value = modeMax(k === 'laserMax'); renderMode(); }); maxInps[k] = i; return i; };
  async function setMode(laser) {
    if (!M.on) throw new Error('Stroj není připojen.');
    if (M.stream?.streaming) throw new Error('Během běhu programu nejde přepnout.');
    if (!/^(Idle|Alarm)/.test(M.st.state)) throw new Error('Stroj není v klidu.');
    const max = modeMax(laser); M.modeCfg[laser ? 'laserMax' : 'cncMax'] = max; save();
    if (!M.st.state.startsWith('Alarm')) await cmd('M5', true); // v alarmu G-kód nejde, nastavení $ ano
    await cmd(`$32=${laser ? 1 : 0}`, true);
    await cmd(`$30=${max}`, true);
    M.settings[32] = laser ? '1' : '0'; M.settings[30] = String(max);
    await cmd('$$', true).catch(() => {});
    renderMode(); if (!panes.set.hidden) renderSettings();
    ctx.toast(laser ? `Stroj přepnut na LASER ($32=1, $30=${max}).` : `Stroj přepnut na CNC ($32=0, $30=${max}).`);
    log(`Režim: ${laser ? 'laser' : 'CNC'} – $32=${laser ? 1 : 0}, $30=${max}`, 'info');
  }
  // max S pro režim, který stroj právě má, se poprvé převezme z jeho $30
  function learnMode() {
    const v = M.settings[32], mx = +M.settings[30]; if (v == null || !(mx > 0)) return;
    const k = v === '1' ? 'laserMax' : 'cncMax'; if (M.modeCfg[k] == null) { M.modeCfg[k] = mx; save(); }
  }
  const modeMax = laser => M.modeCfg[laser ? 'laserMax' : 'cncMax'] ?? (laser ? 1000 : 12000);
  let modeT = 0; function renderModeSoon() { clearTimeout(modeT); modeT = setTimeout(renderMode, 50); }
  function renderMode() {
    const v = M.settings[32], laser = v === '1', known = v != null;
    modeSeg.innerHTML = '';
    modeSeg.append(
      el('button', { class: known && !laser ? 'on' : '', disabled: !M.on, title: `$32=0 (vřeteno), $30=${modeMax(false)}`, onclick: safeRun(() => setMode(false)) }, 'CNC (vřeteno)'),
      el('button', { class: known && laser ? 'on' : '', disabled: !M.on, title: `$32=1 (laser), $30=${modeMax(true)}`, onclick: safeRun(() => setMode(true)) }, 'Laser'));
    for (const [k, i] of Object.entries(maxInps)) if (document.activeElement !== i) i.value = modeMax(k === 'laserMax');
    modeInfo.textContent = M.on ? (known ? `Teď: ${laser ? 'LASER' : 'CNC'} · $32=${v} · max S ($30) = ${M.settings[30] ?? '?'}` : 'Načítám nastavení…') : 'Připoj stroj.';
  }
  left.append(card('Režim stroje (CNC / laser)',
    modeSeg, modeInfo,
    el('div', { class: 'mgrid' },
      el('label', { class: 'mf' }, el('span', {}, 'Max S pro CNC ($30)'), el('span', { class: 'inp' }, maxInp('cncMax'))),
      el('label', { class: 'mf' }, el('span', {}, 'Max S pro laser ($30)'), el('span', { class: 'inp' }, maxInp('laserMax')))),
    el('div', { class: 'muted small' }, 'Přepnutí zapíše do GRBL $32 (laserový režim) a $30 (max. otáčky / výkon pro S). Programy pro vřeteno počítej s S do max. CNC, pro laser do max. laseru.')));
  // Z sonda (tool setter) a hledání nuly XY dotykovou sondou
  const setterInfo = el('div', { class: 'muted small' });
  left.append(card('Z sonda a nula XY',
    el('div', { class: 'mlabel' }, 'Pevná Z sonda (tool setter) – výměna nástroje bez klipu'),
    el('div', { class: 'mrow' },
      el('button', { class: 'btn small', title: 'Najeď nástrojem nad střed Z sondy a ulož polohu', onclick: safeRun(saveSetterPos) }, 'Poloha sondy = tady'),
      el('button', { class: 'btn small', title: 'Po nastavení nuly Z (klipem / destičkou) změř stejný nástroj na sondě', onclick: safeRun(() => setterMeasure(true)) }, 'Referenční měření'),
      el('button', { class: 'btn small primary', title: 'Po výměně nástroje: změří nový nástroj a přepočítá nulu Z', onclick: safeRun(() => setterMeasure(false)) }, 'Změřit nástroj')),
    setterInfo,
    el('div', { class: 'mlabel' }, 'Nula XY dotykovou sondou'),
    el('div', { class: 'mrow' },
      el('button', { class: 'btn small', title: 'Sonda uvnitř díry (např. díra kolíčku) pod povrchem – najde střed a nastaví X0 Y0', onclick: safeRun(probeHoleCenter) }, 'Střed díry → X0 Y0'),
      el('button', { class: 'btn small', title: 'Sonda vlevo před levým dolním rohem desky, pod horní hranou – najde hrany a nastaví X0 Y0', onclick: safeRun(probeCorner) }, 'Levý dolní roh → X0 Y0'))));
  function renderSetterInfo() {
    const t = M.setter;
    setterInfo.textContent = t.x == null ? 'Poloha sondy není uložená.' : `Sonda X ${cz(t.x, 2)} Y ${cz(t.y, 2)} (strojově)${t.ref ? ` · reference ${t.ref.tool || ''} uložená` : ' · chybí referenční měření'}`;
  }

  // střed: program + náhled
  const progSel = el('select', { class: 'mprog' });
  progSel.addEventListener('change', () => selectProgram(progSel.value));
  const mapChk = el('input', { type: 'checkbox', checked: true });
  mapChk.addEventListener('change', () => { M.useMap = mapChk.checked; rebuildProgram(); });
  const mapLbl = el('label', { class: 'toggle', title: 'Upravit Z programu podle výškové mapy (jen izolace mědi)' }, mapChk, el('span'), 'Výšková mapa');
  const bar = el('div', { class: 'mbar' }, el('i'));
  const progTxt = el('span', { class: 'muted small' }, '');
  const bStart = el('button', { class: 'btn primary', onclick: safeRun(() => startProgram()) }, '▶ Start');
  const bPause = el('button', { class: 'btn', onclick: safeRun(() => act('hold')) }, '⏸ Pauza');
  const bStop = el('button', { class: 'btn danger', onclick: safeRun(() => act('stop')) }, '■ Stop');
  const bFrom = el('button', { class: 'btn small', title: 'Spustit od vybraného řádku (klikni na řádek ve výpisu)', onclick: safeRun(() => startProgram({ fromSel: true })) }, 'Od řádku…');
  const bCheck = el('button', { class: 'btn small', title: 'Kontrolní běh $C – GRBL program projde bez pohybu a nahlásí chyby', onclick: safeRun(() => startProgram({ check: true })) }, 'Kontrolní běh');
  const bSkip = el('button', { class: 'btn small', title: 'Vynechat vybrané řádky / dráhu (klik na dráhu v náhledu nebo na řádky, Shift = rozsah)', onclick: safeRun(() => skipSelection(true)) }, 'Vynechat výběr');
  const bUnskip = el('button', { class: 'btn small', onclick: safeRun(() => skipSelection(false)) }, 'Vrátit');
  const selInfo = el('span', { class: 'muted small' }, '');
  center.append(el('div', { class: 'mtool' },
    el('div', { class: 'mrow' }, progSel, el('button', { class: 'btn small', onclick: safeRun(openFiles) }, 'Otevřít .nc…'), mapLbl),
    el('div', { class: 'mrow' }, bStart, bPause, bStop, el('div', { class: 'mprog-wrap' }, bar, progTxt)),
    el('div', { class: 'mrow' }, bFrom, bCheck, el('span', { class: 'sep' }), bSkip, bUnskip, selInfo), resumeBox));
  const gvBox = el('div', { class: 'mgv' });
  center.append(gvBox);
  const gv = new GcodeViewer(gvBox, { rapid: ctx.getS().machine.rapid || 1500, machine: true });
  gv.onSelect = sel => { selInfo.textContent = sel ? (sel[0] === sel[1] ? `řádek ${sel[0] + 1}` : `řádky ${sel[0] + 1}–${sel[1] + 1}`) : ''; };

  // vpravo: průvodce / mapa / konzole / nastavení
  const tabs = el('div', { class: 'seg mtabs' });
  const panes = {};
  for (const [k, t] of [['wiz', 'Průvodce'], ['map', 'Mapa'], ['test', 'Test'], ['log', 'Deník'], ['con', 'Konzole'], ['set', 'Nastavení']]) {
    tabs.append(el('button', { 'data-k': k, onclick: () => showPane(k) }, t));
    panes[k] = k === 'log' ? journalPane : el('div', { class: 'mpane', hidden: true });
  }
  right.append(tabs, ...Object.values(panes));
  const showPane = k => { mapPreview = k === 'map'; renderMapOverlay(); for (const [kk, p] of Object.entries(panes)) p.hidden = kk !== k; tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); if (k === 'map') renderMap(); if (k === 'wiz') renderWizard(); if (k === 'log') renderJournal(); if (k === 'set') renderSettings(); if (k === 'test') renderTest(); };

  // konzole
  const conLog = el('div', { class: 'mcon' });
  const conInp = el('input', { placeholder: 'Příkaz pro GRBL (Enter)…' });
  conInp.addEventListener('keydown', e => { if (e.key === 'Enter' && conInp.value.trim()) { const v = conInp.value.trim(); conInp.value = ''; safeRun(() => cmd(v))(); } e.stopPropagation(); });
  const conStatus = el('input', { type: 'checkbox' });
  const qb = (t, c, title) => el('button', { class: 'btn small', title, onclick: safeRun(() => cmd(c)) }, t);
  panes.con.append(el('div', { class: 'mrow conq' },
      qb('$$', '$$', 'Všechna nastavení'), qb('$#', '$#', 'Nulové body (G54…, sonda)'), qb('$G', '$G', 'Aktivní režimy G-kódu'), qb('$I', '$I', 'Verze firmwaru'),
      qb('$X', '$X', 'Odemknout alarm'), qb('$H', '$H', 'Homing'), qb('$32=0', '$32=0', 'Laserový režim vypnout (CNC)'), qb('$32=1', '$32=1', 'Laserový režim zapnout')),
    conLog, el('div', { class: 'mrow' }, conInp), el('label', { class: 'f check small' }, conStatus, 'Zobrazovat i hlášení stavu'));
  function log(s, cls = '') {
    const d = el('div', { class: cls }, s);
    conLog.append(d);
    while (conLog.childElementCount > 600) conLog.firstChild.remove();
    conLog.scrollTop = conLog.scrollHeight;
  }

  // ---------- připojení ----------
  async function refreshPorts() {
    const r = await call('ports');
    M.ports = r.ports || []; M.token = r.token;
    portSel.innerHTML = '';
    for (const p of M.ports) portSel.append(el('option', { value: p, selected: p === M.port }, p === 'SIMULÁTOR' ? 'Simulátor (bez stroje)' : p));
    if (!M.port && M.ports.length) M.port = M.ports[0];
  }
  async function connect() {
    M.port = portSel.value; save();
    await call('connect', { port: M.port, baud: 115200 });
    setTimeout(() => { cmd('$$').catch(() => {}); }, 1200);
  }
  async function disconnect() { await call('disconnect'); }
  let es = null;
  function openEvents() {
    if (es) es.close();
    es = new EventSource('/api/m/events?k=' + M.token);
    es.onmessage = e => { try { onEvent(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    es.onerror = () => { /* prohlížeč se znovu připojí sám */ };
  }
  function onEvent(v) {
    switch (v.t) {
      case 'conn':
        if (!v.on && M.stream.streaming) interrupted('odpojení');
        M.on = v.on; if (v.port) M.port = v.port;
        if (!v.on) { M.st.state = 'Odpojeno'; M.stream.streaming = false; }
        log(v.on ? `Připojeno: ${v.port}` : 'Odpojeno', 'info');
        renderAll(); break;
      case 'st': parseStatus(v.s); if (conStatus.checked) log(v.s, 'st'); break;
      case 'rx': {
        const s = v.s;
        const mm = /^\$(\d+)=(.*)$/.exec(s); if (mm) { M.settings[mm[1]] = mm[2]; if (mm[1] === '30' || mm[1] === '32') { learnMode(); renderModeSoon(); } }
        if (/^error:/.test(s)) { const c = +s.slice(6); log(`${v.cmd ? v.cmd + ' → ' : ''}${s} (${ERRORS[c] || 'chyba'})`, 'err'); }
        else log(s, /^\[MSG|^ALARM/.test(s) ? 'info' : 'rx');
        break;
      }
      case 'tx': log('> ' + v.s, 'tx'); break;
      case 'prog':
        if (M.run) { if (v.paused && !M.run.pauseT) M.run.pauseT = Date.now(); if (!v.paused && M.run.pauseT) { M.run.paused += Date.now() - M.run.pauseT; M.run.pauseT = null; } }
        if (M.lastRun && v.streaming) { M.lastRun.done = v.done; M.lastRun.w = M.st.wpos?.slice(); if (!M._lrT || Date.now() - M._lrT > 1000) { M._lrT = Date.now(); save(); } }
        const wasStreaming = M.stream.streaming;
        M.stream = { done: v.done, total: v.total, streaming: v.streaming, paused: v.paused };
        if (gv.g && M.loadedText === M.prog?.text) gv.setProgress(v.done);
        if (wasStreaming !== v.streaming) renderResume();
        renderStream(); break;
      case 'perr': {
        const c = v.code;
        log(`Chyba na řádku ${v.line + 1}: ${v.text} → error:${c} (${ERRORS[c] || ''})`, 'err');
        if (!M.checkRun) {
          ctx.toast(`Chyba na řádku ${v.line + 1}: ${ERRORS[c] || 'error:' + c} – program pozastaven. Pokračuj Pauzou, nebo zastav.`, true);
        }
        M.checkErrors = (M.checkErrors || 0) + 1;
        if (M.checkRun) call('resume').catch(() => {});
        break;
      }
      case 'alarm': {
        const c = +v.s.replace(/\D/g, '');
        if (v.wasStreaming) interrupted('alarm ' + c);
        log(`${v.s}: ${ALARMS[c] || ''}`, 'err');
        ctx.toast(`Alarm ${c}: ${ALARMS[c] || v.s}`, true);
        M.mapAbort = true; break;
      }
      case 'reset': log('GRBL restartován: ' + v.s, 'info'); if (v.wasStreaming) { ctx.toast('Program zastaven.'); interrupted(M.stopRequested ? 'stop' : 'reset'); } M.stopRequested = false; break;
      case 'end': {
        const t = Math.round(v.secs);
        if (M.checkRun) {
          M.checkRun = false;
          cmd('$C').catch(() => {});
          ctx.toast(M.checkErrors ? `Kontrolní běh: ${M.checkErrors} chyb – viz Konzole.` : 'Kontrolní běh bez chyb.', !!M.checkErrors);
        } else {
          ctx.toast(`Program dokončen (${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}).`);
          finishRun('hotovo', v.secs);
          if (M.prog?.op) { M.wizard.done['run:' + M.prog.op.id] = true; renderWizard(); }
        }
        break;
      }
      case 'msg': log(v.text, v.level === 'error' ? 'err' : 'info'); if (v.level === 'error') ctx.toast(v.text, true); break;
    }
  }
  function parseStatus(s) {
    const parts = s.slice(1, -1).split('|');
    const st = M.st;
    st.state = parts[0];
    st.pn = '';
    for (const p of parts.slice(1)) {
      const [k, v] = p.split(':');
      const n3 = () => v.split(',').map(Number);
      if (k === 'MPos') st.mpos = n3(); else if (k === 'WPos') st.wposRaw = n3(); else if (k === 'WCO') st.wco = n3();
      else if (k === 'FS') st.fs = n3(); else if (k === 'F') st.fs = [+v, 0]; else if (k === 'Ov') st.ov = n3(); else if (k === 'Pn') st.pn = v;
    }
    if (parts.some(p => p.startsWith('WPos:'))) { st.wpos = st.wposRaw; st.mpos = st.wpos.map((w, i) => w + st.wco[i]); }
    else if (st.mpos) st.wpos = st.mpos.map((m, i) => m - st.wco[i]);
    if (M.lastRun && M.stream.streaming && st.wpos && /^(Run|Hold)/.test(st.state)) M.lastRun.w = st.wpos.slice();
    renderStatus();
  }

  // ---------- vykreslení ----------
  function renderStatus() {
    const st = M.st, base = st.state.split(':')[0];
    badge.textContent = (STATE_CZ[base] || base) + (st.state.includes(':') && base === 'Hold' ? (st.state.endsWith(':0') ? '' : ' (brzdí)') : '') + (st.pn.includes('P') ? ' · sonda sepnutá' : '');
    badge.className = 'mstate s-' + base.toLowerCase();
    for (const [i, a] of ['X', 'Y', 'Z'].entries()) {
      if (dro[a].w.firstChild?.tagName !== 'INPUT') dro[a].w.textContent = st.wpos ? cz(st.wpos[i]) : '—';
      dro[a].m.textContent = st.mpos ? cz(st.mpos[i]) : '—';
    }
    ovF._v.textContent = st.ov[0] + ' %'; ovR.querySelector('.ovv').textContent = st.ov[1] + ' %'; ovS._v.textContent = st.ov[2] + ' %';
    if (st.wpos) gv.setLive({ x: st.wpos[0], y: st.wpos[1], z: st.wpos[2] });
    const idle = base === 'Idle';
    bStart.disabled = !M.on || !M.prog || M.stream.streaming;
    bFrom.disabled = bCheck.disabled = !M.on || !M.prog || M.stream.streaming || !idle;
    bPause.textContent = base === 'Hold' || M.stream.paused ? '▶ Pokračovat' : '⏸ Pauza';
  }
  function renderOv() { ovZ._v.textContent = M.zfeed + ' %'; }
  function renderJog() {
    xyChips.innerHTML = ''; zChips.innerHTML = '';
    for (const v of stepsXY) xyChips.append(el('button', { class: Math.abs(v - M.jog.xy) < 1e-9 ? 'on' : '', onclick: () => { M.jog.xy = v; save(); renderJog(); } }, cz(v, v < 0.1 ? 2 : v < 1 ? 1 : 0)));
    if (!stepsXY.some(v => Math.abs(v - M.jog.xy) < 1e-9)) xyChips.append(el('button', { class: 'on' }, cz(M.jog.xy, 2)));
    for (const v of stepsZ) zChips.append(el('button', { class: Math.abs(v - M.jog.z) < 1e-9 ? 'on' : '', onclick: () => { M.jog.z = v; save(); renderJog(); } }, cz(v, v < 0.1 ? 2 : v < 1 ? 1 : 0)));
    if (!stepsZ.some(v => Math.abs(v - M.jog.z) < 1e-9)) zChips.append(el('button', { class: 'on' }, cz(M.jog.z, 2)));
    feedInp.value = M.jog.feed;
  }
  // průběh: procenta podle odhadu času (ne podle řádků), uběhlý čas, zbývá a celkem
  const fmtDur = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, x = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  function runTimes() {
    const s = M.stream, g = gv.g, r = M.run;
    if (!g || !g.lineEnd) return null;
    const n = g.lineEnd.length - 1, k = r?.factor ?? (ctx.timeFactor?.(M.prog?.op?.kind || 'soubor') || 1);
    const from = r ? r.from || 0 : 0, t0 = g.lineStart[Math.min(from, n)] || 0, tAll = g.total - t0; // minuty podle simulace
    if (!s.streaming && !r) return { pct: null, total: tAll * k * 60 };
    const done = Math.min(Math.max(s.done, from), n), tDone = Math.max(0, (done > 0 ? g.lineEnd[done - 1] : 0) - t0);
    const frac = tAll > 0 ? Math.min(1, tDone / tAll) : (s.total ? s.done / s.total : 0);
    const elapsed = r ? (Date.now() - r.t0 - r.paused - (r.pauseT ? Date.now() - r.pauseT : 0)) / 1000 : 0;
    const estRest = (tAll - tDone) * k * 60;
    // čím dál víc věřit skutečnému tempu stroje (od 5 % průběhu)
    const w = Math.min(1, Math.max(0, (frac - 0.05) / 0.3)), real = frac > 0.02 && elapsed > 20 ? elapsed / frac * (1 - frac) : estRest;
    const rest = estRest * (1 - w) + real * w;
    return { pct: frac * 100, elapsed, rest, total: elapsed + rest };
  }
  function renderStream() {
    const s = M.stream, t = runTimes();
    const pct = t?.pct ?? (s.total ? s.done / s.total * 100 : 0);
    bar.firstChild.style.width = pct + '%';
    if (!M.prog) { progTxt.textContent = ''; renderStatus(); return; }
    const lines = `${s.done} / ${s.total || M.prog.text.split('\n').length} řádků`;
    if (s.streaming && t?.pct != null) progTxt.innerHTML = `${s.paused ? 'pozastaveno' : 'běží'} · <b>${Math.floor(t.pct)} %</b> · uběhlo ${fmtDur(t.elapsed)} · zbývá ≈ <b>${fmtDur(t.rest)}</b> · celkem ≈ ${fmtDur(t.total)} · ${lines}`;
    else progTxt.textContent = `${t ? `odhad ≈ ${fmtDur(t.total)} · ` : ''}${lines}`;
    renderStatus();
  }
  setInterval(() => { if (M.stream.streaming) renderStream(); }, 1000);
  function renderAll() {
    btnConn.textContent = M.on ? 'Odpojit' : 'Připojit';
    btnConn.classList.toggle('primary', !M.on);
    portSel.disabled = M.on;
    renderStatus(); renderJog(); renderOv(); renderStream(); renderMode(); renderGotoHint();
  }
  function card(title, ...kids) { return el('section', { class: 'mcard' }, el('h3', {}, title), ...kids); }
  function segOn(b) { b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }

  // ---------- ovládání ----------
  const safeZ = () => ctx.getS().machine.zTravel || 2;
  const wz = () => M.st.wpos?.[2] ?? 0;
  async function waitIdle(to = 120000) {
    const t0 = Date.now();
    await sleep(250);
    while (Date.now() - t0 < to) {
      if (M.st.state === 'Idle') return;
      if (M.st.state.startsWith('Alarm')) throw new Error('Stroj je v alarmu.');
      if (!M.on) throw new Error('Stroj je odpojen.');
      await sleep(100);
    }
    throw new Error('Stroj nedojel včas.');
  }
  async function zeroAxes(axes) { await cmd(`G10 L20 P0 ${[...axes].map(a => a + '0').join(' ')}`, true); }
  function editAxis(a) {
    if (!M.on) return;
    const i = 'XYZ'.indexOf(a), w = dro[a].w;
    const inp = el('input', { value: M.st.wpos ? fmt(M.st.wpos[i]) : '0' });
    w.innerHTML = ''; w.append(inp); inp.focus(); inp.select();
    const done = ok => { const v = num(inp.value); w.textContent = '—'; if (ok && v != null) safeRun(() => cmd(`G10 L20 P0 ${a}${fmt(v)}`, true))(); renderStatus(); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(false));
    inp.addEventListener('click', e => e.stopPropagation());
  }
  async function moveSafe(x, y, z, machineCoords = false, keepZ = false) {
    const pre = machineCoords ? 'G53 ' : '';
    const sz = safeZ();
    const xyMove = x != null || y != null;
    if (!xyMove) { /* jen Z – bez zdvihu */ }
    else if (keepZ && z == null) { /* posun o kolik jen v XY – výška zůstane (jako jog) */ }
    else if (machineCoords) {
      // bezpečná výška ve strojových souřadnicích = aktuální Z, pokud je výš (nejvýš 1 mm pod horní doraz)
      const curM = M.st.mpos?.[2] ?? 0, safeM = Math.max(curM, sz + (M.st.wco?.[2] ?? 0));
      await cmd(`G90 G53 G0 Z${fmt(Math.min(safeM, zTopMach()))}`, true);
    } else if (wz() < sz) await cmd(`G90 G0 Z${fmt(Math.min(sz, zTopWork() ?? sz))}`, true);
    const xy = [x != null ? 'X' + fmt(x) : '', y != null ? 'Y' + fmt(y) : ''].join(' ').trim();
    if (xy) await cmd(`G90 ${pre}G0 ${xy}`, true);
    if (z != null) {
      const cur = machineCoords ? M.st.mpos?.[2] : wz();
      await waitIdle();
      if (z < (machineCoords ? M.st.mpos?.[2] : wz())) await cmd(`G90 ${pre}G1 Z${fmt(z)} F${Math.min(500, M.jog.feed)}`, true);
      else await cmd(`G90 ${pre}G0 Z${fmt(z)}`, true);
      void cur;
    }
  }
  async function gotoXYZ() {
    const v = Object.fromEntries(Object.entries(gotoInp).map(([k, i]) => [k, num(i.value)]));
    if (v.X == null && v.Y == null && v.Z == null) throw new Error('Zadej aspoň jednu souřadnici.');
    if (gotoMode === 'rel') {
      // posun od aktuální polohy → převod na pracovní souřadnice
      const w = M.st.wpos || [0, 0, 0];
      return moveSafe(v.X != null ? w[0] + v.X : null, v.Y != null ? w[1] + v.Y : null, v.Z != null ? w[2] + v.Z : null, false, true);
    }
    if (gotoMode === 'mach') {
      // strojové souřadnice: osa se záporným prostorem (např. Z 0 až −80) – kladné číslo se bere jako záporné
      const flipped = [];
      for (const [i, a] of ['X', 'Y', 'Z'].entries()) {
        if (v[a] == null || v[a] <= 0) continue;
        const neg = !((M.st.mpos?.[i] || 0) > 0.5 || (M.st.wco?.[i] || 0) > 0.5);
        if (neg) { v[a] = -v[a]; flipped.push(`${a} ${cz(v[a], 1)}`); }
      }
      // kontrola rozsahu stroje
      for (const [i, a] of ['X', 'Y', 'Z'].entries()) {
        if (v[a] == null || M.settings[20] !== '1' && M.settings[22] !== '1') continue;
        const pos = (M.st.mpos?.[i] || 0) > 0.5 || (M.st.wco?.[i] || 0) > 0.5, tr = travel(a);
        if (pos ? v[a] < -0.01 || v[a] > tr + 0.01 : v[a] > 0.01 || v[a] < -tr - 0.01) throw new Error(`${a} ${cz(v[a])} je mimo rozsah stroje (${pos ? `0 až ${cz(tr, 0)}` : `0 až −${cz(tr, 0)}`} mm).`);
      }
      if (flipped.length) ctx.toast(`Strojové souřadnice jsou v ose záporné – jedu na ${flipped.join(', ')}.`);
    }
    await moveSafe(v.X, v.Y, v.Z, gotoMode === 'mach');
  }
  // jog
  const travel = a => +(M.settings[{ X: 130, Y: 131, Z: 132 }[a]] || 300);
  async function jogStep(a, dir) {
    if (!M.on) return;
    const d = (a === 'Z' ? M.jog.z : M.jog.xy) * dir;
    await cmd(`$J=G91 G21 ${a}${fmt(d)} F${fmt(M.jog.feed)}`);
  }
  let jogging = false;
  async function jogStart(a, dir) {
    if (!M.on) return;
    let dist = travel(a);
    if (M.settings[20] === '1' && M.st.mpos) { const i = 'XYZ'.indexOf(a), mp = M.st.mpos[i]; const posSpace = mp > 0.5 || (M.st.wco?.[i] || 0) > 0.5; dist = posSpace ? (dir > 0 ? travel(a) - mp - 0.5 : mp - 0.5) : (dir > 0 ? -mp - 0.5 : travel(a) + mp - 0.5); }
    if (dist <= 0.01) return;
    jogging = true;
    await cmd(`$J=G91 G21 ${a}${fmt(dist * dir)} F${fmt(M.jog.feed)}`);
  }
  function jogStop() { if (jogging) { jogging = false; rt(0x85); } }
  window.addEventListener('blur', jogStop);
  function holdButton(b, tap, holdStart, holdEnd) {
    let t = null, held = false;
    b.addEventListener('pointerdown', e => { if (e.button !== 0) return; b.setPointerCapture(e.pointerId); held = false; t = setTimeout(() => { held = true; holdStart(); }, 450); });
    const up = () => { if (t === null) return; clearTimeout(t); t = null; if (held) holdEnd(); else tap(); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }
  function feedAct(k) {
    const f = M.jog.feed;
    M.jog.feed = k === 'feedMul' ? Math.min(10000, f * 10) : k === 'feedDiv' ? Math.max(1, f / 10) : Math.min(10000, f + 1000);
    M.jog.feed = +M.jog.feed.toFixed(3); save(); renderJog();
  }
  // krok „+“ jako v UGS: nad 1 mm po 1, od 0,1 po 0,1, jinak po 0,01
  const stepPlus = v => +(v >= 1 ? v + 1 : v >= 0.1 ? v + 0.1 : v + 0.01).toFixed(3);

  // akce (tlačítka i pendant)
  async function act(k) {
    switch (k) {
      case 'home': await cmd('$H', true, 120); break;
      case 'unlock': await cmd('$X', true); break;
      case 'hold': if (M.st.state.startsWith('Hold') || M.stream.paused) await call('resume'); else if (M.stream.streaming) await call('pause'); else await rt(0x21); break;
      case 'start': if (M.st.state.startsWith('Hold') || M.stream.paused) await call('resume'); else await startProgram(); break;
      case 'stop': M.stopRequested = true; await call('stop'); break;
      case 'zeroX': case 'zeroY': case 'zeroZ': await zeroAxes(k.slice(-1)); break;
      case 'zeroAll': await zeroAxes('XYZ'); break;
      case 'probeZ': await probeZ(); break;
      case 'rtxy': await moveSafe(0, 0, null); break;
      case 'rtz': await moveSafe(0, 0, null); await waitIdle(); await cmd(`G90 G0 Z0.5`, true); await cmd(`G90 G1 Z0 F${Math.min(300, M.jog.feed)}`, true); break;
      case 'feedMul': case 'feedDiv': case 'feedP1k': feedAct(k); break;
      case 'xy001': M.jog.xy = 0.01; break; case 'xy01': M.jog.xy = 0.1; break; case 'xy1': M.jog.xy = 1; break; case 'xy10': M.jog.xy = 10; break;
      case 'xyMul': M.jog.xy = Math.min(1000, +(M.jog.xy * 10).toFixed(3)); break; case 'xyPlus': M.jog.xy = stepPlus(M.jog.xy); break;
      case 'z001': M.jog.z = 0.01; break; case 'z01': M.jog.z = 0.1; break; case 'z1': M.jog.z = 1; break; case 'z10': M.jog.z = 10; break;
      case 'zPlus': M.jog.z = stepPlus(M.jog.z); break;
    }
    if (/^(xy|z)\d|Mul$|Plus$/.test(k)) { save(); renderJog(); }
  }

  // ---------- pendant / klávesy ----------
  const keyName = e => /^F(1[3-9]|2[0-4])$/.test(e.key) ? (e.ctrlKey ? 'C-' : '') + (e.shiftKey ? 'S-' : '') + e.key : null;
  const keyHeld = new Map();
  let learning = null;
  window.addEventListener('keydown', e => {
    const k = keyName(e) || (learning && /^F\d+$/.test(e.key) ? (e.ctrlKey ? 'C-' : '') + (e.shiftKey ? 'S-' : '') + e.key : null);
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    if (learning) { M.keymap[learning] = k; learning = null; save(); (keysTarget || renderSettings)(); return; }
    if (e.repeat) return;
    const a = Object.entries(M.keymap).find(([, v]) => v === k)?.[0];
    if (!a || !M.on) return;
    // otevřené potvrzení startu: Start na pendantu potvrdí, Stop zruší
    const dlg = document.querySelector('dialog.mdlg[open]');
    if (dlg && (a === 'start' || a === 'stop')) { dlg.querySelector(a === 'start' ? '.btn.primary' : '.btn:not(.primary)').click(); return; }
    const jm = /^jog([XYZ])([+-])$/.exec(a);
    if (jm) {
      // jako v UGS: krátký stisk = krok, podržení déle než 0,5 s = plynulý pojezd
      const st = { t: setTimeout(() => { st.held = true; jogStart(jm[1], jm[2] === '+' ? 1 : -1); }, 500), held: false };
      keyHeld.set(e.key, { st, axis: jm[1], dir: jm[2] === '+' ? 1 : -1 });
      return;
    }
    safeRun(() => act(a))();
  }, true);
  window.addEventListener('keyup', e => {
    const h = keyHeld.get(e.key); if (!h) return;
    keyHeld.delete(e.key);
    clearTimeout(h.st.t);
    if (h.st.held) jogStop(); else safeRun(() => jogStep(h.axis, h.dir))();
  }, true);

  // ---------- sonda ----------
  async function probeOnce(target, feed) {
    const r = await cmd(`G38.2 ${target} F${fmt(feed)}`, true, 120);
    const prb = (r.msgs || []).map(s => /^\[PRB:([-\d.]+),([-\d.]+),([-\d.]+):(\d)\]/.exec(s)).find(Boolean);
    if (!prb || prb[4] !== '1') throw new Error('Sonda se nedotkla.');
    return [+prb[1], +prb[2], +prb[3]];
  }
  async function readOffsets() {
    const r = await cmd('$#', true);
    const g = name => { const s = (r.msgs || []).find(x => x.startsWith('[' + name + ':')); return s ? s.slice(name.length + 2, -1).split(',').slice(0, 3).map(Number) : [0, 0, 0]; };
    const g54 = g('G54'), g92 = g('G92');
    return g54.map((v, i) => v + g92[i]);
  }
  // změří povrch pod nástrojem a vrátí Z ve strojových souřadnicích
  async function probeHere(searchWork) {
    const p = M.probe;
    await cmd('G21', true);
    let prb = await probeOnce(`G91 Z-${fmt(searchWork)}`, p.fast);
    if (p.double) {
      await cmd(`G91 G0 Z${fmt(p.retract)}`, true);
      prb = await probeOnce(`G91 Z-${fmt(p.retract * 2 + 0.2)}`, p.slow);
    }
    await cmd('G90', true);
    return prb[2];
  }
  async function readG54() {
    const r = await cmd('$#', true);
    const s = (r.msgs || []).find(x => x.startsWith('[G54:'));
    return s ? s.slice(5, -1).split(',').slice(0, 3).map(Number) : [0, 0, 0];
  }
  // ---------- pevná Z sonda (tool setter) ----------
  async function saveSetterPos() {
    if (!M.st.mpos) throw new Error('Stroj není připojen.');
    M.setter.x = +M.st.mpos[0].toFixed(3); M.setter.y = +M.st.mpos[1].toFixed(3);
    M.setter.z = +Math.min(M.st.mpos[2], zTopMach()).toFixed(3); // odsud se začne měřit
    M.setter.on = true; save(); renderSetterInfo();
    ctx.toast('Poloha Z sondy uložena (měřit se bude z této výšky).');
  }
  async function setterTouch() {
    const t = M.setter, p = M.probe;
    if (t.x == null) throw new Error('Nejdřív ulož polohu Z sondy (najeď nad ni a „Poloha sondy = tady“).');
    if (M.st.state !== 'Idle') throw new Error('Stroj není v klidu.');
    await cmd('G21 G90', true);
    await cmd(`G53 G0 Z${fmt(zTopMach())}`, true);
    await cmd(`G53 G0 X${fmt(t.x)} Y${fmt(t.y)}`, true);
    await cmd(`G53 G0 Z${fmt(t.z)}`, true);
    let prb = await probeOnce(`G91 Z-${fmt(t.search)}`, p.fast);
    if (p.double) { await cmd(`G91 G0 Z${fmt(p.retract)}`, true); prb = await probeOnce(`G91 Z-${fmt(p.retract * 2 + 0.2)}`, p.slow); }
    await cmd('G90', true);
    await cmd(`G53 G0 Z${fmt(zTopMach())}`, true);
    return prb[2];
  }
  async function setterMeasure(reference) {
    const trig = await setterTouch();
    const g54 = await readG54();
    if (reference) {
      M.setter.ref = { trig, wcoZ: g54[2], tool: M.prog?.op?.tool || '' }; save(); renderSetterInfo();
      ctx.toast('Referenční měření uloženo. Po výměně nástroje stačí „Změřit nástroj“.');
      return;
    }
    const ref = M.setter.ref; if (!ref) throw new Error('Chybí referenční měření – nastav nulu Z prvního nástroje a udělej ho.');
    // delší / kratší nástroj -> posun nuly Z o rozdíl dotyků
    const wcoZ = ref.wcoZ + (trig - ref.trig);
    await cmd(`G10 L2 P1 Z${fmt(wcoZ)}`, true);
    M.zTool = M.prog?.op?.tool || ''; M.zOp = M.prog?.op?.id || ''; save();
    ctx.toast(`Nástroj změřen – nula Z posunuta o ${cz(trig - ref.trig, 3)} mm.`);
    log(`Z sonda: dotyk ${cz(trig)} (ref. ${cz(ref.trig)}), G54 Z = ${cz(wcoZ)}`, 'info');
  }
  // ---------- nula XY dotykovou sondou ----------
  async function touchAxis(axis, dir) {
    const p = M.probe;
    const prb = await probeOnce(`G91 ${axis}${fmt(dir * p.xySearch)}`, p.fast);
    await cmd(`G91 G0 ${axis}${fmt(-dir * p.retract)}`, true);
    const prb2 = p.double ? await probeOnce(`G91 ${axis}${fmt(dir * (p.retract * 2 + 0.2))}`, p.slow) : prb;
    await cmd(`G91 G0 ${axis}${fmt(-dir * p.retract)}`, true);
    await cmd('G90', true);
    return prb2['XYZ'.indexOf(axis)];
  }
  async function probeHoleCenter() {
    if (M.st.state !== 'Idle') throw new Error('Stroj není v klidu.');
    if (!await confirmDlg('Střed díry → X0 Y0', [['Poloha', 'Hrot sondy je uvnitř díry, pod horní hranou desky'], ['Průměr hrotu', `${cz(M.probe.tipDia, 2)} mm`], ['Hledá se', `do ${cz(M.probe.xySearch, 1)} mm na každou stranu`]], 'Měřit')) return;
    await cmd('G21', true);
    let cx, cy;
    for (let k = 0; k < 2; k++) { // dvakrát – podruhé už ze středu
      const x1 = await touchAxis('X', 1), x2 = await touchAxis('X', -1); cx = (x1 + x2) / 2;
      await cmd(`G53 G0 X${fmt(cx)}`, true);
      const y1 = await touchAxis('Y', 1), y2 = await touchAxis('Y', -1); cy = (y1 + y2) / 2;
      await cmd(`G53 G0 Y${fmt(cy)}`, true);
      if (k === 1) log(`Díra: Ø ≈ ${cz(Math.abs(x1 - x2) + M.probe.tipDia, 3)} × ${cz(Math.abs(y1 - y2) + M.probe.tipDia, 3)} mm`, 'info');
    }
    await waitIdle();
    await cmd('G10 L20 P0 X0 Y0', true);
    ctx.toast('Střed díry nalezen – X0 Y0 nastaveno.');
  }
  async function probeCorner() {
    if (M.st.state !== 'Idle') throw new Error('Stroj není v klidu.');
    const p = M.probe, off = p.cornerOff, r = p.tipDia / 2;
    if (!await confirmDlg('Levý dolní roh → X0 Y0', [['Poloha', `Hrot sondy šikmo před levým dolním rohem (asi ${cz(off, 0)} mm od obou hran), pod horní hranou desky`], ['Průměr hrotu', `${cz(p.tipDia, 2)} mm`]], 'Měřit')) return;
    await cmd('G21', true);
    const m0 = M.st.mpos.slice();
    await cmd(`G91 G0 Y${fmt(off * 1.5)}`, true); await cmd('G90', true);
    const ex = await touchAxis('X', 1) + r; // levá hrana
    await cmd(`G53 G0 X${fmt(m0[0])}`, true); await cmd(`G53 G0 Y${fmt(m0[1])}`, true);
    await cmd(`G91 G0 X${fmt(off * 1.5)}`, true); await cmd('G90', true);
    const ey = await touchAxis('Y', 1) + r; // spodní hrana
    await cmd(`G53 G0 Y${fmt(m0[1])}`, true); await cmd(`G53 G0 X${fmt(m0[0])}`, true);
    await waitIdle();
    const mp = M.st.mpos;
    await cmd(`G10 L20 P0 X${fmt(mp[0] - ex)} Y${fmt(mp[1] - ey)}`, true);
    ctx.toast('Roh desky nalezen – X0 Y0 nastaveno.');
    log(`Roh: hrana X ${cz(ex)} Y ${cz(ey)} (strojově)`, 'info');
  }
  // místo pro měření Z dotykem: měď, která zůstane (rámeček mimo desku), nebo ručně zadané, nebo kde stojí nástroj
  function probeSpot(side) {
    const p = M.probe;
    if (p.spot === 'here') return null;
    if (p.spot === 'manual') return { x: +p.spotX || 0, y: +p.spotY || 0, where: 'manual' };
    const pts = ctx.getRes()?.probePts || {};
    return pts[side || M.prog?.op?.side || 'top'] || null;
  }
  const spotText = sp => sp ? `X ${cz(sp.x, 1)} Y ${cz(sp.y, 1)}${sp.where === 'frame' ? ' (měď vně desky)' : sp.where === 'copper' ? ' (velký kus mědi na desce)' : ' (ručně)'}` : 'tam, kde stojí nástroj';
  // nový nástroj má stejnou délku jako předchozí (např. vrtáky v sadě): nula Z se ponechá, jen se zapíše, že platí
  function sameZ(op = M.prog?.op) {
    if (!M.zTool && !M.zOp) throw new Error('Z ještě nebylo změřené pro žádný nástroj – nejdřív ho změř.');
    if (!op) throw new Error('Není načtený žádný program.');
    const prev = M.zTool;
    M.zTool = op.tool || ''; M.zOp = op.id || ''; save();
    ctx.toast(`Z ponecháno jako pro „${prev}“ (nástroj stejně dlouhý).`);
    log(`Z: stejné jako pro „${prev}“ → ${op.tool}`, 'info');
    if (!panes.wiz.hidden) renderWizard();
  }
  // Z nula nástroje: na místě, nebo v referenčním bodě výškové mapy (aby mapa dál platila)
  async function probeZ(atRef = false, side = null) {
    if (!M.on) throw new Error('Stroj není připojen.');
    if (M.st.state !== 'Idle') throw new Error('Stroj není v klidu.');
    let zRef = 0;
    const p = M.probe, wco = M.st.wco || [0, 0, 0];
    // jiný nástroj má jinou délku: když je nula Z známá, začne se měřit už z výšky startH nad deskou
    // (delší nástroj o víc než startH by narazil) a hledá se až do startH + „Hledat Z“ pod tuto výšku
    const zeroZ = Math.abs(wco[2]) > 1e-6, startH = Math.max(1, +p.startH || 10);
    const top = zTopWork(), zStart = top != null ? Math.min(startH, top) : startH;
    if (zeroZ) { await cmd(`G90 G0 Z${fmt(zStart)}`, true); await waitIdle(); }
    if (atRef) {
      if (!M.hmap || !HM.measured(M.hmap)) throw new Error('Výšková mapa není změřená.');
      const ri = HM.refIdx(M.hmap), rp = HM.points(M.hmap)[ri], [x, y] = M.hmap.at[ri] || [rp.x, rp.y];
      if (zeroZ) await moveSafe(x, y, null, false, true); else await moveSafe(x, y, p.clear);
      await waitIdle();
      zRef = HM.interp(M.hmap, x, y);
    } else {
      // najet nad měď, která zůstala (v nule bývá odfrézovaná) – výška zůstane
      const sp = probeSpot(side);
      const zeroXY = Math.abs(wco[0]) + Math.abs(wco[1]) > 1e-6;
      if (sp && zeroXY) { log(`Měření Z: najíždím nad měď ${spotText(sp)}`, 'info'); await moveSafe(sp.x, sp.y, null, false, zeroZ); await waitIdle(); }
    }
    const search = zeroZ ? Math.max(0.5, wz()) + (+p.search || 10) : (+p.search || 10);
    if (zeroZ) log(`Měření Z: hledám od ${cz(wz(), 1)} mm nad deskou, nejvýš ${cz(search, 1)} mm dolů`, 'info');
    await probeHere(search);
    await cmd(`G10 L20 P0 Z${fmt(zRef + (M.probe.type === 'clip' ? 0 : M.probe.plate))}`, true);
    await cmd(`G91 G0 Z${fmt(M.probe.clear)}`, true); await cmd('G90', true);
    M.zTool = M.prog?.op?.tool || ''; M.zOp = M.prog?.op?.id || ''; save();
    ctx.toast(atRef ? 'Z nástroje změřeno v referenčním bodě mapy.' : 'Z nástroje změřeno a vynulováno.');
    log('Z změřeno sondou' + (atRef ? ' (referenční bod mapy)' : ''), 'info');
  }

  // ---------- programy ----------
  function programList() {
    const res = ctx.getRes(), list = [];
    if (res) for (const op of res.ops) list.push({ id: 'op:' + op.id, label: `${op.no} · ${op.title}`, op });
    for (const f of M.files) list.push({ id: f.id, label: 'Soubor · ' + f.name, file: f });
    if (M.testProg) list.push({ id: 'test', label: 'Test · ' + M.testProg.name, test: M.testProg });
    return list;
  }
  function renderProgList() {
    const list = programList();
    progSel.innerHTML = '';
    progSel.append(el('option', { value: '' }, list.length ? '— vyber program —' : '— žádný program —'));
    for (const it of list) progSel.append(el('option', { value: it.id, selected: M.prog?.src === it.id }, it.label));
  }
  function selectProgram(id) {
    if (M.stream.streaming) { ctx.toast('Během běhu programu nejde přepnout program.', true); renderProgList(); return; }
    const it = programList().find(x => x.id === id);
    if (!it) { M.prog = null; gv.clear('Vyber program nahoře.'); renderStream(); return; }
    if (it.test) M.prog = { ...it.test };
    else if (it.op) {
      const op = it.op;
      M.prog = { src: id, name: ctx.fileName(op), orig: op.gcode, op, side: op.side, iso: op.kind === 'iso' || op.kind === 'silk' || op.kind === 'rest', sim: ctx.boardSimInfo(op) };
    } else M.prog = { src: id, name: it.file.name, orig: it.file.text, iso: true, ext: true };
    rebuildProgram();
  }
  // text programu = originál, případně upravený výškovou mapou; vynechání se drží zvlášť
  function rebuildProgram(keepView) {
    const p = M.prog; if (!p) return;
    p.text = p.orig; p.mapApplied = false;
    const mapOK = M.hmap && HM.measured(M.hmap);
    mapLbl.classList.toggle('dis', !mapOK || !p.iso);
    if (M.useMap && mapOK && p.iso) {
      if (p.side && M.hmapMeta?.side && M.hmapMeta.side !== p.side) ctx.toast('Výšková mapa je změřená pro druhou stranu desky – na tento program se nepoužije.', true);
      else {
        try { p.text = HM.applyToGcode(p.orig, M.hmap, { seg: 1, decimals: ctx.getS().machine.decimals || 4 }); p.mapApplied = true; }
        catch (e) { ctx.toast(e.message, true); }
      }
    }
    M.skips = [];
    gv.load(p.text, { name: p.name + (p.mapApplied ? ' (s mapou)' : ''), ...(p.sim || {}), keepView });
    M.loadedText = null;
    gv.setSkip([]);
    renderMapOverlay();
    renderStream();
    renderResume();
  }
  async function openFiles() {
    const files = await ctx.openGcodeFiles();
    for (const f of files) {
      const old = M.files.find(x => x.name === f.name);
      if (old) old.text = f.text; else M.files.push({ id: 'file:' + Date.now().toString(36) + M.files.length, name: f.name, text: f.text });
    }
    renderProgList();
    const last = M.files.find(x => x.name === files.at(-1)?.name);
    if (last) { progSel.value = last.id; selectProgram(last.id); }
  }
  // vynechání: místo řádků a..b bezpečný přejezd nad materiálem na jejich konec
  function skipText(a, b) {
    const g = gv.g;
    let st = null; for (let k = b; k >= 0 && !st; k--) st = g.lineState[k];
    if (!st) return null;
    const [x, y, z, f] = st, sz = Math.max(safeZ(), 0.5);
    const plunge = M.prog?.op?.prm?.plunge || 100;
    const out = [`G0 Z${fmt(sz)}`, `G0 X${fmt(x)} Y${fmt(y)}`];
    if (z < sz) out.push(z < 0 ? `G1 Z${fmt(z)} F${fmt(plunge)}` : `G0 Z${fmt(z)}`);
    if (f > 0) out.push(`G1 F${fmt(f)}`);
    return out.join('\n');
  }
  function currentLines() {
    const lines = M.prog.text.split(/\r?\n/);
    for (const [a, b] of M.skips) { const t = skipText(a, b); if (t == null) continue; lines[a] = t; for (let i = a + 1; i <= b; i++) lines[i] = ''; }
    // zdvih na konci (výměna nástroje) nesmí narazit nahoře: omezit na horní doraz Z − 1 mm
    const top = zTopWork();
    if (top != null) for (let i = 0; i < lines.length; i++) {
      const m = /^G0\s*Z(-?[\d.]+)\s*$/i.exec(lines[i].trim());
      if (m && +m[1] > top) lines[i] = `G0 Z${(Math.floor(top * 10) / 10).toFixed(1)} (omezeno na horni doraz)`;
    }
    return lines;
  }
  // nejvyšší bezpečné Z v pracovních souřadnicích (1 mm pod horním dorazem), jen když je stroj po homingu
  // horní bezpečné Z ve strojových souřadnicích (1 mm pod horním dorazem; kladný i záporný strojní prostor)
  function zTopMach() {
    const pos = (M.st.mpos?.[2] || 0) > 0.5 || (M.st.wco?.[2] || 0) > 0.5;
    return pos ? travel('Z') - 1 : -1;
  }
  function zTopWork() {
    if (M.settings[22] !== '1' || !M.st.mpos || !M.st.wco) return null;
    const wz = M.st.wco[2], pos = M.st.mpos[2] > 0.5 || wz > 0.5;
    return (pos ? travel('Z') : 0) - 1 - wz;
  }
  async function skipSelection(on) {
    if (!M.prog || !gv.g) return;
    const sel = gv.sel;
    if (on && !sel) throw new Error('Nejdřív vyber dráhu (klik v náhledu) nebo řádky ve výpisu.');
    const before = M.skips.map(r => r.slice());
    if (on) M.skips.push([sel[0], sel[1]]);
    else if (sel) M.skips = M.skips.filter(([a, b]) => b < sel[0] || a > sel[1]);
    else M.skips = [];
    // sloučit překryvy
    M.skips.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const r of M.skips) { const l = merged.at(-1); if (l && r[0] <= l[1] + 1) l[1] = Math.max(l[1], r[1]); else merged.push(r.slice()); }
    M.skips = merged;
    if (M.stream.streaming && M.loadedText === M.prog.text) {
      // za běhu: změnit jen řádky, které ještě nejsou ve stroji
      const lines = currentLines(), orig = M.prog.text.split(/\r?\n/);
      const idx = [], txt = [];
      const touched = new Set();
      for (const [a, b] of [...before, ...M.skips]) for (let i = a; i <= b; i++) touched.add(i);
      for (const i of [...touched].sort((p, q) => p - q)) { idx.push(i); txt.push(lines[i] ?? orig[i]); }
      try { await call('patch', { idx, text: txt }); }
      catch (e) { M.skips = before; throw new Error('Tuto část už nejde vynechat – ' + e.message); }
    }
    gv.setSkip(M.skips.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k)));
    gv.select(null);
    ctx.toast(on ? 'Vybraná část se nepošle – fréza ji přejede nad materiálem.' : 'Vynechání zrušeno.');
  }
  function confirmDlg(title, rows, okText = 'Spustit') {
    return new Promise(res => {
      const d = el('dialog', { class: 'mdlg' });
      d.append(el('div', { class: 'dlghead' }, el('b', {}, title)),
        el('div', { class: 'dlgbody' }, el('table', { class: 'msum' }, ...rows.map(([k, v, warn]) => el('tr', { class: warn ? 'warn' : '' }, el('th', {}, k), el('td', {}, v))))),
        el('div', { class: 'dlgfoot' }, el('button', { class: 'btn', onclick: () => { d.close(); res(false); } }, 'Zrušit'), el('button', { class: 'btn primary', onclick: () => { d.close(); res(true); } }, okText)));
      document.body.append(d); d.addEventListener('close', () => { d.remove(); res(false); }); d.showModal();
    });
  }
  // kontroly před startem: rozsah stroje, nula, mapa, nástroj
  function preChecks(p, g, from) {
    const out = [], wco = M.st.wco || [0, 0, 0];
    if (M.settings[22] === '1' && M.st.mpos) {
      for (const [i, a] of ['X', 'Y', 'Z'].entries()) {
        const tr = travel(a), lo = g.bb['min' + a] + wco[i], hi = g.bb['max' + a] + wco[i];
        // GRBL má po homingu rozsah buď 0 … −dráha (výchozí, home v kladném rohu), nebo 0 … +dráha
        // (home v záporném rohu – častý u 3018); který to je, se pozná podle znaménka strojové polohy / nuly
        const pos = (M.st.mpos[i] > 0.5) || (wco[i] > 0.5);
        if (a === 'Z' && zTopWork() != null) { if (lo < (pos ? 0 : -tr) - 0.01) out.push(`program sjede v ose Z pod rozsah stroje`); continue; } // zdvihy nahoru se omezí na horní doraz
        if (pos) {
          if (lo < -0.01) out.push(`program vyjede v ose ${a} o ${cz(-lo, 1)} mm pod rozsah stroje (strojově < 0)`);
          if (hi > tr + 0.01) out.push(`program vyjede v ose ${a} o ${cz(hi - tr, 1)} mm mimo rozsah stroje (${a} ${cz(tr, 0)} mm)`);
        } else {
          if (hi > 0.01) out.push(`program vyjede v ose ${a} o ${cz(hi, 1)} mm nad rozsah stroje (strojově > 0)`);
          if (lo < -tr - 0.01) out.push(`program vyjede v ose ${a} o ${cz(-tr - lo, 1)} mm mimo rozsah stroje (${a} ${cz(tr, 0)} mm)`);
        }
      }
    }
    if (Math.abs(wco[0]) + Math.abs(wco[1]) + Math.abs(wco[2]) < 1e-6) out.push('nula obrobku není nastavená (WCO = 0)');
    // režim stroje vs. program (frézovací programy KiMillu chtějí CNC, s laserem by se vřeteno vypínalo při G0)
    if (M.settings[32] === '1' && p.op) out.push('stroj je v LASEROVÉM režimu ($32=1) – pro frézování přepni v „Režim stroje“ na CNC');
    { const maxS = +M.settings[30], txt = p.text || M.prog?.text || ''; let sMax = 0; for (const m of txt.matchAll(/S(\d+(?:\.\d+)?)/gi)) sMax = Math.max(sMax, +m[1]); if (M.settings[32] === '1' && maxS > 0 && sMax > maxS + 1e-6) out.push(`program chce S${sMax}, ale stroj má max. S ($30) = ${maxS} – poběží na plný výkon / otáčky`); }
    if (p.mapApplied && M.hmap?.time && Date.now() - M.hmap.time > 3 * 3600e3) out.push(`výšková mapa je stará ${Math.round((Date.now() - M.hmap.time) / 3600e3)} h – deska se mezitím mohla pohnout`);
    if (p.op?.tool) {
      if (M.lastTool && M.lastTool !== p.op.tool) out.push(`naposledy jel nástroj „${M.lastTool}“ – je nasazený „${p.op.tool}“?`);
      if (M.zTool !== p.op.tool && !from) out.push(`Z nebylo změřeno pro „${p.op.tool}“ (Změřit Z / Z sonda)`);
    }
    return out;
  }
  function startPre(from) {
    const g = gv.g, lines = M.prog.text.split(/\r?\n/);
    let st = null; for (let k = from - 1; k >= 0 && !st; k--) st = g.lineState[k];
    let spindle = false, S = ctx.getS().machine.spindle || 12000;
    for (let k = 0; k < from; k++) { const l = lines[k].toUpperCase().replace(/\(.*?\)/g, ''); if (/M0?[34](?!\d)/.test(l)) spindle = true; if (/M0?5(?!\d)/.test(l)) spindle = false; const s = /S(\d+)/.exec(l); if (s) S = +s[1]; }
    const sz = safeZ(), pre = ['G21 G90'];
    if (spindle) pre.push(`M3 S${S}`, 'G4 P2');
    pre.push(`G0 Z${fmt(sz)}`);
    if (st) {
      pre.push(`G0 X${fmt(st[0])} Y${fmt(st[1])}`);
      if (st[2] < sz) pre.push(st[2] < 0 ? `G1 Z${fmt(st[2])} F${fmt(M.prog.op?.prm?.plunge || 100)}` : `G0 Z${fmt(st[2])}`);
      if (st[3] > 0) pre.push(`G1 F${fmt(st[3])}`);
    }
    return pre;
  }
  async function startProgram({ fromSel = false, check = false } = {}) {
    if (!M.on) throw new Error('Stroj není připojen.');
    if (!M.prog || !gv.g) throw new Error('Není vybraný program.');
    if (M.stream.streaming) throw new Error('Program už běží.');
    if (M.st.state.startsWith('Alarm')) throw new Error('Stroj je v alarmu – odemkni ho nebo udělej homing.');
    let from = 0;
    if (fromSel) {
      if (!gv.sel) throw new Error('Klikni ve výpisu na řádek, od kterého se má začít.');
      from = gv.sel[0];
    }
    const p = M.prog, g = gv.g, wco = M.st.wco || [0, 0, 0];
    const mapOK = M.hmap && HM.measured(M.hmap);
    const rows = [
      ['Program', p.name],
      ['Nástroj', p.op ? p.op.tool : 'neznámý (cizí soubor)'],
      ['Strana', p.side ? (p.side === 'bottom' ? 'zespodu (deska otočená)' : 'shora') : '—'],
      ['Nula (WCO)', `X ${cz(wco[0])}  Y ${cz(wco[1])}  Z ${cz(wco[2])}`, Math.abs(wco[0]) + Math.abs(wco[1]) + Math.abs(wco[2]) < 1e-6],
      ['Výšková mapa', p.mapApplied ? `ano (${M.hmap.nx}×${M.hmap.ny}${M.hmap.centers ? ' se středy' : ''})` : p.iso ? (mapOK ? 'ne (vypnuto)' : 'ne – není změřená') : 'ne (netýká se)', p.iso && !p.mapApplied],
      ['Vynecháno', M.skips.length ? M.skips.map(([a, b]) => a === b ? `${a + 1}` : `${a + 1}–${b + 1}`).join(', ') : 'nic'],
      ['Začátek', from ? `od řádku ${from + 1} (najetí nad místo, pak dolů)` : 'od začátku'],
      ['Odhad času', `${Math.max(1, Math.round(g.total * (ctx.timeFactor?.(p.op?.kind || 'soubor') || 1)))} min${ctx.timeFactor && ctx.timeFactor(p.op?.kind || 'soubor') !== 1 ? ' (podle předchozích běhů)' : ''}`],
    ];
    if (p.test) rows.splice(1, 0, ['Test', `${p.test.res.run.length} ${p.test.res.run.length === 1 ? 'tvar' : 'tvarů'} · ${TC.SHAPES[p.test.t.shape]} · ${cz(p.test.res.size.w, 1)} × ${cz(p.test.res.size.h, 1)} mm od X ${cz(p.test.t.x, 2)} Y ${cz(p.test.t.y, 2)}`], ['Materiál', p.test.t.material || '—'], ...p.test.res.warn.map(w => ['Pozor', w, true]));
    if (check) rows.unshift(['Režim', 'KONTROLNÍ BĚH – bez pohybu']);
    for (const w of preChecks(p, g, from)) rows.push(['Pozor', w, true]);
    if (!await confirmDlg(check ? 'Kontrolní běh' : 'Spustit program', rows, check ? 'Zkontrolovat' : 'Spustit')) return;
    const lines = currentLines();
    await call('load', { lines });
    M.loadedText = p.text;
    if (check) { M.checkRun = true; M.checkErrors = 0; await cmd('$C', true); }
    await call('start', { from, pre: from ? startPre(from) : [] });
    log(`Start: ${p.name}${from ? ' od řádku ' + (from + 1) : ''}${check ? ' (kontrolní běh)' : ''}`, 'info');
    if (!check) {
      if (p.op?.tool) M.lastTool = p.op.tool;
      M.run = { t0: Date.now(), from, paused: 0, pauseT: null, est: g.total, kind: p.op?.kind || 'soubor' };
      M.lastRun = { src: p.src, name: p.name, sig: sig(p.text), done: from, interrupted: false, w: null, t: Date.now() };
      save();
      journalStart(p, from);
    }
  }

  // ---------- přerušení, pokračování, deník, kalibrace času ----------
  function sig(t) { let h = 2166136261; for (let i = 0; i < t.length; i += 7) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return t.length + ':' + (h >>> 0); }
  function interrupted(why) {
    if (M.lastRun && !M.checkRun) { M.lastRun.interrupted = why !== 'stop'; M.lastRun.why = why; save(); }
    finishRun(why === 'stop' ? 'zastaveno' : 'přerušeno (' + why + ')');
    renderResume();
  }
  function finishRun(result, secs) {
    const r = M.run; if (!r) return; M.run = null;
    const active = (secs ?? (Date.now() - r.t0) / 1000) - r.paused / 1000;
    const done = M.stream.done, total = M.stream.total || 1;
    if (result === 'hotovo') {
      if (M.lastRun) { M.lastRun.interrupted = false; save(); }
      // kalibrace odhadu času (jen celé běhy od začátku)
      if (!r.from && r.est > 0.2 && active > 10) ctx.timeCal(r.kind, active / 60 / r.est);
    }
    journalEnd(result, active, done / total);
    renderResume();
    const p = M.prog;
    if (p?.test && (result === 'hotovo' || result === 'zastaveno')) {
      if (result === 'hotovo' && p.test.res.next && M.test.after === 'next') { M.test.x = +p.test.res.next.x.toFixed(3); M.test.y = +p.test.res.next.y.toFixed(3); save(); if (!panes.test.hidden) renderTest(); }
      setTimeout(() => saveTestDialog(p.test, result), 400);
    }
  }
  function journalStart(p, from) {
    const J = ctx.journal();
    J.runs.unshift({ id: Date.now(), t: Date.now(), board: ctx.boardName() || '', prog: p.name, tool: p.op?.tool || '', toolId: p.op?.toolId || '', from, map: !!p.mapApplied, est: Math.round(gv.g.total * 10) / 10, result: 'běží', secs: 0, cut: gv.g.cutLen });
    J.runs = J.runs.slice(0, 300); ctx.journalSave(J); renderJournal();
  }
  function journalEnd(result, secs, frac) {
    const J = ctx.journal(), e = J.runs[0]; if (!e || e.result !== 'běží') return;
    e.result = result; e.secs = Math.round(secs);
    const meters = e.cut * Math.max(0, Math.min(1, frac)) / 1000;
    if (e.toolId) { const t = J.tools[e.toolId] || (J.tools[e.toolId] = { name: e.tool, m: 0, since: Date.now(), runs: 0 }); t.m += meters; t.runs++; t.name = e.tool; }
    ctx.journalSave(J); renderJournal();
  }
  // místo, odkud pokračovat: řádek, jehož konec je nejblíž poslední známé poloze (GRBL má ~15 pohybů v zásobníku)
  function resumeLine() {
    const L = M.lastRun, g = gv.g; if (!L || !g) return 0;
    const lo = Math.max(0, L.done - 40), hi = Math.min(g.lines.length - 1, L.done);
    if (!L.w) return Math.max(0, L.done - 16);
    let best = Math.max(0, L.done - 16), bd = Infinity;
    for (let k = lo; k <= hi; k++) { const st = g.lineState[k]; if (!st) continue; const d = Math.hypot(st[0] - L.w[0], st[1] - L.w[1], (st[2] - L.w[2]) * 3); if (d < bd) { bd = d; best = k; } }
    return best; // začne se tímto řádkem znovu (raději kousek dvakrát než díra)
  }
  function renderResume() {
    const L = M.lastRun, p = M.prog;
    const ok = L?.interrupted && p && L.sig === sig(p.text) && !M.stream.streaming;
    resumeBox.hidden = !ok; resumeBox.innerHTML = '';
    if (!ok) return;
    const k = resumeLine();
    resumeBox.append(el('span', {}, `Program byl přerušen (${L.why || ''}) u řádku ${L.done}.`),
      el('button', { class: 'btn small primary', onclick: safeRun(async () => { gv.select(k, k); gv._scrollToLine(k, true); await startProgram({ fromSel: true, resume: true }); }) }, `Pokračovat od řádku ${k + 1}`),
      el('button', { class: 'iconbtn', title: 'Zahodit', onclick: () => { M.lastRun.interrupted = false; save(); renderResume(); } }, '✕'));
  }
  function renderJournal() {
    const P = journalPane; if (P.hidden) return; P.innerHTML = '';
    const J = ctx.journal();
    P.append(el('h4', {}, 'Nástroje – najeto'));
    const tt = el('table', { class: 'keys' });
    for (const [id, t] of Object.entries(J.tools)) tt.append(el('tr', {}, el('td', {}, t.name), el('td', {}, `${cz(t.m, 2)} m`), el('td', { class: 'muted' }, `${t.runs}× od ${new Date(t.since).toLocaleDateString('cs-CZ')}`),
      el('td', {}, el('button', { class: 'btn small', title: 'Nasazen nový kus – vynulovat', onclick: () => { J.tools[id] = { name: t.name, m: 0, since: Date.now(), runs: 0 }; ctx.journalSave(J); renderJournal(); } }, 'Nový'))));
    if (!Object.keys(J.tools).length) P.append(el('div', { class: 'muted small' }, 'Zatím nic.')); else P.append(tt);
    P.append(el('h4', {}, 'Poslední běhy'));
    const rt = el('div', { class: 'jlist' });
    for (const e of J.runs.slice(0, 60)) rt.append(el('div', { class: 'jrun' + (e.result === 'hotovo' ? '' : ' warn') },
      el('div', { class: 'jh' }, el('span', {}, new Date(e.t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })),
        el('b', {}, e.result), el('span', { class: 'muted' }, e.secs ? `${Math.floor(e.secs / 60)}:${String(e.secs % 60).padStart(2, '0')} (odhad ${Math.round(e.est)} min)` : '')),
      el('div', { class: 'jp' }, e.prog),
      el('div', { class: 'muted small' }, `${e.board} · ${e.tool}${e.map ? ' · mapa' : ''}${e.from ? ' · od ř. ' + (e.from + 1) : ''}`)));
    P.append(J.runs.length ? rt : el('div', { class: 'muted small' }, 'Zatím žádný běh.'),
      el('div', { class: 'mrow' }, el('button', { class: 'btn small', onclick: () => ctx.download('kimill_denik.csv', '\ufeffčas;deska;program;nástroj;výsledek;sekund;odhad min\n' + J.runs.map(e => [new Date(e.t).toLocaleString('cs-CZ'), e.board, e.prog, e.tool, e.result, e.secs, e.est].join(';')).join('\n')) }, 'Export CSV')));
  }

  // ---------- výšková mapa ----------
  function mapArea(prog = M.prog) {
    // oblast podle desky (obrys na straně programu), jinak podle rozsahu programu
    const b = prog?.op ? ctx.boardOutlineBB(prog.op.side) : null;
    if (b) return { x0: b.minX + 1, y0: b.minY + 1, w: b.maxX - b.minX - 2, h: b.maxY - b.minY - 2, side: prog.op.side };
    const c = gv.g?.cutBB; if (c) return { x0: c.minX, y0: c.minY, w: c.maxX - c.minX, h: c.maxY - c.minY, side: null };
    return null;
  }
  const areaInp = { x0: el('input'), y0: el('input'), w: el('input'), h: el('input') };
  function newMapFromForm() {
    const m = planMap();
    M.hmap = m; M.hmapMeta = { side: M.prog?.op?.side || null, moved: m.moved, skipped: m.skipped || 0 };
    return m;
  }
  function fillArea(a) { if (!a) return; for (const k of ['x0', 'y0', 'w', 'h']) areaInp[k].value = fmt(+a[k].toFixed(2)); M.mapCfg.nx = Math.max(2, Math.round(a.w / 10) + 1); M.mapCfg.ny = Math.max(2, Math.round(a.h / 10) + 1); save(); }
  async function measureMap(onlyIdx = null) {
    if (!M.on) throw new Error('Stroj není připojen.');
    if (M.st.state !== 'Idle') throw new Error('Stroj není v klidu.');
    const m = onlyIdx == null ? newMapFromForm() : M.hmap;
    if (!m) throw new Error('Nejdřív vytvoř mapu.');
    const c = M.mapCfg, p = M.probe;
    M.mapping = true; M.mapAbort = false; renderMap();
    try {
      await cmd('G21 G90', true);
      const wco = await readOffsets();
      // přeměření jednoho bodu: změří se i referenční bod a hodnota se vezme relativně k němu
      const R = HM.refIdx(m);
      if (onlyIdx != null && HM.skipped(m, onlyIdx)) throw new Error('Tento bod je mimo desku – neměří se, výška se dopočítá z okolí.');
      const order = HM.probeOrder(m).filter(q => onlyIdx == null || q.i === onlyIdx || (onlyIdx !== R && q.i === R));
      if (onlyIdx != null) order.sort((a, b) => a.i === R ? -1 : b.i === R ? 1 : 0);
      let refRaw = null;
      const pts = HM.points(m);
      let n = 0;
      for (const q of order) {
        if (M.mapAbort) throw new Error('Měření mapy přerušeno.');
        M.mapSel = q.i; renderMapOverlay();
        await cmd(`G0 Z${fmt(c.clear)}`, true);
        await cmd(`G0 X${fmt(q.x)} Y${fmt(q.y)}`, true);
        let prb = await probeOnce(`Z${fmt(c.zmin)}`, p.fast);
        if (p.double) { await cmd(`G91 G0 Z${fmt(p.retract)}`, true); await cmd('G90', true); prb = await probeOnce(`Z${fmt(c.zmin)}`, p.slow); }
        const zw = prb[2] - wco[2];
        if (onlyIdx != null) {
          if (q.i === R) refRaw = zw;
          if (q.i === onlyIdx) HM.setZ(m, pts[q.i], +(q.i === R ? 0 : zw - refRaw).toFixed(4));
        } else HM.setZ(m, pts[q.i], +zw.toFixed(4));
        n++;
        renderMapTable(); renderMapOverlay();
        progMap.textContent = `${n} / ${order.length} bodů`;
      }
      await cmd(`G0 Z${fmt(c.clear)}`, true);
      if (onlyIdx == null) {
        HM.fillSkipped(m);
        const ref = HM.normalize(m);
        m.time = Date.now();
        // klip na mědi: měřil sám nástroj -> nula Z = povrch v referenčním bodě mapy
        if (p.type === 'clip') { await waitIdle(); await cmd(`G10 L20 P0 Z${fmt(wz() - ref)}`, true); }
        ctx.toast(`Výšková mapa změřená (${order.length} bodů${m.skipped ? `, ${m.skipped} mimo desku dopočítáno` : ''}, rozptyl ${cz(mapSpread(m), 3)} mm).` + (p.type === 'clip' ? ' Nula Z = povrch v referenčním bodě.' : ' Nasaď nástroj a změř Z v referenčním bodě.'));
      } else { HM.fillSkipped(m); ctx.toast('Bod přeměřen (relativně k referenčnímu bodu).'); }
      M.wizard.done['map:' + (M.hmapMeta?.side || '')] = true;
      ctx.mapChanged?.();
      rebuildProgram(true);
    } finally { M.mapping = false; M.mapSel = -1; renderMap(); renderMapOverlay(); }
  }
  const mapSpread = m => { const v = [...m.z, ...m.zc].filter(x => x != null); return v.length ? Math.max(...v) - Math.min(...v) : 0; };
  // náhled mapy: změřená mapa, jinak plánované body podle formuláře (svislé čárky jako v Candle)
  let mapPreview = false;
  function renderMapOverlay() {
    let m = M.hmap, preview = false;
    if ((!m || !HM.measured(m)) && mapPreview && !M.mapping) { try { m = planMap(); preview = true; } catch { m = null; } }
    if (!m) { gv.setHeightMap(null); try { drawHeat(null); } catch { } return; }
    let pts = HM.points(m).map((p, i) => { const x = m.at[i]?.[0] ?? p.x, y = m.at[i]?.[1] ?? p.y; return { x, y, z: preview ? null : HM.getZ(m, p), moved: Math.hypot(x - p.x, y - p.y) > 1e-6, nx: p.x, ny: p.y, skip: HM.skipped(m, i) }; });
    if (preview) pts = pts.filter(q => !q.skip); // body mimo desku se neměří
    const surf = !preview && HM.measured(m) ? HM.surface(m) : null;
    try { drawHeat(surf, pts); } catch { /* ještě před vytvořením panelu */ }
    gv.setHeightMap({ pts, surf, edges: preview ? [] : HM.edges(m), active: M.mapSel, exag: 20, lift: 0.4, preview, rect: { x0: m.x0, y0: m.y0, w: m.w, h: m.h }, vert: { top: M.mapCfg.clear, bottom: M.mapCfg.zmin } });
  }
  // mapa podle formuláře (bez uložení) – pro náhled bodů i pro měření
  function planMap() {
    if (!areaInp.w.value) fillArea(mapArea());
    const a = Object.fromEntries(Object.entries(areaInp).map(([k, i]) => [k, num(i.value)]));
    if (Object.values(a).some(v => v == null) || a.w <= 0 || a.h <= 0) throw new Error('Zadej oblast mapy (X, Y, šířka, výška).');
    const m = HM.newMap({ ...a, nx: M.mapCfg.nx, ny: M.mapCfg.ny, centers: M.mapCfg.centers });
    m.moved = M.mapCfg.holes && M.prog?.op ? HM.avoidHoles(m, ctx.boardHoles(M.prog.op.side), M.mapCfg.margin) : 0;
    // jen nad deskami (panel s mezerami, nepravidelný obrys): body mimo desku posunout dovnitř nebo vynechat
    if (M.mapCfg.onBoard !== false && M.prog?.op) {
      const inside = ctx.boardInside?.(M.prog.op.side, 0.5);
      if (inside) { const r = HM.fitToBoards(m, inside); m.moved += r.moved; m.skipped = r.skipped; }
    }
    return m;
  }
  // 2D barevný náhled mapy (gradient výšky jako v Candle) nad tabulkou
  const heat = el('canvas', { class: 'mheat', width: 300, height: 180, title: 'Výšková mapa – barva podle výšky (modrá = nízko, červená = vysoko). Klik vybere nejbližší bod.' });
  const heatBox = el('div', { class: 'mheatbox', hidden: true }, heat, el('div', { class: 'mheatlg' }, el('span', { class: 'lo' }), el('div', { class: 'bar', style: `background:${HM.rampCss(9)}` }), el('span', { class: 'hi' })));
  let heatPts = null, heatSf = null;
  function drawHeat(sf, pts) {
    heatSf = sf; heatPts = pts || null; heatBox.hidden = !sf;
    if (!sf) return;
    const W = heat.clientWidth || 300, sc = (W - 12) / sf.w, H = Math.max(60, Math.min(260, Math.round(sf.h * sc + 12)));
    const dpr = window.devicePixelRatio || 1;
    heat.width = Math.round(W * dpr); heat.height = Math.round(H * dpr); heat.style.height = H + 'px';
    const g = heat.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const s = Math.min((W - 12) / sf.w, (H - 12) / sf.h), ox = (W - sf.w * s) / 2, oy = (H + sf.h * s) / 2;
    const img = g.createImageData(Math.max(1, Math.round(sf.w * s * dpr)), Math.max(1, Math.round(sf.h * s * dpr)));
    const span = Math.max(1e-6, sf.hi - sf.lo);
    for (let py = 0; py < img.height; py++) for (let px = 0; px < img.width; px++) {
      // bilineárně ze vzorků plochy
      const u = px / Math.max(1, img.width - 1) * (sf.nx - 1), v = (1 - py / Math.max(1, img.height - 1)) * (sf.ny - 1);
      const i = Math.min(sf.nx - 2, Math.floor(u)), j = Math.min(sf.ny - 2, Math.floor(v)), fu = u - i, fv = v - j;
      const z = (sf.z[j * sf.nx + i] * (1 - fu) + sf.z[j * sf.nx + i + 1] * fu) * (1 - fv) + (sf.z[(j + 1) * sf.nx + i] * (1 - fu) + sf.z[(j + 1) * sf.nx + i + 1] * fu) * fv;
      const c = HM.ramp((z - sf.lo) / span), o = (py * img.width + px) * 4;
      img.data[o] = c[0] * 255; img.data[o + 1] = c[1] * 255; img.data[o + 2] = c[2] * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, Math.round(ox * dpr), Math.round((oy - sf.h * s) * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const [i, p] of (pts || []).entries()) {
      const x = ox + (p.x - sf.x0) * s, y = oy - (p.y - sf.y0) * s, on = i === M.mapSel;
      g.beginPath(); g.arc(x, y, on ? 4.5 : 2.5, 0, 7); g.fillStyle = on ? '#fff' : 'rgba(0,0,0,.65)'; g.fill();
      g.lineWidth = 1; g.strokeStyle = on ? '#000' : 'rgba(255,255,255,.8)'; g.stroke();
    }
    const f = v => cz(v, 3);
    heatBox.querySelector('.lo').textContent = f(sf.lo); heatBox.querySelector('.hi').textContent = f(sf.hi);
    heat._map = { ox, oy, s };
  }
  heat.addEventListener('click', e => {
    if (!heatSf || !heatPts || !heat._map) return;
    const r = heat.getBoundingClientRect(), k = heat.offsetWidth ? r.width / heat.offsetWidth : 1, { ox, oy, s } = heat._map;
    const x = heatSf.x0 + ((e.clientX - r.left) / k - ox) / s, y = heatSf.y0 + (oy - (e.clientY - r.top) / k) / s;
    let best = -1, bd = Infinity; heatPts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { M.mapSel = best; renderMapOverlay(); renderMapTable(); mapTable.querySelector('input.on')?.focus(); }
  });
  const progMap = el('span', { class: 'muted small' });
  const mapTable = el('div', { class: 'maptbl' });
  // Tabulka výšek jako v Candlu: sloupce = X, řádky = Y (nahoře nejvyšší Y), buňky = naměřené Z.
  // Středy čtverců se vkládají mezi řádky/sloupce mřížky. Barva = odchylka od průměru.
  let bigTbl = null;
  function buildMapTable(box, big) {
    const m = M.hmap; const hadFocus = box.contains(document.activeElement); box.innerHTML = '';
    if (!m) return;
    const pts = HM.points(m), dx = m.w / (m.nx - 1), dy = m.h / (m.ny - 1);
    const all = [...m.z, ...m.zc].filter(v => v != null);
    const mn = all.length ? Math.min(...all) : 0, mx = all.length ? Math.max(...all) : 0, avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
    const span = Math.max(1e-3, mx - avg, avg - mn);
    const tint = v => { if (v == null) return ''; const t = Math.max(-1, Math.min(1, (v - avg) / span)); const c = t > 0 ? 'var(--err)' : 'var(--info)'; return `background:color-mix(in srgb, ${c} ${Math.round(Math.abs(t) * 38)}%, var(--bg))`; };
    const C = m.centers ? 2 : 1, NX = (m.nx - 1) * C + 1, NY = (m.ny - 1) * C + 1;
    const cells = []; // [řádek][sloupec] -> input
    const t = el('table', { class: big ? 'big' : '' });
    const hr = el('tr', {}, el('th', { class: 'corner' }, 'Y \\ X'));
    for (let ci = 0; ci < NX; ci++) hr.append(el('th', { class: ci % C ? 'c' : '' }, cz(m.x0 + ci * dx / C, 1)));
    t.append(hr);
    for (let rj = NY - 1; rj >= 0; rj--) {
      const tr = el('tr', {}, el('th', { class: rj % C ? 'c' : '' }, cz(m.y0 + rj * dy / C, 1)));
      const row = [];
      for (let ci = 0; ci < NX; ci++) {
        const gridPt = ci % C === 0 && rj % C === 0, cenPt = C === 2 && ci % 2 === 1 && rj % 2 === 1;
        if (!gridPt && !cenPt) { tr.append(el('td', { class: 'gap' })); row.push(null); continue; }
        const i = gridPt ? ci / C : (ci - 1) / 2, j = gridPt ? rj / C : (rj - 1) / 2;
        const k = gridPt ? j * m.nx + i : m.nx * m.ny + j * (m.nx - 1) + i; // index v points()
        const arr = gridPt ? m.z : m.zc, ai = gridPt ? j * m.nx + i : j * (m.nx - 1) + i;
        const v = arr[ai], p = pts[k], at = m.at[k];
        const moved = at && Math.hypot(at[0] - p.x, at[1] - p.y) > 1e-6;
        const R = HM.refIdx(m), sk = HM.skipped(m, k);
        const inp = el('input', { value: v == null ? '' : cz(v, 3), placeholder: sk ? '·' : '—', style: tint(v),
          class: [k === R ? 'ref' : '', k === M.mapSel ? 'on' : '', cenPt ? 'cen' : '', moved ? 'mov' : '', sk ? 'skip' : ''].join(' '),
          title: `${cenPt ? 'Střed' : 'Bod'} X ${cz(at?.[0] ?? p.x, 2)}  Y ${cz(at?.[1] ?? p.y, 2)}${k === R ? ' – referenční bod' : ''}${sk ? ' – mimo desku, neměří se (výška dopočítaná z okolí)' : moved ? ' (posunut kvůli díře / k desce)' : ''}` });
        inp.addEventListener('focus', () => { M.mapSel = k; renderMapOverlay(); inp.select(); });
        inp.addEventListener('change', () => { const nv = num(inp.value); if (nv === arr[ai]) return; arr[ai] = nv; rebuildProgram(true); ctx.mapChanged?.(); setTimeout(renderMapTable, 0); });
        inp.addEventListener('keydown', e => {
          e.stopPropagation();
          const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [1, 0] }[e.key];
          if (!mv) return;
          const r0 = cells.findIndex(r => r.includes(inp)), c0 = cells[r0].indexOf(inp);
          for (let r = r0 + mv[0], c = c0 + mv[1], n = 0; n < 2 * Math.max(NX, NY); r += mv[0] || 0, c += mv[1] || 0, n++) {
            if (r < 0 || r >= cells.length || c < 0 || c >= NX) break;
            if (cells[r][c]) { e.preventDefault(); inp.dispatchEvent(new Event('change')); setTimeout(() => (big ? bigTbl : mapTable)?.querySelectorAll('tr')[r + 1]?.querySelectorAll('td')[c]?.querySelector('input')?.focus(), 0); return; }
          }
        });
        row.push(inp); tr.append(el('td', {}, inp));
      }
      cells.push(row); t.append(tr);
    }
    const nMeas = all.length, nAll = m.z.length + m.zc.length;
    box.append(el('div', { class: 'tblwrap' }, t),
      el('div', { class: 'muted small tblinfo' },
        `Změřeno ${nMeas}/${nAll}`, nMeas ? ` · min ${cz(mn, 3)} · max ${cz(mx, 3)} · rozptyl ${cz(mx - mn, 3)} mm` : '',
        m.z[0] != null ? ` · ref. ${cz(HM.getZ(m, HM.points(m)[HM.refIdx(m)]) ?? 0, 3)}` : '',
        el('span', { class: 'lg' }, el('i', { style: 'background:color-mix(in srgb, var(--info) 38%, var(--bg))' }), 'níž', el('i', { style: 'background:color-mix(in srgb, var(--err) 38%, var(--bg))' }), 'výš'),
        m.centers ? ' · menší buňky = středy čtverců' : ''));
    if (hadFocus) box.querySelector('input.on')?.focus();
  }
  function renderMapTable() {
    buildMapTable(mapTable, false);
    if (M.hmap) mapTable.prepend(el('div', { class: 'mrow tblhead' }, el('b', {}, 'Tabulka výšek [mm]'), el('button', { class: 'btn small', onclick: openMapTable }, 'Zvětšit')));
    if (bigTbl?.isConnected) buildMapTable(bigTbl, true);
  }
  function openMapTable() {
    const d = el('dialog', { class: 'tbldlg' });
    bigTbl = el('div', { class: 'maptbl' });
    d.append(el('div', { class: 'dlghead' }, el('b', {}, 'Výšková mapa – tabulka bodů'), el('button', { class: 'btn small', onclick: () => d.close() }, 'Zavřít')),
      el('div', { class: 'dlgbody' }, el('div', { class: 'muted small' }, 'Hodnoty lze přepsat (Enter / šipky = další buňka). Změna se hned promítne do programu.'), bigTbl));
    d.addEventListener('close', () => { d.remove(); bigTbl = null; M.mapSel = -1; renderMapOverlay(); });
    document.body.append(d); buildMapTable(bigTbl, true); d.showModal();
  }
  function renderMap() {
    const P = panes.map; P.innerHTML = '';
    const c = M.mapCfg, p = M.probe;
    const fld = (label, obj, key, opt = {}) => {
      const i = el('input', { value: obj[key] });
      i.addEventListener('change', () => { const v = opt.int ? Math.round(num(i.value)) : num(i.value); if (v != null) { obj[key] = v; save(); } i.value = obj[key]; renderMapOverlay(); });
      i.addEventListener('keydown', e => e.stopPropagation());
      return el('label', { class: 'mf' }, el('span', {}, label), el('span', { class: 'inp' }, i, opt.unit ? el('span', { class: 'u' }, opt.unit) : null));
    };
    const chk = (label, obj, key) => { const i = el('input', { type: 'checkbox', checked: !!obj[key] }); i.addEventListener('change', () => { obj[key] = i.checked; save(); renderMapOverlay(); }); return el('label', { class: 'f check small' }, i, label); };
    if (!areaInp.w.value) fillArea(mapArea());
    for (const i of Object.values(areaInp)) { i.onkeydown = e => e.stopPropagation(); i.onchange = () => renderMapOverlay(); }
    const pattern = el('div', { class: 'seg2' },
      el('button', { class: c.centers ? '' : 'on', onclick: e => { c.centers = false; save(); segOn(e.target); renderMapOverlay(); } }, 'Mřížka'),
      el('button', { class: c.centers ? 'on' : '', onclick: e => { c.centers = true; save(); segOn(e.target); renderMapOverlay(); } }, 'Mřížka se středy'));
    const ptype = el('div', { class: 'seg2' },
      el('button', { class: p.type === 'clip' ? 'on' : '', onclick: e => { p.type = 'clip'; save(); segOn(e.target); } }, 'Klip na mědi'),
      el('button', { class: p.type === 'probe' ? 'on' : '', onclick: e => { p.type = 'probe'; save(); segOn(e.target); } }, 'Dotyková sonda'));
    const m = M.hmap;
    P.append(...[
      el('h4', {}, 'Oblast (relativní souřadnice)'),
      el('div', { class: 'mgrid' }, el('label', { class: 'mf' }, el('span', {}, 'X'), el('span', { class: 'inp' }, areaInp.x0)), el('label', { class: 'mf' }, el('span', {}, 'Y'), el('span', { class: 'inp' }, areaInp.y0)),
        el('label', { class: 'mf' }, el('span', {}, 'Šířka'), el('span', { class: 'inp' }, areaInp.w)), el('label', { class: 'mf' }, el('span', {}, 'Výška'), el('span', { class: 'inp' }, areaInp.h))),
      el('div', { class: 'mrow' }, el('button', { class: 'btn small', onclick: () => { fillArea(mapArea()); renderMap(); renderMapOverlay(); } }, M.prog?.op ? 'Podle obrysu desky' : 'Podle programu')),
      el('h4', {}, 'Body'),
      el('div', { class: 'mgrid' }, fld('Bodů X', c, 'nx', { int: true }), fld('Bodů Y', c, 'ny', { int: true })), pattern,
      chk('Vyhnout se dírám (bod se posune vedle)', c, 'holes'), fld('Odstup od díry', c, 'margin', { unit: 'mm' }),
      chk('Jen nad deskami (body mimo desku se posunou k desce nebo vynechají)', c, 'onBoard'),
      el('h4', {}, 'Sonda'), ptype,
      el('div', { class: 'mgrid' }, fld('Výška přejezdu', c, 'clear', { unit: 'mm' }), fld('Měřit až do Z', c, 'zmin', { unit: 'mm' }),
        fld('Rychle', p, 'fast', { unit: 'mm/min' }), fld('Pomalu', p, 'slow', { unit: 'mm/min' }), fld('Odjezd', p, 'retract', { unit: 'mm' }), fld('Začít měřit Z nad deskou', p, 'startH', { unit: 'mm' }), fld('Hledat Z (sonda Z)', p, 'search', { unit: 'mm' }),
        p.type === 'probe' ? fld('Tloušťka destičky', p, 'plate', { unit: 'mm' }) : null),
      chk('Měřit dvakrát (rychle, pak pomalu)', p, 'double'),
      el('div', { class: 'mrow' },
        el('button', { class: 'btn primary small', disabled: M.mapping, onclick: safeRun(() => measureMap()) }, 'Změřit mapu'),
        M.mapping ? el('button', { class: 'btn small', onclick: () => { M.mapAbort = true; } }, 'Přerušit') : null, progMap),
      el('div', { class: 'mrow' },
        el('button', { class: 'btn small', disabled: !m || M.mapping || M.mapSel < 0, onclick: safeRun(() => measureMap(M.mapSel)) }, 'Přeměřit vybraný bod'),
        el('button', { class: 'btn small', disabled: !m || !HM.measured(m), onclick: safeRun(() => probeZ(true)) }, 'Z nástroje v ref. bodě')),
      m ? el('div', { class: 'muted small' }, `Mapa ${m.nx}×${m.ny}${m.centers ? ' se středy' : ''}, ${HM.points(m).length} bodů${M.hmapMeta?.moved ? `, ${M.hmapMeta.moved} posunuto` : ''}${M.hmapMeta?.skipped ? `, ${M.hmapMeta.skipped} mimo desku (neměří se)` : ''}${HM.measured(m) ? `, rozptyl ${cz(mapSpread(m), 3)} mm` : ''}${M.hmapMeta?.side ? ` · strana ${M.hmapMeta.side === 'bottom' ? 'spodní' : 'horní'}` : ''}. Referenční bod = první měřený bod u levého dolního rohu.`) : null,
      heatBox,
      mapTable,
      el('div', { class: 'mrow' },
        el('button', { class: 'btn small', disabled: !m, onclick: () => ctx.download(`${(M.prog?.name || 'mapa').replace(/\.nc$/i, '')}.map`, HM.toMapFile(m, { zBottom: c.zmin, zTop: c.clear })) }, 'Uložit .map'),
        el('button', { class: 'btn small', onclick: loadMapFile }, 'Načíst .map'),
        el('button', { class: 'btn small', disabled: !m, onclick: () => { M.hmap = null; M.hmapMeta = null; renderMap(); rebuildProgram(true); ctx.mapChanged?.(); } }, 'Smazat'))].filter(Boolean));
    renderMapTable();
    requestAnimationFrame(() => { if (heatSf) drawHeat(heatSf, heatPts); });
  }
  function loadMapFile() {
    const i = el('input', { type: 'file', accept: '.map,.txt' });
    i.addEventListener('change', async () => {
      try { M.hmap = HM.fromMapFile(await i.files[0].text()); M.hmapMeta = { side: M.prog?.op?.side || null }; M.hmap.time = Date.now(); renderMap(); rebuildProgram(true); ctx.mapChanged?.(); ctx.toast('Výšková mapa načtena.'); }
      catch (e) { ctx.toast(e.message, true); }
    });
    i.click();
  }

  // ---------- průvodce ----------
  function wizardSteps() {
    const res = ctx.getRes(); if (!res) return null;
    const ops = res.ops.filter(o => ctx.isEnabled(o));
    const steps = [];
    steps.push({ id: 'conn', title: 'Připoj stroj', text: 'Vyber port a připoj se. Po zapnutí je GRBL v alarmu – udělej homing (nebo jen odemkni).', acts: [['Homing', () => act('home')], ['Odemknout', () => act('unlock')]], ok: () => M.on && !M.st.state.startsWith('Alarm') });
    let side = null, tool = null;
    for (const op of ops) {
      if (op.side !== side) {
        if (side) steps.push({ id: 'flip:' + op.side, title: 'Otoč desku', text: `Uvolni desku, otoč ji ${ctx.getS().setup.mirrorAxis === 'h' ? 'horní hranou k sobě (přes vodorovnou osu)' : 'přes svislou osu'} a nasaď ji na kolíčky. Nula XY zůstává (je na kolíčku).` });
        else steps.push({ id: 'fix', title: 'Upevni polotovar', text: res.pinsOn ? 'Upevni cuprextit na přípravek. Díry pro kolíčky se vyvrtají prvním programem.' : 'Upevni cuprextit oboustrannou páskou nebo upínkami.' });
        if (!side) steps.push({ id: 'xy', title: 'Nastav nulu XY', text: `Najeď nástrojem na ${ctx.originDesc()} a vynuluj X a Y.`, acts: [['Nulovat X Y tady', () => zeroAxes('XY')]] });
        side = op.side; tool = null;
      }
      if (op.tool !== tool) {
        steps.push({ id: 'tool:' + op.id, title: `Nasaď nástroj: ${op.tool}`, text: 'Vyměň nástroj a dotáhni ho. Vřeteno musí stát.' });
        const mapNeeded = op.kind === 'iso' || op.kind === 'rest' || op.kind === 'silk';
        const setterOK = M.setter.on && M.setter.x != null && M.setter.ref;
        const atRef = mapNeeded && hasMap(op.side), sp = atRef ? null : probeSpot(op.side);
        // program se načte dřív, než se měří – Z se pak počítá k jeho nástroji
        const zActs = [[atRef ? 'Změřit Z v ref. bodě mapy' : sp ? 'Najet na měď a změřit Z' : 'Změřit Z tady', () => { selectOp(op); return probeZ(atRef, op.side); }]];
        if (setterOK && tool) zActs.unshift(['Změřit na Z sondě', () => { selectOp(op); return setterMeasure(false); }]);
        if (tool) zActs.push(['Z stejné jako předchozí', () => { selectOp(op); sameZ(op); }]);
        steps.push({ id: 'z:' + op.id, title: 'Změř Z nástroje', text: (setterOK && tool ? 'Nejrychleji na pevné Z sondě (nula zůstane, mapa platí). ' : '') + (M.probe.type === 'clip' ? 'Klipem: připni klip na nástroj, druhý vodič na měď desky.' + (atRef ? ' Měří se v referenčním bodě mapy, aby mapa dál platila.' : ` Nástroj najede nad měď, která zůstala: ${spotText(sp)} – spusť ho nad desku do výšky pár mm.`) : 'Polož destičku pod nástroj.') + (M.setter.on && !tool ? ' Po změření prvního nástroje udělej „Referenční měření“ na Z sondě.' : ''), acts: zActs, ok: () => M.zOp === op.id });
        tool = op.tool;
      }
      if (op.kind === 'iso' && !steps.some(s => s.id === 'map:' + op.side)) {
        steps.push({ id: 'map:' + op.side, title: `Výšková mapa – ${op.side === 'bottom' ? 'spodní' : 'horní'} strana`, text: 'Klip zůstává připnutý. Oblast se vezme z obrysu desky, body se vyhnou dírám. Po změření je nula Z = povrch v referenčním bodě.', acts: [['Nastavit mapu', () => { selectOp(op); fillArea(mapArea()); showPane('map'); }], ['Změřit mapu', () => { selectOp(op); if (!areaInp.w.value) fillArea(mapArea()); return measureMap(); }]], ok: () => hasMap(op.side) });
      }
      steps.push({ id: 'run:' + op.id, title: `Spusť ${op.no} · ${op.title}`, text: `${op.tool} · F${op.prm.feed} S${op.prm.spindle} · ≈ ${Math.max(1, Math.round(op.minutes))} min${op.kind === 'iso' || op.kind === 'rest' ? ' · s výškovou mapou' : ''}. Odepni klip!`, acts: [['Načíst program', () => selectOp(op)], ['Spustit', () => { selectOp(op); return startProgram(); }]], ok: () => !!M.wizard.done['run:' + op.id] });
    }
    steps.push({ id: 'end', title: 'Hotovo', text: 'Vyndej desku, odjehli okraje a zkontroluj izolaci (např. multimetrem mezi sítěmi).' });
    return steps;
  }
  const hasMap = side => M.hmap && HM.measured(M.hmap) && (M.hmapMeta?.side || null) === side;
  function selectOp(op) { const id = 'op:' + op.id; renderProgList(); progSel.value = id; selectProgram(id); }
  function renderWizard() {
    const P = panes.wiz; P.innerHTML = '';
    const steps = wizardSteps();
    if (!steps) { P.append(el('p', { class: 'muted' }, 'Průvodce vede výrobou desky načtené v KiMillu (záložka Deska). Pro cizí program použij ovládání vlevo a program nahoře.')); return; }
    const W = M.wizard;
    if (W.i >= steps.length) W.i = steps.length - 1;
    P.append(el('div', { class: 'muted small' }, `Deska ${ctx.boardName()} · ${steps.length} kroků`));
    steps.forEach((s, i) => {
      const done = W.done[s.id] || (s.ok && s.ok() && i < W.i);
      const cur = i === W.i;
      const box = el('div', { class: 'wstep' + (cur ? ' cur' : '') + (done ? ' done' : '') },
        el('div', { class: 'wh', onclick: () => { W.i = i; renderWizard(); } }, el('span', { class: 'wn' }, done ? '✓' : String(i + 1)), el('b', {}, s.title)));
      if (cur) {
        box.append(el('p', {}, s.text));
        const row = el('div', { class: 'mrow' });
        for (const [label, fn] of s.acts || []) row.append(el('button', { class: 'btn small', onclick: safeRun(async () => { await fn(); renderWizard(); }) }, label));
        row.append(el('button', { class: 'btn primary small', onclick: () => { W.done[s.id] = true; W.i = i + 1; renderWizard(); } }, i === steps.length - 1 ? 'Dokončit' : 'Hotovo, další'));
        box.append(row);
      }
      P.append(box);
    });
    P.append(el('div', { class: 'mrow' }, el('button', { class: 'btn small', onclick: () => { M.wizard = { i: 0, done: {} }; renderWizard(); } }, 'Začít znovu')));
  }

  // ---------- test materiálu: zkušební řezy, matice F / S / hloubka / krok / zanoření ----------
  const testTools = () => ctx.getS().tools || [];
  const testTool = () => testTools().find(t => t.id === M.test.toolId) || testTools().find(t => t.type === 'end') || testTools()[0];
  const toolBase = t => ({ feed: t?.feed || 300, plunge: t?.plunge || 100, spindle: t?.spindle || 12000, depth: t?.type === 'v' ? 0.1 : t?.type === 'drill' ? 2 : 1, step: Math.max(TC.Z_MIN, TC.roundZ(t?.step || 0.3)) });
  function testSpec() {
    const T = M.test, tool = testTool();
    if (!tool) throw new Error('Knihovna nástrojů je prázdná.');
    if (!T.base) T.base = toolBase(tool);
    if (T.x == null || T.y == null) { const w = M.st.wpos || [0, 0, 0]; T.x = +w[0].toFixed(3); T.y = +w[1].toFixed(3); }
    const mc = ctx.getS().machine, wco = M.st.wco || [0, 0, 0];
    const park = T.after === 'park' && T.park ? { parkX: T.park[0] - wco[0], parkY: T.park[1] - wco[1] } : {};
    return { ...T, ...park, tool: { ...tool, name: toolName(tool) }, skip: new Set(T.skip || []), M: { zTravel: mc.zTravel ?? 2, zApproach: mc.zApproach ?? 0.3, zEnd: mc.zEnd ?? 15, dwell: mc.dwell ?? 2 } };
  }
  const toolName = t => t ? (t.name || (t.type === 'v' ? `V-fréza ${t.vAngle || 30}° hrot ${cz(t.vTip ?? t.dia, 2)}` : `${t.type === 'drill' ? 'Vrták' : 'Fréza'} Ø${cz(t.dia, 2)}`)) : '';
  function buildTestProg() {
    const t = testSpec(), res = TC.buildTest(t, t.M);
    const tool = t.tool, pad = 4;
    const name = `test_${(t.material || 'material').replace(/[^\w\-]+/g, '_')}_${TC.SHAPES[t.shape]}.nc`;
    const op = { id: 'test', kind: 'test', tool: toolName(tool), toolId: tool.id, prm: { feed: t.base.feed, plunge: t.base.plunge, spindle: t.base.spindle } };
    const sim = { tool: { type: tool.type, dia: tool.dia, vTip: tool.vTip, vAngle: tool.vAngle }, stock: { minX: res.bbox.minX - pad, minY: res.bbox.minY - pad, maxX: res.bbox.maxX + pad, maxY: res.bbox.maxY + pad }, T: t.thickness || 3, prev: [], motif: null };
    M.testProg = { src: 'test', name, orig: res.text, op, iso: false, test: { t, res }, sim };
    return M.testProg;
  }
  function previewTest() {
    if (M.stream.streaming) throw new Error('Během běhu programu nejde test připravit.');
    buildTestProg(); renderProgList(); progSel.value = 'test'; selectProgram('test');
  }
  async function startTest() { previewTest(); await startProgram(); }

  function renderTest() {
    const P = panes.test; if (!P || P.hidden) return; const sc = P.scrollTop; P.innerHTML = '';
    const T = M.test, tool = testTool();
    if (tool && T.toolId !== tool.id) T.toolId = tool.id;
    if (!T.base) T.base = toolBase(tool);
    const re = () => { save(); renderTest(); };
    const fld = (label, obj, key, opt = {}) => {
      const i = el('input', { value: obj[key] == null ? '' : String(obj[key]).replace('.', ','), placeholder: opt.ph || '' });
      i.addEventListener('change', () => { let v = num(i.value); if (v == null && opt.allowNull) v = null; else if (v == null) { i.value = obj[key]; return; } if (v != null && opt.z) v = TC.roundZ(v); if (v != null && opt.int) v = Math.round(v); if (v != null && opt.min != null) v = Math.max(opt.min, v); obj[key] = v; re(); });
      i.addEventListener('keydown', e => e.stopPropagation());
      return el('label', { class: 'mf' }, el('span', {}, label), el('span', { class: 'inp' }, i, opt.unit ? el('span', { class: 'u' }, opt.unit) : null));
    };
    const seg = (opts, obj, key, after) => el('div', { class: 'seg2' }, ...opts.map(([v, t]) => el('button', { class: obj[key] === v ? 'on' : '', onclick: () => { obj[key] = v; after?.(); re(); } }, t)));
    // nástroj a materiál
    const tSel = el('select', {}, ...testTools().map(t => el('option', { value: t.id, selected: t.id === T.toolId }, toolName(t))));
    tSel.addEventListener('change', () => { T.toolId = tSel.value; const nt = testTool(); const b = MAT.best(T.material, nt.id); T.base = b ? { feed: b.feed, plunge: b.plunge, spindle: b.spindle, depth: b.depth, step: b.step } : toolBase(nt); if (nt.type === 'drill') T.shape = 'drill'; re(); });
    const mat = el('input', { value: T.material || '', placeholder: 'např. hliník 6061, MDF, PMMA…', list: 'cmMatList' });
    mat.addEventListener('keydown', e => e.stopPropagation());
    mat.addEventListener('change', () => { T.material = mat.value.trim(); const b = MAT.best(T.material, T.toolId); if (b) { T.base = { feed: b.feed, plunge: b.plunge, spindle: b.spindle, depth: b.depth, step: b.step }; ctx.toast(`Předvyplněno z uloženého testu (${new Date(b.t).toLocaleDateString('cs-CZ')}).`); } re(); });
    const dl = el('datalist', { id: 'cmMatList' }, ...MAT.names().map(n => el('option', { value: n })));
    const saved = MAT.byTool(T.toolId);
    P.append(el('h4', {}, 'Nástroj a materiál'),
      el('label', { class: 'mf' }, el('span', {}, 'Nástroj'), el('span', { class: 'inp' }, tSel)),
      el('div', { class: 'mgrid' }, el('label', { class: 'mf' }, el('span', {}, 'Materiál'), el('span', { class: 'inp' }, mat)), fld('Tloušťka materiálu', T, 'thickness', { unit: 'mm', min: 0.1 })), dl);
    // tvar
    P.append(el('h4', {}, 'Tvar'), seg(Object.entries(TC.SHAPES).slice(0, 3), T, 'shape'), el('div', { style: 'height:4px' }), seg(Object.entries(TC.SHAPES).slice(3), T, 'shape'));
    const g = el('div', { class: 'mgrid' });
    if (T.shape === 'line') g.append(fld('Délka', T, 'len', { unit: 'mm', min: 1 }));
    if (T.shape === 'rect' || (T.shape === 'pocket' && T.pocketShape !== 'circle')) g.append(fld('Šířka', T, 'w', { unit: 'mm', min: 0.5 }), fld('Výška', T, 'h', { unit: 'mm', min: 0.5 }));
    if (T.shape === 'tri') g.append(fld('Strana', T, 'side', { unit: 'mm', min: 1 }));
    if (T.shape === 'circle' || (T.shape === 'pocket' && T.pocketShape === 'circle')) g.append(fld('Průměr', T, 'dia', { unit: 'mm', min: 0.5 }));
    if (T.shape === 'pocket') g.append(fld('Překrytí', T, 'overlap', { unit: '%', min: 5 }));
    if (T.shape === 'pocket') P.append(seg([['rect', 'Obdélníková kapsa'], ['circle', 'Kruhová kapsa']], T, 'pocketShape'));
    if (g.children.length) P.append(g);
    if (['rect', 'tri', 'circle'].includes(T.shape)) P.append(el('div', { class: 'mlabel' }, 'Dráha nástroje'), seg([['center', 'Po středu'], ['inside', 'Uvnitř'], ['outside', 'Vně']], T, 'comp'),
      el('div', { class: 'muted small' }, T.comp === 'inside' ? 'Uvnitř = otvor přesně na zadaný rozměr.' : T.comp === 'outside' ? 'Vně = díl přesně na zadaný rozměr.' : 'Po středu = střed nástroje jede po zadaném tvaru.'));
    if (!['line', 'drill'].includes(T.shape)) P.append(el('div', { class: 'mlabel' }, 'Směr frézování'), seg([[true, 'Sousledně'], [false, 'Nesousledně']], T, 'climb'));
    if (T.shape === 'drill') P.append(el('div', { class: 'muted small' }, 'Vrtání na místě – krok Z = hloubka jednoho zavrtání (výplach třísek), mezi kroky vyjede nad materiál.'));
    // parametry
    const B = T.base;
    P.append(el('h4', {}, 'Parametry'),
      el('div', { class: 'mgrid' }, fld('Posuv F', B, 'feed', { unit: 'mm/min', min: 1 }), fld('Zanoření', B, 'plunge', { unit: 'mm/min', min: 1 }), fld('Otáčky S', B, 'spindle', { unit: 'ot/min', int: true, min: 0 }), fld('Hloubka', B, 'depth', { unit: 'mm', z: true }), fld('Krok Z', B, 'step', { unit: 'mm', z: true })),
      el('div', { class: 'muted small' }, `Hloubka a krok se zaokrouhlují na ${cz(TC.Z_MIN, 2)} mm. Z0 = povrch materiálu.`));
    if (saved.length) P.append(el('div', { class: 'mrow' }, el('span', { class: 'muted small' }, 'Uložené:'), ...saved.slice(0, 6).map(r => el('button', { class: 'btn small', title: `F${r.feed} · zanoření ${r.plunge} · S${r.spindle} · hloubka ${cz(r.depth, 2)} · krok ${cz(r.step, 2)}${r.note ? ' · ' + r.note : ''}`, onclick: () => { T.base = { feed: r.feed, plunge: r.plunge, spindle: r.spindle, depth: r.depth, step: r.step }; T.material = r.material; re(); } }, r.material || '?'))));
    // matice
    const mx = T.matrix;
    const mchk = el('input', { type: 'checkbox', checked: !!mx.on }); mchk.addEventListener('change', () => { mx.on = mchk.checked; T.skip = []; re(); });
    P.append(el('h4', {}, 'Matice variant'), el('label', { class: 'f check small' }, mchk, 'Víc variant najednou (řádky × sloupce)'));
    if (mx.on) {
      const axRow = (label, ax) => {
        const ks = el('select', {}, ...Object.entries(TC.VARS).map(([k, t]) => el('option', { value: k, selected: ax.key === k }, t)));
        ks.addEventListener('change', () => { ax.key = ks.value; const b = B[ax.key]; ax.from = ax.key === 'depth' || ax.key === 'step' ? TC.roundZ(b / 2) : Math.round(b * 0.6); ax.to = ax.key === 'depth' || ax.key === 'step' ? TC.roundZ(b * 1.5) : Math.round(b * 1.4); T.skip = []; re(); });
        const z = ax.key === 'depth' || ax.key === 'step';
        return [el('label', { class: 'mf' }, el('span', {}, label), el('span', { class: 'inp' }, ks)),
          el('div', { class: 'mgrid three' }, fld('od', ax, 'from', { z, min: z ? TC.Z_MIN : 1, unit: TC.UNITS[ax.key] }), fld('do', ax, 'to', { z, min: z ? TC.Z_MIN : 1, unit: TC.UNITS[ax.key] }), fld('počet', ax, 'n', { int: true, min: 1 }))];
      };
      P.append(...axRow('Řádky', mx.rows), ...axRow('Sloupce', mx.cols), el('div', { class: 'mgrid' }, fld('Mezera mezi tvary', T, 'gap', { unit: 'mm', min: 0 })));
    }
    // výpočet
    let res = null, err = null;
    try { const sp = testSpec(); res = TC.buildTest(sp, sp.M); } catch (e) { err = e.message; }
    if (mx.on && res) {
      const rows = res.rowsV, cols = res.colsV, skip = new Set(T.skip || []);
      const tb = el('table', { class: 'tgrid' }, el('tr', {}, el('th', { class: 'corner' }, `${TC.VARS[mx.rows.key]} \\ ${TC.VARS[mx.cols.key]}`), ...cols.map(v => el('th', {}, fmtV(mx.cols.key, v)))));
      const order = new Map(res.run.map((c, i) => [`${c.r},${c.c}`, i + 1]));
      for (let r = rows.length - 1; r >= 0; r--) tb.append(el('tr', {}, el('th', {}, fmtV(mx.rows.key, rows[r])), ...cols.map((_, c) => {
        const k = `${r},${c}`, sk = skip.has(k);
        return el('td', {}, el('button', { class: 'tcell' + (sk ? ' skip' : ''), title: sk ? 'Vynecháno – klik vrátí' : `Pořadí ${order.get(k)} – klik vynechá`, onclick: () => { const s2 = new Set(T.skip || []); s2.has(k) ? s2.delete(k) : s2.add(k); T.skip = [...s2]; re(); } }, sk ? '✕' : String(order.get(k) ?? '')));
      })));
      P.append(el('div', { class: 'muted small' }, 'Číslo = pořadí (od nejšetrnější varianty). Klik na buňku ji vynechá. Spodní řádek je v materiálu nejblíž počátku.'), el('div', { class: 'tgridwrap' }, tb));
    }
    // počátek a po konci
    P.append(el('h4', {}, 'Počátek (levý dolní roh testu)'),
      el('div', { class: 'mgrid three' }, fld('X', T, 'x', { unit: 'mm' }), fld('Y', T, 'y', { unit: 'mm' }),
        el('button', { class: 'btn small', style: 'align-self:end;height:30px', title: 'Počátek = aktuální poloha nástroje', onclick: () => { const w = M.st.wpos; if (!w) { ctx.toast('Poloha stroje není známá – připoj stroj.', true); return; } T.x = +w[0].toFixed(3); T.y = +w[1].toFixed(3); re(); } }, 'Tady')),
      el('div', { class: 'muted small' }, 'Relativní souřadnice. Z0 nastav na povrch materiálu (Změřit Z sondou).'));
    const aft = el('select', {}, ...[['up', 'Nahoru (Z na konci)'], ['start', 'Zpět nad počátek'], ['next', 'Posunout vedle na další test'], ['park', 'Na parkovací pozici']].map(([v, t]) => el('option', { value: v, selected: T.after === v }, t)));
    aft.addEventListener('change', () => { T.after = aft.value; re(); });
    P.append(el('h4', {}, 'Po konci testu'), el('label', { class: 'mf' }, el('span', {}, 'Kam vyjet'), el('span', { class: 'inp' }, aft)));
    if (T.after === 'next') P.append(el('div', { class: 'mgrid' }, fld('Posun X', T, 'nextDX', { unit: 'mm', allowNull: true, ph: res ? cz(res.size.w + (T.gap ?? 3), 1) + ' (auto)' : 'auto' }), fld('Posun Y', T, 'nextDY', { unit: 'mm' })),
      el('div', { class: 'muted small' }, 'Po dokončení se počátek posune – další test jde hned spustit vedle.'));
    if (T.after === 'park') P.append(el('div', { class: 'mrow' }, el('span', { class: 'muted small' }, T.park ? `Parkovací pozice X ${cz(T.park[0], 2)} Y ${cz(T.park[1], 2)} (strojově)` : 'Parkovací pozice není uložená.'),
      el('button', { class: 'btn small', onclick: () => { const m = M.st.mpos; if (!m) { ctx.toast('Poloha stroje není známá – připoj stroj.', true); return; } T.park = [m[0], m[1]]; re(); } }, 'Parkovací pozice = tady')));
    // souhrn a spuštění
    if (err) P.append(el('div', { class: 'tsum err' }, err));
    else {
      P.append(el('div', { class: 'tsum' }, `${res.run.length} ${res.run.length === 1 ? 'tvar' : res.run.length < 5 ? 'tvary' : 'tvarů'} · ${cz(res.size.w, 1)} × ${cz(res.size.h, 1)} mm · X ${cz(T.x, 1)}…${cz(T.x + res.size.w, 1)} · Y ${cz(T.y, 1)}…${cz(T.y + res.size.h, 1)}`,
        ...res.warn.map(w => el('div', { class: 'warn' }, '⚠ ' + w))));
    }
    P.append(el('div', { class: 'mrow' },
      el('button', { class: 'btn small', disabled: !!err, onclick: safeRun(previewTest) }, 'Náhled'),
      el('button', { class: 'btn primary', disabled: !!err || !M.on, title: M.on ? '' : 'Připoj stroj', onclick: safeRun(startTest) }, '▶ Spustit test')));
    P.scrollTop = sc;
  }
  const fmtV = (k, v) => k === 'depth' || k === 'step' ? cz(v, 2) : String(Math.round(v));

  // po testu: uložit nejlepší variantu jako materiál + nástroj
  function saveTestDialog(test, result) {
    const { t, res } = test;
    const cells = res.cells.filter(c => !c.skip);
    let pick = cells.length === 1 ? cells[0] : null;
    const vals = { ...(pick ? pick.p : t.base) };
    const d = el('dialog', { class: 'mdlg tsave' });
    const matI = el('input', { value: t.material || '', placeholder: 'název materiálu', list: 'cmMatList2' });
    const note = el('textarea', { rows: 2, placeholder: 'poznámka (kvalita hrany, třísky, zvuk…)' });
    for (const i of [matI, note]) i.addEventListener('keydown', e => e.stopPropagation());
    const inputs = {};
    const fields = el('div', { class: 'mgrid' });
    const fill = () => { for (const [k, i] of Object.entries(inputs)) i.value = k === 'depth' || k === 'step' ? String(vals[k]).replace('.', ',') : vals[k]; };
    for (const [k, label] of Object.entries(TC.VARS)) {
      const i = el('input', {}); inputs[k] = i;
      i.addEventListener('keydown', e => e.stopPropagation());
      i.addEventListener('change', () => { let v = num(i.value); if (v == null) { fill(); return; } if (k === 'depth' || k === 'step') v = +TC.roundZ(v).toFixed(2); vals[k] = v; fill(); });
      fields.append(el('label', { class: 'mf' }, el('span', {}, label), el('span', { class: 'inp' }, i, el('span', { class: 'u' }, TC.UNITS[k]))));
    }
    fill();
    const body = el('div', { class: 'dlgbody' },
      el('p', { class: 'muted small' }, `Test ${result === 'hotovo' ? 'dokončen' : 'zastaven'} – ${TC.SHAPES[t.shape]}, nástroj ${t.tool.name}. ${cells.length > 1 ? 'Klikni na nejlepší buňku, hodnoty se předvyplní (jdou upravit).' : 'Uprav hodnoty, pokud je chceš doladit.'}`));
    if (cells.length > 1) {
      const mx = t.matrix, tb = el('table', { class: 'tgrid big' }, el('tr', {}, el('th', { class: 'corner' }, `${TC.VARS[mx.rows.key]} \\ ${TC.VARS[mx.cols.key]}`), ...res.colsV.map(v => el('th', {}, fmtV(mx.cols.key, v)))));
      for (let r = res.rowsV.length - 1; r >= 0; r--) tb.append(el('tr', {}, el('th', {}, fmtV(mx.rows.key, res.rowsV[r])), ...res.colsV.map((_, c) => {
        const cell = res.cells.find(x => x.r === r && x.c === c);
        const b = el('button', { class: 'tcell' + (cell.skip ? ' skip' : ''), disabled: cell.skip, onclick: () => { pick = cell; Object.assign(vals, cell.p); fill(); tb.querySelectorAll('.tcell').forEach(x => x.classList.toggle('on', x === b)); } }, cell.skip ? '✕' : '✓');
        return el('td', {}, b);
      })));
      body.append(el('div', { class: 'tgridwrap' }, tb));
    }
    const apply = el('input', { type: 'checkbox' });
    body.append(el('label', { class: 'mf' }, el('span', {}, 'Materiál'), el('span', { class: 'inp' }, matI)), el('datalist', { id: 'cmMatList2' }, ...MAT.names().map(n => el('option', { value: n }))),
      fields, el('label', { class: 'mf' }, el('span', {}, 'Poznámka'), note),
      el('label', { class: 'f check small' }, apply, `Zapsat F, zanoření, S a krok i jako výchozí hodnoty nástroje „${t.tool.name}“`));
    d.append(el('div', { class: 'dlghead' }, el('b', {}, 'Uložit výsledek testu?')), body,
      el('div', { class: 'dlgfoot' }, el('button', { class: 'btn', onclick: () => d.close() }, 'Neukládat'),
        el('button', { class: 'btn primary', onclick: () => {
          const material = matI.value.trim();
          if (!material) { ctx.toast('Zadej název materiálu.', true); matI.focus(); return; }
          if (cells.length > 1 && !pick) { ctx.toast('Vyber nejlepší buňku (nebo uprav hodnoty ručně a vyber libovolnou).', true); return; }
          const rec = MAT.add({ material, toolId: t.tool.id, toolName: t.tool.name, feed: vals.feed, plunge: vals.plunge, spindle: vals.spindle, depth: vals.depth, step: Math.min(vals.step, vals.depth), shape: TC.SHAPES[t.shape], note: note.value.trim() });
          if (apply.checked) ctx.applyToolValues?.(t.tool.id, { feed: rec.feed, plunge: rec.plunge, spindle: rec.spindle, step: rec.step });
          const J = ctx.journal(); if (J.runs[0]?.prog === M.prog?.name) { J.runs[0].note = `uloženo: ${material}`; ctx.journalSave(J); }
          M.test.material = material; M.test.base = { feed: rec.feed, plunge: rec.plunge, spindle: rec.spindle, depth: rec.depth, step: rec.step }; save();
          ctx.toast(`Výsledek uložen: ${material} – ${t.tool.name}${apply.checked ? ' (i do knihovny nástrojů)' : ''}.`);
          d.close(); renderTest();
        } }, 'Uložit')));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
  }

  // ---------- nastavení: klávesy pendantu, GRBL $$ ----------
  // klávesy pendantu – do karty Nastavení i do okna Nastavení aplikace
  let keysTarget = null;
  function renderKeysInto(P, rerender) {
    keysTarget = rerender;
    P.append(el('h4', {}, 'Klávesy pendantu'), el('div', { class: 'muted small' }, 'Pendant posílá F13–F24 (se Shift / Ctrl). Krátký stisk jogu = krok, podržení = plynulý pojezd. Klikni na klávesu a stiskni novou.'));
    const t = el('table', { class: 'keys' });
    for (const [k, label] of ACTIONS) {
      const v = M.keymap[k] || '';
      t.append(el('tr', {}, el('td', {}, label), el('td', {}, el('button', { class: 'btn small' + (learning === k ? ' primary' : ''), onclick: () => { learning = learning === k ? null : k; rerender(); } }, learning === k ? 'stiskni klávesu…' : v ? v.replace('S-', 'Shift+').replace('C-', 'Ctrl+') : '—')),
        el('td', {}, v ? el('button', { class: 'iconbtn', title: 'Zrušit', onclick: () => { M.keymap[k] = ''; save(); rerender(); } }, '✕') : null)));
    }
    P.append(t, el('div', { class: 'mrow' }, el('button', { class: 'btn small', onclick: () => { M.keymap = Object.fromEntries(ACTIONS.map(a => [a[0], a[2]])); save(); rerender(); } }, 'Výchozí (jako UGS)')));
  }
  // výchozí hodnoty sondy a mapy
  function renderProbeInto(P) {
    const p = M.probe, c = M.mapCfg;
    const fld = (label, obj, key, unit, int) => { const i = el('input', { value: obj[key] }); i.addEventListener('keydown', e => e.stopPropagation()); i.addEventListener('change', () => { const v = int ? Math.round(num(i.value)) : num(i.value); if (v != null) { obj[key] = v; save(); } i.value = obj[key]; }); return el('label', { class: 'mf' }, el('span', {}, label), el('span', { class: 'inp' }, i, unit ? el('span', { class: 'u' }, unit) : null)); };
    const chk = (label, obj, key) => { const i = el('input', { type: 'checkbox', checked: !!obj[key] }); i.addEventListener('change', () => { obj[key] = i.checked; save(); }); return el('label', { class: 'f check small' }, i, label); };
    const seg = (opts, obj, key) => el('div', { class: 'seg2' }, ...opts.map(([v, t]) => el('button', { class: obj[key] === v ? 'on' : '', onclick: e => { obj[key] = v; save(); segOn(e.target); } }, t)));
    P.append(el('h4', {}, 'Sonda'), seg([['clip', 'Klip na mědi'], ['probe', 'Dotyková sonda']], p, 'type'),
      el('div', { class: 'mgrid' }, fld('Rychle', p, 'fast', 'mm/min'), fld('Pomalu', p, 'slow', 'mm/min'), fld('Odjezd', p, 'retract', 'mm'), fld('Začít měřit Z nad deskou', p, 'startH', 'mm'), fld('Hledat Z (sonda Z)', p, 'search', 'mm'), fld('Po změření vyjet o', p, 'clear', 'mm'), fld('Tloušťka destičky', p, 'plate', 'mm')),
      chk('Měřit dvakrát (rychle, pak pomalu)', p, 'double'),
      el('h4', {}, 'Kde měřit Z nástroje (dotyk na měď)'), seg([['auto', 'Automaticky – měď vně desky'], ['manual', 'Ručně'], ['here', 'Kde stojí nástroj']], p, 'spot'),
      el('div', { class: 'mgrid' }, fld('Místo X (pracovně)', p, 'spotX', 'mm'), fld('Místo Y (pracovně)', p, 'spotY', 'mm')),
      el('div', { class: 'muted small' }, `V nule bývá měď už odfrézovaná a nástroj by neměl kam ťuknout. Automaticky se najede na rámeček polotovaru vně desky (za ořezem), nejblíž nule. Teď: ${spotText(probeSpot())}.`),
      el('h4', {}, 'Nula XY dotykovou sondou'), el('div', { class: 'mgrid' }, fld('Průměr hrotu sondy', p, 'tipDia', 'mm'), fld('Hledat v XY', p, 'xySearch', 'mm'), fld('Roh: odstup od hran', p, 'cornerOff', 'mm')),
      el('h4', {}, 'Pevná Z sonda (tool setter)'), el('div', { class: 'mgrid' }, fld('Hledat dolů', M.setter, 'search', 'mm'), fld('Začít měřit ve strojovém Z', M.setter, 'z', 'mm')),
      el('div', { class: 'muted small' }, M.setter.x == null ? 'Poloha sondy se ukládá ve Stroji tlačítkem „Poloha sondy = tady“.' : `Poloha sondy X ${cz(M.setter.x, 2)} Y ${cz(M.setter.y, 2)} (strojově).`),
      el('h4', {}, 'Výšková mapa'), el('div', { class: 'mgrid' }, fld('Bodů X', c, 'nx', '', true), fld('Bodů Y', c, 'ny', '', true), fld('Výška přejezdu', c, 'clear', 'mm'), fld('Měřit až do Z', c, 'zmin', 'mm'), fld('Odstup od díry', c, 'margin', 'mm')),
      seg([[false, 'Mřížka'], [true, 'Mřížka se středy']], c, 'centers'), chk('Vyhnout se dírám', c, 'holes'));
  }
  function renderSettings() {
    const P = panes.set; P.innerHTML = '';
    renderKeysInto(P, renderSettings);
    P.append(el('h4', {}, 'Nastavení GRBL ($$)'));
    const keys = Object.keys(M.settings).map(Number).sort((a, b) => a - b);
    if (!keys.length) P.append(el('div', { class: 'muted small' }, M.on ? 'Načítám…' : 'Připoj stroj.'));
    const st = el('table', { class: 'keys' });
    for (const k of keys) {
      const i = el('input', { value: M.settings[k] });
      i.addEventListener('keydown', e => e.stopPropagation());
      i.addEventListener('change', safeRun(async () => { await cmd(`$${k}=${i.value.trim()}`, true); M.settings[k] = i.value.trim(); ctx.toast(`$${k} uloženo.`); }));
      st.append(el('tr', {}, el('td', {}, `$${k}`), el('td', { class: 'muted' }, SETTING_NAMES[k] || ''), el('td', {}, i)));
    }
    P.append(st, el('div', { class: 'mrow' }, el('button', { class: 'btn small', disabled: !M.on, onclick: safeRun(async () => { await cmd('$$', true); renderSettings(); }) }, 'Načíst znovu')));
  }

  // ---------- veřejné ----------
  renderAll();
  renderSetterInfo();
  showPane('wiz');
  refreshPorts().then(openEvents).catch(e => log('Porty: ' + e.message, 'err'));
  return {
    show() { renderProgList(); if (!M.prog && ctx.getRes()) { const op = ctx.getRes().ops.find(o => o.kind === 'iso'); if (op) selectOp(op); } else if (M.prog?.op) { const op = ctx.getRes()?.ops.find(o => o.id === M.prog.op.id); if (op && op.gcode !== M.prog.orig && !M.stream.streaming) selectOp(op); } renderWizard(); },
    refresh() { renderProgList(); renderWizard(); },
    getMap: () => M.hmap ? { map: M.hmap, meta: M.hmapMeta } : null,
    setMap: m => { if (!m?.map) return; M.hmap = m.map; M.hmapMeta = m.meta || null; if (M.prog) rebuildProgram(true); renderMapOverlay(); },
    openTest(toolId, rec) { if (toolId) M.test.toolId = toolId; if (rec) { M.test.base = { feed: rec.feed, plunge: rec.plunge, spindle: rec.spindle, depth: rec.depth, step: rec.step }; M.test.material = rec.material || M.test.material; } save(); showPane('test'); },
    get M() { return M; }, gv, act, startProgram, measureMap, skipSelection, renderKeysInto, renderProbeInto, redraw: () => { gv.draw(); renderMapOverlay(); }, _t: { wizardSteps, probeZ, moveSafe, zeroAxes, preChecks, probeSpot, connect, planMap, measureMap, selectOp },
  };
}
