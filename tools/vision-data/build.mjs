// Builds public/data/vision.js + public/data/vision-grid.png for "Hydra – visionen".
// Real inputs: terrain (AWS Terrain Tiles) and streets (OpenStreetMap). Everything VA-related
// (ledningar, anläggningar, år, material, exploateringsområden) is INVENTED, but placed with the terrain:
// reservoarer on high ground, reningsverk low by the recipient, pumpstationer where gravity can't carry,
// tryck = reservoarens nivå − markhöjd, dagvatten sized against the natural catchment.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { BB, DLAT, DLNG, TOWNS } from './common.mjs';
import { buildTerrain, findSinks, elevAt, NX, NY, N, CELL_M2, cellOf, cellLat, cellLng, DI, DJ } from './terrain.mjs';

const OUT = process.argv[2] || '../../public/data';
const R = 6371000, rad = Math.PI / 180;
const dist = (a, b) => { const x = (b.lng - a.lng) * rad * Math.cos((a.lat + b.lat) / 2 * rad), y = (b.lat - a.lat) * rad; return Math.sqrt(x * x + y * y) * R; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000; };
const r1 = v => Math.round(v * 10) / 10, r5 = v => Math.round(v * 1e5) / 1e5;

// ---------- Google polyline encoding ----------
function enc(pts) {
  let out = '', pl = 0, pg = 0;
  const e = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const p of pts) { const la = Math.round(p.lat * 1e5), lg = Math.round(p.lng * 1e5); out += e(la - pl) + e(lg - pg); pl = la; pg = lg; }
  return out;
}
// Douglas–Peucker in metres
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  const xy = pts.map(p => [p.lng * rad * R * Math.cos(56 * rad), p.lat * rad * R]);
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) { const t = Math.max(0, Math.min(1, ((xy[i][0] - ax) * dx + (xy[i][1] - ay) * dy) / L)); const d = Math.hypot(xy[i][0] - ax - t * dx, xy[i][1] - ay - t * dy); if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

console.time('terrain');
const T = buildTerrain();
const { E, sea, acc, dir } = T;
console.timeEnd('terrain');
const elev = p => Math.max(0, elevAt(p.lat, p.lng));
const nearSea = (p, m) => { const c = cellOf(p.lat, p.lng); if (c < 0) return true; const k = Math.ceil(m / 100), ci = c % NX, cj = (c / NX) | 0; for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) { const i = ci + a, j = cj + b; if (i >= 0 && j >= 0 && i < NX && j < NY && sea[j * NX + i]) return true; } return false; };
const accAt = p => { const c = cellOf(p.lat, p.lng); return c < 0 ? 0 : acc[c]; };

// ---------- grid image for the client: grey value = D8 flow direction 1..8 (0 = sea/none) ----------
// (the client rebuilds the accumulation from the directions)
{
  const data = Buffer.alloc(N * 4);
  for (let k = 0; k < N; k++) { const v = sea[k] ? 0 : dir[k]; data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = v; data[k * 4 + 3] = 255; }
  fs.writeFileSync(OUT + '/vision-grid.png', PNG.sync.write({ width: NX, height: NY, data }, { colorType: 0, inputColorType: 6 }));
}

// ---------- streams (rinnvägar) ----------
const STREAM = 80; // cells ≈ 0.8 km² contributing area
const tierOf = a => a < 400 ? 1 : a < 2000 ? 2 : a < 10000 ? 3 : 4;
const streams = [];
{
  const isS = new Uint8Array(N), hasUp = new Uint8Array(N), seen = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (!sea[k] && acc[k] >= STREAM) isS[k] = 1;
  for (let k = 0; k < N; k++) if (isS[k] && T.recv[k] >= 0) hasUp[T.recv[k]] = 1;
  const pt = k => ({ lat: cellLat((k / NX) | 0), lng: cellLng(k % NX) });
  for (let k = 0; k < N; k++) {
    if (!isS[k] || hasUp[k]) continue;
    let c = k, pts = [pt(c)], tier = tierOf(acc[c]);
    seen[c] = 1;
    for (;;) {
      const n = T.recv[c];
      if (n < 0) break;
      const nt = tierOf(acc[n]);
      pts.push(pt(n));
      if (nt !== tier || seen[n] || sea[n] || !isS[n]) {
        streams.push({ pts, tier });
        if (seen[n] || sea[n] || !isS[n]) break;
        pts = [pt(n)]; tier = nt;
      }
      seen[n] = 1; c = n;
    }
  }
}
const streamsOut = streams.map(s => ({ p: enc(simplify(s.pts, 45)), t: s.tier })).filter(s => s.p.length > 4);
console.log('streams', streamsOut.length);

// ---------- streets → town networks ----------
const towns = TOWNS.map(t => ({ ...t }));
function loadWays(f) { return JSON.parse(fs.readFileSync(f, 'utf8')).elements.filter(e => e.type === 'way' && e.geometry && e.geometry.length > 1); }
const CLS = { motorway: 5, trunk: 5, primary: 4, secondary: 3, tertiary: 2, unclassified: 1, residential: 1, living_street: 1 };

// ---------- facilities per town (sited from the terrain) ----------
const facilities = [];
const fac = (o) => { o.elev = r1(elev(o)); o.lat = r5(o.lat); o.lng = r5(o.lng); facilities.push(o); return o; };
function cellsWithin(c, r, f) {
  const out = [];
  const dj = Math.ceil(r / (DLAT * 111320)), di = Math.ceil(r / (DLNG * 111320 * Math.cos(c.lat * rad)));
  const k0 = cellOf(c.lat, c.lng), ci = k0 % NX, cj = (k0 / NX) | 0;
  for (let j = cj - dj; j <= cj + dj; j++) for (let i = ci - di; i <= ci + di; i++) {
    if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
    const k = j * NX + i, p = { lat: cellLat(j), lng: cellLng(i) }, d = dist(c, p);
    if (d <= r && !sea[k] && (!f || f(p, k, d))) out.push({ k, p, d });
  }
  return out;
}
const argmax = (arr, f) => arr.reduce((b, x) => (b === null || f(x) > f(b) ? x : b), null);

for (const t of towns) {
  const ways = loadWays(`osm/town-${t.id}.json`);
  // node density, used to find the built-up core and greenfield edges
  const nodes = []; ways.forEach(w => w.geometry.forEach(g => nodes.push({ lat: g.lat, lng: g.lon })));
  t.ways = ways; t.nodes = nodes;
  const north = cellsWithin(t, t.r * 0.95, p => p.lat > t.lat), south = cellsWithin(t, t.r * 0.95, p => p.lat <= t.lat);
  // highest ground, but no more than ~55 m above the town centre (a real reservoir zone; Båstad otherwise ends up on Hallandsåsen)
  const e0 = E[cellOf(t.lat, t.lng)], hi = arr => argmax(arr.filter(x => E[x.k] <= e0 + 55), x => E[x.k] - x.d * 0.004) || argmax(arr, x => -Math.abs(E[x.k] - e0 - 40));
  const rn = hi(north) || hi(south), rs = hi(south) || hi(north);
  t.resN = fac({ id: t.id + '-resn', town: t.id, type: 'reservoar', name: 'Reservoar Norra', lat: rn.p.lat, lng: rn.p.lng });
  t.resS = fac({ id: t.id + '-ress', town: t.id, type: 'reservoar', name: 'Reservoar Södra', lat: rs.p.lat, lng: rs.p.lng });
  // vattentorn/reservoar water level: ground + 28 m
  t.resN.head = r1(t.resN.elev + 28); t.resS.head = r1(t.resS.elev + 28);
  // reningsverk: low ground at the recipient (sea or a large stream), towards the town edge
  const arvC = cellsWithin(t, t.r * 1.35, (p, k, d) => d > t.r * 0.35 && (nearSea(p, 250) || acc[k] > 1500));
  const arv = argmax(arvC, x => -E[x.k] - Math.abs(x.d - t.r * 0.9) * 0.004) || argmax(cellsWithin(t, t.r * 1.5), x => -E[x.k]);
  t.arv = fac({ id: t.id + '-arv', town: t.id, type: 'arv', name: t.name + ' ARV', lat: arv.p.lat, lng: arv.p.lng, cap: Math.round(t.prod * 1.1) });
  // vattenverk: inland edge, mid elevation (grundvatten/ytvatten intake)
  const vvC = cellsWithin(t, t.r * 1.3, (p, k, d) => d > t.r * 0.7 && !nearSea(p, 1200));
  const vv = argmax(vvC, x => -Math.abs(E[x.k] - (E[t.resN.k0 = cellOf(t.lat, t.lng)] + 15)) * 0.2 - Math.abs(x.d - t.r) * 0.003 + hash(t.id + x.k) * 2) || rn;
  t.vv = fac({ id: t.id + '-vv', town: t.id, type: 'vattenverk', name: t.name + ' Vattenverk', lat: vv.p.lat, lng: vv.p.lng, cap: Math.round(t.prod * 1.3) });
}

// ---------- town pipe networks ----------
const streets = [];
for (const t of towns) {
  const head = p => { const a = dist(p, t.resN), b = dist(p, t.resS); return a < b ? { h: t.resN.head - a * 0.0012, res: t.resN } : { h: t.resS.head - b * 0.0012, res: t.resS }; };
  const sectors = t.r > 2000 ? 6 : 3, SECT = ['N', 'NO', 'SO', 'S', 'SV', 'NV'];
  const dmaName = a => sectors === 6 ? SECT[a] : ['Norr', 'Öst', 'Väst'][a];
  for (const w of t.ways) {
    const cls = CLS[w.tags.highway] || 1;
    const pts0 = w.geometry.map(g => ({ lat: g.lat, lng: g.lon }));
    if (!pts0.some(p => dist(p, t) < t.r)) continue;
    const pts = simplify(pts0, 6);
    const mid = pts[Math.floor(pts.length / 2)], a = pts[0], b = pts[pts.length - 1];
    const d = dist(mid, t), rel = d / t.r, len = pts0.reduce((s, p, i) => i ? s + dist(pts0[i - 1], p) : 0, 0);
    if (len < 25) continue;
    const ang = (Math.atan2(mid.lat - t.lat, (mid.lng - t.lng) * Math.cos(t.lat * rad)) * 180 / Math.PI + 360 + 90) % 360; // 0 = north... (rotated)
    const dma = Math.floor(((450 - ang) % 360) / (360 / sectors)) % sectors;
    const hr = hash(w.id);
    const year = Math.round(rel < 0.35 ? 1925 + hr * 38 : rel < 0.7 ? 1952 + hr * 35 : 1972 + hr * 50);
    const em = elev(mid), ea = elev(a), eb = elev(b);
    const hd = head(mid);
    let pr = hd.h - em, prv = false; // m vattenpelare
    // too much pressure in the low parts → tryckreducerad zon (PRV), like a real network
    if (pr > 72) { prv = r1(pr); pr = Math.min(60, 48 + (pr - 72) * 0.15); }
    const mat = year < 1955 ? 'Gjutjärn' : year < 1972 ? 'Segjärn' : year < 1990 ? 'PVC' : 'PE';
    const dim = cls >= 4 ? 400 : cls === 3 ? 300 : cls === 2 ? 200 : 160;
    // spill/dag: gravity along the street, flow towards the lower end
    const slope = Math.abs(ea - eb) / len * 1000; // ‰
    const flow = ea >= eb ? 1 : -1;
    const lowEnd = flow > 0 ? b : a;
    const catchCells = Math.min(accAt(lowEnd), 400); // natural catchment at the low end (cells of 1 ha), capped for street scale
    const dagYear = Math.round(year + 5 + hr * 10);
    const dagDesign = dagYear < 1970 ? 22 : dagYear < 2000 ? 30 : 42; // mm/h the pipe was sized for
    const spMat = year < 1965 ? 'Betong' : year < 1990 ? 'PVC' : 'PP';
    const ageRisk = Math.min(1, (2026 - year) / 100), matRisk = { Gjutjärn: 1, Segjärn: 0.55, PVC: 0.35, PE: 0.12 }[mat];
    const risk = Math.round(Math.min(100, (ageRisk * 55 + matRisk * 30 + Math.max(0, pr - 55) * 0.6 + (cls >= 3 ? 10 : 0)) * (0.85 + hr * 0.3)));
    streets.push({ t: t.id, p: enc(pts), c: cls, l: Math.round(len), dm: dma, dmn: dmaName(dma), e: r1(em),
      dr: { y: year, m: mat, d: dim, pr: r1(pr), rk: risk, z: hd.res.id, pr0: prv || undefined },
      sp: { y: year, m: spMat, d: cls >= 3 ? 400 : 225, s: r1(slope), f: flow },
      dg: { y: dagYear, m: dagYear < 1995 ? 'Betong' : 'PP', d: cls >= 3 ? 600 : 300, a: catchCells, ds: dagDesign, f: flow } });
  }
  // pressure zones: streets under 2,2 bar get a tryckstegringsstation (booster) at their lowest-pressure cluster
  const low = streets.filter(s => s.t === t.id && s.dr.pr < 22);
  t.lowPressure = low.length;
  if (low.length) {
    // centroid of the low-pressure streets → booster at the street node nearest to the centroid but on the tower side
    const dec = s => { const p = s.p; let i = 0, la = 0, lg = 0; const out = []; while (i < p.length) { let b, sh = 0, r = 0; do { b = p.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); la += r & 1 ? ~(r >> 1) : r >> 1; sh = 0; r = 0; do { b = p.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); lg += r & 1 ? ~(r >> 1) : r >> 1; out.push({ lat: la / 1e5, lng: lg / 1e5 }); } return out; };
    const pts = low.flatMap(dec), c = { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
    const nearest = pts.reduce((b, p) => dist(p, c) < dist(b, c) ? p : b, pts[0]);
    // lift sized for the highest street in the zone (≥ 3 bar there), never above 6,5 bar in the zone
    const lift = Math.min(60, Math.max(25, Math.ceil((30 - Math.min(...low.map(s => s.dr.pr))) / 5) * 5));
    t.booster = fac({ id: t.id + '-tst', town: t.id, type: 'booster', name: 'Tryckstegring ' + t.name, lat: nearest.lat, lng: nearest.lng, lift });
    low.forEach(s => { s.dr.pr0 = s.dr.pr; s.dr.pr = r1(Math.max(28, Math.min(65, s.dr.pr + lift))); s.dr.z = t.booster.id; });
  }
  // central pump station: lowest street point in the core (spillvatten collects here)
  const core = t.nodes.filter(p => dist(p, t) < t.r * 0.5);
  const ps = core.reduce((b, p) => (elev(p) < elev(b) ? p : b), core[0] || t);
  t.pump = fac({ id: t.id + '-ps', town: t.id, type: 'pump', name: 'Pumpstation Central', lat: ps.lat, lng: ps.lng, cap: Math.round(t.prod * 0.7) });
  // bräddpunkt next to the pump station when a recipient is near
  if (nearSea(t.pump, 600) || accAt(t.pump) > 600) fac({ id: t.id + '-br1', town: t.id, type: 'bradd', name: 'Bräddpunkt ' + t.name + ' C', lat: t.pump.lat + 0.0012, lng: t.pump.lng + 0.0016 });
  fac({ id: t.id + '-br2', town: t.id, type: 'bradd', name: 'Bräddpunkt ' + t.name + ' ARV', lat: t.arv.lat + 0.0009, lng: t.arv.lng - 0.0014 });
}
console.log('streets', streets.length, 'facilities', facilities.length);

// ---------- regional trunks routed on the main road network ----------
const main = loadWays('osm/main.json');
const G = new Map(), P = new Map();
for (const w of main) {
  const ids = w.nodes;
  w.geometry.forEach((g, i) => P.set(ids[i], { lat: g.lat, lng: g.lon }));
  for (let i = 1; i < ids.length; i++) {
    const a = ids[i - 1], b = ids[i], d = dist(P.get(a), P.get(b));
    if (!G.has(a)) G.set(a, []); if (!G.has(b)) G.set(b, []);
    G.get(a).push([b, d]); G.get(b).push([a, d]);
  }
}
const pidList = [...G.keys()];
const snap = p => pidList.reduce((b, id) => (dist(P.get(id), p) < dist(P.get(b), p) ? id : b), pidList[0]);
function route(a, b) {
  const s = snap(a), t = snap(b), D = new Map([[s, 0]]), prev = new Map(), H = [[0, s]];
  const push = (d, n) => { H.push([d, n]); let i = H.length - 1; while (i) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  while (H.length) {
    const [d, n] = pop(); if (n === t) break; if (d > D.get(n)) continue;
    for (const [m, w] of G.get(n)) { const nd = d + w; if (nd < (D.has(m) ? D.get(m) : Infinity)) { D.set(m, nd); prev.set(m, n); push(nd, m); } }
  }
  const path = []; let c = t; while (c !== undefined) { path.push(P.get(c)); c = prev.get(c); }
  path.reverse();
  return [a, ...path, b];
}
const byId = Object.fromEntries(towns.map(t => [t.id, t]));
const trunks = [];
const pairs = [['helsingborg', 'bjuv'], ['helsingborg', 'landskrona'], ['bjuv', 'astorp'], ['bjuv', 'svalov'], ['astorp', 'orkelljunga'], ['orkelljunga', 'perstorp'], ['orkelljunga', 'bastad'], ['svalov', 'landskrona'], ['astorp', 'perstorp']];
for (const [a, b] of pairs) {
  const pts = simplify(route(byId[a].vv, byId[b].resN), 20);
  const len = pts.reduce((s, p, i) => i ? s + dist(pts[i - 1], p) : 0, 0);
  trunks.push({ k: 'dricks', name: 'Överföring ' + byId[a].name + '–' + byId[b].name, from: a, to: b, p: enc(pts), len: Math.round(len), st: 'befintlig', y: Math.round(1965 + hash(a + b) * 40), d: 500 });
}
// vision: regional spillvatten — small ARV close, wastewater pumped to the large plants (planned)
const spillPlan = [['astorp', 'bjuv', 2031], ['bjuv', 'helsingborg', 2031], ['svalov', 'landskrona', 2034]];
let psN = 0;
for (const [a, b, yr] of spillPlan) {
  const pts = simplify(route(byId[a].pump, byId[b].arv), 20);
  const len = pts.reduce((s, p, i) => i ? s + dist(pts[i - 1], p) : 0, 0);
  trunks.push({ k: 'spill', name: 'Överföring spillvatten ' + byId[a].name + '–' + byId[b].name, from: a, to: b, p: enc(pts), len: Math.round(len), st: 'planerad', y: yr, d: 400 });
  // pumpstationer where the profile climbs: walk the line, place a station at the low point before each rise > 4 m
  let lowP = pts[0], lowE = elev(pts[0]), walked = 0, lastPs = -1e9;
  for (let i = 1; i < pts.length; i++) {
    walked += dist(pts[i - 1], pts[i]);
    const e = elev(pts[i]);
    if (e < lowE) { lowE = e; lowP = pts[i]; }
    else if (e - lowE > 4 && walked - lastPs > 1500) {
      psN++; lastPs = walked;
      fac({ id: 'tps-' + psN, town: a, type: 'pump', name: 'Tryckavlopp PS ' + psN + ' (' + byId[a].name + '–' + byId[b].name + ')', lat: lowP.lat, lng: lowP.lng, cap: Math.round(byId[a].prod * 0.6), planned: yr, lift: r1(e - lowE) });
      lowE = e; lowP = pts[i];
    }
  }
}
console.log('trunks', trunks.length, 'trunk pump stations', psN);

// ---------- instängda områden (lågpunkter) in and around the towns ----------
const { sinks } = findSinks(T);
const sinksOut = [];
for (const s of sinks) {
  const c = { lat: BB.n - (s.cj + 0.5) * DLAT, lng: BB.w + (s.ci + 0.5) * DLNG };
  const t = towns.find(t => dist(c, t) < t.r * 1.15);
  // urban skyfall scale only: skip tiny pits and big basins (lakes, quarries, valleys)
  if (!t || s.vol < 1500 || s.vol > 3e5 || s.maxD < 0.35 || s.area > 1.2e6) continue;
  let i0 = 1e9, j0 = 1e9; s.cells.forEach(k => { i0 = Math.min(i0, k % NX); j0 = Math.min(j0, (k / NX) | 0); });
  const cells = [];
  s.cells.forEach(k => { const d = T.F[k] - E[k]; if (d > 0.02) cells.push(k % NX - i0, ((k / NX) | 0) - j0, Math.round(d * 100)); });
  sinksOut.push({ id: 'lp-' + sinksOut.length, town: t.id, lat: r5(c.lat), lng: r5(c.lng), vol: Math.round(s.vol), area: Math.round(s.area), maxD: r1(s.maxD), catch: Math.round(s.catchment), i0, j0, cells });
}
sinksOut.sort((a, b) => b.vol - a.vol);
sinksOut.forEach((s, i) => { s.id = 'lp-' + (i + 1); s.name = 'Lågpunkt ' + byId[s.town].name + ' ' + (sinksOut.filter((x, j) => j <= i && x.town === s.town).length); });
console.log('town sinks', sinksOut.length, Object.entries(sinksOut.reduce((m, s) => (m[s.town] = (m[s.town] || 0) + 1, m), {})).map(x => x.join(':')).join(' '));

// ---------- exploateringsområden (fiktiva) at greenfield edges ----------
const dev = [];
const devCount = { helsingborg: 3, landskrona: 2 };
const KIND = ['Bostäder', 'Bostäder', 'Verksamheter', 'Blandad stad'];
for (const t of towns) {
  const n = devCount[t.id] || 1, used = [];
  const cands = [];
  for (let a = 0; a < 360; a += 15) for (const f of [1.05, 1.25, 1.45]) {
    const p = { lat: t.lat + Math.cos(a * rad) * t.r * f / 111320, lng: t.lng + Math.sin(a * rad) * t.r * f / (111320 * Math.cos(t.lat * rad)) };
    const k = cellOf(p.lat, p.lng); if (k < 0 || sea[k] || nearSea(p, 500)) continue;
    const dens = t.nodes.filter(q => Math.abs(q.lat - p.lat) < 0.005 && Math.abs(q.lng - p.lng) < 0.008 && dist(q, p) < 450).length;
    const near = t.nodes.filter(q => Math.abs(q.lat - p.lat) < 0.012 && Math.abs(q.lng - p.lng) < 0.02 && dist(q, p) < 1100).length;
    if (near < 15) continue; // must border the town
    cands.push({ p, a, score: dens - near * 0.05 + hash(t.id + a) * 3 });
  }
  cands.sort((x, y) => x.score - y.score);
  for (const c of cands) {
    if (used.length >= n) break;
    if (used.some(u => dist(u.p, c.p) < 1600)) continue;
    used.push(c);
    const rr = 330 + hash(t.id + c.a + 'r') * 220, poly = [];
    for (let i = 0; i < 9; i++) { const aa = i * 40 * rad + hash(t.id + i) * 0.3, rj = rr * (0.8 + hash(c.a + 'j' + i) * 0.4); poly.push({ lat: c.p.lat + Math.cos(aa) * rj / 111320, lng: c.p.lng + Math.sin(aa) * rj / (111320 * Math.cos(t.lat * rad)) }); }
    const inside = cellsWithin(c.p, rr * 1.05);
    const es = inside.map(x => E[x.k]); const eMin = Math.min(...es), eMax = Math.max(...es);
    const rinn = inside.some(x => acc[x.k] >= STREAM), rinnMax = Math.max(...inside.map(x => acc[x.k]));
    const sinkHits = sinksOut.filter(s => dist(s, c.p) < rr * 1.1);
    const hd = Math.max(dist(c.p, t.resN) < dist(c.p, t.resS) ? t.resN.head : t.resS.head);
    const kind = KIND[Math.floor(hash(t.id + c.a + 'k') * KIND.length)];
    const units = kind === 'Verksamheter' ? 0 : Math.round(rr * rr * Math.PI / 1e4 * (kind === 'Blandad stad' ? 45 : 28) / 10) * 10;
    const idx = dev.filter(d => d.town === t.id).length + 1;
    const dir8 = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst'][Math.round(c.a / 45) % 8];
    dev.push({ id: 'ex-' + t.id + '-' + idx, town: t.id, name: t.name + ' ' + dir8 + ' · etapp ' + idx, kind, units, jobs: kind === 'Bostäder' ? 0 : Math.round(rr * rr * Math.PI / 1e4 * 18),
      year: 2028 + Math.round(hash(t.id + idx) * 10), lat: r5(c.p.lat), lng: r5(c.p.lng), p: enc([...poly, poly[0]]),
      eMin: r1(eMin), eMax: r1(eMax), prMin: r1(hd - eMax - dist(c.p, t.resN) * 0.0012), prMax: r1(hd - eMin), rinn, rinnKm2: r1(rinnMax * CELL_M2 / 1e6), sinks: sinkHits.map(s => s.id), sinkVol: sinkHits.reduce((s, x) => s + x.vol, 0),
      area: Math.round(rr * rr * Math.PI) });
  }
}
console.log('dev areas', dev.length);

const out = {
  v: 1, built: new Date().toISOString().slice(0, 10),
  src: { terrain: 'AWS Terrain Tiles (Mapzen terrarium · bl.a. EU-DEM/SRTM), 100 m rutnät', streets: '© OpenStreetMap-bidragsgivare (ODbL)', note: 'Ledningar, anläggningar, år, material och exploateringsområden är påhittade för visionen.' },
  grid: { nx: NX, ny: NY, s: BB.s, n: BB.n, w: BB.w, e: BB.e, dlat: DLAT, dlng: DLNG, cellM2: Math.round(CELL_M2), stream: STREAM },
  towns: towns.map(t => ({ id: t.id, name: t.name, lat: t.lat, lng: t.lng, r: t.r, prod: t.prod, lowPressure: t.lowPressure || 0 })),
  facilities, trunks, streams: streamsOut, sinks: sinksOut, dev,
  // one row per street pipe; material/dimension/design rain are derived from year + class in the client
  streetCols: ['town', 'poly', 'cls', 'len', 'dma', 'elev', 'year', 'pressure', 'risk', 'zone', 'slope', 'flow', 'catch', 'dagYear', 'pressure0'],
  streets: streets.map(s => [towns.findIndex(t => t.id === s.t), s.p, s.c, s.l, s.dm, s.e, s.dr.y, s.dr.pr, s.dr.rk, facilities.findIndex(f => f.id === s.dr.z), s.sp.s, s.sp.f, s.dg.a, s.dg.y, s.dr.pr0 == null ? null : s.dr.pr0]),
};
const js = '// Genererad av tools/vision-data/build.mjs — rör inte för hand.\nwindow.NSVA_VISION = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(OUT + '/vision.js', js);
console.log('vision.js', Math.round(js.length / 1024), 'KB', ' grid png', Math.round(fs.statSync(OUT + '/vision-grid.png').size / 1024), 'KB');
