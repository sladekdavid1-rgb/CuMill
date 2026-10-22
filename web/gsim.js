// Simulace obrábění: výšková mapa polotovaru, ze které nástroj ubírá materiál.
// Výška 0 = vrch mědi, −T = spodek desky (průchozí řez). Rozlišení se volí podle plochy.

// tool: { type: 'v' | 'flat', r: poloměr (u V-frézy poloměr hrotu), tanH: tan(polovina úhlu) }
export function simTool(t) {
  if (!t) return { type: 'flat', r: 0.1 };
  if (t.type === 'v') return { type: 'v', r: Math.max(0.005, (t.vTip ?? t.dia ?? 0.1) / 2), tanH: Math.tan((t.vAngle || 30) / 2 * Math.PI / 180) };
  return { type: 'flat', r: Math.max(0.01, (t.dia || 0.2) / 2) };
}

export class HeightSim {
  constructor(rect, T, maxCells = 3e6) {
    const W = rect.maxX - rect.minX, H = rect.maxY - rect.minY;
    this.cell = Math.max(0.02, Math.sqrt(W * H / maxCells));
    this.nx = Math.max(2, Math.ceil(W / this.cell)); this.ny = Math.max(2, Math.ceil(H / this.cell));
    this.minX = rect.minX; this.minY = rect.minY; this.W = this.nx * this.cell; this.H = this.ny * this.cell;
    this.T = T;
    this.h = new Float32Array(this.nx * this.ny);
  }
  reset() { this.h.fill(0); }
  // vrátí obdélník změněných buněk [i0, j0, i1, j1] (včetně) nebo null
  segment(ax, ay, az, bx, by, bz, tool) {
    if (az >= 0 && bz >= 0) return null;
    const L = Math.hypot(bx - ax, by - ay), dz = bz - az;
    if (L > 1e-9 && Math.abs(dz) > 1e-6) { // rampa / šroubovice: rozdělit na vodorovné kousky
      const n = Math.max(1, Math.ceil(L / this.cell));
      let R = null;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const r = this._flat(ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1, Math.min(az + dz * t0, az + dz * t1), tool);
        R = join(R, r);
      }
      return R;
    }
    return this._flat(ax, ay, bx, by, Math.min(az, bz), tool);
  }
  _flat(ax, ay, bx, by, z, tool) {
    if (z >= 0) return null;
    const v = tool.type === 'v';
    const Rmax = v ? tool.r + (-z) * tool.tanH : tool.r;
    const c = this.cell, nx = this.nx, h = this.h, floor = -this.T;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - Rmax - this.minX) / c)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + Rmax - this.minX) / c));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - Rmax - this.minY) / c)), j1 = Math.min(this.ny - 1, Math.floor((Math.max(ay, by) + Rmax - this.minY) / c));
    if (i0 > i1 || j0 > j1) return null;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, R2 = Rmax * Rmax;
    const zc = Math.max(z, floor);
    for (let j = j0; j <= j1; j++) {
      const py = this.minY + (j + 0.5) * c, row = j * nx;
      for (let i = i0; i <= i1; i++) {
        const px = this.minX + (i + 0.5) * c;
        let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - ax - t * dx, ey = py - ay - t * dy, d2 = ex * ex + ey * ey;
        if (d2 > R2) continue;
        let zz = zc;
        if (v) { const d = Math.sqrt(d2); if (d > tool.r) zz = Math.max(floor, z + (d - tool.r) / tool.tanH); }
        if (zz < h[row + i]) h[row + i] = zz;
      }
    }
    return [i0, j0, i1, j1];
  }
  // celý rozebraný program (gparse) až do segmentu end
  run(g, tool, from = 0, to = g.n / 2) {
    let R = null; const P = g.pos;
    for (let s = from; s < to; s++) {
      const a = s * 2; if (g.kind[a] === 0) continue;
      const b = a + 1;
      R = join(R, this.segment(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2], tool));
    }
    return R;
  }
}
function join(A, B) { if (!A) return B; if (!B) return A; return [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])]; }
