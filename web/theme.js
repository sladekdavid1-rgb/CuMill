// Barevná témata: hotová i vlastní. Barvy jsou #rrggbb nebo #rrggbbaa.
// Rozhraní přes proměnné CSS, náhled desky (plátno) přes objekt COL, 3D náhled přes T3D.

export const KEYS = [
  // [klíč, popis, skupina]
  ['bg', 'Pozadí aplikace', 'Rozhraní'], ['panel', 'Panely', 'Rozhraní'], ['panel2', 'Tlačítka a pole', 'Rozhraní'],
  ['line', 'Okraje', 'Rozhraní'], ['line2', 'Okraje ovládacích prvků', 'Rozhraní'], ['overlay', 'Plovoucí lišty nad náhledem', 'Rozhraní'],
  ['text', 'Text', 'Text'], ['muted', 'Text vedlejší', 'Text'], ['dim', 'Text nevýrazný', 'Text'], ['comment', 'Komentáře v G-kódu', 'Text'],
  ['cu', 'Zvýraznění (hlavní barva)', 'Zvýraznění'], ['cu2', 'Zvýraznění světlé', 'Zvýraznění'], ['onAccent', 'Text na zvýraznění', 'Zvýraznění'], ['sel', 'Výběr', 'Zvýraznění'],
  ['ok', 'V pořádku', 'Stavy'], ['warn', 'Varování', 'Stavy'], ['err', 'Chyba / alarm', 'Stavy'], ['info', 'Informace / běží', 'Stavy'],
  ['stage', 'Pozadí náhledu desky', 'Náhled desky'], ['grid', 'Mřížka', 'Náhled desky'], ['gridMajor', 'Mřížka hlavní', 'Náhled desky'],
  ['blank', 'Polotovar', 'Náhled desky'], ['blankEdge', 'Okraj polotovaru', 'Náhled desky'], ['board', 'Deska', 'Náhled desky'], ['boardEdge', 'Obrys desky', 'Náhled desky'],
  ['fcu', 'Měď horní F.Cu', 'Náhled desky'], ['bcu', 'Měď spodní B.Cu', 'Náhled desky'], ['hole', 'Díry', 'Náhled desky'], ['holeRing', 'Okraj díry', 'Náhled desky'],
  ['geo', 'Další geometrie', 'Náhled desky'], ['rapid', 'Přejezdy', 'Náhled desky'], ['marker', 'Značka problému', 'Náhled desky'], ['pin', 'Kolíčky', 'Náhled desky'],
  ['origin', 'Nula stroje', 'Náhled desky'], ['areaClear', 'Oblast odfrézovat', 'Náhled desky'], ['areaBlock', 'Oblast zakázat', 'Náhled desky'], ['tab', 'Můstky ořezu', 'Náhled desky'],
  ['opIsoF', 'Dráhy izolace F.Cu', 'Dráhy operací'], ['opIsoB', 'Dráhy izolace B.Cu', 'Dráhy operací'], ['opPins', 'Kolíčky', 'Dráhy operací'], ['opDrill', 'Vrtání', 'Dráhy operací'],
  ['opMill', 'Frézování děr', 'Dráhy operací'], ['opGeo', 'Geometrie', 'Dráhy operací'], ['opCut', 'Ořez', 'Dráhy operací'], ['opSilk', 'Gravírování potisku', 'Dráhy operací'],
  ['bg3d', 'Pozadí 3D', '3D náhled a simulace'], ['pathAir', 'Dráha nad materiálem', '3D náhled a simulace'], ['pathMid', 'Dráha mělko', '3D náhled a simulace'], ['pathDeep', 'Dráha hluboko', '3D náhled a simulace'],
  ['simCu', 'Měď (simulace)', '3D náhled a simulace'], ['simFr', 'Laminát mělko', '3D náhled a simulace'], ['simFrDeep', 'Laminát hluboko', '3D náhled a simulace'],
  ['simThru', 'Proříznuto skrz', '3D náhled a simulace'], ['tool3d', 'Nástroj', '3D náhled a simulace'],
];

const DARK = {
  bg: '#121417', panel: '#191c20', panel2: '#1f2328', line: '#2a2f36', line2: '#343a42', overlay: '#191c20eb',
  text: '#e7e9ec', muted: '#8f97a1', dim: '#5f6771', comment: '#6f8f7c',
  cu: '#e08a3c', cu2: '#f3c08f', onAccent: '#1a1006', sel: '#3fd0ff',
  ok: '#5fd08a', warn: '#f2c14e', err: '#ff6b5e', info: '#7fb2ff',
  stage: '#121417', grid: '#ffffff09', gridMajor: '#ffffff12', blank: '#d68c4a14', blankEdge: '#d68c4a73', board: '#1c2b22', boardEdge: '#c9b98f',
  fcu: '#de5648d9', bcu: '#548ce0cc', hole: '#0b0c0d', holeRing: '#ffffff59', geo: '#c3a0ff', rapid: '#c8c8c859', marker: '#ff3b30', pin: '#f0a35e',
  origin: '#f0a35e', areaClear: '#5fd08a', areaBlock: '#ff6b5e', tab: '#ffd666',
  opIsoF: '#ffd166', opIsoB: '#7fdcff', opPins: '#f0a35e', opDrill: '#f4f4f4', opMill: '#ff9de2', opGeo: '#9ef0c0', opCut: '#c3a0ff', opSilk: '#f0f0f0',
  bg3d: '#131716', pathAir: '#80dbff', pathMid: '#ffd166', pathDeep: '#ff5c8c', simCu: '#cc7838', simFr: '#dbd194', simFrDeep: '#80784d', simThru: '#29241f', tool3d: '#40d1ff',
};
const v = (base, o) => ({ ...base, ...o });
export const PRESETS = {
  dark: { name: 'Tmavé měděné', c: DARK },
  light: { name: 'Světlé', light: true, c: v(DARK, {
    bg: '#f3f4f6', panel: '#ffffff', panel2: '#f1f3f5', line: '#dde1e6', line2: '#c9cfd6', overlay: '#ffffffeb',
    text: '#1d2328', muted: '#5d6670', dim: '#8d959e', comment: '#4f7a5f', cu: '#c8691f', cu2: '#9a4c10', onAccent: '#ffffff', sel: '#0a8fd1',
    ok: '#1f9d55', warn: '#b7791f', err: '#d93a2b', info: '#2f6fd6',
    stage: '#eef0f2', grid: '#0000000a', gridMajor: '#00000014', blank: '#c8691f14', blankEdge: '#c8691f80', board: '#cfe0cf', boardEdge: '#6b5b2e',
    fcu: '#d0453ad9', bcu: '#3f73c8cc', hole: '#ffffff', holeRing: '#00000059', geo: '#7b4fd6', rapid: '#5a5a5a59', marker: '#e0201a', pin: '#c8691f',
    origin: '#c8691f', tab: '#c99a00', opIsoF: '#c48a00', opIsoB: '#0f86b8', opPins: '#c8691f', opDrill: '#333333', opMill: '#c2338f', opGeo: '#1f9d6a', opCut: '#7b4fd6',
    bg3d: '#e9ecef', pathAir: '#1f8fd1', pathMid: '#c48a00', pathDeep: '#d0306a', simThru: '#4a4036', tool3d: '#0a8fd1' }) },
  contrast: { name: 'Vysoký kontrast', c: v(DARK, {
    bg: '#000000', panel: '#0a0a0a', panel2: '#151515', line: '#3a3a3a', line2: '#5a5a5a', overlay: '#000000f0',
    text: '#ffffff', muted: '#d0d0d0', dim: '#a0a0a0', comment: '#9dff9d', cu: '#ffd400', cu2: '#ffe866', onAccent: '#000000', sel: '#00e5ff',
    ok: '#33ff77', warn: '#ffd400', err: '#ff3333', info: '#66b3ff',
    stage: '#000000', grid: '#ffffff14', gridMajor: '#ffffff26', board: '#0f2a14', boardEdge: '#ffffff',
    fcu: '#ff3b30', bcu: '#2f8cff', holeRing: '#ffffff99', rapid: '#ffffff73', opIsoF: '#ffff00', opIsoB: '#00ffff', opDrill: '#ffffff',
    bg3d: '#000000', pathMid: '#ffff00', pathDeep: '#ff2a6d', tool3d: '#00e5ff' }) },
  blue: { name: 'Modré (FlatCAM)', c: v(DARK, {
    bg: '#0f1622', panel: '#141d2b', panel2: '#1a2536', line: '#253246', line2: '#2f3e55', overlay: '#141d2beb', cu: '#4aa3ff', cu2: '#9cccff', onAccent: '#06121f', sel: '#ffd166',
    stage: '#0c121c', board: '#16263a', boardEdge: '#9fb6d6', bg3d: '#0c121c', tool3d: '#ffd166' }) },
  green: { name: 'Zelené (DPS)', c: v(DARK, {
    bg: '#0e1612', panel: '#13201a', panel2: '#192a21', line: '#22382c', line2: '#2c4638', overlay: '#13201aeb', cu: '#e3b341', cu2: '#f2d688', onAccent: '#171000',
    stage: '#0b1410', board: '#1d4a2c', boardEdge: '#e8e0b8', bg3d: '#0b1410', simFr: '#9fbf6a', simFrDeep: '#4c6b32' }) },
  purple: { name: 'Fialové', c: v(DARK, {
    bg: '#15121c', panel: '#1b1724', panel2: '#221d2e', line: '#2e273d', line2: '#3a314d', overlay: '#1b1724eb', cu: '#b98cff', cu2: '#dcc6ff', onAccent: '#140a24', sel: '#5ce1e6',
    stage: '#120f18', board: '#241d33', boardEdge: '#c9b6e8', bg3d: '#120f18' }) },
  kicad: { name: 'KiCad', c: v(DARK, {
    bg: '#0e1420', panel: '#141b29', panel2: '#1a2333', line: '#263042', line2: '#313d52', overlay: '#141b29eb', cu: '#c83434', cu2: '#ee8a8a', onAccent: '#ffffff', sel: '#e3b72e',
    stage: '#001023', grid: '#84848418', gridMajor: '#84848430', blank: '#d0d2cd10', blankEdge: '#d0d2cd60', board: '#001a33', boardEdge: '#d0d2cd',
    fcu: '#c83434e6', bcu: '#4d7fc4e6', hole: '#000000', holeRing: '#e3b72ecc', geo: '#c2c200', pin: '#e3b72e', origin: '#e3b72e',
    opIsoF: '#ffcf4a', opIsoB: '#6fd3ff', bg3d: '#001023', simCu: '#c8a03c', simFr: '#c9c27a', simFrDeep: '#6f6a40' }) },
  kicadPastel: { name: 'KiCad pastelové', light: true, c: v(DARK, {
    bg: '#f6f3ee', panel: '#fffdf9', panel2: '#f3efe8', line: '#e4ddd2', line2: '#d6cdbf', overlay: '#fffdf9eb',
    text: '#3a3540', muted: '#7a7280', dim: '#a8a0ad', comment: '#6f9a7c', cu: '#d98a9a', cu2: '#b25d6f', onAccent: '#ffffff', sel: '#7fb8e0',
    ok: '#6fb88a', warn: '#d9a84a', err: '#e07070', info: '#7f9fe0',
    stage: '#f2eee7', grid: '#0000000a', gridMajor: '#00000012', blank: '#d98a9a14', blankEdge: '#d98a9a80', board: '#dfe8d8', boardEdge: '#8a7a5a',
    fcu: '#e8a0a0e6', bcu: '#9fb7e3e6', hole: '#fffdf9', holeRing: '#8a7a5a99', geo: '#b9a0e0', rapid: '#7a728066', marker: '#e05a5a', pin: '#d9a84a', origin: '#d9a84a',
    tab: '#d9b84a', opIsoF: '#d9a84a', opIsoB: '#6fa8d8', opPins: '#d98a5a', opDrill: '#7a7280', opMill: '#d07fb8', opGeo: '#6fb88a', opCut: '#a08ad8',
    bg3d: '#efebe4', pathAir: '#7fb8e0', pathMid: '#d9a84a', pathDeep: '#d0708a', simCu: '#e0a890', simFr: '#e8e0b8', simFrDeep: '#b0a878', simThru: '#7a7280', tool3d: '#7fb8e0' }) },
};

const LS = 'cumill.theme.v1';
let state = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
state.active ||= 'dark'; state.custom ||= {}; state.zoom ||= 100;
const listeners = new Set();
export const COL = {};   // náhled desky (plátno)
export const T3D = {};   // 3D náhled: barvy jako [r,g,b,a] 0..1

export const save = () => { try { localStorage.setItem(LS, JSON.stringify(state)); } catch {} };
export const getState = () => state;
export function allThemes() {
  return [...Object.entries(PRESETS).map(([id, t]) => ({ id, name: t.name, preset: true, light: !!t.light, c: t.c })),
    ...Object.entries(state.custom).map(([id, t]) => ({ id, name: t.name, preset: false, light: !!t.light, c: { ...DARK, ...t.c } }))];
}
export function current() { return allThemes().find(t => t.id === state.active) || allThemes()[0]; }
export function onChange(fn) { listeners.add(fn); }

export function rgba(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const n = i => parseInt(h.slice(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), h.length >= 8 ? n(6) : 1];
}
const css = hex => { const [r, g, b, a] = rgba(hex); return a >= 0.999 ? `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})` : `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${+a.toFixed(3)})`; };
const withAlpha = (hex, a) => { const [r, g, b] = rgba(hex); return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`; };

export function apply() {
  const t = current(), c = t.c, root = document.documentElement.style;
  for (const k of ['bg', 'panel', 'panel2', 'line', 'line2', 'overlay', 'text', 'muted', 'dim', 'comment', 'cu', 'cu2', 'onAccent', 'sel', 'ok', 'warn', 'err', 'info', 'bg3d']) root.setProperty('--' + k, css(c[k]));
  root.setProperty('color-scheme', t.light ? 'light' : 'dark');
  document.documentElement.style.colorScheme = t.light ? 'light' : 'dark';
  document.documentElement.style.zoom = (state.zoom || 100) + '%';
  Object.assign(COL, {
    bg: css(c.stage), grid: css(c.grid), gridMajor: css(c.gridMajor), blank: css(c.blank), blankEdge: css(c.blankEdge), board: css(c.board), boardEdge: css(c.boardEdge),
    fcu: css(c.fcu), bcu: css(c.bcu), fcuDim: withAlpha(c.fcu, 0.3), bcuDim: withAlpha(c.bcu, 0.3), hole: css(c.hole), holeRing: css(c.holeRing),
    geo: css(c.geo), geoDim: withAlpha(c.geo, 0.35), rapid: css(c.rapid), marker: css(c.marker), pin: css(c.pin), pinFill: withAlpha(c.pin, 0.22), origin: css(c.origin),
    sel: css(c.sel), selFill: withAlpha(c.sel, 0.2), err: css(c.err), errFill: withAlpha(c.err, 0.25),
    areaClear: css(c.areaClear), areaClearFill: withAlpha(c.areaClear, 0.12), areaClearAll: withAlpha(c.areaClear, 0.22), areaBlock: css(c.areaBlock), areaBlockFill: withAlpha(c.areaBlock, 0.13),
    tab: withAlpha(c.tab, 0.75), axisX: '#ff5c5c', axisY: '#5cff8a', onAccent: css(c.onAccent), mill: css(c.opMill),
  });
  Object.assign(OPC, { 'iso-F.Cu': css(c.opIsoF), 'iso-B.Cu': css(c.opIsoB), pins: css(c.opPins), drill: css(c.opDrill), mill: css(c.opMill), geo: css(c.opGeo), cut: css(c.opCut), silk: css(c.opSilk || c.opDrill), rest: css(c.opRest || c.opGeo) });
  for (const k of ['bg3d', 'pathAir', 'pathMid', 'pathDeep', 'simCu', 'simFr', 'simFrDeep', 'simThru', 'tool3d', 'rapid', 'sel', 'text']) T3D[k] = rgba(c[k]);
  T3D.light = !!t.light;
  for (const fn of listeners) try { fn(t); } catch (e) { console.error(e); }
}
export const OPC = {}; // barvy drah operací (sdílené s view.js)

export function setActive(id) { state.active = id; save(); apply(); }
export function setZoom(z) { state.zoom = z; save(); apply(); }
// vlastní téma: kopie z libovolného, úpravy barev
export function createCustom(fromId, name) {
  const src = allThemes().find(t => t.id === fromId) || current();
  const id = 'c' + Date.now().toString(36);
  state.custom[id] = { name: name || src.name + ' (vlastní)', light: src.light, c: { ...src.c } };
  state.active = id; save(); apply();
  return id;
}
export function setColor(id, key, hex) { const t = state.custom[id]; if (!t) return; t.c[key] = hex; save(); apply(); }
export function rename(id, name) { const t = state.custom[id]; if (t) { t.name = name; save(); apply(); } }
export function setLight(id, light) { const t = state.custom[id]; if (t) { t.light = light; save(); apply(); } }
export function remove(id) { delete state.custom[id]; if (state.active === id) state.active = 'dark'; save(); apply(); }
export function exportTheme(id) { const t = allThemes().find(x => x.id === id); return JSON.stringify({ kimillTheme: 1, name: t.name, light: t.light, colors: t.c }, null, 2); }
export function importTheme(text) {
  const j = JSON.parse(text);
  if (!j.colors) throw new Error('Soubor není téma KiMillu.');
  const id = 'c' + Date.now().toString(36);
  state.custom[id] = { name: j.name || 'Importované téma', light: !!j.light, c: { ...DARK, ...j.colors } };
  state.active = id; save(); apply();
  return id;
}
export function exportAll() { return state; }
export function importAll(s) { state = { active: 'dark', custom: {}, zoom: 100, ...s }; save(); apply(); }
