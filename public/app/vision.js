// Hydra – visionen: en digital tvilling för hela NSVA ovanpå huvudkartan.
// Terräng (verklig höjdmodell) styr rinnvägar, lågpunkter, tryck och var anläggningarna ligger;
// ledningsnät, anläggningsdata och exploateringsområden är påhittade (se data/vision.js).
// Mounted by the dashboard component (logic.js) when view === 'vision'; owns its own DOM in the
// left column + a HUD over the map, and its own Leaflet layers on the shared map.
(function () {
  'use strict';
  const DATA_SRC = 'data/vision.js', GRID_SRC = 'data/vision-grid.png';
  const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const DI = [0, 1, 1, 0, -1, -1, -1, 0, 1], DJ = [0, 0, 1, 1, 1, 0, -1, -1, -1];

  // ---------- scenario & domain constants ----------
  const YEARS = [2026, 2035, 2050, 2100];
  // klimatfaktor på korttidsnederbörd (Svenskt Vatten P110), medelhavsnivåhöjning relativt idag (m), vatten per person och dygn
  const SCEN = {
    2026: { clim: 1.0, sea: 0.0, lpd: 140, txt: 'Dagens läge' },
    2035: { clim: 1.1, sea: 0.06, lpd: 132, txt: 'Nära framtid' },
    2050: { clim: 1.2, sea: 0.17, lpd: 122, txt: 'Klimatfaktor 1,2' },
    2100: { clim: 1.3, sea: 0.65, lpd: 115, txt: 'Långsiktig planering' },
  };
  const SURGE = 1.6; // 100-årshögvatten i Öresund ≈ +1,6 m
  const IMPORT = 3200; // m³/h regional reservförsörjning (sammankoppling med grannar/regionalt bolag)
  // invånare (ca, 2025) och årlig tillväxt
  const POP = { helsingborg: [151000, 0.010], landskrona: [46500, 0.007], bastad: [15600, 0.006], bjuv: [16100, 0.006], astorp: [16300, 0.006], svalov: [14600, 0.005], orkelljunga: [10700, 0.004], perstorp: [7600, 0.003] };
  const LENSES = [
    { id: 'oversikt', label: 'Översikt', ic: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' },
    { id: 'produktion', label: 'Produktion', ic: '<path d="M12 2.7s-6 6.7-6 11a6 6 0 0 0 12 0c0-4.3-6-11-6-11z"/>' },
    { id: 'distribution', label: 'Distribution', ic: '<path d="M4 6h10a3 3 0 0 1 3 3v9"/><path d="M2 6h2M17 20v2M14 18h6"/><circle cx="9" cy="6" r="1.5"/>' },
    { id: 'samhalle', label: 'Samhällsutveckling', ic: '<path d="M3 21h18M5 21V10l5-3v14M10 21V4l9 4v13M14 9h1M14 12h1M14 15h1"/>' },
  ];
  const PRESETS = [
    { id: 'live', label: 'Live', sub: 'SMHI/DMI-prognos' },
    { id: 'kraftigt', label: 'Kraftigt', vol: 15, sub: '15 mm / 3 h' },
    { id: 'r10', label: '10-år', vol: 32, sub: '≈ 32 mm / 3 h' },
    { id: 'r100', label: '100-år', vol: 60, sub: '≈ 60 mm / 3 h' },
    { id: 'extrem', label: 'Extremt', vol: 100, sub: '≈ 100 mm / 3 h' },
  ];
  const SIM_MIN = 180; // simulerad tid, minuter
  const COL = { dricks: '#4aa8ff', spill: '#e0a050', dag: '#3fd6a0', ok: '#2fe6c4', warn: '#ffb547', bad: '#ff5a6e', vio: '#c9b6ff', water: '#3fa9ff' };
  const NETS = [{ id: 'dricks', label: 'Dricksvatten' }, { id: 'spill', label: 'Spillvatten' }, { id: 'dag', label: 'Dagvatten' }, { id: 'none', label: 'Av' }];
  const COLOR_MODES = {
    dricks: [['typ', 'Typ'], ['alder', 'Ålder'], ['material', 'Material'], ['tryck', 'Tryck'], ['risk', 'Risk']],
    spill: [['typ', 'Typ'], ['alder', 'Ålder'], ['material', 'Material'], ['lutning', 'Lutning'], ['belastning', 'Belastning']],
    dag: [['typ', 'Typ'], ['alder', 'Ålder'], ['material', 'Material'], ['belastning', 'Belastning']],
    none: [],
  };
  const LENS_PRESET = {
    oversikt: { net: 'dricks', color: 'typ', layers: { terrain: true, streams: true, sinks: true, fac: true, dev: true, trunks: true, sea: false, flow: true, leaks: false } },
    produktion: { net: 'dricks', color: 'tryck', layers: { terrain: true, streams: false, sinks: false, fac: true, dev: false, trunks: true, sea: false, flow: false, leaks: false } },
    distribution: { net: 'dricks', color: 'risk', layers: { terrain: true, streams: false, sinks: false, fac: true, dev: false, trunks: true, sea: false, flow: false, leaks: true } },
    samhalle: { net: 'dag', color: 'belastning', layers: { terrain: true, streams: true, sinks: true, fac: false, dev: true, trunks: true, sea: true, flow: true, leaks: false } },
  };
  const LAYER_DEFS = [
    ['terrain', 'Terräng (höjdmodell)', '#8fb4a0'], ['streams', 'Rinnvägar', COL.water], ['sinks', 'Instängda lågpunkter', COL.vio],
    ['flow', 'Regnets väg (partiklar)', '#9fdcff'], ['trunks', 'Överföringsledningar', COL.dricks], ['fac', 'Anläggningar', '#eaf7fb'],
    ['leaks', 'Läckor (DMA)', COL.bad], ['dev', 'Exploateringsområden', '#ffce7a'], ['sea', 'Havsnivå + högvatten', '#5aa0ff'],
  ];

  // ---------- small helpers ----------
  const nf = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000; };
  const kmDist = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371; };
  function decode(str) {
    const out = []; let i = 0, la = 0, lg = 0;
    while (i < str.length) {
      let b, sh = 0, r = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); la += r & 1 ? ~(r >> 1) : r >> 1;
      sh = 0; r = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32); lg += r & 1 ? ~(r >> 1) : r >> 1;
      out.push([la / 1e5, lg / 1e5]);
    }
    return out;
  }
  const lerpC = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  function ramp(stops, v) { // stops: [[value, [r,g,b]], ...]
    if (v <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) return lerpC(stops[i - 1][1], stops[i][1], (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    return stops[stops.length - 1][1];
  }
  const rgb = c => 'rgb(' + c.join(',') + ')';
  const svgIc = (path, size = 15, col = 'currentColor') => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + col + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';

  // material/dimension rules (same eras as the data build)
  const matDricks = y => y < 1955 ? 'Gjutjärn' : y < 1972 ? 'Segjärn' : y < 1990 ? 'PVC' : 'PE';
  const matSpill = y => y < 1965 ? 'Betong' : y < 1990 ? 'PVC' : 'PP';
  const matDag = y => y < 1995 ? 'Betong' : 'PP';
  const LIFE = { Gjutjärn: 90, Segjärn: 100, PVC: 90, PE: 100, Betong: 90, PP: 100 };
  const dagDesign = y => y < 1970 ? 22 : y < 2000 ? 30 : 42;

  // ---------- module state ----------
  let ctx = null, D = null, S = null, L = null, map = null;
  let layers = {}, timers = [], raf = 0, mountSeq = 0;

  function popAt(id, year) {
    const [p, g] = POP[id] || [10000, 0.005], y = year - 2026;
    return p * Math.pow(1 + g, Math.min(y, 40)) * Math.pow(1 + g * 0.3, Math.max(0, y - 40));
  }
  const popF = (id, year) => popAt(id, year) / popAt(id, 2026);
  const seaLevelM = () => SCEN[S.year].sea + (S.surge ? SURGE : 0) + (S.year === 2026 && ctx && ctx.seaCm ? Math.max(0, (ctx.seaCm() || 0) / 100) : 0);

  // ---------- data loading ----------
  let dataPromise = null;
  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = new Promise((res, rej) => {
      const go = () => {
        const img = new Image();
        img.onload = () => {
          const V = window.NSVA_VISION, c = document.createElement('canvas');
          c.width = V.grid.nx; c.height = V.grid.ny;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
          const px = g.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height, dir = new Uint8Array(n);
          for (let k = 0; k < n; k++) dir[k] = px[k * 4];
          res(prepare(V, dir));
        };
        img.onerror = rej; img.src = GRID_SRC;
      };
      if (window.NSVA_VISION) return go();
      const s = document.createElement('script'); s.src = DATA_SRC; s.onload = go; s.onerror = rej; document.head.appendChild(s);
    });
    return dataPromise;
  }

  function prepare(V, dir) {
    const G = V.grid, nx = G.nx, ny = G.ny, n = nx * ny;
    // receivers + accumulation from the D8 directions (Kahn order: sources first)
    const recv = new Int32Array(n).fill(-1), indeg = new Uint16Array(n), acc = new Float32Array(n).fill(1);
    for (let k = 0; k < n; k++) { const d = dir[k]; if (!d) continue; const i = k % nx + DI[d], j = ((k / nx) | 0) + DJ[d]; if (i >= 0 && j >= 0 && i < nx && j < ny) { recv[k] = j * nx + i; indeg[recv[k]]++; } }
    const q = new Int32Array(n); let qh = 0, qt = 0;
    for (let k = 0; k < n; k++) if (!indeg[k]) q[qt++] = k;
    while (qh < qt) { const k = q[qh++], r = recv[k]; if (r >= 0) { acc[r] += acc[k]; if (--indeg[r] === 0) q[qt++] = r; } }
    const towns = V.towns.map(t => Object.assign({}, t));
    const tById = Object.fromEntries(towns.map(t => [t.id, t]));
    const fac = V.facilities.map(f => Object.assign({}, f));
    const fById = Object.fromEntries(fac.map(f => [f.id, f]));
    const streets = V.streets.map((r, idx) => {
      const o = { idx }; V.streetCols.forEach((c, i) => { o[c] = r[i]; });
      o.town = towns[o.town].id; o.zone = fac[o.zone] ? fac[o.zone].id : null; o.pts = decode(o.poly);
      o.mat = matDricks(o.year); o.dim = o.cls >= 4 ? 400 : o.cls === 3 ? 300 : o.cls === 2 ? 200 : 160;
      o.spMat = matSpill(o.year); o.spDim = o.cls >= 3 ? 400 : 225;
      o.dagMat = matDag(o.dagYear); o.dagDim = o.cls >= 3 ? 600 : 300; o.design = dagDesign(o.dagYear);
      o.dmaId = o.town + ':' + o.dma;
      o.dmn = tById[o.town].r > 2000 ? ['N', 'NO', 'SO', 'S', 'SV', 'NV'][o.dma] : ['Norr', 'Öst', 'Väst'][o.dma];
      return o;
    });
    const sinks = V.sinks.map(s => {
      const cells = []; let w = 0, h = 0;
      for (let i = 0; i < s.cells.length; i += 3) { const ci = s.cells[i], cj = s.cells[i + 1]; cells.push([ci, cj, s.cells[i + 2] / 100]); w = Math.max(w, ci + 1); h = Math.max(h, cj + 1); }
      return Object.assign({}, s, { cells, w, h, V: 0, peak: 0 });
    });
    const dev = V.dev.map(d => Object.assign({}, d, { pts: decode(d.p) }));
    const trunks = V.trunks.map(t => Object.assign({}, t, { pts: decode(t.p) }));
    const chaikin = pts => { for (let it = 0; it < 2; it++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(pts[pts.length - 1]); pts = o; } return pts; };
    const streams = V.streams.map(s => ({ t: s.t, pts: chaikin(decode(s.p)) }));
    // DMA (district metered areas) per town sector
    const dmas = {};
    streets.forEach(s => {
      const d = dmas[s.dmaId] || (dmas[s.dmaId] = { id: s.dmaId, town: s.town, name: tById[s.town].name + ' ' + s.dmn, len: 0, ageSum: 0, riskSum: 0, n: 0, worst: null });
      d.len += s.len; d.ageSum += (2026 - s.year) * s.len; d.riskSum += s.risk * s.len; d.n++;
      if (!d.worst || s.risk > d.worst.risk) d.worst = s;
    });
    Object.values(dmas).forEach(d => {
      d.age = d.ageSum / d.len; d.risk = d.riskSum / d.len;
      d.mnf = d.len / 1000 * (0.05 + d.risk / 1000) * (0.85 + hash(d.id) * 0.4); // minsta nattflöde l/s
      d.leak = hash(d.id + 'leak') > 0.72 && d.risk > 30;
      d.leakLs = d.leak ? 0.6 + hash(d.id + 'q') * 2.4 : 0;
    });
    return { V, G, dir, recv, acc, towns, tById, fac, fById, streets, sinks, dev, trunks, streams, dmas: Object.values(dmas) };
  }

  // ---------- scenario model ----------
  function model() {
    const y = S.year, sc = SCEN[y];
    const towns = D.towns.map(t => {
      const pf = popF(t.id, y), per = sc.lpd / SCEN[2026].lpd;
      const demand = t.prod * pf * per; // m³/h medel
      const cap = t.prod * 1.5;
      const arvCap = t.prod * 1.1, arvIn = t.prod * 0.78 * pf;
      return { id: t.id, name: t.name, pop: popAt(t.id, y), pf, demand, cap, arvCap, arvIn, arvLoad: arvIn / arvCap };
    });
    const capTot = towns.reduce((s, t) => s + t.cap, 0), dem = towns.reduce((s, t) => s + t.demand, 0);
    const largest = Math.max(...towns.map(t => t.cap)), peak = dem * 1.25;
    const n1Cap = capTot - largest + IMPORT, n1 = n1Cap >= peak;
    // ledningsnät: över teknisk livslängd, minus förnyelse (äldst först)
    const len = D.streets.reduce((s, x) => s + x.len, 0) / 1000;
    const overLife = D.streets.filter(x => x.year + LIFE[x.mat] < y).reduce((s, x) => s + x.len, 0) / 1000;
    const renewToday = len * 0.006 * (y - 2026), renewVision = len * 0.012 * Math.max(0, y - 2028);
    const debtToday = Math.max(0, overLife - renewToday), debtVision = Math.max(0, overLife - renewVision);
    const sea = seaLevelM();
    const lowPipes = D.streets.filter(x => x.elev <= sea + 0.5).reduce((s, x) => s + x.len, 0) / 1000;
    const sinkVol = D.sinks.reduce((s, x) => s + x.vol, 0);
    // Hydra-index 0–100 per område
    const prodScore = clamp(Math.round(100 - Math.max(0, peak / n1Cap - 0.85) * 170 - Math.max(0, dem / capTot - 0.7) * 60), 5, 99);
    const netScore = clamp(Math.round(96 - debtToday / len * 260 - (D.streets.filter(s => s.pressure < 25).length / D.streets.length) * 60), 5, 99);
    const arvMax = Math.max(...towns.map(t => t.arvLoad));
    const spillScore = clamp(Math.round(100 - Math.max(0, arvMax - 0.6) * 150), 5, 99);
    const climScore = clamp(Math.round(92 - (sc.clim - 1) * 120 - lowPipes * 0.8 - sea * 18), 5, 99);
    return { y, sc, towns, capTot, dem, largest, peak, n1, n1Cap, len, overLife, debtToday, debtVision, sea, lowPipes, sinkVol, prodScore, netScore, spillScore, climScore };
  }

  // ---------- simulation ----------
  function hyeto(preset, clim) {
    // 3 h design storm: one sharp burst at ~35 % of the duration on a low background, scaled to the volume
    const p = PRESETS.find(x => x.id === preset), out = new Float32Array(SIM_MIN);
    if (preset === 'live') {
      for (let m = 0; m < SIM_MIN; m++) { const h = m / 60, h0 = Math.floor(h), f = h - h0; out[m] = (ctx.rainAt(h0) * (1 - f) + ctx.rainAt(h0 + 1) * f); }
      return out;
    }
    let s = 0; for (let m = 0; m < SIM_MIN; m++) { const x = (m - SIM_MIN * 0.35) / 14; out[m] = Math.exp(-x * x / 2) + 0.18 * Math.exp(-(((m - SIM_MIN * 0.35) / 50) ** 2) / 2) + 0.03; s += out[m] / 60; }
    for (let m = 0; m < SIM_MIN; m++) out[m] = out[m] / s * p.vol * clim;
    return out;
  }
  function resetSim() {
    S.sim.t = 0; S.sim.overflow = {}; S.sim.overflowM3 = 0; S.sim.rainSum = 0;
    D.sinks.forEach(s => { s.V = 0; s.peak = 0; s.lv = null; });
    S.sim.series = hyeto(S.sim.preset, S.sim.preset === 'live' ? 1 : SCEN[S.year].clim);
  }
  const rainNowSim = () => S.sim.series ? S.sim.series[Math.min(SIM_MIN - 1, Math.floor(S.sim.t))] : 0;
  // effective intensity used for loads: simulated while a run is active, otherwise live
  const intensity = () => (S.sim.running || S.sim.t > 0) ? rainNowSim() : (ctx.rainNow ? ctx.rainNow() : 0);
  function sinkLevel(s) { // water depth below the spill level (h) for the stored volume V
    const A = D.G.cellM2, full = s.cells.reduce((a, c) => a + c[2] * A, 0);
    if (s.V <= 0) return null;
    if (s.V >= full) return 0;
    let lo = 0, hi = s.maxD;
    for (let it = 0; it < 22; it++) { const h = (lo + hi) / 2, v = s.cells.reduce((a, c) => a + Math.max(0, c[2] - h) * A, 0); if (v > s.V) lo = h; else hi = h; }
    return (lo + hi) / 2;
  }
  function stepSim(dtMin) {
    const i = rainNowSim(); // mm/h
    S.sim.rainSum += i * dtMin / 60;
    const drain = 18; // mm/h som dagvattennätet hinner leda bort från en lågpunkts tillrinningsområde
    D.sinks.forEach(s => {
      const urban = Math.min(s.catch, 2.5e6);
      const inflow = Math.max(0, i - drain) / 1000 / 60 * urban * 0.55 * dtMin; // m³
      const out = (i < drain ? 6 : 0) / 1000 / 60 * s.area * dtMin; // efter regnet: tömning via nät/infiltration
      s.V = Math.max(0, s.V + inflow - out);
      const full = s.vol; if (s.V > full * 1.05) s.V = full * 1.05;
      s.lv = sinkLevel(s); s.peak = Math.max(s.peak, s.V);
    });
    // spillvatten: tillskottsvatten driver inflödet över pumpstationernas kapacitet → bräddning
    const m = model();
    m.towns.forEach(t => {
      const old = D.streets.filter(s => s.town === t.id && s.year < 1965).length / Math.max(1, D.streets.filter(s => s.town === t.id).length);
      const q = t.arvIn * (1 + (0.03 + old * 0.09) * i); // m³/h
      const pumpCap = t.arvIn / t.pf * 1.7;
      const of = Math.max(0, q - pumpCap);
      S.sim.overflow[t.id] = (S.sim.overflow[t.id] || 0) + of * dtMin / 60;
      S.sim.overflowM3 += of * dtMin / 60;
      S.sim.q = S.sim.q || {}; S.sim.q[t.id] = { q, pumpCap, load: q / pumpCap, arv: Math.min(q, pumpCap) / t.arvCap };
    });
  }

  // ---------- Leaflet layers ----------
  function pane(name, z, cls) {
    let p = map.getPane(name);
    if (!p) { p = map.createPane(name); p.style.zIndex = z; if (cls) p.classList.add(cls); }
    return name;
  }
  function mercY(lat) { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; }

  // terrain: terrarium tiles → hillshade + hypsometric tint + flood below the scenario sea level, drawn per tile
  function drawTerrain(c) {
    const el = c._elev; if (!el || !S) return;
    const g = c.getContext('2d'), img = g.createImageData(256, 256), d = img.data;
    const z = c._z, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (c._y + 0.5) / 2 ** z))) * 180 / Math.PI;
    const mpp = 156543.03 * Math.cos(lat * Math.PI / 180) / 2 ** z, ex = clamp(14 - z, 2, 6) * 1.6;
    const sea = S.layers.sea ? seaLevelM() : -1, lx = -0.55, ly = -0.55, lz = 0.63;
    const HYP = [[0, [14, 52, 62]], [15, [18, 64, 66]], [45, [30, 74, 62]], [90, [62, 82, 60]], [160, [96, 90, 66]]];
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const k = y * 256 + x, e = el[k], p = k * 4;
      if (e <= 0.05) { d[p + 3] = 0; continue; }
      if (e <= sea) { const st = ((x + y) >> 2) & 1; d[p] = 40; d[p + 1] = st ? 130 : 150; d[p + 2] = 255; d[p + 3] = st ? 150 : 175; continue; }
      const xl = el[k - (x > 0 ? 1 : 0)], xr = el[k + (x < 255 ? 1 : 0)], yu = el[k - (y > 0 ? 256 : 0)], yd = el[k + (y < 255 ? 256 : 0)];
      const dx = (xr - xl) / (2 * mpp) * ex, dy = (yd - yu) / (2 * mpp) * ex, nl = Math.sqrt(dx * dx + dy * dy + 1);
      const hs = (-dx * lx - dy * ly + lz) / nl - lz; // 0 on flat ground
      const h = ramp(HYP, e);
      const c = hs >= 0 ? lerpC(h, [175, 228, 242], Math.min(1, hs * 3)) : lerpC(h, [0, 6, 12], Math.min(1, -hs * 3));
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2];
      d[p + 3] = clamp(34 + (hs >= 0 ? hs * 240 : -hs * 330), 0, 170);
    }
    g.putImageData(img, 0, 0);
  }
  function makeTerrain() {
    const Terrain = L.GridLayer.extend({
      createTile(coords, done) {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const t = document.createElement('canvas'); t.width = t.height = 256;
            const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
            const px = g.getImageData(0, 0, 256, 256).data, el = new Float32Array(65536);
            for (let i = 0; i < 65536; i++) el[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
            c._elev = el; c._z = coords.z; c._x = coords.x; c._y = coords.y;
            drawTerrain(c); done(null, c);
          } catch (e) { done(e, c); }
        };
        img.onerror = () => done(new Error('terrain tile'), c);
        img.src = TERRAIN_URL.replace('{z}', coords.z).replace('{x}', coords.x).replace('{y}', coords.y);
        return c;
      },
    });
    return new Terrain({ pane: pane('hvTerrain', 250, 'hv-terrain-pane'), maxNativeZoom: 14, maxZoom: 19, updateWhenZooming: false, keepBuffer: 2, className: 'hv-terrain' });
  }
  function redrawTerrain() { const t = layers.terrain; if (!t || !t._tiles) return; Object.values(t._tiles).forEach(x => drawTerrain(x.el)); }
  function elevAtLatLng(ll) {
    const t = layers.terrain; if (!t || !t._tiles) return null;
    const z = Math.min(14, Math.round(map.getZoom())), n = 2 ** z;
    const X = (ll.lng + 180) / 360 * n * 256, Y = mercY(ll.lat) * n * 256, tx = Math.floor(X / 256), ty = Math.floor(Y / 256);
    const tile = t._tiles[tx + ':' + ty + ':' + z]; if (!tile || !tile.el._elev) return null;
    return tile.el._elev[Math.floor(Y - ty * 256) * 256 + Math.floor(X - tx * 256)];
  }

  // street pipes + streams on canvas renderers, trunks on SVG (animated flow)
  function pipeStyle(s) {
    const net = S.net, mode = S.color, z = map.getZoom();
    const w = (s.cls >= 4 ? 3.2 : s.cls === 3 ? 2.6 : s.cls === 2 ? 2 : 1.4) * (z < 11 ? 0.6 : z < 12.5 ? 0.85 : 1.15);
    let c = COL[net] || '#888';
    const year = net === 'dag' ? s.dagYear : s.year;
    if (mode === 'alder') c = rgb(ramp([[1925, [255, 90, 110]], [1955, [255, 154, 46]], [1975, [255, 214, 90]], [1995, [63, 214, 200]], [2020, [47, 230, 160]]], year));
    else if (mode === 'material') {
      const m = net === 'dricks' ? s.mat : net === 'spill' ? s.spMat : s.dagMat;
      c = ({ Gjutjärn: '#ff5a6e', Segjärn: '#ff9a2e', PVC: '#ffd65a', PE: '#2fe6c4', Betong: '#c9a07a', PP: '#4ad6ff' })[m];
    } else if (mode === 'tryck') {
      const bar = s.pressure / 10;
      c = rgb(ramp([[1.5, [255, 90, 110]], [2.5, [255, 154, 46]], [3.5, [63, 214, 200]], [6, [74, 168, 255]], [7.5, [201, 182, 255]]], bar));
    } else if (mode === 'risk') c = rgb(ramp([[15, [47, 230, 196]], [45, [255, 214, 90]], [70, [255, 120, 70]], [90, [255, 60, 90]]], s.risk));
    else if (mode === 'lutning') c = rgb(ramp([[1, [255, 90, 110]], [3, [255, 180, 80]], [8, [63, 214, 200]], [20, [74, 168, 255]]], s.slope));
    else if (mode === 'belastning') {
      const ld = loadOf(s, net);
      c = ld <= 0.02 ? 'rgba(120,170,185,.55)' : rgb(ramp([[0.3, [47, 230, 196]], [0.75, [255, 214, 90]], [1, [255, 120, 70]], [1.4, [255, 40, 80]]], ld));
    }
    return { color: c, weight: w, opacity: 0.9 };
  }
  function loadOf(s, net) {
    const i = intensity();
    // the simulated storms are already scaled with the scenario's klimatfaktor
    if (net === 'dag') return i / s.design * (1 + Math.min(1, s.catch / 200) * 0.3);
    if (net === 'spill') { const q = S.sim.q && S.sim.q[s.town]; return q ? q.load * (0.75 + Math.min(1, s.catch / 150) * 0.4) : 0.35; }
    return 0;
  }
  function styleNet() {
    const lg = layers.net; if (!lg) return;
    const on = S.net !== 'none';
    if (on && !map.hasLayer(lg)) lg.addTo(map); else if (!on && map.hasLayer(lg)) map.removeLayer(lg);
    if (on) D.streets.forEach(s => s._pl.setStyle(pipeStyle(s)));
  }
  function streamVis() {
    const z = map.getZoom(), lg = layers.streams; if (!lg) return;
    const host = lg._hvHost;
    lg.eachLayer(l => { const want = S.layers.streams && (l._tier >= 4 || (l._tier === 3 && z >= 10) || (l._tier === 2 && z >= 11) || (l._tier === 1 && z >= 12.5)), has = host.hasLayer(l); if (want && !has) host.addLayer(l); else if (!want && has) host.removeLayer(l); });
  }

  // sinks: one image overlay per lågpunkt, redrawn as it fills
  function drawSink(s) {
    const c = s._cv || (s._cv = document.createElement('canvas'));
    c.width = s.w; c.height = s.h;
    const g = c.getContext('2d'), img = g.createImageData(s.w, s.h), d = img.data;
    for (const [ci, cj, dep] of s.cells) {
      const p = (cj * s.w + ci) * 4, wd = s.hh != null ? dep - s.hh : -1;
      if (wd > 0) { const t = clamp(wd / 1.2, 0, 1); d[p] = 40 + 50 * (1 - t); d[p + 1] = 150 + 70 * (1 - t); d[p + 2] = 255; d[p + 3] = 205 + 50 * t; }
      else { d[p] = 201; d[p + 1] = 160; d[p + 2] = 255; d[p + 3] = 90 + Math.min(90, dep * 70); }
    }
    g.putImageData(img, 0, 0);
    if (s._ov) s._ov.setUrl(c.toDataURL());
  }
  function syncSinks(force) {
    D.sinks.forEach(s => {
      const hh = s.V > 0 ? (s.lv == null ? sinkLevel(s) : s.lv) : null;
      const key = hh == null ? 'dry' : hh.toFixed(2);
      if (!force && s._key === key) return;
      s._key = key; s.hh = hh; drawSink(s);
      const el = s._mk && s._mk.getElement && s._mk.getElement();
      if (el) { const f = el.querySelector('.hv-fac'); if (f) f.className = 'hv-fac' + (hh != null && hh <= 0.02 ? ' alarm' : hh != null ? ' warn' : ''); }
    });
  }

  // facilities (divIcons)
  function facIcon(f) {
    const sz = 22, b = (body, col) => '<div class="hv-fac" style="width:' + sz + 'px;height:' + sz + 'px"><svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24">' + body + '</svg></div>';
    switch (f.type) {
      case 'vattenverk': return b('<path d="M12 2l9 5v10l-9 5-9-5V7z" fill="#0a2a3c" stroke="#4aa8ff" stroke-width="1.6"/><path d="M12 7s-3.2 3.6-3.2 5.8a3.2 3.2 0 0 0 6.4 0C15.2 10.6 12 7 12 7z" fill="#4aa8ff"/>');
      case 'reservoar': { const lv = f._lvl || 70; return b('<circle cx="12" cy="12" r="10" fill="#071c28" stroke="#35d6f2" stroke-width="1.6"/><clipPath id="c' + f.id + '"><circle cx="12" cy="12" r="8.2"/></clipPath><rect x="2" y="' + (20.2 - lv / 100 * 16.4) + '" width="20" height="20" fill="#35d6f2" opacity=".75" clip-path="url(#c' + f.id + ')"/>'); }
      case 'pump': return b('<rect x="3" y="3" width="18" height="18" rx="4" fill="#2a1a08" stroke="' + (f.planned ? '#ffce7a' : '#e0a050') + '" stroke-width="1.6" ' + (f.planned ? 'stroke-dasharray="3 2"' : '') + '/><path d="M8 15l4-6 4 6" fill="none" stroke="#e0a050" stroke-width="2" stroke-linecap="round"/>');
      case 'arv': return b('<rect x="2" y="4" width="20" height="16" rx="5" fill="#2a1a08" stroke="#e0a050" stroke-width="1.6"/><path d="M5 13c2-2.5 3.5-2.5 5 0s3 2.5 5 0 3-2.5 4 0" fill="none" stroke="#ffce7a" stroke-width="1.7" stroke-linecap="round"/>');
      case 'booster': return b('<path d="M12 3l9 16H3z" fill="#1d1430" stroke="#c9b6ff" stroke-width="1.6"/><path d="M12 9v6M9.5 11.5L12 9l2.5 2.5" fill="none" stroke="#c9b6ff" stroke-width="1.8" stroke-linecap="round"/>');
      case 'bradd': return b('<path d="M12 4l7 8-7 8-7-8z" fill="#2a0d14" stroke="#ff8a4a" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="#ff8a4a"/>');
      default: return b('<circle cx="12" cy="12" r="8" fill="#123" stroke="#fff"/>');
    }
  }
  const FAC_LABEL = { vattenverk: 'Vattenverk', reservoar: 'Reservoar', pump: 'Pumpstation', arv: 'Reningsverk', booster: 'Tryckstegring', bradd: 'Bräddpunkt' };
  function facVisible(f) {
    if (!S.layers.fac) return false;
    if (map.getZoom() < 10.5 && !['vattenverk', 'arv'].includes(f.type)) return false;
    if (f.type === 'bradd') return S.net === 'spill' || S.sim.t > 0;
    if (S.lens === 'produktion') return ['vattenverk', 'reservoar', 'booster', 'arv'].includes(f.type);
    if (S.net === 'dricks') return ['vattenverk', 'reservoar', 'booster', 'arv', 'pump'].includes(f.type);
    return true;
  }
  function syncFacilities() {
    const lg = layers.fac; if (!lg) return;
    D.fac.forEach(f => {
      const want = facVisible(f), has = lg.hasLayer(f._mk);
      if (want && !has) lg.addLayer(f._mk); else if (!want && has) lg.removeLayer(f._mk);
      // alarms: pumps/bräddpunkter over capacity during the simulation
      const q = S.sim.q && S.sim.q[f.town], el = f._mk.getElement && f._mk.getElement();
      if (el) {
        const inner = el.querySelector('.hv-fac');
        const bad = q && ((f.type === 'bradd' && (S.sim.overflow[f.town] || 0) > 1 && q.load > 1) || (f.type === 'pump' && !f.planned && q.load > 1));
        const warn = q && ((f.type === 'pump' && q.load > 0.85) || (f.type === 'arv' && q.arv > 0.9));
        if (inner) inner.className = 'hv-fac' + (bad ? ' alarm' : warn ? ' warn' : '');
      }
    });
  }

  // regnets väg: particles that follow the D8 flow field, more of them the harder it rains
  function makeParticles() {
    const cv = document.createElement('canvas'), g = cv.getContext('2d');
    cv.style.position = 'absolute'; cv.style.pointerEvents = 'none';
    map.getPane(pane('hvFlow', 430)).appendChild(cv);
    const P = [], G = D.G, nx = G.nx, ny = G.ny;
    let last = performance.now(), cleared = true;
    const size = () => { const s = map.getSize(); cv.width = s.x; cv.height = s.y; cleared = true; };
    size();
    const clear = () => { g.clearRect(0, 0, cv.width, cv.height); cleared = true; };
    const onMove = () => { L.DomUtil.setPosition(cv, map.containerPointToLayerPoint([0, 0])); clear(); };
    map.on('move zoom viewreset', onMove); map.on('resize', size); map.on('zoomanim', clear);
    onMove();
    const proj = (lat, lng) => map.latLngToContainerPoint([lat, lng]);
    const cellLL = (fi, fj) => [G.n - fj * G.dlat, G.w + fi * G.dlng];
    function frame(t) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, t - last); last = t;
      if (!S.layers.flow) { if (!cleared) clear(); P.length = 0; return; }
      const i = intensity();
      const z = map.getZoom(), cellPx = 100 / (156543.03 * Math.cos(56 * Math.PI / 180) / 2 ** z);
      // fade the trails
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = 'rgba(0,0,0,0.9)'; g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'source-over'; cleared = false;
      // spawn inside the current view
      // dry weather: a calm stream of particles along the rinnvägar only; rain: everywhere, more the harder it rains
      const wet = i > 0.2, b = map.getBounds(), want = wet ? Math.min(2600, Math.round(i * 90 + 200)) : 320;
      let spawn = Math.min(60, Math.max(0, want - P.length));
      while (spawn-- > 0) {
        const lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth()), lng = b.getWest() + Math.random() * (b.getEast() - b.getWest());
        const fi = (lng - G.w) / G.dlng, fj = (G.n - lat) / G.dlat, k = Math.floor(fj) * nx + Math.floor(fi);
        if (fi < 0 || fj < 0 || fi >= nx || fj >= ny || !D.dir[k] || (!wet && D.acc[k] < 40)) continue;
        P.push({ fi, fj, k, age: 0, life: 140 + Math.random() * 160 });
      }
      const speed = clamp(1.6 / cellPx, 0.02, 0.9) * dt / 16;
      g.lineCap = 'round';
      for (let n = P.length - 1; n >= 0; n--) {
        const p = P[n], r = D.recv[p.k];
        if (r < 0 || p.age++ > p.life) { P.splice(n, 1); continue; }
        const ti = r % nx + 0.5, tj = ((r / nx) | 0) + 0.5, dx = ti - p.fi, dy = tj - p.fj, dl = Math.hypot(dx, dy);
        const a0 = proj(...cellLL(p.fi, p.fj));
        const acc = D.acc[p.k], sp = speed * (1 + Math.min(2.5, Math.log10(acc) * 0.6));
        if (dl <= sp) { p.fi = ti; p.fj = tj; p.k = r; } else { p.fi += dx / dl * sp; p.fj += dy / dl * sp; }
        const a1 = proj(...cellLL(p.fi, p.fj));
        const strong = Math.min(1, Math.log10(acc) / 3.2);
        g.strokeStyle = 'rgba(' + Math.round(150 - strong * 90) + ',' + Math.round(215 - strong * 50) + ',255,' + (0.45 + strong * 0.5).toFixed(2) + ')';
        g.lineWidth = 1 + strong * 1.8;
        g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(a1.x, a1.y); g.stroke();
      }
    }
    raf = requestAnimationFrame(frame);
    return { remove() { cancelAnimationFrame(raf); map.off('move zoom viewreset', onMove); map.off('resize', size); map.off('zoomanim', clear); cv.remove(); } };
  }

  function buildLayers() {
    const cvNet = L.canvas({ pane: pane('hvNet', 410), padding: 0.4, tolerance: 5 });
    const cvStream = L.canvas({ pane: pane('hvStream', 395), padding: 0.4, tolerance: 3 });
    const svgTrunk = L.svg({ pane: pane('hvTrunk', 440), padding: 0.4 });
    layers.renderers = [cvNet, cvStream, svgTrunk]; // they stay on the map after their paths are gone
    pane('hvWater', 390); pane('hvFac', 615); pane('hvDev', 400);
    layers.terrain = makeTerrain();
    // streams
    const st = L.layerGroup(); st._hvHost = L.layerGroup();
    D.streams.forEach(s => {
      const pl = L.polyline(s.pts, { renderer: cvStream, color: COL.water, opacity: [0, 0.4, 0.45, 0.5, 0.6][s.t], weight: [0, 1, 1.4, 1.9, 2.6][s.t], interactive: s.t >= 2 });
      pl._tier = s.t; pl.on('click', e => select({ type: 'stream', ll: e.latlng }));
      st.addLayer(pl);
    });
    layers.streams = st;
    // pipes
    const net = L.layerGroup();
    D.streets.forEach(s => { s._pl = L.polyline(s.pts, Object.assign({ renderer: cvNet, interactive: true }, pipeStyle(s))); s._pl.on('click', () => select({ type: 'pipe', ref: s })); net.addLayer(s._pl); });
    layers.net = net;
    // trunks
    const tr = L.layerGroup();
    D.trunks.forEach(t => {
      const planned = t.st === 'planerad';
      const base = L.polyline(t.pts, { renderer: svgTrunk, color: t.k === 'dricks' ? '#1e5f9a' : '#7a5020', weight: 7, opacity: 0.55, interactive: false });
      const flow = L.polyline(t.pts, { renderer: svgTrunk, color: t.k === 'dricks' ? '#7cc4ff' : '#ffce7a', weight: 2.6, opacity: 0.95, dashArray: planned ? '10 12' : '2 16', className: planned ? 'hv-trunk-slow' : 'hv-trunk' });
      flow.on('click', () => select({ type: 'trunk', ref: t }));
      t._lg = L.layerGroup([base, flow]); t._lg._kind = t.k;
      tr.addLayer(t._lg);
    });
    layers.trunks = tr;
    // sinks
    const sk = L.layerGroup();
    D.sinks.forEach(s => {
      const G = D.G, b = [[G.n - (s.j0 + s.h) * G.dlat, G.w + s.i0 * G.dlng], [G.n - s.j0 * G.dlat, G.w + (s.i0 + s.w) * G.dlng]];
      drawSink(s);
      s._ov = L.imageOverlay(s._cv.toDataURL(), b, { pane: 'hvWater', className: 'hv-water', interactive: false });
      s._mk = L.marker([s.lat, s.lng], { pane: 'hvFac', icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="hv-fac" style="width:12px;height:12px;border-radius:50%;background:rgba(201,182,255,.25);border:1.5px solid #c9b6ff"></div>' }) });
      s._mk.on('click', () => select({ type: 'sink', ref: s }));
      s._mk.bindTooltip(s.name + ' · ' + nf(s.vol) + ' m³', { className: 'nsva-tip', direction: 'top', offset: [0, -8] });
      sk.addLayer(s._ov); sk.addLayer(s._mk);
    });
    layers.sinks = sk;
    // facilities
    const fl = L.layerGroup();
    D.fac.forEach(f => {
      f._lvl = 55 + hash(f.id) * 35;
      f._mk = L.marker([f.lat, f.lng], { pane: 'hvFac', icon: L.divIcon({ className: '', iconSize: [0, 0], html: facIcon(f) }) });
      f._mk.bindTooltip('<b>' + esc(f.name) + '</b><br>' + FAC_LABEL[f.type] + (f.planned ? ' · planerad ' + f.planned : ''), { className: 'nsva-tip', direction: 'top', offset: [0, -12] });
      f._mk.on('click', () => select({ type: 'fac', ref: f }));
    });
    layers.fac = fl;
    // exploateringsområden
    const dv = L.layerGroup();
    D.dev.forEach(d => {
      d._poly = L.polygon(d.pts, { pane: 'hvDev', color: '#ffce7a', weight: 2, dashArray: '6 5', fillColor: '#ffce7a', fillOpacity: 0.1 });
      d._poly.on('click', () => select({ type: 'dev', ref: d }));
      d._lbl = L.marker([d.lat, d.lng], { pane: 'hvFac', interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="hv-lbl">' + esc(d.name.split(' · ')[0]) + '<small>' + (d.units ? nf(d.units) + ' bostäder' : 'verksamheter') + ' · ' + d.year + '</small></div>' }) });
      dv.addLayer(d._poly); dv.addLayer(d._lbl);
    });
    layers.dev = dv;
    // läckor: DMA:er med förhöjt nattflöde → en misstänkt läcka på nätets svagaste ledning
    const lk = L.layerGroup();
    D.dmas.filter(d => d.leak).forEach(d => {
      const p = d.worst.pts[Math.floor(d.worst.pts.length / 2)];
      d._mk = L.marker(p, { pane: 'hvFac', icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="hv-leak"></div>' }) });
      d._mk.bindTooltip('<b>Misstänkt läcka</b><br>' + esc(d.name) + ' · ' + nf(d.leakLs, 1) + ' l/s', { className: 'nsva-tip', direction: 'top', offset: [0, -10] });
      d._mk.on('click', () => select({ type: 'dma', ref: d }));
      lk.addLayer(d._mk);
    });
    layers.leaks = lk;
    layers.particles = makeParticles();
    map.on('zoomend', onZoomEnd);
    map.on('mousemove', onMouseMove);
  }
  function onZoomEnd() { streamVis(); styleNet(); syncFacilities(); zoomLabels(); }
  // labels and small markers only once there is room for them
  function zoomLabels() {
    const z = map.getZoom();
    D.dev.forEach(d => { const want = S.layers.dev && z >= 11, has = layers.dev.hasLayer(d._lbl); if (want && !has) layers.dev.addLayer(d._lbl); else if (!want && has) layers.dev.removeLayer(d._lbl); });
    D.sinks.forEach(s => { const want = z >= 11, has = layers.sinks.hasLayer(s._mk); if (want && !has) layers.sinks.addLayer(s._mk); else if (!want && has) layers.sinks.removeLayer(s._mk); });
  }
  let elevTxt = '';
  function onMouseMove(e) {
    const el = elevAtLatLng(e.latlng);
    elevTxt = el == null ? '' : el <= 0 ? 'Hav' : 'Markhöjd ' + nf(el, 1) + ' m ö.h.';
    const n = ctx && ctx.hudEl && ctx.hudEl.querySelector('[data-elev]'); if (n) n.textContent = elevTxt;
  }
  function syncLayers() {
    const on = (k, lg) => { if (!lg) return; const want = !!S.layers[k]; if (want && !map.hasLayer(lg)) lg.addTo(map); else if (!want && map.hasLayer(lg)) map.removeLayer(lg); };
    on('terrain', layers.terrain); on('sinks', layers.sinks); on('fac', layers.fac); on('dev', layers.dev); on('leaks', layers.leaks);
    // streams: host group on the map, tiers added by zoom
    const sh = layers.streams._hvHost; if (S.layers.streams) { if (!map.hasLayer(sh)) sh.addTo(map); } else if (map.hasLayer(sh)) map.removeLayer(sh);
    streamVis();
    // trunks: drinking-water trunks with the dricksvatten net, planned spill trunks with spill / samhällsutveckling
    const tl = layers.trunks;
    if (S.layers.trunks) { if (!map.hasLayer(tl)) tl.addTo(map); tl.eachLayer(g => { const show = g._kind === 'dricks' ? S.net !== 'spill' : (S.net === 'spill' || S.lens === 'samhalle' || S.lens === 'oversikt'); g.eachLayer(l => { const p = l._path; if (p) p.style.display = show ? '' : 'none'; }); }); }
    else if (map.hasLayer(tl)) map.removeLayer(tl);
    syncFacilities(); styleNet(); zoomLabels();
  }

  // ---------- selection / info card ----------
  function select(sel) { S.sel = sel; renderInfo(); }
  function flyTo(ll, z) { map.flyTo(ll, z || Math.max(map.getZoom(), 13), { duration: 0.9 }); }
  function infoHtml() {
    const sel = S.sel; if (!sel) return '';
    const kv = rows => '<div class="hv-kv">' + rows.filter(Boolean).map(([k, v]) => '<span>' + k + '</span><b>' + v + '</b>').join('') + '</div>';
    const note = (txt, c) => '<div class="hv-note" style="--c:' + (c || COL.ok) + '">' + txt + '</div>';
    const head = (t, s) => '<div class="hv-x" data-a="close">✕</div><div class="hv-info-t">' + esc(t) + '</div><div class="hv-info-s">' + s + '</div>';
    const town = id => D.tById[id] ? D.tById[id].name : id;
    if (sel.type === 'pipe') {
      const s = sel.ref, net = S.net === 'none' ? 'dricks' : S.net;
      if (net === 'dricks') {
        const bar = s.pressure / 10, end = s.year + LIFE[s.mat];
        return head(town(s.town) + ' · ledning ' + (s.idx + 1), 'Dricksvatten · ' + s.dmn + '-zonen') + kv([
          ['Material', s.mat], ['Dimension', s.dim + ' mm'], ['Anlagd', s.year], ['Längd', nf(s.len) + ' m'], ['Markhöjd', nf(s.elev, 1) + ' m'],
          ['Tryck', nf(bar, 1) + ' bar'], s.pressure0 != null ? ['Utan tryckstegring', nf(s.pressure0 / 10, 1) + ' bar'] : null, ['Riskindex', s.risk + ' / 100'], ['Teknisk livslängd', 'till ' + end]]) +
          note(bar < 2.5 ? 'Lågt tryck på grund av markhöjden – tryckstegring eller ny tryckzon behövs.' : end < S.year ? 'Ledningen har passerat sin tekniska livslängd i ' + S.year + ' – kandidat för förnyelse.' : s.risk > 65 ? 'Hög risk: ålder och material ger hög sannolikhet för läcka.' : 'Inga åtgärder föreslagna.', bar < 2.5 || s.risk > 65 ? COL.warn : COL.ok);
      }
      if (net === 'spill') {
        const q = S.sim.q && S.sim.q[s.town];
        return head(town(s.town) + ' · ledning ' + (s.idx + 1), 'Spillvatten · självfall') + kv([['Material', s.spMat], ['Dimension', s.spDim + ' mm'], ['Anlagd', s.year], ['Lutning', nf(s.slope, 1) + ' ‰'], ['Flödesriktning', 'mot lägre ände'], q ? ['Belastning nu', Math.round(q.load * 100) + ' %'] : null]) +
          note(s.slope < 2 ? 'Flack ledning – risk för sedimentering och stopp. Spolningsplan föreslås.' : s.year < 1965 ? 'Betongledning från före 1965 – hög andel tillskottsvatten troligt. Relining föreslås.' : 'Normal självfallsledning.', s.slope < 2 || s.year < 1965 ? COL.warn : COL.ok);
      }
      const ld = loadOf(s, 'dag');
      return head(town(s.town) + ' · ledning ' + (s.idx + 1), 'Dagvatten') + kv([['Material', s.dagMat], ['Dimension', s.dagDim + ' mm'], ['Anlagd', s.dagYear], ['Dimensionerat för', s.design + ' mm/h'], ['Med klimatfaktor ' + nf(SCEN[S.year].clim, 1), nf(s.design / SCEN[S.year].clim, 0) + ' mm/h'], ['Tillrinning', nf(s.catch) + ' ha'], ['Belastning nu', Math.round(ld * 100) + ' %']]) +
        note(ld >= 1 ? 'Ledningen går full – vatten tar sig ut på gatan och söker sig till närmaste lågpunkt.' : s.design < 30 ? 'Dimensionerad för dagens regn men inte för framtidens – planera skyfallsytor uppströms.' : 'Klarar dimensionerande regn.', ld >= 1 ? COL.bad : s.design < 30 ? COL.warn : COL.ok);
    }
    if (sel.type === 'fac') {
      const f = sel.ref, m = model(), t = m.towns.find(x => x.id === f.town), q = S.sim.q && S.sim.q[f.town];
      const rows = [['Kommun', town(f.town)], ['Markhöjd', nf(f.elev, 1) + ' m ö.h.']];
      let txt = '';
      if (f.type === 'vattenverk') { rows.push(['Kapacitet', nf(t.cap) + ' m³/h'], ['Behov ' + S.year, nf(t.demand) + ' m³/h'], ['Nyttjandegrad', Math.round(t.demand / t.cap * 100) + ' %'], ['PFAS4', nf(0.5 + hash(f.id) * 2.2, 1) + ' ng/l (gräns 4)'], ['Energi', nf(0.32 + hash(f.id + 'e') * 0.2, 2) + ' kWh/m³']); txt = t.demand / t.cap > 0.85 ? 'Nära kapacitetstaket ' + S.year + ' – utbyggnad eller regional överföring krävs.' : 'Kapacitet räcker ' + S.year + '.'; }
      else if (f.type === 'reservoar') { rows.push(['Nivå nu', Math.round(f._lvl) + ' %'], ['Vattenyta', nf(f.head, 1) + ' m ö.h.'], ['Reservtid', nf(6 + hash(f.id) * 10, 0) + ' h']); txt = 'Placerad på ortens högsta punkt – höjden ger trycket i nätet utan pumpar.'; }
      else if (f.type === 'booster') { rows.push(['Tryckhöjning', '+' + f.lift + ' m (' + nf(f.lift / 10, 1) + ' bar)'], ['Försörjer', D.streets.filter(s => s.zone === f.id).length + ' ledningar']); txt = 'Här ligger marken för högt för att reservoaren ska ge tillräckligt tryck – tryckstegringen skapar en egen tryckzon.'; }
      else if (f.type === 'arv') { rows.push(['Kapacitet', nf(t.arvCap) + ' m³/h'], ['Inflöde ' + S.year, nf(q ? Math.min(q.q, q.pumpCap) : t.arvIn) + ' m³/h'], ['Belastning', Math.round((q ? q.arv : t.arvLoad) * 100) + ' %']); txt = t.arvLoad > 0.85 ? 'Reningsverket närmar sig full belastning – nya EU-krav (mikroföroreningar) kräver dessutom ett fjärde reningssteg.' : 'Ligger lågt vid recipienten så att spillvattnet når verket med självfall.'; }
      else if (f.type === 'pump') { rows.push(['Kapacitet', nf(f.cap) + ' m³/h'], f.lift ? ['Lyfthöjd', nf(f.lift, 1) + ' m'] : null, f.planned ? ['Status', 'Planerad ' + f.planned] : ['Belastning', Math.round((q ? q.load : 0.45) * 100) + ' %']); txt = f.planned ? 'Planerad station: terrängen stiger längs överföringen, så vattnet måste pumpas över höjden.' : 'Ortens lägsta punkt – här samlas spillvattnet.'; }
      else if (f.type === 'bradd') { rows.push(['Bräddat i sim.', nf(S.sim.overflow[f.town] || 0) + ' m³']); txt = 'Nödutlopp till recipienten när pumpstationen inte hinner med – varje bräddning rapporteras till tillsynsmyndigheten.'; }
      return head(f.name, FAC_LABEL[f.type] + (f.planned ? ' · planerad' : '')) + kv(rows) + note(txt, COL.ok);
    }
    if (sel.type === 'sink') {
      const s = sel.ref, hh = s.hh;
      const wet = hh == null ? 0 : s.cells.filter(c => c[2] > hh).length * D.G.cellM2, depth = hh == null ? 0 : s.maxD - hh;
      return head(s.name, 'Instängt område · lågpunkt') + kv([['Volym när fullt', nf(s.vol) + ' m³'], ['Största djup', nf(s.maxD, 1) + ' m'], ['Yta', nf(s.area / 1e4, 1) + ' ha'], ['Tillrinningsområde', nf(s.catch / 1e6, 2) + ' km²'], ['Fyllnad nu', Math.round(s.V / s.vol * 100) + ' %'], ['Vattendjup nu', nf(depth, 2) + ' m'], ['Berörd yta', nf(wet / 1e4, 1) + ' ha']]) +
        note('Här samlas vattnet när ledningarna går fulla. Förslag: <b>skyfallsyta</b> (park/torg som får svämmas över) och höjdsättning så att vattnet leds bort från byggnader.', COL.vio);
    }
    if (sel.type === 'dev') return head(sel.ref.name, sel.ref.kind + ' · fiktivt exploateringsområde') + devChecks(sel.ref).html;
    if (sel.type === 'trunk') { const t = sel.ref; return head(t.name, (t.k === 'dricks' ? 'Dricksvatten' : 'Spillvatten') + ' · överföringsledning') + kv([['Längd', nf(t.len / 1000, 1) + ' km'], ['Dimension', t.d + ' mm'], ['Status', t.st === 'planerad' ? 'Planerad ' + t.y : 'I drift sedan ' + t.y]]) + note(t.st === 'planerad' ? 'Vision: små reningsverk avvecklas och spillvattnet pumpas till större verk som klarar de nya EU-kraven.' : 'Regional sammankoppling ger redundans: vid avbrott kan orterna försörjas från grannens vattenverk.'); }
    if (sel.type === 'dma') { const d = sel.ref; return head(d.name, 'DMA · mätområde') + kv([['Ledningslängd', nf(d.len / 1000, 1) + ' km'], ['Medelålder', nf(d.age) + ' år'], ['Minsta nattflöde', nf(d.mnf + d.leakLs, 1) + ' l/s'], ['Förväntat', nf(d.mnf, 1) + ' l/s'], ['Avvikelse', '+' + nf(d.leakLs, 1) + ' l/s']]) + note('Nattflödet ligger över det normala. Akustiska loggrar har ringat in läckan till ledningen här – <b>' + nf(d.leakLs * 86.4) + ' m³ vatten per dygn</b> går förlorat.', COL.bad); }
    if (sel.type === 'stream') {
      const G = D.G, i = Math.floor((sel.ll.lng - G.w) / G.dlng), j = Math.floor((G.n - sel.ll.lat) / G.dlat), k = j * G.nx + i;
      let best = k, a = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const q = (j + dj) * G.nx + i + di; if (D.acc[q] > a) { a = D.acc[q]; best = q; } }
      const km2 = D.acc[best] * G.cellM2 / 1e6;
      return head('Rinnväg', 'Beräknad ur höjdmodellen') + kv([['Tillrinningsområde', nf(km2, km2 < 10 ? 1 : 0) + ' km²'], ['Flöde vid 100-årsregn', nf(km2 * 1e6 * 0.06 / 1000 / 3.6 * 0.35, 0) + ' m³/s (grovt)']]) + note('Så här rinner vattnet ovan mark när ledningarna inte räcker. Bygg inte i rinnvägar – eller lämna plats för vattnet.', COL.water);
    }
    return '';
  }
  function renderInfo() {
    const box = ctx && ctx.hudEl && ctx.hudEl.querySelector('[data-info]'); if (!box) return;
    const html = infoHtml();
    box.hidden = !html; if (html) { box.innerHTML = html; box.style.animation = 'none'; void box.offsetWidth; box.style.animation = ''; }
  }

  // ---------- exploatering: VA-utlåtande ----------
  function devChecks(d) {
    const m = model(), t = m.towns.find(x => x.id === d.town), Tn = D.tById[d.town];
    const add = (d.units * 2.2 * 0.16 + d.jobs * 0.05) / 24 * 1.4; // m³/h
    const arvMargin = 1 - (t.arvIn / popF(d.town, S.year) * popF(d.town, Math.max(S.year, d.year)) + add) / t.arvCap;
    const bar = d.prMin / 10, sea = SCEN[Math.max(2050, S.year)].sea + SURGE;
    const checks = [
      { k: 'Dricksvatten', c: bar >= 3 ? COL.ok : bar >= 2.2 ? COL.warn : COL.bad, v: nf(bar, 1) + ' bar på högsta punkten', a: bar >= 3 ? 'Ansluts till befintlig tryckzon.' : bar >= 2.2 ? 'Gränsfall – lokal tryckstegring rekommenderas.' : 'Marken ligger för högt – ny tryckzon med tryckstegring krävs.' },
      { k: 'Spillvatten', c: arvMargin > 0.15 ? COL.ok : arvMargin > 0 ? COL.warn : COL.bad, v: Math.round(arvMargin * 100) + ' % marginal i ARV', a: arvMargin > 0.15 ? 'Ryms i ' + Tn.name + ' ARV.' : arvMargin > 0 ? 'Ryms, men verket når kapacitetstaket inom planperioden.' : 'Ryms inte – kräver utbyggnad eller överföring till regionalt verk.' },
      { k: 'Skyfall', c: d.sinkVol > 4000 ? COL.bad : d.rinn ? COL.warn : COL.ok, v: d.sinkVol > 0 ? nf(d.sinkVol) + ' m³ i lågpunkter' : d.rinn ? 'rinnväg ' + nf(d.rinnKm2, 1) + ' km²' : 'inga rinnvägar', a: d.sinkVol > 4000 ? 'Instängt område – höjdsätt kvarteren och spara lågpunkten som skyfallsyta.' : d.rinn ? 'En rinnväg korsar området – lämna ett grönt stråk för vattnet.' : 'Inga särskilda skyfallsåtgärder.' },
      { k: 'Havsnivå', c: d.eMin < sea + 0.5 ? COL.bad : d.eMin < sea + 2 ? COL.warn : COL.ok, v: 'lägsta mark ' + nf(d.eMin, 1) + ' m', a: d.eMin < sea + 2 ? 'Nära högvattennivån ' + nf(sea, 1) + ' m (2050+) – lägsta grundläggningsnivå behövs.' : 'Ligger säkert över framtida högvatten.' },
    ];
    const worst = checks.some(c => c.c === COL.bad) ? COL.bad : checks.some(c => c.c === COL.warn) ? COL.warn : COL.ok;
    const html = '<div class="hv-kv" style="margin-bottom:8px"><span>Typ</span><b>' + d.kind + '</b><span>Omfattning</span><b>' + (d.units ? nf(d.units) + ' bostäder' : nf(d.jobs) + ' arbetsplatser') + '</b><span>Inflyttning</span><b>' + d.year + '</b><span>Markhöjd</span><b>' + nf(d.eMin, 0) + '–' + nf(d.eMax, 0) + ' m</b></div>' +
      checks.map(c => '<div class="hv-check"><span class="hv-light" style="--c:' + c.c + '"></span><b>' + c.k + '</b><em>' + c.v + '</em><p>' + c.a + '</p></div>').join('') +
      '<div class="hv-note" style="--c:' + worst + '"><b>Automatiskt VA-utlåtande:</b> ' + (worst === COL.ok ? 'Området kan anslutas utan större åtgärder.' : worst === COL.warn ? 'Området kan anslutas med åtgärder enligt ovan.' : 'Området kräver investeringar innan detaljplanen kan antas.') + '</div>';
    return { checks, worst, html };
  }

  // ---------- panel (left column) ----------
  const card = (title, body, tag) => '<div class="hv-card"><div class="hv-h"><span class="hv-dot"></span>' + title + (tag ? '<span class="hv-tag">' + tag + '</span>' : '') + '</div>' + body + '</div>';
  const kpi = (v, unit, label, sub, c) => '<div class="hv-kpi"><b>' + v + (unit ? '<small>' + unit + '</small>' : '') + '</b><span>' + label + '</span>' + (sub ? '<i style="color:' + (c || '#7fa8b5') + '">' + sub + '</i>' : '') + '</div>';
  const bar = (pct, c) => '<div class="hv-bar"><div style="width:' + clamp(pct, 0, 100) + '%;background:' + c + '"></div></div>';
  const ins = (ic, c, html, act) => '<div class="hv-ins" style="--c:' + c + '"' + (act ? ' data-a="' + act + '"' : '') + '><span class="hv-ic">' + ic + '</span><div>' + html + '</div></div>';
  const scoreCol = v => v >= 75 ? COL.ok : v >= 55 ? COL.warn : COL.bad;
  function ringSvg(v, c) {
    const r = 24, L2 = 2 * Math.PI * r;
    return '<svg width="62" height="62" viewBox="0 0 62 62"><circle cx="31" cy="31" r="' + r + '" fill="none" stroke="rgba(74,196,224,.14)" stroke-width="5"/><circle cx="31" cy="31" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (L2 * v / 100).toFixed(1) + ' ' + L2.toFixed(1) + '" transform="rotate(-90 31 31)" style="transition:stroke-dasharray .8s ease"/><text x="31" y="36" text-anchor="middle" fill="#eaf7fb" font-family="JetBrains Mono" font-size="15" font-weight="600">' + v + '</text></svg>';
  }
  function lineChart(series, opts) {
    const W = 330, H = opts.h || 96, pad = 4, all = series.flatMap(s => s.v), mx = opts.max || Math.max(...all) * 1.08, mn = opts.min != null ? opts.min : 0;
    const X = i => pad + i / (series[0].v.length - 1) * (W - pad * 2), Y = v => H - pad - (v - mn) / (mx - mn) * (H - pad * 2 - 10);
    const paths = series.map(s => { const d = s.v.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(''); return (s.fill ? '<path d="' + d + 'L' + X(s.v.length - 1) + ' ' + (H - pad) + 'L' + X(0) + ' ' + (H - pad) + 'Z" fill="' + s.c + '" opacity=".14"/>' : '') + '<path d="' + d + '" fill="none" stroke="' + s.c + '" stroke-width="' + (s.w || 2) + '"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>'; }).join('');
    const labels = (opts.labels || []).map(l => '<text x="' + X(l.i) + '" y="' + (H - 1) + '" font-size="9" fill="#577684" text-anchor="' + (l.a || 'middle') + '" font-family="JetBrains Mono">' + l.t + '</text>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + (H + 8) + '" width="100%" style="display:block;margin-top:6px">' + paths + labels + '</svg>';
  }
  function barsSvg(vals, cols, labels, h) {
    const W = 330, H = h || 70, n = vals.length, bw = (W - (n - 1) * 4) / n, mx = Math.max(...vals) || 1;
    return '<svg viewBox="0 0 ' + W + ' ' + (H + 14) + '" width="100%" style="display:block;margin-top:6px">' + vals.map((v, i) => { const bh = Math.max(2, v / mx * H); return '<rect x="' + (i * (bw + 4)) + '" y="' + (H - bh) + '" width="' + bw + '" height="' + bh + '" rx="2" fill="' + (cols[i] || cols[0]) + '"/><text x="' + (i * (bw + 4) + bw / 2) + '" y="' + (H + 11) + '" font-size="9" fill="#577684" text-anchor="middle" font-family="JetBrains Mono">' + labels[i] + '</text>'; }).join('') + '</svg>';
  }
  function challenges(m) {
    const y = S.year, sc = m.sc;
    const items = [
      ['Skyfall', 'Korta regn blir ' + Math.round((sc.clim - 1) * 100) + ' % intensivare ' + y + ' – dagvattennätet är byggt för dagens regn.', '×' + nf(sc.clim, 1), sc.clim > 1.1 ? COL.bad : COL.warn],
      ['Havsnivå', 'Medelnivån höjs, och vid högvatten ligger ' + nf(m.lowPipes, 1) + ' km ledning under vattenytan.', '+' + nf(sc.sea * 100) + ' cm', sc.sea > 0.1 ? COL.bad : COL.warn],
      ['Förnyelseskuld', 'Ledningar över teknisk livslängd med dagens förnyelsetakt (0,6 %/år).', nf(m.debtToday, 0) + ' km', m.debtToday > m.len * 0.1 ? COL.bad : COL.warn],
      ['Kapacitet', 'Befolkningen ökar – regionens vattenverk ska klara största dygnet även om ett verk faller bort (N-1).', m.n1 ? 'N-1 OK' : 'N-1 brister', m.n1 ? COL.ok : COL.bad],
      ['EU:s avloppsdirektiv', 'Rening av mikroföroreningar, skärpta krav på kväve/fosfor och energineutrala verk till 2045.', '2045', COL.warn],
      ['PFAS & kvalitet', 'Nytt gränsvärde PFAS4 4 ng/l från 2026 – kontinuerlig övervakning av råvattnet.', '4 ng/l', COL.warn],
      ['Torka & råvatten', 'Varmare somrar sänker grundvattnet när förbrukningen toppar.', 'juli–aug', COL.warn],
      ['Kompetens & cyber', 'Färre händer per km ledning och NIS2-krav – automatisering och AI blir nödvändigt.', 'NIS2', COL.warn],
    ];
    return '<div class="hv-chal">' + items.map(([t, txt, v, c]) => '<div class="hv-ch"><b>' + t + '</b>' + txt + '<em style="color:' + c + '">' + v + '</em></div>').join('') + '</div>';
  }
  function insightsFor(m) {
    const out = [];
    const lowP = D.streets.filter(s => s.pressure < 25), lowTown = lowP.length ? D.tById[lowP[0].town].name : '';
    const castOld = D.streets.filter(s => s.mat === 'Gjutjärn').reduce((a, s) => a + s.len, 0) / 1000;
    const bigSink = D.sinks[0];
    const leaks = D.dmas.filter(d => d.leak), leakSum = leaks.reduce((a, d) => a + d.leakLs, 0);
    const devBad = D.dev.filter(d => devChecks(d).worst === COL.bad);
    const lens = S.lens;
    if (lens === 'oversikt' || lens === 'samhalle') out.push(ins('≈', COL.vio, '<b>' + D.sinks.length + ' instängda lågpunkter</b> i orterna rymmer ' + nf(m.sinkVol / 1000) + ' 000 m³. Största: ' + esc(bigSink.name) + ' (' + nf(bigSink.vol) + ' m³).', 'sink:0'));
    if (lens === 'oversikt' || lens === 'distribution') out.push(ins('!', COL.bad, '<b>' + leaks.length + ' DMA:er</b> har förhöjt nattflöde – sammanlagt ' + nf(leakSum, 1) + ' l/s (' + nf(leakSum * 86.4) + ' m³/dygn) misstänkt läckage.', leaks.length ? 'dma:' + D.dmas.indexOf(leaks[0]) : null));
    if (lens !== 'samhalle') out.push(ins('↑', COL.warn, '<b>' + lowP.length + ' ledningar</b> ligger så högt att trycket blir under 2,5 bar – tryckstegring föreslås bl.a. i ' + esc(lowTown) + '.', lowP.length ? 'pipe:' + lowP[0].idx : null));
    if (lens === 'distribution' || lens === 'oversikt') out.push(ins('⌛', COL.warn, '<b>' + nf(castOld, 1) + ' km gjutjärn</b> från före 1955. Med visionens förnyelsetakt (1,2 %/år) är skulden borta ' + (m.debtVision < 1 ? 'före ' + S.year : 'efter ' + S.year) + '.', null));
    if (lens === 'produktion' || lens === 'oversikt') out.push(ins(m.n1 ? '✓' : '!', m.n1 ? COL.ok : COL.bad, m.n1 ? 'Regionen klarar <b>N-1</b> ' + S.year + ': största dygnet täcks även om största verket står still.' : '<b>N-1 brister ' + S.year + '</b>: faller största verket bort saknas ' + nf(m.peak - m.n1Cap) + ' m³/h på största dygnet, trots regional reservförsörjning.', null));
    if (lens === 'samhalle' && devBad.length) out.push(ins('⚑', COL.bad, '<b>' + devBad.length + ' exploateringsområden</b> kräver VA-investeringar innan planen kan antas – t.ex. ' + esc(devBad[0].name) + '.', 'dev:' + D.dev.indexOf(devBad[0])));
    if (lens === 'produktion') out.push(ins('⚡', COL.ok, 'Reservoarerna fylls nattetid när elen är billig: <b>−14 % energikostnad</b> med prisstyrd pumpning (AI-optimerad).', null));
    return out.join('');
  }
  function panelHtml() {
    const m = model(), y = S.year, lens = S.lens;
    const head = '<div class="hv-card hv-hero"><div class="hv-hero-t">HYDRA · VISIONEN</div><div class="hv-hero-s">En digital tvilling av hela NSVA: verklig terräng, alla ledningar, all produktionsdata – i realtid och mot ' + (y === 2026 ? 'framtiden' : y) + '.</div></div>';
    let body = '';
    if (lens === 'oversikt') {
      const pop = m.towns.reduce((a, t) => a + t.pop, 0);
      body += card('Hydra-index ' + y, '<div class="hv-rings">' + [['Produktion', m.prodScore], ['Ledningsnät', m.netScore], ['Avlopp', m.spillScore], ['Klimat', m.climScore]].map(([l, v]) => '<div class="hv-ring">' + ringSvg(v, scoreCol(v)) + l + '</div>').join('') + '</div>');
      body += card('Hela verksamheten', '<div class="hv-kpis">' + kpi(nf(pop / 1000), 'tusen', 'Invånare ' + y, y > 2026 ? '+' + nf((pop / m.towns.reduce((a, t) => a + popAt(t.id, 2026), 0) - 1) * 100) + ' % mot idag' : '8 kommuner', COL.ok) + kpi(nf(m.dem), 'm³/h', 'Vattenbehov', Math.round(m.dem / m.capTot * 100) + ' % av kapacitet') + kpi(nf(m.len), 'km', 'Modellerat nät', D.streets.length + ' ledningar') + kpi(D.fac.length, 'st', 'Anläggningar', D.fac.filter(f => f.planned).length + ' planerade') + '</div>');
      body += card('AI-insikter', insightsFor(m), 'Hydra AI');
      body += card('Utmaningar i VA-branschen', challenges(m), y);
      body += card('Vägen dit', '<div class="hv-steps">' + [
        ['2025', 'Skyfall live', 'Radar, SMHI, DMI och regnmätare i en vy.', COL.ok],
        ['2026', 'All produktionsdata', 'SCADA från vattenverk, reservoarer, pumpstationer och ARV in i Hydra.', 'var(--ac,#35d6f2)'],
        ['2027', 'Digital tvilling av nätet', 'Ledningsdatabasen kopplas till höjdmodell och hydraulisk modell.', '#7fa8b5'],
        ['2028', 'Smarta mätare & DMA', 'Läckor hittas på timmar i stället för månader.', '#7fa8b5'],
        ['2030', 'Prediktiv drift', 'AI föreslår åtgärder före skyfall, torka och driftstörningar.', '#7fa8b5'],
      ].map(([yr, t, s, c]) => '<div class="hv-step" style="--c:' + c + '"><span>' + yr + '</span><b>' + t + '</b><br>' + s + '</div>').join('') + '</div>');
    }
    if (lens === 'produktion') {
      const hours = Array.from({ length: 49 }, (_, h) => { const hr = (new Date().getHours() + h) % 24; return m.dem * (0.72 + 0.28 * Math.sin((hr - 6) / 24 * 2 * Math.PI) + (hr >= 6 && hr <= 9 ? 0.14 : 0) + (hr >= 17 && hr <= 21 ? 0.1 : 0)) * (1 + Math.sin(h * 0.7) * 0.02); });
      body += card('Produktion vs behov', '<div class="hv-kpis">' + kpi(nf(m.dem), 'm³/h', 'Medelbehov ' + y, nf(m.dem * 24 / 1000, 1) + ' tusen m³/dygn') + kpi(nf(m.capTot), 'm³/h', 'Kapacitet', 'största verk ' + nf(m.largest)) + kpi(Math.round(m.peak / m.capTot * 100), '%', 'Största dygnet', 'av total kapacitet', m.peak / m.capTot > 0.85 ? COL.bad : COL.ok) + kpi(m.n1 ? 'OK' : 'BRIST', '', 'Redundans N-1', m.n1 ? 'inkl. ' + nf(IMPORT) + ' m³/h regional reserv' : 'saknar ' + nf(m.peak - m.n1Cap) + ' m³/h', m.n1 ? COL.ok : COL.bad) + '</div>' +
        '<div class="hv-txt" style="margin-top:12px">AI-prognos 48 h · behov (blå) mot kapacitet (streckad)</div>' + lineChart([{ v: hours, c: COL.dricks, fill: true }, { v: hours.map(() => m.capTot), c: COL.warn, dash: '5 5', w: 1.4 }], { h: 90, min: 0, labels: [{ i: 0, t: 'nu', a: 'start' }, { i: 24, t: '+24 h' }, { i: 48, t: '+48 h', a: 'end' }] }));
      body += card('Vattenverk ' + y, m.towns.map(t => { const u = t.demand / t.cap; return '<div class="hv-row" data-a="fac:' + D.fac.indexOf(D.fById[t.id + '-vv']) + '"><div class="hv-n">' + esc(t.name) + '<small>' + nf(t.cap) + ' m³/h kapacitet · PFAS4 ' + nf(0.5 + hash(t.id + '-vv') * 2.2, 1) + ' ng/l</small></div><div style="width:84px">' + bar(u * 100, u > 0.85 ? COL.bad : u > 0.7 ? COL.warn : COL.ok) + '</div><div class="hv-v">' + Math.round(u * 100) + '%</div></div>'; }).join(''));
      body += card('Reservoarer & reservtid', D.fac.filter(f => f.type === 'reservoar').slice(0, 8).map(f => '<div class="hv-row" data-a="fac:' + D.fac.indexOf(f) + '"><div class="hv-n">' + esc(D.tById[f.town].name) + ' · ' + f.name.replace('Reservoar ', '') + '<small>vattenyta ' + nf(f.head, 0) + ' m ö.h.</small></div><div style="width:84px">' + bar(f._lvl, '#35d6f2') + '</div><div class="hv-v">' + Math.round(f._lvl) + '%</div></div>').join(''));
      body += card('Energi & klimat', '<div class="hv-kpis">' + kpi('0,41', 'kWh/m³', 'Produktion', 'mål 2030: 0,33', COL.warn) + kpi('62', '%', 'Energineutralitet ARV', 'biogas + sol · mål 2045', COL.ok) + '</div><div style="margin-top:10px">' + bar(62, COL.ok) + '</div>');
      body += card('AI-insikter', insightsFor(m), 'Hydra AI');
    }
    if (lens === 'distribution') {
      const net = S.net === 'none' ? 'dricks' : S.net;
      const decades = [1920, 1940, 1960, 1980, 2000, 2020], lenBy = decades.map((d, i) => D.streets.filter(s => (net === 'dag' ? s.dagYear : s.year) >= d && (net === 'dag' ? s.dagYear : s.year) < (decades[i + 1] || 2100)).reduce((a, s) => a + s.len, 0) / 1000);
      const bars = [1.5, 2.5, 3.5, 5, 6, 99], prBy = bars.map((b, i) => D.streets.filter(s => s.pressure / 10 >= (bars[i - 1] || 0) && s.pressure / 10 < b).length);
      const avgAge = D.streets.reduce((a, s) => a + (S.year - s.year) * s.len, 0) / D.streets.reduce((a, s) => a + s.len, 0);
      body += card('Ledningsnätet ' + y, '<div class="hv-kpis">' + kpi(nf(m.len), 'km', 'Modellerat nät', 'per ledningsslag') + kpi(nf(avgAge), 'år', 'Medelålder', 'dricksvatten') + kpi(nf(m.debtToday), 'km', 'Förnyelseskuld', 'takt 0,6 %/år', COL.bad) + kpi(nf(m.debtVision), 'km', 'Med visionen', 'takt 1,2 %/år', COL.ok) + '</div>' +
        '<div class="hv-txt" style="margin-top:12px">Ledningslängd per anläggningsdecennium (km)</div>' + barsSvg(lenBy, ['#ff5a6e', '#ff9a2e', '#ffd65a', '#3fd6c8', '#2fe6a0', '#2fe6a0'], decades.map(d => "'" + String(d).slice(2))) +
        (net === 'dricks' ? '<div class="hv-txt" style="margin-top:10px">Tryck i nätet – antal ledningar per tryckklass (bar)</div>' + barsSvg(prBy, ['#ff5a6e', '#ff9a2e', '#3fd6c8', '#4aa8ff', '#4aa8ff', '#c9b6ff'], ['<1,5', '<2,5', '<3,5', '<5', '<6', '6+'], 54) : ''));
      body += card('Läckage per DMA', '<table class="hv-table"><tr><th>DMA</th><th>Nattflöde</th><th>Avvikelse</th><th></th></tr>' + D.dmas.slice().sort((a, b) => b.leakLs - a.leakLs || b.risk - a.risk).slice(0, 9).map(d => '<tr data-a="dma:' + D.dmas.indexOf(d) + '"><td>' + esc(d.name) + '</td><td>' + nf(d.mnf + d.leakLs, 1) + ' l/s</td><td style="color:' + (d.leak ? COL.bad : COL.ok) + '">' + (d.leak ? '+' + nf(d.leakLs, 1) : '–') + '</td><td><span class="hv-light" style="--c:' + (d.leak ? COL.bad : COL.ok) + '"></span></td></tr>').join('') + '</table>');
      body += card('Högst risk · förnya först', D.streets.slice().sort((a, b) => b.risk - a.risk).slice(0, 7).map(s => '<div class="hv-row" data-a="pipe:' + s.idx + '"><div class="hv-n">' + esc(D.tById[s.town].name) + ' · ' + s.dmn + '<small>' + s.mat + ' ' + s.dim + ' mm · ' + s.year + ' · ' + nf(s.len) + ' m</small></div><span class="hv-pill" style="color:' + (s.risk > 75 ? COL.bad : COL.warn) + '">' + s.risk + '</span></div>').join(''));
      body += card('AI-insikter', insightsFor(m), 'Hydra AI');
    }
    if (lens === 'samhalle') {
      const yrs = [2026, 2030, 2035, 2040, 2045, 2050, 2060, 2070, 2080, 2090, 2100];
      const popSer = yrs.map(yy => D.towns.reduce((a, t) => a + popAt(t.id, yy), 0) / 1000);
      body += card('Exploatering & VA-beredskap', D.dev.map((d, i) => { const c = devChecks(d); return '<div class="hv-row" data-a="dev:' + i + '"><span class="hv-light" style="--c:' + c.worst + '"></span><div class="hv-n">' + esc(d.name) + '<small>' + d.kind + ' · ' + (d.units ? nf(d.units) + ' bostäder' : nf(d.jobs) + ' arbetsplatser') + ' · ' + d.year + '</small></div><div style="display:flex;gap:3px">' + c.checks.map(x => '<span class="hv-light" title="' + x.k + '" style="--c:' + x.c + ';width:7px;height:7px"></span>').join('') + '</div></div>'; }).join('') +
        '<div class="hv-foot" style="padding-top:8px">Prickarna: dricksvatten · spillvatten · skyfall · havsnivå. Klicka för automatiskt VA-utlåtande.</div>');
      body += card('Befolkning i NSVA:s kommuner', lineChart([{ v: popSer, c: COL.ok, fill: true }], { h: 80, min: Math.floor(popSer[0] * 0.95), labels: [{ i: 0, t: '2026', a: 'start' }, { i: 5, t: '2050' }, { i: 10, t: '2100', a: 'end' }] }) + '<div class="hv-kpis" style="margin-top:8px">' + kpi(nf(popAt('helsingborg', S.year) / 1000), 'tusen', 'Helsingborg ' + y) + kpi(nf(m.towns.reduce((a, t) => a + t.pop, 0) / 1000), 'tusen', 'Alla 8 kommuner ' + y) + '</div>');
      body += card('Klimatanpassning ' + y, '<div class="hv-kpis">' + kpi(D.sinks.length, 'st', 'Instängda lågpunkter', nf(m.sinkVol / 1000) + ' 000 m³') + kpi('×' + nf(m.sc.clim, 1), '', 'Klimatfaktor regn', 'Svenskt Vatten P110') + kpi('+' + nf(m.sea, 2), 'm', 'Havsnivå' + (S.surge ? ' + högvatten' : ''), S.surge ? '100-årshögvatten +1,6 m' : 'medelvattenstånd', COL.warn) + kpi(nf(m.lowPipes, 1), 'km', 'Ledning under nivån', 'påverkas av högvatten', m.lowPipes > 5 ? COL.bad : COL.warn) + '</div>' +
        '<div class="hv-sep"></div>' + D.towns.map(t => { const sv = D.sinks.filter(s => s.town === t.id).reduce((a, s) => a + s.vol, 0); return '<div class="hv-row" style="cursor:default"><div class="hv-n">' + esc(t.name) + '<small>' + D.sinks.filter(s => s.town === t.id).length + ' lågpunkter</small></div><div style="width:110px">' + bar(sv / (m.sinkVol || 1) * 260, COL.vio) + '</div><div class="hv-v">' + nf(sv / 1000, 1) + 'k m³</div></div>'; }).join(''));
      body += card('AI-insikter', insightsFor(m), 'Hydra AI');
    }
    const foot = '<div class="hv-foot">Terräng: AWS Terrain Tiles (bl.a. EU-DEM). Gator: © OpenStreetMap. Ledningar, anläggningsdata, exploateringsområden och siffror i visionen är påhittade för att visa möjligheterna.</div>';
    return '<div class="hv-panel">' + head + body + foot + '</div>';
  }
  let panelDirty = true, panelT = 0;
  function renderPanel(force) {
    if (!ctx || !ctx.panelEl) return;
    const now = performance.now();
    if (!force && now - panelT < 700) { panelDirty = true; return; }
    panelT = now; panelDirty = false;
    const col = ctx.panelEl.parentElement, sc = col ? col.scrollTop : 0;
    ctx.panelEl.innerHTML = panelHtml();
    if (col) col.scrollTop = sc;
  }

  // ---------- HUD ----------
  function legendHtml() {
    const rows = [];
    const n = S.net, m = S.color;
    const item = (c, t) => rows.push('<div class="hv-lg"><i style="background:' + c + '"></i>' + t + '</div>');
    if (n !== 'none') {
      rows.push('<div class="hv-cap">' + NETS.find(x => x.id === n).label + ' · ' + (COLOR_MODES[n].find(x => x[0] === m) || ['', ''])[1] + '</div>');
      if (m === 'typ') item(COL[n], NETS.find(x => x.id === n).label);
      if (m === 'alder') [['#ff5a6e', 'före 1950'], ['#ff9a2e', '1950–70'], ['#ffd65a', '1970–90'], ['#3fd6c8', '1990–2010'], ['#2fe6a0', 'efter 2010']].forEach(x => item(...x));
      if (m === 'material') (n === 'dricks' ? [['#ff5a6e', 'Gjutjärn'], ['#ff9a2e', 'Segjärn'], ['#ffd65a', 'PVC'], ['#2fe6c4', 'PE']] : n === 'spill' ? [['#c9a07a', 'Betong'], ['#ffd65a', 'PVC'], ['#4ad6ff', 'PP']] : [['#c9a07a', 'Betong'], ['#4ad6ff', 'PP']]).forEach(x => item(...x));
      if (m === 'tryck') [['#ff5a6e', '< 1,5 bar'], ['#ff9a2e', '2,5 bar'], ['#3fd6c8', '3,5 bar'], ['#4aa8ff', '6 bar'], ['#c9b6ff', '> 7 bar']].forEach(x => item(...x));
      if (m === 'risk') [['#2fe6c4', 'låg'], ['#ffd65a', 'medel'], ['#ff7846', 'hög'], ['#ff3c5a', 'mycket hög']].forEach(x => item(...x));
      if (m === 'lutning') [['#ff5a6e', '< 1 ‰ (flack)'], ['#ffb450', '3 ‰'], ['#3fd6c8', '8 ‰'], ['#4aa8ff', '> 20 ‰']].forEach(x => item(...x));
      if (m === 'belastning') [['rgba(120,170,185,.55)', 'torrt'], ['#2fe6c4', '< 30 %'], ['#ffd65a', '75 %'], ['#ff7846', 'full'], ['#ff2850', 'dämd / överbelastad']].forEach(x => item(...x));
    }
    if (S.layers.sinks) item('#c9b6ff', 'Lågpunkt (torr)'), item('#3fa9ff', 'Vattensamling');
    if (S.layers.sea) item('#3a9aff', 'Under ' + nf(seaLevelM(), 2) + ' m (hav)');
    return rows.join('') + '<div class="hv-elev" data-elev>' + (elevTxt || 'Peka på kartan för markhöjd') + '</div>';
  }
  function simHtml() {
    const s = S.sim, ser = s.series || hyeto(s.preset, s.preset === 'live' ? 1 : SCEN[S.year].clim), mx = Math.max(10, ...ser);
    const W = 400, H = 46, pts = Array.from(ser).map((v, m) => (m / (SIM_MIN - 1) * W).toFixed(1) + ',' + (H - 2 - v / mx * (H - 8)).toFixed(1)).join(' ');
    const x = s.t / SIM_MIN * W, iNow = intensity();
    const wet = D.sinks.filter(k => k.V > 0), full = D.sinks.filter(k => k.V >= k.vol), vol = D.sinks.reduce((a, k) => a + k.V, 0);
    const dagOver = D.streets.filter(st => loadOf(st, 'dag') >= 1).length / D.streets.length;
    const hh = Math.floor(s.t / 60), mm = Math.floor(s.t % 60);
    return '<div class="hv-play' + (s.running ? ' on' : '') + '" data-a="play" title="' + (s.running ? 'Pausa' : 'Starta skyfallssimulering') + '">' + (s.running ? svgIc('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', 20, '#021016') : svgIc('<path d="M7 4l13 8-13 8z" fill="var(--ac,#35d6f2)"/>', 20, 'var(--ac,#35d6f2)')) + '</div>' +
      '<div class="hv-simt"><div class="hv-t1">Skyfallssimulering' + (S.year > 2026 && s.preset !== 'live' ? ' · klimat ' + S.year : '') + '</div><div class="hv-chips">' + PRESETS.map(p => '<span class="hv-chip' + (s.preset === p.id ? ' on' : '') + '" data-a="preset:' + p.id + '" title="' + p.sub + '">' + p.label + '</span>').join('') + '<span class="hv-chip" data-a="reset" title="Nollställ">↺</span></div></div>' +
      '<div class="hv-hyeto" data-a="scrub"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><polygon points="0,' + H + ' ' + pts + ' ' + W + ',' + H + '" fill="rgba(63,169,255,.22)"/><polyline points="' + pts + '" fill="none" stroke="#3fa9ff" stroke-width="1.5"/><rect x="0" y="0" width="' + x.toFixed(1) + '" height="' + H + '" fill="rgba(var(--acg,53,214,242),.08)"/><line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="0" y2="' + H + '" stroke="var(--ac,#35d6f2)" stroke-width="2"/></svg></div>' +
      '<div class="hv-read"><div><b>' + (s.t > 0 || s.running ? hh + ':' + String(mm).padStart(2, '0') : 'Nu') + '</b><span>Tid</span></div><div><b style="color:' + (iNow > 30 ? COL.bad : iNow > 10 ? COL.warn : '#eaf7fb') + '">' + nf(iNow, 1) + '</b><span>mm/h</span></div><div><b>' + nf(s.rainSum || 0, 0) + '</b><span>mm totalt</span></div><div><b style="color:' + (full.length ? COL.bad : wet.length ? COL.warn : '#eaf7fb') + '">' + wet.length + '<small style="font-size:11px;color:#7fa8b5">/' + D.sinks.length + '</small></b><span>Lågpunkter</span></div><div><b>' + nf(vol / 1000, 1) + 'k</b><span>m³ på mark</span></div><div><b style="color:' + (dagOver > 0.2 ? COL.bad : dagOver > 0 ? COL.warn : '#eaf7fb') + '">' + Math.round(dagOver * 100) + '%</b><span>Dagv. fullt</span></div><div><b style="color:' + (s.overflowM3 > 0 ? COL.bad : '#eaf7fb') + '">' + nf(s.overflowM3 || 0) + '</b><span>m³ bräddat</span></div></div>';
  }
  function hudSkeleton() {
    return '<div class="hv-hud">' +
      '<div class="hv-lens hv-glass" data-lens></div>' +
      '<div class="hv-year hv-glass" data-year></div>' +
      '<div class="hv-layers hv-glass" data-layers></div>' +
      '<div class="hv-legend hv-glass" data-legend></div>' +
      '<div class="hv-badge hv-glass"><i></i>Visionsläge · simulerad data</div>' +
      '<div class="hv-info hv-glass" data-info hidden></div>' +
      '<div class="hv-sim hv-glass" data-sim></div>' +
      '</div>';
  }
  function renderHud(parts) {
    const h = ctx && ctx.hudEl; if (!h) return;
    const set = (sel, html) => { const n = h.querySelector(sel); if (n && n._html !== html) { n.innerHTML = html; n._html = html; } };
    const all = !parts;
    if (all || parts.includes('lens')) set('[data-lens]', LENSES.map(l => '<div class="hv-seg' + (S.lens === l.id ? ' on' : '') + '" data-a="lens:' + l.id + '">' + svgIc(l.ic, 15) + l.label + '</div>').join(''));
    if (all || parts.includes('year')) set('[data-year]', '<div class="hv-cap">Scenario</div><div class="hv-years">' + YEARS.map(y => '<div class="hv-seg' + (S.year === y ? ' on' : '') + '" data-a="year:' + y + '">' + y + '</div>').join('') + '</div><div class="hv-ysub"><b>' + SCEN[S.year].txt + '</b> · regn ×' + nf(SCEN[S.year].clim, 1) + ' · hav +' + nf(SCEN[S.year].sea * 100) + ' cm · ' + nf(D.towns.reduce((a, t) => a + popAt(t.id, S.year), 0) / 1000) + ' tusen inv.</div>');
    if (all || parts.includes('layers')) {
      const modes = COLOR_MODES[S.net];
      set('[data-layers]', '<div class="hv-cap">Ledningsnät</div><div class="hv-chips">' + NETS.map(n => '<span class="hv-chip' + (S.net === n.id ? ' on' : '') + '" data-a="net:' + n.id + '">' + n.label + '</span>').join('') + '</div>' +
        (modes.length ? '<div class="hv-cap" style="margin-top:9px">Färg efter</div><div class="hv-chips">' + modes.map(([k, t]) => '<span class="hv-chip' + (S.color === k ? ' on' : '') + '" data-a="color:' + k + '">' + t + '</span>').join('') + '</div>' : '') +
        '<div class="hv-sep"></div><div class="hv-cap">Kartlager</div>' + LAYER_DEFS.map(([k, t, c]) => '<div class="hv-chk' + (S.layers[k] ? ' on' : '') + '" data-a="layer:' + k + '"><span class="hv-box">' + (S.layers[k] ? svgIc('<path d="M5 12l5 5 9-10"/>', 11, '#021016') : '') + '</span>' + t + '<span class="hv-sw" style="background:' + c + '"></span></div>').join('') +
        (S.layers.sea ? '<div class="hv-chk' + (S.surge ? ' on' : '') + '" data-a="surge" style="padding-left:25px"><span class="hv-box">' + (S.surge ? svgIc('<path d="M5 12l5 5 9-10"/>', 11, '#021016') : '') + '</span>+ 100-årshögvatten</div>' : ''));
    }
    if (all || parts.includes('legend')) set('[data-legend]', legendHtml());
    if (all || parts.includes('sim')) set('[data-sim]', simHtml());
  }

  // ---------- actions ----------
  function setLens(l, fromOutside) {
    S.lens = l; const p = LENS_PRESET[l];
    S.net = p.net; S.color = p.color; S.layers = Object.assign({}, p.layers);
    S.sel = null; renderInfo();
    syncLayers(); renderHud(); renderPanel(true); redrawTerrain();
    if (!fromOutside && ctx.onLens) ctx.onLens(l);
    // distribution is about the street network → go to the largest town; the other lenses look at the region
    if (l === 'distribution') map.flyTo([56.047, 12.712], 13.4, { duration: 1.1 });
    else if (map.getZoom() > 11) map.flyToBounds(D.towns.map(t => [t.lat, t.lng]), { paddingTopLeft: [120, 110], paddingBottomRight: [260, 160], duration: 1.1 });
  }
  function act(a, e) {
    const [k, v] = a.split(':');
    if (k === 'lens') return setLens(v);
    if (k === 'year') { S.year = +v; if (S.sim.preset !== 'live') { const t = S.sim.t; S.sim.series = hyeto(S.sim.preset, SCEN[S.year].clim); S.sim.t = t; } redrawTerrain(); styleNet(); renderHud(); renderPanel(true); renderInfo(); return; }
    if (k === 'net') { S.net = v; const modes = COLOR_MODES[v]; if (modes.length && !modes.some(x => x[0] === S.color)) S.color = modes[0][0]; syncLayers(); renderHud(['layers', 'legend']); if (S.lens === 'distribution') renderPanel(true); return; }
    if (k === 'color') { S.color = v; styleNet(); renderHud(['layers', 'legend']); return; }
    if (k === 'layer') { S.layers[v] = !S.layers[v]; syncLayers(); if (v === 'sea') redrawTerrain(); renderHud(['layers', 'legend']); if (v === 'sea') renderPanel(true); return; }
    if (k === 'surge') { S.surge = !S.surge; redrawTerrain(); renderHud(['layers', 'legend']); renderPanel(true); return; }
    if (k === 'play') { if (S.sim.t >= SIM_MIN - 1) resetSim(); S.sim.running = !S.sim.running; if (S.sim.running && !S.layers.sinks) { S.layers.sinks = true; S.layers.flow = true; syncLayers(); } renderHud(['sim', 'layers', 'legend']); return; }
    if (k === 'preset') { S.sim.preset = v; S.sim.running = false; resetSim(); if (v !== 'live') { S.sim.running = true; if (S.net === 'dricks' && S.lens !== 'produktion') { S.net = 'dag'; S.color = 'belastning'; } S.layers.sinks = true; S.layers.flow = true; syncLayers(); } syncSinks(true); renderHud(); styleNet(); return; }
    if (k === 'reset') { S.sim.running = false; resetSim(); S.sim.t = 0; syncSinks(true); syncFacilities(); styleNet(); renderHud(); renderPanel(true); return; }
    if (k === 'scrub') { const r = e.currentTargetRect; if (!r) return; const f = clamp((e.clientX - r.left) / r.width, 0, 1), target = f * SIM_MIN; if (target < S.sim.t) { const keep = S.sim.preset; resetSim(); S.sim.preset = keep; } while (S.sim.t < target) { stepSim(1); S.sim.t += 1; } syncSinks(); syncFacilities(); styleNet(); renderHud(['sim']); return; }
    if (k === 'close') { S.sel = null; renderInfo(); return; }
    if (k === 'fac') { const f = D.fac[+v]; if (!f) return; if (!S.layers.fac) { S.layers.fac = true; syncLayers(); renderHud(['layers']); } flyTo([f.lat, f.lng], 14); return select({ type: 'fac', ref: f }); }
    if (k === 'pipe') { const s = D.streets[+v]; if (!s) return; if (S.net === 'none') { S.net = 'dricks'; syncLayers(); renderHud(['layers', 'legend']); } flyTo(s.pts[Math.floor(s.pts.length / 2)], 15); return select({ type: 'pipe', ref: s }); }
    if (k === 'dma') { const d = D.dmas[+v]; if (!d) return; if (!S.layers.leaks && d.leak) { S.layers.leaks = true; syncLayers(); renderHud(['layers']); } flyTo(d.worst.pts[Math.floor(d.worst.pts.length / 2)], 15); return select({ type: 'dma', ref: d }); }
    if (k === 'sink') { const s = D.sinks[+v]; if (!s) return; if (!S.layers.sinks) { S.layers.sinks = true; syncLayers(); renderHud(['layers', 'legend']); } flyTo([s.lat, s.lng], 14.5); return select({ type: 'sink', ref: s }); }
    if (k === 'dev') { const d = D.dev[+v]; if (!d) return; if (!S.layers.dev) { S.layers.dev = true; syncLayers(); renderHud(['layers']); } flyTo([d.lat, d.lng], 14); return select({ type: 'dev', ref: d }); }
  }
  function onClick(e) {
    const t = e.target.closest('[data-a]'); if (!t) return;
    e.stopPropagation();
    const ev = { clientX: e.clientX, currentTargetRect: t.getBoundingClientRect() };
    act(t.getAttribute('data-a'), ev);
  }

  function tick() {
    if (!S.sim.running) {
      // live: refresh loads and readouts every few seconds
      S._lt = (S._lt || 0) + 1;
      if (S._lt % 25 === 0) { styleNet(); renderHud(['sim']); }
      return;
    }
    stepSim(1); S.sim.t += 1;
    if (S.sim.t >= SIM_MIN - 1) { S.sim.running = false; renderPanel(true); renderHud(['sim']); }
    syncSinks(); syncFacilities();
    if (S.sim.t % 3 === 0 && (S.color === 'belastning')) styleNet();
    renderHud(['sim', 'legend']);
    if (S.sel) { if (S.sim.t % 4 === 0) renderInfo(); }
    renderPanel();
  }

  // ---------- mount / unmount ----------
  function mount(c) {
    unmount();
    const seq = ++mountSeq;
    ctx = c; L = window.L; map = c.map;
    S = { lens: c.lens || 'oversikt', year: 2026, net: 'dricks', color: 'typ', layers: {}, surge: false, sel: null, sim: { running: false, t: 0, preset: 'r100', series: null, overflow: {}, overflowM3: 0, rainSum: 0 } };
    c.panelEl.innerHTML = '<div class="hv-panel"><div class="hv-card hv-hero"><div class="hv-hero-t">HYDRA · VISIONEN</div><div class="hv-hero-s">Laddar terräng, rinnvägar och ledningsnät…</div></div></div>';
    c.hudEl.innerHTML = '';
    return loadData().then(data => {
      if (seq !== mountSeq || !ctx) return;
      D = data;
      // a fresh, dry simulation for every visit
      D.sinks.forEach(s => { s.V = 0; s.peak = 0; s.lv = null; s.hh = null; s._key = null; });
      resetSim();
      c.hudEl.innerHTML = hudSkeleton();
      c.hudEl.addEventListener('click', onClick);
      c.panelEl.addEventListener('click', onClick);
      buildLayers();
      setLens(S.lens, true);
      timers.push(setInterval(tick, 120));
    }).catch(err => {
      if (seq !== mountSeq) return;
      c.panelEl.innerHTML = '<div class="hv-panel"><div class="hv-card"><div class="hv-h">Kunde inte ladda visionen</div><div class="hv-txt">' + esc(err && err.message || err) + '</div></div></div>';
    });
  }
  function unmount() {
    mountSeq++;
    timers.forEach(clearInterval); timers = [];
    if (map) {
      map.off('zoomend', onZoomEnd); map.off('mousemove', onMouseMove);
      if (layers.particles) layers.particles.remove();
      ['terrain', 'net', 'trunks', 'sinks', 'fac', 'dev', 'leaks'].forEach(k => { if (layers[k] && map.hasLayer(layers[k])) map.removeLayer(layers[k]); });
      if (layers.streams) { const h = layers.streams._hvHost; h.clearLayers(); if (map.hasLayer(h)) map.removeLayer(h); }
      (layers.renderers || []).forEach(r => { if (map.hasLayer(r)) map.removeLayer(r); });
    }
    if (ctx) {
      if (ctx.hudEl) { ctx.hudEl.removeEventListener('click', onClick); ctx.hudEl.innerHTML = ''; }
      if (ctx.panelEl) { ctx.panelEl.removeEventListener('click', onClick); ctx.panelEl.innerHTML = ''; }
    }
    layers = {}; ctx = null; map = null;
  }

  window.HydraVision = {
    mount, unmount,
    setLens: l => { if (ctx && D && S && S.lens !== l) setLens(l, true); },
    // for MR. Hydra (chat agent) and tests
    state: () => S && { lens: S.lens, year: S.year, net: S.net, color: S.color, sim: { t: S.sim.t, running: S.sim.running, preset: S.sim.preset } },
    act: a => { if (ctx && D) act(a, {}); },
  };
})();
