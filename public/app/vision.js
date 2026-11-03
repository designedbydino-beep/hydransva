// Hydra – visionen: en digital tvilling för hela NSVA ovanpå huvudkartan.
// Terräng (verklig höjdmodell) styr rinnvägar, lågpunkter, tryck och var anläggningarna ligger;
// ledningsnät, anläggningsdata, mätpunkter och exploateringsområden är påhittade (se data/vision.js).
// Mounted by the dashboard component (logic.js) when view === 'vision'; owns its own DOM in the
// left column + a HUD over the map, and its own Leaflet layers on the shared map. It reports its
// simulation back through ctx.onSim so today's widgets (spillvatten, dagvatten, alarm) follow the twin.
(function () {
  'use strict';
  const DATA_SRC = 'data/vision.js', GRID_SRC = 'data/vision-grid.png';
  const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const DI = [0, 1, 1, 0, -1, -1, -1, 0, 1], DJ = [0, 0, 1, 1, 1, 0, -1, -1, -1];
  const UI_KEY = 'nsva_vision_ui';

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
  const EU_OVERFLOW = 2; // EU:s avloppsdirektiv (2024): bräddning från ledningsnätet < 2 % av årsbelastningen
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
    dricks: [['typ', 'Typ'], ['alder', 'Ålder'], ['material', 'Material'], ['tryck', 'Tryck'], ['vattenalder', 'Vattenålder'], ['risk', 'Risk']],
    spill: [['typ', 'Typ'], ['alder', 'Ålder'], ['material', 'Material'], ['lutning', 'Lutning'], ['belastning', 'Belastning']],
    dag: [['typ', 'Typ'], ['alder', 'Ålder'], ['material', 'Material'], ['belastning', 'Belastning']],
    none: [],
  };
  // mätpunkter: one category per kind of instrument
  const SENS = {
    flode: { label: 'Flöde', col: '#35d6f2', g: 'Q' },
    niva: { label: 'Nivå', col: '#4aa8ff', g: 'N' },
    tryck: { label: 'Tryck', col: '#c9b6ff', g: 'P' },
    regn: { label: 'Regn', col: '#7cc4ff', g: 'R' },
    kvalitet: { label: 'Kvalitet', col: '#2fe6c4', g: 'K' },
    hav: { label: 'Hav', col: '#5aa0ff', g: 'H' },
    grund: { label: 'Grundvatten', col: '#9fc79a', g: 'G' },
    lacka: { label: 'Läcklogger', col: '#ff8a4a', g: 'A' },
    energi: { label: 'Energi', col: '#ffd65a', g: 'E' },
  };
  const LENS_PRESET = {
    oversikt: { net: 'dricks', color: 'typ', cats: ['flode', 'niva', 'regn', 'hav', 'kvalitet'], layers: { terrain: true, streams: true, sinks: true, fac: true, dev: true, trunks: true, sea: false, flow: false, leaks: false, sens: true, bradd: true, bad: false } },
    produktion: { net: 'dricks', color: 'tryck', cats: ['flode', 'niva', 'kvalitet', 'grund', 'energi'], layers: { terrain: true, streams: false, sinks: false, fac: true, dev: false, trunks: true, sea: false, flow: false, leaks: false, sens: true, bradd: false, bad: false } },
    distribution: { net: 'dricks', color: 'risk', cats: ['flode', 'tryck', 'lacka', 'niva', 'kvalitet'], layers: { terrain: true, streams: false, sinks: false, fac: true, dev: false, trunks: true, sea: false, flow: false, leaks: true, sens: true, bradd: true, bad: false } },
    samhalle: { net: 'dag', color: 'belastning', cats: ['regn', 'hav', 'niva'], layers: { terrain: true, streams: true, sinks: true, fac: false, dev: true, trunks: true, sea: true, flow: false, leaks: false, sens: false, bradd: true, bad: true } },
  };
  const LAYER_DEFS = [
    ['terrain', 'Terräng (höjdmodell)', '#8fb4a0'], ['streams', 'Rinnvägar', COL.water], ['sinks', 'Instängda lågpunkter', COL.vio],
    ['flow', 'Regnets väg (partiklar)', '#9fdcff'], ['trunks', 'Överföringsledningar', COL.dricks], ['fac', 'Anläggningar', '#eaf7fb'],
    ['sens', 'Mätpunkter', '#35d6f2'], ['bradd', 'Bräddpunkter & plymer', '#ff8a4a'], ['bad', 'Badplatser', '#ffe08a'],
    ['leaks', 'Läckor & arbetsorder', COL.bad], ['dev', 'Exploateringsområden', '#ffce7a'], ['sea', 'Havsnivå + högvatten', '#5aa0ff'],
  ];
  // today's Hydra map layers (owned by logic.js), switchable from the twin
  const HYDRA_LAYERS = [['skyfall', 'Nederbörd (radar/prognos)'], ['regn', 'Regnmätare (SMHI/DMI)'], ['anmal', 'Översvämningsanmälningar'], ['alarm', 'Alarm'], ['vind', 'Vind']];
  const PANELS = { year: 'Scenario', layers: 'Kartlager', legend: 'Teckenförklaring', sim: 'Skyfallssimulering' };

  // ---------- small helpers ----------
  const nf = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000; };
  const kmDist = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) / 2 * r), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371; };
  const ll = p => Array.isArray(p) ? { lat: p[0], lng: p[1] } : p;
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
  // dygnsvariation i förbrukning: låg natt, topp morgon och kväll
  const dfac = hr => 0.72 + 0.28 * Math.sin((hr - 6) / 24 * 2 * Math.PI) + (hr >= 6 && hr <= 9 ? 0.14 : 0) + (hr >= 17 && hr <= 21 ? 0.1 : 0);
  const whenH = h => h <= 0 ? 'nu' : 'om ' + h + ' h';
  const hourNow = () => new Date().getHours() + new Date().getMinutes() / 60;

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
  const simOn = () => S.sim.running || S.sim.t > 0;

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
    const cellOf = p => { const i = Math.floor((p.lng - G.w) / G.dlng), j = Math.floor((G.n - p.lat) / G.dlat); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
    const nearSea = (p, m) => { const c = cellOf(p); if (c < 0) return true; const r = Math.ceil(m / 100), ci = c % nx, cj = (c / nx) | 0; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const i = ci + a, j = cj + b; if (i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && !dir[j * nx + i]) return true; } return false; };
    const accNear = (p, r) => { const c = cellOf(p); if (c < 0) return 0; let m = 0; const ci = c % nx, cj = (c / nx) | 0; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const k = (cj + b) * nx + ci + a; if (k >= 0 && k < n) m = Math.max(m, acc[k]); } return m; };

    const towns = V.towns.map(t => Object.assign({}, t));
    const tById = Object.fromEntries(towns.map(t => [t.id, t]));
    const fac = V.facilities.filter(f => f.type !== 'bradd').map(f => Object.assign({}, f));
    const fById = Object.fromEntries(V.facilities.map(f => [f.id, f]));
    const streets = V.streets.map((r, idx) => {
      const o = { idx }; V.streetCols.forEach((c, i) => { o[c] = r[i]; });
      o.town = towns[o.town].id; o.zone = V.facilities[o.zone] ? V.facilities[o.zone].id : null; o.pts = decode(o.poly);
      o.mid = ll(o.pts[Math.floor(o.pts.length / 2)]);
      o.mat = matDricks(o.year); o.dim = o.cls >= 4 ? 400 : o.cls === 3 ? 300 : o.cls === 2 ? 200 : 160;
      o.spMat = matSpill(o.year); o.spDim = o.cls >= 3 ? 400 : 225;
      o.dagMat = matDag(o.dagYear); o.dagDim = o.cls >= 3 ? 600 : 300; o.design = dagDesign(o.dagYear);
      o.dmaId = o.town + ':' + o.dma;
      o.dmn = tById[o.town].r > 2000 ? ['N', 'NO', 'SO', 'S', 'SV', 'NV'][o.dma] : ['Norr', 'Öst', 'Väst'][o.dma];
      // vattenålder: travel time from the zone's reservoir/booster; side streets and far ends get older water
      const z = fById[o.zone] || fById[o.town + '-resn'];
      o.age = 2 + (z ? kmDist(o.mid, z) : 1) * 3.4 + (o.cls <= 1 ? 5 : 0) + hash(o.idx + 'a') * 4;
      o.chlorine = 0.45 * Math.exp(-o.age / 30);
      o.hh = Math.round(o.len * (o.cls <= 1 ? 0.085 : 0.04)); // hushåll längs ledningen
      return o;
    });
    // topology for avstängningsanalys: street ends that meet another street's vertex within ~18 m
    const cellKey = (a, b) => Math.round(a / 0.00016) + ':' + Math.round(b / 0.00028), hashV = new Map();
    streets.forEach(s => s.pts.forEach(p => { const k = cellKey(p[0], p[1]); if (!hashV.has(k)) hashV.set(k, []); hashV.get(k).push(s.idx); }));
    streets.forEach(s => { s.adj = new Set(); });
    streets.forEach(s => [s.pts[0], s.pts[s.pts.length - 1]].forEach(p => {
      const a = Math.round(p[0] / 0.00016), b = Math.round(p[1] / 0.00028);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) (hashV.get((a + i) + ':' + (b + j)) || []).forEach(o => { if (o !== s.idx && streets[o].town === s.town) { s.adj.add(o); streets[o].adj.add(s.idx); } });
    }));
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
      const d = dmas[s.dmaId] || (dmas[s.dmaId] = { id: s.dmaId, town: s.town, name: tById[s.town].name + ' ' + s.dmn, len: 0, ageSum: 0, riskSum: 0, n: 0, worst: null, low: null, far: null, streets: [] });
      d.len += s.len; d.ageSum += (2026 - s.year) * s.len; d.riskSum += s.risk * s.len; d.n++; d.streets.push(s);
      if (!d.worst || s.risk > d.worst.risk) d.worst = s;
      if (!d.low || s.pressure < d.low.pressure) d.low = s;
      if (!d.far || s.age > d.far.age) d.far = s;
    });
    const dmaList = Object.values(dmas);
    dmaList.forEach(d => {
      d.age = d.ageSum / d.len; d.risk = d.riskSum / d.len;
      d.mnf = d.len / 1000 * (0.05 + d.risk / 1000) * (0.85 + hash(d.id) * 0.4); // minsta nattflöde l/s
      d.leak = hash(d.id + 'leak') > 0.72 && d.risk > 30;
      d.leakLs = d.leak ? 0.6 + hash(d.id + 'q') * 2.4 : 0;
      d.meters = Math.round(d.streets.reduce((a, s) => a + s.hh, 0) * 0.94); // smarta vattenmätare
      // inlet = the street of the DMA closest to its reservoir
      const z = fById[tById[d.town] && d.town + '-resn'];
      d.inlet = d.streets.reduce((b, s) => (z && kmDist(s.mid, z) < kmDist(b.mid, z) ? s : b), d.streets[0]);
      d.ao = d.leak ? { id: 'AO-' + (24100 + Math.round(hash(d.id) * 800)), status: hash(d.id + 's') > 0.5 ? 'Läcksökning pågår – team på plats' : 'Grävning planerad i morgon 07:00', crew: 'Ledningsnät ' + (1 + Math.round(hash(d.id + 'c') * 4)) } : null;
    });

    // ---- bräddpunkter: ARV (nödavlastning) + nätets lägsta punkter vid en recipient ----
    const bps = [];
    towns.forEach(t => {
      const coastal = nearSea(t, t.r * 1.4);
      const recName = p => nearSea(p, 700) ? (p.lat > 56.3 ? 'Skälderviken/Kattegatt' : 'Öresund') : 'vattendrag';
      const arv = fById[t.id + '-arv'];
      if (arv) bps.push({ id: t.id + '-bp-arv', town: t.id, name: 'Nödavlastning ' + t.name + ' ARV', lat: arv.lat + 0.0009, lng: arv.lng - 0.0014, atArv: true });
      const cands = streets.filter(s => s.town === t.id && (s.elev < (coastal ? 9 : 40)) && (nearSea(s.mid, 500) || accNear(s.mid, 2) > 700)).sort((a, b) => a.elev - b.elev);
      const picked = [];
      for (const s of cands) { if (picked.length >= (t.r > 2000 ? 4 : t.r > 1300 ? 2 : 1)) break; if (picked.some(p => kmDist(p.mid, s.mid) < 0.7) || (arv && kmDist(s.mid, arv) < 0.5)) continue; picked.push(s); }
      if (!picked.length) { const ps = fById[t.id + '-ps']; if (ps) picked.push({ mid: { lat: ps.lat + 0.0012, lng: ps.lng + 0.0016 }, elev: ps.elev }); }
      picked.forEach((s, i) => bps.push({ id: t.id + '-bp' + (i + 1), town: t.id, name: 'Bräddpunkt ' + t.name + ' ' + String.fromCharCode(65 + i), lat: s.mid.lat, lng: s.mid.lng, elev: s.elev }));
    });
    bps.forEach(b => {
      b.recipient = nearSea(b, 700) ? (b.lat > 56.3 ? 'Skälderviken' : 'Öresund') : 'vattendrag';
      const t = tById[b.town], net = bps.filter(x => x.town === b.town && !x.atArv);
      b.weight = b.atArv ? 0 : 1 / net.length;
      const old = streets.filter(s => s.town === b.town && s.year < 1965).length / Math.max(1, streets.filter(s => s.town === b.town).length);
      b.yearN = Math.round((b.atArv ? 1 : 3) + hash(b.id) * 9 * (0.5 + old * 2));
      b.yearM3 = Math.round(t.prod * 0.8 * 8760 * (b.atArv ? 0.0015 : (0.002 + old * 0.012) * b.weight) * (0.7 + hash(b.id + 'v') * 0.6));
      b.krona = Math.round(60 + hash(b.id + 'k') * 50); // cm från botten till bräddkrön
      b.now = 0; b.vol = 0; b.dur = 0;
    });
    // ---- badplatser längs kusten (fiktiva), påverkas av bräddning ----
    const bad = [];
    towns.forEach(t => {
      if (!nearSea(t, t.r * 1.4)) return;
      const c = [];
      for (let a = 0; a < 360; a += 10) for (const f of [0.6, 0.9, 1.2, 1.5]) {
        const p = { lat: t.lat + Math.cos(a * Math.PI / 180) * t.r * f / 111320, lng: t.lng + Math.sin(a * Math.PI / 180) * t.r * f / (111320 * Math.cos(t.lat * Math.PI / 180)) };
        const k = cellOf(p); if (k < 0 || !dir[k] || !nearSea(p, 150)) continue;
        c.push(p);
      }
      const arv = fById[t.id + '-arv'], picked = [];
      c.forEach(p => { if (picked.length < 2 && !picked.some(q => kmDist(q, p) < 2.5) && !(arv && kmDist(arv, p) < 1.2)) picked.push(p); });
      picked.sort((a, b) => b.lat - a.lat).forEach((p, i) => bad.push({ id: t.id + '-bad' + i, town: t.id, name: 'Badplats ' + t.name + (picked.length > 1 ? (i ? ' syd' : ' nord') : ''), lat: p.lat, lng: p.lng, warn: false }));
    });
    return { V, G, dir, recv, acc, towns, tById, fac, fById, streets, sinks, dev, trunks, streams, dmas: dmaList, bps, bad, nearSea, accNear };
  }

  // ---------- mätpunkter ----------
  function buildSensors() {
    const out = [], add = o => { o.id = o.id || o.cat + '-' + out.length; out.push(o); };
    const F = D.fById, sub = (p, dl, dg) => ({ lat: p.lat + dl, lng: p.lng + dg });
    D.towns.forEach(t => {
      const vv = F[t.id + '-vv'], arv = F[t.id + '-arv'], ps = F[t.id + '-ps'];
      if (vv) {
        add({ cat: 'flode', kind: 'vv', town: t.id, name: 'Utgående flöde · ' + vv.name, ...sub(vv, 0.0007, 0.0011), ref: vv });
        add({ cat: 'kvalitet', kind: 'vv', town: t.id, name: 'Vattenkvalitet · ' + vv.name, ...sub(vv, -0.0007, 0.0011), ref: vv });
        add({ cat: 'grund', kind: 'gw', town: t.id, name: 'Grundvattenrör · ' + t.name, ...sub(vv, 0.004, -0.006), ref: vv });
        add({ cat: 'energi', kind: 'vv', town: t.id, name: 'Elmätare · ' + vv.name, ...sub(vv, 0, -0.0013), ref: vv });
      }
      if (arv) {
        add({ cat: 'flode', kind: 'arv', town: t.id, name: 'Inkommande flöde · ' + arv.name, ...sub(arv, 0.0007, 0.0011), ref: arv });
        add({ cat: 'kvalitet', kind: 'arv', town: t.id, name: 'Utgående vatten · ' + arv.name, ...sub(arv, -0.0008, 0.0012), ref: arv });
        add({ cat: 'energi', kind: 'arv', town: t.id, name: 'Elmätare · ' + arv.name, ...sub(arv, 0, -0.0015), ref: arv });
      }
      if (ps) {
        add({ cat: 'niva', kind: 'ps', town: t.id, name: 'Sumpnivå · ' + t.name + ' ' + ps.name, ...sub(ps, 0.0006, 0.001), ref: ps });
        add({ cat: 'flode', kind: 'ps', town: t.id, name: 'Pumpflöde · ' + t.name + ' ' + ps.name, ...sub(ps, -0.0006, 0.001), ref: ps });
        add({ cat: 'energi', kind: 'ps', town: t.id, name: 'Elmätare · ' + t.name + ' ' + ps.name, ...sub(ps, 0, -0.0012), ref: ps });
      }
      D.fac.filter(f => f.town === t.id && f.type === 'reservoar').forEach(f => add({ cat: 'niva', kind: 'res', town: t.id, name: 'Nivå · ' + t.name + ' ' + f.name, ...sub(f, 0.0006, 0.001), ref: f }));
      // vattendrag: the nearest larger stream vertex to the town
      let best = null; D.streams.forEach(s => { if (s.t < 3) return; s.pts.forEach(p => { const d = kmDist(t, ll(p)); if (d < t.r / 1000 * 1.3 && (!best || d < best.d)) best = { d, p: ll(p) }; }); });
      if (best) add({ cat: 'niva', kind: 'aa', town: t.id, name: 'Vattenstånd · vattendrag vid ' + t.name, lat: best.p.lat, lng: best.p.lng });
    });
    D.dmas.forEach(d => {
      add({ cat: 'flode', kind: 'dma', town: d.town, name: 'DMA-mätare · ' + d.name, ...d.inlet.mid, ref: d });
      add({ cat: 'tryck', kind: 'p', town: d.town, name: 'Tryckgivare · ' + d.name + ' (kritisk punkt)', ...d.low.mid, ref: d.low });
      add({ cat: 'kvalitet', kind: 'net', town: d.town, name: 'Klorgivare · ' + d.name + ' (nätets yttersta del)', ...d.far.mid, ref: d.far });
      if (d.leak || d.risk > 42) add({ cat: 'lacka', kind: 'leak', town: d.town, name: 'Akustisk logger · ' + d.name, ...d.worst.mid, ref: d });
    });
    D.bps.forEach(b => add({ cat: 'niva', kind: 'bp', town: b.town, name: 'Kammarnivå · ' + b.name, lat: b.lat - 0.0005, lng: b.lng + 0.0009, ref: b }));
    (ctx.gauges ? ctx.gauges() : []).forEach(g => add({ cat: 'regn', kind: 'rain', id: 'rain-' + g.id, name: 'Regnmätare ' + g.name + ' (' + g.src + ')', lat: g.lat, lng: g.lng, g }));
    (ctx.sea ? ctx.sea() : []).forEach(s => s.lat && add({ cat: 'hav', kind: 'sea', id: 'sea-' + s.id, name: 'Havsvattenstånd ' + s.name + ' (SMHI)', lat: s.lat, lng: s.lng, st: s }));
    return out;
  }
  // current value of an instrument; follows the scenario year and the simulation
  function sensVal(sn) {
    const m = S._m || model(), t = m.towns.find(x => x.id === sn.town), hr = hourNow(), jit = (a) => Math.sin(performance.now() / 5000 + hash(sn.id) * 20) * a;
    const q = S.sim.q && S.sim.q[sn.town], ok = (txt, v, st, extra) => Object.assign({ txt, v, st: st || 'ok' }, extra || {});
    const k = sn.kind;
    if (sn.cat === 'flode') {
      if (k === 'vv') { const v = t.demand * dfac(hr) + jit(t.demand * 0.01); return ok(nf(v) + ' m³/h', v, v > t.cap * 0.92 ? 'warn' : 'ok', { lim: 'Kapacitet ' + nf(t.cap) + ' m³/h' }); }
      if (k === 'arv') { const v = (q ? Math.min(q.q, q.pumpCap) : t.arvIn) + jit(t.arvIn * 0.01); return ok(nf(v) + ' m³/h', v, v > t.arvCap ? 'bad' : v > t.arvCap * 0.9 ? 'warn' : 'ok', { lim: 'Kapacitet ' + nf(t.arvCap) + ' m³/h' }); }
      if (k === 'ps') { const v = (q ? Math.min(q.q, q.pumpCap) : t.arvIn) * 0.55; return ok(nf(v) + ' m³/h', v, q && q.load > 1 ? 'bad' : q && q.load > 0.85 ? 'warn' : 'ok', { lim: 'Max ' + nf(t.pumpCap * 0.55) + ' m³/h' }); }
      if (k === 'dma') { const d = sn.ref, v = d.len / 1000 * 0.9 * dfac(hr) * popF(d.town, S.year) + d.leakLs + jit(0.05); return ok(nf(v, 1) + ' l/s', v, d.leak ? 'warn' : 'ok', { lim: 'Nattflöde förväntat ' + nf(d.mnf, 1) + ' l/s' }); }
    }
    if (sn.cat === 'niva') {
      if (k === 'res') { const v = clamp(sn.ref._lvl + Math.sin((hr - 4) / 24 * 2 * Math.PI) * 7 + jit(0.5), 5, 100); return ok(Math.round(v) + ' %', v, v < 25 ? 'bad' : v < 40 ? 'warn' : 'ok', { lim: 'Larm under 25 %' }); }
      if (k === 'ps') { const v = clamp(q ? q.load * 78 : 42 + ctx.stormF(sn.town) * 40, 4, 100); return ok(Math.round(v) + ' %', v, v > 90 ? 'bad' : v > 75 ? 'warn' : 'ok', { lim: 'Bräddrisk över 90 %' }); }
      if (k === 'bp') { const b = sn.ref, ld = q ? (b.atArv ? q.arv : q.load) : 0.45 + ctx.stormF(sn.town) * 0.4; const v = Math.round((ld - 1) * 70 - 8); return ok((v > 0 ? '+' : '−') + Math.abs(v) + ' cm', v, b.now > 0 || v > 0 ? 'bad' : v > -20 ? 'warn' : 'ok', { lim: 'Relativt bräddkrön' }); }
      if (k === 'aa') { const v = 0.42 + (simOn() ? S.sim.rainSum * 0.018 : ctx.stormF(sn.town) * 0.5) + jit(0.01); return ok(nf(v, 2) + ' m', v, v > 1.6 ? 'bad' : v > 1.1 ? 'warn' : 'ok', { lim: 'Översvämning vid 1,6 m' }); }
    }
    if (sn.cat === 'tryck') { const v = sn.ref.pressure / 10 * (1.04 - 0.08 * (dfac(hr) - 0.72)) + jit(0.02); return ok(nf(v, 1) + ' bar', v, v < 2 ? 'bad' : v < 2.5 ? 'warn' : 'ok', { lim: 'Minst 2,5 bar (Svenskt Vatten P83)' }); }
    if (sn.cat === 'kvalitet') {
      if (k === 'vv') { const tu = (sn.town === 'svalov' ? 0.9 : 0.14 + hash(sn.id) * 0.12) + jit(0.01), pf = 0.5 + hash(sn.town + '-vv') * 2.2; return ok('Turb ' + nf(tu, 2) + ' NTU · PFAS4 ' + nf(pf, 1), tu, tu > 0.5 ? 'warn' : 'ok', { lim: 'Turbiditet < 0,5 NTU · PFAS4 < 4 ng/l' }); }
      if (k === 'net') { const v = sn.ref.chlorine + jit(0.005); return ok('Klor ' + nf(v, 2) + ' mg/l', v, v < 0.05 ? 'bad' : v < 0.1 ? 'warn' : 'ok', { lim: 'Restklor över 0,1 mg/l', extra: 'Vattenålder ' + nf(sn.ref.age) + ' h' }); }
      if (k === 'arv') { const by = q && q.bypass > 0, v = (by ? 0.62 : 0.16 + hash(sn.id) * 0.08) + jit(0.005); return ok('P-tot ' + nf(v, 2) + ' mg/l', v, v > 0.3 ? 'bad' : v > 0.25 ? 'warn' : 'ok', { lim: 'Tillstånd 0,3 mg/l' }); }
    }
    if (sn.cat === 'grund') { const v = 3.2 + hash(sn.id) * 2.5 + (S.year - 2026) * 0.014 + (new Date().getMonth() >= 5 && new Date().getMonth() <= 8 ? 0.8 : 0); return ok(nf(v, 1) + ' m u.my', v, v > 6.5 ? 'warn' : 'ok', { lim: 'Torkvarning under 6,5 m' }); }
    if (sn.cat === 'lacka') { const d = sn.ref, v = (d.leak ? 36 + hash(d.id) * 10 : 12 + hash(d.id) * 8) + jit(1); return ok(Math.round(v) + ' dB', v, v > 30 ? 'bad' : v > 24 ? 'warn' : 'ok', { lim: 'Läckljud över 30 dB' }); }
    if (sn.cat === 'energi') {
      const r = sn.ref, v = k === 'vv' ? t.demand * dfac(hr) * 0.41 : k === 'arv' ? (q ? Math.min(q.q, q.pumpCap) : t.arvIn) * 0.55 : (q ? q.load : 0.45) * t.pumpCap * 0.06;
      return ok(nf(v) + ' kW', v, 'ok', { lim: r ? r.name : '' });
    }
    if (sn.cat === 'regn') { const v = simOn() ? rainNowSim() * (0.8 + hash(sn.id) * 0.4) : (sn.g.now || 0); return ok(nf(v, 1) + ' mm/h', v, v > 30 ? 'bad' : v > 10 ? 'warn' : 'ok', { lim: 'Skyfall över 50 mm/h (SMHI)' }); }
    if (sn.cat === 'hav') { const v = sn.st.now != null ? sn.st.now : (sn.st.cm || 0); return ok((v >= 0 ? '+' : '') + Math.round(v) + ' cm', v, v > 80 ? 'bad' : v > 50 ? 'warn' : 'ok', { lim: 'Högvatten över +80 cm' }); }
    return ok('–', 0);
  }
  function sensHist(sn, cur) { // 24 h trend ending in the current value
    const out = [], s = hash(sn.id);
    for (let h = 0; h < 24; h++) { const hr = (new Date().getHours() - 23 + h + 24) % 24; out.push(cur * (0.86 + (sn.cat === 'flode' || sn.cat === 'energi' ? (dfac(hr) - 0.9) * 0.6 : 0.1 * Math.sin(h * 0.6 + s * 9)) + Math.sin(h * 1.7 + s * 30) * 0.03)); }
    out[23] = cur; return out;
  }

  // ---------- scenario model ----------
  function model() {
    const y = S.year, sc = SCEN[y], sim = simOn();
    const towns = D.towns.map(t => {
      const pf = popF(t.id, y), per = sc.lpd / SCEN[2026].lpd;
      const demand = t.prod * pf * per; // m³/h medel
      const cap = t.prod * 1.5;
      // spillvatten: same baseline as today's Spillvatten widget (0,8 × produktionen, more when it rains)
      const sf = !sim && ctx.stormF ? ctx.stormF(t.id) : 0;
      const arvBase = t.prod * 0.8 * pf, arvIn = arvBase * (1 + sf * 0.69);
      const arvCap = t.prod * 1.25 * (y >= 2035 && (t.id === 'helsingborg' || t.id === 'landskrona') ? 1.2 : 1), pumpCap = t.prod * 1.36;
      return { id: t.id, name: t.name, pop: popAt(t.id, y), pf, demand, cap, arvBase, arvIn, arvCap, pumpCap, arvLoad: arvIn / arvCap };
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
    // bräddning: andel av årsbelastningen (EU-indikator)
    const yearIn = towns.reduce((s, t) => s + t.arvBase * 8760, 0), braddYear = D.bps.reduce((s, b) => s + b.yearM3 * (y > 2026 ? SCEN[y].clim * 1.15 : 1), 0);
    const braddPct = braddYear / yearIn * 100;
    // Hydra-index 0–100 per område
    const prodScore = clamp(Math.round(100 - Math.max(0, peak / n1Cap - 0.85) * 170 - Math.max(0, dem / capTot - 0.7) * 60), 5, 99);
    const netScore = clamp(Math.round(96 - debtToday / len * 260 - (D.streets.filter(s => s.pressure < 25).length / D.streets.length) * 60), 5, 99);
    const arvMax = Math.max(...towns.map(t => t.arvBase / t.arvCap)); // planning index: dry-weather load, not today's rain
    const spillScore = clamp(Math.round(100 - Math.max(0, arvMax - 0.6) * 120 - Math.max(0, braddPct - 1) * 20), 5, 99);
    const climScore = clamp(Math.round(92 - (sc.clim - 1) * 120 - lowPipes * 0.8 - sea * 18), 5, 99);
    return { y, sc, towns, capTot, dem, largest, peak, n1, n1Cap, len, overLife, debtToday, debtVision, sea, lowPipes, sinkVol, yearIn, braddYear, braddPct, prodScore, netScore, spillScore, climScore };
  }
  // tillskottsvatten per mm/h regn: more in towns with old concrete sewers
  const tillskott = id => { const c = D._tsk || (D._tsk = {}); if (c[id] == null) { const all = D.streets.filter(s => s.town === id); c[id] = 0.012 + all.filter(s => s.year < 1965).length / Math.max(1, all.length) * 0.05; } return c[id]; };
  // the forecast only changes every few minutes – cache it
  function forecast() {
    const now = Date.now();
    if (!S._fc || now - S._fcT > 15000 || S._fcY !== S.year) { S._fc = overflowForecast(S._m || model()); S._fcT = now; S._fcY = S.year; const risk = new Set(S._fc.map(x => x.town)); D.bps.forEach(b => { b._risk = !b.atArv && risk.has(b.town); }); }
    return S._fc;
  }
  // bräddrisk kommande 12 h ur prognosen (samma modell som simuleringen)
  function overflowForecast(m) {
    return m.towns.map(t => {
      for (let h = 0; h <= 12; h++) { const i = ctx.rainAt(h) || 0, q = t.arvBase * (1 + tillskott(t.id) * i); if (q > t.pumpCap) return { town: t.id, h, i, q }; }
      return null;
    }).filter(Boolean);
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
    S.sim.t = 0; S.sim.overflowM3 = 0; S.sim.rainSum = 0; S.sim.q = null;
    D.sinks.forEach(s => { s.V = 0; s.peak = 0; s.lv = null; });
    D.bps.forEach(b => { b.now = 0; b.vol = 0; b.dur = 0; });
    D.bad.forEach(b => { b.warn = false; });
    S.sim.series = hyeto(S.sim.preset, S.sim.preset === 'live' ? 1 : SCEN[S.year].clim);
  }
  const rainNowSim = () => S.sim.series ? S.sim.series[Math.min(SIM_MIN - 1, Math.floor(S.sim.t))] : 0;
  // effective intensity used for loads: simulated while a run is active, otherwise live
  const intensity = () => simOn() ? rainNowSim() : (ctx.rainNow ? ctx.rainNow() : 0);
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
      s.V = clamp(s.V + inflow - out, 0, s.vol * 1.05);
      s.lv = sinkLevel(s); s.peak = Math.max(s.peak, s.V);
    });
    // spillvatten: tillskottsvatten driver inflödet över pumpstationernas kapacitet → bräddning i nätet;
    // når mer än reningsverket klarar fram → nödavlastning vid verket
    const m = S._m = model();
    S.sim.q = {};
    m.towns.forEach(t => {
      const q = t.arvBase * (1 + tillskott(t.id) * i);
      const net = Math.max(0, q - t.pumpCap), bypass = Math.max(0, Math.min(q, t.pumpCap) - t.arvCap);
      S.sim.q[t.id] = { q, pumpCap: t.pumpCap, load: q / t.pumpCap, arv: Math.min(q, t.pumpCap) / t.arvCap, net, bypass };
      D.bps.filter(b => b.town === t.id).forEach(b => {
        b.now = b.atArv ? bypass : net * b.weight;
        if (b.now > 0) { b.vol += b.now * dtMin / 60; b.dur += dtMin; }
      });
      S.sim.overflowM3 += (net + bypass) * dtMin / 60;
    });
    // badvatten: avrådan när en bräddpunkt inom 3,5 km har släppt ut mer än 50 m³
    D.bad.forEach(b => { b.warn = D.bps.some(p => p.vol > 50 && p.recipient !== 'vattendrag' && kmDist(p, b) < 3.5); });
  }
  function reportSim() {
    if (!ctx.onSim) return;
    const active = simOn(), i = intensity(), towns = {}, alarms = [];
    D.towns.forEach(t => {
      const q = S.sim.q && S.sim.q[t.id], sk = D.sinks.filter(s => s.town === t.id), vol = sk.reduce((a, s) => a + s.vol, 0);
      towns[t.id] = { q: q ? Math.min(q.q, q.pumpCap) : 0, load: q ? q.load : 0, fill: vol ? sk.reduce((a, s) => a + s.V, 0) / vol * 100 : 0, overflowing: D.bps.some(b => b.town === t.id && b.now > 0) };
    });
    if (active) {
      D.bps.filter(b => b.now > 0).sort((a, b) => b.now - a.now).slice(0, 4).forEach(b => alarms.push({ sev: 'KRITISK', muni: b.town, msg: 'Bräddning pågår · ' + b.name + ' → ' + b.recipient + ' · ' + nf(b.now) + ' m³/h (tvillingen)', time: 'nu' }));
      const full = D.sinks.filter(s => s.V >= s.vol);
      if (full.length) alarms.push({ sev: 'VARNING', muni: full[0].town, msg: full.length + ' lågpunkter fulla – vatten på gator · ' + full[0].name + ' (tvillingen)', time: 'nu' });
      const dagOver = D.streets.filter(s => loadOf(s, 'dag') >= 1);
      if (dagOver.length) alarms.push({ sev: 'VARNING', muni: dagOver[0].town, msg: 'Dagvattennätet dämt · ' + Math.round(dagOver.length / D.streets.length * 100) + ' % av ledningarna går fulla (tvillingen)', time: 'nu' });
      D.bad.filter(b => b.warn).slice(0, 2).forEach(b => alarms.push({ sev: 'VARNING', muni: b.town, msg: 'Avrådan från bad · ' + b.name + ' efter bräddning (tvillingen)', time: 'nu' }));
    }
    ctx.onSim({ active, rain: i, towns, alarms });
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
      const c2 = hs >= 0 ? lerpC(h, [175, 228, 242], Math.min(1, hs * 3)) : lerpC(h, [0, 6, 12], Math.min(1, -hs * 3));
      d[p] = c2[0]; d[p + 1] = c2[1]; d[p + 2] = c2[2];
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
  function elevAtLatLng(p) {
    const t = layers.terrain; if (!t || !t._tiles) return null;
    const z = Math.min(14, Math.round(map.getZoom())), n = 2 ** z;
    const X = (p.lng + 180) / 360 * n * 256, Y = mercY(p.lat) * n * 256, tx = Math.floor(X / 256), ty = Math.floor(Y / 256);
    const tile = t._tiles[tx + ':' + ty + ':' + z]; if (!tile || !tile.el._elev) return null;
    return tile.el._elev[Math.floor(Y - ty * 256) * 256 + Math.floor(X - tx * 256)];
  }

  // street pipes + streams on canvas renderers, trunks on SVG (animated flow)
  function pipeStyle(s) {
    const net = S.net, mode = S.color, z = map.getZoom();
    const w = (s.cls >= 4 ? 3.2 : s.cls === 3 ? 2.6 : s.cls === 2 ? 2 : 1.4) * (z < 11 ? 0.6 : z < 12.5 ? 0.85 : 1.15);
    if (S.shut && S.shut.set.has(s.idx)) return { color: '#ff4fd8', weight: w + 3, opacity: 1 };
    let c = COL[net] || '#888';
    const year = net === 'dag' ? s.dagYear : s.year;
    if (mode === 'alder') c = rgb(ramp([[1925, [255, 90, 110]], [1955, [255, 154, 46]], [1975, [255, 214, 90]], [1995, [63, 214, 200]], [2020, [47, 230, 160]]], year));
    else if (mode === 'material') {
      const m = net === 'dricks' ? s.mat : net === 'spill' ? s.spMat : s.dagMat;
      c = ({ Gjutjärn: '#ff5a6e', Segjärn: '#ff9a2e', PVC: '#ffd65a', PE: '#2fe6c4', Betong: '#c9a07a', PP: '#4ad6ff' })[m];
    } else if (mode === 'tryck') c = rgb(ramp([[1.5, [255, 90, 110]], [2.5, [255, 154, 46]], [3.5, [63, 214, 200]], [6, [74, 168, 255]], [7.5, [201, 182, 255]]], s.pressure / 10));
    else if (mode === 'vattenalder') c = rgb(ramp([[6, [47, 230, 160]], [12, [63, 214, 200]], [24, [255, 214, 90]], [36, [255, 154, 46]], [48, [255, 90, 110]]], s.age));
    else if (mode === 'risk') c = rgb(ramp([[15, [47, 230, 196]], [45, [255, 214, 90]], [70, [255, 120, 70]], [90, [255, 60, 90]]], s.risk));
    else if (mode === 'lutning') c = rgb(ramp([[1, [255, 90, 110]], [3, [255, 180, 80]], [8, [63, 214, 200]], [20, [74, 168, 255]]], s.slope));
    else if (mode === 'belastning') {
      const ld = loadOf(s, net);
      c = ld <= 0.02 ? 'rgba(120,170,185,.55)' : rgb(ramp([[0.3, [47, 230, 196]], [0.75, [255, 214, 90]], [1, [255, 120, 70]], [1.4, [255, 40, 80]]], ld));
    }
    return { color: c, weight: w, opacity: S.shut ? 0.35 : 0.9 };
  }
  function loadOf(s, net) {
    const i = intensity();
    // the simulated storms are already scaled with the scenario's klimatfaktor
    if (net === 'dag') return i / s.design * (1 + Math.min(1, s.catch / 200) * 0.3);
    if (net === 'spill') { const q = S.sim.q && S.sim.q[s.town]; return q ? q.load * (0.75 + Math.min(1, s.catch / 150) * 0.4) : 0.35 + (ctx.stormF ? ctx.stormF(s.town) * 0.4 : 0); }
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
      const key = hh == null ? 'dry' : String(Math.round(hh * 20));
      if (!force && s._key === key) return;
      s._key = key; s.hh = hh; drawSink(s);
      const el = s._mk && s._mk.getElement && s._mk.getElement();
      if (el) { const f = el.querySelector('.hv-fac'); if (f) f.className = 'hv-fac' + (hh != null && hh <= 0.02 ? ' alarm' : hh != null ? ' warn' : ''); }
    });
  }

  // facilities (divIcons)
  function facIcon(f) {
    const sz = 22, b = body => '<div class="hv-fac" style="width:' + sz + 'px;height:' + sz + 'px"><svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24">' + body + '</svg></div>';
    switch (f.type) {
      case 'vattenverk': return b('<path d="M12 2l9 5v10l-9 5-9-5V7z" fill="#0a2a3c" stroke="#4aa8ff" stroke-width="1.6"/><path d="M12 7s-3.2 3.6-3.2 5.8a3.2 3.2 0 0 0 6.4 0C15.2 10.6 12 7 12 7z" fill="#4aa8ff"/>');
      case 'reservoar': { const lv = f._lvl || 70; return b('<circle cx="12" cy="12" r="10" fill="#071c28" stroke="#35d6f2" stroke-width="1.6"/><clipPath id="c' + f.id + '"><circle cx="12" cy="12" r="8.2"/></clipPath><rect x="2" y="' + (20.2 - lv / 100 * 16.4) + '" width="20" height="20" fill="#35d6f2" opacity=".75" clip-path="url(#c' + f.id + ')"/>'); }
      case 'pump': return b('<rect x="3" y="3" width="18" height="18" rx="4" fill="#2a1a08" stroke="' + (f.planned ? '#ffce7a' : '#e0a050') + '" stroke-width="1.6" ' + (f.planned ? 'stroke-dasharray="3 2"' : '') + '/><path d="M8 15l4-6 4 6" fill="none" stroke="#e0a050" stroke-width="2" stroke-linecap="round"/>');
      case 'arv': return b('<rect x="2" y="4" width="20" height="16" rx="5" fill="#2a1a08" stroke="#e0a050" stroke-width="1.6"/><path d="M5 13c2-2.5 3.5-2.5 5 0s3 2.5 5 0 3-2.5 4 0" fill="none" stroke="#ffce7a" stroke-width="1.7" stroke-linecap="round"/>');
      case 'booster': return b('<path d="M12 3l9 16H3z" fill="#1d1430" stroke="#c9b6ff" stroke-width="1.6"/><path d="M12 9v6M9.5 11.5L12 9l2.5 2.5" fill="none" stroke="#c9b6ff" stroke-width="1.8" stroke-linecap="round"/>');
      default: return b('<circle cx="12" cy="12" r="8" fill="#123" stroke="#fff"/>');
    }
  }
  const FAC_LABEL = { vattenverk: 'Vattenverk', reservoar: 'Reservoar', pump: 'Pumpstation', arv: 'Reningsverk', booster: 'Tryckstegring' };
  function facVisible(f) {
    if (!S.layers.fac) return false;
    if (map.getZoom() < 10.5 && !['vattenverk', 'arv'].includes(f.type)) return false;
    if (S.lens === 'produktion') return ['vattenverk', 'reservoar', 'booster', 'arv'].includes(f.type);
    return true;
  }
  function syncFacilities() {
    const lg = layers.fac; if (!lg) return;
    D.fac.forEach(f => {
      const want = facVisible(f), has = lg.hasLayer(f._mk);
      if (want && !has) lg.addLayer(f._mk); else if (!want && has) lg.removeLayer(f._mk);
      const q = S.sim.q && S.sim.q[f.town], el = f._mk.getElement && f._mk.getElement();
      if (el) {
        const inner = el.querySelector('.hv-fac');
        const bad = q && ((f.type === 'pump' && !f.planned && q.load > 1) || (f.type === 'arv' && q.bypass > 0));
        const warn = q && ((f.type === 'pump' && q.load > 0.85) || (f.type === 'arv' && q.arv > 0.9));
        if (inner) inner.className = 'hv-fac' + (bad ? ' alarm' : warn ? ' warn' : '');
      }
    });
  }
  // bräddpunkter: diamond with status, a plume in the recipient while/after it overflows
  function bpIcon(b) {
    const st = b.now > 0 ? 'alarm' : b._risk ? 'warn' : '', tag = b.vol > 0 && map.getZoom() >= 12;
    return '<div class="hv-fac ' + st + '" style="width:20px;height:20px"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 3l8 9-8 9-8-9z" fill="' + (b.now > 0 ? '#5a1420' : '#2a0d14') + '" stroke="' + (b.now > 0 ? '#ff5a6e' : '#ff8a4a') + '" stroke-width="1.7"/><path d="M8 13c1.4-1.6 2.6-1.6 4 0s2.6 1.6 4 0" fill="none" stroke="#ffce7a" stroke-width="1.6" stroke-linecap="round"/></svg>' + (tag ? '<span class="hv-tagv">' + nf(b.vol) + ' m³</span>' : '') + '</div>';
  }
  function syncBradd() {
    const lg = layers.bradd; if (!lg) return;
    const z = map.getZoom();
    D.bps.forEach(b => {
      const key = (b.now > 0 ? 'a' : b._risk ? 'r' : 'o') + (z >= 12 ? 'z' + (b.vol > 0 ? Math.round(Math.log2(b.vol + 1) * 4) : '') : '');
      if (b._key !== key) { b._key = key; b._mk.setIcon(L.divIcon({ className: '', iconSize: [0, 0], html: bpIcon(b) })); }
      const want = S.layers.bradd && (z >= 10.5 || b.now > 0 || b.vol > 0);
      if (want !== lg.hasLayer(b._mk)) want ? lg.addLayer(b._mk) : lg.removeLayer(b._mk);
      // plume: radius grows with the released volume
      const r = b.vol > 0 ? 60 + Math.sqrt(b.vol) * 7 : 0;
      if (r && S.layers.bradd) { b._pl.setRadius(r); b._pl.setStyle({ fillOpacity: b.now > 0 ? 0.32 : 0.18 }); if (!lg.hasLayer(b._pl)) lg.addLayer(b._pl); }
      else if (lg.hasLayer(b._pl)) lg.removeLayer(b._pl);
    });
    const bl = layers.bad; if (!bl) return;
    D.bad.forEach(b => {
      if (b._w !== b.warn) { b._w = b.warn; b._mk.setIcon(L.divIcon({ className: '', iconSize: [0, 0], html: badIcon(b) })); }
      if (S.layers.bad !== bl.hasLayer(b._mk)) S.layers.bad ? bl.addLayer(b._mk) : bl.removeLayer(b._mk);
    });
  }
  const badIcon = b => '<div class="hv-fac' + (b.warn ? ' alarm' : '') + '" style="width:20px;height:20px"><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="' + (b.warn ? '#4a1018' : '#2a2408') + '" stroke="' + (b.warn ? '#ff5a6e' : '#ffe08a') + '" stroke-width="1.6"/><path d="M7 15c1.7-1.5 3.3-1.5 5 0s3.3 1.5 5 0M8 10.5a4 4 0 0 1 8 0z" fill="none" stroke="' + (b.warn ? '#ffb3bc' : '#ffe08a') + '" stroke-width="1.6" stroke-linecap="round"/></svg></div>';

  // mätpunkter
  function sensIcon(sn, st) {
    const c = SENS[sn.cat];
    return '<div class="hv-sens ' + (st === 'bad' ? 'bad' : st === 'warn' ? 'warn' : '') + '" style="--c:' + c.col + '">' + c.g + '</div>';
  }
  function syncSensors() {
    const lg = layers.sens; if (!lg) return;
    const z = map.getZoom(), vb = map.getBounds().pad(0.25);
    S._m = model();
    D.sens.forEach(sn => {
      const v = sensVal(sn); sn._v = v;
      if (sn._st !== v.st) { sn._st = v.st; sn._mk.setIcon(L.divIcon({ className: '', iconSize: [0, 0], html: sensIcon(sn, v.st) })); }
      const want = S.layers.sens && S.cats.includes(sn.cat) && (z >= 11 || sn.cat === 'regn' || sn.cat === 'hav' || v.st === 'bad') && vb.contains([sn.lat, sn.lng]);
      if (want !== lg.hasLayer(sn._mk)) want ? lg.addLayer(sn._mk) : lg.removeLayer(sn._mk);
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
    // cheap projection for the current view: lng → x is linear, lat → y via the Mercator formula
    let pr = null;
    const setProj = () => { const z = map.getZoom(), sc = 256 * 2 ** z, o = map.latLngToContainerPoint([G.n, G.w]); pr = { sc, ox: o.x - (G.w + 180) / 360 * sc, oy: o.y - mercY(G.n) * sc }; };
    const X = lng => (lng + 180) / 360 * pr.sc + pr.ox, Y = lat => mercY(lat) * pr.sc + pr.oy;
    const BUCKETS = [0, 1, 2, 3].map(b => ({ style: 'rgba(' + Math.round(150 - b * 30) + ',' + Math.round(215 - b * 16) + ',255,' + (0.5 + b * 0.15).toFixed(2) + ')', w: 1 + b * 0.6, segs: [] }));
    let odd = false;
    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (!S.layers.flow) { if (!cleared) clear(); P.length = 0; return; }
      if ((odd = !odd)) return; // 30 fps is plenty for drifting water
      const dt = Math.min(80, t - last); last = t;
      const i = intensity();
      setProj();
      const cellPx = 100 / (156543.03 * Math.cos(56 * Math.PI / 180) / (pr.sc / 256));
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = 'rgba(0,0,0,0.86)'; g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'source-over'; cleared = false;
      // dry weather: a calm stream of particles along the rinnvägar only; rain: everywhere, more the harder it rains
      const wet = i > 0.2, b = map.getBounds(), want = wet ? Math.min(1400, Math.round(i * 50 + 150)) : 220;
      let spawn = Math.min(50, Math.max(0, want - P.length));
      while (spawn-- > 0) {
        const lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth()), lng = b.getWest() + Math.random() * (b.getEast() - b.getWest());
        const fi = (lng - G.w) / G.dlng, fj = (G.n - lat) / G.dlat, k = Math.floor(fj) * nx + Math.floor(fi);
        if (fi < 0 || fj < 0 || fi >= nx || fj >= ny || !D.dir[k] || (!wet && D.acc[k] < 40)) continue;
        P.push({ fi, fj, k, age: 0, life: 70 + Math.random() * 80 });
      }
      const speed = clamp(1.6 / cellPx, 0.02, 0.9) * dt / 16;
      BUCKETS.forEach(bk => { bk.segs.length = 0; });
      for (let n = P.length - 1; n >= 0; n--) {
        const p = P[n], r = D.recv[p.k];
        if (r < 0 || p.age++ > p.life) { P[n] = P[P.length - 1]; P.pop(); continue; }
        const ti = r % nx + 0.5, tj = ((r / nx) | 0) + 0.5, dx = ti - p.fi, dy = tj - p.fj, dl = Math.hypot(dx, dy);
        const x0 = X(G.w + p.fi * G.dlng), y0 = Y(G.n - p.fj * G.dlat);
        const acc = D.acc[p.k], sp = speed * (1 + Math.min(2.5, Math.log10(acc) * 0.6));
        if (dl <= sp) { p.fi = ti; p.fj = tj; p.k = r; } else { p.fi += dx / dl * sp; p.fj += dy / dl * sp; }
        BUCKETS[Math.min(3, Math.floor(Math.log10(acc) / 0.9))].segs.push(x0, y0, X(G.w + p.fi * G.dlng), Y(G.n - p.fj * G.dlat));
      }
      g.lineCap = 'round';
      BUCKETS.forEach(bk => { const sg = bk.segs; if (!sg.length) return; g.strokeStyle = bk.style; g.lineWidth = bk.w; g.beginPath(); for (let q = 0; q < sg.length; q += 4) { g.moveTo(sg[q], sg[q + 1]); g.lineTo(sg[q + 2], sg[q + 3]); } g.stroke(); });
    }
    raf = requestAnimationFrame(frame);
    return { remove() { cancelAnimationFrame(raf); map.off('move zoom viewreset', onMove); map.off('resize', size); map.off('zoomanim', clear); cv.remove(); } };
  }

  function buildLayers() {
    const cvNet = L.canvas({ pane: pane('hvNet', 410), padding: 0.15, tolerance: 5 });
    const cvStream = L.canvas({ pane: pane('hvStream', 395), padding: 0.15, tolerance: 3 });
    const svgTrunk = L.svg({ pane: pane('hvTrunk', 440), padding: 0.15 });
    layers.renderers = [cvNet, cvStream, svgTrunk]; // they stay on the map after their paths are gone
    pane('hvWater', 390); pane('hvFac', 615); pane('hvDev', 400); pane('hvSens', 620);
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
      const flow = L.polyline(t.pts, { renderer: svgTrunk, color: t.k === 'dricks' ? '#7cc4ff' : '#ffce7a', weight: 2.6, opacity: 0.95, dashArray: planned ? '10 12' : '2 16' });
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
    // bräddpunkter + plymer, badplatser
    const bl = L.layerGroup();
    D.bps.forEach(b => {
      b._mk = L.marker([b.lat, b.lng], { pane: 'hvFac', icon: L.divIcon({ className: '', iconSize: [0, 0], html: bpIcon(b) }) });
      b._mk.bindTooltip('<b>' + esc(b.name) + '</b><br>Recipient: ' + b.recipient, { className: 'nsva-tip', direction: 'top', offset: [0, -12] });
      b._mk.on('click', () => select({ type: 'bp', ref: b }));
      b._pl = L.circle([b.lat, b.lng], { radius: 60, pane: 'hvWater', stroke: false, fillColor: '#c8823a', fillOpacity: 0.25, interactive: false, className: 'hv-plume' });
    });
    layers.bradd = bl;
    const bd = L.layerGroup();
    D.bad.forEach(b => { b._mk = L.marker([b.lat, b.lng], { pane: 'hvFac', icon: L.divIcon({ className: '', iconSize: [0, 0], html: badIcon(b) }) }); b._mk.on('click', () => select({ type: 'bad', ref: b })); b._mk.bindTooltip(esc(b.name), { className: 'nsva-tip', direction: 'top', offset: [0, -12] }); });
    layers.bad = bd;
    // mätpunkter
    const sl = L.layerGroup();
    D.sens.forEach(sn => {
      sn._mk = L.marker([sn.lat, sn.lng], { pane: 'hvSens', icon: L.divIcon({ className: '', iconSize: [0, 0], html: sensIcon(sn, 'ok') }) });
      sn._mk.bindTooltip(() => '<b>' + esc(sn.name) + '</b><br>' + (sn._v ? sn._v.txt : ''), { className: 'nsva-tip', direction: 'top', offset: [0, -10] });
      sn._mk.on('click', () => select({ type: 'sens', ref: sn }));
    });
    layers.sens = sl;
    // exploateringsområden
    const dv = L.layerGroup();
    D.dev.forEach(d => {
      d._poly = L.polygon(d.pts, { pane: 'hvDev', color: '#ffce7a', weight: 2, dashArray: '6 5', fillColor: '#ffce7a', fillOpacity: 0.1 });
      d._poly.on('click', () => select({ type: 'dev', ref: d }));
      d._lbl = L.marker([d.lat, d.lng], { pane: 'hvFac', interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="hv-lbl">' + esc(d.name.split(' · ')[0]) + '<small>' + (d.units ? nf(d.units) + ' bostäder' : 'verksamheter') + ' · ' + d.year + '</small></div>' }) });
      dv.addLayer(d._poly); dv.addLayer(d._lbl);
    });
    layers.dev = dv;
    // läckor: DMA:er med förhöjt nattflöde → en misstänkt läcka på nätets svagaste ledning, med arbetsorder
    const lk = L.layerGroup();
    D.dmas.filter(d => d.leak).forEach(d => {
      d._mk = L.marker(d.worst.mid, { pane: 'hvFac', icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="hv-leak"></div>' }) });
      d._mk.bindTooltip('<b>Misstänkt läcka</b><br>' + esc(d.name) + ' · ' + nf(d.leakLs, 1) + ' l/s<br>' + d.ao.id + ' · ' + d.ao.status, { className: 'nsva-tip', direction: 'top', offset: [0, -10] });
      d._mk.on('click', () => select({ type: 'dma', ref: d }));
      lk.addLayer(d._mk);
    });
    layers.leaks = lk;
    layers.shut = L.layerGroup();
    layers.particles = makeParticles();
    map.on('zoomend', onZoomEnd); map.on('moveend', onMoveEnd);
    map.on('mousemove', onMouseMove);
  }
  function onZoomEnd() { streamVis(); styleNet(); syncFacilities(); zoomLabels(); syncSensors(); syncBradd(); }
  function onMoveEnd() { syncSensors(); }
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
    on('terrain', layers.terrain); on('sinks', layers.sinks); on('fac', layers.fac); on('dev', layers.dev); on('leaks', layers.leaks); on('sens', layers.sens);
    if (!map.hasLayer(layers.bradd)) layers.bradd.addTo(map);
    if (!map.hasLayer(layers.bad)) layers.bad.addTo(map);
    if (!map.hasLayer(layers.shut)) layers.shut.addTo(map);
    const sh = layers.streams._hvHost; if (S.layers.streams) { if (!map.hasLayer(sh)) sh.addTo(map); } else if (map.hasLayer(sh)) map.removeLayer(sh);
    streamVis();
    // trunks: drinking-water trunks with the dricksvatten net, planned spill trunks with spill / samhällsutveckling
    const tl = layers.trunks;
    if (S.layers.trunks) { if (!map.hasLayer(tl)) tl.addTo(map); tl.eachLayer(g => { const show = g._kind === 'dricks' ? S.net !== 'spill' : (S.net === 'spill' || S.lens === 'samhalle' || S.lens === 'oversikt'); g.eachLayer(l => { const p = l._path; if (p) p.style.display = show ? '' : 'none'; }); }); }
    else if (map.hasLayer(tl)) map.removeLayer(tl);
    syncFacilities(); styleNet(); zoomLabels(); syncSensors(); syncBradd();
  }

  // ---------- avstängningsanalys ----------
  function shutOff(s) {
    const set = new Set([s.idx]), q = [[s.idx, 0]]; let len = s.len;
    while (q.length) {
      const [c, d] = q.shift(); if (d >= 3) continue;
      D.streets[c].adj.forEach(n => { const o = D.streets[n]; if (set.has(n) || o.dmaId !== s.dmaId || len + o.len > 750) return; set.add(n); len += o.len; q.push([n, d + 1]); });
    }
    const edge = new Set(); set.forEach(i => D.streets[i].adj.forEach(n => { if (!set.has(n)) edge.add(n); }));
    const hh = [...set].reduce((a, i) => a + D.streets[i].hh, 0);
    S.shut = { from: s, set, len, hh, valves: Math.max(2, Math.min(9, edge.size)), meters: Math.round(hh * 0.94) };
    styleNet();
  }
  function clearShut() { if (!S.shut) return; S.shut = null; styleNet(); }

  // ---------- selection / info card ----------
  function select(sel) { if (S.shut && !(sel && sel.type === 'pipe' && sel.ref === S.shut.from)) clearShut(); S.sel = sel; renderInfo(); }
  function flyTo(p, z) { map.flyTo(p, z || Math.max(map.getZoom(), 13), { duration: 0.9 }); }
  function region() { map.flyToBounds(D.towns.map(t => [t.lat, t.lng]), { paddingTopLeft: [120, 110], paddingBottomRight: [260, 160], duration: 1.1 }); }
  function spark(vals, c) {
    const W = 270, H = 44, mx = Math.max(...vals), mn = Math.min(...vals), sp = mx - mn || 1;
    const pts = vals.map((v, i) => (i / (vals.length - 1) * W).toFixed(1) + ',' + (H - 4 - (v - mn) / sp * (H - 10)).toFixed(1)).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + (H + 10) + '" width="100%" style="display:block;margin-top:8px"><polygon points="0,' + H + ' ' + pts + ' ' + W + ',' + H + '" fill="' + c + '" opacity=".14"/><polyline points="' + pts + '" fill="none" stroke="' + c + '" stroke-width="1.8"/><text x="0" y="' + (H + 9) + '" font-size="9" fill="#577684" font-family="JetBrains Mono">−24 h</text><text x="' + W + '" y="' + (H + 9) + '" font-size="9" fill="#577684" font-family="JetBrains Mono" text-anchor="end">nu</text></svg>';
  }
  function infoHtml() {
    const sel = S.sel; if (!sel) return '';
    const kv = rows => '<div class="hv-kv">' + rows.filter(Boolean).map(([k, v]) => '<span>' + k + '</span><b>' + v + '</b>').join('') + '</div>';
    const note = (txt, c) => '<div class="hv-note" style="--c:' + (c || COL.ok) + '">' + txt + '</div>';
    const btns = list => '<div class="hv-btns">' + list.map(([a, t, p]) => '<span class="hv-btn' + (p ? ' pri' : '') + '" data-a="' + a + '">' + t + '</span>').join('') + '</div>';
    const head = (t, s) => '<div class="hv-info-t">' + esc(t) + '</div><div class="hv-info-s">' + s + '</div>';
    const town = id => D.tById[id] ? D.tById[id].name : id;
    const m = S._m || model();
    if (sel.type === 'focus') return focusHtml(sel.w, m, { kv, note, btns, head });
    if (sel.type === 'pipe') {
      const s = sel.ref, net = S.net === 'none' ? 'dricks' : S.net;
      if (net === 'dricks') {
        const bar = s.pressure / 10, end = s.year + LIFE[s.mat];
        const sh = S.shut && S.shut.from === s ? S.shut : null;
        return head(town(s.town) + ' · ledning ' + (s.idx + 1), 'Dricksvatten · DMA ' + s.dmn) + kv([
          ['Material', s.mat], ['Dimension', s.dim + ' mm'], ['Anlagd', s.year], ['Längd', nf(s.len) + ' m'], ['Markhöjd', nf(s.elev, 1) + ' m'],
          ['Tryck', nf(bar, 1) + ' bar'], s.pressure0 != null ? [s.pressure0 > s.pressure ? 'Utan tryckreducering' : 'Utan tryckstegring', nf(s.pressure0 / 10, 1) + ' bar'] : null, ['Vattenålder', nf(s.age) + ' h · klor ' + nf(s.chlorine, 2) + ' mg/l'], ['Riskindex', s.risk + ' / 100'], ['Teknisk livslängd', 'till ' + end], ['Hushåll', s.hh]]) +
          (sh ? note('<b>Avstängning:</b> ' + sh.set.size + ' ledningar (' + nf(sh.len) + ' m) blir utan vatten. Stäng <b>' + sh.valves + ' ventiler</b>. <b>' + nf(sh.hh) + ' hushåll</b> berörs – ' + nf(sh.meters) + ' har smarta mätare och får SMS automatiskt.', '#ff4fd8') + btns([['unshut', 'Avbryt analys'], ['sms', 'Skicka SMS (simulerat)', true]])
            : note(bar < 2.5 ? 'Lågt tryck på grund av markhöjden – tryckstegring eller ny tryckzon behövs.' : end < S.year ? 'Ledningen har passerat sin tekniska livslängd i ' + S.year + ' – kandidat för förnyelse.' : s.risk > 65 ? 'Hög risk: ålder och material ger hög sannolikhet för läcka.' : s.age > 36 ? 'Gammalt vatten i nätets yttersta del – spolning eller rundmatning förbättrar kvaliteten.' : 'Inga åtgärder föreslagna.', bar < 2.5 || s.risk > 65 || s.age > 36 ? COL.warn : COL.ok) + btns([['shut:' + s.idx, 'Simulera avstängning', true]]));
      }
      if (net === 'spill') {
        const q = S.sim.q && S.sim.q[s.town];
        return head(town(s.town) + ' · ledning ' + (s.idx + 1), 'Spillvatten · självfall') + kv([['Material', s.spMat], ['Dimension', s.spDim + ' mm'], ['Anlagd', s.year], ['Lutning', nf(s.slope, 1) + ' ‰'], ['Flödesriktning', 'mot lägre ände'], ['Belastning nu', Math.round(loadOf(s, 'spill') * 100) + ' %'], ['Tillskottsvatten', Math.round(tillskott(s.town) * 1000) / 10 + ' % per mm/h']]) +
          note(s.slope < 2 ? 'Flack ledning – risk för sedimentering och stopp. Spolningsplan föreslås.' : s.year < 1965 ? 'Betongledning från före 1965 – hög andel tillskottsvatten troligt. Relining minskar bräddningen nedströms.' : 'Normal självfallsledning.', s.slope < 2 || s.year < 1965 ? COL.warn : COL.ok);
      }
      const ld = loadOf(s, 'dag');
      return head(town(s.town) + ' · ledning ' + (s.idx + 1), 'Dagvatten') + kv([['Material', s.dagMat], ['Dimension', s.dagDim + ' mm'], ['Anlagd', s.dagYear], ['Dimensionerat för', s.design + ' mm/h'], ['Med klimatfaktor ' + nf(SCEN[S.year].clim, 1), nf(s.design / SCEN[S.year].clim, 0) + ' mm/h'], ['Tillrinning', nf(s.catch) + ' ha'], ['Belastning nu', Math.round(ld * 100) + ' %']]) +
        note(ld >= 1 ? 'Ledningen går full – vatten tar sig ut på gatan och söker sig till närmaste lågpunkt.' : s.design < 30 ? 'Dimensionerad för dagens regn men inte för framtidens – planera skyfallsytor uppströms.' : 'Klarar dimensionerande regn.', ld >= 1 ? COL.bad : s.design < 30 ? COL.warn : COL.ok);
    }
    if (sel.type === 'fac') {
      const f = sel.ref, t = m.towns.find(x => x.id === f.town), q = S.sim.q && S.sim.q[f.town];
      const rows = [['Kommun', town(f.town)], ['Markhöjd', nf(f.elev, 1) + ' m ö.h.']];
      let txt = '', w = null;
      if (f.type === 'vattenverk') { w = 'dricks'; rows.push(['Kapacitet', nf(t.cap) + ' m³/h'], ['Behov ' + S.year, nf(t.demand) + ' m³/h'], ['Nyttjandegrad', Math.round(t.demand / t.cap * 100) + ' %'], ['PFAS4', nf(0.5 + hash(f.town + '-vv') * 2.2, 1) + ' ng/l (gräns 4)'], ['Energi', nf(0.32 + hash(f.id + 'e') * 0.2, 2) + ' kWh/m³']); txt = t.demand / t.cap > 0.85 ? 'Nära kapacitetstaket ' + S.year + ' – utbyggnad eller regional överföring krävs.' : 'Kapacitet räcker ' + S.year + '.'; }
      else if (f.type === 'reservoar') { w = 'dricks'; rows.push(['Nivå nu', Math.round(f._lvl) + ' %'], ['Vattenyta', nf(f.head, 1) + ' m ö.h.'], ['Reservtid', nf(6 + hash(f.id) * 10, 0) + ' h']); txt = 'Placerad på ortens högsta punkt – höjden ger trycket i nätet utan pumpar.'; }
      else if (f.type === 'booster') { rows.push(['Tryckhöjning', '+' + f.lift + ' m (' + nf(f.lift / 10, 1) + ' bar)'], ['Försörjer', D.streets.filter(s => s.zone === f.id).length + ' ledningar']); txt = 'Här ligger marken för högt för att reservoaren ska ge tillräckligt tryck – tryckstegringen skapar en egen tryckzon.'; }
      else if (f.type === 'arv') { w = 'spill'; rows.push(['Kapacitet', nf(t.arvCap) + ' m³/h'], ['Inflöde nu', nf(q ? Math.min(q.q, q.pumpCap) : t.arvIn) + ' m³/h'], ['Belastning', Math.round((q ? q.arv : t.arvLoad) * 100) + ' %'], q && q.bypass > 0 ? ['Nödavlastning', nf(q.bypass) + ' m³/h'] : null); txt = (q && q.bypass > 0) ? 'Verket tar inte emot allt – delvis renat vatten släpps via nödavlastningen.' : t.arvLoad > 0.85 ? 'Reningsverket närmar sig full belastning – nya EU-krav (mikroföroreningar) kräver dessutom ett fjärde reningssteg.' : 'Ligger lågt vid recipienten så att spillvattnet når verket med självfall.'; }
      else if (f.type === 'pump') { w = 'spill'; rows.push(['Kapacitet', nf(f.cap) + ' m³/h'], f.lift ? ['Lyfthöjd', nf(f.lift, 1) + ' m'] : null, f.planned ? ['Status', 'Planerad ' + f.planned] : ['Belastning', Math.round((q ? q.load : 0.45) * 100) + ' %']); txt = f.planned ? 'Planerad station: terrängen stiger längs överföringen, så vattnet måste pumpas över höjden.' : 'Ortens lägsta punkt – här samlas spillvattnet. Förtömning inför regn ger plats i sumpen och minskar bräddning.'; }
      const sens = D.sens.filter(sn => sn.ref === f);
      return head(f.name, FAC_LABEL[f.type] + (f.planned ? ' · planerad' : '')) + kv(rows) + (sens.length ? '<div class="hv-cap" style="margin:10px 0 4px">Mätpunkter</div>' + sens.map(sn => sensRow(sn)).join('') : '') + note(txt, COL.ok) + (w ? btns([['widget:' + w, 'Öppna detaljvy →']]) : '');
    }
    if (sel.type === 'sens') {
      const sn = sel.ref, v = sensVal(sn), c = SENS[sn.cat], stc = v.st === 'bad' ? COL.bad : v.st === 'warn' ? COL.warn : COL.ok;
      const why = { flode: 'Flödet i realtid visar läckor, kapacitet och tillskottsvatten.', niva: 'Nivån styr pumpar och ventiler – och varnar innan något svämmar över.', tryck: 'Trycket mäts i nätets kritiska punkt, där det är lägst.', regn: 'Regnet i realtid driver tvillingens prognoser för dagvatten och bräddning.', kvalitet: 'Kvaliteten följs kontinuerligt i stället för stickprov.', hav: 'Havsnivån avgör om dagvattenutloppen kan rinna ut.', grund: 'Grundvattennivån varnar för torka i vattentäkten.', lacka: 'Loggern lyssnar efter läckljud nattetid och ringar in läckan.', energi: 'Energin per m³ är grunden för prisstyrd drift och energineutralitet.' }[sn.cat];
      return head(sn.name, c.label + 'mätare · ' + (sn.cat === 'regn' || sn.cat === 'hav' ? 'live från ' + (sn.cat === 'hav' ? 'SMHI' : sn.g.src) : 'simulerad')) +
        '<div class="hv-big" style="color:' + stc + '">' + v.txt + '</div>' + kv([['Status', v.st === 'bad' ? 'Larm' : v.st === 'warn' ? 'Varning' : 'Normal'], ['Gräns', v.lim || '–'], v.extra ? ['', v.extra] : null, ['Kommunikation', ['NB-IoT', 'LoRaWAN', '4G', 'Fiber'][Math.floor(hash(sn.id) * 4)]], ['Senast', 'för ' + (1 + Math.floor(hash(sn.id + 't') * 50)) + ' s sedan']]) +
        spark(sensHist(sn, v.v), c.col) + note(why, c.col) + (sn.ref && sn.ref.type ? btns([['fac:' + D.fac.indexOf(sn.ref), 'Visa ' + sn.ref.name]]) : '');
    }
    if (sel.type === 'bp') {
      const b = sel.ref, t = m.towns.find(x => x.id === b.town), fc = forecast().find(x => x.town === b.town), share = b.yearM3 / (t.arvBase * 8760) * 100;
      const bs = D.sens.find(sn => sn.ref === b), bv = bs ? sensVal(bs) : null;
      return head(b.name, (b.atArv ? 'Nödavlastning vid reningsverket' : 'Bräddpunkt i ledningsnätet') + ' · recipient ' + b.recipient) + (bv ? '<div class="hv-big" style="color:' + (bv.st === 'bad' ? COL.bad : bv.st === 'warn' ? COL.warn : COL.ok) + '">' + bv.txt + '<small> till bräddkrön</small></div>' : '') +
        kv([['Status', b.now > 0 ? 'BRÄDDAR · ' + nf(b.now) + ' m³/h' : fc && !b.atArv ? 'Risk ' + whenH(fc.h) : 'Normal'], b.vol > 0 ? ['Detta tillfälle', nf(b.vol) + ' m³ · ' + b.dur + ' min'] : null, ['Tillfällen i år', b.yearN], ['Volym i år', nf(b.yearM3) + ' m³'], ['Andel av årsflödet', nf(share, 2) + ' %'], ['Bräddkrön', b.krona + ' cm'], ['Mätning', 'nivå + volym']]) +
        note(b.now > 0 ? '<b>Åtgärd nu:</b> maximera pumpning till ' + (t.id === 'bjuv' || t.id === 'astorp' ? 'Helsingborg' : 'verket') + ', informera kommunens miljöförvaltning och sätt avrådan på närliggande badplatser.' : fc && !b.atArv ? '<b>Prognos:</b> ' + nf(fc.i, 1) + ' mm/h ' + whenH(fc.h) + ' ger bräddning. <b>Förtöm</b> pumpstationen och aktivera magasin nu. Varje bräddning mäts och rapporteras till tillsynsmyndigheten.' : b.yearN > 6 ? 'Bräddar ofta – ett fördröjningsmagasin på ca ' + nf(Math.round(b.yearM3 / b.yearN / 100) * 100) + ' m³ eller separering av dagvattnet uppströms halverar bräddningen.' : 'Inom målet. Fortsatt övervakning.', b.now > 0 ? COL.bad : (fc && !b.atArv) || b.yearN > 6 ? COL.warn : COL.ok) + btns([['widget:spill', 'Spillvatten-widget →'], ['preset:r10', 'Simulera 10-årsregn', true]]);
    }
    if (sel.type === 'bad') { const b = sel.ref, near = D.bps.filter(p => p.recipient !== 'vattendrag' && kmDist(p, b) < 3.5); return head(b.name, 'Badplats · fiktiv') + kv([['Status', b.warn ? 'Avrådan från bad · 48 h' : 'Bra badvatten'], ['Bräddpunkter inom 3,5 km', near.length], near.length ? ['Närmast', esc(near[0].name)] : null]) + note(b.warn ? 'En bräddning nära stranden har släppt ut orenat avloppsvatten. Tvillingen sätter avrådan automatiskt och meddelar kommunens miljöförvaltning.' : 'Tvillingen bevakar bräddpunkterna i närheten och varnar direkt om de släpper ut.', b.warn ? COL.bad : COL.ok); }
    if (sel.type === 'sink') {
      const s = sel.ref, hh = s.hh;
      const wet = hh == null ? 0 : s.cells.filter(c => c[2] > hh).length * D.G.cellM2, depth = hh == null ? 0 : s.maxD - hh;
      return head(s.name, 'Instängt område · lågpunkt') + kv([['Volym när fullt', nf(s.vol) + ' m³'], ['Största djup', nf(s.maxD, 1) + ' m'], ['Yta', nf(s.area / 1e4, 1) + ' ha'], ['Tillrinningsområde', nf(s.catch / 1e6, 2) + ' km²'], ['Fyllnad nu', Math.round(s.V / s.vol * 100) + ' %'], ['Vattendjup nu', nf(depth, 2) + ' m'], ['Berörd yta', nf(wet / 1e4, 1) + ' ha']]) +
        note('Här samlas vattnet när ledningarna går fulla. Förslag: <b>skyfallsyta</b> (park/torg som får svämmas över) och höjdsättning så att vattnet leds bort från byggnader.', COL.vio) + btns([['widget:dag', 'Dagvatten-widget →']]);
    }
    if (sel.type === 'dev') return head(sel.ref.name, sel.ref.kind + ' · fiktivt exploateringsområde') + devChecks(sel.ref).html;
    if (sel.type === 'trunk') { const t = sel.ref; return head(t.name, (t.k === 'dricks' ? 'Dricksvatten' : 'Spillvatten') + ' · överföringsledning') + kv([['Längd', nf(t.len / 1000, 1) + ' km'], ['Dimension', t.d + ' mm'], ['Status', t.st === 'planerad' ? 'Planerad ' + t.y : 'I drift sedan ' + t.y]]) + note(t.st === 'planerad' ? 'Vision: små reningsverk avvecklas och spillvattnet pumpas till större verk som klarar de nya EU-kraven.' : 'Regional sammankoppling ger redundans: vid avbrott kan orterna försörjas från grannens vattenverk.'); }
    if (sel.type === 'dma') { const d = sel.ref; return head(d.name, 'DMA · mätområde') + kv([['Ledningslängd', nf(d.len / 1000, 1) + ' km'], ['Medelålder', nf(d.age) + ' år'], ['Smarta mätare', nf(d.meters)], ['Minsta nattflöde', nf(d.mnf + d.leakLs, 1) + ' l/s'], ['Förväntat', nf(d.mnf, 1) + ' l/s'], d.leak ? ['Avvikelse', '+' + nf(d.leakLs, 1) + ' l/s'] : null, d.ao ? ['Arbetsorder', d.ao.id + ' · ' + d.ao.crew] : null]) + (d.leak ? note('Nattflödet ligger över det normala och de smarta mätarna visar att det inte är kunderna. Akustiska loggrar har ringat in läckan – <b>' + nf(d.leakLs * 86.4) + ' m³ per dygn</b> går förlorat. ' + d.ao.status + '.', COL.bad) : note('Nattflödet är normalt.', COL.ok)) + btns([['pipe:' + d.worst.idx, 'Visa ledningen'], ['widget:flode', 'Flödesmätare-widget →']]); }
    if (sel.type === 'stream') {
      const G = D.G, i = Math.floor((sel.ll.lng - G.w) / G.dlng), j = Math.floor((G.n - sel.ll.lat) / G.dlat);
      let a = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const q = (j + dj) * G.nx + i + di; if (D.acc[q] > a) a = D.acc[q]; }
      const km2 = a * G.cellM2 / 1e6;
      return head('Rinnväg', 'Beräknad ur höjdmodellen') + kv([['Tillrinningsområde', nf(km2, km2 < 10 ? 1 : 0) + ' km²'], ['Flöde vid 100-årsregn', nf(km2 * 1e6 * 0.06 / 1000 / 3.6 * 0.35, 0) + ' m³/s (grovt)']]) + note('Så här rinner vattnet ovan mark när ledningarna inte räcker. Bygg inte i rinnvägar – eller lämna plats för vattnet.', COL.water);
    }
    return '';
  }
  function sensRow(sn) { const v = sensVal(sn), stc = v.st === 'bad' ? COL.bad : v.st === 'warn' ? COL.warn : COL.ok, nm = sn.name.split(' · '); return '<div class="hv-row" data-a="sens:' + D.sens.indexOf(sn) + '"><span class="hv-sens sm" style="--c:' + SENS[sn.cat].col + '">' + SENS[sn.cat].g + '</span><div class="hv-n">' + esc(nm[1] || nm[0]) + (nm[1] ? '<small>' + esc(nm[0]) + '</small>' : '') + '</div><div class="hv-v" style="color:' + stc + '">' + v.txt + '</div></div>'; }
  // a widget clicked in the right column: what it means in the twin
  function focusHtml(w, m, h) {
    const towns = m.towns, q = S.sim.q;
    if (w === 'spill') {
      const over = D.bps.filter(b => b.now > 0), fc = forecast();
      return h.head('Spillvatten i tvillingen', 'Spillvattennät · pumpstationer · bräddpunkter') + h.kv([['Bräddpunkter', D.bps.length + ' st'], ['Bräddar nu', over.length ? over.length + ' st' : 'inga'], ['Bräddat i år', nf(m.braddYear) + ' m³'], ['Andel av årsflödet', nf(m.braddPct, 2) + ' % (EU-mål < ' + EU_OVERFLOW + ' %)'], ['Bräddrisk 12 h', fc.length ? fc.length + (fc.length === 1 ? ' ort' : ' orter') : 'ingen']]) +
        fc.map(x => '<div class="hv-row" data-a="bp:' + D.bps.findIndex(b => b.town === x.town && !b.atArv) + '"><span class="hv-light" style="--c:' + COL.warn + '"></span><div class="hv-n">' + esc(D.tById[x.town].name) + '<small>bräddar ' + whenH(x.h) + ' vid ' + nf(x.i, 1) + ' mm/h</small></div></div>').join('') +
        towns.map(t => { const l = q && q[t.id] ? q[t.id].load : t.arvIn / t.pumpCap; return '<div class="hv-row" style="cursor:default"><div class="hv-n">' + esc(t.name) + '<small>pumpstationer ' + Math.round(l * 100) + ' % · ARV ' + Math.round((q && q[t.id] ? q[t.id].arv : t.arvLoad) * 100) + ' %</small></div><div style="width:90px">' + bar(l * 100, l > 1 ? COL.bad : l > 0.85 ? COL.warn : COL.ok) + '</div></div>'; }).join('') +
        h.btns([['widget:spill', 'Öppna detaljvy →'], ['preset:r10', 'Simulera 10-årsregn', true]]);
    }
    if (w === 'dag') {
      const full = D.sinks.filter(s => s.V >= s.vol).length, wet = D.sinks.filter(s => s.V > 0).length;
      return h.head('Dagvatten i tvillingen', 'Dagvattennät · rinnvägar · lågpunkter') + h.kv([['Regn nu', nf(intensity(), 1) + ' mm/h'], ['Lågpunkter med vatten', wet + ' / ' + D.sinks.length], ['Fulla lågpunkter', full], ['Total volym', nf(m.sinkVol) + ' m³']]) + h.note('Dagvattennätet är färgat efter belastning. Kör en simulering för att se var vattnet tar vägen när ledningarna går fulla.', COL.dag) + h.btns([['widget:dag', 'Öppna detaljvy →'], ['preset:r100', 'Simulera 100-årsregn', true]]);
    }
    if (w === 'dricks' || w === 'flode') {
      const lowP = D.streets.filter(s => s.pressure < 25).length, leaks = D.dmas.filter(d => d.leak);
      return h.head(w === 'flode' ? 'Flödesmätare i tvillingen' : 'Dricksvatten i tvillingen', 'Vattenverk · reservoarer · DMA-mätare') + h.kv([['Produktion nu', nf(m.towns.reduce((a, t) => a + t.demand * dfac(hourNow()), 0)) + ' m³/h'], ['Flödesmätare', D.sens.filter(s => s.cat === 'flode').length + ' st'], ['DMA:er', D.dmas.length + ' · ' + leaks.length + ' med läcka'], ['Ledningar < 2,5 bar', lowP]]) + leaks.slice(0, 3).map(d => '<div class="hv-row" data-a="dma:' + D.dmas.indexOf(d) + '"><span class="hv-light" style="--c:' + COL.bad + '"></span><div class="hv-n">' + esc(d.name) + '<small>' + d.ao.id + ' · ' + d.ao.status + '</small></div><div class="hv-v">+' + nf(d.leakLs, 1) + ' l/s</div></div>').join('') + h.btns([['widget:' + w, 'Öppna detaljvy →']]);
    }
    if (w === 'matare' || w === 'radar' || w === 'prognos') {
      const g = D.sens.filter(s => s.cat === 'regn').map(s => ({ s, v: sensVal(s) })).sort((a, b) => b.v.v - a.v.v);
      return h.head(w === 'matare' ? 'Regnmätare i tvillingen' : 'Nederbörd i tvillingen', 'Live-regn driver dagvatten och bräddning') + h.kv([['Regn nu (max)', nf(ctx.rainNow ? ctx.rainNow() : 0, 1) + ' mm/h'], ['Om 3 h (max)', nf(ctx.rainAt(3) || 0, 1) + ' mm/h'], ['Regnmätare', g.length + ' st']]) + g.slice(0, 5).map(x => sensRow(x.s)).join('') + h.btns([['widget:' + w, 'Öppna detaljvy →'], ['preset:live', 'Kör live-prognosen', true]]);
    }
    if (w === 'hav') return h.head('Havsnivå i tvillingen', 'SMHI:s stationer · framtida högvatten') + h.kv([['Nu', '+' + Math.round(ctx.seaCm ? ctx.seaCm() : 0) + ' cm'], ['Scenario ' + S.year, '+' + nf(SCEN[S.year].sea * 100) + ' cm medel'], ['Ledning under nivån', nf(m.lowPipes, 1) + ' km']]) + h.note('Havsnivålagret visar mark under dagens nivå. Lägg till 100-årshögvatten för att se framtidens risk.', '#5aa0ff') + h.btns([['widget:hav', 'Öppna detaljvy →'], ['surge', 'Visa högvatten', true]]);
    if (w === 'anmal' || w === 'alarm') return h.head(w === 'anmal' ? 'Anmälningar i tvillingen' : 'Alarm i tvillingen', 'Visas som lager från dagens Hydra') + h.note(w === 'anmal' ? 'Översvämningsanmälningarna från allmänheten ligger nu på kartan. Jämför med lågpunkterna – de sammanfaller ofta.' : 'Alarmen ligger nu på kartan tillsammans med tvillingens mätpunkter i larm.', COL.warn) + h.btns([['widget:' + w, 'Öppna detaljvy →']]);
    return '';
  }
  function renderInfo() {
    const box = ctx && ctx.hudEl && ctx.hudEl.querySelector('[data-pnl="info"]'); if (!box) return;
    const html = infoHtml();
    box.hidden = !html;
    if (html) { const b = box.querySelector('[data-body="info"]'); if (b._html !== html) { b.innerHTML = html; b._html = html; } }
  }

  // ---------- exploatering: VA-utlåtande ----------
  function devChecks(d) {
    const m = S._m || model(), t = m.towns.find(x => x.id === d.town), Tn = D.tById[d.town];
    const add = (d.units * 2.2 * 0.16 + d.jobs * 0.05) / 24 * 1.4; // m³/h
    const arvMargin = 1 - (t.arvBase / popF(d.town, S.year) * popF(d.town, Math.max(S.year, d.year)) + add) / t.arvCap;
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
      ['Bräddning', 'EU:s nya avloppsdirektiv: bräddningen ska under 2 % av årsbelastningen, med åtgärdsplaner per tätort.', nf(m.braddPct, 1) + ' %', m.braddPct > EU_OVERFLOW ? COL.bad : COL.warn],
      ['Havsnivå', 'Medelnivån höjs, och vid högvatten ligger ' + nf(m.lowPipes, 1) + ' km ledning under vattenytan.', '+' + nf(sc.sea * 100) + ' cm', sc.sea > 0.1 ? COL.bad : COL.warn],
      ['Förnyelseskuld', 'Ledningar över teknisk livslängd med dagens förnyelsetakt (0,6 %/år).', nf(m.debtToday, 0) + ' km', m.debtToday > m.len * 0.1 ? COL.bad : COL.warn],
      ['Kapacitet', 'Befolkningen ökar – regionens vattenverk ska klara största dygnet även om ett verk faller bort (N-1).', m.n1 ? 'N-1 OK' : 'N-1 brister', m.n1 ? COL.ok : COL.bad],
      ['Fjärde reningssteget', 'Rening av mikroföroreningar, skärpta kväve/fosforkrav och energineutrala verk till 2045.', '2045', COL.warn],
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
    const fc = forecast(), worstBp = D.bps.slice().sort((a, b) => b.yearN - a.yearN)[0];
    const oldWater = D.streets.filter(s => s.age > 36);
    const lens = S.lens;
    if (fc.length) out.push(ins('!', COL.bad, '<b>Bräddrisk</b> enligt prognosen: ' + fc.slice(0, 3).map(x => D.tById[x.town].name + ' ' + whenH(x.h)).join(', ') + (fc.length > 3 ? ' m.fl.' : '') + '. Förtöm pumpstationerna nu.', 'bp:' + D.bps.findIndex(b => b.town === fc[0].town)));
    if (lens === 'oversikt' || lens === 'samhalle') out.push(ins('≈', COL.vio, '<b>' + D.sinks.length + ' instängda lågpunkter</b> i orterna rymmer ' + nf(m.sinkVol / 1000) + ' 000 m³. Största: ' + esc(bigSink.name) + ' (' + nf(bigSink.vol) + ' m³).', 'sink:0'));
    if (lens === 'oversikt' || lens === 'distribution') out.push(ins('!', COL.bad, '<b>' + leaks.length + ' DMA:er</b> har förhöjt nattflöde – sammanlagt ' + nf(leakSum, 1) + ' l/s (' + nf(leakSum * 86.4) + ' m³/dygn). Arbetsorder är skapade.', leaks.length ? 'dma:' + D.dmas.indexOf(leaks[0]) : null));
    if (lens === 'distribution') out.push(ins('~', COL.warn, '<b>' + esc(worstBp.name) + '</b> bräddade ' + worstBp.yearN + ' gånger i år. Ett magasin eller separering uppströms ger störst effekt.', 'bp:' + D.bps.indexOf(worstBp)));
    if (lens !== 'samhalle') out.push(ins('↑', COL.warn, '<b>' + lowP.length + ' ledningar</b> ligger så högt att trycket blir under 2,5 bar – tryckstegring föreslås bl.a. i ' + esc(lowTown) + '.', lowP.length ? 'pipe:' + lowP[0].idx : null));
    if (lens === 'produktion' || lens === 'distribution') out.push(ins('⌛', COL.warn, '<b>' + oldWater.length + ' ledningar</b> har vattenålder över 36 h – risk för låg restklor. Rundmatning eller spolning föreslås.', oldWater.length ? 'pipe:' + oldWater[0].idx : null));
    if (lens === 'distribution' || lens === 'oversikt') out.push(ins('⌛', COL.warn, '<b>' + nf(castOld, 1) + ' km gjutjärn</b> från före 1955. Med visionens förnyelsetakt (1,2 %/år) är skulden borta ' + (m.debtVision < 1 ? 'före ' + S.year : 'efter ' + S.year) + '.', null));
    if (lens === 'produktion' || lens === 'oversikt') out.push(ins(m.n1 ? '✓' : '!', m.n1 ? COL.ok : COL.bad, m.n1 ? 'Regionen klarar <b>N-1</b> ' + S.year + ': största dygnet täcks även om största verket står still.' : '<b>N-1 brister ' + S.year + '</b>: faller största verket bort saknas ' + nf(m.peak - m.n1Cap) + ' m³/h på största dygnet, trots regional reservförsörjning.', null));
    if (lens === 'samhalle' && devBad.length) out.push(ins('⚑', COL.bad, '<b>' + devBad.length + ' exploateringsområden</b> kräver VA-investeringar innan planen kan antas – t.ex. ' + esc(devBad[0].name) + '.', 'dev:' + D.dev.indexOf(devBad[0])));
    if (lens === 'produktion') out.push(ins('⚡', COL.ok, 'Reservoarerna fylls nattetid när elen är billig: <b>−14 % energikostnad</b> med prisstyrd pumpning (AI-optimerad).', null));
    return out.join('');
  }
  function sensCard() {
    const by = {}; D.sens.forEach(sn => { const v = sn._v || sensVal(sn); const b = by[sn.cat] || (by[sn.cat] = { n: 0, w: 0, a: 0 }); b.n++; if (v.st === 'warn') b.w++; if (v.st === 'bad') b.a++; });
    const alarms = D.sens.filter(sn => (sn._v || {}).st === 'bad').concat(D.sens.filter(sn => (sn._v || {}).st === 'warn')).slice(0, 6);
    return card('Mätpunkter i tvillingen', '<div class="hv-sgrid">' + Object.keys(SENS).filter(k => by[k]).map(k => '<div class="hv-sg' + (S.cats.includes(k) && S.layers.sens ? ' on' : '') + '" data-a="cat:' + k + '"><span class="hv-sens sm" style="--c:' + SENS[k].col + '">' + SENS[k].g + '</span><b>' + by[k].n + '</b><span>' + SENS[k].label + '</span>' + (by[k].a ? '<i style="color:' + COL.bad + '">' + by[k].a + ' larm</i>' : by[k].w ? '<i style="color:' + COL.warn + '">' + by[k].w + ' varn.</i>' : '<i>OK</i>') + '</div>').join('') + '</div>' +
      (alarms.length ? '<div class="hv-cap" style="margin:10px 0 4px">Avvikelser</div>' + alarms.map(sensRow).join('') : '') + '<div class="hv-foot" style="padding:8px 0 0">' + D.sens.length + ' mätpunkter · regn och hav är live, övriga simulerade. Klicka på en kategori för att visa den på kartan.</div>', 'IoT');
  }
  function braddCard(m) {
    const fc = forecast(), now = D.bps.filter(b => b.now > 0);
    const list = D.bps.slice().sort((a, b) => (b.now - a.now) || (b.yearM3 - a.yearM3)).slice(0, 7);
    return card('Bräddning', '<div class="hv-kpis">' + kpi(D.bps.length, 'st', 'Bräddpunkter', 'alla med nivåmätning') + kpi(now.length || '0', 'st', 'Bräddar nu', now.length ? nf(now.reduce((a, b) => a + b.now, 0)) + ' m³/h' : 'normal drift', now.length ? COL.bad : COL.ok) + kpi(nf(m.braddYear / 1000, 1), 'k m³', 'Bräddat i år', D.bps.reduce((a, b) => a + b.yearN, 0) + ' tillfällen') + kpi(nf(m.braddPct, 2), '%', 'Av årsbelastningen', 'EU-mål < ' + EU_OVERFLOW + ' %', m.braddPct > EU_OVERFLOW ? COL.bad : COL.ok) + '</div>' +
      '<div style="margin-top:10px">' + bar(m.braddPct / EU_OVERFLOW * 100, m.braddPct > EU_OVERFLOW ? COL.bad : m.braddPct > EU_OVERFLOW * 0.7 ? COL.warn : COL.ok) + '</div>' +
      '<div class="hv-cap" style="margin:12px 0 4px">Prognos 12 h</div>' + (fc.length ? fc.map(x => ins('!', COL.warn, '<b>' + D.tById[x.town].name + '</b> bräddar ' + whenH(x.h) + ' vid ' + nf(x.i, 1) + ' mm/h. <b>Förtöm</b> pumpstationen och aktivera magasin.', 'bp:' + D.bps.findIndex(b => b.town === x.town))).join('') : '<div class="hv-txt">Ingen bräddrisk enligt prognosen.</div>') +
      '<div class="hv-cap" style="margin:12px 0 4px">Bräddpunkter</div>' + list.map(b => '<div class="hv-row" data-a="bp:' + D.bps.indexOf(b) + '"><span class="hv-light" style="--c:' + (b.now > 0 ? COL.bad : b.yearN > 6 ? COL.warn : COL.ok) + '"></span><div class="hv-n">' + esc(b.name) + '<small>' + b.recipient + ' · ' + b.yearN + ' ggr i år</small></div><div class="hv-v">' + (b.now > 0 ? nf(b.now) + ' m³/h' : nf(b.yearM3) + ' m³') + '</div></div>').join(''), 'EU 2 %');
  }
  function panelHtml() {
    const m = S._m || model(), y = S.year, lens = S.lens;
    const head = '<div class="hv-card hv-hero"><div class="hv-hero-t">HYDRA · VISIONEN</div><div class="hv-hero-s">En digital tvilling av hela NSVA: verklig terräng, alla ledningar, alla mätare och all produktionsdata – i realtid och mot ' + (y === 2026 ? 'framtiden' : y) + '.</div></div>';
    let body = '';
    if (lens === 'oversikt') {
      const pop = m.towns.reduce((a, t) => a + t.pop, 0), sAl = D.sens.filter(sn => (sn._v || {}).st === 'bad').length;
      body += card('Hydra-index ' + y, '<div class="hv-rings">' + [['Produktion', m.prodScore], ['Ledningsnät', m.netScore], ['Avlopp', m.spillScore], ['Klimat', m.climScore]].map(([l, v]) => '<div class="hv-ring">' + ringSvg(v, scoreCol(v)) + l + '</div>').join('') + '</div>');
      body += card('Live i tvillingen', '<div class="hv-kpis">' + kpi(nf(intensity(), 1), 'mm/h', 'Regn ' + (simOn() ? '(sim.)' : 'nu'), simOn() ? 'simulering pågår' : 'SMHI/DMI', intensity() > 10 ? COL.warn : COL.ok) + kpi(D.bps.filter(b => b.now > 0).length, 'st', 'Bräddar nu', D.bps.length + ' bräddpunkter', D.bps.some(b => b.now > 0) ? COL.bad : COL.ok) + kpi(D.sens.length, 'st', 'Mätpunkter', sAl ? sAl + ' i larm' : 'alla normala', sAl ? COL.bad : COL.ok) + kpi(D.dmas.filter(d => d.leak).length, 'st', 'Läckor', 'med arbetsorder', COL.warn) + '</div>');
      body += card('Hela verksamheten', '<div class="hv-kpis">' + kpi(nf(pop / 1000), 'tusen', 'Invånare ' + y, y > 2026 ? '+' + nf((pop / m.towns.reduce((a, t) => a + popAt(t.id, 2026), 0) - 1) * 100) + ' % mot idag' : '8 kommuner', COL.ok) + kpi(nf(m.dem), 'm³/h', 'Vattenbehov', Math.round(m.dem / m.capTot * 100) + ' % av kapacitet') + kpi(nf(m.len), 'km', 'Modellerat nät', D.streets.length + ' ledningar') + kpi(D.fac.length, 'st', 'Anläggningar', D.fac.filter(f => f.planned).length + ' planerade') + '</div>');
      body += card('AI-insikter', insightsFor(m), 'Hydra AI');
      body += sensCard();
      body += card('Utmaningar i VA-branschen', challenges(m), y);
      body += card('Vägen dit', '<div class="hv-steps">' + [
        ['2025', 'Skyfall live', 'Radar, SMHI, DMI och regnmätare i en vy.', COL.ok],
        ['2026', 'All produktionsdata', 'SCADA från vattenverk, reservoarer, pumpstationer och ARV in i Hydra.', 'var(--ac,#35d6f2)'],
        ['2027', 'Digital tvilling av nätet', 'Ledningsdatabasen kopplas till höjdmodell och hydraulisk modell.', '#7fa8b5'],
        ['2028', 'Smarta mätare & DMA', 'Läckor hittas på timmar i stället för månader.', '#7fa8b5'],
        ['2029', 'Styrd bräddning', 'Prognosstyrd förtömning och magasin (RTC) – bräddning under EU:s 2 %.', '#7fa8b5'],
        ['2030', 'Prediktiv drift', 'AI föreslår åtgärder före skyfall, torka och driftstörningar.', '#7fa8b5'],
      ].map(([yr, t, s, c]) => '<div class="hv-step" style="--c:' + c + '"><span>' + yr + '</span><b>' + t + '</b><br>' + s + '</div>').join('') + '</div>');
    }
    if (lens === 'produktion') {
      const hours = Array.from({ length: 49 }, (_, h) => m.dem * dfac((new Date().getHours() + h) % 24) * (1 + Math.sin(h * 0.7) * 0.02));
      body += card('Produktion vs behov', '<div class="hv-kpis">' + kpi(nf(m.dem), 'm³/h', 'Medelbehov ' + y, nf(m.dem * 24 / 1000, 1) + ' tusen m³/dygn') + kpi(nf(m.capTot), 'm³/h', 'Kapacitet', 'största verk ' + nf(m.largest)) + kpi(Math.round(m.peak / m.capTot * 100), '%', 'Största dygnet', 'av total kapacitet', m.peak / m.capTot > 0.85 ? COL.bad : COL.ok) + kpi(m.n1 ? 'OK' : 'BRIST', '', 'Redundans N-1', m.n1 ? 'inkl. ' + nf(IMPORT) + ' m³/h regional reserv' : 'saknar ' + nf(m.peak - m.n1Cap) + ' m³/h', m.n1 ? COL.ok : COL.bad) + '</div>' +
        '<div class="hv-txt" style="margin-top:12px">AI-prognos 48 h · behov (blå) mot kapacitet (streckad)</div>' + lineChart([{ v: hours, c: COL.dricks, fill: true }, { v: hours.map(() => m.capTot), c: COL.warn, dash: '5 5', w: 1.4 }], { h: 90, min: 0, labels: [{ i: 0, t: 'nu', a: 'start' }, { i: 24, t: '+24 h' }, { i: 48, t: '+48 h', a: 'end' }] }));
      body += card('Vattenverk ' + y, m.towns.map(t => { const u = t.demand / t.cap; return '<div class="hv-row" data-a="fac:' + D.fac.indexOf(D.fById[t.id + '-vv']) + '"><div class="hv-n">' + esc(t.name) + '<small>' + nf(t.cap) + ' m³/h kapacitet · PFAS4 ' + nf(0.5 + hash(t.id + '-vv') * 2.2, 1) + ' ng/l</small></div><div style="width:84px">' + bar(u * 100, u > 0.85 ? COL.bad : u > 0.7 ? COL.warn : COL.ok) + '</div><div class="hv-v">' + Math.round(u * 100) + '%</div></div>'; }).join(''));
      body += card('Vattenkvalitet', D.sens.filter(sn => sn.cat === 'kvalitet' && sn.kind === 'vv').map(sensRow).join('') + '<div class="hv-cap" style="margin:10px 0 4px">I nätet (restklor)</div>' + D.sens.filter(sn => sn.cat === 'kvalitet' && sn.kind === 'net').sort((a, b) => sensVal(a).v - sensVal(b).v).slice(0, 4).map(sensRow).join(''), 'Kontinuerligt');
      body += card('Reservoarer & reservtid', D.fac.filter(f => f.type === 'reservoar').slice(0, 8).map(f => '<div class="hv-row" data-a="fac:' + D.fac.indexOf(f) + '"><div class="hv-n">' + esc(D.tById[f.town].name) + ' · ' + f.name.replace('Reservoar ', '') + '<small>vattenyta ' + nf(f.head, 0) + ' m ö.h.</small></div><div style="width:84px">' + bar(f._lvl, '#35d6f2') + '</div><div class="hv-v">' + Math.round(f._lvl) + '%</div></div>').join(''));
      body += card('Grundvatten & råvatten', D.sens.filter(sn => sn.cat === 'grund').map(sensRow).join('') + '<div class="hv-foot" style="padding:8px 0 0">Djupet ökar med varmare somrar' + (y > 2026 ? ' – scenario ' + y : '') + '.</div>');
      body += card('Energi & klimat', '<div class="hv-kpis">' + kpi('0,41', 'kWh/m³', 'Produktion', 'mål 2030: 0,33', COL.warn) + kpi('62', '%', 'Energineutralitet ARV', 'biogas + sol · mål 2045', COL.ok) + kpi(nf(D.sens.filter(sn => sn.cat === 'energi').reduce((a, sn) => a + sensVal(sn).v, 0)), 'kW', 'Effekt just nu', D.sens.filter(sn => sn.cat === 'energi').length + ' elmätare') + kpi('−14', '%', 'Prisstyrd pumpning', 'AI-optimerad', COL.ok) + '</div>');
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
      body += braddCard(m);
      body += card('Läckage per DMA', '<table class="hv-table"><tr><th>DMA</th><th>Nattflöde</th><th>Avvikelse</th><th></th></tr>' + D.dmas.slice().sort((a, b) => b.leakLs - a.leakLs || b.risk - a.risk).slice(0, 9).map(d => '<tr data-a="dma:' + D.dmas.indexOf(d) + '"><td>' + esc(d.name) + '</td><td>' + nf(d.mnf + d.leakLs, 1) + ' l/s</td><td style="color:' + (d.leak ? COL.bad : COL.ok) + '">' + (d.leak ? '+' + nf(d.leakLs, 1) : '–') + '</td><td><span class="hv-light" style="--c:' + (d.leak ? COL.bad : COL.ok) + '"></span></td></tr>').join('') + '</table>' +
        '<div class="hv-cap" style="margin:12px 0 4px">Arbetsorder</div>' + D.dmas.filter(d => d.ao).map(d => '<div class="hv-row" data-a="dma:' + D.dmas.indexOf(d) + '"><div class="hv-n">' + d.ao.id + ' · ' + esc(d.name) + '<small>' + d.ao.status + ' · ' + d.ao.crew + '</small></div></div>').join(''));
      body += card('Högst risk · förnya först', D.streets.slice().sort((a, b) => b.risk - a.risk).slice(0, 6).map(s => '<div class="hv-row" data-a="pipe:' + s.idx + '"><div class="hv-n">' + esc(D.tById[s.town].name) + ' · ' + s.dmn + '<small>' + s.mat + ' ' + s.dim + ' mm · ' + s.year + ' · ' + nf(s.len) + ' m · ' + s.hh + ' hushåll</small></div><span class="hv-pill" style="color:' + (s.risk > 75 ? COL.bad : COL.warn) + '">' + s.risk + '</span></div>').join('') + '<div class="hv-foot" style="padding:8px 0 0">Klicka på en ledning och välj <b>Simulera avstängning</b> för att se vilka hushåll som berörs.</div>');
      body += card('AI-insikter', insightsFor(m), 'Hydra AI');
    }
    if (lens === 'samhalle') {
      const yrs = [2026, 2030, 2035, 2040, 2045, 2050, 2060, 2070, 2080, 2090, 2100];
      const popSer = yrs.map(yy => D.towns.reduce((a, t) => a + popAt(t.id, yy), 0) / 1000);
      body += card('Exploatering & VA-beredskap', D.dev.map((d, i) => { const c = devChecks(d); return '<div class="hv-row" data-a="dev:' + i + '"><span class="hv-light" style="--c:' + c.worst + '"></span><div class="hv-n">' + esc(d.name) + '<small>' + d.kind + ' · ' + (d.units ? nf(d.units) + ' bostäder' : nf(d.jobs) + ' arbetsplatser') + ' · ' + d.year + '</small></div><div style="display:flex;gap:3px">' + c.checks.map(x => '<span class="hv-light" title="' + x.k + '" style="--c:' + x.c + ';width:7px;height:7px"></span>').join('') + '</div></div>'; }).join('') +
        '<div class="hv-foot" style="padding-top:8px">Prickarna: dricksvatten · spillvatten · skyfall · havsnivå. Klicka för automatiskt VA-utlåtande.</div>');
      body += card('Recipienter & badplatser', D.bad.map(b => '<div class="hv-row" data-a="badp:' + D.bad.indexOf(b) + '"><span class="hv-light" style="--c:' + (b.warn ? COL.bad : COL.ok) + '"></span><div class="hv-n">' + esc(b.name) + '<small>' + (b.warn ? 'Avrådan från bad efter bräddning · 48 h' : 'Bra badvatten') + '</small></div></div>').join('') + '<div class="hv-foot" style="padding:8px 0 0">Bräddning nära kusten ger automatiskt avrådan på badplatserna i tvillingen.</div>');
      body += card('Befolkning i NSVA:s kommuner', lineChart([{ v: popSer, c: COL.ok, fill: true }], { h: 80, min: Math.floor(popSer[0] * 0.95), labels: [{ i: 0, t: '2026', a: 'start' }, { i: 5, t: '2050' }, { i: 10, t: '2100', a: 'end' }] }) + '<div class="hv-kpis" style="margin-top:8px">' + kpi(nf(popAt('helsingborg', S.year) / 1000), 'tusen', 'Helsingborg ' + y) + kpi(nf(m.towns.reduce((a, t) => a + t.pop, 0) / 1000), 'tusen', 'Alla 8 kommuner ' + y) + '</div>');
      body += card('Klimatanpassning ' + y, '<div class="hv-kpis">' + kpi(D.sinks.length, 'st', 'Instängda lågpunkter', nf(m.sinkVol / 1000) + ' 000 m³') + kpi('×' + nf(m.sc.clim, 1), '', 'Klimatfaktor regn', 'Svenskt Vatten P110') + kpi('+' + nf(m.sea, 2), 'm', 'Havsnivå' + (S.surge ? ' + högvatten' : ''), S.surge ? '100-årshögvatten +1,6 m' : 'medelvattenstånd', COL.warn) + kpi(nf(m.lowPipes, 1), 'km', 'Ledning under nivån', 'påverkas av högvatten', m.lowPipes > 5 ? COL.bad : COL.warn) + '</div>' +
        '<div class="hv-sep"></div>' + D.towns.map(t => { const sv = D.sinks.filter(s => s.town === t.id).reduce((a, s) => a + s.vol, 0); return '<div class="hv-row" style="cursor:default"><div class="hv-n">' + esc(t.name) + '<small>' + D.sinks.filter(s => s.town === t.id).length + ' lågpunkter</small></div><div style="width:110px">' + bar(sv / (m.sinkVol || 1) * 260, COL.vio) + '</div><div class="hv-v">' + nf(sv / 1000, 1) + 'k m³</div></div>'; }).join(''));
      body += braddCard(m);
      body += card('AI-insikter', insightsFor(m), 'Hydra AI');
    }
    const foot = '<div class="hv-foot">Terräng: AWS Terrain Tiles (bl.a. EU-DEM). Gator: © OpenStreetMap. Regn och havsnivå är live. Ledningar, anläggningsdata, mätpunkter, exploateringsområden och siffror i visionen är påhittade för att visa möjligheterna.</div>';
    return '<div class="hv-panel">' + head + body + foot + '</div>';
  }
  let panelT = 0;
  function renderPanel(force) {
    if (!ctx || !ctx.panelEl) return;
    const now = performance.now();
    if (!force && now - panelT < 900) return;
    panelT = now;
    const col = ctx.panelEl.parentElement, sc = col ? col.scrollTop : 0;
    const html = panelHtml();
    if (ctx.panelEl._html === html) return;
    ctx.panelEl.innerHTML = html; ctx.panelEl._html = html;
    if (col) col.scrollTop = sc;
  }

  // ---------- HUD: movable, collapsible panels ----------
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
      if (m === 'vattenalder') [['#2fe6a0', '< 6 h'], ['#3fd6c8', '12 h'], ['#ffd65a', '24 h'], ['#ff9a2e', '36 h'], ['#ff5a6e', '> 48 h']].forEach(x => item(...x));
      if (m === 'risk') [['#2fe6c4', 'låg'], ['#ffd65a', 'medel'], ['#ff7846', 'hög'], ['#ff3c5a', 'mycket hög']].forEach(x => item(...x));
      if (m === 'lutning') [['#ff5a6e', '< 1 ‰ (flack)'], ['#ffb450', '3 ‰'], ['#3fd6c8', '8 ‰'], ['#4aa8ff', '> 20 ‰']].forEach(x => item(...x));
      if (m === 'belastning') [['rgba(120,170,185,.55)', 'torrt'], ['#2fe6c4', '< 30 %'], ['#ffd65a', '75 %'], ['#ff7846', 'full'], ['#ff2850', 'dämd / överbelastad']].forEach(x => item(...x));
      if (S.shut) item('#ff4fd8', 'Avstängt område');
    }
    if (S.layers.sinks) item('#c9b6ff', 'Lågpunkt (torr)'), item('#3fa9ff', 'Vattensamling');
    if (S.layers.bradd) item('#ff8a4a', 'Bräddpunkt · plym i recipienten');
    if (S.layers.sea) item('#3a9aff', 'Under ' + nf(seaLevelM(), 2) + ' m (hav)');
    if (S.layers.sens) rows.push('<div class="hv-lgs">' + S.cats.map(k => '<span><span class="hv-sens sm" style="--c:' + SENS[k].col + '">' + SENS[k].g + '</span>' + SENS[k].label + '</span>').join('') + '</div>');
    return rows.join('') + '<div class="hv-elev" data-elev>' + (elevTxt || 'Peka på kartan för markhöjd') + '</div>';
  }
  function simHtml() {
    const s = S.sim, ser = s.series || hyeto(s.preset, s.preset === 'live' ? 1 : SCEN[S.year].clim), mx = Math.max(10, ...ser);
    const W = 300, H = 40, pts = Array.from(ser).map((v, m) => (m / (SIM_MIN - 1) * W).toFixed(1) + ',' + (H - 2 - v / mx * (H - 8)).toFixed(1)).join(' ');
    const x = s.t / SIM_MIN * W, iNow = intensity();
    const wet = D.sinks.filter(k => k.V > 0), full = D.sinks.filter(k => k.V >= k.vol), vol = D.sinks.reduce((a, k) => a + k.V, 0);
    const dagOver = D.streets.filter(st => loadOf(st, 'dag') >= 1).length / D.streets.length;
    const bNow = D.bps.filter(b => b.now > 0).length;
    const hh = Math.floor(s.t / 60), mm = Math.floor(s.t % 60);
    const rd = (v, l, c) => '<div><b' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</b><span>' + l + '</span></div>';
    return '<div class="hv-simrow"><div class="hv-play' + (s.running ? ' on' : '') + '" data-a="play" title="' + (s.running ? 'Pausa' : 'Starta skyfallssimulering') + '">' + (s.running ? svgIc('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', 18, '#021016') : svgIc('<path d="M7 4l13 8-13 8z" fill="var(--ac,#35d6f2)"/>', 18, 'var(--ac,#35d6f2)')) + '</div>' +
      '<div class="hv-chips">' + PRESETS.map(p => '<span class="hv-chip' + (s.preset === p.id ? ' on' : '') + '" data-a="preset:' + p.id + '" title="' + p.sub + '">' + p.label + '</span>').join('') + '<span class="hv-chip" data-a="reset" title="Nollställ">↺</span></div>' +
      '<div class="hv-hyeto" data-a="scrub" title="Klicka för att hoppa i tiden"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><polygon points="0,' + H + ' ' + pts + ' ' + W + ',' + H + '" fill="rgba(63,169,255,.22)"/><polyline points="' + pts + '" fill="none" stroke="#3fa9ff" stroke-width="1.5"/><rect x="0" y="0" width="' + x.toFixed(1) + '" height="' + H + '" fill="rgba(var(--acg,53,214,242),.08)"/><line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="0" y2="' + H + '" stroke="var(--ac,#35d6f2)" stroke-width="2"/></svg></div>' +
      '<div class="hv-read">' + rd(simOn() ? hh + ':' + String(mm).padStart(2, '0') : 'Nu', 'Tid') + rd(nf(iNow, 1), 'mm/h', iNow > 30 ? COL.bad : iNow > 10 ? COL.warn : '') + rd(nf(s.rainSum || 0, 0), 'mm totalt') + rd(wet.length + '/' + D.sinks.length, 'Lågpunkter', full.length ? COL.bad : wet.length ? COL.warn : '') +
      rd(nf(vol / 1000, 1) + 'k', 'm³ på mark') + rd(Math.round(dagOver * 100) + '%', 'Dagv. fullt', dagOver > 0.2 ? COL.bad : dagOver > 0 ? COL.warn : '') + rd(bNow + ' st', 'Bräddar', bNow ? COL.bad : '') + rd(nf(s.overflowM3 || 0), 'm³ bräddat', s.overflowM3 > 0 ? COL.bad : '') + '</div></div>';
  }
  const PANEL_DEFAULT = { year: 'hv-p-year', layers: 'hv-p-layers', legend: 'hv-p-legend', sim: 'hv-p-sim', info: 'hv-p-info' };
  function hudSkeleton() {
    const pnl = (name, title, extra) => '<div class="hv-pnl hv-glass ' + PANEL_DEFAULT[name] + '" data-pnl="' + name + '"' + (name === 'info' ? ' hidden' : '') + '><div class="hv-ph" data-drag="' + name + '" title="Dra för att flytta"><span class="hv-grip">⋮⋮</span><span class="hv-pt">' + title + '</span>' + (extra || '') + '<span class="hv-pbtn" data-a="' + (name === 'info' ? 'close' : 'min:' + name) + '" title="' + (name === 'info' ? 'Stäng' : 'Minimera / visa') + '">' + (name === 'info' ? '✕' : '–') + '</span></div><div class="hv-pb" data-body="' + name + '"></div></div>';
    return '<div class="hv-hud">' +
      '<div class="hv-lens hv-glass" data-lens></div>' +
      pnl('year', 'Scenario', '<span class="hv-ptag">Simulerad data</span>') +
      pnl('layers', 'Kartlager') +
      pnl('legend', 'Teckenförklaring') +
      pnl('info', 'Info') +
      pnl('sim', 'Skyfallssimulering', '<span class="hv-pmini" data-simmini></span>') +
      '</div>';
  }
  function loadUi() { try { const u = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); return { pos: u.pos || {}, min: u.min || {} }; } catch (e) { return { pos: {}, min: {} }; } }
  function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify(S.ui)); } catch (e) {} }
  function applyUi() {
    const h = ctx && ctx.hudEl; if (!h) return;
    h.querySelectorAll('[data-pnl]').forEach(el => {
      const name = el.getAttribute('data-pnl'), p = S.ui.pos[name];
      if (p) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.classList.add('moved'); }
      else { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; el.classList.remove('moved'); }
      el.classList.toggle('min', !!S.ui.min[name]);
      const b = el.querySelector('.hv-pbtn'); if (b && name !== 'info') b.textContent = S.ui.min[name] ? '+' : '–';
    });
  }
  // drag a panel by its header; coordinates are in the (CSS-scaled) stage, so divide by the scale
  let drag = null;
  function onDown(e) {
    const hd = e.target.closest('[data-drag]'); if (!hd || e.target.closest('[data-a]')) return;
    const el = hd.closest('[data-pnl]'), hud = ctx.hudEl.firstElementChild, k = hud.getBoundingClientRect().width / hud.offsetWidth || 1;
    drag = { el, name: el.getAttribute('data-pnl'), k, sx: e.clientX, sy: e.clientY, x: el.offsetLeft, y: el.offsetTop, W: hud.offsetWidth, H: hud.offsetHeight };
    el.classList.add('dragging');
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag) return;
    const x = clamp(drag.x + (e.clientX - drag.sx) / drag.k, 0, drag.W - drag.el.offsetWidth), y = clamp(drag.y + (e.clientY - drag.sy) / drag.k, 0, drag.H - drag.el.offsetHeight);
    drag.el.style.left = x + 'px'; drag.el.style.top = y + 'px'; drag.el.style.right = 'auto'; drag.el.style.bottom = 'auto';
    drag.moved = { x: Math.round(x), y: Math.round(y) };
  }
  function onUp() {
    if (!drag) return;
    drag.el.classList.remove('dragging');
    if (drag.moved) { S.ui.pos[drag.name] = drag.moved; saveUi(); applyUi(); }
    drag = null;
  }
  function renderHud(parts) {
    const h = ctx && ctx.hudEl; if (!h) return;
    const set = (sel, html) => { const n = h.querySelector(sel); if (n && n._html !== html) { n.innerHTML = html; n._html = html; } };
    const all = !parts;
    if (all || parts.includes('lens')) set('[data-lens]', LENSES.map(l => '<div class="hv-seg' + (S.lens === l.id ? ' on' : '') + '" data-a="lens:' + l.id + '">' + svgIc(l.ic, 15) + l.label + '</div>').join(''));
    if (all || parts.includes('year')) set('[data-body="year"]', '<div class="hv-years">' + YEARS.map(y => '<div class="hv-seg' + (S.year === y ? ' on' : '') + '" data-a="year:' + y + '">' + y + '</div>').join('') + '</div><div class="hv-ysub"><b>' + SCEN[S.year].txt + '</b> · regn ×' + nf(SCEN[S.year].clim, 1) + ' · hav +' + nf(SCEN[S.year].sea * 100) + ' cm · ' + nf(D.towns.reduce((a, t) => a + popAt(t.id, S.year), 0) / 1000) + ' tusen inv.</div>');
    if (all || parts.includes('layers')) {
      const modes = COLOR_MODES[S.net], f = ctx.filters ? ctx.filters() : {};
      const chk = (on, a, t, c, sub) => '<div class="hv-chk' + (on ? ' on' : '') + (sub ? ' sub' : '') + '" data-a="' + a + '"><span class="hv-box">' + (on ? svgIc('<path d="M5 12l5 5 9-10"/>', 11, '#021016') : '') + '</span>' + t + (c ? '<span class="hv-sw" style="background:' + c + '"></span>' : '') + '</div>';
      set('[data-body="layers"]', '<div class="hv-cap">Ledningsnät</div><div class="hv-chips">' + NETS.map(n => '<span class="hv-chip' + (S.net === n.id ? ' on' : '') + '" data-a="net:' + n.id + '">' + n.label + '</span>').join('') + '</div>' +
        (modes.length ? '<div class="hv-cap" style="margin-top:9px">Färg efter</div><div class="hv-chips">' + modes.map(([k, t]) => '<span class="hv-chip' + (S.color === k ? ' on' : '') + '" data-a="color:' + k + '">' + t + '</span>').join('') + '</div>' : '') +
        '<div class="hv-sep"></div><div class="hv-cap">Tvillingen</div>' + LAYER_DEFS.map(([k, t, c]) => chk(S.layers[k], 'layer:' + k, t, c) +
          (k === 'sens' && S.layers.sens ? '<div class="hv-chips sub">' + Object.keys(SENS).map(c2 => '<span class="hv-chip' + (S.cats.includes(c2) ? ' on' : '') + '" data-a="cat:' + c2 + '" style="--cc:' + SENS[c2].col + '">' + SENS[c2].label + '</span>').join('') + '</div>' : '') +
          (k === 'sea' && S.layers.sea ? chk(S.surge, 'surge', '+ 100-årshögvatten', '', true) : '')).join('') +
        '<div class="hv-sep"></div><div class="hv-cap">Från dagens Hydra</div>' + HYDRA_LAYERS.map(([k, t]) => chk(!!f[k], 'hydra:' + k, t, '')).join('') +
        '<div class="hv-reset" data-a="resetui">Återställ panelernas placering</div>');
    }
    if (all || parts.includes('legend')) set('[data-body="legend"]', legendHtml());
    if (all || parts.includes('sim')) {
      set('[data-body="sim"]', simHtml());
      set('[data-simmini]', (S.sim.running ? '▶ ' : '') + (simOn() ? Math.floor(S.sim.t / 60) + ':' + String(Math.floor(S.sim.t % 60)).padStart(2, '0') + ' · ' : '') + nf(intensity(), 1) + ' mm/h' + (D.bps.some(b => b.now > 0) ? ' · bräddar' : ''));
    }
  }

  // ---------- actions ----------
  function setLens(l, fromOutside) {
    S.lens = l; const p = LENS_PRESET[l];
    S.net = p.net; S.color = p.color; S.layers = Object.assign({}, p.layers); S.cats = p.cats.slice();
    clearShut(); S.sel = null; renderInfo();
    syncLayers(); renderHud(); renderPanel(true); redrawTerrain();
    if (!fromOutside && ctx.onLens) ctx.onLens(l);
    // distribution is about the street network → go to the largest town; the other lenses look at the region
    if (l === 'distribution') map.flyTo([56.047, 12.712], 13.4, { duration: 1.1 });
    else if (map.getZoom() > 11) region();
  }
  function startPreset(v) {
    S.sim.preset = v; S.sim.running = false; resetSim();
    S.sim.running = true;
    if (S.net === 'dricks' && S.lens !== 'produktion') { S.net = 'dag'; S.color = 'belastning'; }
    S.layers.sinks = true; S.layers.bradd = true;
    syncLayers(); syncSinks(true); renderHud(); styleNet();
  }
  // a widget clicked in the right column → show that part of the operation in the twin
  function focusWidget(id) {
    if (!ctx || !D) return false;
    const f = ctx.filters ? ctx.filters() : {}, need = k => { if (!f[k] && ctx.toggleFilter) ctx.toggleFilter(k); };
    if (id === 'spill') { S.net = 'spill'; S.color = 'belastning'; S.layers.bradd = true; S.layers.fac = true; S.layers.trunks = true; }
    else if (id === 'dag') { S.net = 'dag'; S.color = 'belastning'; S.layers.sinks = true; S.layers.streams = true; }
    else if (id === 'dricks') { S.net = 'dricks'; S.color = 'tryck'; S.layers.sens = true; S.cats = ['kvalitet', 'niva', 'tryck']; }
    else if (id === 'flode') { S.net = 'dricks'; S.color = 'typ'; S.layers.sens = true; S.cats = ['flode']; S.layers.leaks = true; }
    else if (id === 'matare') { S.layers.sens = true; S.cats = ['regn']; }
    else if (id === 'radar' || id === 'prognos') { S.layers.sens = true; S.cats = ['regn']; need('skyfall'); }
    else if (id === 'hav') { S.layers.sea = true; S.layers.sens = true; S.cats = ['hav', 'niva']; redrawTerrain(); }
    else if (id === 'anmal') { need('anmal'); S.layers.sinks = true; }
    else if (id === 'alarm') { need('alarm'); S.layers.sens = true; }
    else return false;
    syncLayers(); renderHud(); renderPanel(true);
    if (map.getZoom() > 11.5) region();
    select({ type: 'focus', w: id });
    return true;
  }
  function act(a, e) {
    const i = a.indexOf(':'), k = i < 0 ? a : a.slice(0, i), v = i < 0 ? '' : a.slice(i + 1);
    if (k === 'lens') return setLens(v);
    if (k === 'year') { S.year = +v; S._m = model(); if (S.sim.preset !== 'live') { const t = S.sim.t; S.sim.series = hyeto(S.sim.preset, SCEN[S.year].clim); S.sim.t = t; } redrawTerrain(); styleNet(); syncSensors(); renderHud(); renderPanel(true); renderInfo(); return; }
    if (k === 'net') { S.net = v; const modes = COLOR_MODES[v]; if (modes.length && !modes.some(x => x[0] === S.color)) S.color = modes[0][0]; syncLayers(); renderHud(['layers', 'legend']); if (S.lens === 'distribution') renderPanel(true); return; }
    if (k === 'color') { S.color = v; styleNet(); renderHud(['layers', 'legend']); return; }
    if (k === 'layer') { S.layers[v] = !S.layers[v]; syncLayers(); if (v === 'sea') redrawTerrain(); renderHud(['layers', 'legend']); renderPanel(true); return; }
    if (k === 'cat') { const has = S.cats.includes(v); if (!S.layers.sens) { S.layers.sens = true; S.cats = [v]; } else S.cats = has ? S.cats.filter(x => x !== v) : S.cats.concat(v); syncLayers(); renderHud(['layers', 'legend']); renderPanel(true); return; }
    if (k === 'hydra') { if (ctx.toggleFilter) ctx.toggleFilter(v); setTimeout(() => renderHud(['layers']), 60); return; }
    if (k === 'surge') { S.surge = !S.surge; if (!S.layers.sea) S.layers.sea = true; syncLayers(); redrawTerrain(); renderHud(['layers', 'legend']); renderPanel(true); return; }
    if (k === 'min') { S.ui.min[v] = !S.ui.min[v]; saveUi(); applyUi(); return; }
    if (k === 'resetui') { S.ui = { pos: {}, min: {} }; saveUi(); applyUi(); return; }
    if (k === 'play') { if (S.sim.t >= SIM_MIN - 1) resetSim(); S.sim.running = !S.sim.running; if (S.sim.running) { S.layers.sinks = true; S.layers.bradd = true; syncLayers(); } renderHud(['sim', 'layers', 'legend']); return; }
    if (k === 'preset') return startPreset(v);
    if (k === 'reset') { S.sim.running = false; resetSim(); S._m = model(); syncSinks(true); syncFacilities(); syncBradd(); syncSensors(); styleNet(); renderHud(); renderPanel(true); reportSim(); return; }
    if (k === 'scrub') { const r = e.currentTargetRect; if (!r) return; const target = clamp((e.clientX - r.left) / r.width, 0, 1) * SIM_MIN; if (target < S.sim.t) resetSim(); while (S.sim.t < target) { stepSim(1); S.sim.t += 1; } syncSinks(); syncFacilities(); syncBradd(); syncSensors(); styleNet(); renderHud(['sim']); reportSim(); return; }
    if (k === 'close') { clearShut(); S.sel = null; renderInfo(); return; }
    if (k === 'widget') { if (ctx.openWidget) ctx.openWidget(v); return; }
    if (k === 'shut') { const s = D.streets[+v]; if (s) { shutOff(s); renderInfo(); renderHud(['legend']); } return; }
    if (k === 'unshut') { clearShut(); renderInfo(); renderHud(['legend']); return; }
    if (k === 'sms') { const sh = S.shut; if (!sh) return; const b = ctx.hudEl.querySelector('[data-a="sms"]'); if (b) { b.textContent = '✓ ' + nf(sh.meters) + ' SMS skickade (simulerat)'; b.classList.remove('pri'); } return; }
    if (k === 'fac') { const f = D.fac[+v]; if (!f) return; if (!S.layers.fac) { S.layers.fac = true; syncLayers(); renderHud(['layers']); } flyTo([f.lat, f.lng], 14); return select({ type: 'fac', ref: f }); }
    if (k === 'sens') { const sn = D.sens[+v]; if (!sn) return; if (!S.layers.sens || !S.cats.includes(sn.cat)) { S.layers.sens = true; if (!S.cats.includes(sn.cat)) S.cats.push(sn.cat); syncLayers(); renderHud(['layers', 'legend']); } flyTo([sn.lat, sn.lng], 14.5); return select({ type: 'sens', ref: sn }); }
    if (k === 'bp') { const b = D.bps[+v]; if (!b) return; if (!S.layers.bradd) { S.layers.bradd = true; syncLayers(); renderHud(['layers']); } flyTo([b.lat, b.lng], 14.5); return select({ type: 'bp', ref: b }); }
    if (k === 'badp') { const b = D.bad[+v]; if (!b) return; if (!S.layers.bad) { S.layers.bad = true; syncLayers(); renderHud(['layers']); } flyTo([b.lat, b.lng], 14); return select({ type: 'bad', ref: b }); }
    if (k === 'pipe') { const s = D.streets[+v]; if (!s) return; if (S.net === 'none') { S.net = 'dricks'; syncLayers(); renderHud(['layers', 'legend']); } flyTo(s.mid, 15); return select({ type: 'pipe', ref: s }); }
    if (k === 'dma') { const d = D.dmas[+v]; if (!d) return; if (!S.layers.leaks && d.leak) { S.layers.leaks = true; syncLayers(); renderHud(['layers']); } flyTo(d.worst.mid, 15); return select({ type: 'dma', ref: d }); }
    if (k === 'sink') { const s = D.sinks[+v]; if (!s) return; if (!S.layers.sinks) { S.layers.sinks = true; syncLayers(); renderHud(['layers', 'legend']); } flyTo([s.lat, s.lng], 14.5); return select({ type: 'sink', ref: s }); }
    if (k === 'dev') { const d = D.dev[+v]; if (!d) return; if (!S.layers.dev) { S.layers.dev = true; syncLayers(); renderHud(['layers']); } flyTo([d.lat, d.lng], 14); return select({ type: 'dev', ref: d }); }
  }
  function onClick(e) {
    const t = e.target.closest('[data-a]'); if (!t) return;
    e.stopPropagation();
    act(t.getAttribute('data-a'), { clientX: e.clientX, currentTargetRect: t.getBoundingClientRect() });
  }

  function tick() {
    S._lt = (S._lt || 0) + 1;
    if (!S.sim.running) {
      // live: refresh loads, instruments and readouts every few seconds
      if (S._lt % 42 === 0) {
        S._m = model(); forecast(); syncSensors(); syncBradd(); renderHud(['sim']); renderPanel();
        const i = Math.round(intensity() * 2) / 2;
        if (S.color === 'belastning' && i !== S._li) { S._li = i; styleNet(); }
        if (S.sel && (S.sel.type === 'sens' || S.sel.type === 'focus')) renderInfo();
      }
      return;
    }
    stepSim(1); S.sim.t += 1;
    if (S.sim.t >= SIM_MIN - 1) { S.sim.running = false; renderPanel(true); }
    // the model steps every tick; the screen follows at a calmer pace
    const t = S.sim.t, end = !S.sim.running;
    if (t % 2 === 0 || end) syncSinks();
    if (t % 3 === 0 || end) { syncBradd(); renderHud(['sim']); }
    if (t % 4 === 0 || end) syncFacilities();
    if (t % 6 === 0 || end) { if (S.color === 'belastning') styleNet(); syncSensors(); }
    if (S.sel && (t % 8 === 0 || end)) renderInfo();
    if (t % 15 === 0 || end) renderPanel(true);
    if (t % 8 === 0 || end) reportSim();
  }

  // ---------- mount / unmount ----------
  function mount(c) {
    unmount();
    const seq = ++mountSeq;
    ctx = c; L = window.L; map = c.map;
    S = { lens: c.lens || 'oversikt', year: 2026, net: 'dricks', color: 'typ', layers: {}, cats: [], surge: false, sel: null, shut: null, ui: loadUi(), sim: { running: false, t: 0, preset: 'r100', series: null, overflowM3: 0, rainSum: 0, q: null } };
    c.panelEl.innerHTML = '<div class="hv-panel"><div class="hv-card hv-hero"><div class="hv-hero-t">HYDRA · VISIONEN</div><div class="hv-hero-s">Laddar terräng, rinnvägar, ledningsnät och mätpunkter…</div></div></div>';
    c.panelEl._html = null; c.hudEl.innerHTML = '';
    return loadData().then(data => {
      if (seq !== mountSeq || !ctx) return;
      D = data;
      // a fresh, dry simulation for every visit
      D.sinks.forEach(s => { s.V = 0; s.peak = 0; s.lv = null; s.hh = null; s._key = null; });
      D.sens = buildSensors();
      resetSim(); S._m = model(); S._fc = null; forecast();
      c.hudEl.innerHTML = hudSkeleton();
      c.hudEl.addEventListener('click', onClick);
      c.hudEl.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
      c.panelEl.addEventListener('click', onClick);
      applyUi();
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
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); drag = null;
    if (map) {
      map.off('zoomend', onZoomEnd); map.off('moveend', onMoveEnd); map.off('mousemove', onMouseMove);
      if (layers.particles) layers.particles.remove();
      ['terrain', 'net', 'trunks', 'sinks', 'fac', 'dev', 'leaks', 'sens', 'bradd', 'bad', 'shut'].forEach(k => { if (layers[k] && map.hasLayer(layers[k])) map.removeLayer(layers[k]); });
      if (layers.streams) { const h = layers.streams._hvHost; h.clearLayers(); if (map.hasLayer(h)) map.removeLayer(h); }
      (layers.renderers || []).forEach(r => { if (map.hasLayer(r)) map.removeLayer(r); });
    }
    if (ctx) {
      if (ctx.hudEl) { ctx.hudEl.removeEventListener('click', onClick); ctx.hudEl.removeEventListener('pointerdown', onDown); ctx.hudEl.innerHTML = ''; }
      if (ctx.panelEl) { ctx.panelEl.removeEventListener('click', onClick); ctx.panelEl.innerHTML = ''; ctx.panelEl._html = null; }
    }
    layers = {}; ctx = null; map = null;
  }

  window.HydraVision = {
    mount, unmount, focusWidget,
    setLens: l => { if (ctx && D && S && S.lens !== l) setLens(l, true); },
    // for MR. Hydra (chat agent) and tests
    state: () => S && { lens: S.lens, year: S.year, net: S.net, color: S.color, cats: S.cats, sim: { t: S.sim.t, running: S.sim.running, preset: S.sim.preset } },
    act: a => { if (ctx && D) act(a, {}); },
  };
})();
