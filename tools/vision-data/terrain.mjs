// Elevation grid + hydrology (priority-flood, flow directions, accumulation, depressions)
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { BB, Z, DLAT, DLNG } from './common.mjs';

const T = 256, W = T * 2 ** Z;
const gx = lng => (lng + 180) / 360 * W;
const gy = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * W; };

const cache = new Map();
function tile(x, y) {
  const k = x + '_' + y;
  if (!cache.has(k)) {
    const png = PNG.sync.read(fs.readFileSync(`tiles/${Z}_${x}_${y}.png`));
    const e = new Float32Array(T * T);
    for (let i = 0; i < T * T; i++) e[i] = png.data[i * 4] * 256 + png.data[i * 4 + 1] + png.data[i * 4 + 2] / 256 - 32768;
    cache.set(k, e);
  }
  return cache.get(k);
}
function px(X, Y) { const tx = Math.floor(X / T), ty = Math.floor(Y / T); return tile(tx, ty)[(Y - ty * T) * T + (X - tx * T)]; }
export function elevAt(lat, lng) {
  const X = gx(lng) - 0.5, Y = gy(lat) - 0.5, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
  return px(x0, y0) * (1 - fx) * (1 - fy) + px(x0 + 1, y0) * fx * (1 - fy) + px(x0, y0 + 1) * (1 - fx) * fy + px(x0 + 1, y0 + 1) * fx * fy;
}

export const NX = Math.round((BB.e - BB.w) / DLNG), NY = Math.round((BB.n - BB.s) / DLAT), N = NX * NY;
export const cellLat = j => BB.n - (j + 0.5) * DLAT, cellLng = i => BB.w + (i + 0.5) * DLNG;
export const cellOf = (lat, lng) => { const i = Math.floor((lng - BB.w) / DLNG), j = Math.floor((BB.n - lat) / DLAT); return i < 0 || j < 0 || i >= NX || j >= NY ? -1 : j * NX + i; };
export const CELL_M2 = (DLAT * 111320) * (DLNG * 111320 * Math.cos(56.1 * Math.PI / 180));
// D8 neighbour offsets, code 1..8 (0 = no receiver)
export const DI = [0, 1, 1, 0, -1, -1, -1, 0, 1], DJ = [0, 0, 1, 1, 1, 0, -1, -1, -1];

class Heap { // min-heap on (key, seq) so ties keep insertion order
  constructor() { this.k = []; this.v = []; this.s = []; this.n = 0; this.c = 0; }
  push(k, v) { let i = this.n++; this.k[i] = k; this.v[i] = v; this.s[i] = this.c++; while (i) { const p = (i - 1) >> 1; if (this.lt(p, i)) break; this.sw(i, p); i = p; } }
  lt(a, b) { return this.k[a] < this.k[b] || (this.k[a] === this.k[b] && this.s[a] < this.s[b]); }
  sw(a, b) { [this.k[a], this.k[b]] = [this.k[b], this.k[a]]; [this.v[a], this.v[b]] = [this.v[b], this.v[a]]; [this.s[a], this.s[b]] = [this.s[b], this.s[a]]; }
  pop() { const v = this.v[0]; this.n--; if (this.n) { this.k[0] = this.k[this.n]; this.v[0] = this.v[this.n]; this.s[0] = this.s[this.n]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.n && this.lt(l, m)) m = l; if (r < this.n && this.lt(r, m)) m = r; if (m === i) break; this.sw(i, m); i = m; } } return v; }
}

export function buildTerrain() {
  const E = new Float32Array(N);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    // average 3×3 samples per 100 m cell (source ≈ 20 m) so the cell value is representative
    let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) s += elevAt(cellLat(j) + a * DLAT / 3, cellLng(i) + b * DLNG / 3);
    E[j * NX + i] = s / 9;
  }
  const sea = new Uint8Array(N); for (let k = 0; k < N; k++) sea[k] = E[k] <= 0.2 ? 1 : 0;
  // priority-flood: receiver = the neighbour that reached the cell first (its lowest processed neighbour)
  const F = new Float32Array(N), done = new Uint8Array(N), recv = new Int32Array(N).fill(-1), dir = new Uint8Array(N), order = new Int32Array(N);
  const h = new Heap();
  for (let k = 0; k < N; k++) {
    const i = k % NX, j = (k / NX) | 0;
    if (sea[k] || i === 0 || j === 0 || i === NX - 1 || j === NY - 1) { F[k] = E[k]; done[k] = 1; h.push(E[k], k); }
  }
  let o = 0;
  while (h.n) {
    const c = h.pop(); order[o++] = c;
    const ci = c % NX, cj = (c / NX) | 0;
    for (let d = 1; d <= 8; d++) {
      const ni = ci + DI[d], nj = cj + DJ[d];
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
      const n = nj * NX + ni; if (done[n]) continue;
      done[n] = 1; F[n] = Math.max(E[n], F[c]); recv[n] = c;
      // receiver direction as seen from n → code of the offset (c - n)
      for (let q = 1; q <= 8; q++) if (DI[q] === -DI[d] && DJ[q] === -DJ[d]) { dir[n] = q; break; }
      h.push(F[n], n);
    }
  }
  // accumulation in reverse processing order (upstream first)
  const acc = new Float32Array(N).fill(1);
  for (let x = N - 1; x >= 0; x--) { const c = order[x]; if (recv[c] >= 0 && !sea[c]) acc[recv[c]] += acc[c]; }
  return { E, F, sea, recv, dir, acc, order };
}

// Depressions (instängda områden): 8-connected cells where the filled surface lies above the terrain
export function findSinks(t, minDepth = 0.25) {
  const { E, F, sea, acc } = t, depth = new Float32Array(N), comp = new Int32Array(N).fill(-1), sinks = [];
  for (let k = 0; k < N; k++) depth[k] = sea[k] ? 0 : F[k] - E[k];
  for (let k = 0; k < N; k++) {
    if (comp[k] >= 0 || depth[k] < minDepth) continue;
    const cells = [], st = [k]; comp[k] = sinks.length;
    while (st.length) {
      const c = st.pop(); cells.push(c);
      const ci = c % NX, cj = (c / NX) | 0;
      for (let d = 1; d <= 8; d++) {
        const ni = ci + DI[d], nj = cj + DJ[d]; if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
        const n = nj * NX + ni; if (comp[n] < 0 && depth[n] > 0.02 && !sea[n]) { comp[n] = sinks.length; st.push(n); }
      }
    }
    let vol = 0, maxD = 0, cx = 0, cy = 0, maxAcc = 0, deepest = cells[0];
    for (const c of cells) { vol += depth[c] * CELL_M2; if (depth[c] > maxD) { maxD = depth[c]; deepest = c; } cx += c % NX; cy += (c / NX) | 0; maxAcc = Math.max(maxAcc, acc[c]); }
    sinks.push({ cells, vol, maxD, area: cells.length * CELL_M2, ci: cx / cells.length, cj: cy / cells.length, catchment: maxAcc * CELL_M2, deepest, spill: F[deepest] });
  }
  return { sinks, depth };
}
