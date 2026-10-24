// Vizualizér G-kódu (jako v Candle): 3D pohled, přehrávání, výpis řádků, odebrání materiálu.
import { ramp as hmRamp, rampCss } from './hmap.js';
import { parseGcode, toolAt } from './gparse.js';
import { HeightSim, simTool } from './gsim.js';
import { T3D } from './theme.js';

// ---------- matice ----------
const M4 = {
  persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), nf = 1 / (n - f); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; },
  ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; },
  look(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  },
  mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
};

const VS_LINES = `
attribute vec3 aPos; attribute float aT; attribute float aK;
uniform mat4 uM; uniform float uTime; uniform vec2 uZ; uniform float uRapid;
uniform vec3 uAir, uMid, uDeep, uSel, uRap; uniform float uDimK;
varying vec4 vC;
void main() {
  gl_Position = uM * vec4(aPos, 1.0);
  float done = aT <= uTime + 1e-7 ? 1.0 : 0.0;
  if (aK > 2.5) { vC = vec4(uSel, 1.0); return; }               // vybráno
  if (aK > 1.5) { vC = vec4(uRap, 0.3); return; }              // vynecháno
  if (aK < 0.5) { vC = vec4(uRap, uRapid * (done > 0.5 ? 0.6 : 0.2)); return; }
  float d = clamp((aPos.z - uZ.y) / max(uZ.x - uZ.y, 1e-4), 0.0, 1.0); // 1 = nahoře, 0 = nejhlouběji
  vec3 c = aPos.z > 0.0 ? uAir : mix(uDeep, uMid, d);
  vC = done > 0.5 ? vec4(c, 1.0) : vec4(c * uDimK, 0.3);
}`;
const FS_COL = `precision mediump float; varying vec4 vC; void main() { gl_FragColor = vC; }`;
const VS_SIMPLE = `attribute vec3 aPos; uniform mat4 uM; void main() { gl_Position = uM * vec4(aPos, 1.0); }`;
const FS_SIMPLE = `precision mediump float; uniform vec4 uC; void main() { gl_FragColor = uC; }`;
const VS_TEX = `attribute vec3 aPos; attribute vec2 aUV; uniform mat4 uM; varying vec2 vUV; void main() { gl_Position = uM * vec4(aPos, 1.0); vUV = aUV; }`;
const FS_TEX = `precision mediump float; uniform sampler2D uTex; uniform float uA; varying vec2 vUV; void main() { vec4 c = texture2D(uTex, vUV); gl_FragColor = vec4(c.rgb, c.a * uA); }`;

// deska jako výšková mapa (WebGL2): síť posunutá podle výšky, detail a barva z textury po pixelech
const VS_SIM = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
in vec2 aUV; uniform sampler2D uH; uniform mat4 uM; uniform vec4 uRect; uniform ivec2 uN; uniform int uK;
out vec3 vP; out vec2 vUV;
void main() {
  // výška bodu sítě = nejvyšší místo v jeho okolí (mělké drážky jen stínováním, průchozí řezy jako stěny)
  ivec2 c0 = ivec2(aUV * vec2(uN)) - ivec2(uK / 2);
  float h = -1e9;
  for (int y = 0; y < 8; y++) { if (y >= uK) break;
    for (int x = 0; x < 8; x++) { if (x >= uK) break;
      h = max(h, texelFetch(uH, clamp(c0 + ivec2(x, y), ivec2(0), uN - 1), 0).r); } }
  vP = vec3(uRect.x + aUV.x * uRect.z, uRect.y + aUV.y * uRect.w, h); vUV = aUV;
  gl_Position = uM * vec4(vP, 1.0);
}`;
const FS_SIM = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
in vec3 vP; in vec2 vUV; uniform sampler2D uH; uniform ivec2 uN; uniform float uT; uniform float uCell; uniform float uZs;
uniform vec3 uCu, uFr, uFrD, uThru;
out vec4 o;
float H(ivec2 c) { return texelFetch(uH, clamp(c, ivec2(0), uN - 1), 0).r; }
vec3 col(float z) {
  if (z > -0.035) return uCu;                                      // měď
  if (z <= -uT + 0.002) return uThru;                              // proříznuto skrz (podložka)
  float d = clamp(-z / uT, 0.0, 1.0);
  return mix(uFr, uFrD, d);                                       // laminát podle hloubky
}
void main() {
  ivec2 c = min(ivec2(vUV * vec2(uN)), uN - 1);
  float h = H(c);
  vec3 n;
  float z = h;
  if (abs(vP.z - h) > 0.05 && h <= -uT + 0.002 || abs(vP.z - h) > 0.3) {
    // stěna mezi body sítě (okraj ořezu / díry)
    n = normalize(cross(dFdx(vP), dFdy(vP))); if (n.z < 0.0) n = -n; z = vP.z;
  } else {
    float hl = H(c - ivec2(1, 0)), hr = H(c + ivec2(1, 0)), hd = H(c - ivec2(0, 1)), hu = H(c + ivec2(0, 1));
    n = normalize(vec3(-(hr - hl) * uZs / (2.0 * uCell), -(hu - hd) * uZs / (2.0 * uCell), 1.0));
  }
  vec3 L = normalize(vec3(-0.35, -0.55, 0.76));
  float li = 0.42 + 0.58 * max(dot(n, L), 0.0);
  o = vec4(col(z) * li, 1.0);
}`;
const FS_SIDE = `precision mediump float; uniform vec4 uC; void main() { gl_FragColor = uC; }`;

function prog(gl, vs, fs) {
  const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
const fmtT = m => { const s = Math.max(0, Math.round(m * 60)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const n3 = v => (Math.round(v * 1000) / 1000).toFixed(3);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const ICO = {
  start: '<svg viewBox="0 0 24 24"><path d="M6 5v14M18 5 9 12l9 7z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  end: '<svg viewBox="0 0 24 24"><path d="M18 5v14M6 5l9 7-9 7z"/></svg>',
};

export class GcodeViewer {
  // machine: režim záložky Stroj – bez přehrávání, poloha nástroje živě ze stroje, výběr řádků/drah
  constructor(root, { onOpenFile, rapid = 1500, machine = false } = {}) {
    this.root = root; this.rapid = rapid; this.onOpenFile = onOpenFile; this.machine = machine;
    if (machine) this.camInit = { yaw: -Math.PI / 2, pitch: 1.05 };
    this.skip = new Set(); this.sel = null; this.live = null; this.hmap = null;
    this.g = null; this.time = 0; this.playing = false; this.speed = 10;
    this.cam = { yaw: -Math.PI / 2 - 0.5, pitch: 0.75, dist: 150, tx: 0, ty: 0, tz: 0, ortho: false, ...(this.camInit || {}) };
    this.show = { rapid: true, paths: true, board: true, prev: true, motif: false, mapsurf: true };
    this.zs = 1; this.extDia = 0.2; this.extT = 1.6; this.T = 1.6;
    this._build();
  }
  // ---------- DOM ----------
  _build() {
    const r = this.root; r.innerHTML = ''; r.classList.add('gv');
    this.stage = el('div', { class: 'gv-stage' });
    this.canvas = el('canvas', { class: 'gv-canvas' });
    this.stage.append(this.canvas);
    // horní lišta: zdroj, pohledy, přepínače
    this.srcSel = el('select', { class: 'gv-src', title: 'Program k zobrazení' });
    this.srcSel.addEventListener('change', () => this.onSource?.(this.srcSel.value));
    const viewBtns = el('div', { class: 'seg' },
      ...[['top', 'Shora'], ['front', 'Zepředu'], ['iso', 'Izometricky']].map(([k, t]) => el('button', { type: 'button', onclick: () => this.view(k) }, t)),
      el('button', { type: 'button', onclick: () => this.fit(), title: 'Celý program' }, 'Celé'));
    this.chips = el('div', { class: 'chips' });
    const chip = (k, t, title) => { const c = el('span', { class: 'lchip' + (this.show[k] ? ' on' : ''), title: title || '' }, el('i', { style: `background:${{ rapid: '#9aa39f', paths: '#ffd166', board: '#c9733a', prev: '#8a7a50', motif: '#f3c08f', mapsurf: '#3cc8e0' }[k]}` }), t); c.addEventListener('click', () => { this.show[k] = !this.show[k]; c.classList.toggle('on', this.show[k]); if (k === 'prev' && this.g) { this._setupSim(); } if (k === 'mapsurf' && this.legend) this.legend.hidden = !this.show.mapsurf || !this.hmap?.surf; this.draw(); }); return c; };
    this.prevChip = chip('prev', 'Předchozí programy', 'V simulaci zahrnout dřívější programy na téže straně (díry, ořez…)');
    this.motifChip = chip('motif', 'Motiv mědi', 'Obrysy mědi z KiCadu přes simulaci');
    this.mapChip = chip('mapsurf', 'Mapa barevně', 'Výšková mapa jako barevná plocha (gradient výšky jako v Candle)');
    this.mapChip.hidden = true;
    this.chips.append(chip('paths', 'Dráhy'), chip('rapid', 'Přejezdy'), chip('board', 'Deska 3D', 'Simulace obrábění – výšková mapa desky'), this.prevChip, this.motifChip, this.mapChip);
    this.legend = el('div', { class: 'gv-legend', hidden: true });
    this.zsSel = el('select', { class: 'gv-zs', title: 'Převýšení osy Z – mělké drážky jsou lépe vidět' }, ...[1, 2, 5, 10, 20].map(v => el('option', { value: v }, 'Z ×' + v)));
    this.zsSel.addEventListener('change', () => { this.zs = +this.zsSel.value; this.draw(); });
    this.orthoChip = el('span', { class: 'lchip' }, el('i', { style: 'background:#7fb2ff' }), 'Pravoúhle');
    this.orthoChip.addEventListener('click', () => { this.cam.ortho = !this.cam.ortho; this.orthoChip.classList.toggle('on', this.cam.ortho); this.draw(); });
    this.chips.append(this.orthoChip, this.zsSel);
    // cizí soubor: nástroj a tloušťka desky pro simulaci
    const num = (val, title, set) => { const i = el('input', { type: 'text', inputmode: 'decimal', value: String(val).replace('.', ','), title }); i.addEventListener('change', () => { const v = parseFloat(i.value.replace(',', '.')); if (v > 0) { set(v); if (this.g) { this._setupSim(); this.draw(); } } }); return i; };
    this.extType = el('select', { title: 'Typ nástroje' }, el('option', { value: 'flat' }, 'Válcová'), ...[20, 30, 45, 60, 90].map(a => el('option', { value: a }, `V ${a}°`)));
    this.extType.addEventListener('change', () => { if (this.g) { this._setupSim(); this.draw(); } });
    this.extBox = el('div', { class: 'gv-tool', title: 'Nástroj a deska pro simulaci cizího programu' },
      'Nástroj', this.extType, el('span', { class: 'inp' }, num(this.extDia, 'Průměr (u V-frézy průměr hrotu)', v => this.extDia = v), el('span', { class: 'u' }, 'mm')),
      'Deska', el('span', { class: 'inp' }, num(this.extT, 'Tloušťka desky', v => this.extT = v), el('span', { class: 'u' }, 'mm')));
    this.top = el('div', { class: 'gv-top' },
      el('div', { class: 'gv-row' }, this.srcSel, el('button', { class: 'btn small', type: 'button', onclick: () => this.onOpenFile?.() }, 'Otevřít .nc…'), this.extBox),
      el('div', { class: 'gv-row' }, viewBtns, this.chips));
    // informace
    this.info = el('div', { class: 'gv-info' });
    // ovládání přehrávání
    this.btnPlay = el('button', { class: 'iconbtn big', type: 'button', title: 'Přehrát / pauza (mezerník)', html: ICO.play, onclick: () => this.toggle() });
    this.slider = el('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'gv-slider', 'aria-label': 'Poloha v programu' });
    this.slider.addEventListener('input', () => { if (!this.g) return; this.pause(); this.setTime(this.g.total * this.slider.value / 1000); });
    this.speedSel = el('select', { title: 'Rychlost přehrávání' }, ...[1, 2, 5, 10, 20, 50, 100, 500].map(v => { const o = el('option', { value: v }, v + '×'); if (v === this.speed) o.selected = true; return o; }));
    this.speedSel.addEventListener('change', () => { this.speed = +this.speedSel.value; });
    this.timeLbl = el('span', { class: 'gv-time' }, '0:00 / 0:00');
    this.controls = el('div', { class: 'gv-ctrl' },
      el('button', { class: 'iconbtn', type: 'button', title: 'Na začátek (Home)', html: ICO.start, onclick: () => { this.pause(); this.setTime(0); } }),
      el('button', { class: 'iconbtn', type: 'button', title: 'O řádek zpět (←)', html: ICO.back, onclick: () => this.stepLine(-1) }),
      this.btnPlay,
      el('button', { class: 'iconbtn', type: 'button', title: 'O řádek vpřed (→)', html: ICO.fwd, onclick: () => this.stepLine(1) }),
      el('button', { class: 'iconbtn', type: 'button', title: 'Na konec (End)', html: ICO.end, onclick: () => { this.pause(); this.setTime(this.g ? this.g.total : 0); } }),
      this.slider, this.timeLbl, this.speedSel);
    this.empty = el('div', { class: 'gv-empty' }, 'Vyber program KiMillu nahoře, nebo otevři libovolný soubor .nc.');
    this.stage.append(this.top, this.info, this.controls, this.empty, this.legend);
    if (this.machine) { this.controls.style.display = 'none'; this.srcSel.style.display = 'none'; this.top.querySelector('.btn.small').style.display = 'none'; this.info.style.display = 'none'; }
    // výpis
    this.listHead = el('div', { class: 'gv-lhead' });
    this.list = el('div', { class: 'gv-list', tabindex: '0' });
    this.listInner = el('div', { class: 'gv-linner' });
    this.list.append(this.listInner);
    this.list.addEventListener('scroll', () => this._renderList());
    this.list.addEventListener('click', e => {
      const d = e.target.closest('.gl'); if (!d) return;
      const i = +d.dataset.i;
      if (this.machine) { this.select(e.shiftKey && this.sel ? Math.min(this.sel[0], i) : i, e.shiftKey && this.sel ? Math.max(this.sel[1], i) : i); }
      else this.gotoLine(i);
    });
    this.side = el('div', { class: 'gv-side' }, this.listHead, this.list);
    r.append(this.stage, this.side);
    this._initGL();
    this._bindMouse();
    new ResizeObserver(() => this._resize()).observe(this.stage);
    new ResizeObserver(() => this._renderList()).observe(this.list);
  }
  setSources(items, selected) {
    this.srcSel.innerHTML = '';
    if (!items.length) this.srcSel.append(el('option', { value: '' }, '— žádný program —'));
    for (const it of items) { const o = el('option', { value: it.id }, it.label); if (it.id === selected) o.selected = true; this.srcSel.append(o); }
  }
  // ---------- WebGL ----------
  _initGL() {
    const o = { antialias: true, alpha: false, preserveDrawingBuffer: true };
    let gl = this.canvas.getContext('webgl2', o);
    this.gl2 = !!gl;
    if (!gl) gl = this.canvas.getContext('webgl', o);
    this.gl = gl;
    if (!gl) { this.empty.textContent = 'Tento počítač nepodporuje WebGL – 3D náhled není k dispozici.'; return; }
    this.pL = prog(gl, VS_LINES, FS_COL); this.pS = prog(gl, VS_SIMPLE, FS_SIMPLE);
    if (this.gl2) { this.pSim = prog(gl, VS_SIM, FS_SIM); this.pSide = prog(gl, VS_SIMPLE, FS_SIDE); }
    this.bufPos = gl.createBuffer(); this.bufT = gl.createBuffer(); this.bufK = gl.createBuffer();
    this.bufGrid = gl.createBuffer(); this.bufTool = gl.createBuffer(); this.bufMotif = gl.createBuffer();
    this.bufSimUV = gl.createBuffer(); this.bufSimIdx = gl.createBuffer(); this.bufSides = gl.createBuffer();
    this.texH = gl.createTexture();
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  _resize() {
    const r = this.stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    if (this._needFit && this.w && this.h) { this._needFit = false; this.fit(true); }
    this.draw();
  }
  // ---------- načtení programu ----------
  // opts.tool: nástroj z knihovny ({type, dia, vTip, vAngle}); opts.T: tloušťka desky;
  // opts.stock: polotovar {minX,minY,maxX,maxY}; opts.prev: [{text, tool}] dřívější programy na téže straně;
  // opts.motif: Float32Array úseček (x,y,z…) motivu mědi z KiCadu
  load(text, { name = '', tool = null, T = null, stock = null, prev = [], motif = null, keepView = false } = {}) {
    this.pause();
    const g = parseGcode(text, { rapid: this.rapid });
    this.g = g; this.name = name; this.stock = stock; this.prevSrc = prev; this.motif = motif;
    this.ext = !tool;
    if (tool) this.simToolDef = tool;
    if (T) this.T = T;
    this.extBox.hidden = !this.ext;
    this.prevChip.hidden = !prev.length; this.motifChip.hidden = !motif;
    this.empty.hidden = true;
    const gl = this.gl;
    if (gl) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos); gl.bufferData(gl.ARRAY_BUFFER, g.pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufT); gl.bufferData(gl.ARRAY_BUFFER, g.time, gl.STATIC_DRAW);
      this._uploadKinds();
      if (motif) { gl.bindBuffer(gl.ARRAY_BUFFER, this.bufMotif); gl.bufferData(gl.ARRAY_BUFFER, motif, gl.STATIC_DRAW); }
      this._buildGrid();
    }
    this._setupSim();
    this.time = g.total;
    this.listInner.style.height = (g.lines.length * 18) + 'px';
    this.listHead.innerHTML = '';
    this.listHead.append(el('b', {}, name || 'G-kód'), el('span', {}, `${g.lines.length} řádků · ${g.moves} pohybů · ${g.arcs} oblouků`));
    for (const w of g.warnings) this.listHead.append(el('div', { class: 'gv-warn' }, w));
    if (!keepView) this.fit();
    if (this.machine) { this.sel = null; this.skip = new Set(); this._uploadKinds(); this.setTime(0); this.setProgress(0); }
    else this.setTime(g.total);
  }
  clear(msg) {
    this.pause(); this.g = null; this.empty.hidden = false; if (msg) this.empty.textContent = msg;
    this.listInner.innerHTML = ''; this.listInner.style.height = '0'; this.listHead.innerHTML = ''; this.info.innerHTML = '';
    this.draw();
  }
  _buildGrid() {
    const gl = this.gl, b = this._area();
    const step = Math.max(b.maxX - b.minX, b.maxY - b.minY) > 150 ? 20 : 10;
    const v = [];
    const x0 = Math.floor(b.minX / step) * step, x1 = Math.ceil(b.maxX / step) * step, y0 = Math.floor(b.minY / step) * step, y1 = Math.ceil(b.maxY / step) * step;
    for (let x = x0; x <= x1 + 1e-9; x += step) v.push(x, y0, 0, x, y1, 0);
    for (let y = y0; y <= y1 + 1e-9; y += step) v.push(x0, y, 0, x1, y, 0);
    this.gridN = v.length / 3;
    v.push(0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 10); // osy od nuly
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufGrid); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  }
  _area() {
    const g = this.g; const b = { ...(g ? g.bb : { minX: 0, minY: 0, maxX: 100, maxY: 70 }) };
    const s = this._stockRect();
    if (s) { b.minX = Math.min(b.minX, s.minX); b.minY = Math.min(b.minY, s.minY); b.maxX = Math.max(b.maxX, s.maxX); b.maxY = Math.max(b.maxY, s.maxY); }
    return b;
  }
  _stockRect() {
    if (this.stock) return this.stock;
    const c = this.g?.cutBB; if (!c) return null;
    const m = 2 + (this.extTool().r || 0);
    return { minX: c.minX - m, minY: c.minY - m, maxX: c.maxX + m, maxY: c.maxY + m };
  }
  extTool() {
    if (!this.ext) return simTool(this.simToolDef);
    const t = this.extType.value;
    return t === 'flat' ? simTool({ type: 'end', dia: this.extDia }) : simTool({ type: 'v', vTip: this.extDia, vAngle: +t });
  }
  // ---------- simulace: výšková mapa polotovaru ----------
  _setupSim() {
    this.sim = null; this.simUpTo = 0;
    const rect = this._stockRect();
    if (!rect || !this.gl2) { this._simFull = true; return; }
    const T = this.ext ? this.extT : (this.T || 1.6);
    this.sim = new HeightSim(rect, T);
    this.simTool = this.extTool();
    // dřívější programy na téže straně (díry, ořez…) – jednou do základu
    if (this.show.prev && this.prevSrc?.length) for (const p of this.prevSrc) { const g = p.g || (p.g = parseGcode(p.text, { rapid: this.rapid })); this.sim.run(g, simTool(p.tool)); }
    this.simBase = this.sim.h.slice();
    this._buildSimMesh();
    this._simFull = true;
  }
  _resetSim() { if (!this.sim) return; this.sim.h.set(this.simBase); this.simUpTo = 0; this._simFull = true; }
  _updateSim() {
    const g = this.g, sim = this.sim; if (!g || !sim) return;
    const segs = g.n / 2;
    let lo = 0, hi = segs; while (lo < hi) { const m = (lo + hi) >> 1; if (g.time[m * 2 + 1] <= this.time + 1e-9) lo = m + 1; else hi = m; }
    const target = lo;
    if (target < this.simUpTo) this._resetSim();
    if (target === this.simUpTo) return;
    const R = sim.run(g, this.simTool, this.simUpTo, target);
    this.simUpTo = target;
    if (R && !this._simFull) this._simDirty = this._simDirty ? [Math.min(this._simDirty[0], R[0]), Math.min(this._simDirty[1], R[1]), Math.max(this._simDirty[2], R[2]), Math.max(this._simDirty[3], R[3])] : R;
  }
  _uploadSim() {
    const gl = this.gl, sim = this.sim; if (!sim) return;
    if (!this._simFull && !this._simDirty) return;
    const now = performance.now();
    if (this.playing && now - (this._simT || 0) < 50) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texH);
    if (this._simFull) {
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, sim.nx, sim.ny, 0, gl.RED, gl.FLOAT, sim.h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      const [i0, j0, i1, j1] = this._simDirty;
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, sim.nx); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, i0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, j0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, i0, j0, i1 - i0 + 1, j1 - j0 + 1, gl.RED, gl.FLOAT, sim.h);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
    this._simFull = false; this._simDirty = null; this._simT = now;
  }
  // síť desky: mřížka bodů, výška se čte z textury ve vertex shaderu
  _buildSimMesh() {
    const gl = this.gl, sim = this.sim;
    const k = Math.max(1, Math.ceil(Math.max(sim.nx, sim.ny) / 900)); // nejvýš ~900 bodů na stranu
    const gx = Math.ceil(sim.nx / k) + 1, gy = Math.ceil(sim.ny / k) + 1;
    const uv = new Float32Array(gx * gy * 2);
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) { const o = (j * gx + i) * 2; uv[o] = Math.min(1, i * k / sim.nx); uv[o + 1] = Math.min(1, j * k / sim.ny); }
    const idx = new Uint32Array((gx - 1) * (gy - 1) * 6);
    let n = 0;
    for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) { const a = j * gx + i, b = a + 1, c = a + gx, d = c + 1; idx[n++] = a; idx[n++] = b; idx[n++] = d; idx[n++] = a; idx[n++] = d; idx[n++] = c; }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSimUV); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufSimIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.simIdxN = n; this.simK = k;
    // boky polotovaru
    const x0 = sim.minX, y0 = sim.minY, x1 = sim.minX + sim.W, y1 = sim.minY + sim.H, z0 = 0, z1 = -sim.T;
    const q = (ax, ay, bx, by) => [ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z0, bx, by, z1, ax, ay, z1];
    this.sideV = [q(x0, y0, x1, y0), q(x1, y0, x1, y1), q(x1, y1, x0, y1), q(x0, y1, x0, y0)];
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSides); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.sideV.flat()), gl.STATIC_DRAW);
  }
  // ---------- kamera ----------
  _matrix() {
    const c = this.cam, cp = Math.cos(c.pitch);
    const eye = [c.tx + c.dist * cp * Math.cos(c.yaw), c.ty + c.dist * cp * Math.sin(c.yaw), c.tz + c.dist * Math.sin(c.pitch)];
    const asp = this.w / Math.max(1, this.h);
    let proj;
    if (c.ortho) { const hh = c.dist * Math.tan(0.26); proj = M4.ortho(-hh * asp, hh * asp, -hh, hh, -c.dist * 10, c.dist * 10); }
    else proj = M4.persp(0.52, asp, Math.max(0.05, c.dist / 200), c.dist * 20);
    const view = M4.look(eye, [c.tx, c.ty, c.tz], [0, 0, 1]);
    const zs = this.zs || 1, S = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, zs, 0, 0, 0, 0, 1];
    return M4.mul(M4.mul(proj, view), S);
  }
  view(k) {
    const c = this.cam;
    if (k === 'top') { c.yaw = -Math.PI / 2; c.pitch = Math.PI / 2 - 0.0005; }
    if (k === 'front') { c.yaw = -Math.PI / 2; c.pitch = 0.02; }
    if (k === 'iso') { c.yaw = -Math.PI / 2 - 0.6; c.pitch = 0.62; }
    this.fit(true);
  }
  fit(keepAngles) {
    const hr = this.hmap?.rect;
    let b = this.g ? this._area() : hr ? { minX: hr.x0 - 5, minY: hr.y0 - 5, maxX: hr.x0 + hr.w + 5, maxY: hr.y0 + hr.h + 5 } : { minX: 0, minY: 0, maxX: 100, maxY: 70, minZ: 0, maxZ: 5 };
    // ve Stroji přiblížit na samotný řez (polotovar bývá mnohem větší)
    if (this.machine && this.g?.cutBB) { const c = this.g.cutBB, m = 4; b = { minX: c.minX - m, minY: c.minY - m, maxX: c.maxX + m, maxY: c.maxY + m }; }
    const c = this.cam;
    if (!this.w || !this.h) this._needFit = true;
    const asp = (this.w || 800) / (this.h || 600);
    c.tx = (b.minX + b.maxX) / 2; c.ty = (b.minY + b.maxY) / 2; c.tz = 0;
    // celé XY do okna: výška pohledu musí pokrýt Y i X/poměr stran
    const hNeed = Math.max(b.maxY - b.minY, (b.maxX - b.minX) / asp, 10);
    c.dist = hNeed / (2 * Math.tan(0.26)) * 1.12;
    void keepAngles;
    this.draw();
  }
  _bindMouse() {
    const cv = this.canvas; let drag = null;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey, moved: false, cam: { ...this.cam } }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      const c = this.cam;
      if (drag.b === 0 && !drag.shift) { c.yaw = drag.cam.yaw - dx * 0.008; c.pitch = Math.max(-0.2, Math.min(Math.PI / 2 - 0.0005, drag.cam.pitch + dy * 0.008)); }
      else {
        // posun v rovině kolmé k pohledu
        const k = (2 * c.dist * Math.tan(0.26)) / Math.max(1, this.h);
        const rx = -Math.sin(c.yaw), ry = Math.cos(c.yaw);
        const ux = -Math.sin(c.pitch) * Math.cos(c.yaw), uy = -Math.sin(c.pitch) * Math.sin(c.yaw), uz = Math.cos(c.pitch);
        c.tx = drag.cam.tx - (dx * rx - dy * ux) * k; c.ty = drag.cam.ty - (dx * ry - dy * uy) * k; c.tz = drag.cam.tz + dy * uz * k;
      }
      this.draw();
    });
    const up = e => {
      if (drag && !drag.moved && drag.b === 0) this._pick(e);
      drag = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => drag = null);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.cam.dist = Math.max(0.5, Math.min(5000, this.cam.dist * Math.exp(e.deltaY * 0.0012))); this.draw(); }, { passive: false });
    cv.addEventListener('dblclick', () => this.fit());
    this.root.addEventListener('keydown', e => {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.stepLine(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.stepLine(-1); }
      else if (e.key === 'Home') { this.pause(); this.setTime(0); }
      else if (e.key === 'End') { this.pause(); this.setTime(this.g?.total || 0); }
    });
    this.root.tabIndex = 0;
  }
  // klik do náhledu -> nejbližší segment -> řádek
  _pick(e) {
    const g = this.g; if (!g || !g.n) return;
    const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const M = this._matrix(); const P = g.pos;
    const proj = i => { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; const w = M[3] * x + M[7] * y + M[11] * z + M[15]; return [((M[0] * x + M[4] * y + M[8] * z + M[12]) / w * 0.5 + 0.5) * this.w, (1 - ((M[1] * x + M[5] * y + M[9] * z + M[13]) / w * 0.5 + 0.5)) * this.h, w]; };
    let best = -1, bd = 12;
    for (let s = 0; s < g.n / 2; s++) {
      if (g.kind[s * 2] === 0 && !this.show.rapid) continue;
      const a = proj(s * 2), b = proj(s * 2 + 1);
      if (a[2] <= 0 || b[2] <= 0) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      let t = L ? ((mx - a[0]) * dx + (my - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(mx - a[0] - t * dx, my - a[1] - t * dy);
      if (d < bd) { bd = d; best = s; }
    }
    if (best >= 0 && this.machine) { const [a, b] = this.pathRange(g.line[best * 2]); this.select(a, b); this._scrollToLine(a, true); return; }
    if (best >= 0) { this.pause(); this.setTime(g.time[best * 2 + 1]); this._scrollToLine(g.line[best * 2], true); }
  }
  // ---------- přehrávání ----------
  toggle() { this.playing ? this.pause() : this.play(); }
  play() {
    if (!this.g) return;
    if (this.time >= this.g.total - 1e-9) this.setTime(0);
    this.playing = true; this.btnPlay.innerHTML = ICO.pause;
    let last = performance.now();
    const tick = () => {
      if (!this.playing) return;
      const now = performance.now();
      const dt = Math.min(250, now - last) / 60000 * this.speed; last = now;
      this.setTime(Math.min(this.g.total, this.time + dt), true);
      if (this.time >= this.g.total) { this.pause(); return; }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  pause() { this.playing = false; if (this.btnPlay) this.btnPlay.innerHTML = ICO.play; cancelAnimationFrame(this._raf); this.draw(); }
  stepLine(d) {
    const g = this.g; if (!g) return;
    this.pause();
    let li = this.curLine ?? 0;
    // další / předchozí řádek s pohybem
    for (let k = li + d; k >= 0 && k < g.lines.length; k += d) {
      if (g.lineEnd[k] > g.lineStart[k] + 1e-12) { this.setTime(g.lineEnd[k], false, k); this._scrollToLine(k); this._renderList(); return; }
    }
    this.setTime(d > 0 ? g.total : 0);
  }
  gotoLine(i) {
    const g = this.g; if (!g) return;
    this.pause();
    this.setTime(g.lineEnd[i], false, i);
  }
  setTime(t, fromPlay, forceLine) {
    const g = this.g; if (!g) return;
    this.time = Math.max(0, Math.min(g.total, t));
    const p = toolAt(g, this.time);
    this.tool = p;
    this.curLine = forceLine ?? p.line;
    this.slider.value = g.total ? Math.round(this.time / g.total * 1000) : 0;
    this.timeLbl.textContent = `${fmtT(this.time)} / ${fmtT(g.total)}`;
    this._updateInfo();
    if (forceLine == null) this._scrollToLine(p.line, !fromPlay);
    this._renderList();
    this.draw();
  }
  _updateInfo() {
    const g = this.g, p = this.tool; if (!g || !p) return;
    let st = null; for (let k = this.curLine; k >= 0 && !st; k--) st = g.lineState[k]; st = st || [p.x, p.y, p.z, 0, 0];
    const b = g.bb;
    this.info.innerHTML = `<div><span>X</span>${n3(p.x)}</div><div><span>Y</span>${n3(p.y)}</div><div><span>Z</span>${n3(p.z)}</div>`
      + `<div><span>F</span>${Math.round(st[3])}</div><div><span>S</span>${Math.round(st[4])}</div><div><span>Řádek</span>${this.curLine + 1} / ${g.lines.length}</div>`
      + `<div class="wide"><span>Rozsah</span>X ${n3(b.minX)}…${n3(b.maxX)} · Y ${n3(b.minY)}…${n3(b.maxY)} · Z ${n3(b.minZ)}…${n3(b.maxZ)}</div>`
      + `<div class="wide"><span>Dráha</span>řez ${Math.round(g.cutLen)} mm · přejezdy ${Math.round(g.rapidLen)} mm · čas ≈ ${fmtT(g.total)}</div>`;
  }
  // ---------- výpis (virtuální) ----------
  _scrollToLine(li, center) {
    const rowH = 18, top = li * rowH, L = this.list;
    if (center || top < L.scrollTop || top > L.scrollTop + L.clientHeight - rowH * 2) L.scrollTop = Math.max(0, top - L.clientHeight / 2);
  }
  _renderList() {
    const g = this.g; if (!g) return;
    const rowH = 18, L = this.list;
    const a = Math.max(0, Math.floor(L.scrollTop / rowH) - 5), b = Math.min(g.lines.length, Math.ceil((L.scrollTop + L.clientHeight) / rowH) + 5);
    const cur = this.curLine;
    let html = '';
    for (let i = a; i < b; i++) {
      const txt = g.lines[i].replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      let cls = i === cur ? 'cur' : g.lineEnd[i] <= this.time + 1e-9 && g.lineEnd[i] > g.lineStart[i] ? 'done' : '';
      if (this.skip.has(i)) cls += ' skip';
      if (this.sel && i >= this.sel[0] && i <= this.sel[1]) cls += ' sel';
      html += `<div class="gl ${cls}" style="top:${i * rowH}px" data-i="${i}"><span>${i + 1}</span>${txt.startsWith('(') ? `<em>${txt}</em>` : txt}</div>`;
    }
    this.listInner.innerHTML = html;
  }
  // ---------- režim stroje ----------
  _uploadKinds() {
    const g = this.g, gl = this.gl; if (!g || !gl) return;
    const kf = new Float32Array(g.n);
    const sel = this.sel;
    for (let i = 0; i < g.n; i++) {
      const li = g.line[i];
      kf[i] = sel && li >= sel[0] && li <= sel[1] ? 3 : this.skip.has(li) ? 2 : g.kind[i];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufK); gl.bufferData(gl.ARRAY_BUFFER, kf, gl.STATIC_DRAW);
  }
  // souvislá dráha kolem řádku: od posledního přejezdu / vyjetí nad materiál po další
  pathRange(li) {
    const g = this.g;
    const cutLine = new Uint8Array(g.lines.length), moveLine = new Uint8Array(g.lines.length);
    for (let i = 0; i < g.n; i += 2) { moveLine[g.line[i]] = 1; if (g.kind[i] && Math.min(g.pos[i * 3 + 2], g.pos[i * 3 + 5]) < 0) cutLine[g.line[i]] = 1; }
    if (!cutLine[li]) return [li, li];
    let a = li, b = li;
    while (a > 0 && (cutLine[a - 1] || !moveLine[a - 1])) a--;
    while (b < g.lines.length - 1 && (cutLine[b + 1] || !moveLine[b + 1])) b++;
    while (a < li && !moveLine[a]) a++;
    while (b > li && !moveLine[b]) b--;
    return [a, b];
  }
  select(a, b) {
    this.sel = a == null ? null : [a, b];
    this._uploadKinds(); this._renderList(); this.draw();
    this.onSelect?.(this.sel);
  }
  setSkip(set) { this.skip = new Set(set); this._uploadKinds(); this._renderList(); this.draw(); }
  // poloha nástroje ze stroje (pracovní souřadnice)
  setLive(p) { this.live = p; this.draw(); }
  // průběh: řádky < done jsou hotové
  setProgress(done) {
    const g = this.g; if (!g) return;
    const i = Math.max(0, Math.min(g.lines.length - 1, done - 1));
    this.time = done <= 0 ? 0 : g.lineEnd[i];
    this.curLine = Math.min(done, g.lines.length - 1);
    this._scrollToLine(this.curLine);
    this._renderList(); this.draw();
  }
  // výšková mapa: [{x, y, z}] a úsečky sítě (dvojice indexů); z se zobrazí převýšeně
  setHeightMap(m) {
    const had = this.hmap?.rect; this.hmap = m;
    const sf = m?.surf;
    if (this.mapChip) this.mapChip.hidden = !sf;
    if (this.legend) {
      this.legend.hidden = !sf || !this.show.mapsurf;
      if (sf) {
        const f = v => (Math.round(v * 1000) / 1000).toFixed(3).replace('.', ',');
        this.legend.innerHTML = '';
        this.legend.append(el('div', { class: 'gv-lt' }, 'Výšková mapa [mm]'), el('div', { class: 'gv-lbar', style: `background:${rampCss(9)}` }),
          el('div', { class: 'gv-lrow' }, el('span', {}, f(sf.lo)), el('span', {}, f((sf.lo + sf.hi) / 2)), el('span', {}, f(sf.hi))),
          el('div', { class: 'gv-lrow dim' }, el('span', {}, 'rozptyl ' + f(sf.hi - sf.lo)), el('span', {}, 'převýšení ×' + (m.exag || 20))));
      }
    }
    // bez programu: zobrazit aspoň mapu
    if (!this.g) { this.empty.hidden = !!m; if (m && (!had || had.x0 !== m.rect?.x0 || had.w !== m.rect?.w || had.h !== m.rect?.h)) this.fit(true); }
    this.draw();
  }
  _drawMap(gl, M) {
    const m = this.hmap; if (!m || !m.pts.length) return;
    const ex = m.exag || 20, v = [], c = [];
    if (this.legend) this.legend.hidden = !m.surf || !this.show.mapsurf;
    if (m.surf && this.show.mapsurf && !m.preview) this._drawMapSurf(gl, M, m.surf, ex, m.lift || 0.3);
    const zs = m.pts.map(p => p.z ?? NaN).filter(Number.isFinite);
    const lo = Math.min(...zs, 0), hi = Math.max(...zs, 0), span = Math.max(hi - lo, 1e-3);
    const col = m.surf ? z => hmRamp((z - m.surf.lo) / Math.max(1e-6, m.surf.hi - m.surf.lo)) : z => { const t = (z - lo) / span; return [0.2 + 0.8 * t, 0.45 + 0.4 * (1 - Math.abs(t - 0.5) * 2), 1 - 0.8 * t]; };
    const P = p => [p.x, p.y, Number.isFinite(p.z) ? p.z * ex + (m.lift || 0.3) : (m.lift || 0.3)];
    for (const [a, b] of m.edges) {
      const A = m.pts[a], B = m.pts[b];
      if (!Number.isFinite(A.z) || !Number.isFinite(B.z)) continue;
      v.push(...P(A), ...P(B)); c.push(...col(A.z), ...col(B.z));
    }
    // svislé čárky v místech měření (jako v Candle): od výšky přejezdu po hloubku měření
    if (m.vert) {
      const { top, bottom } = m.vert;
      m.pts.forEach((p, i) => {
        const done = Number.isFinite(p.z), act = i === m.active;
        const k = act ? [1, 1, 1] : done ? [0.35, 0.9, 1] : [0.95, 0.75, 0.3];
        const zb = done && !m.preview ? p.z : bottom;
        v.push(p.x, p.y, top, p.x, p.y, zb); c.push(...k, ...k);
        if (p.moved) { v.push(p.nx, p.ny, top, p.x, p.y, top); c.push(1, 0.4, 0.4, 1, 0.4, 0.4); } // posunuto z díry
      });
      if (m.rect) { const r = m.rect, z = 0.02; const q = [[r.x0, r.y0], [r.x0 + r.w, r.y0], [r.x0 + r.w, r.y0 + r.h], [r.x0, r.y0 + r.h]]; for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; v.push(a[0], a[1], z, b[0], b[1], z); c.push(0.95, 0.75, 0.3, 0.95, 0.75, 0.3); } }
      if (m.preview) { this._flushMap(gl, M, v, c); return; }
    }
    const s = Math.max(0.25, this.cam.dist * 0.006);
    m.pts.forEach((p, i) => {
      const q = P(p), k = Number.isFinite(p.z) ? col(p.z) : [0.6, 0.6, 0.6];
      const hl = i === m.active ? 2.5 : 1;
      v.push(q[0] - s * hl, q[1], q[2], q[0] + s * hl, q[1], q[2], q[0], q[1] - s * hl, q[2], q[0], q[1] + s * hl, q[2]);
      for (let k2 = 0; k2 < 4; k2++) c.push(...(i === m.active ? [1, 1, 1] : k));
    });
    this._flushMap(gl, M, v, c);
  }
  // barevná plocha mapy: trojúhelníky s barvou podle výšky (poloprůhledné), nad deskou převýšené
  _drawMapSurf(gl, M, sf, ex, lift) {
    if (!this._surfCache || this._surfCache.sf !== sf || this._surfCache.ex !== ex) {
      const v = [], c = [], span = Math.max(1e-6, sf.hi - sf.lo);
      const P = (i, j) => { const z = sf.z[j * sf.nx + i]; v.push(sf.x0 + sf.w * i / (sf.nx - 1), sf.y0 + sf.h * j / (sf.ny - 1), z * ex + lift); c.push(...hmRamp((z - sf.lo) / span)); };
      for (let j = 0; j < sf.ny - 1; j++) for (let i = 0; i < sf.nx - 1; i++) { P(i, j); P(i + 1, j); P(i + 1, j + 1); P(i, j); P(i + 1, j + 1); P(i, j + 1); }
      this._surfCache = { sf, ex, v: new Float32Array(v), c: new Float32Array(c) };
    }
    const { v, c } = this._surfCache;
    const dt = gl.isEnabled(gl.DEPTH_TEST), bl = gl.isEnabled(gl.BLEND);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    this._flushMap(gl, M, v, c, gl.TRIANGLES, 0.72);
    gl.depthMask(true); if (!bl) gl.disable(gl.BLEND); if (dt) gl.enable(gl.DEPTH_TEST);
  }
  _flushMap(gl, M, v, c, mode, alpha = 1) {
    if (!this.pMap) this.pMap = prog(gl, `attribute vec3 aPos; attribute vec3 aCol; uniform mat4 uM; varying vec3 vC; void main(){ gl_Position = uM * vec4(aPos,1.0); vC = aCol; }`, `precision mediump float; varying vec3 vC; uniform float uA; void main(){ gl_FragColor = vec4(vC, uA); }`);
    if (!this.bufMapV) { this.bufMapV = gl.createBuffer(); this.bufMapC = gl.createBuffer(); }
    gl.useProgram(this.pMap);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.pMap, 'uM'), false, M);
    gl.uniform1f(gl.getUniformLocation(this.pMap, 'uA'), alpha);
    const aP = gl.getAttribLocation(this.pMap, 'aPos'), aC = gl.getAttribLocation(this.pMap, 'aCol');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufMapV); gl.bufferData(gl.ARRAY_BUFFER, v instanceof Float32Array ? v : new Float32Array(v), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufMapC); gl.bufferData(gl.ARRAY_BUFFER, c instanceof Float32Array ? c : new Float32Array(c), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(mode ?? gl.LINES, 0, v.length / 3);
    gl.disableVertexAttribArray(aC);
  }
  // ---------- kreslení ----------
  draw() { if (this._drawQ) return; this._drawQ = requestAnimationFrame(() => { this._drawQ = 0; this._draw(); }); }
  _draw() {
    const gl = this.gl; if (!gl || !this.w) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const bg = T3D.bg3d || [0.075, 0.09, 0.085, 1]; gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.g) { if (this.hmap) { gl.enable(gl.DEPTH_TEST); this._drawMap(gl, this._matrix()); } return; }
    const M = this._matrix();
    // deska: simulace obrábění
    const showSim = this.show.board && this.sim;
    if (showSim) {
      this._updateSim(); this._uploadSim();
      const sim = this.sim;
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(this.pSim);
      const U = n => gl.getUniformLocation(this.pSim, n);
      gl.uniformMatrix4fv(U('uM'), false, M);
      gl.uniform4f(U('uRect'), sim.minX, sim.minY, sim.W, sim.H);
      gl.uniform2i(U('uN'), sim.nx, sim.ny); gl.uniform1i(U('uK'), this.simK);
      gl.uniform1f(U('uT'), sim.T); gl.uniform1f(U('uCell'), sim.cell); gl.uniform1f(U('uZs'), this.zs || 1);
      const c3 = (n, k) => { const v = T3D[k]; gl.uniform3f(U(n), v[0], v[1], v[2]); };
      c3('uCu', 'simCu'); c3('uFr', 'simFr'); c3('uFrD', 'simFrDeep'); c3('uThru', 'simThru');
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texH); gl.uniform1i(U('uH'), 0);
      const aU = gl.getAttribLocation(this.pSim, 'aUV');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSimUV); gl.enableVertexAttribArray(aU); gl.vertexAttribPointer(aU, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufSimIdx);
      gl.drawElements(gl.TRIANGLES, this.simIdxN, gl.UNSIGNED_INT, 0);
      gl.disableVertexAttribArray(aU);
      // boky polotovaru
      gl.useProgram(this.pSide);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.pSide, 'uM'), false, M);
      const aS = gl.getAttribLocation(this.pSide, 'aPos');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufSides); gl.enableVertexAttribArray(aS); gl.vertexAttribPointer(aS, 3, gl.FLOAT, false, 0, 0);
      const shades = [0.62, 0.78, 0.5, 0.42];
      const fr = T3D.simFr; for (let i = 0; i < 4; i++) { const k = shades[i] * 0.95; gl.uniform4f(gl.getUniformLocation(this.pSide, 'uC'), fr[0] * k, fr[1] * k, fr[2] * k, 1); gl.drawArrays(gl.TRIANGLES, i * 6, 6); }
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
    }
    // mřížka a osy
    gl.useProgram(this.pS);
    const uM = gl.getUniformLocation(this.pS, 'uM'), uC = gl.getUniformLocation(this.pS, 'uC'), aPs = gl.getAttribLocation(this.pS, 'aPos');
    gl.uniformMatrix4fv(uM, false, M);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufGrid); gl.enableVertexAttribArray(aPs); gl.vertexAttribPointer(aPs, 3, gl.FLOAT, false, 0, 0);
    if (!showSim) { const t = T3D.text; gl.uniform4f(uC, t[0], t[1], t[2], 0.08); gl.drawArrays(gl.LINES, 0, this.gridN); }
    if (this.show.motif && this.motif) { gl.bindBuffer(gl.ARRAY_BUFFER, this.bufMotif); gl.vertexAttribPointer(aPs, 3, gl.FLOAT, false, 0, 0); gl.uniform4f(uC, 1, 0.82, 0.6, 0.75); gl.drawArrays(gl.LINES, 0, this.motif.length / 3); gl.bindBuffer(gl.ARRAY_BUFFER, this.bufGrid); gl.vertexAttribPointer(aPs, 3, gl.FLOAT, false, 0, 0); }
    gl.uniform4f(uC, 1, 0.36, 0.36, 1); gl.drawArrays(gl.LINES, this.gridN, 2);
    gl.uniform4f(uC, 0.36, 1, 0.54, 1); gl.drawArrays(gl.LINES, this.gridN + 2, 2);
    gl.uniform4f(uC, 0.45, 0.65, 1, 1); gl.drawArrays(gl.LINES, this.gridN + 4, 2);
    // dráhy
    gl.useProgram(this.pL);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.pL, 'uM'), false, M);
    gl.uniform1f(gl.getUniformLocation(this.pL, 'uTime'), this.time);
    gl.uniform2f(gl.getUniformLocation(this.pL, 'uZ'), 0, Math.min(-0.05, this.g.bb.minZ));
    gl.uniform1f(gl.getUniformLocation(this.pL, 'uRapid'), this.show.rapid ? 1 : 0);
    for (const [n, k] of [['uAir', 'pathAir'], ['uMid', 'pathMid'], ['uDeep', 'pathDeep'], ['uSel', 'sel'], ['uRap', 'rapid']]) { const v = T3D[k]; gl.uniform3f(gl.getUniformLocation(this.pL, n), v[0], v[1], v[2]); }
    gl.uniform1f(gl.getUniformLocation(this.pL, 'uDimK'), T3D.light ? 1.0 : 0.55);
    const aP = gl.getAttribLocation(this.pL, 'aPos'), aT = gl.getAttribLocation(this.pL, 'aT'), aK = gl.getAttribLocation(this.pL, 'aK');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufT); gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufK); gl.enableVertexAttribArray(aK); gl.vertexAttribPointer(aK, 1, gl.FLOAT, false, 0, 0);
    if (this.show.paths) gl.drawArrays(gl.LINES, 0, this.g.n);
    gl.disableVertexAttribArray(aT); gl.disableVertexAttribArray(aK);
    // nástroj
    const p = this.machine ? this.live : this.tool;
    this._drawMap(gl, M);
    if (p) {
      const r = Math.max(this.sim ? this.simTool.r : 0.1, 0.15), hgt = Math.max(6, this.cam.dist * 0.06) / (this.zs || 1), v = [];
      const N = 20;
      for (let i = 0; i < N; i++) {
        const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
        v.push(p.x + r * Math.cos(a0), p.y + r * Math.sin(a0), p.z, p.x + r * Math.cos(a1), p.y + r * Math.sin(a1), p.z);
        v.push(p.x + r * 2.2 * Math.cos(a0), p.y + r * 2.2 * Math.sin(a0), p.z + hgt, p.x + r * 2.2 * Math.cos(a1), p.y + r * 2.2 * Math.sin(a1), p.z + hgt);
      }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; v.push(p.x + r * Math.cos(a), p.y + r * Math.sin(a), p.z, p.x + r * 2.2 * Math.cos(a), p.y + r * 2.2 * Math.sin(a), p.z + hgt); }
      v.push(p.x, p.y, p.z, p.x, p.y, Math.min(p.z, 0)); // svislice k povrchu
      gl.useProgram(this.pS); gl.uniformMatrix4fv(uM, false, M);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufTool); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPs); gl.vertexAttribPointer(aPs, 3, gl.FLOAT, false, 0, 0);
      const tc = T3D.tool3d; gl.uniform4f(uC, tc[0], tc[1], tc[2], 1); gl.drawArrays(gl.LINES, 0, v.length / 3);
    }
  }
}
