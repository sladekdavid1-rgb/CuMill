// Výpočet drah na pozadí (okno zůstává plynulé)
importScripts('clipper.js');
let C = null, board = null;
// dráhy jako ploché Float64Array – přenesou se bez kopírování
const pack = pts => { const a = new Float64Array(pts.length * 2); for (let i = 0; i < pts.length; i++) { a[2 * i] = pts[i][0]; a[2 * i + 1] = pts[i][1]; } return a; };
self.onmessage = async e => {
  const { id, board: b, S, B } = e.data;
  try {
    if (!C) C = await import('./cam.js');
    if (b) board = b;
    const res = C.computeAll(board, S, B);
    delete res.sides; // funkce nejdou přenést – hlavní vlákno si je spočítá
    const bufs = [];
    for (const op of res.ops) {
      op.moves = op.moves.map(m => { const p = pack(m.pts); bufs.push(p.buffer); return { t: m.t, p }; });
      if (op.netPaths) op.netPaths = op.netPaths.map(n => { const p = pack(n.pts); bufs.push(p.buffer); return { net: n.net, p }; });
    }
    self.postMessage({ id, res }, bufs);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
