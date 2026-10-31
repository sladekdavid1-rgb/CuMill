// Náhled desky a drah na plátně. Souřadnice světa v mm (Y nahoru).
import * as G from './geom.js';
import { movesToDesign } from './cam.js';

// malý kříž os stroje (obrazovkové souřadnice, ex/ey = směry os X a Y na obrazovce, y dolů)
function drawAxisGizmo(ctx, x, y, ex, ey, caption) {
  const n = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const L = 34;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x, y, 48, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [v, col, lab] of [[n(ex), COL.axisX, 'X'], [n(ey), COL.axisY, 'Y']]) {
    const tx = x + v[0] * L, ty = y + v[1] * L, a = Math.atan2(v[1], v[0]);
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx + Math.cos(a) * 6, ty + Math.sin(a) * 6); ctx.lineTo(tx + Math.cos(a + 2.5) * 7, ty + Math.sin(a + 2.5) * 7); ctx.lineTo(tx + Math.cos(a - 2.5) * 7, ty + Math.sin(a - 2.5) * 7); ctx.fill();
    ctx.fillText(lab, x + v[0] * (L + 13), y + v[1] * (L + 13));
  }
  ctx.fillStyle = COL.origin; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  if (caption) { ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(caption, x, y - 56); }
  ctx.restore();
}

import { COL, OPC } from './theme.js';
export const OP_COLORS = OPC;
// stálá barva podle jména sítě (bez sítě = šedá)
export function netColor(net, a = 1) {
  if (!net) return `rgba(150,150,150,${a})`;
  let h = 2166136261;
  for (let i = 0; i < net.length; i++) { h ^= net.charCodeAt(i); h = Math.imul(h, 16777619); }
  const hue = (h >>> 0) % 360, sat = 55 + ((h >>> 9) % 25), lig = 52 + ((h >>> 17) % 14);
  return `hsla(${hue},${sat}%,${lig}%,${a})`;
}
export const opColor = op => OP_COLORS[op.kind === 'iso' ? 'iso-' + op.layer : op.kind] || '#fff';

// poloha myši v prvku v CSS px – i při zvětšení rozhraní (CSS zoom na <html>), kdy getBoundingClientRect
// vrací zvětšené rozměry, ale kreslí se v nezvětšených
export function localPt(el, e) {
  const r = el.getBoundingClientRect(), k = el.offsetWidth ? r.width / el.offsetWidth : 1;
  return [(e.clientX - r.left) / k, (e.clientY - r.top) / k, k];
}
function drawTab(ctx, ct, t, sel, prev, px, tf) {
  const h = Math.max(0.3, (ct.len - ct.width) / 2), ca = Math.cos(t.ang) * h, sa = Math.sin(t.ang) * h;
  let a = [t.x - ca, t.y - sa], c = [t.x + ca, t.y + sa];
  if (tf) { a = tf(a); c = tf(c); }
  ctx.lineCap = 'butt';
  ctx.strokeStyle = prev ? COL.selFill : t.problem ? COL.errFill : COL.tab;
  ctx.lineWidth = Math.max(ct.width + 0.6, 5 * px);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
  ctx.strokeStyle = sel || prev ? COL.sel : COL.onAccent; ctx.lineWidth = (sel ? 2.2 : 1) * px;
  const nx = -(c[1] - a[1]), ny = c[0] - a[0], nl = Math.hypot(nx, ny) || 1, w = Math.max(ct.width + 0.6, 5 * px) / 2;
  const ox = nx / nl * w, oy = ny / nl * w;
  ctx.beginPath(); ctx.moveTo(a[0] + ox, a[1] + oy); ctx.lineTo(c[0] + ox, c[1] + oy); ctx.lineTo(c[0] - ox, c[1] - oy); ctx.lineTo(a[0] - ox, a[1] - oy); ctx.closePath(); ctx.stroke();
  ctx.lineCap = 'round';
}
function pathFrom(polys, tf) {
  const p = new Path2D();
  for (const poly of polys) {
    if (poly.length < 2) continue;
    const a = tf ? tf(poly[0]) : poly[0];
    p.moveTo(a[0], a[1]);
    for (let i = 1; i < poly.length; i++) { const q = tf ? tf(poly[i]) : poly[i]; p.lineTo(q[0], q[1]); }
    p.closePath();
  }
  return p;
}
function linesFrom(lines) {
  const p = new Path2D();
  for (const l of lines) { if (l.length < 2) continue; p.moveTo(l[0][0], l[0][1]); for (let i = 1; i < l.length; i++) p.lineTo(l[i][0], l[i][1]); }
  return p;
}

export class Viewer {
  constructor(canvas, onHover) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.scale = 5; this.cx = 0; this.cy = 0;
    this.board = null; this.res = null; this.opts = { mode: 'design', opId: null, layers: {} };
    this.cache = new Map();
    this.onHover = onHover;
    this.hoverPt = null;
    this._bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }
  _bind() {
    const c = this.c;
    let drag = null;
    this.draft = null; // rozkreslená oblast [[x,y]...] v souřadnicích návrhu
    this.rubber = null; // obdélník výběru/oblasti ve světě
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const [sx, sy] = localPt(c, e);
      const [wx, wy] = this.toWorld(sx, sy);
      const k = Math.exp(-e.deltaY * 0.0015);
      this.scale = Math.min(400, Math.max(0.5, this.scale * k));
      this.cx = wx - (sx - this.w / 2) / this.scale;
      this.cy = wy + (sy - this.h / 2) / this.scale;
      this.interact(); this.draw(false);
    }, { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => {
      const [lx, ly, zk] = localPt(c, e);
      const tool = this.opts.tool || 'pan';
      const pan = e.button === 1 || e.button === 2 || (e.button === 0 && tool === 'pan');
      drag = { x: e.clientX, y: e.clientY, k: zk, cx: this.cx, cy: this.cy, pan, moved: false, w0: this.toWorld(lx, ly), btn: e.button, shift: e.shiftKey || e.ctrlKey, pin: null };
      if ((tool === 'pin' || tool === 'tab') && e.button === 0) { const i = this.onPinDown?.(this.toDesign(drag.w0), this.scale); if (i !== null && i !== undefined) drag.pin = i; }
      // panel: desku jde chytit a táhnout i nástrojem Posun (prázdné místo = posun pohledu)
      if (tool === 'pan' && e.button === 0 && this.board?.panel && !e.altKey) { const i = this.onPanelDown?.(this.toDesign(drag.w0)); if (i !== null && i !== undefined) { drag.panel = i; drag.pan = false; } }
      if (tool === 'panel' && e.button === 0) { const i = this.onPanelDown?.(this.toDesign(drag.w0)); if (i !== null && i !== undefined) drag.panel = i; else { drag.pan = true; c.classList.add('grabbing'); } }
      c.setPointerCapture(e.pointerId);
      if (drag.pan) c.classList.add('grabbing');
    });
    c.addEventListener('pointermove', e => {
      const wp = this.toWorld(...localPt(c, e));
      if (drag) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
        if (drag.panel != null) { if (drag.moved) this.onPanelMove?.(drag.panel, this.toDesign(drag.w0), this.toDesign(wp), e.shiftKey); }
        else if (drag.pin !== null && drag.moved) { this.onPinMove?.(drag.pin, this.toDesign(wp), this.scale); }
        else if (drag.pan) {
          this.cx = drag.cx - (e.clientX - drag.x) / drag.k / this.scale;
          this.cy = drag.cy + (e.clientY - drag.y) / drag.k / this.scale;
          this.interact(); this.draw(false);
        } else if (drag.moved && drag.btn === 0) { this.rubber = [drag.w0, wp]; this.draw(false); }
      }
      this.hoverPt = wp;
      if (!drag && (this.opts.tool || 'pan') === 'tab') this.onTabHover?.(this.toDesign(wp), this.scale);
      if (!drag && this.board?.panel && ['pan', 'panel'].includes(this.opts.tool || 'pan')) c.classList.toggle('overboard', this.onPanelHit?.(this.toDesign(wp)) != null);
      if (this.draft || this.opts.rulers !== false) this.draw(false);
      this.onHover?.(this.hoverPt, this._hitHole(this.hoverPt));
    });
    const end = e => {
      if (!drag) return;
      const tool = this.opts.tool || 'pan';
      const wp = this.toWorld(...localPt(c, e));
      if (drag.panel != null) this.onPanelUp?.(drag.panel, this.toDesign(drag.w0), this.toDesign(wp), drag.moved, e.shiftKey);
      else if (drag.pin !== null) { if (drag.moved) this.onPinUp?.(); }
      else if ((tool === 'pin' || tool === 'tab') && drag.btn === 0 && !drag.moved) this.onPinAdd?.(this.toDesign(wp), this.scale);
      else if (drag.btn === 0 && !drag.moved) {
        if (tool === 'clear' || tool === 'block') this._draftPoint(wp);
        else this.onPick?.(this.toDesign(wp), drag.shift, this.scale);
      } else if (drag.btn === 0 && this.rubber) {
        const [a, b] = this.rubber;
        const rect = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]].map(p => this.toDesign(p));
        if (tool === 'select') this.onRect?.(rect, drag.shift);
        else if (tool === 'clear' || tool === 'block') { this.draft = null; this.onArea?.(rect, tool); }
      }
      const wasRubber = !!this.rubber; this.rubber = null; drag = null; c.classList.remove('grabbing'); if (wasRubber) this.draw(false);
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.hoverPt = null; this.draw(false); this.onHover?.(null); if (!drag) this.onTabHover?.(null); });
    c.addEventListener('dblclick', () => {
      const tool = this.opts.tool || 'pan';
      if ((tool === 'clear' || tool === 'block') && this.draft) this.finishDraft();
      else if (tool === 'pan' || tool === 'select') this.fit();
    });
  }
  // body oblasti: klik přidá vrchol, klik na první vrchol (nebo dvojklik / Enter) uzavře
  _draftPoint(wp) {
    const dp = this.toDesign(wp);
    if (!this.draft) this.draft = [];
    if (this.draft.length >= 3) {
      const f = this.fromDesign(this.draft[0]);
      if (Math.hypot(f[0] - wp[0], f[1] - wp[1]) * this.scale < 8) { this.finishDraft(); return; }
    }
    this.draft.push(dp); this.draw(false);
  }
  finishDraft() {
    const d = this.draft; this.draft = null;
    if (d) { const dd = d.filter((p, i) => i === 0 || Math.hypot(p[0] - d[i - 1][0], p[1] - d[i - 1][1]) > 1e-6); if (dd.length >= 3) this.onArea?.(dd, this.opts.tool); }
    this.draw();
  }
  cancelDraft() { this.draft = null; this.rubber = null; this.draw(false); }
  undoDraft() { if (this.draft?.length) { this.draft.pop(); if (!this.draft.length) this.draft = null; this.draw(false); } }
  toDesign(p) { const t = this._tf(); return t ? (t.inv || this.res.sides[t.side].inv)(p) : p; }
  fromDesign(p) { const t = this._tf(); return t ? t.fwd(p) : p; }
  resize() {
    const pe = this.c.parentElement, r = pe.getBoundingClientRect();
    const k = pe.offsetWidth ? r.width / pe.offsetWidth : 1; // CSS zoom rozhraní
    const w = pe.clientWidth || r.width / k, h = pe.clientHeight || r.height / k;
    const dpr = (window.devicePixelRatio || 1) * k;
    this.w = w; this.h = h; this.dpr = dpr;
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.draw();
  }
  toWorld(sx, sy) { return [this.cx + (sx - this.w / 2) / this.scale, this.cy - (sy - this.h / 2) / this.scale]; }
  setBoard(board) { this.board = board; this.cache.clear(); }
  setResult(res) { this.res = res; this.cache.clear(); this.draw(); }
  setOpts(o) { Object.assign(this.opts, o); this.draw(); }
  // aktuální transformace geometrie návrhu (v režimu stroje podle strany vybrané operace)
  _tf() {
    if (!this.res) return null;
    // návrh s otočenou deskou: jen otočení (bez zrcadlení a posunu nuly), ať náhled odpovídá stroji
    if (this.opts.mode !== 'machine') { const sd = this.res.sides.top; return sd.rot ? { side: null, rotOnly: sd.rot, fwd: sd.R, inv: sd.Ri } : null; }
    const op = this.res.ops.find(o => o.id === this.opts.opId) || this.res.ops[0];
    if (!op) return null;
    return { side: op.side, fwd: this.res.sides[op.side].fwd };
  }
  _bounds() {
    if (!this.board) return null;
    const t = this._tf();
    const ols = (this.board.outlines || [this.board.outline]).map(l => t ? l.map(t.fwd) : l);
    const bb = G.bbox(ols);
    if (t && !t.rotOnly) { G.bbox([[[0, 0]]], bb); }
    return bb;
  }
  fit() {
    const bb = this._bounds(); if (!bb || !this.w) return;
    const m = 30, on = this.opts.rulers !== false, RW = on ? 30 + 40 : 0, RH = on ? 22 + 40 : 0, TOP = on ? 50 : 0; // místo pro pravítka, kóty a souhrn
    this.scale = Math.min((this.w - RW - 2 * m) / Math.max(1, bb.maxX - bb.minX), (this.h - RH - TOP - 2 * m) / Math.max(1, bb.maxY - bb.minY));
    this.cx = (bb.minX + bb.maxX) / 2 - RW / 2 / this.scale; this.cy = (bb.minY + bb.maxY) / 2 - (RH - TOP) / 2 / this.scale;
    this.draw();
  }
  _geom(key, make) { if (!this.cache.has(key)) this.cache.set(key, make()); return this.cache.get(key); }
  _hitHole(p) {
    if (!this.board || !p) return null;
    const t = this._tf();
    let best = null, bd = Infinity;
    for (const h of this.board.holes) {
      const [x, y] = t ? t.fwd([h.x, h.y]) : [h.x, h.y];
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < Math.max(h.d / 2, 6 / this.scale) && d < bd) { bd = d; best = h; }
    }
    return best;
  }
  // překreslení: scene=true -> scéna je neplatná; jinak jen překryv (rozkreslená oblast, obdélník)
  draw(scene = true) {
    if (scene) this.dirty = true;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._frame(); });
  }
  // během posunu/zoomu se jen posouvá hotový obrázek; ostrý náhled po zastavení
  interact() {
    this.interacting = true;
    clearTimeout(this._idleT);
    this._idleT = setTimeout(() => { this.interacting = false; this.draw(true); }, 140);
  }
  _frame() {
    const ctx = this.ctx; if (!ctx || !this.w) return;
    if (!this.sc || this.sc.width !== this.c.width || this.sc.height !== this.c.height) {
      this.sc = document.createElement('canvas'); this.sc.width = this.c.width; this.sc.height = this.c.height;
      this.sctx = this.sc.getContext('2d'); this.snap = null;
    }
    if (!this.snap || (this.dirty && !this.interacting)) {
      this._render();
      this.snap = { scale: this.scale, cx: this.cx, cy: this.cy };
      this.dirty = false;
    }
    // obrázek scény do okna (s posunem/zvětšením od chvíle vykreslení)
    const sn = this.snap, k = this.scale / sn.scale;
    const dx = this.w / 2 * (1 - k) + (sn.cx - this.cx) * this.scale;
    const dy = this.h / 2 * (1 - k) - (sn.cy - this.cy) * this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, this.c.width, this.c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.sc, dx * this.dpr, dy * this.dpr, this.sc.width * k, this.sc.height * k);
    this._overlay(ctx);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._rulers(ctx);
  }
  // pravítka dole a vlevo (cm, dílky po mm); nula = levý dolní roh desky, v režimu stroje nula obrobku
  _rulers(ctx) {
    if (!this.board || this.opts.rulers === false) return;
    const s = this.scale, W = this.w, H = this.h, RW = 30, RH = 22;
    const t = this._tf(), mach = t && !t.rotOnly;
    const bb = (() => { const ols = (this.board.outlines || [this.board.outline]).map(l => t ? l.map(t.fwd) : l); return G.bbox(ols); })();
    const ox = mach ? 0 : bb.minX, oy = mach ? 0 : bb.minY;
    const X = x => (x - this.cx) * s + W / 2, Y = y => H / 2 - (y - this.cy) * s;
    // krok popisků (mm) – aspoň ~55 px; dílky – aspoň ~6 px
    let lab = 1000; for (const k of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) if (k * s >= 55) { lab = k; break; }
    let tick = lab; for (const k of [0.5, 1, 2, 5, 10, 20, 50, 100]) if (k * s >= 6 && lab % k === 0) { tick = k; break; }
    const fmt = mm => { const v = mm / 10; return (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(lab < 10 ? 1 : 0)).replace('.', ',').replace('-', '−'); };
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    // podklad
    ctx.fillStyle = COL.ruler; ctx.fillRect(0, H - RH, W, RH); ctx.fillRect(0, 0, RW, H - RH);
    ctx.strokeStyle = COL.rulerLine; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(RW + 0.5, 0); ctx.lineTo(RW + 0.5, H - RH + 0.5); ctx.lineTo(W, H - RH + 0.5); ctx.stroke();
    // rozsah desky
    const bx0 = Math.max(RW, X(bb.minX)), bx1 = Math.min(W, X(bb.maxX)), by0 = Math.max(0, Y(bb.maxY)), by1 = Math.min(H - RH, Y(bb.minY));
    ctx.fillStyle = COL.rulerBand;
    if (bx1 > bx0) ctx.fillRect(bx0, H - RH, bx1 - bx0, 5);
    if (by1 > by0) ctx.fillRect(RW - 5, by0, 5, by1 - by0);
    // dílky a popisky – vodorovně
    ctx.strokeStyle = COL.rulerText; ctx.fillStyle = COL.rulerText; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.beginPath();
    const [wx0] = this.toWorld(RW, 0), [wx1] = this.toWorld(W, 0);
    for (let v = Math.ceil((wx0 - ox) / tick) * tick; v <= wx1 - ox; v += tick) {
      const sx = Math.round(X(v + ox)) + 0.5, major = Math.abs(v / lab - Math.round(v / lab)) < 1e-6, half = !major && Math.abs(v / (lab / 2) - Math.round(v / (lab / 2))) < 1e-6;
      const L = major ? 9 : half ? 6 : 3; ctx.moveTo(sx, H - RH); ctx.lineTo(sx, H - RH + L);
      if (major && sx > RW + 2) ctx.fillText(fmt(v), sx + 2, H - RH + 9);
    }
    // svisle
    const [, wy1] = this.toWorld(0, 0), [, wy0] = this.toWorld(0, H - RH);
    for (let v = Math.ceil((wy0 - oy) / tick) * tick; v <= wy1 - oy; v += tick) {
      const sy = Math.round(Y(v + oy)) + 0.5, major = Math.abs(v / lab - Math.round(v / lab)) < 1e-6, half = !major && Math.abs(v / (lab / 2) - Math.round(v / (lab / 2))) < 1e-6;
      const L = major ? 9 : half ? 6 : 3; ctx.moveTo(RW - L, sy); ctx.lineTo(RW, sy);
      if (major && sy < H - RH - 2) { ctx.save(); ctx.translate(RW - 11, sy - 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(fmt(v), 0, 0); ctx.restore(); }
    }
    ctx.stroke();
    // kóty celkového rozměru (desky / panelu) – pod deskou a vlevo od ní, výrazně
    {
      const bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
      const x0 = X(bb.minX), x1 = X(bb.maxX), y0 = Y(bb.maxY), y1 = Y(bb.minY);
      const big = v => (v / 10).toFixed(1).replace('.', ',') + ' cm';
      const mm = v => (Math.round(v * 10) / 10).toString().replace('.', ',') + ' mm';
      ctx.strokeStyle = COL.rulerAccent; ctx.fillStyle = COL.rulerAccent; ctx.lineWidth = 1.5;
      const arrow = (ax, ay, dx, dy) => { const L = 7, w = 3.5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - dx * L - dy * w, ay - dy * L + dx * w); ctx.lineTo(ax - dx * L + dy * w, ay - dy * L - dx * w); ctx.closePath(); ctx.fill(); };
      const pill = (txt, cx, cy, rot) => {
        ctx.save(); ctx.translate(cx, cy); if (rot) ctx.rotate(rot);
        ctx.font = '700 14px system-ui, sans-serif'; const tw = ctx.measureText(txt).width + 14;
        ctx.fillStyle = COL.ruler; ctx.strokeStyle = COL.rulerAccent; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(-tw / 2, -11, tw, 22, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COL.rulerAccent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 1);
        ctx.restore(); return tw;
      };
      // vodorovná kóta pod deskou
      const dy = Math.min(H - RH - 16, y1 + 26);
      if (x1 - x0 > 60 && dy > y1 + 8) {
        ctx.beginPath(); ctx.moveTo(x0, y1 + 4); ctx.lineTo(x0, dy + 6); ctx.moveTo(x1, y1 + 4); ctx.lineTo(x1, dy + 6); ctx.moveTo(x0, dy); ctx.lineTo(x1, dy); ctx.stroke();
        arrow(x0, dy, -1, 0); arrow(x1, dy, 1, 0);
        pill(`${big(bw)}  ·  ${mm(bw)}`, (x0 + x1) / 2, dy);
      }
      // svislá kóta vlevo od desky
      const dx = Math.max(RW + 16, x0 - 26);
      if (y1 - y0 > 60 && dx < x0 - 8) {
        ctx.beginPath(); ctx.moveTo(x0 - 4, y0); ctx.lineTo(dx - 6, y0); ctx.moveTo(x0 - 4, y1); ctx.lineTo(dx - 6, y1); ctx.moveTo(dx, y0); ctx.lineTo(dx, y1); ctx.stroke();
        arrow(dx, y0, 0, -1); arrow(dx, y1, 0, 1);
        pill(`${big(bh)}  ·  ${mm(bh)}`, dx, (y0 + y1) / 2, -Math.PI / 2);
      }
      // souhrn nad deskou
      const title = `${this.board.panel ? 'Panel' : 'Deska'}  ${big(bw)} × ${big(bh)}`;
      ctx.font = '700 15px system-ui, sans-serif';
      const tw = ctx.measureText(title).width + 18, tx = Math.max(RW + 6, Math.min(W - tw - 6, x0)), ty = Math.max(96, y0 - 34);
      if (ty + 26 < y1) {
        ctx.fillStyle = COL.rulerAccent; ctx.beginPath(); ctx.roundRect(tx, ty, tw, 26, 7); ctx.fill();
        ctx.fillStyle = COL.onAccent; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(title, tx + 9, ty + 13.5);
      }
    }
    // poloha myši
    if (this.hoverPt) {
      const hx = X(this.hoverPt[0]), hy = Y(this.hoverPt[1]);
      ctx.strokeStyle = COL.sel; ctx.lineWidth = 1.5; ctx.beginPath();
      if (hx > RW) { ctx.moveTo(hx, H - RH); ctx.lineTo(hx, H); }
      if (hy < H - RH) { ctx.moveTo(0, hy); ctx.lineTo(RW, hy); }
      ctx.stroke();
    }
    // roh: jednotka
    ctx.fillStyle = COL.ruler; ctx.fillRect(0, H - RH, RW, RH);
    ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = COL.rulerStrong; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('cm', RW / 2, H - RH / 2);
    ctx.restore();
  }
  _render() {
    const ctx = this.sctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, this.w, this.h);
    this._grid();
    if (!this.board) return;
    const b = this.board, L = this.opts.layers, t = this._tf();
    const key = t ? (t.rotOnly ? 'r' + t.rotOnly + '-' : 'm-' + t.side) : 'd';
    const mach = t && !t.rotOnly;
    const m2v = side => mach ? (p => p) : t ? (p => t.fwd(this.res.sides[side].inv(p))) : this.res.sides[side].inv; // strojové -> zobrazené
    const tf = t ? t.fwd : null;
    // svět -> obrazovka
    const s = this.scale;
    ctx.setTransform(this.dpr * s, 0, 0, -this.dpr * s, this.dpr * (this.w / 2 - this.cx * s), this.dpr * (this.h / 2 + this.cy * s));
    const px = 1 / s;

    // polotovar (v režimu stroje kolem desky)
    if (mach && this.res) {
      const st = this.res.settings?.setup;
      if (st) {
        const bb = G.bbox((b.outlines || [b.outline]).map(l => tf ? l.map(tf) : l));
        const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
        const W = st.blankW, H = st.blankH; // ve strojových souřadnicích: šířka v ose X
        ctx.fillStyle = COL.blank; ctx.fillRect(cx - W / 2, cy - H / 2, W, H);
        ctx.strokeStyle = COL.blankEdge; ctx.lineWidth = px; ctx.setLineDash([6 * px, 4 * px]); ctx.strokeRect(cx - W / 2, cy - H / 2, W, H); ctx.setLineDash([]);
      }
    }
    // deska
    const boardP = this._geom(key + 'board', () => pathFrom([...(b.outlines || [b.outline]), ...b.inner], tf));
    ctx.fillStyle = COL.board; ctx.fill(boardP, 'evenodd');
    // měď – spodní pod horní; v režimu stroje zvýrazni obráběnou stranu
    const order = t?.side === 'bottom' ? ['F.Cu', 'B.Cu'] : ['B.Cu', 'F.Cu'];
    for (const l of order) {
      if (L[l] === false || !b.copper[l].length) continue;
      const p = this._geom(key + l, () => pathFrom(b.copper[l], tf));
      const active = !mach || (t.side === 'bottom') === (l === 'B.Cu');
      ctx.fillStyle = l === 'F.Cu' ? (active ? COL.fcu : COL.fcuDim) : (active ? COL.bcu : COL.bcuDim);
      if (!b.used[l]) ctx.fillStyle = l === 'F.Cu' ? COL.fcuDim : COL.bcuDim;
      ctx.fill(p, 'nonzero');
      // barvy sítí: každý kus mědi barvou své sítě
      if (L.netColors && b.islands?.[l]) {
        const isl = b.islands[l];
        isl.forEach((it, i) => {
          const q = this._geom(key + l + 'isl' + i, () => pathFrom([it.outer, ...it.holes], tf));
          ctx.fillStyle = netColor(it.net, active ? 0.92 : 0.35);
          ctx.fill(q, 'evenodd');
        });
      }
    }
    ctx.strokeStyle = COL.boardEdge; ctx.lineWidth = 1.2 * px; ctx.stroke(boardP);
    // další geometrie (vrstvy User…)
    if (L.geo !== false && b.geo) {
      for (const [lay, objs] of Object.entries(b.geo)) {
        for (const o of objs) {
          const on = this.opts.geoOn?.(o);
          const p = this._geom(key + 'geo' + o.id, () => { const q = new Path2D(); const pts = tf ? o.pts.map(tf) : o.pts; q.moveTo(pts[0][0], pts[0][1]); for (const v of pts) q.lineTo(v[0], v[1]); if (o.closed) q.closePath(); return q; });
          ctx.strokeStyle = on ? COL.geo : COL.geoDim; ctx.lineWidth = (on ? 1.4 : 1) * px;
          if (!on) ctx.setLineDash([4 * px, 3 * px]);
          ctx.stroke(p); ctx.setLineDash([]);
        }
      }
    }
    // oblasti úprav mědi
    for (const a of this.opts.areas || []) {
      const pts = tf ? a.pts.map(tf) : a.pts;
      const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (const v of pts) p.lineTo(v[0], v[1]); p.closePath();
      const block = a.type === 'block';
      ctx.fillStyle = block ? COL.areaBlockFill : a.all ? COL.areaClearAll : COL.areaClearFill;
      ctx.fill(p);
      ctx.strokeStyle = block ? COL.areaBlock : COL.areaClear; ctx.lineWidth = 1.4 * px; ctx.setLineDash(block ? [5 * px, 3 * px] : []); ctx.stroke(p); ctx.setLineDash([]);
    }
    // díry (barva podle akce: vrtat bílá, frézovat fialová, vynechat červená)
    if (L.holes !== false) {
      const acts = this.res?.holeActs;
      const groups = { drill: new Path2D(), mill: new Path2D(), skip: new Path2D() };
      const hp = this._geom(key + 'holes', () => {
        const p = new Path2D();
        for (const h of b.holes) {
          if (h.slot) {
            const poly = G.capsule(h.slot.x1, h.slot.y1, h.slot.x2, h.slot.y2, h.d).map(q => tf ? tf(q) : q);
            p.moveTo(poly[0][0], poly[0][1]); for (const q of poly) p.lineTo(q[0], q[1]); p.closePath();
          } else { const [x, y] = tf ? tf([h.x, h.y]) : [h.x, h.y]; p.moveTo(x + h.d / 2, y); p.arc(x, y, h.d / 2, 0, Math.PI * 2); }
        }
        return p;
      });
      ctx.fillStyle = COL.hole; ctx.fill(hp);
      if (acts) {
        for (const h of b.holes) {
          const a = acts.get(`${h.x.toFixed(2)},${h.y.toFixed(2)}`); if (!a) continue;
          const [x, y] = tf ? tf([h.x, h.y]) : [h.x, h.y];
          const gp = groups[a.a] || groups.drill;
          if (a.a === 'skip') { const r = h.d / 2; gp.moveTo(x - r, y - r); gp.lineTo(x + r, y + r); gp.moveTo(x - r, y + r); gp.lineTo(x + r, y - r); }
          else { const r = (a.a === 'mill' && a.dia ? a.dia : h.d) / 2; gp.moveTo(x + r, y); gp.arc(x, y, r, 0, Math.PI * 2); }
        }
        ctx.lineWidth = 0.8 * px;
        ctx.strokeStyle = COL.holeRing; ctx.stroke(groups.drill);
        ctx.strokeStyle = COL.mill; ctx.lineWidth = 1.4 * px; ctx.stroke(groups.mill);
        ctx.strokeStyle = COL.err; ctx.stroke(groups.skip);
      } else { ctx.strokeStyle = COL.holeRing; ctx.lineWidth = 0.7 * px; ctx.stroke(hp); }
    }
    // dráhy
    if (this.res && L.paths !== false) {
      const showOps = this.res.ops.filter(o => this.opts.visible?.[o.id] !== false && (o.side === 'bottom' ? L.pathsBot !== false : L.pathsTop !== false) && (!mach || o.side === t.side || o.id === this.opts.opId));
      for (const op of showOps) {
        const sel = op.id === this.opts.opId;
        const mv = this._geom(key + 'mv-' + op.id, () => {
          const f = m2v(op.side), moves = mach ? op.moves : op.moves.map(m => ({ ...m, pts: m.pts.map(f) }));
          return { cut: linesFrom(moves.filter(m => m.t === 'cut').map(m => m.pts)), rapid: linesFrom(moves.filter(m => m.t === 'rapid').map(m => m.pts)), pts: op.points ? op.points.map(p => f([p.x, p.y])) : null };
        });
        const color = opColor(op);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if ((op.kind === 'drill' || op.kind === 'pins') && mv.pts) {
          ctx.strokeStyle = color; ctx.lineWidth = (sel ? 1.6 : 1) * px;
          const r = op.toolDia / 2;
          const p = new Path2D();
          for (const [x, y] of mv.pts) { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); p.moveTo(x - r * 0.6, y); p.lineTo(x + r * 0.6, y); p.moveTo(x, y - r * 0.6); p.lineTo(x, y + r * 0.6); }
          ctx.globalAlpha = sel || !this.opts.opId ? 1 : 0.55; ctx.stroke(p); ctx.globalAlpha = 1;
        } else {
          if (L.netColors && op.netPaths) {
            // dráhy obarvené podle sítě
            const byNet = this._geom(key + 'np-' + op.id, () => {
              const m = new Map();
              for (const np of op.netPaths) { if (!m.has(np.net)) m.set(np.net, []); m.get(np.net).push(np.pts.map(m2v(op.side))); }
              return [...m].map(([n, ls]) => [n, linesFrom(ls)]);
            });
            for (const [n, path] of byNet) {
              if (L.toolWidth !== false) { ctx.strokeStyle = netColor(n, sel ? 0.6 : 0.4); ctx.lineWidth = op.toolDia; ctx.stroke(path); }
              ctx.strokeStyle = netColor(n, 1); ctx.lineWidth = (sel ? 1.3 : 0.8) * px; ctx.stroke(path);
            }
          } else if (L.toolWidth !== false) {
            ctx.strokeStyle = color; ctx.globalAlpha = sel ? 0.55 : 0.32; ctx.lineWidth = op.toolDia; ctx.stroke(mv.cut); ctx.globalAlpha = 1;
          }
          if (!(L.netColors && op.netPaths)) { ctx.strokeStyle = color; ctx.lineWidth = (sel ? 1.3 : 0.8) * px; ctx.globalAlpha = sel || !this.opts.opId ? 0.95 : 0.6; ctx.stroke(mv.cut); ctx.globalAlpha = 1; }
        }
        if (L.rapids && (sel || !this.opts.opId)) {
          ctx.strokeStyle = COL.rapid; ctx.lineWidth = px; ctx.setLineDash([4 * px, 4 * px]); ctx.stroke(mv.rapid); ctx.setLineDash([]);
        }
      }
    }
    // kolíčky
    if (this.res?.pinsOn && this.res.pins?.length) {
      const pv = this.opts.pinPreview;
      this.res.pins.forEach((p, i) => {
        const P = pv && pv.i === i ? pv : p;
        const [x, y] = tf ? tf([P.x, P.y]) : [P.x, P.y];
        const r = (this.res.pinDia || 2.5) / 2;
        const bad = p.problems?.length && !(pv && pv.i === i);
        const sel = this.opts.selection?.kind === 'pin' && this.opts.selection.idx === i;
        ctx.fillStyle = bad ? COL.errFill : COL.pinFill;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = bad ? COL.marker : COL.pin; ctx.lineWidth = (sel ? 2.4 : 1.4) * px;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.moveTo(x - r * 1.8, y); ctx.lineTo(x + r * 1.8, y); ctx.moveTo(x, y - r * 1.8); ctx.lineTo(x, y + r * 1.8); ctx.stroke();
        if (sel) { ctx.strokeStyle = COL.sel; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(x, y, r + 5 * px, 0, Math.PI * 2); ctx.stroke(); }
      });
    }
    // můstky ořezu
    const ct = this.res?.cutTabs;
    if (ct?.list.length && L.paths !== false) {
      const selIdx = this.opts.selection?.kind === 'tab' ? this.opts.selection.idx : -2;
      for (const t of ct.list) drawTab(ctx, ct, t, t.idx >= 0 && t.idx === selIdx, false, px, tf);
    }
    // značky problémů
    if (this.res?.markers?.length) {
      for (const m of this.res.markers) {
        const [x, y] = tf ? tf([m.x, m.y]) : [m.x, m.y];
        ctx.strokeStyle = COL.marker; ctx.lineWidth = 2 * px;
        ctx.beginPath(); ctx.arc(x, y, 9 * px, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 2.5 * px, 0, Math.PI * 2); ctx.fillStyle = COL.marker; ctx.fill();
      }
    }
    // výběr
    const sel = this.opts.selection;
    if (sel) {
      ctx.strokeStyle = COL.sel; ctx.lineWidth = 2.2 * px;
      const pathOf = (pts, closed) => { const q = new Path2D(); const P = tf ? pts.map(tf) : pts; q.moveTo(P[0][0], P[0][1]); for (const v of P) q.lineTo(v[0], v[1]); if (closed) q.closePath(); return q; };
      if (sel.kind === 'holes') for (const h of sel.items) { const [x, y] = tf ? tf([h.x, h.y]) : [h.x, h.y]; ctx.beginPath(); ctx.arc(x, y, h.d / 2 + 3 * px, 0, Math.PI * 2); ctx.stroke(); }
      if (sel.kind === 'island') { const it = b.islands[sel.layer]?.[sel.idx]; if (it) { ctx.fillStyle = COL.selFill; const p = pathOf(it.outer, true); ctx.fill(p); ctx.stroke(p); } }
      if (sel.kind === 'geo') for (const o of sel.items) ctx.stroke(pathOf(o.pts, o.closed));
      if (sel.kind === 'area') for (const a of sel.items) ctx.stroke(pathOf(a.pts, true));
    }
    // nula stroje
    if (this.res) {
      const side = mach ? t.side : (this.res.ops.find(o => o.id === this.opts.opId)?.side || this.res.firstSide);
      const o = m2v(side)([0, 0]);
      const a = 7 * px, len = 26 * px;
      ctx.lineWidth = 2 * px;
      // směr os stroje v aktuálním pohledu (v návrhu i se zrcadlením a otočením desky)
      const dir = v => { const q = m2v(side)(v); return [q[0] - o[0], q[1] - o[1]]; };
      const ex = dir([1, 0]), ey = dir([0, 1]);
      ctx.strokeStyle = COL.axisX; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(o[0] + ex[0] * len, o[1] + ex[1] * len); ctx.stroke();
      ctx.strokeStyle = COL.axisY; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(o[0] + ey[0] * len, o[1] + ey[1] * len); ctx.stroke();
      ctx.fillStyle = COL.origin; ctx.beginPath(); ctx.arc(o[0], o[1], a * 0.55, 0, Math.PI * 2); ctx.fill();
      // souřadnicový kříž stroje v pravém dolním rohu (směry os X / Y v tomto pohledu)
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      drawAxisGizmo(ctx, this.w - 58, this.h - 80, [ex[0], -ex[1]], [ey[0], -ey[1]], mach ? 'stroj' : t ? 'návrh, otočeno' : 'návrh');
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  _overlay(ctx) {
    if (!this.board || (!this.draft?.length && !this.rubber && !this.opts.pinPreview && !this.opts.tabPreview && !this.opts.ghost && !this.opts.panelSel && !this.board.panel)) return;
    const s = this.scale, px = 1 / s, t = this._tf(), tf = t ? t.fwd : null;
    ctx.setTransform(this.dpr * s, 0, 0, -this.dpr * s, this.dpr * (this.w / 2 - this.cx * s), this.dpr * (this.h / 2 + this.cy * s));
    if (this.opts.tabPreview && this.res?.cutTabs) drawTab(ctx, this.res.cutTabs, this.opts.tabPreview, true, true, px, tf);
    const pv = this.opts.pinPreview;
    if (pv) {
      const [x, y] = tf ? tf([pv.x, pv.y]) : [pv.x, pv.y], r = (this.res?.pinDia || 2.5) / 2;
      ctx.fillStyle = COL.selFill; ctx.strokeStyle = COL.sel; ctx.lineWidth = 2 * px;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.moveTo(x - r * 1.8, y); ctx.lineTo(x + r * 1.8, y); ctx.moveTo(x, y - r * 1.8); ctx.lineTo(x, y + r * 1.8); ctx.stroke();
    }
    // panel: vybraná deska a „duch“ při posunu
    for (const [loops, dash] of [[this.opts.panelSel, false], [this.opts.ghost, true]]) {
      if (!loops) continue;
      ctx.strokeStyle = COL.sel; ctx.fillStyle = COL.selFill; ctx.lineWidth = (dash ? 2 : 2.5) * px; if (dash) ctx.setLineDash([6 * px, 4 * px]);
      ctx.beginPath(); for (const l of loops) { const P = l.map(p => tf ? tf(p) : p); ctx.moveTo(P[0][0], P[0][1]); for (const v of P) ctx.lineTo(v[0], v[1]); ctx.closePath(); }
      if (dash) ctx.fill('evenodd'); ctx.stroke(); ctx.setLineDash([]);
    }
    // panel: písmena desek
    if (this.board.panel && this.board.instances?.length) {
      ctx.save(); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const fs = Math.max(12, Math.min(40, 6 * s));
      ctx.font = `700 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const it of this.board.instances) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of it.outer) { const q = tf ? tf(p) : p; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
        const sx = ((x0 + x1) / 2 - this.cx) * s + this.w / 2, sy = -((y0 + y1) / 2 - this.cy) * s + this.h / 2;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.fillStyle = '#ffd9b0';
        const lb = it.label + (it.flip ? ' ⇋' : '') + (it.cu ? ' ' + it.cu : '');
        ctx.strokeText(lb, sx, sy); ctx.fillText(lb, sx, sy);
      }
      ctx.restore();
    }
    // rozkreslená oblast a obdélník
    if (this.draft?.length) {
      const P = this.draft.map(p => tf ? tf(p) : p);
      if (this.hoverPt) P.push(this.hoverPt);
      ctx.strokeStyle = this.opts.tool === 'block' ? COL.areaBlock : COL.areaClear; ctx.lineWidth = 1.5 * px; ctx.setLineDash([5 * px, 3 * px]);
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (const v of P) ctx.lineTo(v[0], v[1]); ctx.stroke(); ctx.setLineDash([]);
      for (const v of P.slice(0, -1)) { ctx.beginPath(); ctx.arc(v[0], v[1], 3 * px, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); }
    }
    if (this.rubber) {
      const [a, c2] = this.rubber;
      ctx.strokeStyle = this.opts.tool === 'block' ? COL.areaBlock : this.opts.tool === 'clear' ? COL.areaClear : COL.sel;
      ctx.lineWidth = 1.2 * px; ctx.setLineDash([5 * px, 3 * px]);
      ctx.strokeRect(Math.min(a[0], c2[0]), Math.min(a[1], c2[1]), Math.abs(c2[0] - a[0]), Math.abs(c2[1] - a[1])); ctx.setLineDash([]);
    }
  }
  _grid() {
    const ctx = this.sctx, s = this.scale;
    let step = 1; const target = 18;
    for (const k of [0.1, 0.5, 1, 5, 10, 50, 100]) { step = k; if (k * s >= target) break; }
    const major = step * 10;
    const [x0, y1] = this.toWorld(0, 0), [x1, y0] = this.toWorld(this.w, this.h);
    ctx.lineWidth = 1;
    for (const [st, col] of [[step, COL.grid], [major, COL.gridMajor]]) {
      ctx.strokeStyle = col; ctx.beginPath();
      for (let x = Math.ceil(x0 / st) * st; x <= x1; x += st) { const sx = Math.round((x - this.cx) * s + this.w / 2) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, this.h); }
      for (let y = Math.ceil(y0 / st) * st; y <= y1; y += st) { const sy = Math.round(this.h / 2 - (y - this.cy) * s) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(this.w, sy); }
      ctx.stroke();
    }
  }
}
