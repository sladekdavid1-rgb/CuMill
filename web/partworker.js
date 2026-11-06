// Worker simulace dílu: úběr materiálu přes všechny programy zakázky (aby UI nezamrzlo)
import { simulateJob } from './partcore.js';
self.onmessage = e => {
  const { id, geom, progs, rapid } = e.data;
  try {
    const r = simulateJob(geom, progs, { rapid, onProgress: f => self.postMessage({ id, progress: f }) });
    self.postMessage({ id, result: r });
  } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
};
