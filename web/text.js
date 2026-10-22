// Texty KiCadu stejným čárovým písmem jako KiCad (newstroke) -> lomené čáry v mm (Y nahoru).
import { NEWSTROKE } from './font.js';

const SCALE = 1 / 21, OFFSET = -8, INTER_CHAR = 0.2;
let glyphs = null;
function load() {
  glyphs = NEWSTROKE.map(s => {
    const x0 = (s.charCodeAt(0) - 82) * SCALE, x1 = (s.charCodeAt(1) - 82) * SCALE;
    const strokes = []; let cur = [];
    for (let i = 2; i + 1 < s.length; i += 2) {
      if (s[i] === ' ' && s[i + 1] === 'R') { if (cur.length > 1) strokes.push(cur); cur = []; continue; }
      cur.push([(s.charCodeAt(i) - 82) * SCALE - x0, (s.charCodeAt(i + 1) - 82 + OFFSET) * SCALE]);
    }
    if (cur.length > 1) strokes.push(cur);
    return { w: x1 - x0, strokes };
  });
}

// t: { text, x, y (KiCad, Y nahoru), angle (°), h, w (velikost písma), justify: ['left'|'right'], ['top'|'bottom'], mirror }
export function textToLines(t) {
  if (!glyphs) load();
  const lines = String(t.text).split('\n');
  const H = t.h || 1, W = t.w || H;
  const interline = H * 1.62 * 0.9583; // KiCad: výška × 1,62 (stejně jako jeho METRICS) × LEGACY_FACTOR
  const out = [];
  const jh = t.justify?.includes('left') ? 'left' : t.justify?.includes('right') ? 'right' : 'center';
  const jv = t.justify?.includes('top') ? 'top' : t.justify?.includes('bottom') ? 'bottom' : 'center';
  const nL = lines.length;
  // svislé zarovnání celého bloku (souřadnice písma: Y dolů, účaří v 0, versálky do -H)
  let y0 = jv === 'top' ? H : jv === 'bottom' ? -(nL - 1) * interline : H / 2 - (nL - 1) * interline / 2;
  const a = (t.angle || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  lines.forEach((line, li) => {
    // šířka řádku
    let width = 0;
    const chars = [...line];
    for (const ch of chars) { const g = glyph(ch); width += g.w * W; }
    if (chars.length) width -= W * INTER_CHAR;
    let cx = jh === 'left' ? 0 : jh === 'right' ? -width : -width / 2;
    const by = y0 + li * interline;
    for (const ch of chars) {
      const g = glyph(ch);
      for (const s of g.strokes) out.push(s.map(([gx, gy]) => {
        let x = cx + gx * W, y = by + gy * H; // Y dolů
        if (t.mirror) x = -x;
        y = -y; // Y nahoru
        return [t.x + x * ca - y * sa, t.y + x * sa + y * ca];
      }));
      cx += g.w * W;
    }
  });
  return out;
}
function glyph(ch) {
  const c = ch.codePointAt(0) - 32;
  return glyphs[c >= 0 && c < glyphs.length ? c : '?'.charCodeAt(0) - 32];
}
