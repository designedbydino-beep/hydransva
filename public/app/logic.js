class Component extends DCLogic {
  state = {
    tick: 0,
    clock: this.now(),
    scale: this.calcScale(),
    selected: null,
    selFac: null,
    input: '',
    messages: [],
    chatOpen: false,
    chatMin: false,
    sending: false,
    focused: null,
    openWidget: null,
    openWidgetMuni: null,
    dragId: null,
    dragActive: false,
    dragStartX: 0,
    dragStartY: 0,
    dragGx: 0,
    dragGy: 0,
    settingsOpen: false,
    settingsTab: 'widgets', // 'widgets' | 'info'
    design: (() => { try { return localStorage.getItem('nsva_design') === '2' ? 2 : 1; } catch (e) { return 1; } })(),
    infoTopic: 'oversikt',
    tv: false, // skärmläget är borttaget – TV:n har touch och kör den vanliga versionen
    view: null, // null = startmeny · 'hydra' | 'visky' | 'prod'
    viewHidden: (() => { try { return JSON.parse(localStorage.getItem('nsva_view_hidden') || '{}'); } catch (e) { return {}; } })(),
    viewLayout: (() => { try { return JSON.parse(localStorage.getItem('nsva_view_layout') || '{}'); } catch (e) { return {}; } })(),
    filters: { skyfall: false, vind: false, alarm: false, anmal: false, regn: false, radartack: false },
    gauge: null,
    radarSel: null,
    evidence: null,
    anmalScope: 'active', // 'active' | 'all'
    skyfallScan: false,
    skyfallResult: null,
    skyfallHour: 0,
    skyfallPeriod: 1,
    skyfallMode: 'int', // V2 = standard (SMHI intensitet + återkomsttid i violett från V1)
    ...this.loadLayout(),
  };

  now() {
    return new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  calcScale() {
    if (typeof window === 'undefined') return 1;
    return Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  }

  // Live-status strip on the map: how fresh each source is, so everyone at the TV sees that it updates by itself
  liveStrip() {
    const now = Date.now();
    const fs = this.radarFrames;
    const radarT = fs && fs.length ? fs[fs.length - 1].t : null;
    const item = (label, t, every) => {
      if (!t) return { label, txt: 'väntar', color: '#7fa8b5', glow: 'none', anim: 'none' };
      const min = Math.max(0, Math.floor((now - t) / 60000));
      const fresh = min <= every * 1.6, justNow = now - t < 90000;
      const color = fresh ? '#2fe6c4' : '#ffb547';
      return { label, txt: min < 1 ? 'nyss' : min + ' min', color, glow: '0 0 8px ' + color, anim: justNow ? 'blink 1s ease-in-out 3' : 'none' };
    };
    const items = [
      item('Radar', radarT, 10),
      item('SMHI', this._wxStamp, 10),
      item('Regnmätare', this._rainStamp, 10),
      item('Hav', this._seaStamp, 10),
    ];
    const anyLive = items.some(i => i.color === '#2fe6c4');
    return { items, liveTxt: anyLive ? 'LIVE' : 'ANSLUTER', liveColor: anyLive ? '#2fe6c4' : '#ffb547' };
  }
  isFullscreen() {
    if (typeof document === 'undefined') return false;
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  toggleFullscreen() {
    const d = document, el = d.documentElement;
    try {
      if (this.isFullscreen()) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); }
      else { const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); }
    } catch (e) {}
  }
  // Leaflet throws "reading 'parentNode'" when a layer/control is removed after its map was rebuilt
  // (view switch, radar frame swap). Make removal of an already-gone element a no-op.
  patchLeaflet() {
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!L || !L.DomUtil || L.DomUtil.__nsvaSafe) return;
    const orig = L.DomUtil.remove;
    L.DomUtil.remove = function (el) { if (el && el.parentNode) return orig.call(this, el); };
    const origRm = L.Map.prototype.removeLayer;
    L.Map.prototype.removeLayer = function (layer) { try { return origRm.call(this, layer); } catch (e) { return this; } };
    L.DomUtil.__nsvaSafe = true;
  }
  componentDidMount() {
    this.patchLeaflet();
    this._patchT = setInterval(() => { this.patchLeaflet(); if (window.L && window.L.DomUtil && window.L.DomUtil.__nsvaSafe) clearInterval(this._patchT); }, 200);
    this.startRainBg();
    this._onFs = () => this.forceUpdate();
    document.addEventListener('fullscreenchange', this._onFs);
    document.addEventListener('webkitfullscreenchange', this._onFs);
    if (this.state.tv) {
      let v = 'visky';
      try { const q = new URLSearchParams(window.location.search).get('vy'); if (q && this.viewDefs()[q]) v = q; } catch (e) {}
      this.setState({ skyfallMode: 'int' }); // TV always uses the SMHI intensity scale
      setTimeout(() => this.setView(v), 0);
    }
    this.t1 = setInterval(() => this.setState({ clock: this.now() }), 1000);
    this.t2 = setInterval(() => {
      if (this.props.liveData === false) return;
      this.setState(s => ({ tick: s.tick + 1 }));
    }, 2000);
    this.onResize = () => { this.setState({ scale: this.calcScale() }); if (this.map) setTimeout(() => this.map && this.map.invalidateSize(), 60); };
    window.addEventListener('resize', this.onResize);
    this.tryInitMap();
    this._onPMove = this._onMMove = (e) => {
      if (!this.state.dragId) return;
      const moved = Math.hypot(e.clientX - this.state.dragStartX, e.clientY - this.state.dragStartY) > 8;
      if (moved || this.state.dragActive) this.setState({ dragActive: true, dragGx: e.clientX - 20, dragGy: e.clientY - 20 });
    };
    this._onPUp = this._onMUp = (e) => {
      const dragSrc = this.state.dragId;
      const wasDrag = this.state.dragActive;
      this._wasDrag = wasDrag; // so a widget click after a drag doesn't open the detail view
      if (!dragSrc) return;
      this.setState({ dragId: null, dragActive: false });
      if (!wasDrag) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const wid = this.findWid(el);
      const col = this.findDropCol(el);
      const finalCol = col || (wid && wid !== dragSrc ? this.colOf(wid) : null) || this.colOf(dragSrc) || this.homeCol(dragSrc);
      const newCols = { left: this.state.cols.left.slice(), right: this.state.cols.right.slice() };
      ['left','right'].forEach(c => { const i = newCols[c].indexOf(dragSrc); if (i >= 0) newCols[c].splice(i,1); });
      const arr = newCols[finalCol];
      let to = (wid && wid !== dragSrc) ? arr.indexOf(wid) : arr.length;
      if (to < 0) to = arr.length;
      arr.splice(to, 0, dragSrc);
      this.setState({ cols: newCols });
      this.persistLayout(newCols, this.state.hidden);
    };
    window.addEventListener('mousemove', this._onMMove);
    window.addEventListener('mouseup', this._onMUp);
    window.addEventListener('pointermove', this._onPMove);
    window.addEventListener('pointerup', this._onPUp);
    if (this.props.useSmhi !== false) {
      this.fetchSMHI();
      this.twx = setInterval(() => this.fetchSMHI(), 10 * 60 * 1000);
    }
    this.fetchRainViewer();
    this.trv = setInterval(() => this.fetchRainViewer(), 5 * 60 * 1000);
    this.fetchSeaLevel();
    this.tsea = setInterval(() => this.fetchSeaLevel(), 10 * 60 * 1000);
    this.fetchSmhiWarnings();
    this.twarn = setInterval(() => this.fetchSmhiWarnings(), 10 * 60 * 1000);
    // DMI HARMONIE forecast field (new model run every 3 h; refresh every 30 min)
    this.fetchDmiModel();
    this.tdmi = setInterval(() => this.fetchDmiModel(), 30 * 60 * 1000);
    // MR. Hydra rekommenderar: check every 2 min whether the warning level changed (first check after data has loaded)
    this.tadv = setInterval(() => { this.maybeAdvise(); }, 2 * 60 * 1000);
    setTimeout(() => this.maybeAdvise(), 90 * 1000);
  }

  // ---------- SMHI Open Data: real forecast per municipality ----------
  compass(deg) {
    const d = ((deg % 360) + 360) % 360;
    return ['N', 'NÖ', 'Ö', 'SÖ', 'S', 'SV', 'V', 'NV'][Math.round(d / 45) % 8];
  }
  async fetchSMHI() {
    if (typeof window === 'undefined' || !window.fetch) return;
    const munis = this.baseMunis();
    // SNOW1gv1 (pmp3gv2 deprecated 2026-03-31): flat data object, human-readable params, 9999 = missing
    const pv = (ts, name) => { const v = ts && ts.data ? ts.data[name] : undefined; return (v === undefined || v === null || v === 9999) ? null : v; };
    try {
      const fetchPoint = async (lat, lng) => {
        const url = '/smhi-proxy/api/category/snow1g/version/1/geotype/point/lon/' + lng.toFixed(6) + '/lat/' + lat.toFixed(6) + '/data.json';
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(to);
        if (!r.ok) throw new Error('smhi ' + r.status);
        const j = await r.json();
        return (j.timeSeries || []).slice(0, 13).map(ts => ({
          precip: pv(ts, 'precipitation_amount_mean'), ws: pv(ts, 'wind_speed'), wd: pv(ts, 'wind_from_direction'), gust: pv(ts, 'wind_speed_of_gust'),
          temp: pv(ts, 'air_temperature'), sym: pv(ts, 'symbol_code'), time: ts.time || ts.validTime,
        }));
      };
      // one failing kommun must NOT knock the whole dashboard back to simulated data
      const results = await Promise.all(munis.map(async m => {
        let series = [];
        try { series = await fetchPoint(m.lat, m.lng); } catch (e) { try { series = await fetchPoint(m.lat, m.lng); } catch (e2) { series = []; } }
        return { id: m.id, name: m.name, now: series[0] || null, series };
      }));
      if (!results.some(x => x.series.length)) throw new Error('smhi unreachable');
      // whole-map precipitation grid (covers neighbouring kommuner + Danish side) — failures are non-fatal.
      // Fetched in batches of 10 so SMHI doesn't throttle 40+ parallel requests.
      const grid = this.rainGridPoints();
      const gridRes = [];
      for (let i = 0; i < grid.length; i += 10) {
        const part = await Promise.all(grid.slice(i, i + 10).map(async g => {
          try { const s = await fetchPoint(g.lat, g.lng); return { lat: g.lat, lng: g.lng, series: s }; } catch (e) { return null; }
        }));
        gridRes.push(...part);
      }
      this.wxGrid = gridRes.filter(Boolean);
      this.computeRainBias();
      this.fetchRainHistory();
      setTimeout(() => { try { if (this.state.filters && this.state.filters.skyfall) this.applyMapFilters(); } catch (e) {} }, 50);
      const byMuni = {}; results.forEach(x => { byMuni[x.id] = x; });
      // region aggregates
      let ws = 0, gust = 0, sinSum = 0, cosSum = 0, n = 0, maxP = 0, tSum = 0, tN = 0, symMax = 0;
      results.forEach(x => {
        const c = x.now; if (!c) return; n++;
        ws += c.ws || 0; gust += (c.gust || c.ws || 0);
        const rad = (c.wd || 0) * Math.PI / 180; sinSum += Math.sin(rad); cosSum += Math.cos(rad);
        if ((c.precip || 0) > maxP) maxP = c.precip || 0;
        if (c.temp != null) { tSum += c.temp; tN++; }
        if (c.sym != null && c.sym > symMax) symMax = c.sym; // worst-case condition across region
      });
      const wd = (Math.atan2(sinSum / (n || 1), cosSum / (n || 1)) * 180 / Math.PI + 360) % 360;
      const wettest = results.filter(x => x.now && (x.now.precip || 0) >= 0.3).sort((a, b) => b.now.precip - a.now.precip).map(x => x.name);
      const rainSeries = (byMuni[wettest[0] ? this.nameToId(wettest[0]) : 'orkelljunga'] || results[0]).series.map(s => s.precip || 0);
      this._wxStamp = Date.now();
      this.weather = {
        byMuni, ws: ws / (n || 1), gust: gust / (n || 1), wd, maxP, wettest, rainSeries,
        temp: tN ? tSum / tN : null, symbol: symMax || null,
        times: (results[0] ? results[0].series : []).map(s => s.time),
        updated: new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
      };
      this.setState(s => ({ tick: s.tick }));
      this.startRadarRain();
    } catch (e) {
      this.weather = null; // graceful fallback to simulation
    }
  }
  nameToId(name) { const m = this.baseMunis().find(x => x.name === name); return m ? m.id : null; }

  // Forecast precipitation (mm/h) for a municipality at a given hour offset — real SMHI if available, else a simulated incoming band.
  fcPrecip(id, hour) {
    const w = this.weather;
    if (w && hour < 0) { const m0 = this.baseMunis().find(x => x.id === id); return m0 ? this.pastPrecipAt(m0.lat, m0.lng, hour) : 0; }
    if (w && w.byMuni && w.byMuni[id] && w.byMuni[id].series && w.byMuni[id].series[hour]) {
      const m0 = this.baseMunis().find(x => x.id === id);
      const raw = w.byMuni[id].series[hour].precip || 0;
      return m0 ? this.bestPrecipAt(m0.lat, m0.lng, hour, raw) : raw;
    }
    if (w) return 0;
    // simulated: sample the same drifting rain field the map grid uses, so labels and echoes always agree
    const m = this.baseMunis().find(x => x.id === id);
    return m ? this.simRainAt(m.lat, m.lng, hour) : 0;
  }
  // ---- Dahlström (2010), SVU-rapport 2010-05 / Svenskt Vatten P104 ----
  //   i = 190 · ∛Å · ln(T) / T^0,98 + 2      i [l/(s·ha)], Å = återkomsttid [månader], T = varaktighet [min], 5 min – 24 h
  //   1 l/(s·ha) = 0,36 mm/h  →  regndjup [mm] = i · 0,006 · T
  dahlI(years, min) { const T = Math.max(5, Math.min(1440, min)); return 190 * Math.cbrt(years * 12) * Math.log(T) / Math.pow(T, 0.98) + 2; }
  dahlMm(years, min) { const T = Math.max(5, Math.min(1440, min)); return this.dahlI(years, T) * 0.006 * T; }
  // inverse: observed depth (mm) over a duration → return period in years (0 if below the formula's floor)
  dahlYears(mm, min) {
    const T = Math.max(5, Math.min(1440, min));
    const i = mm / (0.006 * T); if (i <= 2) return 0;
    const c = (i - 2) * Math.pow(T, 0.98) / (190 * Math.log(T));
    return Math.pow(c, 3) / 12;
  }
  rpThresholds(period) {
    this._rpThr = this._rpThr || {};
    if (!this._rpThr[period]) this._rpThr[period] = [2, 10, 50].map(y => Math.round(this.dahlMm(y, period * 60) * 10) / 10);
    return this._rpThr[period];
  }
  // Classify a summed amount (mm over `period` h) → colour + return-period label.
  // Turquoise spectrum = under 2 år (ljus/mellan/mörk), violet spectrum = 2–10 / 10–50 / >50 år.
  rpClass(mm, period) {
    const [t2, t10, t50] = this.rpThresholds(period);
    if (mm >= t50) return { rgb: '150,40,230', hex: '#9628e6', label: '>50 år', short: '50+ år', rare: true, lvl: 6 };
    if (mm >= t10) return { rgb: '178,96,255', hex: '#b260ff', label: '10–50 år', short: '10 år', rare: true, lvl: 5 };
    if (mm >= t2) return { rgb: '206,150,255', hex: '#ce96ff', label: '2–10 år', short: '2 år', rare: true, lvl: 4 };
    if (mm >= 5) return { rgb: '26,140,214', hex: '#1a8cd6', label: '<2 år', short: '<2 år', rare: false, lvl: 3 };
    if (mm >= 3) return { rgb: '53,190,240', hex: '#35bef0', label: '<2 år', short: '<2 år', rare: false, lvl: 2 };
    return { rgb: '140,228,245', hex: '#8ce4f5', label: '<2 år', short: '<2 år', rare: false, lvl: 1 };
  }
  // Automatic återkomsttid: test ALL SMHI durations (1/3/6/12 h) from `hour`, keep the most severe class.
  // Returns { lvl, cls, period, amt (mm over that period), amt1 (mm first hour), eff (1h-equivalent mm for colouring) }
  // Return period is about ACCUMULATED DEPTH (mm) over a fixed duration at a point — not peak intensity.
  // In "depth mode" the samplers therefore return: gauges as measured, radar as the mean over the last
  // 60 min (not the newest 10-min frame × 1 h), no radar persistence into the future, and a mild
  // gauge correction (×0,5–1,5) instead of the full ×0,25–4 used for the colour field.
  rpAuto(sampler, hour) {
    const prev = this._depth; this._depth = true;
    try { return this._rpAuto(sampler, hour); } finally { this._depth = prev; }
  }
  // exact återkomsttid in years as text, e.g. "5,4 år" (Dahlström 2010)
  yearsTxt(y) {
    if (!y || y < 0.5) return '<1 år';
    if (y > 100) return '>100 år';
    return (y < 10 ? y.toFixed(1).replace('.', ',') : Math.round(y).toString()) + ' år';
  }
  _rpAuto(sampler, hour) {
    let best = null, amt1 = 0, yMax = 0, yPer = 1, yAmt = 0;
    [1, 3, 6, 12].forEach(per => {
      const amt = this.sumWindow(sampler, hour, per);
      const y = this.dahlYears(amt, per * 60); if (y > yMax) { yMax = y; yPer = per; yAmt = amt; }
      if (per === 1) amt1 = amt;
      const cls = this.rpClass(amt, per);
      if (!best || cls.lvl > best.lvl || (cls.lvl === best.lvl && cls.lvl >= 4 && amt / this.rpThresholds(per)[Math.min(2, cls.lvl - 4)] > best.ratio)) {
        best = { lvl: cls.lvl, cls, period: per, amt, ratio: cls.lvl >= 4 ? amt / this.rpThresholds(per)[Math.min(2, cls.lvl - 4)] : 0 };
      }
    });
    const t1 = this.rpThresholds(1);
    const eff = best.lvl >= 4 ? Math.max(amt1, t1[Math.min(2, best.lvl - 4)] * Math.max(1, best.ratio)) : amt1;
    const per = best.lvl >= 4 ? best.period : 1, amt = best.lvl >= 4 ? best.amt : amt1;
    // exact return period = the most extreme over all durations; reported with the duration it applies to
    return { lvl: best.lvl, cls: best.cls, period: per, amt, amt1, eff, years: yMax, yearsPeriod: yPer, yearsAmt: yAmt, yearsTxt: this.yearsTxt(yMax) };
  }
  // SMHI nederbördsintensitet palette (mm/h) — the 8 official steps from SMHI:s nederbördskarta
  intSteps() {
    return [
      { min: 50, rgb: '122,15,34', hex: '#7a0f22', label: 'Skyfall', v: '50' },
      { min: 10, rgb: '227,38,43', hex: '#e3262b', label: 'Mycket kraftigt', v: '10' },
      { min: 4, rgb: '255,107,107', hex: '#ff6b6b', label: 'Kraftigt', v: '4' },
      { min: 2, rgb: '255,154,46', hex: '#ff9a2e', label: '', v: '2' },
      { min: 1, rgb: '242,232,28', hex: '#f2e81c', label: '', v: '1' },
      { min: 0.5, rgb: '124,203,46', hex: '#7ccb2e', label: 'Måttligt', v: '0,5' },
      { min: 0.2, rgb: '18,200,200', hex: '#12c8c8', label: 'Lätt', v: '0,2' },
      { min: 0, rgb: '30,144,232', hex: '#1e90e8', label: 'Ringa', v: '0' },
    ];
  }
  intRgb(mmh) { const s = this.intSteps().find(x => mmh >= x.min); return (s || this.intSteps()[7]).rgb; }
  // Skyfallsvarning: scans now … +12 h with the same model as the map. Triggers on red intensity (≥ 10 mm/h, "Mycket kraftigt")
  // or violet återkomsttid (≥ 2-års-regn). Cached ~60 s — independent of the scrubber position.
  skyfallWarning() {
    const key = Math.floor(Date.now() / 60000) + ':' + (this._rainStamp || 0) + ':' + (this.weather ? 1 : 0) + ':' + ((this.wxGrid || []).length);
    if (this._warnCache && this._warnCache.key === key) return this._warnCache.val;
    const sky = [], hv = [];
    try {
      const w = this.weather;
      const grid = (w && this.wxGrid && this.wxGrid.length) ? this.wxGrid : this.rainGridPoints().map(g => ({ lat: g.lat, lng: g.lng, sim: true }));
      const munis = this.baseMunis();
      const nearestMuni = (lat, lng) => { let b = null, d = Infinity; munis.forEach(m => { const k = this.kmDist(lat, lng, m.lat, m.lng); if (k < d) { d = k; b = m; } }); return d <= 25 ? b : null; };
      for (let h = 0; h <= 12; h++) {
        grid.forEach(g => {
          const s = this.gridSampler(g); const mmh = s(h);
          // kraftigt regn: more intense than yellow (≥ 2 mm/h, orange and up)
          if (mmh >= 2 && (!hv[h] || mmh > hv[h].mmh)) hv[h] = { hour: h, mmh, muni: nearestMuni(g.lat, g.lng), g };
          if (mmh < 1) return; // återkomsttid can't trigger without real rain this hour
          const a = this.rpAuto(s, h);
          const red = mmh >= 10, violet = a.lvl >= 4;
          if (!red && !violet) return;
          const score = (violet ? 100 + Math.min(a.years, 200) : 0) + mmh;
          if (!sky[h] || score > sky[h].score) sky[h] = { score, hour: h, mmh, lvl: a.lvl, cls: a.cls, years: a.years, yearsTxt: a.yearsTxt, yPer: a.yearsPeriod, yAmt: a.yearsAmt, muni: nearestMuni(g.lat, g.lng), g };
        });
      }
    } catch (e) {}
    const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
    const at = h => { const d = new Date(Date.now() + h * 3600000); return 'kl ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit' }); };
    const place = c => c.muni ? c.muni.name : 'inom kartområdet';
    const mkSky = (c, ahead) => ({ on: true, level: 'skyfall', hour: c.hour, cell: c,
      txt: ahead ? (c.lvl >= 4 ? 'Risk för ' + c.yearsTxt.replace(' år', '-årsregn') + ' om ' + c.hour + ' h' : 'Skyfall väntas om ' + c.hour + ' h') : (c.lvl >= 4 ? c.yearsTxt.replace(' år', '-årsregn') + ' just nu' : 'Varning för skyfall'),
      sub: [place(c), ahead ? at(c.hour) : 'nu',
        c.lvl >= 4 ? c.yearsTxt.replace(' år', '-årsregn') + ' (' + f1(c.yAmt) + ' mm / ' + c.yPer + ' h' + (ahead ? ', uppmätt + prognos)' : ', uppmätt)') : f1(c.mmh) + ' mm/h'].join(' · '),
      color: c.lvl >= 4 ? '#b260ff' : '#e3262b', rgb: c.lvl >= 4 ? '178,96,255' : '227,38,43', anim: 'skyWarnPulse 1.1s ease-in-out infinite' });
    const mkHeavy = (c, ahead) => {
      let pk = c.mmh; for (let h = c.hour; h <= Math.min(12, c.hour + 3); h++) if (hv[h] && hv[h].mmh > pk) pk = hv[h].mmh;
      return { on: true, level: 'kraftigt', hour: c.hour, cell: c,
        txt: ahead ? 'Kraftigt regn om ' + c.hour + ' h' : 'Kraftigt regn just nu',
        sub: [place(c), ahead ? at(c.hour) : 'nu', 'upp till ' + f1(pk) + ' mm/h'].join(' · '),
        color: '#ff9a2e', rgb: '255,154,46', anim: 'skyWarnPulse 1.8s ease-in-out infinite' };
    };
    // NOW box
    const now = sky[0] ? mkSky(sky[0], false) : hv[0] ? mkHeavy(hv[0], false) : null;
    // AHEAD box: the first hour (1…12) that is worse than what is happening now
    let ahead = null;
    const nowLvl = now ? (now.level === 'skyfall' ? 2 : 1) : 0;
    // AHEAD: the most severe risk within 12 h — a return-period rain (highest number of years) beats intense rain;
    // shown also when something is already happening now, as long as what is coming is worse.
    const nowYears = now && now.cell && now.cell.lvl >= 4 ? (now.cell.years || 0) : 0;
    let bestRp = null, firstRed = null, firstHeavy = null;
    for (let h = 1; h <= 12; h++) {
      const c = sky[h];
      if (c && c.lvl >= 4 && (!bestRp || c.years > bestRp.years)) bestRp = c;
      if (c && c.lvl < 4 && !firstRed) firstRed = c;
      if (hv[h] && !firstHeavy) firstHeavy = hv[h];
    }
    if (bestRp && bestRp.years > nowYears * 1.15) ahead = mkSky(bestRp, true);
    else if (firstRed && nowLvl < 2) ahead = mkSky(firstRed, true);
    else if (firstHeavy && nowLvl < 1) ahead = mkHeavy(firstHeavy, true);
    const off = { on: false, level: '', hour: 0, txt: '', sub: '', color: '#e3262b', rgb: '227,38,43', anim: 'none' };
    if (ahead) ahead.cd = '+' + ahead.hour + ' h';
    const val = Object.assign({}, now || ahead || off, { now: now || off, ahead: ahead || off, nowOn: !!now, aheadOn: !!ahead });
    this._warnCache = { key, val };
    return val;
  }
  // Rain (mm) accumulated over the window ENDING at `hour`: [hour-period+1 … hour].
  // At hour 0 this is what has actually fallen (measured past + this hour); at hour +4 it is measured past + forecast
  // up to +4 h — i.e. "how rare will this rain have become by then". Never sums forecast hours into a "now" verdict.
  sumWindow(sampler, hour, period) {
    let s = 0; for (let h = Math.max(-12, hour - period + 1); h <= Math.min(12, hour); h++) s += sampler(h) || 0;
    return s;
  }
  rpLabelHtml(mm, period) {
    const k = this.rpClass(mm, period);
    const amt = (Math.round(mm * 10) / 10).toString().replace('.', ',');
    return '<div style="transform:translate(-50%,-50%);pointer-events:none;display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:4px 10px;border-radius:12px;background:rgba(3,10,15,.86);border:1px solid rgba(' + k.rgb + ',.65);box-shadow:0 2px 12px rgba(0,0,0,.55),0 0 14px rgba(' + k.rgb + ',' + (k.rare ? '.45' : '.15') + ');white-space:nowrap">' +
      '<span style="font-family:JetBrains Mono,monospace;font-size:12px;font-weight:700;color:#eaf7fb">' + amt + ' mm<span style="font-size:9px;color:#7fa8b5;font-weight:500"> / ' + period + ' h</span></span>' +
      '<span style="display:inline-flex;align-items:center;gap:4px;font-size:9px;letter-spacing:.1em;font-weight:700;text-transform:uppercase;color:' + k.hex + '"><span style="width:5px;height:5px;border-radius:50%;background:' + k.hex + ';box-shadow:0 0 6px ' + k.hex + '"></span>' + (k.rare ? 'Återkomsttid ' + k.label : 'Vanligt regn') + '</span>' +
    '</div>';
  }
  // Single source of truth for "peak rain this hour" — union of the map grid and the 8 kommun points
  peakRainAt(hour) {
    let mx = 0;
    const grid = (this.weather && this.wxGrid && this.wxGrid.length) ? this.wxGrid : this.rainGridPoints().map(g => ({ lat: g.lat, lng: g.lng, sim: true }));
    grid.forEach(g => { const p = this.gridSampler(g)(hour); if (p > mx) mx = p; });
    this.baseMunis().forEach(m => { const p = this.weather ? this.fcPrecip(m.id, hour) : this.simRainAt(m.lat, m.lng, hour); if (p > mx) mx = p; });
    return mx;
  }
  skyfallScrubVals() {
    const w = this.weather;
    const max = w && w.times && w.times.length ? Math.min(w.times.length - 1, 12) : 12;
    const min = -12; // 12 h back: measured SMHI stations (live) / simulated band (sim)
    const hour = Math.max(min, Math.min(this.state.skyfallHour || 0, max));
    let label, kind;
    if (hour === 0) { label = 'Nu'; kind = ''; }
    else {
      let clock = '';
      if (hour > 0 && w && w.times && w.times[hour]) { const d = new Date(w.times[hour]); clock = ' · ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }); }
      else { const d = new Date(Date.now() + hour * 3600000); clock = ' · ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }); }
      label = (hour > 0 ? '+' : '−') + Math.abs(hour) + ' h' + clock;
      kind = w ? this.rainModelInfo(hour) : (hour > 0 ? 'Prognos · simulerad' : 'Historik · simulerad');
    }
    if (hour === 0) kind = w ? this.rainModelInfo(0) : 'Nu · simulerad';
    // most severe automatic återkomsttid across the map (same sampling as the clouds)
    let best = null;
    const consider = a => { if (!best || a.lvl > best.lvl || (a.lvl === best.lvl && ((a.years || 0) > (best.years || 0) || (!a.years && a.amt > best.amt)))) best = a; };
    const grid = (w && this.wxGrid && this.wxGrid.length) ? this.wxGrid : this.rainGridPoints().map(g => ({ lat: g.lat, lng: g.lng, sim: true }));
    grid.forEach(g => consider(this.rpAuto(this.gridSampler(g), hour)));
    this.baseMunis().forEach(m => consider(this.rpAuto(h => (w ? this.fcPrecip(m.id, h) : this.simRainAt(m.lat, m.lng, h)), hour)));
    const period = best.period, peakAmt = best.amt, rp = best.cls;
    const maxP = this.peakRainAt(hour);
    const mmTxt = maxP < 0.2 ? 'Uppehåll' : (Math.round(maxP * 10) / 10).toString().replace('.', ',') + ' mm/h';
    const mmColor = maxP < 0.2 ? '#577684' : this.rainHex(maxP);
    const amtTxt = peakAmt < 1 ? 'Uppehåll' : (Math.round(peakAmt * 10) / 10).toString().replace('.', ',') + ' mm / ' + period + ' h';
    const rpTxt = peakAmt < 1 ? '' : (rp.rare ? 'Återkomsttid ' + best.yearsTxt + ' (' + rp.label + ')' : 'Vanligt regn · <2 år');
    return { max, min, hour, label, kind, mmTxt, mmColor, period, amtTxt, rpTxt, rpColor: peakAmt < 1 ? '#577684' : rp.hex, rare: rp.rare && peakAmt >= 1 };
  }

  // Scan the actual RainViewer radar: does precipitation exist over the NSVA region right now?
  // Returns true (clouds), false (clear), or null (couldn't determine).
  async hasCloudsNow() {
    if (typeof window === 'undefined' || !this.rvFrames || !this.rvFrames.length) return null;
    const base = this.rvFrames[this.rvIndex != null ? this.rvIndex : this.rvFrames.length - 1];
    const z = 7, n = 2 ** z;
    const worldX = lon => (lon + 180) / 360 * n;
    const worldY = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
    const wx0 = worldX(11.9), wx1 = worldX(14.3), wy0 = worldY(56.75), wy1 = worldY(55.55); // NSVA + bordering kommuner
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const ctx = cv.getContext('2d');
    const load = url => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
    let determined = false, opaque = 0;
    for (let tx = Math.floor(wx0); tx <= Math.floor(wx1); tx++) {
      for (let ty = Math.floor(wy0); ty <= Math.floor(wy1); ty++) {
        const im = await load(base + '/256/' + z + '/' + tx + '/' + ty + '/4/1_1.png');
        if (!im) continue;
        ctx.clearRect(0, 0, 256, 256); ctx.drawImage(im, 0, 0);
        let d; try { d = ctx.getImageData(0, 0, 256, 256).data; } catch (e) { return null; }
        determined = true;
        // only sample the pixels that fall inside the NSVA bounding box within this tile
        const px0 = Math.max(0, Math.floor((wx0 - tx) * 256)), px1 = Math.min(256, Math.ceil((wx1 - tx) * 256));
        const py0 = Math.max(0, Math.floor((wy0 - ty) * 256)), py1 = Math.min(256, Math.ceil((wy1 - ty) * 256));
        for (let py = py0; py < py1; py++) {
          for (let px = px0; px < px1; px++) { if (d[(py * 256 + px) * 4 + 3] > 30) { opaque++; if (opaque > 8) return true; } }
        }
      }
    }
    return determined ? false : null;
  }

  // ---------- RainViewer: real animated rain-cloud radar tiles ----------
  async fetchRainViewer() {
    if (typeof window === 'undefined' || !window.fetch) return;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: ctrl.signal });
      clearTimeout(to);
      const j = await r.json();
      const past = (j.radar && j.radar.past) || [];
      const now = (j.radar && j.radar.nowcast) || [];
      this.rvFrames = past.concat(now).map(f => j.host + f.path);
      this.rvIndex = past.length ? past.length - 1 : 0;
      this.rvMeta = past.map(f => ({ base: j.host + f.path, t: (f.time || 0) * 1000 }));
      await this.decodeRadar();
      if (this.state.filters && this.state.filters.skyfall) this.applyMapFilters();
      this.startRadarRain();
      this.setState(s => ({ tick: s.tick }));
    } catch (e) { this.rvFrames = null; }
  }

  // ---------- Radar as DATA (not only a picture) ----------
  // Decode the RainViewer frames over NV Skåne into rain-rate grids, so showers the SMHI forecast misses
  // still show up on the map, in the scan and in the warnings. Zoom-7 tiles x 68–69, y 39–40 cover the area.
  async decodeRadar() {
    const meta = this.rvMeta; if (!meta || !meta.length) return;
    this._radarCache = this._radarCache || {};
    const load = url => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
    // every other frame (~20 min apart) is plenty for hourly means; always include the newest
    const pick = meta.filter((_, i) => (meta.length - 1 - i) % 2 === 0);
    const frames = [];
    for (const f of pick) {
      if (this._radarCache[f.base]) { frames.push(this._radarCache[f.base]); continue; }
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; const ctx = cv.getContext('2d');
      let okTiles = 0;
      await Promise.all([[68, 39, 0, 0], [69, 39, 256, 0], [68, 40, 0, 256], [69, 40, 256, 256]].map(async ([x, y, ox, oy]) => {
        const im = await load(f.base + '/256/7/' + x + '/' + y + '/2/1_1.png');
        if (im) { ctx.drawImage(im, ox, oy); okTiles++; }
      }));
      if (!okTiles) continue;
      let data; try { data = ctx.getImageData(0, 0, 512, 512).data; } catch (e) { return; } // tainted → give up quietly
      const fr = { base: f.base, t: f.t, data };
      this._radarCache[f.base] = fr; frames.push(fr);
    }
    // central 12 h archive (Cloudflare Worker + KV): older frames than the live feed, same for every device
    try {
      const r = await fetch('/radar-hist/index.json');
      if (r.ok) {
        const j = await r.json();
        const liveFrom = meta.length ? Math.min(...meta.map(m => m.t)) : Date.now();
        const old = (j.frames || []).filter(f => f.t < liveFrom - 5 * 60000 && f.t > Date.now() - 12.5 * 3600000);
        this.radarArchiveN = (j.frames || []).length;
        for (const f of old) {
          const key = 'hist:' + f.t;
          if (this._radarCache[key]) { frames.push(this._radarCache[key]); continue; }
          const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; const ctx = cv.getContext('2d');
          let okTiles = 0;
          await Promise.all([[68, 39, 0, 0], [69, 39, 256, 0], [68, 40, 0, 256], [69, 40, 256, 256]].map(async ([x, y, ox, oy]) => {
            const im = await load('/radar-hist/' + f.t + '/' + x + '/' + y + '.png');
            if (im) { ctx.drawImage(im, ox, oy); okTiles++; }
          }));
          if (!okTiles) continue;
          let data; try { data = ctx.getImageData(0, 0, 512, 512).data; } catch (e) { break; }
          const fr = { base: key, t: f.t, data, archived: true };
          this._radarCache[key] = fr; frames.push(fr);
        }
      }
    } catch (e) {}
    // drop cache entries that are no longer in the feed / archive
    const keep = {}; frames.forEach(fr => { keep[fr.base] = fr; }); this._radarCache = keep;
    this.radarFrames = frames.sort((a, b) => a.t - b.t);
    this.radarStamp = Date.now();
    this.computeRadarCal();
    this.saveRadarHistory();
  }
  // Radar pixel → rain rate (mm/h). The open RainViewer feed only ships one translucent palette where opacity
  // rises with reflectivity; opacity is mapped to dBZ and converted with Marshall–Palmer (Z = 200·R^1.6).
  // The absolute level is then calibrated against the gauges (computeRadarCal).
  // RainViewer "Universal Blue" (scheme 2): intensity is in the COLOUR, rain pixels are fully opaque.
  // Translucent beige = noise / under ~10 dBZ → 0. Blue ramp light→dark = ~10→38 dBZ, then yellow/orange/red.
  rvPixMm(r, g, b, a) {
    if (a < 250) return 0;
    let dbz;
    if (b > r) {
      const G = [221, 209, 197, 186, 174, 163, 154, 145, 136, 127, 119, 112, 105, 98, 91, 85, 81, 78, 74, 71];
      let k = 0, bd = 999; G.forEach((v, i) => { const d = Math.abs(v - g); if (d < bd) { bd = d; k = i; } });
      dbz = 10 + k * 1.5;
    } else if (r > 200 && b > 150) dbz = 57;      // pink / white
    else if (r > 200 && g > 180) dbz = 42;        // yellow
    else if (r > 200 && g > 90) dbz = 47;         // orange
    else dbz = 52;                                 // red
    return Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6);
  }
  radarPx(fr, lat, lng) {
    const n = 128;
    const X = ((lng + 180) / 360 * n - 68) * 256;
    const r = lat * Math.PI / 180;
    const Y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - 39) * 256;
    if (X < 1 || Y < 1 || X > 510 || Y > 510) return null; // outside the decoded area
    let sum = 0, cnt = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = fr.data[((Math.round(Y) + dy) * 512 + (Math.round(X) + dx)) * 4 + 3];
      cnt++;
      const p = ((Math.round(Y) + dy) * 512 + (Math.round(X) + dx)) * 4;
      sum += this.rvPixMm(fr.data[p], fr.data[p + 1], fr.data[p + 2], a);
    }
    return Math.min(120, sum / cnt);
  }
  // hourly radar estimate: hour 0 = newest frame, −1/−2 = mean over that clock hour, +1/+2 = newest frame
  // moved with the wind (persistence nowcast) and faded. null = no radar for that hour.
  radarAt(lat, lng, hour) {
    const fs = this.radarFrames; if (!fs || !fs.length) return null;
    const cal = this.radarCal || 1;
    if (hour === 0 && this._depth) {
      // depth: mean rate over the frames of the last 60 min = mm actually fallen in the last hour
      const now = fs[fs.length - 1].t, recent = fs.filter(f => f.t > now - 3600000);
      let s = 0, c = 0; recent.forEach(f => { const v = this.radarPx(f, lat, lng); if (v != null) { s += v; c++; } });
      return c ? (s / c) * cal : null;
    }
    if (hour > 0 && this._depth) return null; // no radar persistence when judging återkomsttid
    if (hour === 0) { const v = this.radarPx(fs[fs.length - 1], lat, lng); return v == null ? null : v * cal; }
    if (hour < 0) {
      const end = Math.floor(Date.now() / 3600000) * 3600000 + (hour + 1) * 3600000, start = end - 3600000;
      const inH = fs.filter(f => f.t > start && f.t <= end);
      if (!inH.length) { const hv = this.radarHistAt(lat, lng, hour); return hv == null ? null : hv * cal; } // saved history
      let s = 0, c = 0; inH.forEach(f => { const v = this.radarPx(f, lat, lng); if (v != null) { s += v; c++; } });
      return c ? (s / c) * cal : null;
    }
    if (hour <= 4) {
      // radar nowcast: move the newest radar image along the motion measured from the radar frames themselves
      const mv = this.radarMotion(); if (!mv) return null;
      const lead = hour - 0.5 + (Date.now() - fs[fs.length - 1].t) / 3600000; // mid-hour, from the frame's own time
      const km = mv.kmh * lead;
      const dLat = km * Math.cos(mv.to) / 111, dLng = km * Math.sin(mv.to) / (111 * Math.cos(lat * Math.PI / 180));
      const v = this.radarPx(fs[fs.length - 1], lat - dLat, lng - dLng);
      return v == null ? null : v * cal;
    }
    return null;
  }
  // ---- Regnmätare: detail with everything the station publishes ----
  async openGauge(g) {
    this.setState({ gauge: { g, extra: null, loading: g.src === 'SMHI' || g.src === 'FM' }, gHist: null });
    setTimeout(() => this.loadGaugeHistory(g), 50);
    if (!(g.src === 'SMHI' || g.src === 'FM') || !g.id || typeof fetch === 'undefined') return;
    const get = async (p, period) => {
      try { const r = await fetch('/smhi-metobs/api/version/1.0/parameter/' + p + '/station/' + g.id + '/period/' + period + '/data.json'); if (!r.ok) return null; const j = await r.json(); return (j.value || []).map(v => ({ t: v.date, v: v.value == null ? null : parseFloat(v.value) })); } catch (e) { return null; }
    };
    const [temp, wind, gust, hum, q15, daily] = await Promise.all([get(1, 'latest-hour'), get(4, 'latest-hour'), get(21, 'latest-hour'), get(6, 'latest-hour'), get(14, 'latest-day'), get(5, 'latest-months')]);
    if (!this.state.gauge || this.state.gauge.g !== g) return;
    this.setState({ gauge: { g, loading: false, extra: { temp, wind, gust, hum, q15, daily } } });
  }
  gaugeDetail() {
    const st = this.state.gauge; if (!st) return { open: false };
    const g = st.g, ex = st.extra || {};
    const srcName = { SMHI: 'SMHI', FM: 'Försvarsmakten (via SMHI)', DMI: 'DMI', SIM: 'Simulerad' }[g.src] || g.src;
    const f1 = v => v == null || isNaN(v) ? '–' : (Math.round(v * 10) / 10).toString().replace('.', ',');
    const vals = (g.vals || []).slice(-24);
    const sum = n => { const s = vals.slice(-n).filter(v => v.mm != null); return s.length ? s.reduce((a, v) => a + v.mm, 0) : null; };
    const last = vals.length ? vals[vals.length - 1] : null;
    const mx = vals.reduce((a, v) => (v.mm != null && v.mm > a.mm ? v : a), { mm: -1 });
    const top = Math.max(2, ...vals.map(v => v.mm || 0));
    const hours = vals.map(v => ({ h: v.mm == null ? 0 : Math.max(3, v.mm / top * 100), color: v.mm == null ? 'rgba(127,168,181,.25)' : (v.mm >= 0.1 ? this.rainHex(v.mm) : 'rgba(127,168,181,.4)'), label: new Date(v.t).toLocaleTimeString('sv-SE', { hour: '2-digit' }), tip: new Date(v.t).toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit' }) + ' · ' + (v.mm == null ? 'saknas' : f1(v.mm) + ' mm') }));
    const lastOf = a => a && a.length ? a[a.length - 1].v : null;
    const q15 = (ex.q15 || []).slice(-16);
    const q15top = Math.max(1, ...q15.map(v => v.v || 0));
    const daily = (ex.daily || []).slice(-30);
    const dtop = Math.max(5, ...daily.map(v => v.v || 0));
    const dsum = daily.filter(v => v.v != null).reduce((a, v) => a + v.v, 0);
    const missing = vals.filter(v => v.mm == null).length;
    return {
      open: true, name: g.name, src: srcName, srcLive: g.src !== 'SIM',
      idTxt: g.id ? ('Station ' + g.id) : '', posTxt: g.lat.toFixed(3) + '° N · ' + g.lng.toFixed(3) + '° E',
      lastTxt: last ? f1(last.mm) : '–', lastTime: last ? new Date(last.t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '–',
      s3: f1(sum(3)), s6: f1(sum(6)), s12: f1(sum(12)), s24: f1(sum(24)),
      maxTxt: mx.mm >= 0 ? f1(mx.mm) + ' mm' : '–', maxTime: mx.mm >= 0 ? new Date(mx.t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '',
      qualTxt: vals.length ? ((vals.length - missing) + ' av ' + vals.length + ' timmar rapporterade') : 'Ingen historik',
      hours, hasHours: hours.length > 0,
      loading: !!st.loading,
      hasExtra: !!(ex.temp || ex.wind || ex.hum),
      tempTxt: f1(lastOf(ex.temp)), windTxt: f1(lastOf(ex.wind)), gustTxt: f1(lastOf(ex.gust)), humTxt: lastOf(ex.hum) == null ? '–' : Math.round(lastOf(ex.hum)) + '',
      q15: q15.map(v => ({ h: v.v == null ? 0 : Math.max(3, v.v / q15top * 100), color: v.v >= 0.1 ? this.rainHex(v.v * 4) : 'rgba(127,168,181,.4)', tip: new Date(v.t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) + ' · ' + f1(v.v) + ' mm' })), hasQ15: q15.length > 0,
      daily: daily.map(v => ({ h: v.v == null ? 0 : Math.max(3, v.v / dtop * 100), color: (v.v || 0) >= 10 ? '#ffb547' : (v.v || 0) >= 1 ? '#35d6f2' : 'rgba(127,168,181,.4)', tip: new Date(v.t).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) + ' · ' + f1(v.v) + ' mm' })), hasDaily: daily.length > 0,
      dailySum: f1(dsum), dailyDays: daily.length,
      noExtraTxt: g.src === 'DMI' ? 'DMI publicerar timvärden för nederbörd. Fler parametrar hämtas inte för danska stationer ännu.' : g.src === 'SIM' ? 'Simulerad mätare – ingen riktig data.' : '',
      close: () => this.setState({ gauge: null, gHist: null }),
      hist: this.gaugeHistView(g),
    };
  }
  // ---- Regnmätare: deep history (SMHI latest-months ≈ 4 months hourly) vs radar archive, with Dahlström per hour ----
  async loadGaugeHistory(g) {
    if (!g || !g.id || !(g.src === 'SMHI' || g.src === 'FM')) { this.setState({ gHist: { id: g && g.id, period: '24h', series: null, note: g && g.src === 'DMI' ? 'DMI-mätare: bara senaste dygnet finns i Hydra än så länge.' : 'Ingen historik för simulerade mätare.' } }); return; }
    const prevH = this.state.gHist || {};
    this.setState({ gHist: { id: g.id, period: prevH.period || '24h', from: prevH.from, to: prevH.to, loading: true, series: null, onlyRp: false } });
    let series = null;
    try {
      const r = await fetch('/smhi-metobs/api/version/1.0/parameter/7/station/' + g.id + '/period/latest-months/data.json');
      if (r.ok) { const j = await r.json(); series = (j.value || []).map(v => ({ t: Number(v.date), mm: v.value == null || v.value === '' ? null : parseFloat(v.value), q: v.quality })).filter(v => v.mm == null || (v.mm >= 0 && v.mm < 150)); }
    } catch (e) {}
    if (!series || !series.length) series = (g.vals || []).map(v => ({ t: new Date(v.t).getTime(), mm: v.mm }));
    // radar archive index (central, up to 7 days)
    let idx = [];
    try { const r2 = await fetch('/radar-hist/index.json'); if (r2.ok) idx = ((await r2.json()).frames || []).map(f => f.t); } catch (e) {}
    this._radarIdx = idx;
    this.setState(s => ({ gHist: Object.assign({}, s.gHist, { loading: false, series, from: series.length ? series[0].t : null }) }));
    this.loadGaugeRadar(g);
  }
  // hourly radar mean at the gauge, read from the archived tile that contains it (only for the hours shown)
  async loadGaugeRadar(g) {
    const h = this.state.gHist; if (!h || !h.series || !this._radarIdx || !this._radarIdx.length) return;
    const n = 128, X = (g.lng + 180) / 360 * n, rr = g.lat * Math.PI / 180, Y = (1 - Math.log(Math.tan(rr) + 1 / Math.cos(rr)) / Math.PI) / 2 * n;
    const tx = Math.floor(X), ty = Math.floor(Y), px = Math.round((X - tx) * 256), py = Math.round((Y - ty) * 256);
    const nowH = Math.floor(Date.now() / 3600000) * 3600000;
    let from = nowH - (h.period === '24h' ? 24 : 168) * 3600000, to = nowH + 3600000;
    if (h.period === 'custom' && h.from && h.to) { from = new Date(h.from + 'T00:00').getTime(); to = new Date(h.to + 'T23:59').getTime(); if (to - from > 7.05 * 86400000) return; }
    else if (h.period === '30d' || h.period === '4m') return;
    const frames = this._radarIdx.filter(t => t > from && t <= to);
    this._gRad = this._gRad || {};
    const key = g.id + ':';
    const todo = frames.filter(t => this._gRad[key + t] === undefined);
    this.setState(s => ({ gHist: Object.assign({}, s.gHist, { radarTotal: frames.length, radarDone: frames.length - todo.length }) }));
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const ctx = cv.getContext('2d', { willReadFrequently: true });
    const load = url => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
    let done = frames.length - todo.length;
    for (let i = 0; i < todo.length; i += 6) {
      if (!this.state.gauge || this.state.gauge.g !== g) return;
      await Promise.all(todo.slice(i, i + 6).map(async t => {
        const im = await load('/radar-hist/' + t + '/' + tx + '/' + ty + '.png');
        if (!im) { this._gRad[key + t] = null; return; }
        ctx.clearRect(0, 0, 256, 256); ctx.drawImage(im, 0, 0);
        let s = 0, c = 0;
        try { const d = ctx.getImageData(Math.max(0, px - 1), Math.max(0, py - 1), 3, 3).data; for (let k = 0; k < d.length; k += 4) { s += this.rvPixMm(d[k], d[k + 1], d[k + 2], d[k + 3]); c++; } } catch (e) {}
        this._gRad[key + t] = c ? s / c : null;
      }));
      done = Math.min(frames.length, done + 6);
      this.setState(s => ({ gHist: Object.assign({}, s.gHist, { radarDone: done }) }));
    }
  }
  gaugeHistView(g) {
    const H = this.state.gHist;
    const f1 = v => v == null || isNaN(v) ? '–' : (Math.round(v * 10) / 10).toString().replace('.', ',');
    const periods = [['24h', '24 h'], ['7d', '7 dygn'], ['30d', '30 dygn'], ['4m', 'Allt (~4 mån)']];
    const cur = H && H.period || '24h';
    const base = {
      periods: periods.map(([k, l]) => ({ key: k, label: l, on: k === cur, bg: k === cur ? 'rgba(var(--acg,53,214,242),.18)' : 'transparent', border: k === cur ? 'rgba(var(--acg,53,214,242),.55)' : 'rgba(74,196,224,.18)',
        pick: () => { this.setState(s => ({ gHist: Object.assign({}, s.gHist, { period: k }) })); setTimeout(() => this.loadGaugeRadar(g), 30); } })),
      onlyRp: !!(H && H.onlyRp), toggleRp: () => this.setState(s => ({ gHist: Object.assign({}, s.gHist, { onlyRp: !(s.gHist && s.gHist.onlyRp) }) })),
      rpBtnBg: H && H.onlyRp ? 'rgba(178,96,255,.22)' : 'transparent',
    };
    // calendar defaults so the Från/Till fields are usable in every state (idle / loading / no data)
    {
      const isoD = t => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
      const now0 = Date.now();
      const spanD = cur === '24h' ? 1 : cur === '7d' ? 7 : cur === '30d' ? 30 : 120;
      Object.assign(base, {
        fromVal: (H && H.from) || isoD(now0 - spanD * 86400000), toVal: (H && H.to) || isoD(now0),
        minD: isoD(now0 - 125 * 86400000), maxD: isoD(now0),
        rangeTxt: cur === 'custom' ? 'Egen period' : (periods.find(p => p[0] === cur) || ['', ''])[1],
        customBorder: cur === 'custom' ? 'rgba(var(--acg,53,214,242),.55)' : 'rgba(74,196,224,.14)',
        setFrom: e => { const v = e.target.value; if (!v) return; this.setState(s => ({ gHist: Object.assign({}, s.gHist, { period: 'custom', from: v, to: (s.gHist && s.gHist.to) || isoD(Date.now()) }) })); if (!this.state.gHist || !this.state.gHist.series) setTimeout(() => this.loadGaugeHistory(g), 30); else setTimeout(() => this.loadGaugeRadar(g), 30); },
        setTo: e => { const v = e.target.value; if (!v) return; this.setState(s => ({ gHist: Object.assign({}, s.gHist, { period: 'custom', to: v, from: (s.gHist && s.gHist.from) || isoD(Date.now() - 7 * 86400000) }) })); if (!this.state.gHist || !this.state.gHist.series) setTimeout(() => this.loadGaugeHistory(g), 30); else setTimeout(() => this.loadGaugeRadar(g), 30); },
      });
    }
    if (!H) return Object.assign(base, { state: 'idle', idle: true, load: () => this.loadGaugeHistory(g) });
    if (H.loading) return Object.assign(base, { state: 'loading', loading: true });
    if (!H.series) return Object.assign(base, { state: 'none', none: true, note: H.note || 'Ingen historik.' });
    const ser = H.series.slice().sort((a, b) => a.t - b.t);
    const byH = {}; ser.forEach(v => { byH[Math.floor(v.t / 3600000) * 3600000] = v.mm; });
    const nowH = Math.floor(Date.now() / 3600000) * 3600000;
    const first = ser.length ? Math.floor(ser[0].t / 3600000) * 3600000 : nowH;
    // radar per hour (mean of archived frames in that clock hour, calibrated with the current gauge factor)
    const cal = this.radarCal || 1, idx = this._radarIdx || [], gR = this._gRad || {};
    const radarH = t0 => { const fr = idx.filter(t => t > t0 && t <= t0 + 3600000).map(t => gR[g.id + ':' + t]).filter(v => v != null); return fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length * cal : null; };
    // Dahlström per hour: worst of the 1/3/6/12 h windows ending that hour
    const rpAt = t0 => { let best = { y: 0, per: 1, mm: 0 }; [1, 3, 6, 12].forEach(per => { let s = 0, miss = 0; for (let k = 0; k < per; k++) { const v = byH[t0 - k * 3600000]; if (v == null) miss++; else s += v; } if (miss > per / 2) return; const y = this.dahlYears(s, per * 60); if (y > best.y) best = { y, per, mm: s }; }); return best; };
    // custom range (from/to dates) overrides the preset period
    const dayMs = 86400000, isoDay = t => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
    let t0, t1;
    if (cur === 'custom' && H.from && H.to) {
      t0 = Math.max(first, new Date(H.from + 'T00:00').getTime()); t1 = Math.min(nowH, new Date(H.to + 'T23:00').getTime());
      if (t1 < t0) { const x = t0; t0 = t1; t1 = x; }
    } else {
      const span = cur === '24h' ? 24 : cur === '7d' ? 168 : cur === '30d' ? 720 : Math.ceil((nowH - first) / 3600000) + 1;
      t1 = nowH; t0 = nowH - (span - 1) * 3600000;
    }
    t0 = Math.floor(t0 / 3600000) * 3600000;
    const hours = []; for (let t = t0; t <= t1; t += 3600000) hours.push(t);
    const rangeDays = (t1 - t0) / dayMs;
    const hourlyView = rangeDays <= 7.05;
    const events = []; let missing = 0, total = 0, rSum = 0, gSum = 0, nCmp = 0, absD = 0;
    const hRows = hours.map(t => {
      const mm = byH[t]; if (mm == null) missing++; else total += mm;
      const rad = hourlyView ? radarH(t) : null;
      if (mm != null && rad != null) { gSum += mm; rSum += rad; absD += Math.abs(rad - mm); nCmp++; }
      const rp = rpAt(t);
      if (rp.y >= 2) events.push({ t, y: rp.y, per: rp.per, mm: rp.mm });
      return { t, mm, rad, rp };
    });
    // merge consecutive event hours into one event (keep the peak)
    const ev = []; events.forEach(e => { const last = ev[ev.length - 1]; if (last && e.t - last.tEnd <= 3 * 3600000) { last.tEnd = e.t; if (e.y > last.y) Object.assign(last, { y: e.y, per: e.per, mm: e.mm, tPeak: e.t }); } else ev.push({ tStart: e.t, tEnd: e.t, tPeak: e.t, y: e.y, per: e.per, mm: e.mm }); });
    const dfmt = t => new Date(t).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const rpCol = y => y >= 50 ? '#9628e6' : y >= 10 ? '#b260ff' : y >= 2 ? '#ce96ff' : '#7fa8b5';
    let rows;
    if (hourlyView) {
      rows = hRows.slice().reverse().filter(r => !H.onlyRp || r.rp.y >= 2).map(r => {
        const diff = r.mm != null && r.rad != null ? r.rad - r.mm : null;
        return { when: dfmt(r.t), gauge: r.mm == null ? 'saknas' : f1(r.mm), radar: r.rad == null ? '–' : f1(r.rad),
          diff: diff == null ? '–' : (diff > 0 ? '+' : '') + f1(diff), diffColor: diff == null ? '#577684' : Math.abs(diff) < 0.5 ? '#2fe6c4' : Math.abs(diff) < 2 ? '#ffb547' : '#ff6b6b',
          rp: r.rp.y >= 2 ? this.yearsTxt(r.rp.y) + ' · ' + r.rp.per + ' h' : (r.rp.y >= 0.5 ? this.yearsTxt(r.rp.y) : '–'), rpColor: rpCol(r.rp.y), bar: r.mm ? Math.min(100, r.mm / 10 * 100) : 0, barColor: r.mm ? this.rainHex(r.mm) : 'transparent', rare: r.rp.y >= 2 ? '1' : '' };
      });
    } else {
      const days = {}; hRows.forEach(r => { const d = new Date(r.t); d.setHours(0, 0, 0, 0); const k = d.getTime(); const o = days[k] || (days[k] = { t: k, sum: 0, n: 0, miss: 0, max: 0, y: 0, per: 1 }); if (r.mm == null) o.miss++; else { o.sum += r.mm; o.n++; if (r.mm > o.max) o.max = r.mm; } if (r.rp.y > o.y) { o.y = r.rp.y; o.per = r.rp.per; } });
      rows = Object.values(days).sort((a, b) => b.t - a.t).filter(d => !H.onlyRp || d.y >= 2).map(d => ({ when: new Date(d.t).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }), gauge: d.n ? f1(d.sum) : 'saknas', radar: f1(d.max), diff: d.miss ? d.miss + ' h saknas' : '–', diffColor: d.miss > 6 ? '#ffb547' : '#577684',
        rp: d.y >= 2 ? this.yearsTxt(d.y) + ' · ' + d.per + ' h' : (d.y >= 0.5 ? this.yearsTxt(d.y) : '–'), rpColor: rpCol(d.y), bar: Math.min(100, d.sum / 30 * 100), barColor: d.sum >= 1 ? this.rainHex(Math.min(d.max, 30)) : 'transparent', rare: d.y >= 2 ? '1' : '' }));
    }
    const hourly = hourlyView;
    const minD = isoDay(first), maxD = isoDay(nowH);
    return Object.assign(base, {
      state: 'ok', ok: true, hourly, daily: !hourly,
      fromVal: H.from || isoDay(t0), toVal: H.to || isoDay(t1), minD, maxD,
      setFrom: e => { const v = e.target.value; if (!v) return; this.setState(s => ({ gHist: Object.assign({}, s.gHist, { period: 'custom', from: v, to: (s.gHist && s.gHist.to) || isoDay(t1) }) })); setTimeout(() => this.loadGaugeRadar(g), 30); },
      setTo: e => { const v = e.target.value; if (!v) return; this.setState(s => ({ gHist: Object.assign({}, s.gHist, { period: 'custom', to: v, from: (s.gHist && s.gHist.from) || isoDay(t0) }) })); setTimeout(() => this.loadGaugeRadar(g), 30); },
      rangeTxt: new Date(t0).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) + ' – ' + new Date(t1).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + (hourly ? 'per timme' : 'per dygn'),
      customOn: cur === 'custom', customBorder: cur === 'custom' ? 'rgba(var(--acg,53,214,242),.55)' : 'rgba(74,196,224,.18)',
      cols: hourly ? ['Timme', 'Mätare mm', 'Radar mm', 'Skillnad', 'Återkomsttid'] : ['Dygn', 'Summa mm', 'Max timme mm', 'Datakvalitet', 'Värsta återkomsttid'],
      rows, rowsN: rows.length, empty: !rows.length,
      fromTxt: 'Data från ' + new Date(first).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }) + ' (SMHI sparar ca 4 månader timvärden här; äldre finns i SMHI:s arkiv)',
      totalTxt: f1(total) + ' mm', missingTxt: missing + ' av ' + hours.length + ' timmar saknas',
      cmpTxt: nCmp ? ('Radar ' + f1(rSum) + ' mm mot mätare ' + f1(gSum) + ' mm under ' + nCmp + ' timmar · medelavvikelse ' + f1(absD / nCmp) + ' mm/h') : (hourly ? 'Ingen radarhistorik för perioden ännu (arkivet sparar 7 dygn)' : 'Radarjämförelse visas för 24 h och 7 dygn'),
      radarProg: H.radarTotal ? ('Radar: ' + (H.radarDone || 0) + ' av ' + H.radarTotal + ' bilder lästa') : '',
      events: ev.slice().reverse().map(e => ({ when: dfmt(e.tStart) + (e.tEnd > e.tStart ? ' – ' + new Date(e.tEnd).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : ''), txt: this.yearsTxt(e.y).replace(' år', '-årsregn'), detail: f1(e.mm) + ' mm på ' + e.per + ' h', color: rpCol(e.y) })),
      hasEvents: ev.length > 0, noEvents: ev.length === 0,
      eventsTitle: ev.length ? ev.length + ' återkomstregn (≥ 2 år, Dahlström 2010) i perioden' : 'Inga återkomstregn (≥ 2 år) i perioden',
    });
  }
  // Weather radars that see NV Skåne (approx. positions). Rings: 120 km = good quantitative quality, 240 km = max range
  weatherRadars() {
    return [
      { name: 'Ängelholm', org: 'SMHI', lat: 56.367, lng: 12.852, color: '#35d6f2' },
      { name: 'Karlskrona', org: 'SMHI', lat: 56.296, lng: 15.610, color: '#35d6f2' },
      { name: 'Vara', org: 'SMHI', lat: 58.256, lng: 12.826, color: '#35d6f2' },
      { name: 'Stevns', org: 'DMI', lat: 55.326, lng: 12.449, color: '#ff8a4a' },
      { name: 'Bornholm', org: 'DMI', lat: 55.113, lng: 14.888, color: '#ff8a4a' },
      { name: 'Virring', org: 'DMI', lat: 56.024, lng: 10.025, color: '#ff8a4a' },
    ];
  }
  // ---- Compact radar list for the Väderradar widget (cached per radar frame) ----
  radarList() {
    const key = (this.radarStamp || 0) + ':' + (this.radarCal || 1);
    if (this._rlist && this._rlist.key === key) return this._rlist.v;
    const fs = this.radarFrames || [], last = fs.length ? fs[fs.length - 1] : null, cal = this.radarCal || 1;
    const km = (a, b, c, d) => this.kmDist(a, b, c, d);
    const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
    const munis = this.baseMunis();
    const rows = this.weatherRadars().map(r => {
      const nIn = munis.filter(m => km(r.lat, r.lng, m.lat, m.lng) <= 100).length;
      let mx = null;
      if (last) {
        mx = 0; let n = 0;
        for (let la = 55.25; la <= 56.85; la += 0.08) for (let ln = 11.3; ln <= 14.0; ln += 0.12) {
          if (km(r.lat, r.lng, la, ln) > 100) continue;
          const v = this.radarPx(last, la, ln); if (v == null) continue; n++; if (v * cal > mx) mx = v * cal;
        }
        if (!n) mx = null;
      }
      const wet = mx != null && mx >= 0.2;
      return { name: r.name, org: r.org, orgColor: r.color, near: nIn,
        nearTxt: nIn ? nIn + ' av 8 kommuner' : 'utanför 100 km',
        nowTxt: mx == null ? 'utanför bild' : wet ? 'max ' + f1(mx) + ' mm/h' : 'uppehåll',
        nowColor: mx == null ? '#577684' : wet ? ((this.intSteps().find(s => mx >= s.min) || {}).hex || '#4aacff') : '#2fe6c4',
        open: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ radarSel: r.name }); } };
    }).sort((a, b) => b.near - a.near);
    const ageMin = last ? Math.round((Date.now() - last.t) / 60000) : null;
    const v = { rows, feedTxt: last ? ('Radarbild ' + ageMin + ' min') : 'Ingen radarbild', feedColor: last ? (ageMin <= 15 ? '#2fe6c4' : '#ffb547') : '#7fa8b5' };
    this._rlist = { key, v };
    return v;
  }
  // ---- Detail view for one radar: facts, feed status, what it sees now, trend, and radar vs rain gauges ----
  radarDetail() {
    const name = this.state.radarSel; if (!name) return { open: false };
    const r = this.weatherRadars().find(x => x.name === name); if (!r) return { open: false };
    const f1 = v => v == null || isNaN(v) ? '–' : (Math.round(v * 10) / 10).toString().replace('.', ',');
    const km = (a, b, c, d) => this.kmDist(a, b, c, d);
    const fs = this.radarFrames || [];
    const cal = this.radarCal || 1;
    // kommuner within quantitative range
    const munis = this.baseMunis().map(m => ({ name: m.name, d: km(r.lat, r.lng, m.lat, m.lng) })).sort((a, b) => a.d - b.d);
    // 100 km = SMHI: "På större avstånd än 100 km från radarn passerar radarstrålen ovanför molnet eller snuddar bara toppen"
    const inBest = munis.filter(m => m.d <= 100), inMax = munis.filter(m => m.d > 100 && m.d <= 240);
    const samplePts = [];
    for (let la = 55.25; la <= 56.85; la += 0.05) for (let ln = 11.3; ln <= 14.0; ln += 0.08) if (km(r.lat, r.lng, la, ln) <= 100) samplePts.push([la, ln]);
    const stats = fr => { let mx = 0, wet = 0, n = 0, sum = 0; samplePts.forEach(([la, ln]) => { const v = this.radarPx(fr, la, ln); if (v == null) return; n++; const c = v * cal; sum += c; if (c > mx) mx = c; if (c >= 0.2) wet++; }); return { mx, area: n ? wet / n * 100 : 0, mean: n ? sum / n : 0, n }; };
    const last = fs.length ? fs[fs.length - 1] : null;
    const now = last ? stats(last) : null;
    const coverPct = samplePts.length ? Math.round((now ? now.n : 0) / samplePts.length * 100) : 0;
    const trendFrames = fs.filter(f => !last || f.t >= last.t - 3 * 3600000);
    const trend = trendFrames.map(f => { const s = stats(f); return { t: f.t, mx: s.mx, area: s.area }; });
    const tTop = Math.max(2, ...trend.map(t => t.mx));
    const ageMin = last ? Math.round((Date.now() - last.t) / 60000) : null;
    const gs = (this.rainHistStations || []).map(g => ({ g, d: km(r.lat, r.lng, g.lat, g.lng) })).filter(x => x.d <= 100).sort((a, b) => a.d - b.d);
    const rows = []; let sg = 0, sr = 0, sabs = 0, n = 0;
    gs.forEach(({ g, d }) => {
      const gv = this.gaugeVal(g, -1); const rv = this.radarAt(g.lat, g.lng, -1);
      if (gv == null && rv == null) return;
      const raw = rv != null ? rv / cal : null;
      if (gv != null && rv != null) { sg += gv; sr += rv; sabs += Math.abs(gv - rv); n++; }
      const diff = gv != null && rv != null ? rv - gv : null;
      rows.push({ name: g.name, src: g.src === 'FM' ? 'Försvarsmakten' : g.src, dist: Math.round(d) + ' km', gauge: f1(gv), raw: f1(raw), cal: f1(rv),
        diff: diff == null ? '–' : (diff > 0 ? '+' : '') + f1(diff), diffColor: diff == null ? '#7fa8b5' : Math.abs(diff) < 0.5 ? '#2fe6c4' : Math.abs(diff) < 2 ? '#ffb547' : '#ff6b6b' });
    });
    const ci = this.radarCalInfo || {};
    return {
      open: true, name: r.name, org: r.org === 'SMHI' ? 'SMHI · Sveriges meteorologiska och hydrologiska institut' : 'DMI · Danmarks Meteorologiske Institut', color: r.color,
      pos: r.lat.toFixed(3) + '° N · ' + r.lng.toFixed(3) + '° E',
      bestTxt: inBest.length ? inBest.map(m => m.name + ' ' + Math.round(m.d) + ' km').join(' · ') : 'Inga NSVA-kommuner inom 100 km',
      maxTxt: inMax.length ? inMax.map(m => m.name).join(' · ') : '–',
      nBest: inBest.length + ' av 8',
      feedTxt: last ? (ageMin <= 15 ? 'Aktuellt' : 'Fördröjt') : 'Ingen radardata', feedColor: last ? (ageMin <= 15 ? '#2fe6c4' : '#ffb547') : '#7fa8b5',
      ageTxt: last ? ('Senaste bild ' + new Date(last.t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) + ' · för ' + ageMin + ' min sedan') : 'Radarflödet nås inte',
      framesTxt: fs.length + ' bilder · ' + (fs.filter(f => f.archived).length) + ' från arkivet',
      nowMax: now ? f1(now.mx) : '–', nowArea: now ? Math.round(now.area) + '' : '–', nowMean: now ? f1(now.mean) : '–',
      coverTxt: coverPct >= 95 ? 'Hela 100-km-området ingår i beräkningen' : 'Beräkningen omfattar ' + coverPct + ' % av 100-km-området (den del som ligger över NV Skåne)',
      trend: trend.map(t => ({ h: Math.max(3, t.mx / tTop * 100), color: t.mx >= 0.2 ? (this.intSteps().find(s => t.mx >= s.min) || {}).hex : 'rgba(127,168,181,.3)', tip: new Date(t.t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) + ' · max ' + f1(t.mx) + ' mm/h · ' + Math.round(t.area) + ' % yta' })),
      hasTrend: trend.length > 1, trendTop: f1(tTop),
      rows, hasRows: rows.length > 0, noRows: rows.length === 0, noRowsTxt: gs.length ? 'Inga mätare inom 100 km har värde för senaste hela timmen.' : 'Inga regnmätare inom 100 km.',
      cmpGauge: n ? f1(sg / n) : '–', cmpRadar: n ? f1(sr / n) : '–', cmpMae: n ? f1(sabs / n) : '–', cmpN: n + '',
      calTxt: ci.n ? ('×' + f1(ci.factor) + ' från ' + ci.n + ' mätare') : 'Ingen kalibrering (färre än 3 mätare med värde)',
      close: () => this.setState({ radarSel: null }),
    };
  }
  // ---- Radar history: the open feed only keeps ~2 h, so every completed clock hour is saved locally
  // as a coarse rain grid (raw, uncalibrated mm/h). After the dashboard has run for 12 h, −12 h shows real radar.
  radarHistGrid() { return { la0: 55.4, la1: 56.72, dla: 0.06, ln0: 11.95, ln1: 14.2, dln: 0.1 }; }
  saveRadarHistory() {
    const fs = this.radarFrames; if (!fs || !fs.length || typeof localStorage === 'undefined') return;
    const G = this.radarHistGrid();
    let hist = {}; try { hist = JSON.parse(localStorage.getItem('nsva_radar_hist') || '{}'); } catch (e) {}
    const nowH = Math.floor(Date.now() / 3600000) * 3600000;
    for (let back = 1; back <= 3; back++) {
      const start = nowH - back * 3600000, end = start + 3600000;
      if (hist[start]) continue;
      const inH = fs.filter(f => f.t > start && f.t <= end); if (inH.length < 2) continue;
      const vals = [];
      for (let la = G.la0; la <= G.la1 + 1e-9; la += G.dla) for (let ln = G.ln0; ln <= G.ln1 + 1e-9; ln += G.dln) {
        let s = 0, c = 0; inH.forEach(f => { const v = this.radarPx(f, la, ln); if (v != null) { s += v; c++; } });
        vals.push(c ? Math.min(255, Math.round(s / c * 10)) : 0); // 0.1 mm/h steps
      }
      hist[start] = vals.join(',');
    }
    Object.keys(hist).forEach(k => { if (Number(k) < nowH - 13 * 3600000) delete hist[k]; });
    try { localStorage.setItem('nsva_radar_hist', JSON.stringify(hist)); } catch (e) {}
    this._radarHist = null; // re-parse lazily
  }
  radarHistAt(lat, lng, hour) {
    if (!this._radarHist) { let h = {}; try { h = JSON.parse(localStorage.getItem('nsva_radar_hist') || '{}'); } catch (e) {} const out = {}; Object.keys(h).forEach(k => { out[k] = h[k].split(',').map(Number); }); this._radarHist = out; }
    const start = Math.floor(Date.now() / 3600000) * 3600000 + hour * 3600000;
    const vals = this._radarHist[start]; if (!vals) return null;
    const G = this.radarHistGrid(), cols = Math.round((G.ln1 - G.ln0) / G.dln) + 1, rows = Math.round((G.la1 - G.la0) / G.dla) + 1;
    const fr = (lat - G.la0) / G.dla, fc = (lng - G.ln0) / G.dln;
    if (fr < 0 || fc < 0 || fr > rows - 1 || fc > cols - 1) return null;
    const r0 = Math.floor(fr), c0 = Math.floor(fc), r1 = Math.min(rows - 1, r0 + 1), c1 = Math.min(cols - 1, c0 + 1), tr = fr - r0, tc = fc - c0;
    const v = (r, c) => vals[r * cols + c] / 10;
    return (v(r0, c0) * (1 - tc) + v(r0, c1) * tc) * (1 - tr) + (v(r1, c0) * (1 - tc) + v(r1, c1) * tc) * tr;
  }
  radarHistHours() { this.radarHistAt(0, 0, -1); return Object.keys(this._radarHist || {}).length; }
  // Radar ↔ gauge calibration: same idea as the SMHI correction, over the last full hour, at gauge positions
  computeRadarCal() {
    const st = this.rainHistStations, fs = this.radarFrames;
    this.radarCalInfo = { factor: 1, n: 0, gaugeMean: null, radarMean: null };
    this.radarCal = 1;
    if (!st || !st.length || !fs || !fs.length) return;
    const saved = this.radarCal; this.radarCal = 1;
    let gs = 0, rs = 0, n = 0;
    st.forEach(s => { const g = this.gaugeVal(s, -1); const r = this.radarAt(s.lat, s.lng, -1); if (g != null && r != null) { gs += g; rs += r; n++; } });
    this.radarCal = saved;
    if (n >= 3) {
      const f = Math.max(0.33, Math.min(3, (gs / n + 0.3) / (rs / n + 0.3)));
      this.radarCal = f;
      this.radarCalInfo = { factor: f, n, gaugeMean: gs / n, radarMean: rs / n };
    }
  }
  rvTileUrl(base) { return base + '/256/{z}/{x}/{y}/4/1_1.png'; }
  startRadarAnim() {
    if (this.radarAnim || !this.rvFrames || !this.rvLayerHost) return;
    this.radarAnim = setInterval(() => {
      if (!this.rvFrames || !this.rvLayerHost || !this.map) return;
      this.rvIndex = (this.rvIndex + 1) % this.rvFrames.length;
      const lyr = window.L.tileLayer(this.rvTileUrl(this.rvFrames[this.rvIndex]), { opacity: 0, zIndex: 350, tileSize: 256, maxNativeZoom: 7, minNativeZoom: 0, crossOrigin: true });
      lyr.addTo(this.map);
      lyr.once('load', () => { lyr.setOpacity(0.7); if (this.rvLayer) { const old = this.rvLayer; setTimeout(() => this.map && this.map.removeLayer(old), 400); } this.rvLayer = lyr; });
      this.rvLayerHost = true;
    }, 900);
  }
  stopRadarAnim() { if (this.radarAnim) { clearInterval(this.radarAnim); this.radarAnim = null; } }

  componentDidUpdate(prevProps) {
    this.tryInitMap();
    this.initRadarMap();
    if (this.radarMap) this.drawRadarField();
    this.updateMarkers();
    this.applyMapFilters();
    if (!this.state.selected && this.detailMap) this.destroyDetailMap();
    this.updateDetailFacilities();
    if (this.map && this.connLayer && prevProps && prevProps.accent !== this.props.accent) {
      const ac = this.acHex();
      this.connLayer.eachLayer(l => l.setStyle && l.setStyle({ color: ac }));
    }
  }
  // ---- Background rain: cyan streaks behind the whole control centre, density/speed follow the rain right now ----
  startRainBg() {
    if (this._rainBgRaf || typeof window === 'undefined') return;
    const drops = [];
    let last = performance.now(), lastLvl = 0, lvlAt = 0;
    const tick = (now) => {
      this._rainBgRaf = requestAnimationFrame(tick);
      const cv = this._rainBgEl; if (!cv) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      // re-read the rain level every 5 s (cheap enough, avoids work every frame)
      if (now - lvlAt > 5000) { lvlAt = now; try { lastLvl = this.peakRainAt(0); } catch (e) { lastLvl = 0; } }
      const mm = lastLvl;
      const target = mm < 0.2 ? 0 : Math.round(Math.min(420, 60 + Math.log1p(mm) * 120)) * (W * H) / (1920 * 1080);
      const speed = 900 + Math.min(1, mm / 10) * 900;               // px/s
      const slant = (this.weather && this.weather.ws ? Math.min(0.35, this.weather.ws / 40) : 0.12); // wind lean
      while (drops.length < target) drops.push({ x: Math.random() * W * 1.2 - W * 0.1, y: Math.random() * -H, l: 10 + Math.random() * 18, v: 0.7 + Math.random() * 0.6, a: 0.18 + Math.random() * 0.32 });
      if (drops.length > target) drops.length = Math.max(0, Math.floor(target));
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!drops.length) return;
      ctx.lineCap = 'round';
      for (const d of drops) {
        d.y += speed * d.v * dt; d.x += speed * d.v * dt * slant;
        if (d.y > H + 30) { d.y = -30 - Math.random() * 120; d.x = Math.random() * W * 1.2 - W * 0.1; }
        ctx.strokeStyle = 'rgba(53,214,242,' + d.a.toFixed(2) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * slant, d.y - d.l); ctx.stroke();
      }
    };
    this._rainBgRaf = requestAnimationFrame(tick);
  }
  componentWillUnmount() {
    if (this._rainBgRaf) cancelAnimationFrame(this._rainBgRaf);
    if (this._conv) { try { this._conv.endSession(); } catch (e) {} this._conv = null; }
    clearInterval(this._ctxT);
    if (this._onFs) { document.removeEventListener('fullscreenchange', this._onFs); document.removeEventListener('webkitfullscreenchange', this._onFs); }
    if (this._onMMove) window.removeEventListener('mousemove', this._onMMove);
    if (this._onMUp) window.removeEventListener('mouseup', this._onMUp);
    if (this._scanT) clearTimeout(this._scanT);
    if (this._resT) clearTimeout(this._resT);
    if (this._bPoll) clearTimeout(this._bPoll);
    if (this._onPMove) window.removeEventListener('pointermove', this._onPMove);
    if (this._onPUp) window.removeEventListener('pointerup', this._onPUp);
    clearInterval(this.t1);
    clearInterval(this.t2);
    clearInterval(this.twx);
    clearInterval(this.trv);
    clearInterval(this.tsea);
    clearInterval(this.tadv);
    clearInterval(this.tdmi); clearTimeout(this._dmiRetry);
    this.stopRadarAnim();
    if (this.radarRainAnim) { clearInterval(this.radarRainAnim); this.radarRainAnim = null; }
    clearTimeout(this._mapPoll);
    clearTimeout(this._radarPoll);
    if (this.map) { this.map.remove(); this.map = null; }
    if (this.radarMap) { this.radarMap.remove(); this.radarMap = null; }
    this.destroyDetailMap();
    window.removeEventListener('resize', this.onResize);
  }

  // smooth, deterministic wobble for live readouts
  j(base, amp, seed) {
    return base + Math.sin((this.state.tick + (seed || 0)) * 0.7) * amp;
  }
  fmt(n) {
    return Math.round(n).toLocaleString('sv-SE');
  }
  colorFor(level) {
    if (level < 35) return '#ff5a6e';
    if (level < 55) return '#ffb547';
    return '#2fe6c4';
  }

  // ---- static model ----
  baseMunis() {
    return [
      { id: 'helsingborg', name: 'Helsingborg', lat: 56.0465, lng: 12.6945, prod: 3200, res: [81, 76] },
      { id: 'landskrona', name: 'Landskrona', lat: 55.8708, lng: 12.8300, prod: 1450, res: [72, 69] },
      { id: 'bastad', name: 'Båstad', lat: 56.4258, lng: 12.8517, prod: 540, res: [64, 58] },
      { id: 'bjuv', name: 'Bjuv', lat: 56.0833, lng: 12.9167, prod: 470, res: [60, 55], lp: 'down' },
      { id: 'astorp', name: 'Åstorp', lat: 56.1333, lng: 12.9500, prod: 610, res: [84, 80], lp: 'up' },
      { id: 'svalov', name: 'Svalöv', lat: 55.9131, lng: 13.1100, prod: 380, res: [47, 43] },
      { id: 'orkelljunga', name: 'Örkelljunga', lat: 56.2833, lng: 13.2833, prod: 290, res: [38, 28] },
      { id: 'perstorp', name: 'Perstorp', lat: 56.1350, lng: 13.3900, prod: 240, res: [54, 50] },
    ];
  }
  edgePairs() {
    return [['helsingborg','bjuv'],['helsingborg','landskrona'],['bjuv','astorp'],['bjuv','svalov'],['astorp','orkelljunga'],['orkelljunga','perstorp'],['orkelljunga','bastad'],['svalov','landskrona'],['astorp','perstorp']];
  }
  baseGhosts() {
    return [['Ängelholm',56.2428,12.8622],['Höganäs',56.2003,12.5556],['Klippan',56.1383,13.1314],['Eslöv',55.8392,13.3036],['Kävlinge',55.7958,13.1117],['Hörby',55.8500,13.6603]];
  }

  // ---- accent ----
  acHex() { return ({ Cyan:'#35d6f2', Teal:'#2dd4bf', 'Blå':'#4aa8ff' })[this.props.accent] || '#35d6f2'; }
  acGlow() { return ({ Cyan:'53,214,242', Teal:'45,212,191', 'Blå':'74,168,255' })[this.props.accent] || '53,214,242'; }

  // ---- Leaflet map ----
  muniHtml(m, i) {
    const lvl = Math.min(this.j(m.res[0], 1.2, i), this.j(m.res[1], 1.2, i + 9));
    const c = this.colorFor(lvl);
    const g = this.acGlow();
    const lp = m.lp || 'down';
    const labelT = lp === 'up' ? 'translate(-50%,calc(-100% - 15px))'
      : lp === 'left' ? 'translate(calc(-100% - 15px),-50%)'
      : lp === 'right' ? 'translate(15px,-50%)'
      : 'translate(-50%,15px)';
    return '' +
      '<div class="nsva-mk" style="position:relative">' +
        '<span class="nsva-ring" style="position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1px solid '+c+';opacity:.4;animation:ringPulse 2.8s ease-out infinite"></span>' +
        '<span class="nsva-dot" style="position:absolute;left:0;top:0;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;border-radius:50%;background:'+c+';box-shadow:0 0 16px '+c+';animation:nodePulse 2.6s infinite"></span>' +
        '<span style="position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%"></span>' +
        '<div class="nsva-lbl" style="position:absolute;left:0;top:0;--lt:'+labelT.replace('translate(','').replace(/\)$/,'')+';transform:'+labelT+';padding:5px 11px;border-radius:9px;background:rgba(5,16,24,.92);border:1px solid rgba('+g+',.5);backdrop-filter:blur(6px);text-align:center;white-space:nowrap;box-shadow:0 5px 16px rgba(0,0,0,.55);z-index:10">' +
          '<div style="font-size:13px;font-weight:600;letter-spacing:.03em;color:#e3f4fa">'+m.name+'</div>' +
          '<div class="nsva-data" style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:2px">' +
            '<span class="nsva-lvl" style="font-family:JetBrains Mono,monospace;font-size:11px;color:'+c+'">'+Math.round(lvl)+'%</span>' +
            '<span style="font-size:10px;color:#4b6c78">·</span>' +
            '<span class="nsva-prod" style="font-family:JetBrains Mono,monospace;font-size:11px;color:#7fa8b5">'+this.fmt(this.j(m.prod,m.prod*0.02,i))+' m³/h</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  ghostHtml(name) {
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;opacity:.9">' +
      '<div style="width:7px;height:7px;border-radius:50%;border:1px solid #4a6470;background:rgba(40,60,68,.5)"></div>' +
      '<div style="font-size:11px;color:#5c7884;letter-spacing:.04em;text-shadow:0 1px 6px #000">'+name+'</div></div>';
  }
  tryInitMap() {
    if (this.map || !this.mapEl) return;
    if (typeof window === 'undefined' || !window.L) { this._mapPoll = setTimeout(() => this.tryInitMap(), 120); return; }
    const L = window.L;
    const munis = this.baseMunis();
    const byId = {}; munis.forEach(m => { byId[m.id] = m; });
    const map = L.map(this.mapEl, {
      zoomControl: false, attributionControl: true,
      dragging: true, scrollWheelZoom: true, doubleClickZoom: true, touchZoom: true,
      boxZoom: false, keyboard: false, tap: false, zoomSnap: 0.5, zoomDelta: 1, wheelPxPerZoomLevel: 70, wheelDebounceTime: 20, minZoom: 6, maxZoom: 14,
      zoomAnimation: true, fadeAnimation: true, markerZoomAnimation: true, bounceAtZoomLimits: false, inertia: true,
    });
    this.map = map;
    L.control.zoom({ position: 'topright', zoomInTitle: 'Zooma in', zoomOutTitle: 'Zooma ut' }).addTo(map);
    // "hela området" button under the zoom control
    const Home = L.Control.extend({ options: { position: 'topright' }, onAdd: () => {
      const b = L.DomUtil.create('a', 'leaflet-bar nsva-home'); b.href = '#'; b.title = 'Visa hela området'; b.innerHTML = '⌂';
      b.style.cssText = 'display:block;width:30px;height:30px;line-height:30px;text-align:center;font-size:16px;background:rgba(6,18,26,.9);color:#cfeaf2;border:1px solid rgba(53,214,242,.35);border-radius:8px;margin-top:6px;text-decoration:none';
      L.DomEvent.on(b, 'click', e => { L.DomEvent.stop(e); this.agentToolsRaw().zoomMap({ riktning: 'hela' }); });
      return b; } });
    map.addControl(new Home());
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16, maxNativeZoom: 16, attribution: '© Esri · © OpenStreetMap',
    }).addTo(map);
    // extra bottom padding keeps Landskrona clear of the skyfall scrubber; top/sides slightly wider for a calmer frame
    map.fitBounds(munis.map(m => [m.lat, m.lng]), { paddingTopLeft: [110, 100], paddingBottomRight: [110, 190] });
    this.loadBoundaries(L, map);
    // connection lines
    this.connLayer = L.layerGroup().addTo(map);
    const ac = this.acHex();
    this.edgePairs().forEach(([a, b]) => {
      L.polyline([[byId[a].lat, byId[a].lng], [byId[b].lat, byId[b].lng]], { color: ac, weight: 1.3, opacity: 0.45, dashArray: '5 7' }).addTo(this.connLayer);
    });
    // ghost (non-active) municipalities
    this.baseGhosts().forEach(([name, lat, lng]) => {
      L.marker([lat, lng], { icon: L.divIcon({ className: '', html: this.ghostHtml(name), iconSize: [110, 30], iconAnchor: [55, 6] }), interactive: false, keyboard: false }).addTo(map);
    });
    // active municipalities
    this.markers = {};
    munis.forEach((m, i) => {
      const marker = L.marker([m.lat, m.lng], { icon: L.divIcon({ className: '', html: this.muniHtml(m, i), iconSize: [0, 0], iconAnchor: [0, 0] }), riseOnHover: true });
      marker.on('click', () => this.selectMuni(m.id));
      marker.addTo(map);
      this.markers[m.id] = marker;
    });
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 250);
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 800);
    this.applyMapFilters();
  }
  // Real municipality borders for the 8 NSVA kommuner — pre-clipped to the coastline (no sea overshoot), embedded via kommuner.js.
  loadBoundaries(L, map) {
    try {
      const fc = (typeof window !== 'undefined') ? window.NSVA_KOMMUNER : null;
      if (!fc || !fc.features) {
        // kommuner.js not evaluated yet — retry shortly so borders survive any load-order race
        if ((this._bTries = (this._bTries || 0) + 1) <= 60) {
          clearTimeout(this._bPoll);
          this._bPoll = setTimeout(() => { if (this.map && window.L) this.loadBoundaries(window.L, this.map); }, 150);
        }
        return;
      }
      if (!this.map) return;
      if (this.boundaryLayer) { this.map.removeLayer(this.boundaryLayer); this.boundaryLayer = null; }
      const ac = this.acHex();
      const nameToId = {};
      this.baseMunis().forEach(m => { nameToId[m.name.toLowerCase()] = m.id; });
      const base = { color: ac, weight: 1.5, opacity: 0.6, fillColor: '#2f6173', fillOpacity: 0.3, lineJoin: 'round' };
      const hover = { color: ac, weight: 2.6, opacity: 1, fillColor: ac, fillOpacity: 0.42, lineJoin: 'round' };
      this.boundaryLayer = L.geoJSON(fc, {
        interactive: true,
        style: function () { return base; },
        onEachFeature: (feat, layer) => {
          const nm = ((feat.properties && feat.properties.kom_namn) || '').toLowerCase();
          const id = nameToId[nm];
          if (layer._path) layer._path.style.cursor = 'pointer';
          layer.on('mouseover', () => {
            // clear any previously hovered polygon first — mouseout can be missed when moving fast between kommuner
            if (this._hoverLayer && this._hoverLayer !== layer) { try { this._hoverLayer.setStyle(base); } catch (e) {} }
            this._hoverLayer = layer;
            layer.setStyle(hover);
            if (layer.bringToFront) layer.bringToFront();
          });
          layer.on('mouseout', () => { layer.setStyle(base); if (this._hoverLayer === layer) this._hoverLayer = null; });
          layer.on('click', () => { if (id) this.selectMuni(id); });
        },
      }).addTo(map);
      if (this.boundaryLayer.bringToBack) this.boundaryLayer.bringToBack();
      // safety net: leaving the map (or any pointer stop) clears a stuck highlight
      if (!this._hoverGuard) {
        this._hoverGuard = true;
        const clear = () => { if (this._hoverLayer) { try { this._hoverLayer.setStyle(base); } catch (e) {} this._hoverLayer = null; } };
        map.on('mouseout', clear);
        map.on('movestart', clear);
        map.on('zoomstart', clear);
        if (this.mapEl) this.mapEl.addEventListener('mouseleave', clear);
      }
    } catch (e) { /* map still works without borders */ }
  }
  // ---- ONE shared precipitation intensity scale, used by radar scope, map echoes and every legend ----
  // Per-widget data provenance badge: LIVE (measured), EST (derived from live weather) or SIM (simulated)
  srcBadges() {
    const live = { txt: 'LIVE', color: '#2fe6c4' };
    const est = { txt: 'EST', color: '#ffb547' };
    const sim = { txt: 'SIM', color: '#7fa8b5' };
    const wx = !!this.weather;
    const sea = this.seaLevel();
    const seaB = sea.source === 'SMHI' ? live : (sea.source === 'SMHI-est.' ? est : sim);
    return {
      flode: (this.flowLive && this.flowLive.length) ? live : sim,
      dricks: sim, spill: sim, alarm: sim,
      anmal: this.reports ? live : sim,
      matare: (this.rainHistStations && this.rainHistStations.length) ? live : sim,
      dag: wx ? est : sim,
      hav: seaB,
      radar: wx ? live : sim,
      prognos: wx ? live : sim,
      ai: wx ? live : sim,
    };
  }
  rainRgb(mm) {
    if (mm >= 15) return '255,90,110';   // extremt / skyfall
    if (mm >= 8) return '255,138,74';    // kraftigt
    if (mm >= 3) return '255,181,71';    // måttligt
    if (mm >= 1) return '53,214,242';    // lätt
    return '74,172,255';                 // svagt
  }
  rainHex(mm) { return 'rgb(' + this.rainRgb(mm) + ')'; }
  // Radar-echo marker: soft layered cell (same language as the live radar), no cartoon droplets
  echoHtml(mm, px, field, rgbOverride) {
    const c = rgbOverride || this.rainRgb(mm);
    const label = (Math.round(mm * 10) / 10).toString().replace('.', ',');
    const k = field ? 2.4 : 1; // field cells: stronger outer halo so adjacent cells fuse into one cloud mass
    const ring = (size, op, blur) => '<div style="position:absolute;left:50%;top:50%;width:' + Math.round(px * size) + 'px;height:' + Math.round(px * size * 0.86) + 'px;margin:' + Math.round(-px * size * 0.43) + 'px 0 0 ' + Math.round(-px * size / 2) + 'px;border-radius:50%;background:rgba(' + c + ',' + Math.min(0.7, op * k) + ');filter:blur(' + (field ? blur * 1.6 : blur) + 'px)"></div>';
    // falling rain streaks under the cell — count and speed scale with intensity
    const n = mm >= 15 ? 7 : mm >= 8 ? 6 : mm >= 3 ? 5 : 4;
    const speed = mm >= 15 ? 0.55 : mm >= 8 ? 0.7 : mm >= 3 ? 0.9 : 1.15;
    const len = Math.round(px * (mm >= 8 ? 0.3 : 0.24));
    let streaks = '';
    for (let i = 0; i < n; i++) {
      const fx = 22 + (i * (56 / (n - 1)));
      streaks += '<div style="position:absolute;left:' + fx.toFixed(1) + '%;top:' + Math.round(px * 0.52) + 'px;width:2px;height:' + len + 'px;border-radius:2px;background:linear-gradient(180deg, rgba(' + c + ',.95), rgba(' + c + ',0));box-shadow:0 0 5px rgba(' + c + ',.7);animation:nsvaRainFall ' + speed.toFixed(2) + 's linear infinite ' + (i * (speed / n)).toFixed(2) + 's"></div>';
    }
    return '<div style="position:relative;width:' + px + 'px;height:' + Math.round(px * 0.9) + 'px;transform:translate(-50%,-42%);pointer-events:none">' +
      ring(1, 0.16, 7) + ring(0.74, 0.3, 5) + ring(0.5, 0.46, 3.5) + ring(0.28, 0.62, 2) +
      streaks +
    '</div>';
  }
  // mm/h read-out for an echo — drawn as its own top-most marker, lifted above the kommun label box
  echoLabelHtml(mm, px, idx) {
    const c = this.rainRgb(mm);
    const label = (Math.round(mm * 10) / 10).toString().replace('.', ',') + ' mm/h';
    // sit clear above the echo; alternate side per cell so neighbouring read-outs never collide
    const lift = Math.round(px * 0.5) + 14;
    const side = (idx % 2 === 0) ? -1 : 1;
    const dx = 0; void side;
    return '<div style="transform:translate(-50%,-50%);pointer-events:none;display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:20px;background:rgba(3,10,15,.82);border:1px solid rgba(' + c + ',.5);box-shadow:0 2px 10px rgba(0,0,0,.5);white-space:nowrap">' +
      '<span style="width:6px;height:6px;border-radius:50%;background:rgb(' + c + ');box-shadow:0 0 7px rgb(' + c + ')"></span>' +
      '<span style="font-family:JetBrains Mono,monospace;font-size:11.5px;font-weight:700;letter-spacing:.02em;color:#eaf7fb">' + label + '</span>' +
    '</div>';
  }
  applyMapFilters() {
    if (!this.map || typeof window === 'undefined' || !window.L) return;
    const L = window.L;
    const f = this.state.filters;
    const byId = {}; this.baseMunis().forEach(m => { byId[m.id] = m; });
    // --- skyfall: scan (3s), then hour 0 = live RainViewer radar; hour>0 = SMHI forecast blobs (scrubber) ---
    const skyOn = f.skyfall && !this.state.skyfallScan;
    const hour = this.state.skyfallHour || 0;
    const skyMode = this.state.skyfallMode || 'int'; // 'int' = V2 (standard): SMHI intensitet + violett återkomsttid · 'rp' = V1
    // include data stamps so a new radar frame / SMHI run / gauge update redraws the field without reloading
    const skyKey = hour + ':' + skyMode + ':' + (this.radarStamp || 0) + ':' + ((this.weather && this.weather.updated) || '') + ':' + (this._rainStamp || 0);
    if (skyOn && (!this.skyfallLayer || this._skyHour !== skyKey)) {
      this._skyHour = skyKey;
      this.stopRadarAnim();
      if (this.rvLayer) { this.map.removeLayer(this.rvLayer); this.rvLayer = null; }
      this.rvLayerHost = false;
      if (this.skyfallLayer) { this.map.removeLayer(this.skyfallLayer); }
      this.skyfallLayer = L.layerGroup().addTo(this.map);
      {
        try {
          // 1. rain field over the WHOLE map (grid: neighbouring kommuner + Danish side) — echoes tile into a continuous field
          const grid = (this.weather && this.wxGrid && this.wxGrid.length) ? this.wxGrid : this.rainGridPoints().map(g => ({ lat: g.lat, lng: g.lng, sim: true }));
          // grid spacing in screen px: use the LONGER (lng) step so cells always overlap; ≥2× spacing → neighbours merge into one field
          // The field is drawn ONCE over a fixed geographic extent at a fixed reference zoom, independent of the viewport,
          // so zoom & pan never trigger a re-render (Leaflet just scales the image). Re-rendered only when data/hour change.
          const FX = { s: 55.15, n: 56.95, w: 11.15, e: 14.55, z: 9 };
          const fOrigin = this.map.project([FX.n, FX.w], FX.z);
          const fProj = (lat, lng) => { const p = this.map.project([lat, lng], FX.z); return { x: p.x - fOrigin.x, y: p.y - fOrigin.y }; };
          const pA = fProj(56.1, 12.5), pB = fProj(56.1, 12.82);
          const cellPx = Math.max(60, Math.abs(pB.x - pA.x));
          // wet cells: återkomsttid is derived automatically over all SMHI durations; `amt` is a 1h-equivalent mm used for colouring
          const period = 1;
          const wet = [];
          // FORWARD in live mode: sample the blended field (moved radar + smoothly interpolated, gauge-corrected
          // SMHI forecast) on the same fine raster as the past, so +1…+12 h is drawn like a radar image, not as discs.
          const liveFwd = !!(this.weather && ((this.wxGrid && this.wxGrid.length) || (this.dmiModel && this.dmiModel.ok)) && hour > 0);
          if (liveFwd) {
            // whole visible map: NV Skåne, grannkommuner, Öresund and Själland (was clipped to NSVA's area before)
            for (let la = 55.2; la <= 56.85; la += 0.05) for (let ln = 11.2; ln <= 14.45; ln += 0.08) {
              const p = this.bestPrecipAt(la, ln, hour);
              if (p < (skyMode === 'int' ? 0.2 : 0.5)) continue;
              const a = this.rpAuto(h => this.bestPrecipAt(la, ln, h), hour);
              if (skyMode === 'int' || p >= 1 || a.lvl >= 4) wet.push({ lat: la, lng: ln, p, amt: Math.max(p, a.eff), auto: a, fine: true });
            }
          }
          if (!liveFwd) grid.forEach(g => {
            const sampler = this.gridSampler(g);
            const a = this.rpAuto(sampler, hour);
            if ((skyMode === 'int' ? a.amt1 >= 0.2 : a.amt1 >= 1) || a.lvl >= 4) wet.push({ lat: g.lat, lng: g.lng, p: a.amt1, amt: a.eff, auto: a });
          });
          // radar detail: the SMHI grid is ~20 km wide, so a shower between two grid points would vanish.
          // Where the radar sees rain (−12 … now), add fine cells (~7 km) so the field follows the real shower.
          if (this.weather && this.radarFrames && this.radarFrames.length && hour >= -12 && hour <= 0) {
            for (let la = 55.2; la <= 56.85; la += 0.06) for (let ln = 11.2; ln <= 14.45; ln += 0.1) {
              const rv = this.radarAt(la, ln, hour);
              if (rv == null || rv < 0.3) continue;
              const a = this.rpAuto(h => this.bestPrecipAt(la, ln, h), hour);
              if (a.amt1 >= 0.2) wet.push({ lat: la, lng: ln, p: a.amt1, amt: a.eff, auto: a, fine: true });
            }
          }
          // cluster adjacent wet cells → ONE cloud per contiguous rain area
          const parent = wet.map((_, i) => i);
          const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
          for (let i = 0; i < wet.length; i++) for (let j = i + 1; j < wet.length; j++) {
            if (Math.abs(wet[i].lat - wet[j].lat) <= 0.24 && Math.abs(wet[i].lng - wet[j].lng) <= 0.34) parent[find(i)] = find(j);
          }
          const clusters = {};
          wet.forEach((c, i) => { const r = find(i); (clusters[r] = clusters[r] || []).push(c); });
          // ONE canvas field for all wet cells: each cell paints a soft spot of radius ≈ grid spacing at its true
          // position, so the field covers exactly the wet footprint (no discs, no flooding, continuous where cells touch)
          {
            const fEnd = fProj(FX.s, FX.e); const size = { x: Math.round(fEnd.x), y: Math.round(fEnd.y) };
            const cv = document.createElement('canvas'); cv.width = size.x; cv.height = size.y;
            const ctx = cv.getContext('2d');
            const r = Math.min(cellPx * 0.85, Math.min(size.x, size.y) * 0.25);
            // pass 1: additive scalar field (mm) — each cell adds a soft spot weighted by its amount
            const amtMax = skyMode === 'int' ? Math.max(0.5, ...wet.map(c => c.p)) : Math.max(1, ...wet.map(c => c.amt));
            const rpMax = Math.max(1, ...wet.map(c => c.amt)); // V1 återkomsttid scalar, also used in V2
            const off = document.createElement('canvas'); off.width = size.x; off.height = size.y;
            const octx = off.getContext('2d'); octx.globalCompositeOperation = 'lighter';
            wet.forEach(c => {
              const pt = fProj(c.lat, c.lng);
              // TV: logarithmic weighting so light rain stays visible next to two intense cores
              const w = this.state.tv && skyMode === 'int' ? Math.min(1, Math.log1p(c.p) / Math.log1p(amtMax)) : Math.min(1, (skyMode === 'int' ? c.p : c.amt) / amtMax);
              const rr = c.fine ? Math.max(14, r * 0.42) : r;
              const g = octx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rr);
              g.addColorStop(0, 'rgba(255,255,255,' + w.toFixed(3) + ')');
              g.addColorStop(0.5, 'rgba(255,255,255,' + (w * 0.45).toFixed(3) + ')');
              g.addColorStop(1, 'rgba(255,255,255,0)');
              octx.fillStyle = g; octx.fillRect(pt.x - rr, pt.y - rr, rr * 2, rr * 2);
            });
            // separate field for återkomsttid: only cells whose OWN accumulated depth reached ≥ 2-års-nivån
            const rareCv = document.createElement('canvas'); rareCv.width = size.x; rareCv.height = size.y;
            const rctx = rareCv.getContext('2d');
            wet.forEach(c => {
              const lv = c.auto ? c.auto.lvl : 0; if (lv < 4) return;
              const pt = fProj(c.lat, c.lng);
              const rr = (c.fine ? Math.max(14, r * 0.42) : r) * 0.7;
              const a = ((lv - 3) / 3).toFixed(3); // 4→.33 · 5→.67 · 6→1
              const g = rctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rr);
              g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(0.6, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
              rctx.fillStyle = g; rctx.fillRect(pt.x - rr, pt.y - rr, rr * 2, rr * 2);
            });
            const rsrc = rctx.getImageData(0, 0, size.x, size.y).data;
            // pass 2: colourise per pixel — colour from local amount's återkomsttid class, alpha ramps with amount
            const src = octx.getImageData(0, 0, size.x, size.y).data;
            const out = ctx.createImageData(size.x, size.y); const od = out.data;
            const intPal = {};
            const palette = {}; const pal = lvl => palette[lvl] || (palette[lvl] = this.rpClass(lvl >= 6 ? 999 : lvl === 5 ? this.rpThresholds(period)[1] : lvl === 4 ? this.rpThresholds(period)[0] : lvl === 3 ? 5 : lvl === 2 ? 3 : 1, period).rgb.split(',').map(Number));
            for (let i = 0; i < src.length; i += 4) {
              const wgt = Math.min(1.2, src[i + 3] / 255);
              if (wgt < 0.08) continue;
              const localAmt = this.state.tv && skyMode === 'int' ? Math.min(amtMax, Math.expm1(Math.min(1, wgt) * Math.log1p(amtMax))) : Math.min(amtMax, wgt * amtMax);
              let rgb;
              let rare = false;
              if (skyMode === 'int') {
                // V2: same återkomsttid function as V1 — where the summed rain reaches ≥ 2-års-nivån, paint V1's violet
                const ra = rsrc[i + 3] / 255;
                const rl = ra >= 0.85 ? 6 : ra >= 0.5 ? 5 : ra >= 0.2 ? 4 : 0;
                if (rl >= 4 && !this.state.tv) { rgb = pal(rl); rare = true; } // TV: plain intensity only, no violet återkomsttid
                else { const k = this.intRgb(localAmt); rgb = intPal[k] || (intPal[k] = k.split(',').map(Number)); }
              }
              else {
                // V1: below 2 år the turquoise steps follow the local amount; violet only where a cell itself reached it
                const ra = rsrc[i + 3] / 255;
                const rl = ra >= 0.85 ? 6 : ra >= 0.5 ? 5 : ra >= 0.2 ? 4 : 0;
                rgb = pal(rl || Math.min(3, this.rpClass(localAmt, period).lvl));
              }
              od[i] = rgb[0]; od[i + 1] = rgb[1]; od[i + 2] = rgb[2];
              od[i + 3] = Math.round(255 * (skyMode === 'int' ? Math.min(rare ? 0.84 : 0.78, 0.3 + (wgt - 0.08) * 0.6) : Math.min(0.66, 0.14 + (wgt - 0.08) * 0.62)));
            }
            ctx.putImageData(out, 0, 0);
            try {
              const arr = [[FX.s, FX.w], [FX.n, FX.e]];
              L.imageOverlay(cv.toDataURL('image/png'), arr, { opacity: 1, interactive: false, zIndex: 340, className: 'nsva-rainfield' }).addTo(this.skyfallLayer);
            } catch (fe) { /* field render failed — chips below still draw */ }
          }
          // chip collision helper: kommun label boxes in container coords
          const mapRect = this.mapEl ? this.mapEl.getBoundingClientRect() : { left: 0, top: 0 };
          const kBoxes = [];
          Object.keys(this.markers || {}).forEach(id => { const el = this.markers[id] && this.markers[id].getElement && this.markers[id].getElement(); if (!el) return; const rc = el.getBoundingClientRect(); if (rc.width) kBoxes.push({ l: rc.left - mapRect.left, t: rc.top - mapRect.top, r: rc.right - mapRect.left, b: rc.bottom - mapRect.top }); });
          const CHIP_W = 150, CHIP_H = 44;
          Object.keys(clusters).forEach(k => {
            const cells = clusters[k];
            // 2. ONE read-out per cloud: summed mm over the period + återkomsttid, at the rain-weighted centre
            let wsum = 0, lat = 0, lng = 0, best = null;
            const consider = a => { if (!best || a.lvl > best.lvl || (a.lvl === best.lvl && ((a.years || 0) > (best.years || 0) || (!a.years && a.amt > best.amt)))) best = a; };
            cells.forEach(c => { wsum += c.amt; lat += c.lat * c.amt; lng += c.lng * c.amt; consider(c.auto); });
            Object.keys(byId).forEach(id => {
              const m = byId[id];
              const inside = cells.some(c => Math.abs(c.lat - m.lat) <= 0.13 && Math.abs(c.lng - m.lng) <= 0.18);
              if (!inside) return;
              consider(this.rpAuto(h => (this.weather ? this.fcPrecip(id, h) : this.simRainAt(m.lat, m.lng, h)), hour));
            });
            const amax = best.amt, chipPeriod = best.period;
            // nudge the chip upward until it no longer intersects any kommun label box
            let cp = this.map.latLngToContainerPoint([lat / wsum, lng / wsum]);
            for (let tries = 0; tries < 6; tries++) {
              const cl = cp.x - CHIP_W / 2, ct = cp.y - CHIP_H / 2, cr = cp.x + CHIP_W / 2, cb = cp.y + CHIP_H / 2;
              const hit = kBoxes.find(bx => cl < bx.r && bx.l < cr && ct < bx.b && bx.t < cb);
              if (!hit) break;
              cp = L.point(cp.x, hit.t - CHIP_H / 2 - 8);
            }
            void cp; void amax; void chipPeriod;
            // Intensity mode shows mm/h colours, so återkomsttid is carried by a violet outline around the rare-rain area
            if (false && skyMode === 'int' && best && best.lvl >= 4) { // replaced by violet fill (V1 återkomsttid) in V2
              let la = Infinity, lb = -Infinity, ga = Infinity, gb = -Infinity;
              cells.filter(c => c.auto.lvl >= 4).forEach(c => { la = Math.min(la, c.lat); lb = Math.max(lb, c.lat); ga = Math.min(ga, c.lng); gb = Math.max(gb, c.lng); });
              if (la !== Infinity) {
                const q1 = this.map.latLngToContainerPoint([lb + 0.12, ga - 0.17]), q2 = this.map.latLngToContainerPoint([la - 0.12, gb + 0.17]);
                const rw = Math.round(Math.abs(q2.x - q1.x)), rh = Math.round(Math.abs(q2.y - q1.y));
                const hex = best.cls.hex;
                const ring = '<div style="position:relative;width:' + rw + 'px;height:' + rh + 'px;transform:translate(-50%,-50%);pointer-events:none">' +
                  '<div style="position:absolute;inset:0;border-radius:50%;border:2px dashed ' + hex + ';box-shadow:0 0 18px ' + hex + ',inset 0 0 18px rgba(150,40,230,.25);animation:orbPulse 2.6s ease-in-out infinite"></div>' +
                  '<div style="position:absolute;left:50%;top:-14px;transform:translate(-50%,-100%);padding:3px 9px;border-radius:9px;background:rgba(3,10,15,.88);border:1px solid ' + hex + ';font-family:JetBrains Mono,monospace;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:' + hex + ';white-space:nowrap">Återkomsttid ' + best.cls.label + '</div>' +
                '</div>';
                L.marker([(la + lb) / 2, (ga + gb) / 2], { interactive: false, keyboard: false, zIndexOffset: 800, icon: L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0], html: ring }) }).addTo(this.skyfallLayer);
              }
            }
          });
        } catch (err) { /* draw skipped */ }
      }
    } else if (!f.skyfall && this.skyfallLayer) {
      this.stopRadarAnim();
      if (this.rvLayer) { this.map.removeLayer(this.rvLayer); this.rvLayer = null; }
      this.rvLayerHost = false;
      this.map.removeLayer(this.skyfallLayer); this.skyfallLayer = null;
      this._skyHour = undefined;
    }
    // --- anmälningar: density heat under status-coloured points; re-drawn when scope/data/view changes ---
    const anKey = f.anmal ? (this.state.anmalScope + ':' + this.baseReports().length + ':' + (this.map.getZoom())) : null;
    if (f.anmal && (!this.anmalLayer || this._anKey !== anKey)) {
      this._anKey = anKey;
      if (this.anmalLayer) this.map.removeLayer(this.anmalLayer);
      this.anmalLayer = L.layerGroup().addTo(this.map);
      try {
        const all = this.baseReports().filter(r => this.state.anmalScope === 'all' || r.status !== 'closed');
        // points: matte black dots with a thin light rim so they read on the dark map; size by severity, closed = smaller + faded
        all.forEach(rep => {
          const st = this.reportStatus(rep.status);
          const closed = rep.status === 'closed';
          const d = closed ? 7 : 8 + rep.severity * 2;
          const html = '<div style="width:' + d + 'px;height:' + d + 'px;transform:translate(-50%,-50%);border-radius:50%;background:#050b10;opacity:' + (closed ? '.5' : '1') + ';border:1.5px solid rgba(190,230,245,' + (closed ? '.35' : '.85') + ');box-shadow:0 1px 4px rgba(0,0,0,.7)"></div>';
          const mk = L.marker([rep.lat, rep.lng], { interactive: true, keyboard: false, zIndexOffset: 700, icon: L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0], html }) }).addTo(this.anmalLayer);
          mk.bindTooltip('<div style="font-family:Chakra Petch,sans-serif;font-size:11px;line-height:1.35"><b style="color:' + st.color + '">' + st.txt + '</b> · ' + this.reportCatLabel(rep.category) + ' · ' + this.muniName(rep.kommun) + '<br><b>' + rep.address + '</b><br><span style="color:#9bc3d0">' + rep.description + '</span></div>', { direction: 'top', offset: [0, -8], opacity: 0.96, className: 'nsva-tip' });
          mk.on('click', () => this.selectMuni(rep.kommun));
        });
        if (!this._anmalZoomHook) {
          this._anmalZoomHook = true;
          this.map.on('zoomend moveend', () => { clearTimeout(this._anT); this._anT = setTimeout(() => { if (this.state.filters.anmal) { this._anKey = null; this.applyMapFilters(); } }, 450); });
        }
      } catch (e) { /* layer skipped */ }
    } else if (!f.anmal && this.anmalLayer) { this.map.removeLayer(this.anmalLayer); this.anmalLayer = null; this._anKey = null; }
    // --- regnmätare: every open gauge (SMHI / Försvarsmakten / DMI) with value at the scrubbed hour ---
    const gHour = Math.min(0, this.state.skyfallHour || 0);
    const gKey = f.regn ? ((this.rainHistStations || []).length + ':' + gHour + ':' + (this._rainStamp || 0)) : null;
    if (f.regn && (!this.gaugeLayer || this._gKey !== gKey)) {
      this._gKey = gKey;
      if (this.gaugeLayer) this.map.removeLayer(this.gaugeLayer);
      this.gaugeLayer = L.layerGroup().addTo(this.map);
      try {
        const list = (this.rainHistStations && this.rainHistStations.length) ? this.rainHistStations
          : this.rainStations().map(s => Object.assign({ src: 'SIM', vals: [] }, s));
        const srcName = { SMHI: 'SMHI', FM: 'Försvarsmakten', DMI: 'DMI', SIM: 'Simulerad' };
        list.forEach(g => {
          const gv = g.src === 'SIM' ? null : this.gaugeVal(g, gHour === 0 ? 0 : gHour);
          const v = gv != null ? { mm: gv, t: gHour === 0 ? g.vals[g.vals.length - 1].t : this.hourEnd(gHour) } : null;
          const mm = v ? v.mm : (g.src === 'SIM' ? this.simRainAt(g.lat, g.lng, gHour) : 0);
          const c = mm >= 0.1 ? this.rainRgb(mm) : '127,168,181';
          const ring = g.src === 'DMI' ? '#ff8a4a' : g.src === 'FM' ? '#c9b6ff' : '#eaf7fb';
          const html = '<div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:auto">' +
            '<div style="width:11px;height:11px;transform:rotate(45deg);border-radius:2px;background:rgb(' + c + ');border:1.5px solid ' + ring + ';box-shadow:0 0 8px rgba(' + c + ',.8)"></div>' +
          '</div>';
          const mk = L.marker([g.lat, g.lng], { interactive: true, keyboard: false, zIndexOffset: 750, icon: L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0], html }) }).addTo(this.gaugeLayer);
          const mmTxt = (Math.round(mm * 10) / 10).toString().replace('.', ',');
          const tTxt = v ? new Date(v.t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '–';
          mk.bindTooltip('<div style="font-family:Chakra Petch,sans-serif;font-size:11px;line-height:1.4"><b>' + g.name + '</b><br>' + srcName[g.src] + ' · regnmätare<br><span style="font-family:JetBrains Mono,monospace">' + mmTxt + ' mm/h</span> · ' + tTxt + '<br><span style="color:#8fcfe0">Tryck för all data</span></div>', { direction: 'top', offset: [0, -8], className: 'nsva-tip' });
          mk.on('click', () => this.openGauge(g));
        });
      } catch (e) { /* layer skipped */ }
    } else if (!f.regn && this.gaugeLayer) { this.map.removeLayer(this.gaugeLayer); this.gaugeLayer = null; this._gKey = null; }
    // --- radar coverage: one ring per weather radar (best quality ~120 km, max precipitation range ~240 km) ---
    if (f.radartack && !this.radarCovLayer) {
      this.radarCovLayer = L.layerGroup().addTo(this.map);
      const ring = (lat, lng, km) => { const pts = []; for (let i = 0; i <= 72; i++) { const a = i / 72 * 2 * Math.PI; pts.push([lat + km / 111 * Math.cos(a), lng + km / (111 * Math.cos(lat * Math.PI / 180)) * Math.sin(a)]); } return pts; };
      this.weatherRadars().forEach(r => {
        try {
          L.polygon(ring(r.lat, r.lng, 100), { interactive: false, color: r.color, weight: 1.6, opacity: 0.75, fillColor: r.color, fillOpacity: 0.06 }).addTo(this.radarCovLayer);
          const html = '<div style="transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none">' +
            '<div style="width:12px;height:12px;border-radius:50%;background:' + r.color + ';box-shadow:0 0 0 3px rgba(6,18,26,.9),0 0 12px ' + r.color + '"></div>' +
            '<div style="padding:2px 7px;border-radius:7px;background:rgba(6,18,26,.88);border:1px solid ' + r.color + ';font:600 10.5px Chakra Petch,sans-serif;color:#eaf7fb;white-space:nowrap">' + r.name + ' · ' + r.org + '</div></div>';
          const rm = L.marker([r.lat, r.lng], { interactive: true, keyboard: false, zIndexOffset: 700, icon: L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0], html: html.replace('pointer-events:none', 'pointer-events:auto;cursor:pointer') }) }).addTo(this.radarCovLayer);
          rm.on('click', () => this.setState({ radarSel: r.name }));
        } catch (e) {}
      });
    } else if (!f.radartack && this.radarCovLayer) { this.map.removeLayer(this.radarCovLayer); this.radarCovLayer = null; }
    // --- alarm: pulsing rings on municipalities with active alarms ---
    if (f.alarm && !this.alarmLayer) {
      this.alarmLayer = L.layerGroup().addTo(this.map);
      const sev = {}; this.currentAlarms().forEach(a => { if (!sev[a.muni] || a.sev === 'KRITISK') sev[a.muni] = a.sev; });
      Object.keys(sev).forEach(id => { const m = byId[id]; if (!m) return;
        const col = sev[id] === 'KRITISK' ? '#ff5a6e' : sev[id] === 'VARNING' ? '#ffb547' : '#35d6f2';
        L.marker([m.lat, m.lng], { interactive: false, keyboard: false, zIndexOffset: -200, icon: L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0],
          html: '<div style="transform:translate(-50%,-50%);width:54px;height:54px;border-radius:50%;border:2px solid ' + col + ';box-shadow:0 0 16px ' + col + ', inset 0 0 14px ' + col + '55;animation:nodePulse 2.4s infinite"></div>' }) }).addTo(this.alarmLayer);
      });
    } else if (!f.alarm && this.alarmLayer) { this.map.removeLayer(this.alarmLayer); this.alarmLayer = null; }
  }
  toggleFilter(key) {
    if (key === 'skyfall') {
      const turningOn = !this.state.filters.skyfall;
      this.setState(s => ({ filters: { ...s.filters, skyfall: turningOn }, skyfallScan: turningOn, skyfallResult: null, skyfallHour: 0 }));
      if (this._scanT) { clearTimeout(this._scanT); this._scanT = null; }
      if (this._resT) { clearTimeout(this._resT); this._resT = null; }
      if (turningOn) {
        this._scanT = setTimeout(async () => {
          // after the 3s sweep: scan the real RainViewer radar over the region
          let clouds;
          if (this.weather) {
            clouds = await this.hasCloudsNow();
            if (clouds === null) clouds = (this.weather.maxP || 0) >= 0.2;
          } else {
            // simulated mode: reflect the simulated band (which is raining now)
            clouds = this.baseMunis().some(mm => this.fcPrecip(mm.id, 0) >= 0.2);
          }
          this.setState({ skyfallScan: false, skyfallResult: clouds ? null : 'none' });
          if (!clouds && this._resT == null) this._resT = setTimeout(() => { this._resT = null; this.setState({ skyfallResult: null }); }, 6500);
        }, 3000);
      }
      return;
    }
    this.setState(s => ({ filters: { ...s.filters, [key]: !s.filters[key] } }));
  }
  updateMarkers() {
    if (!this.markers) return;
    this.baseMunis().forEach((m, i) => {
      const marker = this.markers[m.id]; if (!marker) return;
      const el = marker.getElement(); if (!el) return;
      const lvl = Math.min(this.j(m.res[0], 1.2, i), this.j(m.res[1], 1.2, i + 9));
      const rainOnly = this.state.view === 'visky'; // Visky = nederbörd only: no SCADA status on the kommun nodes
      const c = rainOnly ? this.acHex() : this.colorFor(lvl);
      const dataEl = el.querySelector('.nsva-data'); if (dataEl) dataEl.style.display = rainOnly ? 'none' : 'flex';
      const lvlEl = el.querySelector('.nsva-lvl'); if (lvlEl) { lvlEl.textContent = Math.round(lvl) + '%'; lvlEl.style.color = c; }
      const prodEl = el.querySelector('.nsva-prod'); if (prodEl) prodEl.textContent = this.fmt(this.j(m.prod, m.prod * 0.02, i)) + ' m³/h';
      const dot = el.querySelector('.nsva-dot'); if (dot) { dot.style.background = c; dot.style.boxShadow = '0 0 16px ' + c; }
      const ring = el.querySelector('.nsva-ring'); if (ring) ring.style.borderColor = c;
    });
  }
  initRadarMap() {
    if (this.radarMap || !this.radarEl) return;
    if (typeof window === 'undefined' || !window.L) { this._radarPoll = setTimeout(() => this.initRadarMap(), 140); return; }
    const L = window.L;
    const map = L.map(this.radarEl, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false, fadeAnimation: false,
    });
    this.radarMap = map;
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
    map.fitBounds(this.baseMunis().map(m => [m.lat, m.lng]), { padding: [4, 4] });
    // faint town markers so the rain reads against real geography
    this.baseMunis().forEach(m => {
      L.marker([m.lat, m.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0], html:
        '<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%)">' +
          '<span style="width:3px;height:3px;border-radius:50%;background:rgba(190,230,245,.9);box-shadow:0 0 3px rgba(190,230,245,.8)"></span>' +
          '<span style="font-size:6.5px;line-height:1;color:rgba(175,215,232,.92);margin-top:2px;white-space:nowrap;text-shadow:0 1px 2px #000">' + m.name + '</span>' +
        '</div>' }) }).addTo(map);
    });
    setTimeout(() => { if (this.radarMap) this.radarMap.invalidateSize(); }, 320);
    setTimeout(() => { if (this.radarMap) this.radarMap.invalidateSize(); }, 900);
    // redraw once the scope has its real size, then keep it in step with the big map
    [400, 1200, 2500].forEach(t => setTimeout(() => { this._radarFieldKey = null; this.drawRadarField(); }, t));
    if (!this._radarFieldTimer) this._radarFieldTimer = setInterval(() => this.drawRadarField(), 3000);
    this.startRadarRain();
  }
  // Small radar = same rain model as the big map (same grid, same hour), simplified to 3 colours: blå · gul · röd
  drawRadarField() {
    const map = this.radarMap; if (!map || typeof window === 'undefined' || !window.L) return;
    const L = window.L;
    const hour = (this.state.filters && this.state.filters.skyfall) ? (this.state.skyfallHour || 0) : 0;
    const grid = (this.weather && this.wxGrid && this.wxGrid.length) ? this.wxGrid : this.rainGridPoints().map(g => ({ lat: g.lat, lng: g.lng, sim: true }));
    const key = hour + ':' + (this._rainStamp || 0) + ':' + grid.length + ':' + (this.weather ? 1 : 0) + ':' + (this.state.tv ? 1 : 0) + ':' + Math.floor(Date.now() / 60000);
    if (this._radarFieldKey === key && this.radarFieldLayer) return;
    this._radarFieldKey = key;
    const wet = [];
    grid.forEach(g => { const p = this.gridSampler(g)(hour); if (p >= 0.2) wet.push({ lat: g.lat, lng: g.lng, p }); });
    if (this._radarFieldImg) this._radarFieldImg.style.display = 'none';
    this.radarFieldLayer = null;
    if (!wet.length) return;
    const size = map.getSize(); if (!size.x || !size.y) return;
    const W = size.x * 2, H = size.y * 2; // 2× for crisp edges on the tiny scope
    const off = document.createElement('canvas'); off.width = W; off.height = H; const octx = off.getContext('2d');
    const pMax = Math.max(1, ...wet.map(c => c.p));
    let cell = Infinity; // grid spacing in px → spot radius, so coverage matches the big map
    const pts = wet.map(c => { const pt = map.latLngToContainerPoint([c.lat, c.lng]); return { x: pt.x * 2, y: pt.y * 2, p: c.p }; });
    const gp = grid.slice(0, 2).map(g => map.latLngToContainerPoint([g.lat, g.lng]));
    if (gp.length === 2) cell = Math.max(6, Math.hypot(gp[1].x - gp[0].x, gp[1].y - gp[0].y) * 2);
    if (!isFinite(cell)) cell = 24;
    const r = cell * 0.95;
    pts.forEach(c => {
      const w = Math.min(1, Math.log1p(c.p) / Math.log1p(pMax));
      const g = octx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      g.addColorStop(0, 'rgba(255,255,255,' + w.toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(255,255,255,' + (w * 0.45).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      octx.fillStyle = g; octx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    });
    const src = octx.getImageData(0, 0, W, H).data;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const out = ctx.createImageData(W, H); const od = out.data;
    const BLUE = [53, 170, 240], YELLOW = [255, 214, 64], RED = [255, 72, 88];
    for (let i = 0; i < src.length; i += 4) {
      const wgt = Math.min(1, src[i + 3] / 255);
      if (wgt < 0.08) continue;
      const mm = Math.expm1(wgt * Math.log1p(pMax));
      const rgb = mm >= 10 ? RED : mm >= 2 ? YELLOW : BLUE;
      od[i] = rgb[0]; od[i + 1] = rgb[1]; od[i + 2] = rgb[2];
      od[i + 3] = Math.round(255 * Math.min(0.85, 0.34 + (wgt - 0.08) * 0.65));
    }
    ctx.putImageData(out, 0, 0);
    try {
      // The scope's base map is dimmed (opacity .5), so paint the rain in a sibling layer ABOVE it at full strength
      const mc = map.getContainer(); const host = mc.parentElement;
      let img = this._radarFieldImg;
      if (!img || img.parentElement !== host) {
        img = document.createElement('img');
        img.style.cssText = 'position:absolute;pointer-events:none;z-index:3;';
        host.appendChild(img); this._radarFieldImg = img;
      }
      const ms = getComputedStyle(mc);
      img.style.left = mc.offsetLeft + 'px'; img.style.top = mc.offsetTop + 'px';
      img.style.width = mc.offsetWidth + 'px'; img.style.height = mc.offsetHeight + 'px';
      img.style.borderRadius = ms.borderRadius;
      img.src = cv.toDataURL('image/png');
      img.style.display = 'block';
      this.radarFieldLayer = img;
    } catch (e) {}
  }
  // Live RainViewer precipitation on the small radar scope — replaced by drawRadarField (synced with the big map)
  startRadarRain() {
    this.drawRadarField();
    return;
    if (this.radarRainAnim || !this.radarMap || !this.weather || !this.rvFrames || !this.rvFrames.length) return;
    if (typeof window === 'undefined' || !window.L) return;
    const L = window.L;
    const add = (i) => {
      const lyr = L.tileLayer(this.rvTileUrl(this.rvFrames[i]), { opacity: 0, zIndex: 250, tileSize: 256, maxNativeZoom: 7, minNativeZoom: 0, crossOrigin: true, className: 'nsva-rv-fade nsva-rv-soft' });
      lyr.addTo(this.radarMap);
      lyr.once('load', () => {
        lyr.setOpacity(0.9);
        if (this.radarRainLayer) { const old = this.radarRainLayer; old.setOpacity(0); setTimeout(() => { if (this.radarMap) { try { this.radarMap.removeLayer(old); } catch (e) {} } }, 900); }
        this.radarRainLayer = lyr;
      });
    };
    this._radarRainIdx = this.rvIndex || 0;
    add(this._radarRainIdx);
    this.radarRainAnim = setInterval(() => {
      if (!this.radarMap || !this.rvFrames) return;
      this._radarRainIdx = (this._radarRainIdx + 1) % this.rvFrames.length;
      add(this._radarRainIdx);
    }, 2600);
  }
  facMarkerHtml(f) {
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:7px;transform:translate(-50%,-50%)">' +
        '<span class="fac-dot" style="width:15px;height:15px;border-radius:3px;transform:rotate(45deg);background:'+f.color+';box-shadow:0 0 15px '+f.color+';animation:nodePulse 2.8s infinite"></span>' +
        '<div style="padding:6px 12px;border-radius:9px;background:rgba(5,16,24,.84);border:1px solid rgba(var(--acg,53,214,242),.3);backdrop-filter:blur(6px);text-align:center;white-space:nowrap;box-shadow:0 5px 16px rgba(0,0,0,.55)">' +
          '<div style="font-size:9px;letter-spacing:.14em;color:#7fa8b5;text-transform:uppercase">'+f.type+'</div>' +
          '<div style="font-size:12px;font-weight:600;color:#e3f4fa;margin-top:1px">'+f.name+'</div>' +
          '<div class="fac-val" style="font-family:JetBrains Mono,monospace;font-size:12px;color:'+f.color+';margin-top:2px">'+f.valueTxt+'</div>' +
        '</div>' +
      '</div>';
  }
  destroyDetailMap() {
    clearTimeout(this._detailPoll);
    if (this.detailMap) { this.detailMap.remove(); this.detailMap = null; }
    this.detailMapEl = null; this.detailMapFor = null; this.detailFacs = null;
  }
  initDetailMap() {
    if (!this.detailEl) return;
    const sel = this.state.selected; if (!sel) return;
    if (this.detailMap && this.detailMapEl === this.detailEl && this.detailMapFor === sel) return;
    if (typeof window === 'undefined' || !window.L) { this._detailPoll = setTimeout(() => this.initDetailMap(), 140); return; }
    if (this.detailMap) { this.detailMap.remove(); this.detailMap = null; }
    const L = window.L;
    const m = this.baseMunis().find(x => x.id === sel); if (!m) return;
    const map = L.map(this.detailEl, {
      zoomControl: false, attributionControl: false, scrollWheelZoom: true,
      dragging: true, doubleClickZoom: true, fadeAnimation: false,
    });
    this.detailMap = map; this.detailMapEl = this.detailEl; this.detailMapFor = sel;
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.setView([m.lat, m.lng], 12);
    // facility markers at on-land positions near the town
    const facs = this.facilitiesFor(m);
    const geo = this.facilityGeo(sel);
    this.detailFacs = [];
    facs.forEach((f, idx) => {
      const ll = geo && geo[idx] ? geo[idx]
        : [m.lat - (f.y - 50) / 50 * 0.018, m.lng + (f.x - 50) / 50 * 0.022];
      const marker = L.marker(ll, { interactive: true, keyboard: false, riseOnHover: true,
        icon: L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0], html: this.facMarkerHtml(f) }) }).addTo(map);
      marker.on('click', () => this.selectFac(idx));
      this.detailFacs.push(marker);
    });
    // fit the view to the facilities so they're all comfortably framed
    if (this.detailFacs.length) {
      map.fitBounds(this.detailFacs.map(mk => mk.getLatLng()), { padding: [70, 70], maxZoom: 13 });
    }
    setTimeout(() => { if (this.detailMap) this.detailMap.invalidateSize(); }, 220);
    setTimeout(() => { if (this.detailMap) this.detailMap.invalidateSize(); }, 700);
  }
  updateDetailFacilities() {
    if (!this.detailMap || !this.detailFacs || !this.detailMapFor) return;
    const m = this.baseMunis().find(x => x.id === this.detailMapFor); if (!m) return;
    const facs = this.facilitiesFor(m);
    this.detailFacs.forEach((marker, idx) => {
      const f = facs[idx]; if (!f) return;
      const el = marker.getElement(); if (!el) return;
      const v = el.querySelector('.fac-val'); if (v) { v.textContent = f.valueTxt; v.style.color = f.color; }
      const d = el.querySelector('.fac-dot'); if (d) { d.style.background = f.color; d.style.boxShadow = '0 0 15px ' + f.color; }
    });
  }
  baseAlarms() {
    return [
      { sev:'KRITISK', muni:'orkelljunga', msg:'Låg nivå · Reservoar Södra 28%', time:'2 min' },
      { sev:'VARNING', muni:'svalov', msg:'Förhöjd turbiditet · Svalövs vattenverk', time:'14 min' },
      { sev:'VARNING', muni:'helsingborg', msg:'Tryckfall · Pumpstation Söder', time:'31 min' },
      { sev:'INFO', muni:'bastad', msg:'Planerat underhåll · Pumpstation Central', time:'1 tim' },
      { sev:'INFO', muni:'landskrona', msg:'Sensor återansluten · Reservoar Södra', time:'1 tim' },
    ];
  }
  // Per-kommun skyfall outlook over the next 12 h: worst återkomsttid class + when it starts + the peak 1h intensity.
  // Uses the exact same rpAuto/SMHI model as the map, so alarms/AI-notiser mirror what the rain field shows.
  skyfallOutlook(id) {
    const m = this.baseMunis().find(x => x.id === id); if (!m) return null;
    const sampler = h => (this.weather ? this.fcPrecip(id, h) : this.simRainAt(m.lat, m.lng, h));
    let best = null, peak1 = 0, peakH = 0;
    for (let h = 0; h <= 12; h++) {
      const a = this.rpAuto(sampler, h);
      const p = sampler(h); if (p > peak1) { peak1 = p; peakH = h; }
      if (!best || a.lvl > best.lvl || (a.lvl === best.lvl && ((a.years || 0) > (best.years || 0) || (!a.years && a.amt > best.amt)))) best = Object.assign({ startH: h }, a);
    }
    return { best, peak1, peakH, nowP: sampler(0) };
  }
  etaTxt(h) { return h <= 0 ? 'nu' : h === 1 ? 'om 1 tim' : 'om ' + h + ' tim'; }
  // plain-language time for an hour offset: "nu", "ikväll kl 21", "inatt kl 02", "i morgon bitti kl 07", "i eftermiddag kl 15"
  whenTxt(h) {
    if (h <= 0) return 'nu';
    const d = new Date(Date.now() + h * 3600000), hr = d.getHours(), tomorrow = d.getDate() !== new Date().getDate();
    const kl = 'kl ' + String(hr).padStart(2, '0');
    if (hr >= 0 && hr < 6) return 'inatt ' + kl;
    if (hr >= 6 && hr < 10) return (tomorrow ? 'i morgon bitti ' : 'i morse ') + kl;
    if (hr >= 18) return (tomorrow ? 'i morgon kväll ' : 'ikväll ') + kl;
    return (tomorrow ? 'i morgon ' : (hr < 12 ? 'i förmiddag ' : 'i eftermiddag ')) + kl;
  }
  // Weather-driven alarms (skyfall / återkomstregn) layered on top of the static infrastructure alarms.
  currentAlarms() {
    const rain = [];
    this.baseMunis().forEach(m => {
      const o = this.skyfallOutlook(m.id); if (!o) return;
      const b = o.best; const amt = (Math.round(b.amt * 10) / 10).toString().replace('.', ',');
      const when = b.startH === 0 ? 'nu' : this.etaTxt(b.startH);
      const yr = b.yearsTxt ? b.yearsTxt.replace(' år', '-årsregn') : '';
      const yAmt = b.yearsAmt != null ? (Math.round(b.yearsAmt * 10) / 10).toString().replace('.', ',') : amt, yPer = b.yearsPeriod || b.period;
      if (b.lvl >= 6) rain.push({ sev: 'KRITISK', muni: m.id, msg: 'SKYFALL · ' + yr + ' ' + when + ' – ' + yAmt + ' mm / ' + yPer + ' h · maximal beredskap', time: when });
      else if (b.lvl === 5) rain.push({ sev: 'KRITISK', muni: m.id, msg: 'Skyfall · ' + yr + ' ' + when + ' – ' + yAmt + ' mm / ' + yPer + ' h · bräddningsrisk', time: when });
      else if (b.lvl === 4) rain.push({ sev: 'VARNING', muni: m.id, msg: 'Kraftigt regn · ' + yr + ' ' + when + ' – ' + yAmt + ' mm / ' + yPer + ' h', time: when });
      else if (o.nowP >= 2.5) rain.push({ sev: 'VARNING', muni: m.id, msg: 'Förhöjt dagvattenflöde (' + o.nowP.toFixed(1).replace('.', ',') + ' mm/h)', time: 'nu' });
    });
    const order = { KRITISK: 0, VARNING: 1, INFO: 2 };
    rain.sort((a, b) => order[a.sev] - order[b.sev]);
    return rain.concat(this.baseAlarms());
  }
  sevColor(s) { return s === 'KRITISK' ? '#ff5a6e' : s === 'VARNING' ? '#ffb547' : '#35d6f2'; }
  sevBg(s) { return s === 'KRITISK' ? 'rgba(255,90,110,.08)' : s === 'VARNING' ? 'rgba(255,181,71,.07)' : 'rgba(53,214,242,.06)'; }
  sevBorder(s) { return s === 'KRITISK' ? 'rgba(255,90,110,.28)' : s === 'VARNING' ? 'rgba(255,181,71,.26)' : 'rgba(53,214,242,.2)'; }
  muniName(id) { const m = this.baseMunis().find(x => x.id === id); return m ? m.name : id; }

  facilitiesFor(m) {
    const layout = [{x:50,y:20},{x:80,y:42},{x:67,y:78},{x:24,y:74},{x:30,y:37}];
    const defs = [
      { name: m.name + ' Vattenverk', type: 'Vattenverk', kind: 'flow', base: m.prod },
      { name: 'Reservoar Norra', type: 'Reservoar', kind: 'level', base: m.res[0] },
      { name: 'Reservoar Södra', type: 'Reservoar', kind: 'level', base: m.res[1] },
      { name: 'Pumpstation Central', type: 'Pumpstation', kind: 'flow', base: m.prod * 0.55 },
      { name: m.name + ' ARV', type: 'Reningsverk', kind: 'flow', base: m.prod * 0.78 },
    ];
    return defs.map((d, i) => {
      const live = d.kind === 'level' ? this.j(d.base, 1.2, i + 1) : this.j(d.base, d.base * 0.02, i + 1);
      return {
        name: d.name, type: d.type, x: layout[i].x, y: layout[i].y,
        valueTxt: d.kind === 'level' ? Math.round(live) + '%' : this.fmt(live) + ' m³/h',
        color: d.kind === 'level' ? this.colorFor(live) : '#35d6f2',
      };
    });
  }

  // On-land facility coordinates per municipality, in the order returned by facilitiesFor:
  // [Vattenverk, Reservoar Norra, Reservoar Södra, Pumpstation Central, ARV]
  stationDetail(m, idx) {
    const facs = this.facilitiesFor(m);
    const f = facs[idx]; if (!f) return null;
    const hist = (base, amp, seed, n) => Array.from({ length: n || 12 }, (_, i) => Math.max(0, base + Math.sin((this.state.tick + i + seed) * 0.5) * amp + Math.sin((i + seed) * 1.3) * amp * 0.45));
    const out = { name: f.name, type: f.type, color: f.color, isVattenverk: false, isReningsverk: false, isPump: false, isReservoar: false };
    if (f.type === 'Vattenverk') {
      const cap = m.prod * 1.3;
      const prod = this.j(m.prod, m.prod * 0.02, 3);
      out.isVattenverk = true;
      out.prodTxt = this.fmt(prod);
      out.capTxt = Math.round(prod / cap * 100) + '%';
      out.drifttid = '99,8%';
      out.zonTryck = this.j(4.2, 0.05, 2).toFixed(1).replace('.', ',');
      out.series = hist(m.prod, m.prod * 0.07, 3).map(v => ({ h: Math.max(8, Math.min(100, v / cap * 100)) }));
    } else if (f.type === 'Reningsverk') {
      const cap = m.prod * 1.1;
      const inflow = this.j(m.prod * 0.78, m.prod * 0.04, 6), outflow = inflow * 0.94;
      out.isReningsverk = true;
      out.inTxt = this.fmt(inflow); out.outTxt = this.fmt(outflow);
      out.braddTxt = inflow > cap * 0.92 ? 'RISK' : 'NEJ';
      out.braddColor = inflow > cap * 0.92 ? '#ffb547' : '#2fe6c4';
      out.inSeries = hist(m.prod * 0.78, m.prod * 0.1, 6).map(v => ({ h: Math.max(8, Math.min(100, v / cap * 100)) }));
      out.outSeries = hist(m.prod * 0.72, m.prod * 0.09, 9).map(v => ({ h: Math.max(8, Math.min(100, v / cap * 100)) }));
    } else if (f.type === 'Pumpstation') {
      const lvl = this.j(48, 3.5, 7), flow = this.j(m.prod * 0.55, m.prod * 0.03, 6);
      out.isPump = true;
      out.lvlTxt = Math.round(lvl) + '%'; out.lvlPct = Math.round(lvl); out.lvlColor = lvl > 85 ? '#ff5a6e' : lvl > 70 ? '#ffb547' : '#2fe6c4';
      out.flowTxt = this.fmt(flow);
      out.drifttid = this.fmt(this.j(1820, 35, 3)) + ' h';
      out.larmTxt = lvl > 85 ? 'Hög nivå' : 'Inga'; out.larmColor = lvl > 85 ? '#ff5a6e' : '#2fe6c4';
    } else {
      const lvl = f.name.indexOf('Norra') >= 0 ? this.j(m.res[0], 1.2, 1) : this.j(m.res[1], 1.2, 2);
      out.isReservoar = true;
      out.lvlTxt = Math.round(lvl) + '%'; out.lvlPct = Math.round(lvl); out.lvlColor = this.colorFor(lvl);
      out.volTxt = this.fmt(Math.round(lvl / 100 * m.prod * 8)) + ' m³';
      out.zonTryck = this.j(4.1, 0.06, 5).toFixed(1).replace('.', ',');
      out.series = hist(lvl, 2.2, 1).map(v => ({ h: Math.max(8, Math.min(100, v)) }));
    }
    return out;
  }
  facilityGeo(id) {
    const G = {
      helsingborg: [[56.060,12.728],[56.073,12.715],[56.034,12.726],[56.046,12.706],[56.052,12.742]],
      landskrona:  [[55.881,12.858],[55.890,12.846],[55.861,12.853],[55.873,12.838],[55.869,12.872]],
      bastad:      [[56.417,12.872],[56.428,12.861],[56.408,12.882],[56.421,12.851],[56.412,12.898]],
      bjuv:        [[56.090,12.928],[56.097,12.912],[56.074,12.926],[56.083,12.905],[56.078,12.940]],
      astorp:      [[56.140,12.962],[56.147,12.942],[56.124,12.958],[56.133,12.935],[56.128,12.972]],
      svalov:      [[55.920,13.122],[55.927,13.100],[55.905,13.118],[55.913,13.092],[55.908,13.135]],
      orkelljunga: [[56.290,13.296],[56.297,13.272],[56.275,13.292],[56.283,13.262],[56.278,13.308]],
      perstorp:    [[56.141,13.402],[56.148,13.378],[56.127,13.398],[56.135,13.368],[56.130,13.414]],
    };
    return G[id] || null;
  }
  selectMuni(id) { this.setState({ selected: id, selFac: null }); }
  selectFac(idx) { this.setState({ selFac: idx }); }
  backFac() { this.setState({ selFac: null }); }
  back() { this.setState({ selected: null, selFac: null }); }
  closeChat() { this.setState({ chatOpen: false }); }

  muniFromText(t) {
    const map = { helsing:'helsingborg', landskrona:'landskrona', 'båstad':'bastad', bastad:'bastad', bjuv:'bjuv', 'åstorp':'astorp', astorp:'astorp', 'svalöv':'svalov', svalov:'svalov', 'örkel':'orkelljunga', orkel:'orkelljunga', perstorp:'perstorp' };
    const low = t.toLowerCase();
    for (const k in map) if (low.includes(k)) return map[k];
    return null;
  }

  async ask(t) {
    const ctx = 'Aktuell drift NSVA (nordvästra Skåne, 8 kommuner). DRICKSVATTEN: produktion ca 7 180 m³/h (Helsingborg störst ~3 200), snittnivå reservoarer ~64%, nättryck ~4,2 bar, turbiditet 0,21 NTU, pH 7,8 (god kvalitet, men Svalöv förhöjd turbiditet). SPILLVATTEN: inflöde till reningsverk förhöjt av regnet, pumpstationsnivåer ~58%, bräddningsrisk i flera kommuner. DAGVATTEN: kraftigt förhöjd avrinning pga skyfall, magasinsfyllnad ~71% totalt men Örkelljunga ~92%. VÄDER: skyfallsvarning över Örkelljunga/Perstorp upp till 32 mm/h, vind från SV ~7 m/s (byar 11) – regnet drar mot nordöst. PROGNOS: nederbördstopp nu och avtar inom 3 tim, dagvattenflöde toppar om ~1 tim. AI-NOTISER (prediktivt): hög risk för översvämning i Örkelljunga om ~2 tim (88%), bräddningsrisk Perstorp om ~3 tim (81%), tryckfall Helsingborg Pumpstation Söder om ~3 tim. AKTIVA ALARM: 2 kritiska (Örkelljunga: reservoar 28% + skyfall-flödesspik), 2 varningar (Svalöv turbiditet, Helsingborg tryckfall). Kommuner: Helsingborg, Landskrona, Båstad, Bjuv, Åstorp, Svalöv, Örkelljunga, Perstorp.';
    const prompt = 'Du är JARVIS, röst- och textassistent i NSVA:s driftövervakning för vatten i nordvästra Skåne. Svara kort, sakligt och på svenska i ren löpande text – max 3 korta meningar. Använd ALDRIG markdown, asterisker, rubriker, punktlistor eller emoji. ' + ctx + '\n\nAnvändare: ' + t + '\nJARVIS:';
    try {
      if (typeof window !== 'undefined' && window.claude && window.claude.complete) {
        const r = await window.claude.complete(prompt);
        if (r && r.trim()) return this.clean(r);
      }
    } catch (e) {}
    return this.fallback(t);
  }
  clean(s) {
    return s
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\uFE0F]/gu, '')
      .replace(/[*_#`>]+/g, '')
      .replace(/^\s*[-•]\s*/gm, '')
      .replace(/\n{2,}/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  fallback(t) {
    const q = t.toLowerCase();
    if (/vind|blås|blas|byar/.test(q)) return 'Vinden ligger på cirka 7 m/s från sydväst med byar upp mot 11 m/s. Det innebär att regnområdet drar mot nordöst, in över Örkelljunga och Perstorp.';
    if (/prognos|kommande|framåt|framat|nästa tim|nasta tim/.test(q)) return 'Nederbörden toppar nu och väntas avta inom tre timmar. Dagvattenflödet fortsätter dock stiga och beräknas toppa om cirka en timme.';
    if (/ai|notis|prediktiv|risk|översväm|oversvam|förutsäg|forutsag/.test(q)) return 'Högst risk just nu: översvämning i Örkelljunga om cirka 2 timmar (88% säkerhet) och bräddningsrisk i Perstorp om cirka 3 timmar. Jag bevakar även ett begynnande tryckfall i Helsingborg.';
    if (/spillvatten|avlopp|brädd|bradd|reningsverk|pumpstation/.test(q)) return 'Spillvatteninflödet är förhöjt av regnet och pumpstationsnivåerna ligger runt 58%. Bräddningsrisk finns i flera kommuner, störst i Örkelljunga och Perstorp.';
    if (/dagvatten|magasin|avrinning/.test(q)) return 'Dagvattenavrinningen är kraftigt förhöjd av skyfallet. Magasinsfyllnaden ligger på ca 71% totalt, men Örkelljunga är uppe på 92% och närmar sig kapacitetstaket.';
    if (/skyfall|regn|väder|vader|nederbörd|nederbord/.test(q)) return 'Skyfallsvarning är aktiv över Örkelljunga och Perstorp med upp till 32 mm/h. Med sydvästlig vind drar regnet mot nordöst och avloppsnätet visar flödesspikar.';
    if (/kvalitet|turbiditet|ph/.test(q)) return 'Dricksvattenkvaliteten är god överlag – turbiditet 0,21 NTU och pH 7,8. Undantaget är Svalöv där turbiditeten stiger och en varning är aktiv.';
    if (/alarm|larm/.test(q)) {
      if (/helsing/.test(q)) return 'Helsingborg har en varning: tryckfall vid Pumpstation Söder (31 min sedan).';
      return 'Just nu: 2 kritiska och 2 varningar. De kritiska gäller Örkelljunga – låg reservoarnivå (28%) och flödesspik i avloppsnätet.';
    }
    if (/nivå|niva|reservoar|lägst|lagst/.test(q)) return 'Lägsta reservoarnivån är Örkelljunga Södra på 28% (kritisk). Svalöv ligger på 43% (varning), övriga kommuner är inom normalt spann.';
    if (/produktion|m3|m³|flöde|flode/.test(q)) return 'Total dricksvattenproduktion är ca 7 180 m³/h fördelat på 8 kommuner. Helsingborg står för störst andel, ungefär 3 200 m³/h.';
    if (/tryck/.test(q)) return 'Genomsnittligt nättryck ligger på 4,2 bar. Ett tryckfall noteras vid Pumpstation Söder i Helsingborg.';
    if (this.muniFromText(q)) return 'Öppnar detaljvy för kommunen – du ser anläggningsnät, produktion, reservoarnivåer och tryck i drill-down.';
    if (/hej|hallå|halla|tjena|god|hello/.test(q)) return 'JARVIS online. Samtliga system övervakas. Fråga mig om vattenproduktion, nivåer, kvalitet, dagvatten, väder, vind eller AI-prognoser.';
    return 'Jag övervakar dricks-, spill- och dagvatten, väder, vind, prognoser och AI-notiser för NSVA:s åtta kommuner. Fråga t.ex. om dagvattenmagasin, översvämningsrisk eller vindriktning.';
  }

  async send(text) {
    const t = (text != null ? text : this.state.input).trim();
    if (!t || this.state.sending) return;
    this.setState(s => ({ messages: [...s.messages, { role: 'user', text: t }], input: '', chatOpen: true, sending: true }));
    // ElevenLabs agent (text + voice, can steer the dashboard). Falls back to the text path if no agent is set.
    if (this.agentId()) {
      try {
        if (!this._conv) await this.startAgent(false);
        const sent = Date.now();
        this._conv.sendUserMessage(t);
        // fallback: if the agent doesn't use a tool within ~2,5 s, run the command locally (never both)
        setTimeout(() => { if ((this._toolAt || 0) >= sent) return; this.localCommand(t).then(d => { if (d) this.pushAgentContext(); }).catch(() => {}); }, 2500);
        return; // the reply arrives through onMessage
      } catch (e) {
        this.setState(s => ({ messages: [...s.messages, { role: 'jarvis', text: 'MR. Hydra kunde inte anslutas (' + ((e && e.message) || 'okänt fel') + ').' }], sending: false }));
        return;
      }
    }
    let did = null; try { did = await this.localCommand(t); } catch (e) {}
    if (did) { this.setState(s => ({ messages: [...s.messages, { role: 'jarvis', text: did }], sending: false })); return; }
    // no agent: answer from Hydra's own kunskapsbas when the question matches it
    const kb = this.kbAnswer(t);
    const reply = kb ? ('Ur Hydras kunskapsbas: ' + kb) : await this.askCopilot(t);
    this.setState(s => ({ messages: [...s.messages, { role: 'jarvis', text: reply }], sending: false }));
  }

  // ---------- MR. Hydra · ElevenLabs Conversational AI (voice + text, navigates the dashboard) ----------
  agentId() { const a = this.props.elevenlabsAgentId; return (a == null ? 'agent_0601m5hjnbjmfcgvz03z0asps75d' : String(a)).trim(); }
  async loadElevenSdk() {
    if (this._elSdk) return this._elSdk;
    const urls = ['https://esm.sh/@elevenlabs/client@0.7.1', 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@0.7.1/+esm'];
    let lastErr;
    for (const u of urls) { try { const m = await import(u); if (m && m.Conversation) { this._elSdk = m; return m; } } catch (e) { lastErr = e; } }
    throw lastErr || new Error('SDK kunde inte laddas');
  }
  // all agent tools, each call stamped so the local command parser never duplicates an action the agent already did
  agentTools() {
    const raw = this.agentToolsRaw(), out = {};
    Object.keys(raw).forEach(k => { out[k] = async (p) => { this._toolAt = Date.now(); return raw[k](p || {}); }; });
    return out;
  }
  // ---- guided-tour + screen helpers ----
  hlTarget(name) {
    const q = String(name || '').toLowerCase();
    const wid = this.resolveWidget(q);
    if (wid) return document.querySelector('[data-wid="' + wid + '"]');
    if (/reglage|tidslinje|scrub|färgskala|fargskala/.test(q)) return document.querySelector('.nsva-scrub');
    if (/live|uppdater/.test(q)) return document.querySelector('[title^="Hydra hämtar ny data"]');
    if (/inställning|installning|kugg/.test(q)) return document.querySelector('[title^="Inställningar"]');
    if (/meny/.test(q)) return document.querySelector('[title^="Hydra-meny"]');
    if (/chatt|fråga|mr\.? hydra|mikrofon/.test(q)) { const i = document.querySelector('input[placeholder^="Fråga MR"]'); return i && i.parentElement && i.parentElement.parentElement; }
    if (/kartlager|filter/.test(q)) { const el = Array.from(document.querySelectorAll('div,span')).find(e => (e.textContent || '').trim().toLowerCase() === 'kartlager'); return el && el.parentElement && el.parentElement.parentElement; }
    if (/karta|kartan|map/.test(q)) return document.querySelector('.leaflet-container');
    return null;
  }
  highlight(name, label) {
    const el = this.hlTarget(name); if (!el) return false;
    const r = el.getBoundingClientRect(); if (!r.width) return false;
    const old = document.getElementById('nsva-hl'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'nsva-hl';
    d.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;left:' + (r.left - 6) + 'px;top:' + (r.top - 6) + 'px;width:' + (r.width + 12) + 'px;height:' + (r.height + 12) + 'px;border-radius:16px;border:2px solid #35d6f2;box-shadow:0 0 0 4000px rgba(2,7,9,.45),0 0 28px rgba(53,214,242,.75);transition:all .3s ease';
    if (label) { const t = document.createElement('div'); t.textContent = label; t.style.cssText = 'position:absolute;left:10px;top:-34px;padding:5px 12px;border-radius:9px;background:#06141d;border:1px solid #35d6f2;color:#eaf7fb;font:600 13px "Chakra Petch",sans-serif;letter-spacing:.06em;white-space:nowrap'; d.appendChild(t); }
    document.body.appendChild(d);
    clearTimeout(this._hlT); this._hlT = setTimeout(() => { const x = document.getElementById('nsva-hl'); if (x) x.remove(); }, 9000);
    return true;
  }
  clearHighlight() { clearTimeout(this._hlT); const x = document.getElementById('nsva-hl'); if (x) x.remove(); }
  screenState() {
    const s = this.state, f = s.filters || {};
    return {
      vy: s.view ? this.viewDefs()[s.view].title : 'startmeny',
      öppen_widget: s.openWidget ? this.widgetLabel(s.openWidget) : null,
      widget_kommun: s.openWidgetMuni ? this.muniName(s.openWidgetMuni) : null,
      vald_kommun: s.selected ? this.muniName(s.selected) : null,
      station: s.selected && s.selFac != null ? ((this.facilitiesFor(this.baseMunis().find(m => m.id === s.selected))[s.selFac]) || {}).name : null,
      inställningar: s.settingsOpen ? (s.settingsTab === 'info' ? 'Datakällor & metod · ' + s.infoTopic : 'Widgets') : 'stängda',
      reglage_timme: s.skyfallHour || 0, kartversion: s.skyfallMode === 'rp' ? 'V1' : 'V2',
      kartlager: Object.keys(f).filter(k => f[k]),
      zoom: this.map ? this.map.getZoom() : null,
      synliga_widgets: this.allWidgets().filter(id => (s.view && this.viewDefs()[s.view].cols ? this.viewCol(id) : this.colOf(id)) !== null).map(id => this.widgetLabel(id)),
    };
  }
  // Tour adapts to where the user stands: inside a view it walks through THAT view and its visible widgets
  widgetTourText(id) {
    return ({
      radar: 'Väderradarn visar nederbörden live med radarsvep och vindriktning. Den uppdateras automatiskt.',
      prognos: 'Prognosen visar regnet tolv timmar bakåt, uppmätt, och tolv timmar framåt från SMHI.',
      hav: 'Havsvattenståndet mäts vid Viken, Barsebäck och Klagshamn. Högt hav gör att dagvatten har svårare att rinna ut.',
      anmal: 'Här kommer anmälningar från allmänheten om översvämningar, med adress och status.',
      matare: 'Regnmätarna visar uppmätt regn från SMHI, Försvarsmakten och DMI, med den blötaste mätaren först. Tryck på en mätare för all data.',
      ai: 'AI-notiserna varnar i förväg, till exempel risk för översvämning när kraftigt regn är på väg.',
      alarm: 'Aktiva larm från driften, sorterade efter hur allvarliga de är.',
      dricks: 'Dricksvatten: produktion, tryck och kvalitet per kommun.',
      spill: 'Spillvatten: inflöde till reningsverken, pumpnivåer och risk för bräddning.',
      dag: 'Dagvatten: flöden och fyllnadsgrad i magasinen.',
      flode: 'Flödesmätarna visar volym per timme i ledningsnät och pumpstationer.',
    })[id] || ('Widgeten ' + this.widgetLabel(id) + '.');
  }
  tourSteps() {
    const v = this.state.view;
    if (v) {
      const def = this.viewDefs()[v] || {};
      const steps = [];
      steps.push({ titel: v === 'visky' ? 'Skyfallsvyn' : v === 'prod' ? 'Produktion' : 'Kontrollcenter', gör: () => { this.closeAllUi(); }, visa: 'karta', text: v === 'visky' ? 'Det här är Skyfallsvyn. Kartan visar nordvästra Skåne med NSVA:s åtta kommuner, och färgerna är nederbörden från radar, regnmätare och SMHI.' : 'Kartan visar NSVA:s åtta kommuner. Trycker man på en kommun zoomar kartan in.' });
      if (!def.filters || def.filters.includes('skyfall')) {
        steps.push({ titel: 'Tidsreglaget', gör: () => { this.setState(s => ({ filters: Object.assign({}, s.filters, { skyfall: true }), skyfallScan: false, skyfallHour: 3 })); setTimeout(() => { try { this.applyMapFilters(); } catch (e) {} }, 80); }, visa: 'reglage', text: 'Med reglaget går man från tolv timmar bakåt, uppmätt regn, till tolv timmar framåt, prognos. Färgskalan visar millimeter per timme, och violett betyder återkomstregn.' });
        steps.push({ titel: 'Varningar', gör: () => { this.setState({ skyfallHour: 0 }); setTimeout(() => { try { this.applyMapFilters(); } catch (e) {} }, 80); }, visa: 'karta', text: 'Kommer kraftigt regn eller skyfall, nu eller inom tolv timmar, blinkar en varning högst upp på kartan.' });
      }
      steps.push({ titel: 'Live-status', gör: () => {}, visa: 'live', text: 'Raden under rubriken visar att allt är live: radar, SMHI, regnmätare och havsvattenstånd uppdateras automatiskt.' });
      steps.push({ titel: 'Kartlager', gör: () => {}, visa: 'kartlager', text: 'I kartlagret slår man på skyfall, vind, regnmätare, radartäckning och anmälningar från allmänheten.' });
      const vis = this.allWidgets().filter(id => (def.cols ? this.viewCol(id) : this.colOf(id)) !== null);
      vis.forEach(id => steps.push({ titel: this.widgetLabel(id), gör: () => { this.closeWidgetDetail(); }, visa: id, text: this.widgetTourText(id) }));
      if (vis.includes('hav')) steps.push({ titel: 'Detaljvy', gör: () => { this.openWidgetDetail('hav'); }, visa: null, text: 'Trycker man på en widget öppnas en detaljvy med historik och fler siffror, här havsvattenståndet.' });
      steps.push({ titel: 'Inställningar', gör: () => { this.closeWidgetDetail(); this.setState({ settingsOpen: true, settingsTab: 'widgets' }); }, visa: null, text: 'I inställningarna väljer man vilka widgets som ska synas, även widgets från Kontrollcentret, byter utseende och slår på helskärm.' });
      steps.push({ titel: 'Datakällor och metod', gör: () => { this.setState({ settingsOpen: true, settingsTab: 'info', infoTopic: 'korrektion' }); }, visa: null, text: 'Här förklaras varje datakälla och hur regnmätare, radar och SMHI korrigerar varandra.' });
      steps.push({ titel: 'MR. Hydra', gör: () => { this.closeAllUi(); }, visa: 'chatt', text: 'Och här finns jag. Fråga om läget eller be mig visa något, med rösten eller i text.' });
      return steps;
    }
    return [
      { titel: 'Startmenyn', gör: () => { this.closeAllUi(); this.setState({ view: null }); }, visa: 'meny', text: 'Här väljer man vy: Kontrollcenter för hela verksamheten, Skyfall för nederbörd och Produktion för dricksvatten.' },
      { titel: 'Skyfallsvyn', gör: () => { this.closeAllUi(); this.setView('visky'); }, visa: 'karta', text: 'Kartan visar nordvästra Skåne med NSVA:s åtta kommuner. Färgerna är nederbörden just nu från radar, regnmätare och SMHI.' },
      { titel: 'Tidsreglaget', gör: () => { this.setState(s => ({ filters: Object.assign({}, s.filters, { skyfall: true }), skyfallScan: false, skyfallHour: 3 })); setTimeout(() => { try { this.applyMapFilters(); } catch (e) {} }, 80); }, visa: 'reglage', text: 'Med reglaget går man från tolv timmar bakåt, uppmätt regn, till tolv timmar framåt, prognos. Färgskalan visar millimeter per timme, och violett betyder återkomstregn.' },
      { titel: 'Live-status', gör: () => { this.setState({ skyfallHour: 0 }); setTimeout(() => { try { this.applyMapFilters(); } catch (e) {} }, 80); }, visa: 'live', text: 'Här syns att allt är live: radar, SMHI, regnmätare och havsvattenstånd uppdateras automatiskt.' },
      { titel: 'Kartlager', gör: () => {}, visa: 'kartlager', text: 'I kartlagret slår man på skyfall, vind och anmälningar från allmänheten.' },
      { titel: 'Prognoser', gör: () => {}, visa: 'prognoser', text: 'Prognos-widgeten visar regnet tolv timmar bakåt och framåt i ett diagram.' },
      { titel: 'Havsvattenstånd', gör: () => { this.openWidgetDetail('hav'); }, visa: null, text: 'Havsvattenståndet mäts vid Viken, Barsebäck och Klagshamn. Högt hav gör att dagvatten har svårare att rinna ut.' },
      { titel: 'En kommun', gör: () => { this.closeWidgetDetail(); this.setView('hydra'); setTimeout(() => this.selectMuni('helsingborg'), 150); }, visa: 'karta', text: 'Trycker man på en kommun zoomar kartan in och visar anläggningarna: vattenverk, reningsverk, pumpstationer och reservoarer.' },
      { titel: 'En anläggning', gör: () => { this.selectFac(0); }, visa: 'karta', text: 'På stationsnivå syns produktion, flöden, nivåer, drifttid och larm för just den anläggningen.' },
      { titel: 'Inställningar', gör: () => { this.backFac(); this.back(); this.setState({ settingsOpen: true, settingsTab: 'widgets' }); }, visa: null, text: 'I inställningarna väljer man vilka widgets som ska synas, byter utseende och slår på helskärm.' },
      { titel: 'Datakällor och metod', gör: () => { this.setState({ settingsOpen: true, settingsTab: 'info', infoTopic: 'korrektion' }); }, visa: null, text: 'Här förklaras varje datakälla och hur regnmätare, radar och SMHI korrigerar varandra.' },
      { titel: 'MR. Hydra', gör: () => { this.closeAllUi(); }, visa: 'chatt', text: 'Och här finns jag. Fråga om läget eller be mig visa något, med rösten eller i text.' },
    ];
  }
  closeAllUi() { this.clearHighlight(); this.setState({ rpInfoOpen: false, settingsOpen: false, openWidget: null, openWidgetMuni: null, selFac: null, selected: null }); }
  // ---- Everything the agent needs to judge the rain situation (Hydra's own calculation — the agent only interprets) ----
  rainOutlook() {
    const sw = this.skyfallWarning();
    const pg = this.prognos();
    const box = b => b && b.on ? { nivå: b.level, rubrik: b.txt, detaljer: b.sub, om_timmar: b.hour || 0, kommun: b.cell && b.cell.muni ? b.cell.muni.name : null } : null;
    const perMuni = this.baseMunis().map(m => {
      const o = this.skyfallOutlook(m.id); if (!o) return null;
      const b = o.best;
      return { kommun: m.name, värsta_klass: b.lvl, återkomsttid: b.yearsTxt || null, mängd_mm: Math.round((b.yearsAmt != null ? b.yearsAmt : b.amt) * 10) / 10, varaktighet_h: b.yearsPeriod || b.period, startar_om_h: b.startH, max_mm_per_h: Math.round((o.peak1 || 0) * 10) / 10, toppen_om_h: o.peakH };
    }).filter(Boolean).filter(x => x.värsta_klass >= 3 || x.max_mm_per_h >= 1);
    const sea = this.seaLevel();
    const sm = this.smhiWarnView ? this.smhiWarnView() : null;
    return {
      tid: new Date().toLocaleString('sv-SE'),
      datakälla: this.weather ? 'live (mätare + radar + SMHI-prognos)' : 'simulerad',
      varning_nu: box(sw.now), varning_framåt: box(sw.ahead),
      ackumulerat: { start: pg.accStartTxt, sedan_start: pg.accNowTxt, varaktighet: pg.accDurTxt, till_plus_12h: pg.accEndTxt, återkomst_hittills: pg.rpPastTxt, återkomst_prognos: pg.rpFutTxt,
        per_varaktighet: (pg.accRows || []).map(r => ({ varaktighet: r.name, hittills: r.c1, max_i_prognos: r.c2, gräns_2år_10år: r.c3 })) },
      berörda_kommuner: perMuni,
      havsvattenstånd: sea.stations.map(s => ({ station: s.name, kommun: s.kommun, nu_cm: s.now, max_prognos_cm: s.peak, om_h: s.peakH })),
      smhi_varningar: sm && sm.list ? sm.list.map(w => ({ nivå: w.levelTxt || w.level, händelse: w.event, kommuner: w.kommuner })) : [],
      metod: 'Återkomsttid enligt Dahlström 2010 (P110). Kraftigt regn ≥ 2 mm/h, skyfall ≥ 10 mm/h eller ≥ 2-årsregn. Ingen klimatfaktor.',
    };
  }
  // ---- Regnmätare for the agent: same values as the widget and the detail view ----
  gaugeList() { return (this.rainHistStations || []).filter(g => g && g.vals); }
  gaugeFacts(g) {
    const r1 = v => v == null ? null : Math.round(v * 10) / 10;
    const vals = (g.vals || []).slice(-24);
    const sum = n => { const s = vals.slice(-n).filter(v => v.mm != null); return s.length ? s.reduce((a, v) => a + v.mm, 0) : null; };
    const last = vals.length ? vals[vals.length - 1] : null;
    const munis = this.baseMunis();
    let near = null, nd = Infinity; munis.forEach(m => { const d = this.kmDist(g.lat, g.lng, m.lat, m.lng); if (d < nd) { nd = d; near = m; } });
    let rp = { år: 0, varaktighet_h: null };
    // rolling windows over the last 24 h, not only the windows ending now
    [1, 3, 6, 12].forEach(d => { for (let e = d - 1; e < vals.length; e++) { let a = 0, n = 0; for (let k = e - d + 1; k <= e; k++) if (vals[k].mm != null) { a += vals[k].mm; n++; } if (!n) continue; const y = this.dahlYears(a, d * 60); if (y > rp.år) rp = { år: Math.round(y * 10) / 10, varaktighet_h: d, slutade: new Date(vals[e].t).toLocaleString('sv-SE') }; } });
    const mx = vals.reduce((a, v) => (v.mm != null && v.mm > a.mm ? v : a), { mm: -1 });
    return {
      namn: g.name, källa: { SMHI: 'SMHI', FM: 'Försvarsmakten (via SMHI)', DMI: 'DMI', SIM: 'Simulerad' }[g.src] || g.src,
      närmaste_kommun: near ? near.name : null, avstånd_km: near ? Math.round(nd) : null,
      senaste_timmen_mm: last ? r1(last.mm) : null, senaste_rapport: last ? new Date(last.t).toLocaleString('sv-SE') : null,
      summa_mm: { '3h': r1(sum(3)), '6h': r1(sum(6)), '12h': r1(sum(12)), '24h': r1(sum(24)) },
      blötaste_timmen: mx.mm >= 0 ? { mm: r1(mx.mm), tid: new Date(mx.t).toLocaleString('sv-SE') } : null,
      saknade_timmar_24h: vals.filter(v => v.mm == null).length,
      högsta_återkomsttid_24h: rp.år >= 0.5 ? rp : 'under 0,5 år (Dahlström 2010)',
    };
  }
  gaugesSnapshot() {
    const list = this.gaugeList().map(g => this.gaugeFacts(g));
    list.sort((a, b) => (b.summa_mm['24h'] || 0) - (a.summa_mm['24h'] || 0));
    return { antal: list.length, tid: new Date().toLocaleString('sv-SE'), metod: 'Återkomsttid enligt Dahlström 2010 på mätarens egna timvärden.', mätare: list };
  }
  // full history for one gauge (SMHI/FM: ~4 months hourly), also opens the gauge's detail view on screen
  async gaugeDetailSnapshot(name, days) {
    const q = String(name || '').toLowerCase().trim();
    const all = this.gaugeList();
    const g = all.find(x => x.name.toLowerCase() === q) || all.find(x => x.name.toLowerCase().indexOf(q) >= 0) || all.find(x => q.indexOf(x.name.toLowerCase().split(' ')[0]) >= 0);
    if (!g) return { fel: 'Hittar ingen regnmätare som heter "' + name + '"', finns: all.map(x => x.name) };
    try { this.openGauge(g); } catch (e) {}
    const out = this.gaugeFacts(g);
    const D = Math.max(1, Math.min(120, Math.round(Number(days) || 7)));
    let series = null;
    if ((g.src === 'SMHI' || g.src === 'FM') && g.id && typeof fetch !== 'undefined') {
      try { const r = await fetch('/smhi-metobs/api/version/1.0/parameter/7/station/' + g.id + '/period/latest-months/data.json'); if (r.ok) { const j = await r.json(); series = (j.value || []).map(v => ({ t: Number(v.date), mm: v.value == null || v.value === '' ? null : parseFloat(v.value) })).filter(v => v.mm == null || (v.mm >= 0 && v.mm < 150)); } } catch (e) {}
    }
    if (!series) { out.historik = 'Bara senaste dygnet finns för den här mätaren.'; return out; }
    const from = Date.now() - D * 86400000;
    const s = series.filter(v => v.t >= from);
    const byDay = {};
    s.forEach(v => { const d = new Date(v.t).toLocaleDateString('sv-SE'); (byDay[d] = byDay[d] || []).push(v); });
    const r1 = v => Math.round(v * 10) / 10;
    // worst return period per day (rolling 1/3/6/12 h within the series)
    const rpAt = (i) => { let best = 0, bd = null; [1, 3, 6, 12].forEach(d => { let a = 0, n = 0; for (let k = Math.max(0, i - d + 1); k <= i; k++) if (s[k] && s[k].mm != null) { a += s[k].mm; n++; } if (!n) return; const y = this.dahlYears(a, d * 60); if (y > best) { best = y; bd = d; } }); return { y: best, d: bd }; };
    const dayRows = Object.keys(byDay).map(d => {
      const arr = byDay[d]; const vals = arr.filter(v => v.mm != null);
      let worst = { y: 0, d: null }; arr.forEach(v => { const r = rpAt(s.indexOf(v)); if (r.y > worst.y) worst = r; });
      const mx = vals.reduce((a, v) => v.mm > a ? v.mm : a, 0);
      return { datum: d, summa_mm: r1(vals.reduce((a, v) => a + v.mm, 0)), max_timme_mm: r1(mx), saknade_timmar: arr.length - vals.length,
        återkomsttid: worst.y >= 0.5 ? r1(worst.y) + ' år (' + worst.d + ' h)' : '–' };
    });
    out.historik = { dagar: D, från: new Date(from).toLocaleDateString('sv-SE'), summa_mm: r1(s.filter(v => v.mm != null).reduce((a, v) => a + v.mm, 0)),
      återkomstregn: dayRows.filter(r => r.återkomsttid !== '–').length, per_dag: dayRows };
    return out;
  }
  // ---- MR. Hydra rekommenderar: when the warning level rises, ask the agent (text-only, silent) for a recommendation ----
  adviceKey() {
    const sw = this.skyfallWarning();
    const k = b => b && b.on ? b.level + '@' + (b.cell && b.cell.muni ? b.cell.muni.id : '') : '';
    return (k(sw.now) || '-') + '|' + (k(sw.ahead) || '-');
  }
  async maybeAdvise() {
    if (!this.agentId() || !this.weather) return;
    const key = this.adviceKey();
    if (key === '-|-') { if (this.agentAdvice) { this.agentAdvice = null; this.setState(s => ({ tick: s.tick })); } this._advKey = key; return; }
    if (key === this._advKey || this._advBusy) return;
    const now = Date.now();
    this._advLog = (this._advLog || []).filter(t => now - t < 3600000);
    if (this._advLog.length >= 4 || (this._advLast && now - this._advLast < 10 * 60000)) return; // max 4/h, ≥ 10 min apart
    this._advBusy = true; this._advKey = key; this._advLast = now; this._advLog.push(now);
    let conv = null, done = false;
    try {
      const sdk = await this.loadElevenSdk();
      const outlook = this.rainOutlook();
      const reply = await new Promise((resolve) => {
        const to = setTimeout(() => resolve(null), 45000);
        sdk.Conversation.startSession({
          agentId: this.agentId(), connectionType: 'websocket', overrides: { conversation: { textOnly: true } },
          clientTools: { getRainOutlook: async () => JSON.stringify(outlook) },
          onConnect: () => {
            const prompt = 'AUTOMATISK DRIFTANALYS (ingen användare lyssnar, svara bara med text). Hydra har höjt nederbördsvarningen. Läget: ' + JSON.stringify(outlook) +
              ' Ge en kort rekommendation till driften på svenska, max 3 meningar: vad som väntas, var och när, och vilka åtgärder som bör övervägas enligt kunskapsbasen. Ändra inte siffrorna och använd inga verktyg som styr skärmen.';
            setTimeout(() => { try { conv && conv.sendUserMessage(prompt); } catch (e) {} }, 400);
          },
          onMessage: (m) => { const t = m && (m.message || m.text); if (!t || m.source === 'user' || done) return; done = true; clearTimeout(to); resolve(t); },
          onError: () => { clearTimeout(to); resolve(null); },
        }).then(c => { conv = c; }).catch(() => { clearTimeout(to); resolve(null); });
      });
      if (reply) {
        const sw = this.skyfallWarning(); const b = sw.now && sw.now.on ? sw.now : sw.ahead;
        this.agentAdvice = { text: this.clean(reply), at: now, key, level: b.level, muni: b.cell && b.cell.muni ? b.cell.muni.id : 'helsingborg', eta: b.hour ? 'om ' + b.hour + ' h' : 'nu', title: b.txt };
        this.setState(s => ({ tick: s.tick }));
      }
    } catch (e) {}
    try { conv && conv.endSession(); } catch (e) {}
    this._advBusy = false;
  }
  agentToolsRaw() {
    const J = o => JSON.stringify(o);
    const clampH = h => Math.max(-12, Math.min(12, Math.round(Number(h) || 0)));
    return {
      // --- read the live situation ---
      getDashboardState: async () => J(this.dashboardSnapshot()),
      getMunicipality: async (p) => { const id = this.muniFromText((p && (p.kommun || p.name)) || ''); return J(this.municipalitySnapshot(id) || { fel: 'okänd kommun' }); },
      getWeather: async () => J(this.weatherSnapshot()),
      getRainOutlook: async () => J(this.rainOutlook()),
      getRainGauges: async () => J(this.gaugesSnapshot()),
      getGaugeDetail: async (p) => J(await this.gaugeDetailSnapshot((p && (p.namn || p.name || p.station)) || '', p && (p.dagar || p.days))),
      getRainForecast: async () => {
        const rows = [];
        for (let h = -12; h <= 12; h++) rows.push({ timme: h, max_mm_h: Math.round(this.peakRainAt(h) * 10) / 10 });
        let warn = null; try { warn = this.skyfallWarning ? this.skyfallWarning() : null; } catch (e) {}
        return J({ förklaring: 'timme 0 = nu, negativa = uppmätt historik, positiva = prognos', timmar: rows, skyfallsvarning: warn });
      },
      getAlarms: async () => J(this.currentAlarms().map(a => ({ allvar: a.sev, kommun: this.muniName(a.muni), text: a.msg, tid: a.time }))),
      // --- steer the dashboard ---
      openWidget: async (p) => { const id = this.resolveWidget((p && (p.widget || p.name)) || ''); if (!id) return 'Okänd widget. Giltiga: ' + this.allWidgets().map(w => this.widgetLabel(w)).join(', '); this.setState({ settingsOpen: false, selected: null, selFac: null }); this.openWidgetDetail(id); return 'Öppnade ' + this.widgetLabel(id); },
      closeWidget: async () => { this.closeWidgetDetail(); return 'Stängde detaljvyn'; },
      setView: async (p) => {
        const s = String((p && (p.vy || p.view || p.name)) || '').toLowerCase();
        const v = /skyfall|visky|regn|nederb/.test(s) ? 'visky' : /prod|dricks|flöd|flod/.test(s) ? 'prod' : /meny|start/.test(s) ? null : 'hydra';
        if (v === null) { this.setState({ view: null }); return 'Visar startmenyn'; }
        this.setView(v); return 'Visar ' + this.viewDefs()[v].title;
      },
      setForecastHour: async (p) => {
        const h = clampH(p && (p.timmar != null ? p.timmar : p.hours));
        if (!this.state.view) this.setView('visky');
        this.setState(s => ({ filters: Object.assign({}, s.filters, { skyfall: true }), skyfallScan: false, skyfallHour: h }));
        setTimeout(() => { try { this.applyMapFilters(); } catch (e) {} }, 80);
        const mm = Math.round(this.peakRainAt(h) * 10) / 10;
        return (h === 0 ? 'Visar nuläget' : h > 0 ? 'Visar prognosen om ' + h + ' timmar' : 'Visar uppmätt regn för ' + (-h) + ' timmar sedan') + '. Max ' + String(mm).replace('.', ',') + ' mm/h.';
      },
      toggleLayer: async (p) => {
        const s = String((p && (p.lager || p.layer)) || '').toLowerCase();
        const key = /skyfall|regn|nederb|radar/.test(s) ? 'skyfall' : /vind/.test(s) ? 'vind' : /anmäl|anmal/.test(s) ? 'anmal' : /larm|alarm/.test(s) ? 'alarm' : null;
        if (!key) return 'Okänt kartlager';
        const want = p && p.on != null ? !!p.on : !this.state.filters[key];
        if (key === 'skyfall') { this.setState(s => ({ filters: Object.assign({}, s.filters, { skyfall: want }), skyfallScan: false })); setTimeout(() => { try { this.applyMapFilters(); } catch (e) {} }, 80); }
        else if (this.state.filters[key] !== want) this.toggleFilter(key);
        return (want ? 'Visar ' : 'Döljer ') + key;
      },
      drillTo: async (p) => { const id = this.muniFromText((p && (p.kommun || p.name)) || ''); if (!id) return 'Okänd kommun'; this.selectMuni(id); return 'Visar ' + this.muniName(id); },
      // "Gå tillbaka": one step back, innermost first
      goBack: async () => {
        const s = this.state;
        if (s.rpInfoOpen) { this.setState({ rpInfoOpen: false }); return 'Stängde förklaringen'; }
        if (s.settingsOpen) { this.setState({ settingsOpen: false }); return 'Stängde inställningarna'; }
        if (s.openWidget && s.openWidgetMuni) { this.setState({ openWidgetMuni: null }); return 'Tillbaka till ' + this.widgetLabel(s.openWidget); }
        if (s.openWidget) { this.closeWidgetDetail(); return 'Stängde ' + this.widgetLabel(s.openWidget); }
        if (s.selFac != null) { this.backFac(); return 'Tillbaka till kommunen'; }
        if (s.selected) { this.back(); return 'Tillbaka till översikten'; }
        if (s.view) { this.setState({ view: null, settingsOpen: false, openWidget: null }); return 'Visar startmenyn'; }
        return 'Redan på startmenyn';
      },
      // "Stäng ner": close every overlay at once
      closeAll: async () => { this.setState({ rpInfoOpen: false, settingsOpen: false, openWidget: null, openWidgetMuni: null, selFac: null, chatOpen: false }); return 'Stängde allt'; },
      openSettings: async (p) => {
        const s = String((p && (p.flik || p.tab)) || '').toLowerCase();
        this.setState({ settingsOpen: true, settingsTab: /info|data|metod|källa|kalla/.test(s) ? 'info' : 'widgets' });
        return 'Öppnade inställningarna';
      },
      // "Öppna info om återkomsttid" → Inställningar · Datakällor & metod · rätt ämne
      openInfo: async (p) => {
        const s = String((p && (p.amne || p['ämne'] || p.topic || p.name)) || '').toLowerCase();
        const t = /återkomst|aterkomst|årsregn|arsregn/.test(s) ? 'aterkomst' : /korrek|rätta|ratta|korrel/.test(s) ? 'korrektion' : /radar/.test(s) ? 'radar' : /mätare|matare|regnmät/.test(s) ? 'matare' : /prognos|smhi/.test(s) ? 'prognos' : /hav|vattenstånd/.test(s) ? 'hav' : /status|live/.test(s) ? 'status' : 'oversikt';
        this.setState({ settingsOpen: true, settingsTab: 'info', infoTopic: t, openWidget: null });
        return 'Visar förklaringen om ' + (this.infoTopics().find(x => x.id === t) || {}).label;
      },
      showScaleInfo: async () => { this.setState({ rpInfoOpen: true }); return 'Visar hur färgskalan och återkomsttiden räknas'; },
      setMapVersion: async (p) => { const v = String((p && (p.version || p.v)) || '2'); const rp = /1|v1|återkomst/.test(v.toLowerCase()); this.setState({ skyfallMode: rp ? 'rp' : 'int' }); setTimeout(() => { try { this.applyMapFilters(); } catch (e) {} }, 60); return 'Kartversion ' + (rp ? 'V1' : 'V2'); },
      setDesign: async (p) => { const n = String((p && (p.design || p.n)) || '1').indexOf('2') >= 0 ? 2 : 1; try { localStorage.setItem('nsva_design', String(n)); } catch (e) {} this.setState({ design: n }); return 'Design ' + n; },
      showWidget: async (p) => {
        const id = this.resolveWidget((p && (p.widget || p.name)) || ''); if (!id) return 'Okänd widget';
        const want = p && p.on != null ? !!p.on : true;
        const vis = this.state.view && this.viewDefs()[this.state.view].cols ? this.viewCol(id) !== null : this.colOf(id) !== null;
        if (vis !== want) this.toggleWidget(id);
        return (want ? 'Visar ' : 'Döljer ') + this.widgetLabel(id);
      },
      openStation: async (p) => {
        const mid = this.state.selected || this.muniFromText((p && p.kommun) || ''); if (!mid) return 'Välj en kommun först';
        if (!this.state.selected) this.selectMuni(mid);
        const m = this.baseMunis().find(x => x.id === mid), q = String((p && (p.station || p.name)) || '').toLowerCase();
        const facs = this.facilitiesFor(m);
        let idx = facs.findIndex(f => f.name.toLowerCase().indexOf(q) >= 0 || f.type.toLowerCase().indexOf(q) >= 0);
        if (idx < 0) idx = /renings|arv|avlopp/.test(q) ? facs.findIndex(f => f.type === 'Reningsverk') : /pump/.test(q) ? facs.findIndex(f => f.type === 'Pumpstation') : /reserv|torn/.test(q) ? facs.findIndex(f => f.type === 'Reservoar') : facs.findIndex(f => f.type === 'Vattenverk');
        if (idx < 0) return 'Hittade ingen sådan anläggning';
        setTimeout(() => this.selectFac(idx), 50);
        return 'Visar ' + facs[idx].name;
      },
      openWidgetForMunicipality: async (p) => {
        const id = this.resolveWidget((p && p.widget) || ''), mid = this.muniFromText((p && p.kommun) || '');
        if (!id || !mid) return 'Ange widget och kommun';
        this.setState({ openWidget: id, openWidgetMuni: mid });
        return this.widgetLabel(id) + ' i ' + this.muniName(mid);
      },
      // fallback: press any visible button/tab/card by its text
      pressButton: async (p) => {
        const q = String((p && (p.text || p.name)) || '').trim().toLowerCase(); if (!q) return 'Ingen text angiven';
        // only elements that carry their OWN click handler (React props), not children inheriting cursor:pointer
        const hasClick = el => { const k = Object.keys(el).find(x => x.indexOf('__reactProps') === 0); return !!(k && el[k] && el[k].onClick); };
        const owner = el => { let e = el; for (let i = 0; i < 3 && e; i++, e = e.parentElement) if (hasClick(e)) return e; return null; };
        const seen = new Set(), cands = [];
        Array.from(document.querySelectorAll('div,span,button,a')).forEach(el => {
          const t = (el.textContent || '').trim().toLowerCase(); if (!t || t.length > 60 || t.indexOf(q) < 0) return;
          const o = owner(el); if (!o || seen.has(o)) return;
          const r = o.getBoundingClientRect(); if (!r.width || !r.height) return;
          const ot = (o.textContent || '').trim().toLowerCase();
          seen.add(o); cands.push({ o, exact: ot === q || t === q, area: r.width * r.height });
        });
        cands.sort((a, b) => (b.exact - a.exact) || (a.area - b.area));
        if (!cands.length) return 'Hittade ingen knapp med texten "' + q + '"';
        cands[0].o.click(); return 'Tryckte på "' + cands[0].o.textContent.trim().slice(0, 40) + '"';
      },
      toggleFullscreen: async () => { this.toggleFullscreen(); return this.isFullscreen() ? 'Avslutar helskärm' : 'Försöker visa helskärm (webbläsaren kan kräva ett tryck på skärmen)'; },
      // --- map ---
      zoomMap: async (p) => {
        const mp = this.state.selected && this.detailMap ? this.detailMap : this.map;
        if (!mp) return 'Kartan är inte laddad';
        const s = String(p.riktning || p.direction || '').toLowerCase();
        if (/åter|ater|hela|alla|reset|översikt|oversikt/.test(s)) {
          if (this.state.selected) { this.back(); return 'Tillbaka till hela området'; }
          mp.fitBounds(this.baseMunis().map(m => [m.lat, m.lng]), { paddingTopLeft: [110, 100], paddingBottomRight: [110, 190] }); return 'Visar hela området';
        }
        if (/ut|out|-/.test(s)) { mp.zoomOut(); return 'Zoomade ut'; }
        mp.zoomIn(); return 'Zoomade in';
      },
      // --- what is on screen right now ---
      getScreenState: async () => J(this.screenState()),
      // --- point at a part of the screen (tours, explanations) ---
      highlight: async (p) => { const ok = this.highlight(p.del || p.target || p.name, p.etikett || p.label); return ok ? 'Markerade ' + (p.del || p.target) : 'Hittade inte den delen på skärmen'; },
      clearHighlight: async () => { this.clearHighlight(); return 'Tog bort markeringen'; },
      // --- guided tour: the agent calls step 1, 2, 3 … and narrates the returned text ---
      tourStep: async (p) => {
        const steps = this.tourSteps(); const n = Math.max(1, Math.min(steps.length, Math.round(Number(p.steg || p.step || 1))));
        const st = steps[n - 1];
        try { st.gör(); } catch (e) {}
        setTimeout(() => { if (st.visa) this.highlight(st.visa, st.titel); else this.clearHighlight(); }, 450);
        return J({ steg: n, totalt: steps.length, titel: st.titel, berätta: st.text, nästa: n < steps.length ? 'Säg texten, vänta kort och anropa tourStep med steg ' + (n + 1) + '. Fråga gärna om användaren vill fortsätta.' : 'Genomgången är klar. Fråga om något var oklart.' });
      },
      endTour: async () => { this.closeAllUi(); return 'Avslutade genomgången'; },
      // --- reports scope + forecast animation ---
      setReportsScope: async (p) => { const all = /all|histor|alla/.test(String(p.urval || p.scope || '').toLowerCase()); this.setState(s => ({ anmalScope: all ? 'all' : 'active', filters: Object.assign({}, s.filters, { anmal: true }) })); setTimeout(() => { try { this.applyMapFilters(); } catch (e) {} }, 60); return all ? 'Visar alla anmälningar' : 'Visar aktuella anmälningar'; },
      playForecast: async (p) => {
        const from = Math.max(-12, Math.min(12, Number(p.fran != null ? p.fran : 0))), to = Math.max(-12, Math.min(12, Number(p.till != null ? p.till : 12)));
        if (!this.state.view) this.setView('visky');
        this.setState(s => ({ filters: Object.assign({}, s.filters, { skyfall: true }), skyfallScan: false }));
        clearInterval(this._playT); let h = from; const step = to >= from ? 1 : -1;
        const go = () => { this.setState({ skyfallHour: h }); try { this.applyMapFilters(); } catch (e) {} if (h === to) { clearInterval(this._playT); return; } h += step; };
        go(); this._playT = setInterval(go, 1200);
        return 'Spelar upp regnet från ' + from + ' till ' + to + ' timmar';
      },
    };
  }
  // Zero-setup navigation: understand common commands locally from what the user says/writes,
  // so no client tools have to be registered in ElevenLabs. Returns a short confirmation or null.
  async localCommand(text) {
    const q = String(text || '').toLowerCase().trim(); if (!q) return null;
    const T = this.agentTools();
    const num = (() => { const m = q.match(/(-?\d+)\s*(h|tim)/) || q.match(/(\d+)/); if (!m) { const w = { en: 1, ett: 1, två: 2, tva: 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7, åtta: 8, atta: 8, nio: 9, tio: 10, elva: 11, tolv: 12 }; for (const k in w) if (new RegExp('\\b' + k + '\\b').test(q)) return w[k]; return null; } return parseInt(m[1], 10); })();
    const past = /sedan|bakåt|bakat|tidigare|för .* sedan|regnade/.test(q);
    if (/^(gå |ga )?tillbaka|backa|ett steg tillbaka/.test(q)) return T.goBack();
    if (/zooma ut|zoom ut/.test(q)) return T.zoomMap({ riktning: /hela|allt|helt/.test(q) ? 'hela' : 'ut' });
    if (/zooma in|zoom in/.test(q)) return T.zoomMap({ riktning: 'in' });
    if (/genomgång|genomgang|visa mig verktyget|guida|rundtur/.test(q)) return T.tourStep({ steg: 1 });
    if (/stäng (ner|allt)|stang (ner|allt)|stäng alla|rensa skärmen/.test(q)) return T.closeAll();
    if (/stäng|stang/.test(q) && !/info/.test(q)) return T.closeWidget();
    if (/helskärm|helskarm/.test(q)) return T.toggleFullscreen();
    if (/(info|förklar|forklar|hur räknar|hur raknar|vad är|vad ar).*(återkomst|aterkomst|korrektion|radar|regnmätare|regnmatare|prognos|live)/.test(q)) {
      const m = q.match(/återkomst|aterkomst|korrektion|radar|regnmätare|regnmatare|prognos|live/); return T.openInfo({ amne: m[0] });
    }
    if (/inställning|installning/.test(q)) return T.openSettings({ flik: /info|data/.test(q) ? 'info' : 'widgets' });
    if (/(prognos|regn|nederbörd|nederbord|skyfall).*(om|\+)\s*\S*\s*(timm|tim|h\b)|om \S+ timm/.test(q) && num != null) return T.setForecastHour({ timmar: past ? -Math.abs(num) : Math.abs(num) });
    if (/(timm|tim).*(sedan|bakåt|bakat)/.test(q) && num != null) return T.setForecastHour({ timmar: -Math.abs(num) });
    if (/(visa|regnet|läget|laget) (just )?nu|nuläge|nulage/.test(q) && /regn|skyfall|nederb|läge|lage/.test(q)) return T.setForecastHour({ timmar: 0 });
    if (/version (1|ett|v1)|v1\b/.test(q)) return T.setMapVersion({ version: '1' });
    if (/version (2|två|tva|v2)|v2\b/.test(q)) return T.setMapVersion({ version: '2' });
    if (/design (1|ett)/.test(q)) return T.setDesign({ design: '1' });
    if (/design (2|två|tva)/.test(q)) return T.setDesign({ design: '2' });
    if (/(byt|gå|ga|visa|öppna|oppna).*(skyfallsvy|vyn skyfall|skyfall-vy)|skyfallsvyn/.test(q)) return T.setView({ vy: 'skyfall' });
    if (/(byt|gå|ga|visa|öppna|oppna).*(produktion)/.test(q)) return T.setView({ vy: 'produktion' });
    if (/(kontrollcenter|hydra-vyn|hela vyn)/.test(q)) return T.setView({ vy: 'hydra' });
    if (/startmeny|huvudmeny|till menyn/.test(q)) return T.setView({ vy: 'meny' });
    const layer = q.match(/(vind|anmälningar|anmalningar|larm|skyfall)(lagret| på kartan| pa kartan)?/);
    if (layer && /(visa|slå på|sla pa|dölj|dolj|ta bort|slå av|sla av).*(på kartan|pa kartan|lager|lagret)|kartlager/.test(q)) return T.toggleLayer({ lager: layer[1], on: !/dölj|dolj|ta bort|slå av|sla av/.test(q) });
    if (/(lägg till|lagg till|visa widget)/.test(q)) { const id = this.resolveWidget(q); if (id) return T.showWidget({ widget: q, on: true }); }
    if (/(ta bort|dölj|dolj) (widget|widgeten)/.test(q)) { const id = this.resolveWidget(q); if (id) return T.showWidget({ widget: q, on: false }); }
    const muni = this.muniFromText(q), wid = this.resolveWidget(q);
    if (/öppna|oppna|visa|gå till|ga till|zooma/.test(q)) {
      if (/renings|vattenverk|pumpstation|reservoar|vattentorn|\barv\b/.test(q)) return T.openStation({ station: q, kommun: q });
      if (wid && muni) return T.openWidgetForMunicipality({ widget: q, kommun: q });
      if (wid) return T.openWidget({ widget: q });
      if (muni) return T.drillTo({ kommun: q });
    }
    return null;
  }
  // Compact live situation pushed to the agent as context (no tools needed for answering)
  agentContext() {
    let s = {}; try { s = this.dashboardSnapshot(); } catch (e) {}
    const rain = []; try { for (let h = -6; h <= 12; h += 1) rain.push(h + 'h:' + (Math.round(this.peakRainAt(h) * 10) / 10)); } catch (e) {}
    const view = this.state.view ? this.viewDefs()[this.state.view].title : 'startmeny';
    const ctx = { vy: view, öppen_widget: this.state.openWidget ? this.widgetLabel(this.state.openWidget) : null, vald_kommun: this.state.selected ? this.muniName(this.state.selected) : null, reglage_timme: this.state.skyfallHour || 0, max_regn_mm_h_per_timme: rain.join(' '), läge: s };
    let txt = 'AKTUELLT LÄGE I HYDRA (uppdateras automatiskt, använd detta när du svarar, gissa aldrig): ' + JSON.stringify(ctx);
    if (txt.length > 9000) txt = txt.slice(0, 9000);
    return txt;
  }
  pushAgentContext() { try { if (this._conv && this._conv.sendContextualUpdate) this._conv.sendContextualUpdate(this.agentContext()); } catch (e) {} }
  // ---- Kunskapsbas (same files as the ElevenLabs agent): sent once per session + searchable in Hydra ----
  kbText() { const k = typeof window !== 'undefined' ? window.NSVA_KUNSKAP : null; return k ? (k.skyfall + '\n\n' + k.guide) : ''; }
  pushKnowledge() {
    try {
      if (!this._conv || !this._conv.sendContextualUpdate) return;
      const t = this.kbText(); if (!t) return;
      // split into a few chunks so each contextual update stays small
      const parts = t.split(/\n(?==+\n)/); let buf = '';
      const send = s => this._conv.sendContextualUpdate('HYDRA KUNSKAPSBAS (NSVA beräknar återkomsttid ENBART med Dahlström 2010): ' + s);
      parts.forEach(p => { if ((buf + p).length > 3500) { if (buf) send(buf); buf = p; } else buf += '\n' + p; });
      if (buf) send(buf);
    } catch (e) {}
  }
  kbSections() {
    if (this._kbSec) return this._kbSec;
    // one entry per bullet (with its continuation lines), prefixed with its section heading
    const out = []; let head = '', cur = null;
    const flush = () => { if (cur && cur.length > 30) out.push((head ? head + ': ' : '') + cur); cur = null; };
    this.kbText().split('\n').forEach(line => {
      const l = line.replace(/\s+$/, '');
      if (!l.trim() || /^=+$/.test(l.trim())) { flush(); return; }
      if (/^(\d+\.\s+[A-ZÅÄÖ]|[A-ZÅÄÖ0-9 ,:.()&–-]{6,}$)/.test(l.trim()) && !/^- /.test(l.trim())) { flush(); head = l.trim().replace(/^\d+\.\s*/, ''); return; }
      if (/^- /.test(l.trim())) { flush(); cur = l.trim().slice(2); return; }
      if (cur != null) cur += ' ' + l.trim(); else cur = l.trim();
    });
    flush();
    return (this._kbSec = out);
  }
  kbAnswer(q) {
    const words = String(q || '').toLowerCase().replace(/[^a-zåäö0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 2).map(w => w.length > 7 ? w.slice(0, 7) : w);
    if (!words.length) return null;
    const stop = { vad: 1, hur: 1, inte: 1, finns: 1, ett: 1, och: 1, eller: 1, kan: 1, ska: 1, med: 1, från: 1, för: 1, till: 1, som: 1, det: 1, den: 1, är: 1, ni: 1 };
    const ws = words.filter(w => !stop[w]);
    const has = (txt, w) => w.length <= 3 ? new RegExp('(^|[^a-zåäö])' + w + '([^a-zåäö]|$)').test(txt) : txt.indexOf(w) >= 0;
    const scored = this.kbSections().filter(s => !/MR\. HYDRA|Egen sammanfattning|VIKTIGT:/.test(s)).map(s => {
      const i = s.indexOf(': '); const head = i > 0 ? s.slice(0, i).toLowerCase() : '', body = (i > 0 ? s.slice(i + 2) : s).toLowerCase();
      let sc = 0; ws.forEach(w => { if (has(body, w)) sc += Math.max(4, w.length); if (head && has(head, w)) sc += 2; });
      return { s, sc };
    }).filter(x => x.sc >= (ws.length === 1 ? 4 : 6)).sort((a, b) => b.sc - a.sc);
    if (!scored.length) return null;
    return scored.slice(0, 2).map(x => x.s.replace(/\s+/g, ' ')).join(' ').slice(0, 600);
  }
  async startAgent(voice) {
    const id = this.agentId(); if (!id) throw new Error('inget agent-ID');
    const sdk = await this.loadElevenSdk();
    this.setState({ agentStatus: 'connecting' });
    const opts = {
      agentId: id,
      connectionType: voice ? 'webrtc' : 'websocket',
      clientTools: this.agentTools(),
      onConnect: () => {
        this.setState({ agentStatus: voice ? 'listening' : 'text' });
        setTimeout(() => { this.pushKnowledge(); this.pushAgentContext(); }, 300);
        clearInterval(this._ctxT); this._ctxT = setInterval(() => this.pushAgentContext(), 60000);
      },
      onDisconnect: () => { clearInterval(this._ctxT); this._conv = null; this.setState({ agentStatus: 'off', sending: false }); },
      onError: (err) => this.setState(s => ({ messages: [...s.messages, { role: 'jarvis', text: 'Agentfel: ' + ((err && err.message) || err || 'okänt') }], sending: false })),
      onModeChange: (m) => { if (voice) this.setState({ agentStatus: m && m.mode === 'speaking' ? 'speaking' : 'listening' }); },
      onMessage: (m) => {
        const txt = m && (m.message || m.text); if (!txt) return;
        if (m.source === 'user') {
          if (voice) {
            this.setState(s => ({ messages: [...s.messages, { role: 'user', text: txt }], chatOpen: true }));
            // spoken command → if the agent doesn't act with a tool within ~2 s, act locally (never both)
            const heard = Date.now();
            setTimeout(() => { if ((this._toolAt || 0) >= heard) return; this.localCommand(txt).then(done => { if (done) setTimeout(() => this.pushAgentContext(), 400); }).catch(() => {}); }, 2000);
          }
          return;
        }
        this.setState(s => ({ messages: [...s.messages, { role: 'jarvis', text: this.clean(txt) }], chatOpen: true, sending: false }));
      },
    };
    if (!voice) opts.overrides = { conversation: { textOnly: true } };
    this._conv = await sdk.Conversation.startSession(opts);
    this._convVoice = !!voice;
    return this._conv;
  }
  async stopAgent() {
    const c = this._conv; this._conv = null;
    try { if (c) await c.endSession(); } catch (e) {}
    this.setState({ agentStatus: 'off', sending: false });
  }
  async toggleVoice() {
    if (this._conv && this._convVoice) { await this.stopAgent(); return; }
    if (this._conv) await this.stopAgent(); // switch from text-only to voice
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await this.startAgent(true);
      this.setState({ chatOpen: true });
    } catch (e) {
      this.setState(s => ({ agentStatus: 'off', chatOpen: true, messages: [...s.messages, { role: 'jarvis', text: 'Röstläget kunde inte startas (' + ((e && e.message) || 'mikrofon nekad') + ').' }] }));
    }
  }
  // Text agent (Microsoft Copilot / Copilot Studio). POSTs the question + a live dashboard snapshot to
  // the endpoint in the `copilotEndpoint` prop and expects JSON { reply: "…" } (or plain text) back.
  async askCopilot(t) {
    const endpoint = this.props.copilotEndpoint && String(this.props.copilotEndpoint).trim();
    let ctx = {};
    try { ctx = this.dashboardSnapshot(); } catch (e) {}
    if (endpoint) {
      try {
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 20000);
        const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: t, context: ctx }), signal: ctrl.signal });
        clearTimeout(to);
        if (!r.ok) return 'Copilot-agenten svarade med fel (' + r.status + ').';
        const txt = await r.text();
        try { const j = JSON.parse(txt); return this.clean(j.reply || j.answer || j.text || txt); } catch (e) { return this.clean(txt); }
      } catch (e) { return 'Copilot-agenten kunde inte nås just nu. Kontrollera nätverk och endpoint.'; }
    }
    // No Copilot endpoint configured yet — preview-only assistant answers from the same live snapshot
    try {
      if (typeof window !== 'undefined' && window.claude && window.claude.complete) {
        const prompt = 'Du är JARVIS, textassistent i NSVA:s driftövervakning (vatten, avlopp, dagvatten, skyfall) i nordvästra Skåne. Svara kort och sakligt på svenska i ren text, max 3 meningar, utan markdown. Använd bara datan nedan.\n\nDATA: ' + JSON.stringify(ctx) + '\n\nFråga: ' + t;
        const r = await window.claude.complete(prompt);
        if (r && r.trim()) return this.clean(r);
      }
    } catch (e) {}
    return 'Copilot-agenten är inte ansluten ännu. Ange endpoint i inställningen "copilotEndpoint".';
  }

  // ---------- draggable widget layout ----------
  findWid(el) {
    let cur = el;
    while (cur) { const w = cur.getAttribute && cur.getAttribute('data-wid'); if (w) return w; cur = cur.parentElement; }
    return null;
  }
  findDropCol(el) {
    let cur = el;
    while (cur) { const c = cur.getAttribute && cur.getAttribute('data-col'); if (c) return c; cur = cur.parentElement; }
    return null;
  }
  startDrag(id, e) {
    if (e.button != null && e.button !== 0) return; // left-button only
    this.setState({ dragId: id, dragActive: false, dragStartX: e.clientX, dragStartY: e.clientY, dragGx: e.clientX - 20, dragGy: e.clientY - 20 });
  }
  allWidgets() { return ['flode', 'dricks', 'spill', 'dag', 'hav', 'radar', 'prognos', 'matare', 'ai', 'alarm', 'anmal']; }
  // ---------- Regnmätare-widget: alla öppna mätare, blötast först ----------
  gaugeWidget() {
    const live = !!(this.rainHistStations && this.rainHistStations.length);
    const list = live ? this.rainHistStations : this.rainStations().map(s => Object.assign({ src: 'SIM', vals: [] }, s));
    const srcName = { SMHI: 'SMHI', FM: 'Försvarsm.', DMI: 'DMI', SIM: 'SIM' };
    const srcCol = { SMHI: '#eaf7fb', FM: '#c9b6ff', DMI: '#ff8a4a', SIM: '#7fa8b5' };
    const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
    const rows = list.map(g => {
      let now, sum = 0, n = 0;
      if (g.src === 'SIM') { now = this.simRainAt(g.lat, g.lng, 0); for (let h = -23; h <= 0; h++) { sum += this.simRainAt(g.lat, g.lng, h); n++; } }
      else {
        now = this.gaugeVal(g, 0);
        const cut = Date.now() - 24 * 3600000;
        (g.vals || []).forEach(v => { if (v.t >= cut && v.mm != null && !isNaN(v.mm)) { sum += v.mm; n++; } });
      }
      const has = now != null && !isNaN(now);
      const mm = has ? now : 0;
      return { g, name: g.name, src: g.src, srcTxt: srcName[g.src] || g.src, srcColor: srcCol[g.src] || '#7fa8b5',
        mm, sum, has, n,
        nowTxt: has ? f1(mm) : '–', sumTxt: n ? f1(sum) : '–',
        color: mm >= 0.1 ? this.rainHex(mm) : '#3f5e69', bar: Math.min(100, mm / 10 * 100),
        open: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.closeWidgetDetail(); this.openGauge(g); } };
    }).sort((a, b) => (b.mm - a.mm) || (b.sum - a.sum));
    const wet = rows.filter(r => r.mm >= 0.1).length;
    const top = rows[0];
    return { rows, list: rows.slice(0, 6), total: rows.length, wet, live,
      wetTxt: wet ? wet + ' av ' + rows.length + ' mäter regn' : 'Uppehåll vid alla ' + rows.length + ' mätare',
      wetColor: wet ? '#4aacff' : '#2fe6c4',
      maxTxt: top && top.mm >= 0.1 ? f1(top.mm) + ' mm/h · ' + top.name : '0 mm/h',
      maxColor: top && top.mm >= 0.1 ? this.rainHex(top.mm) : '#7fa8b5',
      moreTxt: rows.length > 6 ? '+ ' + (rows.length - 6) + ' till · tryck för alla' : '' };
  }
  // ---------- Flödesmätare (Produktion steg 1) — ledningsnät + pumpstationer, volym/tid ----------
  // Live: this.flowLive = [{ id, name, kommun, type:'ledningsnat'|'pumpstation', flow (m³/h), normal (m³/h), timestamp }]
  // (t.ex. GET /api/flowmeters från Fabric). Simulerat annars.
  baseFlowMeters() {
    return [
      { id: 'FM-HBG-01', name: 'Huvudledning Ringstorp', kommun: 'helsingborg', type: 'ledningsnat', normal: 1180 },
      { id: 'FM-HBG-02', name: 'PS Söder', kommun: 'helsingborg', type: 'pumpstation', normal: 640 },
      { id: 'FM-HBG-03', name: 'Ledning Råå–Ramlösa', kommun: 'helsingborg', type: 'ledningsnat', normal: 410 },
      { id: 'FM-LKR-01', name: 'Huvudledning Landskrona', kommun: 'landskrona', type: 'ledningsnat', normal: 520 },
      { id: 'FM-LKR-02', name: 'PS Lundåkra', kommun: 'landskrona', type: 'pumpstation', normal: 210 },
      { id: 'FM-BAS-01', name: 'PS Båstad centrum', kommun: 'bastad', type: 'pumpstation', normal: 160 },
      { id: 'FM-BJU-01', name: 'Ledning Bjuv–Ekeby', kommun: 'bjuv', type: 'ledningsnat', normal: 140 },
      { id: 'FM-AST-01', name: 'PS Åstorp', kommun: 'astorp', type: 'pumpstation', normal: 190 },
      { id: 'FM-SVA-01', name: 'Ledning Svalöv', kommun: 'svalov', type: 'ledningsnat', normal: 115 },
      { id: 'FM-ORK-01', name: 'PS Örkelljunga', kommun: 'orkelljunga', type: 'pumpstation', normal: 95 },
      { id: 'FM-PER-01', name: 'Ledning Perstorp', kommun: 'perstorp', type: 'ledningsnat', normal: 85 },
    ];
  }
  flowMeters() {
    const live = this.flowLive && this.flowLive.length ? this.flowLive : null;
    const list = live || this.baseFlowMeters().map((m, i) => {
      const dev = i === 2 ? 0.42 : i === 7 ? -0.6 : 0; // simulated: one high flow (möjlig läcka) + one low (pump)
      return Object.assign({}, m, { flow: Math.max(0, this.j(m.normal * (1 + dev), m.normal * 0.04, i + 3)) });
    });
    return list.map((m, i) => {
      const devPct = m.normal ? Math.round((m.flow - m.normal) / m.normal * 100) : 0;
      const st = m.flow < 0.5 ? 'stopp' : devPct >= 30 ? 'hog' : devPct <= -40 ? 'lag' : 'ok';
      const color = st === 'ok' ? '#2fe6c4' : st === 'stopp' ? '#ff5a6e' : '#ffb547';
      const spark = Array.from({ length: 16 }, (_, k) => ({ h: Math.max(10, Math.min(100, Math.round(50 + Math.sin((this.state.tick + k + i) * 0.55) * 18 + devPct * 0.4))) }));
      return {
        id: m.id, name: m.name, kommun: m.kommun, kommunName: this.muniName(m.kommun),
        isLn: m.type === 'ledningsnat', typeTxt: m.type === 'ledningsnat' ? 'Ledningsnät' : 'Pumpstation', typeShort: m.type === 'ledningsnat' ? 'LN' : 'PS',
        flow: m.flow, normal: m.normal, flowTxt: this.fmt(m.flow), normalTxt: this.fmt(m.normal),
        lps: (Math.round(m.flow / 3.6 * 10) / 10).toString().replace('.', ','),
        devPct, devTxt: (devPct > 0 ? '+' : '') + devPct + ' %', status: st, color,
        statusTxt: st === 'ok' ? 'Normal' : st === 'hog' ? 'Högt flöde' : st === 'lag' ? 'Lågt flöde' : 'Stopp', spark,
      };
    });
  }
  flowSummary() {
    const fm = this.flowMeters();
    const sum = arr => arr.reduce((a, m) => a + m.flow, 0);
    const ln = fm.filter(m => m.isLn), ps = fm.filter(m => !m.isLn);
    const dev = fm.filter(m => m.status !== 'ok');
    const rows = fm.slice().sort((a, b) => (a.status === 'ok') - (b.status === 'ok') || b.flow - a.flow).slice(0, 6);
    const tot = sum(fm);
    return {
      totalTxt: this.fmt(tot), count: fm.length, lnTxt: this.fmt(sum(ln)), psTxt: this.fmt(sum(ps)),
      lnCount: ln.length, psCount: ps.length,
      devCount: dev.length, devTxt: dev.length ? dev.length + ' avvikelse' + (dev.length > 1 ? 'r' : '') : 'Inga avvikelser',
      devColor: dev.length ? '#ffb547' : '#2fe6c4',
      rows, spark: Array.from({ length: 16 }, (_, k) => ({ h: Math.max(12, Math.min(96, Math.round(52 + Math.sin((this.state.tick + k) * 0.5) * 20 + (k / 16) * 10))) })),
    };
  }
  widgetLabel(id) { return ({ matare: 'Regnmätare', flode: 'Flödesmätare', dricks: 'Dricksvatten', spill: 'Spillvatten', dag: 'Dagvatten', hav: 'Havsvattenstånd', radar: 'Väderradar & vind', prognos: 'Prognoser', ai: 'AI-notiser', alarm: 'Aktiva alarm', anmal: 'Anmälningar · översvämning' })[id] || id; }
  openWidgetDetail(id) { this.setState({ openWidget: id, openWidgetMuni: null }); }
  closeWidgetDetail() { this.setState({ openWidget: null, openWidgetMuni: null }); }
  // ---------- live data snapshot for the JARVIS text agent (Copilot) ----------
  resolveWidget(name) {
    const map = { spillvatten: 'spill', avloppsvatten: 'spill', spillvattnet: 'spill', dricksvatten: 'dricks', dricksvattnet: 'dricks', dagvattnet: 'dag', flödesmät: 'flode', flodesmat: 'flode', flöde: 'flode', flode: 'flode', anmäl: 'anmal', anmal: 'anmal', översväm: 'anmal', oversvam: 'anmal', väderradar: 'radar', vaderradar: 'radar', nederbörd: 'prognos', 'ai-notis': 'ai', 'aktiva alarm': 'alarm', drick: 'dricks', vatten: 'dricks', spill: 'spill', avlopp: 'spill', dagvatten: 'dag', dag: 'dag', skyfall: 'dag', hav: 'hav', havsvatten: 'hav', havsniv: 'hav', vattenstånd: 'hav', tidvatten: 'hav', väder: 'radar', vader: 'radar', radar: 'radar', vind: 'radar', prognos: 'prognos', notis: 'ai', ai: 'ai', alarm: 'alarm', larm: 'alarm' };
    const low = (name || '').toLowerCase();
    // most specific keyword wins ("havsvattenstånd" must not match the bare "vatten" → dricks)
    const keys = Object.keys(map).sort((a, b) => b.length - a.length);
    for (const k of keys) if (low.indexOf(k) >= 0) return map[k];
    return null;
  }
  weatherSnapshot() {
    const wd = this.wind(); const wn = this.weatherNow();
    return {
      datakälla: this.weather ? 'SMHI live' : 'simulerad',
      temperatur: wn.tempTxt, tillstånd: wn.condTxt,
      vind_ms: wd.speedTxt, byvind_ms: wd.gustTxt, vindriktning: wd.fromTxt,
      max_nederbörd_mmh: this.liveRain(null),
      skyfallsvarning: ((this.weather ? this.weather.maxP : 32) >= 10) ? 'JA' : 'NEJ',
      prognos_12h_mmh: Array.from({ length: 12 }, (_, i) => { let mm = 0; this.baseMunis().forEach(m => { const p = this.fcPrecip(m.id, i); if (p > mm) mm = p; }); return Math.round(mm * 10) / 10; }),
    };
  }
  municipalitySnapshot(id) {
    const m = this.baseMunis().find(x => x.id === id); if (!m) return null;
    const sys = this.systems(id);
    const p = this.weather && this.weather.byMuni[id] && this.weather.byMuni[id].now ? (this.weather.byMuni[id].now.precip || 0) : this.stormF(id) * 32;
    const alarms = this.currentAlarms().filter(a => a.muni === id).map(a => ({ allvar: a.sev, text: a.msg, tid: a.time }));
    return {
      kommun: m.name,
      dricksvatten: { produktion_m3h: sys.dricks.flowTxt, nättryck_bar: sys.dricks.pressureTxt, turbiditet: sys.dricks.turbTxt, pH: sys.dricks.phTxt, kvalitet: sys.dricks.qualTxt, reservoarer: sys.dricks.levels.map(r => ({ namn: r.name, nivå: r.pctTxt })) },
      spillvatten: { inflöde_m3h: sys.spill.flowTxt, pumpnivå: sys.spill.pumpTxt, bräddning: sys.spill.braddTxt, belastning: sys.spill.loadTxt },
      dagvatten: { flöde_m3h: sys.dag.flowTxt, magasinnivå: sys.dag.magTxt, status: sys.dag.statusTxt, ledig_kapacitet: sys.dag.capTxt },
      nederbörd_mmh: Math.round(p * 10) / 10,
      aktiva_alarm: alarms,
    };
  }
  dashboardSnapshot() {
    const baseM = this.baseMunis();
    const sys = this.systems(null);
    return {
      tid: new Date().toLocaleString('sv-SE'),
      datakälla: this.weather ? 'SMHI live' : 'simulerad',
      region: {
        dricksvatten_m3h: sys.dricks.flowTxt, spillvatten_m3h: sys.spill.flowTxt, dagvatten_m3h: sys.dag.flowTxt,
        nättryck_bar: sys.dricks.pressureTxt, bräddning: sys.spill.braddTxt, dagvattenstatus: sys.dag.statusTxt,
      },
      väder: this.weatherSnapshot(),
      aktiva_alarm: this.currentAlarms().map(a => ({ allvar: a.sev, kommun: this.muniName(a.muni), text: a.msg, tid: a.time })),
      ai_notiser: this.aiNotices(null).map(a => ({ allvar: a.sev, kommun: a.muniName, eta: a.eta, säkerhet: a.confTxt, text: a.text })),
      havsvattenstånd: (() => { const s = this.seaLevel(); return { status: s.statusTxt, högsta_cm: s.maxCm, referens: 'medelvatten', stationer: s.stations.map(x => ({ namn: x.name, kommun: x.kommun, cm: x.cm, status: x.statusTxt, topp_10h_cm: x.peak })) }; })(),
      kommuner: baseM.map(m => this.municipalitySnapshot(m.id)),
    };
  }
  hashSeed(s) { let h = 0; for (let i = 0; i < (s || 'all').length; i++) h = (h * 31 + (s || 'all').charCodeAt(i)) % 89; return h; }
  // Domain-specific metric sections for widget level 2 (mid=null, aggregate) and level 3 (mid set, per kommun)
  widgetSections(id, mid) {
    const ac = this.acHex();
    const baseM = this.baseMunis();
    const byId = {}; baseM.forEach(m => { byId[m.id] = m; });
    const seed = this.hashSeed(mid);
    const j = (b, a, s) => this.j(b, a, seed + s);
    const prod = mid ? byId[mid].prod : baseM.reduce((acc, m) => acc + m.prod, 0);
    const sf = mid ? this.stormF(mid) : baseM.reduce((acc, m) => acc + this.stormF(m.id), 0) / baseM.length;
    const stat = (label, val, unit, color) => ({ label: label, val: val, unit: unit || '', color: color || '#cfeaf2' });
    const num = (v, d) => v.toFixed(d == null ? 1 : d).replace('.', ',');
    const sec = [];
    const zoneNames = mid ? ['Centrum', 'Norra', 'Södra', 'Höjden'] : ['Helsingborg', 'Landskrona', 'Åstorp-Bjuv', 'NÖ-zonen'];

    if (id === 'dricks') {
      sec.push({ title: 'Tryckzoner (färgkodat)', kind: 'zones', items: zoneNames.map((z, i) => { const p = j(4.2, 0.55, i); return { label: z, val: num(p) + ' bar', color: p < 3.2 ? '#ff5a6e' : p < 3.8 ? '#ffb547' : '#2fe6c4' }; }) });
      sec.push({ title: 'Klorhalt per zon', kind: 'zones', items: zoneNames.map((z, i) => { const c = j(0.34, 0.12, i + 4); return { label: z, val: num(c, 2) + ' mg/l', color: (c < 0.2 || c > 0.5) ? '#ffb547' : '#2fe6c4' }; }) });
      sec.push({ title: 'Kvalitet & flöde i nätet', kind: 'stats', items: [
        stat('Turbiditet (nät)', num(j(0.18, 0.04, 8), 2), 'NTU', '#2fe6c4'),
        stat('pH vid verk', num(j(7.9, 0.06, 9)), ''),
        stat('pH i nätet', num(j(7.7, 0.07, 10)), ''),
        stat('Flöde huvudledning', this.fmt(j(prod * 0.62, prod * 0.03, 11)), 'm³/h', ac),
      ] });
      const lv = this.systems(mid).dricks.levels;
      sec.push({ title: 'Reservoarnivåer · larm min 20% / max 95%', kind: 'bars', items: lv.map(r => ({ name: r.name, pct: r.pct, pctTxt: r.pctTxt, color: r.pct < 20 || r.pct > 95 ? '#ff5a6e' : r.pct < 35 ? '#ffb547' : '#2fe6c4', note: r.pct < 20 ? 'UNDER MIN' : r.pct > 95 ? 'ÖVER MAX' : '' })) });
      sec.push({ title: 'Energi & hållbarhet', kind: 'stats', items: [
        stat('Energiförbrukning', this.fmt(j(prod * 0.42, prod * 0.02, 12)), 'kWh/h', '#ffce5a'),
        stat('Specifik energi', num(j(0.41, 0.03, 13), 2), 'kWh/m³', '#ffce5a'),
        stat('CO₂ per m³', num(j(11.5, 1.2, 14)), 'g/m³', '#2fe6c4'),
        stat('Förnybart', Math.round(j(86, 4, 15)) + '', '%', '#2fe6c4'),
      ] });
    } else if (id === 'spill') {
      const pump = j(46 + 40 * sf, 3, 1);
      sec.push({ title: 'Pumpstationer', kind: 'stats', items: [
        stat('Nivå (bräddrisk)', Math.round(pump) + '', '%', pump > 85 ? '#ff5a6e' : pump > 70 ? '#ffb547' : '#2fe6c4'),
        stat('Bräddvolym (dygn)', this.fmt(j(Math.max(0, sf * prod * 0.4), prod * 0.02, 2)), 'm³', sf > 0.5 ? '#ff8a4a' : '#2fe6c4'),
        stat('Drifttid', this.fmt(j(1820, 40, 3)), 'h', '#cfeaf2'),
        stat('Slitage', Math.round(j(38, 8, 4)) + '', '%', '#ffb547'),
        stat('Energiförbrukning', this.fmt(j(prod * 0.3, prod * 0.02, 5)), 'kWh/h', '#ffce5a'),
        stat('CO₂ per m³', num(j(14, 1.5, 6)), 'g/m³', '#2fe6c4'),
      ] });
      const cap = Math.round(j(64 + 30 * sf, 4, 7));
      sec.push({ title: 'Reningsverk', kind: 'stats', items: [
        stat('Inkommande / kapacitet', cap + '', '%', cap > 92 ? '#ff5a6e' : cap > 80 ? '#ffb547' : '#2fe6c4'),
        stat('BOD/COD-kvot', num(j(0.46, 0.04, 8), 2), '', '#cfeaf2'),
        stat('Fosfor (P-tot)', num(j(0.28, 0.05, 9), 2), 'mg/l', j(0.28, 0.05, 9) > 0.4 ? '#ffb547' : '#2fe6c4'),
        stat('Kväve (N-tot)', num(j(9.5, 1.2, 10)), 'mg/l', '#2fe6c4'),
        stat('Slammängd', num(j(3.4, 0.5, 11)), 'ton/d', '#cfeaf2'),
        stat('Utlopp (lagkrav)', cap > 95 ? 'Kontroll' : 'Godkänt', '', cap > 95 ? '#ffb547' : '#2fe6c4'),
      ] });
    } else if (id === 'dag') {
      sec.push({ title: 'Dammnivåer', kind: 'bars', items: ['Damm Nord', 'Damm Central', 'Damm Syd'].map((n, i) => { const v = Math.round(j(40 + 50 * sf, 6, i)); return { name: n, pct: Math.min(100, v), pctTxt: Math.min(100, v) + '%', color: v > 90 ? '#ff5a6e' : v > 70 ? '#ffb547' : '#2fe6c4', note: v > 90 ? 'BRÄDDNINGSRISK' : '' }; }) });
      sec.push({ title: 'Översvämningsriskzoner', kind: 'zones', items: zoneNames.map((z, i) => { const r = j(0.3 + sf * 0.7, 0.18, i + 3); return { label: z, val: r > 0.66 ? 'Hög' : r > 0.4 ? 'Måttlig' : 'Låg', color: r > 0.66 ? '#ff5a6e' : r > 0.4 ? '#ffb547' : '#2fe6c4' }; }) });
      const util = Math.round(j(55 + 40 * sf, 5, 7));
      sec.push({ title: 'Ledningsnät & avrinning', kind: 'stats', items: [
        stat('Kapacitetsutnyttjande', util + '', '%', util > 90 ? '#ff5a6e' : util > 75 ? '#ffb547' : '#2fe6c4'),
        stat('Flöde Råån', this.fmt(j(prod * 0.5 * (0.4 + sf), prod * 0.03, 8)), 'm³/h', '#3fa9d8'),
        stat('Flöde Vege å', this.fmt(j(prod * 0.4 * (0.4 + sf), prod * 0.03, 9)), 'm³/h', '#3fa9d8'),
        stat('Bräddpunkter aktiva', Math.round(j(sf * 6, 1, 10)) + '', 'st', sf > 0.5 ? '#ff8a4a' : '#2fe6c4'),
      ] });
      sec.push({ title: 'Energi & hållbarhet', kind: 'stats', items: [
        stat('Pumpenergi', this.fmt(j(prod * 0.18 * (0.4 + sf), prod * 0.02, 11)), 'kWh/h', '#ffce5a'),
        stat('CO₂ per m³', num(j(8.5, 1, 12)), 'g/m³', '#2fe6c4'),
      ] });
    }
    sec.forEach(s => { s.isStats = s.kind === 'stats'; s.isZones = s.kind === 'zones'; s.isBars = s.kind === 'bars'; });
    return sec;
  }
  widgetMuniDetail(wid, mid) {
    const m = this.baseMunis().find(x => x.id === mid); if (!m) return null;
    const sys = this.systems(mid);
    const ac = this.acHex();
    const o = { name: m.name, kpis: [], histLabel: '', hist: [], hist2: [], hist2length: false, histLong: false, levels: [], levelslength: false, back: () => this.setState({ openWidgetMuni: null }) };
    if (wid === 'dricks') {
      const prod = this.j(m.prod, m.prod * 0.02, 3);
      o.kpis = [
        { label: 'Produktion', val: this.fmt(prod), unit: 'm³/h', color: ac },
        { label: 'Dygnsproduktion', val: this.fmt(prod * 24), unit: 'm³', color: '#cfeaf2' },
        { label: 'Tryck', val: sys.dricks.pressureTxt, unit: 'bar', color: '#cfeaf2' },
        { label: 'Turbiditet', val: sys.dricks.turbTxt.split(' ')[0], unit: 'NTU', color: sys.dricks.qualColor },
        { label: 'pH', val: sys.dricks.phTxt, unit: '', color: '#cfeaf2' },
        { label: 'Kvalitet', val: sys.dricks.qualTxt, unit: '', color: sys.dricks.qualColor },
      ];
      o.histLabel = 'Produktion · senaste 24 h (m³/h)';
      o.hist = this.bars(this.longHist(prod, prod * 0.12, 3), ac);
      o.levels = sys.dricks.levels; o.levelslength = o.levels.length > 0;
    } else if (wid === 'spill') {
      const inf = this.j(m.prod * (0.8 + 0.55 * this.stormF(mid)), m.prod * 0.03, 6); const outf = inf * 0.94;
      o.kpis = [
        { label: 'Inflöde', val: this.fmt(inf), unit: 'm³/h', color: '#9b8cff' },
        { label: 'Utflöde', val: this.fmt(outf), unit: 'm³/h', color: '#2fe6c4' },
        { label: 'Pumpnivå', val: sys.spill.pumpTxt, unit: '', color: sys.spill.pumpColor },
        { label: 'Belastning', val: sys.spill.loadTxt, unit: '', color: '#cfeaf2' },
        { label: 'Bräddning', val: sys.spill.braddTxt, unit: '', color: sys.spill.braddColor },
        { label: 'Dygnsvolym', val: this.fmt(inf * 24), unit: 'm³', color: '#cfeaf2' },
      ];
      o.histLabel = 'Inflöde (lila) vs utflöde (grön) · senaste 24 h';
      o.hist = this.bars(this.longHist(inf, inf * 0.18, 6), '#9b8cff');
      o.hist2 = this.bars(this.longHist(outf, outf * 0.14, 9), 'rgba(47,230,196,.75)'); o.hist2length = true;
    } else if (wid === 'dag') {
      const fl = this.j(m.prod * (0.12 + 1.2 * this.stormF(mid)), m.prod * 0.05, 9);
      o.kpis = [
        { label: 'Flöde', val: this.fmt(fl), unit: 'm³/h', color: '#3fa9d8' },
        { label: 'Magasinnivå', val: sys.dag.magTxt, unit: '', color: sys.dag.magColor },
        { label: 'Ledig kapacitet', val: sys.dag.capTxt, unit: '', color: '#2fe6c4' },
        { label: 'Nederbörd', val: sys.dag.rainTxt.split(' ')[0], unit: 'mm/h', color: '#4aacff' },
        { label: 'Status', val: sys.dag.statusTxt, unit: '', color: sys.dag.statusColor },
        { label: 'Dygnsvolym', val: this.fmt(fl * 24), unit: 'm³', color: '#cfeaf2' },
      ];
      o.histLabel = 'Dagvattenflöde · senaste 24 h (m³/h)';
      o.hist = this.bars(this.longHist(fl, fl * 0.4, 9), '#3fa9d8');
    } else if (wid === 'radar') {
      const p = this.weather && this.weather.byMuni[mid] && this.weather.byMuni[mid].now ? (this.weather.byMuni[mid].now.precip || 0) : this.stormF(mid) * 32;
      const wd = this.wind();
      o.kpis = [
        { label: 'Nederbörd nu', val: (Math.round(p * 10) / 10).toString().replace('.', ','), unit: 'mm/h', color: p >= 10 ? '#ff5a6e' : '#4aacff' },
        { label: 'Vind', val: wd.speedTxt, unit: 'm/s', color: '#cfeaf2' },
        { label: 'Byvind', val: wd.gustTxt, unit: 'm/s', color: '#cfeaf2' },
        { label: 'Riktning', val: wd.fromTxt, unit: '', color: ac },
      ];
      o.histLabel = 'Nederbördsprognos · kommande 12 h (mm/h)';
      const arr = Array.from({ length: 12 }, (_, i) => this.fcPrecip(mid, i));
      const mx = Math.max(4, Math.max.apply(null, arr));
      o.hist = arr.map((v, i) => ({ h: Math.max(4, v / mx * 100), color: v >= 10 ? '#ff5a6e' : v >= 4 ? '#ff8a4a' : v >= 1.5 ? '#ffb547' : '#4aacff', label: i === 0 ? 'Nu' : '+' + i }));
      o.histLong = true;
    }
    o.sections = this.widgetSections(wid, mid);
    o.sectionslength = o.sections.length > 0;
    return o;
  }
  longHist(base, amp, seed, n) {
    n = n || 24;
    return Array.from({ length: n }, (_, i) => {
      const v = base + Math.sin((i + seed) * 0.5) * amp + Math.sin((i + seed) * 1.7) * amp * 0.4 + Math.sin((this.state.tick + i) * 0.3) * amp * 0.18;
      return Math.max(2, v);
    });
  }
  bars(arr, color) { const mx = Math.max.apply(null, arr.concat([1])); return arr.map(v => ({ h: Math.max(4, v / mx * 100), color })); }
  widgetDetailData() {
    const id = this.state.openWidget;
    if (!id) return { open: false, isDricks: false, isSpill: false, isDag: false, isRadar: false, isPrognos: false, isAi: false, isAlarm: false, isAnmal: false, rows: [], hist: [], hist2: [], kpis: [], notices: [], alarms: [], reports: [], reportslength: false, sections: [], sectionslength: false, muniOpen: false, muniClosed: true, muni: { kpis: [], hist: [], hist2: [], levels: [], sections: [], hist2length: false, levelslength: false, sectionslength: false, histLong: false } };
    const baseM = this.baseMunis();
    const byId = {}; baseM.forEach(m => { byId[m.id] = m; });
    const sys = this.systems(null);
    const ac = this.acHex();
    const out = { open: true, wid: id, title: this.widgetLabel(id), close: () => this.closeWidgetDetail(),
      isDricks: id === 'dricks', isSpill: id === 'spill', isDag: id === 'dag', isHav: id === 'hav', isRadar: id === 'radar', isPrognos: id === 'prognos', isAi: id === 'ai', isAlarm: id === 'alarm', isAnmal: id === 'anmal',
      rows: [], hist: [], hist2: [], kpis: [], notices: [], alarms: [], legend: '',
      muniOpen: false, muniClosed: true, muni: { kpis: [], hist: [], hist2: [], levels: [], hist2length: false, levelslength: false, histLong: false } };

    if (id === 'dricks') {
      out.subtitle = 'Produktion & vattenkvalitet · 8 kommuner';
      let total = 0; baseM.forEach((m, i) => { total += this.j(m.prod, m.prod * 0.02, i); });
      out.kpis = [
        { label: 'Produktion nu', val: this.fmt(total), unit: 'm³/h', color: ac },
        { label: 'Dygnsproduktion', val: this.fmt(total * 24), unit: 'm³', color: '#cfeaf2' },
        { label: 'Snitttryck', val: sys.dricks.pressureTxt, unit: 'bar', color: '#cfeaf2' },
        { label: 'Turbiditet', val: sys.dricks.turbTxt.split(' ')[0], unit: 'NTU', color: '#2fe6c4' },
        { label: 'pH', val: sys.dricks.phTxt, unit: '', color: '#cfeaf2' },
        { label: 'Kvalitet', val: sys.dricks.qualTxt, unit: '', color: sys.dricks.qualColor },
      ];
      out.histLabel = 'Produktion · senaste 24 h (m³/h)';
      out.hist = this.bars(this.longHist(total, total * 0.12, 0), ac);
      out.rows = baseM.map((m, i) => {
        const prod = this.j(m.prod, m.prod * 0.02, i);
        const lvl = (this.j(m.res[0], 1.2, i) + this.j(m.res[1], 1.2, i + 9)) / 2;
        return { name: m.name, ropen: () => this.setState({ openWidgetMuni: m.id }), c1: this.fmt(prod) + ' m³/h', c2: Math.round(lvl) + '%', c2color: this.colorFor(lvl), c3: this.j(4.2, 0.06, i).toFixed(1).replace('.', ',') + ' bar' };
      });
      out.cols3 = ['Kommun', 'Produktion', 'Reservoarnivå', 'Tryck'];
    } else if (id === 'spill') {
      out.subtitle = 'Avlopp & rening · inflöde / utflöde';
      let inflow = 0; baseM.forEach((m, i) => { inflow += this.j(m.prod * (0.8 + 0.55 * this.stormF(m.id)), m.prod * 0.03, i + 6); });
      const outflow = inflow * 0.94;
      out.kpis = [
        { label: 'Inflöde nu', val: this.fmt(inflow), unit: 'm³/h', color: '#9b8cff' },
        { label: 'Utflöde nu', val: this.fmt(outflow), unit: 'm³/h', color: '#2fe6c4' },
        { label: 'Pumpnivå snitt', val: sys.spill.pumpTxt, unit: '', color: sys.spill.pumpColor },
        { label: 'Belastning', val: sys.spill.loadTxt, unit: '', color: '#cfeaf2' },
        { label: 'Bräddning', val: sys.spill.braddTxt, unit: '', color: sys.spill.braddColor },
        { label: 'Dygnsvolym', val: this.fmt(inflow * 24), unit: 'm³', color: '#cfeaf2' },
      ];
      out.histLabel = 'Inflöde (lila) vs utflöde (grön) · senaste 24 h';
      out.hist = this.bars(this.longHist(inflow, inflow * 0.18, 6), '#9b8cff');
      out.hist2 = this.bars(this.longHist(outflow, outflow * 0.14, 9), 'rgba(47,230,196,.75)');
      out.rows = baseM.map((m, i) => {
        const inf = this.j(m.prod * (0.8 + 0.55 * this.stormF(m.id)), m.prod * 0.03, i + 6);
        const pump = this.j(42 + 40 * this.stormF(m.id), 2.5, i + 7);
        const risk = pump > 85 ? 'RISK' : pump > 70 ? 'Förhöjd' : 'Normal';
        return { name: m.name, ropen: () => this.setState({ openWidgetMuni: m.id }), c1: this.fmt(inf) + ' m³/h', c2: Math.round(pump) + '%', c2color: this.colorFor(100 - pump), c3: risk, c3color: pump > 85 ? '#ff5a6e' : pump > 70 ? '#ffb547' : '#2fe6c4' };
      });
      out.cols3 = ['Kommun', 'Inflöde', 'Pumpnivå', 'Bräddrisk'];
    } else if (id === 'dag') {
      out.subtitle = 'Dagvatten & fördröjningsmagasin';
      let flow = 0; baseM.forEach((m, i) => { flow += this.j(m.prod * (0.12 + 1.2 * this.stormF(m.id)), m.prod * 0.05, i + 9); });
      out.kpis = [
        { label: 'Flöde nu', val: this.fmt(flow), unit: 'm³/h', color: '#3fa9d8' },
        { label: 'Magasinnivå', val: sys.dag.magTxt, unit: '', color: sys.dag.magColor },
        { label: 'Ledig kapacitet', val: sys.dag.capTxt, unit: '', color: '#2fe6c4' },
        { label: 'Nederbörd', val: sys.dag.rainTxt.split(' ')[0], unit: 'mm/h', color: '#4aacff' },
        { label: 'Status', val: sys.dag.statusTxt, unit: '', color: sys.dag.statusColor },
        { label: 'Dygnsvolym', val: this.fmt(flow * 24), unit: 'm³', color: '#cfeaf2' },
      ];
      out.histLabel = 'Dagvattenflöde · senaste 24 h (m³/h)';
      out.hist = this.bars(this.longHist(flow, flow * 0.4, 9), '#3fa9d8');
      out.rows = baseM.map((m, i) => {
        const mag = this.j(38 + 55 * this.stormF(m.id), 2.5, i + 8);
        const fl = this.j(m.prod * (0.12 + 1.2 * this.stormF(m.id)), m.prod * 0.05, i + 9);
        const st = mag > 85 ? 'KRITISK' : mag > 65 ? 'HÖG' : 'Normal';
        return { name: m.name, ropen: () => this.setState({ openWidgetMuni: m.id }), c1: this.fmt(fl) + ' m³/h', c2: Math.round(mag) + '%', c2color: mag > 85 ? '#ff5a6e' : mag > 65 ? '#ffb547' : '#2fe6c4', c3: st, c3color: mag > 85 ? '#ff5a6e' : mag > 65 ? '#ffb547' : '#2fe6c4' };
      });
      out.cols3 = ['Kommun', 'Flöde', 'Magasinnivå', 'Status'];
    } else if (id === 'hav') {
      const sea = this.seaLevel();
      const minCm = Math.min.apply(null, (sea.stations.some(s => s.measured) ? sea.stations.filter(s => s.measured) : sea.stations).map(s => s.cm));
      const seaBasis = sea.stations.some(s => s.measured) ? sea.stations.filter(s => s.measured) : sea.stations;
      const fcMax = Array.from({ length: 25 }, (_, h) => Math.max.apply(null, seaBasis.map(s => s.forecast[h])));
      const obsMax = Array.from({ length: 24 }, (_, h) => Math.max.apply(null, seaBasis.map(s => s.obs[h])));
      const peak24 = Math.max.apply(null, fcMax), peak24h = fcMax.indexOf(peak24);
      const sg = n => (n >= 0 ? '+' : '') + n;
      const meas = sea.stations.filter(s => s.measured);
      const mx24 = meas.length ? Math.max.apply(null, meas.map(s => s.max24)) : null;
      const mn24 = meas.length ? Math.min.apply(null, meas.map(s => s.min24)) : null;
      const rise = meas.length ? Math.max.apply(null, meas.map(s => s.rise3 == null ? -999 : s.rise3)) : null;
      const temps = meas.map(s => s.tempTxt).filter(t => t !== '–');
      out.subtitle = 'Havsvattenstånd · Öresund · cm relativt medelvattenstånd (RW)';
      out.kpis = [
        { label: 'Högsta nivå nu', val: sg(sea.maxCm), unit: 'cm', color: sea.color },
        { label: 'Lägsta nivå nu', val: sg(minCm), unit: 'cm', color: '#9fc4d4' },
        { label: 'Status', val: sea.statusTxt, unit: '', color: sea.color },
        { label: 'Max · min 24 h', val: mx24 != null ? sg(mx24) + ' / ' + sg(mn24) : '–', unit: mx24 != null ? 'cm' : '', color: '#cfeaf2' },
        { label: 'Ändring 3 h', val: rise != null && rise > -999 ? sg(rise) : '–', unit: rise != null && rise > -999 ? 'cm' : '', color: rise != null && rise >= 15 ? '#ffb547' : '#cfeaf2' },
        { label: 'Datakälla', val: sea.source, unit: '', color: sea.source === 'SIM' ? '#7fa8b5' : '#2fe6c4' },
      ];
      out.seaNote = (meas.length ? 'Uppmätt av SMHI vid ' + meas.length + ' av 3 stationer, timvärden.' : 'Inga uppmätta värden just nu – visar beräknat läge.') + (temps.length ? ' Vattentemperatur ' + temps.join(' · ') + '.' : '') + ' Prognosen framåt är beräknad av Hydra; SMHI publicerar ingen öppen vattenståndsprognos.';
      out.histLabel = 'Prognos havsvattenstånd · kommande 24 h (beräknad, högsta station) · under: uppmätt senaste 24 h';
      const lo = Math.min.apply(null, fcMax.concat(obsMax).concat([0])), hi = Math.max.apply(null, fcMax.concat(obsMax).concat([1]));
      out.hist = fcMax.map((v, h) => ({ h: Math.max(6, (v - lo) / ((hi - lo) || 1) * 100), color: v >= 100 ? '#ff5a6e' : v >= 60 ? '#ffb547' : '#2dd4bf', label: (h % 3 === 0) ? (h === 0 ? 'Nu' : '+' + h) : '' }));
      out.histLong = true;
      out.hist2 = obsMax.map((v) => ({ h: Math.max(4, (v - lo) / ((hi - lo) || 1) * 100), color: 'rgba(110,185,203,.5)' }));
      out.hist2length = true;
      out.rows = sea.stations.map(s => ({ name: s.name + ' · ' + s.kommun + (s.measured ? ' · kl ' + s.timeTxt : ' · beräknat'), c1: s.cmTxt, c2: s.rhTxt, c2color: '#aecede', c3: s.max24 != null ? sg(s.max24) + ' / ' + sg(s.min24) + ' cm' : (meas.length ? 'uppskattat' : s.statusTxt), c3color: s.measured || !meas.length ? s.color : '#7fa8b5' }));
      out.cols3 = ['Station', 'Nivå nu (RW)', 'RH 2000', 'Max / min 24 h'];
    } else if (id === 'radar') {
      const wd = this.wind();
      out.subtitle = 'Väderradar, nederbörd & vind';
      out.kpis = [
        { label: 'Nederbörd (max)', val: this.liveRain(null).split(' ')[0], unit: 'mm/h', color: '#4aacff' },
        { label: 'Vind', val: wd.speedTxt, unit: 'm/s', color: '#cfeaf2' },
        { label: 'Byvind', val: wd.gustTxt, unit: 'm/s', color: '#cfeaf2' },
        { label: 'Riktning', val: wd.fromTxt, unit: '', color: ac },
        { label: 'Temperatur', val: this.weatherNow().tempTxt, unit: '', color: '#cfeaf2' },
        { label: 'Datakälla', val: this.weather ? 'SMHI' : 'SIM', unit: '', color: this.weather ? '#2fe6c4' : '#7fa8b5' },
      ];
      out.histLabel = 'Nederbörd per kommun · nu (mm/h)';
      out.rows = baseM.map((m, i) => {
        const p = this.weather && this.weather.byMuni[m.id] && this.weather.byMuni[m.id].now ? (this.weather.byMuni[m.id].now.precip || 0) : this.stormF(m.id) * 32;
        return { name: m.name, ropen: () => this.setState({ openWidgetMuni: m.id }), c1: (Math.round(p * 10) / 10).toString().replace('.', ',') + ' mm/h', c2: p >= 10 ? 'Skyfall' : p >= 2 ? 'Regn' : p >= 0.2 ? 'Lätt' : 'Uppehåll', c2color: p >= 10 ? '#ff5a6e' : p >= 2 ? '#ffb547' : p >= 0.2 ? '#4aacff' : '#577684' };
      });
      out.cols3 = ['Kommun', 'Nederbörd', 'Tillstånd'];
      out.twoCol = true;
    } else if (id === 'prognos') {
      out.subtitle = 'Nederbörds- och flödesprognos · 12 timmar';
      const labels = Array.from({ length: 12 }, (_, i) => i === 0 ? 'Nu' : '+' + i + 'h');
      let maxP = 0, maxH = 0;
      const rainArr = labels.map((t, i) => { let mm = 0; baseM.forEach(m => { const p = this.fcPrecip(m.id, i); if (p > mm) mm = p; }); if (mm > maxP) { maxP = mm; maxH = i; } return mm; });
      out.kpis = [
        { label: 'Max nederbörd (12h)', val: (Math.round(maxP * 10) / 10).toString().replace('.', ','), unit: 'mm/h', color: maxP >= 10 ? '#ff5a6e' : '#ffb547' },
        { label: 'Inträffar', val: maxH === 0 ? 'Nu' : '+' + maxH + ' h', unit: '', color: ac },
        { label: 'Total väntad', val: (Math.round(rainArr.reduce((a, b) => a + b, 0))) + '', unit: 'mm', color: '#cfeaf2' },
        { label: 'Datakälla', val: this.weather ? 'SMHI' : 'SIM', unit: '', color: this.weather ? '#2fe6c4' : '#7fa8b5' },
      ];
      out.histLabel = 'Nederbörd · kommande 12 h (mm/h)';
      const mx = Math.max(4, maxP);
      out.hist = labels.map((t, i) => ({ h: Math.max(4, rainArr[i] / mx * 100), color: rainArr[i] >= 10 ? '#ff5a6e' : rainArr[i] >= 4 ? '#ff8a4a' : rainArr[i] >= 1.5 ? '#ffb547' : '#4aacff', label: t }));
      out.histLong = true;
      const pg = this.prognos();
      out.accRows = pg.accRows || [];
      out.accStartTxt = pg.accStartTxt;
      out.acc = pg;
    } else if (id === 'ai') {
      out.subtitle = 'Prediktiva AI-notiser · alla kommuner';
      const list = this.aiNotices(null);
      out.kpis = [
        { label: 'Aktiva notiser', val: list.length + '', unit: '', color: ac },
        { label: 'Högrisk', val: list.filter(a => a.sev === 'HÖG').length + '', unit: '', color: '#ff5a6e' },
        { label: 'Medel', val: list.filter(a => a.sev === 'MEDEL').length + '', unit: '', color: '#ffb547' },
        { label: 'Datakälla', val: this.weather ? 'SMHI + SCADA' : 'SIM', unit: '', color: this.weather ? '#2fe6c4' : '#7fa8b5' },
      ];
      out.notices = list;
    } else if (id === 'flode') {
      const fm = this.flowMeters(), s = this.flowSummary();
      const tot = fm.reduce((a, m) => a + m.flow, 0);
      out.subtitle = 'Flödesmätare · volym/tid · ledningsnät och pumpstationer';
      out.kpis = [
        { label: 'Totalt flöde', val: s.totalTxt, unit: 'm³/h', color: ac },
        { label: 'Dygnsvolym', val: this.fmt(tot * 24), unit: 'm³', color: '#cfeaf2' },
        { label: 'Ledningsnät', val: s.lnTxt, unit: 'm³/h', color: '#cfeaf2' },
        { label: 'Pumpstationer', val: s.psTxt, unit: 'm³/h', color: '#cfeaf2' },
        { label: 'Mätare', val: s.count + '', unit: 'st', color: '#cfeaf2' },
        { label: 'Avvikelser', val: s.devCount + '', unit: '', color: s.devColor },
      ];
      out.histLabel = 'Totalt flöde · senaste 24 h (m³/h)';
      out.hist = this.bars(this.longHist(tot, tot * 0.14, 2), ac);
      out.rows = fm.slice().sort((a, b) => (a.status === 'ok') - (b.status === 'ok') || b.flow - a.flow)
        .map(m => ({ name: m.name + ' · ' + m.kommunName, ropen: () => { this.closeWidgetDetail(); this.selectMuni(m.kommun); }, c1: m.typeTxt, c1color: '#9bc3d0', c2: m.flowTxt + ' m³/h  (' + m.lps + ' l/s)', c2color: '#eaf7fb', c3: m.devTxt + ' · ' + m.statusTxt, c3color: m.color }));
      out.cols3 = ['Mätare', 'Typ', 'Flöde', 'Mot normal'];
    } else if (id === 'alarm') {
      out.subtitle = 'Aktiva alarm & händelselogg';
      const all = this.currentAlarms();
      out.kpis = [
        { label: 'Kritiska', val: all.filter(a => a.sev === 'KRITISK').length + '', unit: '', color: '#ff5a6e' },
        { label: 'Varningar', val: all.filter(a => a.sev === 'VARNING').length + '', unit: '', color: '#ffb547' },
        { label: 'Info', val: all.filter(a => a.sev === 'INFO').length + '', unit: '', color: '#35d6f2' },
        { label: 'Totalt', val: all.length + '', unit: '', color: '#cfeaf2' },
      ];
      out.alarms = all.map(a => ({ sev: a.sev, msg: a.msg, time: a.time, muniName: this.muniName(a.muni), color: this.sevColor(a.sev), bg: this.sevBg(a.sev), border: this.sevBorder(a.sev) }));
    } else if (id === 'matare') {
      const gw = this.gaugeWidget();
      const c = this.gaugeSourceSummary();
      out.subtitle = 'Alla öppna regnmätare · SMHI · Försvarsmakten · DMI · tryck på en mätare för all data';
      out.kpis = [
        { label: 'Mätare', val: gw.total + '', unit: '', color: '#eaf7fb' },
        { label: 'Mäter regn nu', val: gw.wet + '', unit: 'st', color: gw.wet ? '#4aacff' : '#2fe6c4' },
        { label: 'Mest regn nu', val: gw.rows[0] && gw.rows[0].has ? gw.rows[0].nowTxt : '0', unit: 'mm/h', color: gw.maxColor },
        { label: 'Datakälla', val: gw.live ? 'LIVE' : 'SIM', unit: '', color: gw.live ? '#2fe6c4' : '#7fa8b5' },
      ];
      out.rows = gw.rows.map(r => ({ name: r.name, ropen: r.open, c1: r.nowTxt + ' mm/h', c2: r.sumTxt + ' mm', c2color: r.sum >= 10 ? '#ffb547' : '#bcd9e3', c3: r.srcTxt, c3color: r.srcColor }));
      out.cols3 = ['Regnmätare', 'Senaste timmen', 'Senaste 24 h', 'Källa'];
      out.legend = c.txt || '';
    } else if (id === 'anmal') {
      const rs = this.reportsSummary(null);
      out.subtitle = 'Översvämningsanmälningar från allmänheten · CRM · historiska och pågående';
      out.kpis = [
        { label: 'Nya', val: rs.newCount + '', unit: '', color: '#ff5a6e' },
        { label: 'Pågår', val: rs.progCount + '', unit: '', color: '#ffb547' },
        { label: 'Avslutade', val: rs.closedCount + '', unit: '', color: '#2fe6c4' },
        { label: 'Totalt', val: rs.all.length + '', unit: '', color: '#cfeaf2' },
        { label: 'Källare', val: rs.all.filter(r => r.category === 'källaröversvämning').length + '', unit: '', color: '#cfeaf2' },
        { label: 'Datakälla', val: this.reports ? 'CRM' : 'SIM', unit: '', color: this.reports ? '#2fe6c4' : '#7fa8b5' },
      ];
      out.reports = rs.allList;
    }
    out.reports = out.reports || [];
    out.reportslength = out.reports.length > 0;
    out.hist2length = out.hist2.length > 0;
    out.rowslength = out.rows.length > 0;
    out.noticeslength = out.notices.length > 0;
    out.alarmslength = out.alarms.length > 0;
    const cc = out.cols3 || [];
    out.col0 = cc[0] || ''; out.col1 = cc[1] || ''; out.col2 = cc[2] || ''; out.col3 = cc[3] || '';
    const mid = this.state.openWidgetMuni;
    const hasRows = ['dricks', 'spill', 'dag', 'radar'].includes(id);
    out.sections = ['dricks', 'spill', 'dag'].includes(id) ? this.widgetSections(id, null) : [];
    out.sectionslength = out.sections.length > 0;
    const sub = (mid && hasRows) ? this.widgetMuniDetail(id, mid) : null;
    out.muniOpen = !!sub;
    out.muniClosed = !sub;
    out.muni = sub || { kpis: [], hist: [], hist2: [], levels: [], sections: [], hist2length: false, levelslength: false, sectionslength: false, histLong: false };
    return out;
  }
  homeCol(id) { return ['flode', 'dricks', 'spill', 'dag', 'hav'].includes(id) ? 'left' : 'right'; }
  defaultLayout() {
    return { cols: { left: ['flode', 'dricks', 'spill', 'dag', 'hav'], right: ['radar', 'prognos', 'matare', 'ai', 'alarm', 'anmal'] }, hidden: ['matare'] };
  }
  loadLayout() {
    const def = this.defaultLayout();
    try {
      const raw = (typeof localStorage !== 'undefined') && localStorage.getItem('nsva_layout_v3');
      if (raw) {
        const o = JSON.parse(raw);
        const left = Array.isArray(o.cols && o.cols.left) ? o.cols.left : [];
        const right = Array.isArray(o.cols && o.cols.right) ? o.cols.right : [];
        const hidden = Array.isArray(o.hidden) ? o.hidden : [];
        const seen = {}, valid = id => this.allWidgets().includes(id) && !seen[id] && (seen[id] = true);
        const cl = left.filter(valid), cr = right.filter(valid), ch = hidden.filter(valid);
        // any widget not accounted for (e.g. newly added) goes to its home column, visible
        this.allWidgets().forEach(id => { if (!seen[id]) (this.homeCol(id) === 'left' ? cl : cr).push(id); });
        return { cols: { left: cl, right: cr }, hidden: ch };
      }
    } catch (e) {}
    return def;
  }
  persistLayout(cols, hidden) {
    try { localStorage.setItem('nsva_layout_v3', JSON.stringify({ cols, hidden })); } catch (e) {}
  }
  colOf(id) {
    if (this.state.cols.left.includes(id)) return 'left';
    if (this.state.cols.right.includes(id)) return 'right';
    return null;
  }
  cloneCols() { return { left: this.state.cols.left.slice(), right: this.state.cols.right.slice() }; }
  moveWidget(dragId, targetCol, targetId) {
    if (!dragId || (targetCol !== 'left' && targetCol !== 'right')) { this.setState({ dragId: null }); return; }
    const cols = this.cloneCols();
    ['left', 'right'].forEach(c => { const i = cols[c].indexOf(dragId); if (i >= 0) cols[c].splice(i, 1); });
    const arr = cols[targetCol];
    let to = (targetId && targetId !== dragId) ? arr.indexOf(targetId) : arr.length;
    if (to < 0) to = arr.length;
    arr.splice(to, 0, dragId);
    this.setState({ cols, dragId: null });
    this.persistLayout(cols, this.state.hidden);
  }
  toggleWidget(id) {
    const v = this.state.view;
    const dv = v && this.viewDefs()[v];
    if (dv && dv.cols) {
      // module views keep their own layout + hide-list so they never disturb the Hydra layout
      const vh = Object.assign({}, this.state.viewHidden || {});
      const cur = (vh[v] || []).slice();
      const i = cur.indexOf(id);
      const eff = this.viewColsEff(v);
      const placed = eff.left.includes(id) || eff.right.includes(id);
      if (!placed) {
        // a widget from the Kontrollcenter that isn't in this view yet → add it to its home column
        const nc = { left: eff.left.slice(), right: eff.right.slice() };
        nc[this.homeCol(id)].push(id);
        this.saveViewLayout(v, nc);
        if (i >= 0) cur.splice(i, 1);
      } else if (i >= 0) cur.splice(i, 1); else cur.push(id);
      vh[v] = cur;
      this.setState({ viewHidden: vh });
      try { localStorage.setItem('nsva_view_hidden', JSON.stringify(vh)); } catch (e) {}
      return;
    }
    const hidden = this.state.hidden.slice();
    const cols = this.cloneCols();
    const hi = hidden.indexOf(id);
    if (hi >= 0) {
      hidden.splice(hi, 1);
      if (!cols.left.includes(id) && !cols.right.includes(id)) cols[this.homeCol(id)].push(id);
    } else {
      ['left', 'right'].forEach(c => { const i = cols[c].indexOf(id); if (i >= 0) cols[c].splice(i, 1); });
      hidden.push(id);
    }
    this.setState({ cols, hidden });
    this.persistLayout(cols, hidden);
  }
  setWidgetCol(id, targetCol) {
    const v = this.state.view, dv = v && this.viewDefs()[v];
    if (dv && dv.cols) {
      if (this.viewCol(id) === targetCol) return;
      const eff = this.viewColsEff(v);
      const nc = { left: eff.left.filter(x => x !== id), right: eff.right.filter(x => x !== id) };
      nc[targetCol].push(id);
      this.saveViewLayout(v, nc);
      const vh = Object.assign({}, this.state.viewHidden || {});
      vh[v] = (vh[v] || []).filter(x => x !== id);
      this.setState({ viewHidden: vh });
      try { localStorage.setItem('nsva_view_hidden', JSON.stringify(vh)); } catch (e) {}
      return;
    }
    if (this.colOf(id) === targetCol) return;
    const hidden = this.state.hidden.slice();
    const hi = hidden.indexOf(id); if (hi >= 0) hidden.splice(hi, 1);
    const cols = this.cloneCols();
    ['left', 'right'].forEach(c => { const i = cols[c].indexOf(id); if (i >= 0) cols[c].splice(i, 1); });
    cols[targetCol].push(id);
    this.setState({ cols, hidden });
    this.persistLayout(cols, hidden);
  }
  resetLayout() {
    const v = this.state.view, dv = v && this.viewDefs()[v];
    if (dv && dv.cols) {
      const vl = Object.assign({}, this.state.viewLayout || {}); delete vl[v];
      const vh = Object.assign({}, this.state.viewHidden || {}); delete vh[v];
      this.setState({ viewLayout: vl, viewHidden: vh });
      try { localStorage.setItem('nsva_view_layout', JSON.stringify(vl)); localStorage.setItem('nsva_view_hidden', JSON.stringify(vh)); } catch (e) {}
      return;
    }
    const def = this.defaultLayout();
    this.setState({ cols: def.cols, hidden: def.hidden });
    this.persistLayout(def.cols, def.hidden);
  }
  colDropCtl(col) {
    return {
      onOver: (e) => { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (_) {} },
      onDrop: (e) => { e.preventDefault(); this.moveWidget(this.state.dragId, col, null); },
    };
  }
  // ---------- Hydra modules (views) ----------
  // hydra = hela kontrollcentret (användarens layout); övriga moduler har en fast, fokuserad layout.
  viewDefs() {
    return {
      hydra: { title: 'HYDRA · KONTROLLCENTER', sub: 'Hela verksamheten' },
      visky: { title: 'VISKY · VISUALISERING AV SKYFALL', sub: 'Nederbörd · havsvattenstånd · regnmätare · SMHI · DMI · radar',
        cols: { left: ['radar', 'prognos', 'hav'], right: ['matare', 'anmal', 'ai'] },
        filters: ['skyfall', 'regn', 'vind', 'anmal', 'radartack'], autoOn: ['skyfall'] },
      prod: { title: 'PRODUKTION · DRICKSVATTEN', sub: 'Flödesmätare · ledningsnät och pumpstationer',
        cols: { left: ['flode'], right: ['dricks', 'alarm'] },
        filters: ['alarm'], autoOn: [] },
    };
  }
  setView(v) {
    const d = this.viewDefs()[v];
    const f = { skyfall: false, vind: false, alarm: false, anmal: false };
    if (d && d.autoOn) d.autoOn.forEach(k => { f[k] = true; });
    this.setState({ view: v, selected: null, selFac: null, openWidget: null, settingsOpen: false, filters: v === 'hydra' ? this.state.filters : f, skyfallScan: false });
    if (v === 'visky' && f.skyfall && !this.state.filters.skyfall) setTimeout(() => { try { this.applyMapFilters(); } catch (e) {} }, 60);
    setTimeout(() => { if (this.map) this.map.invalidateSize(); try { this.updateMarkers(); } catch (e) {} }, 80);
  }
  // Module views start with their focused default columns, but the user may add any other widget (saved per view)
  viewColsEff(v) {
    const d = this.viewDefs()[v];
    const o = (this.state.viewLayout || {})[v];
    // a saved layout from before the Regnmätare widget existed → add it at the top of the right column
    if (o && v === 'visky' && !o.left.includes('matare') && !o.right.includes('matare')) return { left: o.left, right: ['matare'].concat(o.right) };
    return o ? o : (d && d.cols ? d.cols : null);
  }
  saveViewLayout(v, cols) {
    const vl = Object.assign({}, this.state.viewLayout || {}); vl[v] = cols;
    this.setState({ viewLayout: vl });
    try { localStorage.setItem('nsva_view_layout', JSON.stringify(vl)); } catch (e) {}
  }
  viewCol(id) {
    const d = this.viewDefs()[this.state.view || 'hydra'];
    if (!d || !d.cols) return this.colOf(id);
    const vh = (this.state.viewHidden || {})[this.state.view] || [];
    if (vh.includes(id)) return null;
    const c = this.viewColsEff(this.state.view);
    if (c.left.includes(id)) return 'left';
    if (c.right.includes(id)) return 'right';
    return null;
  }
  widgetCtl(id) {
    const col = this.viewCol(id);
    const d = this.viewDefs()[this.state.view || 'hydra'];
    const list = col ? ((d && d.cols) ? this.viewColsEff(this.state.view)[col] : this.state.cols[col]) : [];
    const radarOk = id !== 'radar' || this.props.showWeatherRadar !== false;
    return {
      inLeft: col === 'left' && radarOk,
      inRight: col === 'right' && radarOk,
      order: Math.max(0, list.indexOf(id)),
      glow: this.state.focused === id ? ('0 0 0 1.5px ' + this.acHex() + ', 0 0 24px rgba(' + this.acGlow() + ',.4)') : (this.state.dragId === id && this.state.dragActive ? '0 14px 40px rgba(0,0,0,.6)' : 'none'),
      dim: this.state.dragId && this.state.dragId !== id && this.state.dragActive ? '0.62' : '1',
      onDown: (e) => this.startDrag(id, e),
      onClick: (e) => { if (e && e.stopPropagation) e.stopPropagation(); },
      open: (e) => { if (e && e.stopPropagation) e.stopPropagation(); if (this._wasDrag) { this._wasDrag = false; return; } this.openWidgetDetail(id); },
      hide: (e) => { if (e && e.stopPropagation) e.stopPropagation(); if (e && e.preventDefault) e.preventDefault(); if (this.viewCol(id)) this.toggleWidget(id); },
      hideDown: (e) => { if (e && e.stopPropagation) e.stopPropagation(); },
    };
  }
  // ---------- Översvämningsanmälningar från allmänheten (CRM) ----------
  // Live: this.reports (array from GET /api/reports). Simulated otherwise, seeded so it is stable between renders.
  baseReports() {
    if (this.reports && this.reports.length) return this.reports;
    const now = Date.now();
    const ago = (h) => new Date(now - h * 3600000).toISOString();
    return [
      // Helsingborg — cluster in the low-lying south/east districts (Ramlösa/Elineberg/Planteringen), clear of the kommun node
      { id: 'CRM-88240', reportedAt: ago(0.3), kommun: 'helsingborg', address: 'Ramlösa Brunnsgata 4, Helsingborg', lat: 56.0208, lng: 12.7392, category: 'gata', severity: 2, status: 'new', description: 'Vatten över hela gatan, går inte att passera med bil.' },
      { id: 'CRM-88238', reportedAt: ago(0.4), kommun: 'helsingborg', address: 'Elinebergsvägen 17, Helsingborg', lat: 56.0246, lng: 12.7301, category: 'källaröversvämning', severity: 3, status: 'new', description: 'Källare full med vatten, ca 20 cm. Elcentral hotad.' },
      { id: 'CRM-88236', reportedAt: ago(0.5), kommun: 'helsingborg', address: 'Planteringsvägen 15, Helsingborg', lat: 56.0298, lng: 12.7188, category: 'dagvattenbrunn', severity: 1, status: 'new', description: 'Brunnen bubblar upp, vatten på trottoaren.' },
      { id: 'CRM-88231', reportedAt: ago(0.6), kommun: 'helsingborg', address: 'Södergatan 62, Helsingborg', lat: 56.0356, lng: 12.7122, category: 'källaröversvämning', severity: 3, status: 'new', description: 'Vatten stiger i källaren, ca 10 cm. Kommer in via golvbrunn.' },
      { id: 'CRM-88230', reportedAt: ago(0.8), kommun: 'helsingborg', address: 'Fältarpsvägen 6, Helsingborg', lat: 56.0374, lng: 12.7261, category: 'källaröversvämning', severity: 2, status: 'new', description: 'Avloppsvatten tränger upp i källarens golvbrunn.' },
      { id: 'CRM-88228', reportedAt: ago(1.1), kommun: 'helsingborg', address: 'Miatorpsvägen 3, Helsingborg', lat: 56.0189, lng: 12.7241, category: 'gata', severity: 1, status: 'in_progress', description: 'Vattensamling i gatans lågpunkt, ca 10 cm djup.' },
      { id: 'CRM-88226', reportedAt: ago(1.2), kommun: 'helsingborg', address: 'Rååvägen 88, Helsingborg', lat: 56.0121, lng: 12.7444, category: 'gata', severity: 2, status: 'new', description: 'Cykelbanan under viadukten helt under vatten.' },
      { id: 'CRM-88229', reportedAt: ago(1.4), kommun: 'helsingborg', address: 'Ramlösavägen 22, Helsingborg', lat: 56.0231, lng: 12.7409, category: 'gata', severity: 2, status: 'in_progress', description: 'Gatan står under vatten vid busshållplatsen, bilar kör inte förbi.' },
      // Landskrona — cluster in the eastern/southern town, away from the node
      { id: 'CRM-88225', reportedAt: ago(1.3), kommun: 'landskrona', address: 'Österleden 41, Landskrona', lat: 55.8642, lng: 12.8571, category: 'källaröversvämning', severity: 3, status: 'new', description: 'Hela källaren står under vatten, hyresfastighet med 12 lägenheter.' },
      { id: 'CRM-88223', reportedAt: ago(1.6), kommun: 'landskrona', address: 'Säbygatan 18, Landskrona', lat: 55.8601, lng: 12.8498, category: 'gata', severity: 1, status: 'in_progress', description: 'Gatubrunn tar inte emot vattnet, gatan svämmar.' },
      { id: 'CRM-88224', reportedAt: ago(2.1), kommun: 'landskrona', address: 'Karlslundsvägen 9, Landskrona', lat: 55.8583, lng: 12.8622, category: 'källaröversvämning', severity: 2, status: 'new', description: 'Vatten i källaren sedan kl 17. Luktar avlopp.' },
      { id: 'CRM-88171', reportedAt: ago(26), kommun: 'landskrona', address: 'Eriksgatan 40, Landskrona', lat: 55.8668, lng: 12.8541, category: 'annat', severity: 1, status: 'closed', closedAt: ago(20), description: 'Vatten i garage efter skyfall. Dränering misstänks.' },
      // Bjuv — south-west of the town centre
      { id: 'CRM-88221', reportedAt: ago(1.9), kommun: 'bjuv', address: 'Billesholmsvägen 21, Bjuv', lat: 56.0712, lng: 12.9021, category: 'källaröversvämning', severity: 2, status: 'new', description: 'Vatten i källaren via golvbrunn, ca 5 cm och stiger.' },
      { id: 'CRM-88198', reportedAt: ago(9.5), kommun: 'bjuv', address: 'Ekebyvägen 9, Bjuv', lat: 56.0738, lng: 12.8962, category: 'källaröversvämning', severity: 2, status: 'closed', closedAt: ago(4.0), description: 'Källare fylldes vid kraftigt regn. Nu torrt, behöver kontroll av backventil.' },
      // Åstorp — north-east industrial/residential edge
      { id: 'CRM-88220', reportedAt: ago(2.0), kommun: 'astorp', address: 'Malmövägen 9, Åstorp', lat: 56.1462, lng: 12.9648, category: 'gata', severity: 2, status: 'new', description: 'Gatan vid stationen under vatten, bussar omdirigeras.' },
      { id: 'CRM-88210', reportedAt: ago(5.0), kommun: 'astorp', address: 'Björnekullagatan 7, Åstorp', lat: 56.1488, lng: 12.9702, category: 'gata', severity: 1, status: 'closed', closedAt: ago(1.2), description: 'Vattensamling på gatan efter regnet, ca 5 cm.' },
      // Örkelljunga — south of the centre, by the lake
      { id: 'CRM-88218', reportedAt: ago(2.4), kommun: 'orkelljunga', address: 'Hjälmsjövägen 44, Örkelljunga', lat: 56.2694, lng: 13.2901, category: 'källaröversvämning', severity: 3, status: 'new', description: 'Källaren fylls snabbt, pump räcker inte till.' },
      { id: 'CRM-88219', reportedAt: ago(3.3), kommun: 'orkelljunga', address: 'Skånes Fagerhultsvägen 3, Örkelljunga', lat: 56.2668, lng: 13.2962, category: 'dagvattenbrunn', severity: 1, status: 'in_progress', description: 'Brunnen vid korsningen svämmar över, vattnet rinner in på tomten.' },
      // Perstorp — west edge
      { id: 'CRM-88216', reportedAt: ago(2.7), kommun: 'perstorp', address: 'Oderljungavägen 3, Perstorp', lat: 56.1421, lng: 13.3712, category: 'dagvattenbrunn', severity: 1, status: 'new', description: 'Brunn på gatan svämmar över, vatten rinner mot husgrunden.' },
      // Svalöv — north side
      { id: 'CRM-88214', reportedAt: ago(3.0), kommun: 'svalov', address: 'Teckomatorpsvägen 12, Svalöv', lat: 55.9241, lng: 13.0932, category: 'gata', severity: 1, status: 'in_progress', description: 'Stor vattensamling i korsningen, dålig sikt för trafik.' },
      // Båstad — Hemmeslöv / eastern shore
      { id: 'CRM-88212', reportedAt: ago(3.1), kommun: 'bastad', address: 'Hemmeslövsvägen 30, Båstad', lat: 56.4198, lng: 12.8771, category: 'källaröversvämning', severity: 2, status: 'new', description: 'Vatten i restaurangens källare, kyl- och frysrum drabbade.' },
    ];
  }
  reportCatLabel(c) { return ({ 'källaröversvämning': 'Källare', gata: 'Gata', dagvattenbrunn: 'Dagvattenbrunn', annat: 'Annat' })[c] || c; }
  reportStatus(s) { return s === 'new' ? { txt: 'NY', color: '#ff5a6e' } : s === 'in_progress' ? { txt: 'PÅGÅR', color: '#ffb547' } : { txt: 'AVSLUTAD', color: '#2fe6c4' }; }
  reportSevColor(sv) { return sv >= 3 ? '#ff5a6e' : sv === 2 ? '#ffb547' : '#35d6f2'; }
  reportAge(iso) {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return m + ' min';
    const h = Math.round(m / 60); if (h < 48) return h + ' tim';
    return Math.round(h / 24) + ' d';
  }
  reportView(r) {
    const st = this.reportStatus(r.status);
    return {
      id: r.id, address: r.address, description: r.description, muniName: this.muniName(r.kommun),
      cat: this.reportCatLabel(r.category), sevTxt: r.severity >= 3 ? 'ALLVARLIG' : r.severity === 2 ? 'MÅTTLIG' : 'LINDRIG', sevColor: this.reportSevColor(r.severity),
      statusTxt: st.txt, statusColor: st.color, age: this.reportAge(r.reportedAt),
      time: new Date(r.reportedAt).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      bg: r.status === 'closed' ? 'rgba(74,196,224,.05)' : r.severity >= 3 ? 'rgba(255,90,110,.08)' : 'rgba(255,181,71,.07)',
      border: r.status === 'closed' ? 'rgba(74,196,224,.14)' : r.severity >= 3 ? 'rgba(255,90,110,.3)' : 'rgba(255,181,71,.26)',
      open: () => this.selectMuni(r.kommun),
    };
  }
  reportsSummary(sel) {
    const all = this.baseReports().filter(r => !sel || r.kommun === sel);
    const active = all.filter(r => r.status !== 'closed');
    return {
      all, active,
      newCount: all.filter(r => r.status === 'new').length,
      progCount: all.filter(r => r.status === 'in_progress').length,
      closedCount: all.filter(r => r.status === 'closed').length,
      activeCount: active.length,
      list: active.slice(0, 4).map(r => this.reportView(r)),
      allList: all.map(r => this.reportView(r)),
      hasList: active.length > 0,
    };
  }
  widgetMenu() {
    const ac = this.acHex(), acg = this.acGlow();
    const d = this.viewDefs()[this.state.view || 'hydra'];
    // module views: their own widgets first (standard), then every other Kontrollcenter widget to add
    const ids = d.cols ? d.cols.left.concat(d.cols.right, this.allWidgets().filter(x => !d.cols.left.includes(x) && !d.cols.right.includes(x))) : this.allWidgets();
    return ids.map(id => {
      const col = d.cols ? this.viewCol(id) : this.colOf(id);
      const visible = col !== null;
      return {
        id, label: this.widgetLabel(id), visible, col,
        toggle: () => this.toggleWidget(id),
        toLeft: () => this.setWidgetCol(id, 'left'),
        toRight: () => this.setWidgetCol(id, 'right'),
        labelColor: visible ? '#dceef5' : '#5b7a85',
        boxBg: visible ? ac : 'transparent',
        boxBorder: visible ? ac : 'rgba(74,196,224,.4)',
        colOpacity: visible ? '1' : '0.35',
        leftBg: col === 'left' ? 'rgba(' + acg + ',.2)' : 'rgba(8,22,30,.5)',
        leftBorder: col === 'left' ? ac : 'rgba(74,196,224,.2)',
        leftColor: col === 'left' ? '#eaf7fb' : '#7fa8b5',
        rightBg: col === 'right' ? 'rgba(' + acg + ',.2)' : 'rgba(8,22,30,.5)',
        rightBorder: col === 'right' ? ac : 'rgba(74,196,224,.2)',
        rightColor: col === 'right' ? '#eaf7fb' : '#7fa8b5',
      };
    });
  }

  // ---------- water systems (drinking / waste / storm) ----------
  stormF(id) {
    const w = this.weather;
    if (w) {
      // SMHI-driven: storm factor from real precipitation (mm/h). 0mm→0, ~12mm/h→1.
      let p;
      if (id && w.byMuni && w.byMuni[id] && w.byMuni[id].now) p = w.byMuni[id].now.precip || 0;
      else p = w.maxP || 0;
      return Math.max(0, Math.min(1, p / 12));
    }
    const m = { orkelljunga: 1, perstorp: 0.85, astorp: 0.5, bastad: 0.45, bjuv: 0.35, helsingborg: 0.2, landskrona: 0.2, svalov: 0.3 };
    return m[id] != null ? m[id] : 0.3;
  }
  spk(base, amp, seed, n) {
    n = n || 14;
    return Array.from({ length: n }, (_, i) => ({ h: Math.max(10, Math.min(96, Math.round(base + Math.sin((this.state.tick + i + seed) * 0.6) * amp + (i / n) * 8))) }));
  }
  systems(sel) {
    const baseM = this.baseMunis();
    const byId = {}; baseM.forEach(m => { byId[m.id] = m; });
    let dricksFlow, spillFlow, dagFlow, pumpLvl, magLvl, turb, ph, sf, drinkLevels;
    if (sel) {
      const m = byId[sel]; sf = this.stormF(sel);
      dricksFlow = this.j(m.prod, m.prod * 0.02, 3);
      spillFlow = this.j(m.prod * (0.8 + 0.55 * sf), m.prod * 0.03, 6);
      dagFlow = this.j(m.prod * (0.12 + 1.2 * sf), m.prod * 0.05, 9);
      pumpLvl = this.j(42 + 40 * sf, 2.5, 7);
      magLvl = this.j(38 + 55 * sf, 2.5, 8);
      turb = sel === 'svalov' ? this.j(0.9, 0.05, 2) : this.j(0.18, 0.02, 2);
      ph = this.j(7.8, 0.05, 3);
      drinkLevels = [
        { name: 'Reservoar Norra', v: this.j(m.res[0], 1.2, 1) },
        { name: 'Reservoar Södra', v: this.j(m.res[1], 1.2, 2) },
      ];
    } else {
      sf = baseM.reduce((a, m) => a + this.stormF(m.id), 0) / baseM.length;
      dricksFlow = 0; baseM.forEach((m, i) => { dricksFlow += this.j(m.prod, m.prod * 0.02, i); });
      spillFlow = 0; baseM.forEach((m, i) => { spillFlow += this.j(m.prod * (0.8 + 0.55 * this.stormF(m.id)), m.prod * 0.03, i + 6); });
      dagFlow = 0; baseM.forEach((m, i) => { dagFlow += this.j(m.prod * (0.12 + 1.2 * this.stormF(m.id)), m.prod * 0.05, i + 9); });
      pumpLvl = this.j(40 + 48 * sf, 2.5, 7); magLvl = this.j(28 + 62 * sf, 2.5, 8);
      turb = this.j(0.21, 0.02, 2); ph = this.j(7.8, 0.05, 3);
      drinkLevels = [
        { name: 'Örkelljunga · Södra', v: this.j(28, 1.2, 0) },
        { name: 'Svalöv · Södra', v: this.j(43, 1.2, 1) },
        { name: 'Helsingborg · Ringstorp', v: this.j(81, 1.2, 2) },
      ];
    }
    const drinkOK = turb < 0.5;
    const bradd = (magLvl > 85 || pumpLvl > 88) ? 'AKTIV' : ((sf >= 0.6 || pumpLvl > 70) ? 'RISK' : 'NEJ');
    const braddColor = bradd === 'AKTIV' ? '#ff5a6e' : bradd === 'RISK' ? '#ffb547' : '#2fe6c4';
    const dagStatus = magLvl > 85 ? 'KRITISK' : magLvl > 65 ? 'HÖG' : 'NORMAL';
    const dagColor = magLvl > 85 ? '#ff5a6e' : magLvl > 65 ? '#ffb547' : '#2fe6c4';
    return {
      dricks: {
        flowTxt: this.fmt(dricksFlow), deltaTxt: '+' + this.j(2.4, 0.5, 1).toFixed(1).replace('.', ',') + '%',
        spark: this.spk(48, 22, 0), pressureTxt: this.j(4.2, 0.06, 2).toFixed(1).replace('.', ','),
        turbTxt: turb.toFixed(2).replace('.', ',') + ' NTU', phTxt: ph.toFixed(1).replace('.', ','),
        qualTxt: drinkOK ? 'God kvalitet' : 'Kontrollera', qualColor: drinkOK ? '#2fe6c4' : '#ffb547',
        levels: drinkLevels.map(r => ({ name: r.name, pct: Math.round(r.v), pctTxt: Math.round(r.v) + '%', color: this.colorFor(r.v) })),
      },
      spill: {
        flowTxt: this.fmt(spillFlow), spark: this.spk(46, 20, 6),
        pumpTxt: Math.round(pumpLvl) + '%', pumpColor: this.colorFor(100 - pumpLvl),
        braddTxt: bradd, braddColor,
        loadTxt: Math.round(Math.min(99, 55 + 45 * sf)) + '%',
      },
      dag: {
        flowTxt: this.fmt(dagFlow), spark: this.spk(40, 26, 9),
        magTxt: Math.round(magLvl) + '%', magPct: Math.round(magLvl), magColor: dagColor,
        capTxt: Math.round(Math.max(1, 100 - magLvl)) + '%',
        statusTxt: dagStatus, statusColor: dagColor,
        rainTxt: this.liveRain(sel),
      },
    };
  }
  liveRain(sel) {
    const w = this.weather;
    if (w) {
      if (sel && w.byMuni[sel] && w.byMuni[sel].now) return (Math.round((w.byMuni[sel].now.precip || 0) * 10) / 10).toString().replace('.', ',') + ' mm/h';
      return (Math.round(w.maxP * 10) / 10).toString().replace('.', ',') + ' mm/h';
    }
    return sel ? (Math.round(this.stormF(sel) * 32)) + ' mm/h' : '32 mm/h';
  }
  // Grid of SMHI forecast points covering the whole visible map (NV Skåne + Öresund + Danish coast)
  rainGridPoints() {
    const pts = [];
    for (let lat = 55.55; lat <= 56.65; lat += 0.22) for (let lng = 12.0; lng <= 13.95; lng += 0.32) pts.push({ lat: +lat.toFixed(3), lng: +lng.toFixed(3) });
    return pts;
  }
  // Simulated rain field (used when SMHI is unreachable): a band over the NE drifting SW over time
  simRainAt(lat, lng, hour) {
    const cx = 13.35 - hour * 0.09, cy = 56.32 - hour * 0.05;
    const d = Math.hypot((lng - cx) * 0.62, lat - cy);
    if (this.state.tv) {
      // TV demo: a wide, mostly light band (blå → ljusblå → grön → gul → orange) with two small intense cores (röd)
      const broad = Math.max(0, 0.9 - d * 1.5);              // mostly 0,2–0,9 mm/h → blå/ljusblå/grön
      const mid = Math.max(0, 1.7 - d * 8);                    // gul → orange towards the centre
      const core = (ox, oy) => Math.max(0, 11 - Math.hypot((lng - (cx + ox)) * 0.62, lat - (cy + oy)) * 170);
      return broad + mid + core(-0.26, -0.07) + core(0.24, 0.07); // two small röda punkter
    }
    return Math.max(0, 14 - d * 34);
  }
  // Measured precipitation for the past 12 h (SMHI metobs, parameter 7 = nederbörd senaste timmen).
  // Several stations across NV Skåne → lets the map scrub BACKWARDS with measured data (nearest station per point).
  rainStations() {
    return [
      { id: '62040', name: 'Helsingborg A', lat: 56.030, lng: 12.765 },
      { id: '62010', name: 'Barkåkra', lat: 56.296, lng: 12.855 },
      { id: '62180', name: 'Hallands Väderö A', lat: 56.448, lng: 12.546 },
      { id: '63510', name: 'Ljungbyhed A', lat: 56.081, lng: 13.229 },
      { id: '53430', name: 'Hörby A', lat: 55.860, lng: 13.670 },
      { id: '52350', name: 'Malmö A', lat: 55.571, lng: 13.072 },
    ];
  }
  // Discover ALL active open rain gauges in the region:
  //  · SMHI metobs param 7 — includes Försvarsmaktens stationer (flygplatser) which SMHI publishes; tagged by owner
  //  · DMI metObs (Själland/Öresund) — precip_past1h, open, no key
  rainBbox() { return { s: 55.35, n: 56.75, w: 12.0, e: 14.1 }; }
  async fetchRainHistory() {
    if (typeof window === 'undefined' || !window.fetch) return;
    const bb = this.rainBbox();
    const getJ = async (url, ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 7000); try { const r = await fetch(url, { signal: c.signal }); clearTimeout(t); return r.ok ? await r.json() : null; } catch (e) { clearTimeout(t); return null; } };
    const inBox = (lat, lng) => lat >= bb.s && lat <= bb.n && lng >= bb.w && lng <= bb.e;
    const got = [];
    // --- SMHI (+ Försvarsmakten) ---
    let smhiList = null;
    const p7 = await getJ('/smhi-metobs/api/version/1.0/parameter/7.json');
    if (p7 && p7.station) {
      const now = Date.now();
      smhiList = p7.station.filter(s => s.active && inBox(s.latitude, s.longitude) && (!s.to || s.to > now - 3 * 86400000))
        .map(s => ({ id: String(s.key), name: s.name, lat: s.latitude, lng: s.longitude,
          src: /försvar|forsvar|FM\b/i.test((s.owner || '') + ' ' + (s.ownerCategory || '')) ? 'FM' : 'SMHI' }));
    }
    const smhiStations = (smhiList && smhiList.length ? smhiList : this.rainStations().map(s => Object.assign({ src: 'SMHI' }, s))).slice(0, 40);
    await Promise.all(smhiStations.map(async (st) => {
      const j = await getJ('/smhi-metobs/api/version/1.0/parameter/7/station/' + st.id + '/period/latest-day/data.json', 6000);
      // keep only real numbers (missing ≠ 0); SMHI quality G = kontrollerat, Y = misstänkt/aggregerat (behålls men flaggas)
      const vals = j && (j.value || []).map(v => ({ t: Number(v.date), mm: parseFloat(v.value), q: v.quality }))
        .filter(v => isFinite(v.mm) && isFinite(v.t)).slice(-14);
      if (vals && vals.length) got.push(Object.assign({}, st, { vals }));
    }));
    // --- DMI (Danmark, Öresund) ---
    try {
      const to = new Date(), from = new Date(to.getTime() - 13 * 3600000);
      const iso = d => d.toISOString().replace(/\.\d+Z$/, 'Z');
      const url = '/dmi-metobs/v2/metObs/collections/observation/items?parameterId=precip_past1h&bbox=' + [bb.w, bb.s, 12.75, bb.n].join(',') + '&datetime=' + iso(from) + '/' + iso(to) + '&limit=5000';
      const d = await getJ(url, 8000);
      if (d && d.features) {
        const by = {};
        d.features.forEach(f => {
          const p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
          if (!p.stationId || c.length < 2) return;
          const s = by[p.stationId] || (by[p.stationId] = { id: 'DMI-' + p.stationId, name: 'DMI ' + p.stationId, lat: c[1], lng: c[0], src: 'DMI', raw: [] });
          const t = Date.parse(p.observed), mm = parseFloat(p.value);
          if (isFinite(t) && isFinite(mm)) s.raw.push({ t, mm });
        });
        // precip_past1h can be reported every 10 min — keep one value per clock hour (the one at :00, else latest)
        Object.values(by).forEach(s => {
          const hourly = {};
          s.raw.forEach(v => { const hk = Math.round(v.t / 3600000); const onHour = new Date(v.t).getUTCMinutes() === 0; if (!hourly[hk] || onHour) hourly[hk] = v; });
          s.vals = Object.values(hourly).sort((a, b) => a.t - b.t).slice(-14); delete s.raw;
          if (s.vals.length) got.push(s);
        });
      }
    } catch (e) {}
    if (got.length) {
      this.rainHistStations = got;
      this._rainStamp = Date.now();
      this.computeRainBias();
      this.computeRadarCal();
      this.rainHist = (got.find(s => s.id === '62040') || got.find(s => s.src !== 'DMI') || got[0]).vals;
      this.setState(s => ({ tick: s.tick }));
    }
  }
  // ---------- Inställningar → Datakällor (förklaring + live-status) ----------
  infoTopics() {
    const list = [
      ['oversikt', 'Översikt', 'Hur allt hänger ihop'],
      ['matare', 'Regnmätare', 'SMHI · Försvarsmakten · DMI'],
      ['prognos', 'Prognos', 'SMHI punktprognos'],
      ['radar', 'Regnradar', 'RainViewer-komposit'],
      ['korrektion', 'Korrektion', 'Så rättar källorna varandra'],
      ['aterkomst', 'Återkomsttid', 'Dahlström 2010'],
      ['kunskap', 'Kunskapsbas', 'Samma som MR. Hydra'],
      ['hav', 'Havsvattenstånd', 'SMHI oceanografi'],
      ['status', 'Live-status', 'Vad som når fram just nu'],
    ];
    const cur = this.state.infoTopic || 'oversikt';
    return list.map(([id, label, sub]) => {
      const on = id === cur;
      return { id, label, sub, open: () => this.setState({ infoTopic: id }),
        bg: on ? 'rgba(var(--acg,53,214,242),.14)' : 'transparent',
        border: on ? 'rgba(var(--acg,53,214,242),.45)' : 'transparent',
        color: on ? '#eaf7fb' : '#a9c7d1', subColor: on ? '#8fcfe0' : '#577684' };
    });
  }
  infoTopicFlags() {
    const cur = this.state.infoTopic || 'oversikt';
    const f = {}; ['oversikt', 'matare', 'prognos', 'radar', 'korrektion', 'aterkomst', 'kunskap', 'hav', 'status'].forEach(k => { f[k] = k === cur; });
    const k = typeof window !== 'undefined' ? window.NSVA_KUNSKAP : null;
    f.kbSkyfall = k ? k.skyfall : 'Kunskapsbasen kunde inte laddas.';
    f.kbGuide = k ? k.guide : '';
    return f;
  }
  infoLive() {
    const ok = '#2fe6c4', warn = '#ffb547', off = '#7fa8b5';
    const g = this.gaugeSourceSummary();
    const b = this.rainBias || { n: 0, factor: 1 };
    const fx = v => (Math.round(v * 100) / 100).toString().replace('.', ',');
    const seaN = this.seaObs ? Object.keys(this.seaObs).length : 0;
    const age = this._rainStamp ? Math.round((Date.now() - this._rainStamp) / 60000) : null;
    const rows = [
      { name: 'Regnmätare', val: g.total ? (g.total + ' mätare · ' + g.txt) : 'Inga mätare nåddes', note: age != null ? ('Hämtat för ' + age + ' min sedan') : 'Hämtas var 10:e minut', color: g.total ? ok : off, state: g.total ? 'LIVE' : 'SAKNAS' },
      { name: 'SMHI-prognos', val: this.weather ? ('Live · uppdaterad ' + (this.weather.updated || '')) : 'Nås inte – simulerat regn visas', note: (this.wxGrid && this.wxGrid.length ? this.wxGrid.length : 0) + ' prognospunkter över kartan', color: this.weather ? ok : off, state: this.weather ? 'LIVE' : 'SIM' },
      (() => { const D = this.dmiModel; const okD = D && D.ok; const mins = okD ? Math.round((Date.now() - D.at) / 60000) : null;
        return { name: 'DMI HARMONIE-prognos', val: okD ? ('Live · ' + (D.coarse ? 'via Open-Meteo, ~13 km' : '2 km') + ' · ' + D.times.length + ' timmar framåt') : (D ? 'Nås inte (' + (D.err || 'fel') + ') – SMHI-prognos används' : 'Hämtas…'), note: okD ? ('Hämtad för ' + mins + ' min sedan · används för +1 … +12 h') : 'Detaljerad modell över Skåne, Öresund och Danmark', color: okD ? '#2fe6c4' : '#ffb547', state: okD ? 'LIVE' : 'SAKNAS' }; })(),
      { name: 'Korrektionsfaktor', val: b.n ? ('×' + fx(b.factor) + ' från ' + b.n + ' mätare') : 'Ingen korrektion (färre än 3 mätare med värde)', note: b.n ? ('Mätare ' + fx(b.gaugeMean) + ' mm/h · SMHI ' + fx(b.modelMean) + ' mm/h senaste timmen') : 'SMHI-prognosen används som den är', color: b.n ? ok : warn, state: b.n ? 'AKTIV' : 'AV' },
      { name: 'Regnradar', val: this.rvFrames && this.rvFrames.length ? (this.rvFrames.length + ' radarbilder senaste ~2 h') : 'Nås inte', note: (this.radarFrames && this.radarFrames.length ? (this.radarFrames.length + ' bilder avlästa · senaste för ' + Math.round((Date.now() - this.radarFrames[this.radarFrames.length - 1].t) / 60000) + ' min sedan') : 'Inga bilder avlästa') + ((this.radarCalInfo && this.radarCalInfo.n) ? ' · kalibrering ×' + (Math.round(this.radarCalInfo.factor * 100) / 100).toString().replace('.', ',') + ' (' + this.radarCalInfo.n + ' mätare)' : ' · ingen kalibrering ännu'), color: this.rvFrames && this.rvFrames.length ? ok : off, state: this.rvFrames && this.rvFrames.length ? 'LIVE' : 'SAKNAS' },
      { name: 'Havsvattenstånd', val: seaN ? (seaN + ' av 3 stationer uppmätta') : 'Inga uppmätta värden – beräknat', note: 'Viken · Barsebäck · Klagshamn', color: seaN ? ok : warn, state: seaN ? 'LIVE' : 'EST' },
    ];
    return { rows };
  }
  gaugeSourceSummary() {
    const st = this.rainHistStations || [];
    const c = { SMHI: 0, FM: 0, DMI: 0 };
    st.forEach(s => { c[s.src] = (c[s.src] || 0) + 1; });
    return { total: st.length, txt: [c.SMHI ? c.SMHI + ' SMHI' : '', c.FM ? c.FM + ' Försvarsmakten' : '', c.DMI ? c.DMI + ' DMI' : ''].filter(Boolean).join(' · ') };
  }
  async fetchRainHistoryLegacy() {
    if (typeof window === 'undefined' || !window.fetch) return;
    const got = [];
    await Promise.all(this.rainStations().map(async (st) => {
      try {
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch('/smhi-metobs/api/version/1.0/parameter/7/station/' + st.id + '/period/latest-day/data.json', { signal: ctrl.signal });
        clearTimeout(to);
        if (!r.ok) return;
        const j = await r.json();
        const vals = (j.value || []).map(v => ({ t: v.date, mm: parseFloat(v.value) || 0 })).slice(-12);
        if (vals.length) got.push(Object.assign({}, st, { vals }));
      } catch (e) {}
    }));
    if (got.length) {
      this.rainHistStations = got;
      this.rainHist = (got.find(s => s.id === '62040') || got[0]).vals; // prognos-widget uses Helsingborg A when available
      this.setState(s => ({ tick: s.tick }));
    }
  }
  // ================= HYDRA nederbördsmodell: regnmätare + SMHI-prognos =================
  // 1) Timestamp alignment: each gauge value is matched to an ABSOLUTE clock hour (not array position);
  //    a missing hour = null (excluded), never silently 0.
  // 2) Historik (−12…−1 h): inverse-distance weighting (IDW²) over all gauges within 35 km.
  // 3) Nu (0 h): mean-field bias between gauges and SMHI at gauge positions, plus local blend with nearby gauges.
  // 4) Prognos (+1…+12 h): SMHI × bias, bias decays toward 1 (e-folding 3 h) — gauges inform the near-term.
  kmDist(aLat, aLng, bLat, bLng) { const dx = (aLng - bLng) * 111.32 * Math.cos(aLat * Math.PI / 180), dy = (aLat - bLat) * 110.57; return Math.hypot(dx, dy); }
  hourEnd(hour) { const h = 3600000, floor = Math.floor(Date.now() / h) * h; return floor + (hour + 1) * h - (hour >= 0 ? h : 0); }
  // Gauge value (mm/h) for the hour ending at hourEnd(hour); hour 0 = latest value if ≤ 90 min old
  gaugeVal(s, hour) {
    if (!s.vals || !s.vals.length) return null;
    if (hour >= 0) { const v = s.vals[s.vals.length - 1]; return (v && Date.now() - v.t <= 90 * 60000) ? v.mm : null; }
    const target = this.hourEnd(hour);
    let best = null, bd = Infinity;
    for (const v of s.vals) { const d = Math.abs(v.t - target); if (d < bd) { bd = d; best = v; } }
    return best && bd <= 35 * 60000 ? best.mm : null;
  }
  // IDW estimate from gauges; returns { mm, w, n } (w = total weight, a confidence proxy)
  gaugeIdw(lat, lng, hour, radiusKm) {
    const st = this.rainHistStations; if (!st || !st.length) return { mm: null, w: 0, n: 0 };
    const R = radiusKm || 35;
    let sw = 0, sv = 0, n = 0, nearest = null, nd = Infinity;
    for (const s of st) {
      const v = this.gaugeVal(s, hour); if (v == null || v < 0 || v > 150) continue; // QC: drop missing + impossible
      const d = this.kmDist(lat, lng, s.lat, s.lng);
      if (d < nd) { nd = d; nearest = v; }
      if (d > R) continue;
      const w = 1 / Math.pow(Math.max(d, 1.5), 2);
      sw += w; sv += w * v; n++;
    }
    if (n) return { mm: sv / sw, w: sw, n };
    return nearest != null && nd <= 70 ? { mm: nearest, w: 0.0001, n: 1 } : { mm: null, w: 0, n: 0 };
  }
  // ---- DMI HARMONIE DINI (2 km, hourly) — detailed forecast field over Skåne, Öresund and Denmark ----
  // Fetched as CoverageJSON via the worker (/dmi-fc/). Precipitation is accumulated from model start → hourly = difference.
  async fetchDmiModel() {
    if (typeof fetch === 'undefined') return;
    const iso = t => new Date(t).toISOString().slice(0, 19) + 'Z';
    const h0 = Math.floor(Date.now() / 3600000) * 3600000;
    const url = '/dmi-fc/v1/forecastedr/collections/harmonie_dini_sf/bbox?bbox=11.0,55.1,14.6,56.95&crs=crs84&f=CoverageJSON' +
      '&parameter-name=total-precipitation,latitude,longitude&datetime=' + iso(h0 - 3600000) + '/' + iso(h0 + 13 * 3600000);
    try {
      // 1) the forecast the worker stores centrally (one DMI request for all screens); 2) direct, only if none is stored
      // only the centrally stored forecast (worker cron) — never hit DMI directly from each screen (that is what caused 429)
      const r = await fetch('/dmi-fc/latest.json', { cache: 'no-store' });
      if (!r.ok) {
        this.dmiModel = { ok: false, err: r.status === 404 ? 'ingen prognos sparad än – workern hämtar inom 10 min' : 'HTTP ' + r.status };
        clearTimeout(this._dmiRetry); this._dmiRetry = setTimeout(() => this.fetchDmiModel(), 5 * 60 * 1000); // retry soon, not in 30 min
        return;
      }
      const j = await r.json();
      // stored run may be up to ~30 min old: hours are matched on clock time, so that is fine
      if (j && j.format === 'hydra-grid') {
        // Open-Meteo fallback (same DMI HARMONIE model, ~13 km points): values are already hourly sums for the hour ENDING at t
        const n = j.lat.length, hourly = {};
        j.times.forEach((t, k) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Math.max(0, j.p[k][i] || 0); hourly[t] = a; }); // Open-Meteo: value at t = sum of the hour ending at t
        const bins = new Map(), bk = (la, lo) => Math.round(la / 0.03) + ':' + Math.round(lo / 0.05);
        // coarser points → wider bins so a lookup always finds a neighbour
        const bk2 = (la, lo) => Math.round(la / 0.12) + ':' + Math.round(lo / 0.18);
        for (let i = 0; i < n; i++) { const k = bk2(j.lat[i], j.lon[i]); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(i); }
        this.dmiModel = { ok: true, at: Date.now(), lat: j.lat, lon: j.lon, bins, coarse: true, hourly, times: Object.keys(hourly).map(Number).sort((a, b) => a - b), n, src: j.src };
        this._warnCache = null; this.setState(s => ({ tick: s.tick }));
        return;
      }
      const covs = j.type === 'CoverageCollection' ? (j.coverages || []) : [j];
      // collect per time step: {t, acc[], lat[], lon[]}
      const steps = [];
      let LAT = null, LON = null, nPts = 0;
      const tvals = c => { const ax = (c.domain && c.domain.axes) || (j.domain && j.domain.axes) || {}; return (ax.t && ax.t.values) || []; };
      covs.forEach(c => {
        const R = c.ranges || {}; const pr = R['total-precipitation']; if (!pr) return;
        const ts = tvals(c); const nt = Math.max(1, ts.length);
        const vals = pr.values || []; const per = Math.floor(vals.length / nt);
        if (R.latitude && R.longitude && !LAT) { const la = R.latitude.values, lo = R.longitude.values; LAT = la.slice(0, per); LON = lo.slice(0, per); }
        for (let k = 0; k < nt; k++) steps.push({ t: new Date(ts[k] || ts[0]).getTime(), acc: vals.slice(k * per, (k + 1) * per) });
        nPts = per;
      });
      if (!steps.length || !LAT || !nPts) { this.dmiModel = { ok: false, err: 'okänt svar' }; return; }
      steps.sort((a, b) => a.t - b.t);
      // hourly precipitation for the hour ENDING at each step
      const hourly = {};
      for (let k = 1; k < steps.length; k++) {
        if (steps[k].t - steps[k - 1].t > 3700000) continue;
        const a = steps[k].acc, b = steps[k - 1].acc, out = new Float32Array(nPts);
        for (let i = 0; i < nPts; i++) { const d = (a[i] == null || b[i] == null) ? 0 : a[i] - b[i]; out[i] = d > 0 ? d : 0; }
        hourly[steps[k].t] = out;
      }
      // spatial bins (0,03° × 0,05°) → native point index, for fast nearest lookup
      const bins = new Map(), bk = (la, lo) => Math.round(la / 0.03) + ':' + Math.round(lo / 0.05);
      for (let i = 0; i < nPts; i++) { if (LAT[i] == null) continue; const k = bk(LAT[i], LON[i]); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(i); }
      this.dmiModel = { ok: true, at: Date.now(), lat: LAT, lon: LON, bins, hourly, times: Object.keys(hourly).map(Number).sort((a, b) => a - b), n: nPts };
      this._warnCache = null; this.setState(s => ({ tick: s.tick }));
    } catch (e) { this.dmiModel = { ok: false, err: String(e && e.message || e) }; }
  }
  dmiAt(lat, lng, hour) {
    const M = this.dmiModel; if (!M || !M.ok) return null;
    const tEnd = Math.floor(Date.now() / 3600000) * 3600000 + Math.max(1, hour) * 3600000;
    const arr = M.hourly[tEnd]; if (!arr) return null;
    const sl = M.coarse ? 0.12 : 0.03, sg = M.coarse ? 0.18 : 0.05;
    const bi = Math.round(lat / sl), bj = Math.round(lng / sg);
    const cand = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const L = M.bins.get((bi + a) + ':' + (bj + b)); if (!L) continue;
      for (const i of L) cand.push({ i, d: (M.lat[i] - lat) * (M.lat[i] - lat) + ((M.lon[i] - lng) * 0.56) * ((M.lon[i] - lng) * 0.56) });
    }
    if (!cand.length) return null;
    cand.sort((x, y) => x.d - y.d);
    if (!M.coarse || cand[0].d < 1e-7) return arr[cand[0].i];
    // coarse points: smooth inverse-distance blend of the 4 nearest
    let sw = 0, sv = 0; cand.slice(0, 4).forEach(c => { const w = 1 / c.d; sw += w; sv += w * arr[c.i]; });
    return sv / sw;
  }
  modelAt(lat, lng, hour) {
    // forecast hours: DMI HARMONIE 2 km where available (keeps the real shower structure), else SMHI's point grid
    if (hour >= 1) { const d = this.dmiAt(lat, lng, hour); if (d != null) return d; }
    const g = this.wxGrid; if (!g || !g.length) return null;
    // smooth field: inverse-distance blend of the 4 nearest SMHI grid points (nearest-only gave blocky "discs")
    const h = Math.max(0, hour), near = [];
    for (const p of g) {
      const s = p.series && p.series[h]; if (!s) continue;
      const d = this.kmDist(lat, lng, p.lat, p.lng);
      if (near.length < 4) { near.push({ d, v: s.precip || 0 }); near.sort((a, b) => a.d - b.d); }
      else if (d < near[3].d) { near[3] = { d, v: s.precip || 0 }; near.sort((a, b) => a.d - b.d); }
    }
    if (!near.length) return null;
    if (near[0].d < 0.5) return near[0].v;
    let sw = 0, sv = 0; near.forEach(n => { const w = 1 / (n.d * n.d); sw += w; sv += w * n.v; });
    return sv / sw;
  }
  // Radar motion (km/h, toward-bearing) estimated from the radar itself: shift the frame ~40 min older
  // until it best matches the newest frame (block matching). Falls back to the SMHI wind when there is too little rain.
  radarMotion() {
    const fs = this.radarFrames; if (!fs || fs.length < 2) return null;
    const nw = fs[fs.length - 1];
    if (this._motion && this._motion.t === nw.t) return this._motion.v;
    let old = null, bestGap = Infinity;
    fs.forEach(f => { const gap = Math.abs((nw.t - f.t) - 40 * 60000); if (f !== nw && nw.t - f.t >= 20 * 60000 && gap < bestGap) { bestGap = gap; old = f; } });
    let v = null;
    if (old) {
      const pts = [];
      for (let la = 55.3; la <= 56.8; la += 0.075) for (let ln = 11.9; ln <= 14.3; ln += 0.12) { const n = this.radarPx(nw, la, ln); if (n != null) pts.push({ la, ln, n }); }
      const wet = pts.filter(p => p.n >= 0.2).length;
      if (wet >= 12) {
        let best = null, bestE = Infinity;
        for (let dLa = -0.27; dLa <= 0.2701; dLa += 0.03) for (let dLn = -0.45; dLn <= 0.4501; dLn += 0.045) {
          let e = 0, c = 0;
          for (const p of pts) { const o = this.radarPx(old, p.la - dLa, p.ln - dLn); if (o == null) continue; if (p.n < 0.2 && o < 0.2) continue; const df = Math.min(20, p.n) - Math.min(20, o); e += df * df; c++; }
          if (c >= 8) { const m = e / c; if (m < bestE) { bestE = m; best = { dLa, dLn }; } }
        }
        if (best) {
          const hrs = (nw.t - old.t) / 3600000;
          const kmN = best.dLa * 111 / hrs, kmE = best.dLn * 111 * Math.cos(56.1 * Math.PI / 180) / hrs;
          const sp = Math.min(80, Math.hypot(kmN, kmE));
          if (sp > 0.5) v = { kmh: sp, to: Math.atan2(kmE, kmN), src: 'radar' };
          else v = { kmh: 0, to: 0, src: 'radar' };
        }
      }
    }
    if (!v) { const w = this.weather; if (w && w.ws != null && w.wd != null) v = { kmh: w.ws * 3.6, to: (w.wd + 180) * Math.PI / 180, src: 'vind' }; }
    this._motion = { t: nw.t, v };
    return v;
  }
  // Mean-field bias (gauges vs SMHI at the same positions, latest hour). Recomputed when either source updates.
  computeRainBias() {
    const st = this.rainHistStations, g = this.wxGrid;
    const out = { factor: 1, n: 0, gaugeMean: null, modelMean: null };
    if (st && st.length && g && g.length) {
      let sg = 0, sm = 0, n = 0;
      for (const s of st) {
        const v = this.gaugeVal(s, -1); const m = this.modelAt(s.lat, s.lng, 0);
        if (v == null || m == null || v > 150) continue;
        sg += v; sm += m; n++;
      }
      if (n >= 3) {
        const raw = (sg + 0.3) / (sm + 0.3);         // +0.3 mm stabilises dry hours
        out.factor = Math.max(0.25, Math.min(4, raw));
        out.n = n; out.gaugeMean = sg / n; out.modelMean = sm / n;
      }
    }
    this.rainBias = out;
    return out;
  }
  biasAt(hour) { const b = this.rainBias; if (!b || !b.n) return 1; return 1 + (b.factor - 1) * Math.exp(-Math.max(0, hour) / 3); }
  // THE best estimate (mm/h) at any point and hour — used by map, scrubber, kommuner, återkomsttid
  // gauges = truth at their points · radar = where it rains in between (gauge-calibrated) · SMHI = everything else / future
  bestPrecipAt(lat, lng, hour, modelVal) {
    const rad = this.radarAt(lat, lng, hour);
    if (hour < 0) {
      const e = this.gaugeIdw(lat, lng, hour, 35);
      if (rad == null) return e.mm == null ? 0 : e.mm;
      if (e.mm == null) return rad;
      const a = Math.min(0.75, e.w * 40); return a * e.mm + (1 - a) * rad;
    }
    const m = (modelVal != null ? modelVal : this.modelAt(lat, lng, hour)) || 0;
    const bias = this._depth ? Math.max(0.5, Math.min(1.5, this.biasAt(hour))) : this.biasAt(hour);
    const adj = m * bias;
    if (hour === 0) {
      const base = rad != null ? rad : adj; // radar sees the shower right now; the forecast is only a fallback
      const e = this.gaugeIdw(lat, lng, -1, 20);
      if (e.mm != null && e.n) { const a = Math.min(0.5, e.w * 30); return a * e.mm + (1 - a) * base; } // gauge is an hour old → less weight than before
      return base;
    }
    // +1…+4 h: blend the moved radar image (real shower shape) into the corrected forecast; the radar's
    // share falls as the lead time grows, because showers grow and decay. Beyond +4 h: forecast only.
    if (rad != null) { const w = [0, 0.85, 0.65, 0.45, 0.25][hour] || 0; return w * rad + (1 - w) * adj; }
    return adj;
  }
  rainModelInfo(hour) {
    const n = (this.rainHistStations || []).filter(s => this.gaugeVal(s, -1) != null).length;
    const b = this.rainBias;
    const f = b && b.n ? (Math.round(this.biasAt(hour) * 100) / 100).toString().replace('.', ',') : null;
    if (hour < 0) return 'Uppmätt · ' + n + ' regnmätare (IDW)';
    if (hour === 0) return 'Nu · ' + n + ' mätare + SMHI' + (f ? ' · ×' + f : '');
    const dmi = this.dmiModel && this.dmiModel.ok && this.dmiAt(56.05, 12.7, hour) != null;
    return 'Prognos · ' + (hour <= 4 && this.radarFrames && this.radarFrames.length ? 'radar + ' : '') + (dmi ? (this.dmiModel.coarse ? 'DMI HARMONIE (Open-Meteo)' : 'DMI HARMONIE 2 km') : 'SMHI') + (f && hour <= 6 ? ' · mätarjusterad ×' + f : '');
  }
  // Legacy name kept for callers: measured past at a point
  pastPrecipAt(lat, lng, hour) { return this.bestPrecipAt(lat, lng, hour); }
  // One sampler per grid point that works for past (-12…-1), now and forecast hours, in live and simulated mode
  gridSampler(g) {
    if (g.sim || !this.weather) return h => this.simRainAt(g.lat, g.lng, h);
    return h => { const s = h >= 0 && g.series && g.series[h]; return this.bestPrecipAt(g.lat, g.lng, h, s ? (s.precip || 0) : 0); };
  }
  // ---------- SMHI official impact-based warnings (rain / skyfallsliknande regn / thunder) for NSVA's area ----------
  async fetchSmhiWarnings() {
    if (typeof fetch === 'undefined') return;
    try {
      const r = await fetch('/smhi-warn/ibww/api/version/1/warning.json'); if (!r.ok) { this.smhiWarn = { ok: false, list: [] }; return; }
      const arr = await r.json();
      const munis = this.baseMunis();
      const inPoly = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c; } return c; };
      const geoHits = geo => {
        const hits = []; const feats = !geo ? [] : geo.type === 'FeatureCollection' ? geo.features : geo.type === 'Feature' ? [geo] : [{ geometry: geo }];
        feats.forEach(f => { const g = f && (f.geometry || f); if (!g || !g.coordinates) return; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
          munis.forEach(m => { if (hits.indexOf(m.name) < 0 && polys.some(p => inPoly([m.lng, m.lat], p[0]))) hits.push(m.name); }); });
        return hits;
      };
      const list = [];
      (Array.isArray(arr) ? arr : (arr.warnings || [])).forEach(w => {
        const ev = (w.event && (w.event.sv || w.event.code)) || '';
        (w.warningAreas || []).forEach(a => {
          const desc = (a.eventDescription && (a.eventDescription.sv || a.eventDescription.code)) || ev;
          if (!/regn|skyfall|åska|aska|thunder|rain/i.test(desc + ' ' + ev + ' ' + ((w.event && w.event.code) || ''))) return;
          const names = ((a.affectedAreas || []).map(x => x.sv || x.en || '')).join(', ');
          const hits = geoHits(a.area);
          if (!hits.length && !/Skåne/i.test(names + ' ' + ((w.areaName && w.areaName.sv) || ''))) return;
          const lvl = (a.warningLevel && a.warningLevel.code) || '';
          list.push({ level: lvl, levelTxt: (a.warningLevel && a.warningLevel.sv) || lvl, event: desc, kommuner: hits.length ? hits.join(', ') : (names || 'Skåne'),
            start: a.approximateStart || a.start || '', end: a.approximateEnd || a.end || '',
            text: ((a.descriptions || w.descriptions || []).map(d => (d.text && (d.text.sv || d.text.en)) || '').filter(Boolean)[0] || '').slice(0, 260) });
        });
      });
      const rank = { RED: 3, ORANGE: 2, YELLOW: 1 };
      list.sort((x, y) => (rank[y.level] || 0) - (rank[x.level] || 0));
      this.smhiWarn = { ok: true, list, at: Date.now() };
      this._warnCache = null; this.setState(s => ({ tick: s.tick }));
    } catch (e) { this.smhiWarn = { ok: false, list: [] }; }
  }
  smhiWarnView() {
    const w = this.smhiWarn;
    const col = { RED: '#e3262b', ORANGE: '#ff9a2e', YELLOW: '#f2e81c' };
    if (!w) return { known: false, on: false, txt: 'SMHI-varningar hämtas…', color: '#7fa8b5', list: [] };
    if (!w.ok) return { known: false, on: false, txt: 'SMHI:s varningstjänst nås inte', color: '#7fa8b5', list: [] };
    if (!w.list.length) return { known: true, on: false, txt: 'SMHI: ingen varning för regn eller skyfall i NSVA:s område', color: '#2fe6c4', list: [] };
    const top = w.list[0];
    const fmt = t => { if (!t) return ''; const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }); };
    return { known: true, on: true, color: col[top.level] || '#ffb547',
      txt: 'SMHI: ' + (top.levelTxt || top.level) + ' varning · ' + top.event + ' · ' + top.kommuner,
      list: w.list.map(x => ({ head: (x.levelTxt || x.level) + ' varning · ' + x.event, kommuner: x.kommuner, when: [fmt(x.start), fmt(x.end)].filter(Boolean).join(' – '), text: x.text, color: col[x.level] || '#ffb547' })) };
  }
  // ---------- "Underlag": everything a warning is based on, hour by hour, with the Dahlström calculation ----------
  evidence() {
    const ev = this.state.evidence; if (!ev) return { open: false };
    const { lat, lng, hour } = ev;
    const f1 = v => v == null || isNaN(v) ? '–' : (Math.round(v * 10) / 10).toString().replace('.', ',');
    const g = (this.wxGrid || []).reduce((b, p) => { const d = this.kmDist(lat, lng, p.lat, p.lng); return !b || d < b.d ? { p, d } : b; }, null);
    const sampler = g ? this.gridSampler(g.p) : (h => this.simRainAt(lat, lng, h));
    const live = !!this.weather;
    const prev = this._depth; this._depth = true;
    const hours = [];
    try {
      for (let h = Math.max(-12, hour - 11); h <= hour; h++) {
        const gi = h <= 0 ? this.gaugeIdw(lat, lng, h <= 0 ? Math.min(-1, h) : h, 35) : { mm: null, n: 0 };
        const rad = live ? this.radarAt(lat, lng, h) : null;
        const raw = live && h >= 0 && g && g.p.series && g.p.series[h] ? (g.p.series[h].precip || 0) : null;
        const fac = h >= 0 && live ? this.biasAt(h) : null;
        const val = sampler(h) || 0;
        const src = !live ? 'Simulerat värde'
          : h < 0 ? (gi.n && rad != null ? 'Mätare (' + gi.n + ' st) vägda mot radar' : gi.n ? 'Snitt av ' + gi.n + ' mätare' : rad != null ? 'Bara radar (ingen mätare nära)' : 'Ingen mätning')
          : h === 0 ? (rad != null ? 'Radar nu' + (gi.n ? ', justerad mot mätare' : '') : 'SMHI ×' + f1(fac) + (gi.n ? ', justerad mot mätare' : ''))
          : 'SMHI ×' + f1(fac) + ' (rättad mot mätare)' + (rad != null ? ', minst radarns skur' : '');
        hours.push({ h, lbl: h === 0 ? 'Nu' : (h > 0 ? '+' : '−') + Math.abs(h) + ' h', clock: new Date(Date.now() + h * 3600000).toLocaleTimeString('sv-SE', { hour: '2-digit' }),
          gauge: gi.mm != null ? f1(gi.mm) : '–', radar: rad != null ? f1(rad) : '–', smhi: raw != null ? f1(raw) : '–', val: f1(val), v: val, src, kind: h < 0 ? 'past' : h === 0 ? 'now' : 'fc' });
      }
    } finally { this._depth = prev; }
    const durs = [1, 3, 6, 12].map(per => {
      const mm = hours.filter(x => x.h > hour - per).reduce((a, x) => a + x.v, 0);
      const T = per * 60, i = mm / (0.006 * T), y = this.dahlYears(mm, T), thr = this.rpThresholds(per);
      const fcH = hours.filter(x => x.h > hour - per && x.h > 0).length;
      return { per, perTxt: per + ' h', mm: f1(mm), mmV: mm, i: f1(i), y, yTxt: y >= 0.5 ? this.yearsTxt(y) : 'under 1 år', thr: thr.map(f1).join(' / '), mix: fcH ? (fcH + ' h prognos') : 'uppmätt', color: this.rpClass(mm, per).hex };
    });
    const top = durs.reduce((b, d) => (d.y > b.y ? d : b), durs[0]);
    const T = top.per * 60, iTop = top.mmV / (0.006 * T), cube = (iTop - 2) * Math.pow(T, 0.98) / (190 * Math.log(T));
    durs.forEach(d => { d.isTop = d === top ? '1' : ''; });
    const gauges = (this.rainHistStations || []).map(s => ({ s, d: this.kmDist(lat, lng, s.lat, s.lng) })).filter(x => x.d <= 35).sort((a, b) => a.d - b.d).slice(0, 6)
      .map(x => ({ name: x.s.name, src: x.s.src === 'FM' ? 'Försvarsmakten' : x.s.src, dist: Math.round(x.d) + ' km', last: f1(this.gaugeVal(x.s, -1)), sum3: f1([-3, -2, -1].reduce((a, h) => a + (this.gaugeVal(x.s, h) || 0), 0)) }));
    const b = this.rainBias || {};
    const sw = this.smhiWarnView();
    return {
      open: true, title: ev.title || 'Underlag', place: ev.place || '', pos: lat.toFixed(3) + '° N · ' + lng.toFixed(3) + '° E',
      hourTxt: hour === 0 ? 'Nu' : (hour > 0 ? '+' : '−') + Math.abs(hour) + ' h · ' + new Date(Date.now() + hour * 3600000).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
      basis: hour <= 0 ? 'Bygger på uppmätt regn – inga prognostimmar ingår.' : 'Bygger på uppmätt regn fram till nu plus SMHI:s prognos för de kommande ' + hour + ' timmarna.',
      live, liveTxt: live ? 'Live-data' : 'Simulerad data – källorna nås inte',
      hours, durs,
      topTxt: top.y >= 0.5 ? top.yTxt + ' på ' + top.perTxt : 'under 1 år',
      calc: [
        'Regnmängd ' + top.perTxt + ': ' + top.mm + ' mm,  T = ' + T + ' min',
        'i = mm / (0,006 · T) = ' + top.mm + ' / (0,006 · ' + T + ') = ' + f1(iTop) + ' l/(s·ha)',
        '∛Å = (i − 2) · T^0,98 / (190 · ln T) = ' + (cube > 0 ? cube.toFixed(3).replace('.', ',') : '0'),
        'Å = (∛Å)³ = ' + (cube > 0 ? f1(Math.pow(cube, 3)) : '0') + ' månader = ' + (cube > 0 ? f1(Math.pow(cube, 3) / 12) : '0') + ' år',
      ],
      gauges, hasGauges: gauges.length > 0,
      biasTxt: b.n ? ('SMHI-prognosen rättas ×' + f1(b.factor) + ' (mätare ' + f1(b.gaugeMean) + ' mm mot SMHI ' + f1(b.modelMean) + ' mm senaste timmen, ' + b.n + ' mätare)') : 'Ingen rättning av prognosen (färre än 3 mätare med värde).',
      radarTxt: this.radarCalInfo && this.radarCalInfo.n ? ('Radarn kalibreras ×' + f1(this.radarCalInfo.factor) + ' mot ' + this.radarCalInfo.n + ' mätare') : 'Radarn används okalibrerad (för få mätare).',
      sw, swList: sw.list, swHas: sw.list.length > 0,
      close: () => this.setState({ evidence: null }),
    };
  }
  openEvidence(which) {
    const w = this.skyfallWarning(); const box = which === 'ahead' ? w.ahead : w.now; const c = box && box.cell;
    if (!c) return;
    const g = c.g || {}; const lat = g.lat != null ? g.lat : (c.muni ? c.muni.lat : 56.1), lng = g.lng != null ? g.lng : (c.muni ? c.muni.lng : 12.9);
    this.setState({ evidence: { lat, lng, hour: box.hour, title: box.txt, place: c.muni ? c.muni.name : 'inom kartområdet' } });
  }
  // Rain only · −12 h … +12 h — measured past (metobs) + forecast future (same SMHI source as the skyfall echoes)
  prognos() {
    const live = !!this.weather;
    const past = [], future = [];
    for (let h = 12; h >= 1; h--) {
      let mm;
      if (live && this.rainHist && this.rainHist.length) { const v = this.rainHist[this.rainHist.length - h]; mm = v ? v.mm : 0; }
      else if (live) mm = 0;
      else mm = Math.max(0, 9 - h * 0.9);
      past.push({ t: '-' + h, mm, past: true });
    }
    for (let h = 0; h <= 12; h++) future.push({ t: h === 0 ? 'Nu' : '+' + h, mm: this.peakRainAt(h), past: false });
    const all = past.concat(future);
    const mx = Math.max(3, ...all.map(x => x.mm));
    let pk = 0; all.forEach((x, i) => { if (x.mm > all[pk].mm) pk = i; });
    const peak = all[pk];
    const A = this.rainAccum(all, past.length);
    return Object.assign({}, A.chart, { accRows: A.rows }, {
      bars: all.map(x => ({ t: x.t, h: Math.max(4, x.mm / mx * 100), color: x.mm < 0.2 ? 'rgba(74,196,224,.14)' : this.rainHex(x.mm), op: x.past ? '.55' : '1', showT: (['-12', '-6', 'Nu', '+6', '+12'].indexOf(x.t) >= 0) ? x.t : '' })),
      peakTxt: peak.mm < 0.2 ? 'inget regn i fönstret' : (peak.t === 'Nu' ? 'nu' : (peak.past ? peak.t.replace('-', '') + ' tim sedan' : 'om ' + peak.t.replace('+', '') + ' tim')),
      peakColor: peak.mm < 0.2 ? '#577684' : this.rainHex(peak.mm),
      sumPastTxt: (Math.round(past.reduce((a, b) => a + b.mm, 0) * 10) / 10).toString().replace('.', ','),
      sumFutTxt: (Math.round(future.reduce((a, b) => a + b.mm, 0) * 10) / 10).toString().replace('.', ','),
      pastLive: live && !!(this.rainHist && this.rainHist.length),
      srcTxt: live ? (this.rainHist && this.rainHist.length ? 'SMHI · uppmätt + prognos' : 'SMHI · prognos') : 'SIMULERAD',
      srcColor: live ? '#2fe6c4' : '#7fa8b5',
    });
  }
  // ---- Ackumulerat regn per regnhändelse, jämfört mot Dahlström 2010 volym–varaktighet (P110) ----
  // all = timvärden −12 … +12 h ({mm}), nuI = index för Nu. Händelsen startar vid första timmen med regn (≥ 0,2 mm)
  // efter minst 3 torra timmar; ackumuleringen börjar där så att x = regnets varaktighet, som kurvorna kräver.
  rainAccum(all, nuI) {
    const n = all.length, WET = 0.2, GAP = 3;
    const wet = i => all[i] && all[i].mm >= WET;
    // event start: walk back from Nu across short dry gaps; if nothing ongoing, first wet hour in the forecast
    let s = -1;
    let lastWet = -1; for (let i = nuI; i >= 0; i--) if (wet(i)) { lastWet = i; break; }
    if (lastWet >= 0 && nuI - lastWet < GAP) {
      s = lastWet; let dry = 0;
      for (let i = lastWet - 1; i >= 0; i--) { if (wet(i)) { s = i; dry = 0; } else if (++dry >= GAP) break; }
    } else {
      for (let i = nuI + 1; i < n; i++) if (wet(i)) { s = i; break; }
    }
    const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
    const fy = y => y < 0.5 ? '< 0,5 år' : (y >= 100 ? '> 100 år' : (y < 10 ? f1(y) : Math.round(y)) + ' år');
    const yCol = y => y >= 10 ? '#9628e6' : y >= 5 ? '#b260ff' : y >= 2 ? '#ce96ff' : '#9bc3d0';
    // rolling windows (1/3/6/12 h): worst return period ending at/before Nu (uppmätt) and after Nu (prognos)
    const durs = [1, 3, 6, 12];
    const win = (end, d) => { let a = 0; for (let i = Math.max(0, end - d + 1); i <= end; i++) a += all[i] ? all[i].mm : 0; return a; };
    const table = durs.map(d => {
      let pMm = 0, pY = 0, fMm = 0, fY = 0, fAt = null;
      for (let e = d - 1; e < n; e++) {
        const mm = win(e, d), y = this.dahlYears(mm, d * 60);
        if (e <= nuI) { if (mm > pMm) pMm = mm; if (y > pY) pY = y; }
        else { if (mm > fMm) { fMm = mm; } if (y > fY) { fY = y; fAt = e - nuI; } }
      }
      return { d, pMm, pY, fMm, fY, fAt, ref2: this.dahlMm(2, d * 60), ref10: this.dahlMm(10, d * 60) };
    });
    let maxPast = { y: 0, d: 1 }, maxFut = { y: 0, d: 1, at: null };
    table.forEach(t => { if (t.pY > maxPast.y) maxPast = { y: t.pY, d: t.d }; if (t.fY > maxFut.y) maxFut = { y: t.fY, d: t.d, at: t.fAt }; });

    // chart geometry
    const W = 250, H = 60;
    const px = i => ((i + 0.5) / n * W).toFixed(1);
    const acc = all.map(() => null);
    if (s >= 0) { let run = 0; for (let i = s; i < n; i++) { run += all[i].mm; acc[i] = run; } }
    const k = i => i - s + 1; // elapsed hours since start
    const curve = Y => s < 0 ? [] : acc.map((v, i) => v == null ? null : this.dahlMm(Y, k(i) * 60));
    const c2 = curve(2), c5 = curve(5), c10 = curve(10);
    const accEnd = s >= 0 ? acc[n - 1] : 0;
    const c10End = s >= 0 ? c10[n - 1] : 10;
    const top = Math.max(accEnd, c10End, 4) * 1.1;
    const niceMax = top <= 5 ? 5 : top <= 10 ? 10 : top <= 20 ? 20 : top <= 40 ? 40 : top <= 60 ? 60 : Math.ceil(top / 20) * 20;
    const py = v => (H - 2 - Math.min(v, niceMax * 1.04) / niceMax * (H - 6)).toFixed(1);
    const path = (arr, from, to) => { const p = []; for (let i = from; i <= to; i++) if (arr[i] != null) p.push(px(i) + ',' + py(arr[i])); return p.length > 1 ? 'M' + p.join(' L') : ''; };
    const labelY = (arr) => { const v = arr[n - 1]; return v == null ? -99 : Math.max(2, Math.min(H - 6, (H - 2 - Math.min(v, niceMax) / niceMax * (H - 6)))) / H * 100; };
    // labels: keep 2 år, then 5 och 10 år only if ≥ 24 % of the chart height (≈ 10 px) from every label already shown
    const shown = []; const fits = y => shown.every(o => Math.abs(o - y) >= 24);
    const l2 = labelY(c2), l5 = labelY(c5), l10 = labelY(c10);
    const show2 = s >= 0; if (show2) shown.push(l2);
    const show5 = s >= 0 && fits(l5); if (show5) shown.push(l5);
    const show10 = s >= 0 && fits(l10);
    // detail chart (220 px): same rule with a smaller gap (≈ 8 % ≈ 18 px)
    const shownB = []; const fitsB = y => shownB.every(o => Math.abs(o - y) >= 8);
    const big2 = s >= 0; if (big2) shownB.push(l2);
    const big5 = s >= 0 && fitsB(l5); if (big5) shownB.push(l5);
    const big10 = s >= 0 && fitsB(l10);
    const accNow = s >= 0 && s <= nuI ? acc[nuI] : 0;
    const durNow = s >= 0 && s <= nuI ? (nuI - s + 1) : 0;
    const chart = {
      accHas: s >= 0,
      accNone: s < 0,
      accPast: s >= 0 && s <= nuI ? path(acc, s, nuI) : '',
      accFut: s >= 0 ? path(acc, Math.max(s, nuI), n - 1) : '',
      accArea: s >= 0 ? ('M' + px(s) + ',' + H + ' L' + acc.map((v, i) => v == null ? null : px(i) + ',' + py(v)).filter(Boolean).join(' L') + ' L' + px(n - 1) + ',' + H + ' Z') : '',
      accC2: path(c2, s, n - 1), accC5: path(c5, s, n - 1), accC10: path(c10, s, n - 1),
      accC2Y: labelY(c2).toFixed(1) + '%', accC5Y: labelY(c5).toFixed(1) + '%', accC10Y: labelY(c10).toFixed(1) + '%',
      accC10Show: show10, accC5Show: show5, accC2Show: show2,
      accC10Big: big10, accC5Big: big5, accC2Big: big2,
      accNowX: px(nuI),
      accStartTxt: s < 0 ? 'Inget regn i fönstret' : (s <= nuI ? ('Regnet började ' + (s === nuI ? 'nu' : 'för ' + (nuI - s) + ' h sedan')) : ('Regn väntas om ' + (s - nuI) + ' h')),
      accMaxTxt: niceMax + ' mm', accHalfTxt: (niceMax / 2).toString().replace('.', ','),
      accNowTxt: f1(accNow) + ' mm', accDurTxt: durNow ? durNow + ' h' : '–',
      accEndTxt: f1(accEnd) + ' mm',
      rpPastTxt: maxPast.y >= 0.5 ? fy(maxPast.y) : '< 0,5 år', rpPastColor: yCol(maxPast.y),
      rpFutTxt: maxFut.y >= 0.5 ? (fy(maxFut.y) + (maxFut.at ? ' om ' + maxFut.at + ' h' : '')) : '< 0,5 år', rpFutColor: yCol(maxFut.y),
      rpTitle: 'Högst hittills: ' + (maxPast.y >= 0.5 ? fy(maxPast.y) + ' (' + maxPast.d + ' h)' : 'under 0,5 år') + ' · I prognosen: ' + (maxFut.y >= 0.5 ? fy(maxFut.y) + ' (' + maxFut.d + ' h' + (maxFut.at ? ', slutar om ' + maxFut.at + ' h' : '') + ')' : 'under 0,5 år') + ' · Till +12 h totalt ' + f1(accEnd) + ' mm',
    };
    const rows = table.map(t => ({
      name: t.d === 1 ? '1 timme' : t.d + ' timmar',
      c1: f1(t.pMm) + ' mm · ' + fy(t.pY), c1color: yCol(t.pY),
      c2: f1(t.fMm) + ' mm · ' + fy(t.fY) + (t.fAt ? ' (om ' + t.fAt + ' h)' : ''), c2color: yCol(t.fY),
      c3: f1(t.ref2) + ' / ' + f1(t.ref10) + ' mm', c3color: '#9bc3d0',
    }));
    return { chart, rows, start: s };
  }
  // ---------- Havsvattenstånd (Öresund, väster om kommunerna) ----------
  seaStations() {
    return [
      { id: 'viken', name: 'Viken', kommun: 'Helsingborg', smhi: '2228', lat: 56.1414, lng: 12.5797, base: 22, y: 30 },
      { id: 'barseback', name: 'Barsebäck', kommun: 'Landskrona', smhi: '2099', lat: 55.7564, lng: 12.9034, base: 17, y: 70 },
      { id: 'klagshamn', name: 'Klagshamn', kommun: 'Landskrona', smhi: '2095', lat: 55.5223, lng: 12.8936, base: 14, y: 9 },
    ];
  }
  seaStatus(cm) {
    if (cm >= 100) return { txt: 'HÖGVATTEN', color: '#ff5a6e' };
    if (cm >= 60) return { txt: 'FÖRHÖJT', color: '#ffb547' };
    if (cm <= -40) return { txt: 'LÅGVATTEN', color: '#4aa8ff' };
    return { txt: 'NORMAL', color: '#2fe6c4' };
  }
  // symmetric scale −100 … +100 cm, so medelvattenstånd (0) sits exactly on the middle line of the gauges
  seaFillPct(cm) { return Math.max(3, Math.min(100, (cm + 100) / 200 * 100)); }
  seaLevel() {
    const baseM = this.baseMunis();
    const sf = baseM.reduce((a, m) => a + this.stormF(m.id), 0) / baseM.length; // storm/skyfall → surge
    const obsAll = this.seaObs || {};
    const live = Object.keys(obsAll).length > 0;
    const stations = this.seaStations().map((s, i) => {
      const surge = sf * 72;
      const sim = s.base + surge + Math.sin(i * 1.5) * 9;
      const o = obsAll[s.id];
      const now = (o && typeof o.cm === 'number') ? o.cm : sim;
      const prev = (o && typeof o.prev === 'number') ? o.prev : (s.base + surge + Math.sin(i * 1.5 - 0.3) * 9);
      const st = this.seaStatus(now);
      // observed 24 h back: REAL hourly values when SMHI answered, otherwise simulated
      const realH = o && o.hist && o.hist.length ? o.hist.slice(-24).map(v => v.cm) : null;
      const obs = realH ? Array.from({ length: 24 }, (_, h) => realH[Math.max(0, realH.length - 24 + h)] != null ? realH[Math.max(0, realH.length - 24 + h)] : realH[0])
        : Array.from({ length: 24 }, (_, h) => Math.round((now - sim) + s.base + surge * (0.5 + 0.5 * Math.sin((h - 6) * 0.4)) + Math.sin((h + i) * 0.6) * 10));
      const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
      // 24 h forecast — anchored at observed "now", surge persists then ebbs, with semidiurnal tide
      const fc = Array.from({ length: 25 }, (_, h) => {
        if (h === 0) return Math.round(now);
        const tide = Math.sin(h * 0.5 + i) * 10;
        const surgeF = surge * (h <= 6 ? 1 + h * 0.035 : 1.21 - (h - 6) * 0.02);
        return Math.round((now - sim) + s.base + surgeF + tide);
      });
      return {
        id: s.id, name: s.name, kommun: s.kommun, lat: s.lat, lng: s.lng, y: s.y,
        cm: Math.round(now), cmTxt: (now >= 0 ? '+' : '') + Math.round(now) + ' cm',
        trendUp: now >= prev, statusTxt: st.txt, color: st.color,
        fillPct: this.seaFillPct(now), obs: obs, forecast: fc,
        peak: Math.max.apply(null, fc), peakH: fc.indexOf(Math.max.apply(null, fc)),
        measured: !!o, ref: o ? o.ref : '–',
        timeTxt: o && o.t ? new Date(o.t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '–',
        rhTxt: o && o.rh2000 != null ? ((o.rh2000 >= 0 ? '+' : '') + o.rh2000 + ' cm') : '–',
        tempTxt: o && o.temp != null ? f1(o.temp) + ' °C' : '–',
        max24: realH ? Math.max.apply(null, realH) : null, min24: realH ? Math.min.apply(null, realH) : null,
        rise3: realH && realH.length > 3 ? realH[realH.length - 1] - realH[realH.length - 4] : null,
      };
    });
    // when SMHI measured any station: anchor the ESTIMATED stations to the measured level, so an estimate can
    // never show high water while the measurements say normal. Region figures then use only measured stations.
    const measured = stations.filter(s => s.measured);
    if (measured.length && measured.length < stations.length) {
      const anchor = measured.reduce((a, s) => a + s.cm, 0) / measured.length;
      stations.forEach(s => {
        if (s.measured) return;
        const d = Math.round(anchor - s.cm);
        s.cm += d; s.obs = s.obs.map(v => v + d); s.forecast = s.forecast.map(v => v + d);
        s.peak = Math.max.apply(null, s.forecast); s.peakH = s.forecast.indexOf(s.peak);
        s.cmTxt = (s.cm >= 0 ? '+' : '') + s.cm + ' cm'; s.fillPct = this.seaFillPct(s.cm);
        const st2 = this.seaStatus(s.cm); s.statusTxt = st2.txt; s.color = st2.color;
      });
    }
    const basis = measured.length ? measured : stations;
    const maxCm = Math.max.apply(null, basis.map(s => s.cm));
    const region = this.seaStatus(maxCm);
    return {
      stations: stations, maxCm: maxCm, maxCmTxt: (maxCm >= 0 ? '+' : '') + maxCm + ' cm',
      statusTxt: region.txt, color: region.color, fillPct: this.seaFillPct(maxCm),
      highWater: maxCm >= 60, source: live ? 'SMHI' : (this.weather ? 'SMHI-est.' : 'SIM'),
    };
  }
  async fetchSeaLevel() {
    if (typeof window === 'undefined' || !window.fetch || this.props.useSmhi === false) return;
    const toProxy = (href) => String(href || '').replace(/^https?:\/\/opendata-download-ocobs\.smhi\.se/, '/smhi-ocean');
    const getJSON = async (url) => {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 7000);
      try { const r = await fetch(url, { signal: ctrl.signal }); clearTimeout(to); return r.ok ? await r.json() : null; }
      catch (e) { clearTimeout(to); return null; }
    };
    // unit-aware conversion: SMHI states the unit per parameter ("cm" or "m"). Never guess from the size of the number
    // (the old "≤ 6 → metres" rule turned a real +2 cm into +200 cm).
    const toCm = (v, unit) => { let x = parseFloat(v); if (isNaN(x)) return null; if (/^m$/i.test(String(unit || '').trim())) x *= 100; x = Math.round(x); return Math.abs(x) > 250 ? null : x; };
    try {
      const ver = await getJSON('/smhi-ocean/api/version/1.0.json');
      if (!ver || !ver.resource) return;
      const R = ver.resource, T = r => String(r.title || '');
      // RW = relative to the local mean water level (what the widget shows), hourly
      const pRW = R.find(r => /vattenstånd/i.test(T(r)) && /\bRW\b/.test(T(r)) && /timv/i.test(T(r))) || R.find(r => String(r.key) === '12');
      const pRH = R.find(r => /vattenstånd/i.test(T(r)) && /RH ?2000/i.test(T(r)) && /timv/i.test(T(r))) || R.find(r => /vattenstånd/i.test(T(r)) && /RH ?2000/i.test(T(r)));
      const pTemp = R.find(r => /(havs|vatten)temperatur/i.test(T(r)));
      if (!pRW && !pRH) return;
      const series = async (p, key, period) => {
        if (!p) return null;
        const d = await getJSON(toProxy('https://opendata-download-ocobs.smhi.se/api/version/1.0/parameter/' + p.key + '/station/' + key + '/period/' + period + '/data.json'));
        if (!d || !d.value || !d.value.length) return null;
        const unit = (d.parameter && d.parameter.unit) || p.unit || 'cm';
        return { unit, name: (d.station && (d.station.name || d.station.title)) || null, vals: d.value.map(v => ({ t: v.date, v: parseFloat(v.value) })).filter(v => !isNaN(v.v)) };
      };
      const obs = {};
      await Promise.all(this.seaStations().map(async (loc) => {
        if (!loc.smhi) return;
        const [rw, rh, tp] = await Promise.all([series(pRW, loc.smhi, 'latest-day'), series(pRH, loc.smhi, 'latest-hour'), series(pTemp, loc.smhi, 'latest-hour')]);
        const main = rw || rh; if (!main) return;
        const hist = main.vals.map(v => ({ t: v.t, cm: toCm(v.v, main.unit) })).filter(v => v.cm != null);
        if (!hist.length) return;
        const last = hist[hist.length - 1];
        const rhLast = rh && rh.vals.length ? toCm(rh.vals[rh.vals.length - 1].v, rh.unit) : null;
        const tLast = tp && tp.vals.length ? tp.vals[tp.vals.length - 1].v : null;
        obs[loc.id] = {
          cm: last.cm, prev: hist.length > 1 ? hist[hist.length - 2].cm : last.cm, t: last.t,
          ref: rw ? 'RW' : 'RH 2000', rh2000: rhLast, temp: tLast != null && tLast > -3 && tLast < 35 ? tLast : null,
          hist, station: main.name || loc.name,
        };
      }));
      if (Object.keys(obs).length) { this.seaObs = obs; this._seaStamp = Date.now(); this.setState((st) => ({ tick: st.tick })); }
    } catch (e) {}
  }
  aiNotices(sel) {
    const col = s => s === 'HÖG' ? '#ff5a6e' : s === 'MEDEL' ? '#ffb547' : '#35d6f2';
    const w = this.weather;
    let all = [];
    // --- predictive SKYFALL risks: derived from the same återkomsttid model (Dahlström 2010) as the map ---
    const src = w ? 'SMHI' : 'prognos';
    const samp = id => { const mm = this.baseMunis().find(x => x.id === id); return h => (w ? this.fcPrecip(id, h) : this.simRainAt(mm.lat, mm.lng, h)); };
    const sumAhead = id => { const s = samp(id); let a = 0; for (let h = 0; h <= 12; h++) a += s(h) || 0; return a; };
    const firstWet = id => { const s = samp(id); for (let h = 0; h <= 12; h++) if ((s(h) || 0) >= 0.3) return h; return 12; };
    const light = [];
    this.baseMunis().forEach(m => {
      const o = this.skyfallOutlook(m.id); if (!o) return;
      const b = o.best; const amt = (Math.round(b.amt * 10) / 10).toString().replace('.', ',');
      const eta = this.etaTxt(b.startH);
      const conf = w ? Math.max(55, 92 - b.startH * 3) : Math.max(50, 86 - b.startH * 3);
      const yr = b.yearsTxt || '', yAmt = b.yearsAmt != null ? (Math.round(b.yearsAmt * 10) / 10).toString().replace('.', ',') : amt, yPer = b.yearsPeriod || b.period;
      if (b.lvl >= 6) all.push({ sev: 'HÖG', muni: m.id, conf, eta, text: 'Extremt skyfall, återkomsttid ' + yr + ' – ' + yAmt + ' mm på ' + yPer + ' tim enligt ' + src + ' (Dahlström 2010). Hög risk för översvämning och bräddning; aktivera skyfallsplan.' });
      else if (b.lvl === 5) all.push({ sev: 'HÖG', muni: m.id, conf, eta, text: 'Skyfall, återkomsttid ' + yr + ' – ' + yAmt + ' mm på ' + yPer + ' tim (Dahlström 2010). Dagvattenmagasin och pumpstationer riskerar kapacitetstak.' });
      else if (b.lvl === 4) all.push({ sev: 'MEDEL', muni: m.id, conf: conf - 10, eta, text: 'Kraftigt regn, återkomsttid ' + yr + ' – ' + yAmt + ' mm på ' + yPer + ' tim (Dahlström 2010). Förbered för bräddningsrisk vid reningsverket.' });
      else if (o.peak1 >= 2) all.push({ sev: 'MEDEL', muni: m.id, conf: 58, eta: this.etaTxt(o.peakH), text: 'Kraftigt regn ' + this.whenTxt(o.peakH) + ', upp till ' + o.peak1.toFixed(1).replace('.', ',') + ' mm/h. Ökat inflöde till spillvatten- och dagvattennätet väntas.' });
      else if (o.peak1 >= 0.3) light.push({ m, o, sum: sumAhead(m.id) });
    });
    // --- light rain: one regional card, so even "lite regn inatt" is announced ---
    if (light.length) {
      light.sort((a, b) => b.o.peak1 - a.o.peak1);
      const first = Math.min(...light.map(x => firstWet(x.m.id)));
      const pk = light[0];
      const names = light.map(x => x.m.name);
      const nTxt = names.length >= 6 ? 'större delen av området' : names.length > 2 ? names.slice(0, -1).join(', ') + ' och ' + names[names.length - 1] : names.join(' och ');
      all.push({ sev: 'LÅG', muni: pk.m.id, conf: 0, eta: this.etaTxt(first), regional: true,
        text: 'Regn väntas ' + this.whenTxt(first) + ' i ' + nTxt + ': upp till ' + pk.o.peak1.toFixed(1).replace('.', ',') + ' mm/h, cirka ' + (Math.round(pk.sum * 10) / 10).toString().replace('.', ',') + ' mm de kommande 12 timmarna. Inga åtgärder krävs – bevaka dagvattenbrunnar och kända lågpunkter.' });
    }
    if (!all.length) all.push({ sev: 'LÅG', muni: 'helsingborg', conf: 0, eta: '12 h', regional: true, text: 'Uppehåll eller bara enstaka droppar väntas de kommande 12 timmarna. Inga nederbördsrisker för driften.' });
    // --- sea level (Öresund) coupled with rainfall → coastal flood risk ---
    const sea = this.seaLevel();
    sea.stations.forEach(st => {
      const muni = this.nameToId(st.kommun);
      const rain = (w && w.byMuni[muni] && w.byMuni[muni].now) ? (w.byMuni[muni].now.precip || 0) : this.stormF(muni) * 32;
      if (st.peak >= 100) all.push({ sev: 'HÖG', muni: muni, conf: 82, eta: '~' + Math.max(1, st.peakH) + ' tim', text: 'Högvatten väntas vid ' + st.name + ' (+' + st.peak + ' cm)' + (rain >= 3 ? ' samtidigt med skyfall – förhöjd översvämningsrisk vid kusten.' : ' – bevaka kustnära avlopp.') });
      else if (st.peak >= 60) all.push({ sev: 'MEDEL', muni: muni, conf: 64, eta: '~' + Math.max(1, st.peakH) + ' tim', text: 'Förhöjt havsvattenstånd vid ' + st.name + ' (+' + st.peak + ' cm) kan minska avbördningen i dagvattennätet.' });
    });
    // infrastructure notices removed: they were fixed demo texts. They come back when SCADA is connected.
    // --- MR. Hydra's recommendation (from the ElevenLabs agent) on top, while the warning it was written for is still active ---
    const adv = this.agentAdvice;
    if (adv && adv.key === this.adviceKey() && Date.now() - adv.at < 3 * 3600000) {
      const mins = Math.round((Date.now() - adv.at) / 60000);
      all.unshift({ sev: adv.level === 'skyfall' ? 'HÖG' : 'MEDEL', muni: adv.muni, conf: 0, eta: adv.eta, agent: true, agentTxt: 'MR. Hydra rekommenderar · ' + (mins < 1 ? 'nyss' : mins + ' min sedan'), text: adv.text });
    }
    const list = sel ? all.filter(a => a.muni === sel || a.agent) : all;
    return list.map((a, i) => ({
      agent: !!a.agent, notAgent: !a.agent, agentTxt: a.agentTxt || '',
      sev: a.sev, sevColor: col(a.sev), eta: a.eta, muniName: this.muniName(a.muni),
      confTxt: /havsvattenstånd|Högvatten/i.test(a.text) ? (w ? 'SMHI havsvattenstånd' : 'simulerad') : ((w ? 'SMHI-prognos rättad mot mätare' : 'simulerad') + (/återkomst/.test(a.text) ? ' · Dahlström 2010' : '')), text: a.text,
      bg: a.sev === 'HÖG' ? 'rgba(255,90,110,.08)' : a.sev === 'MEDEL' ? 'rgba(255,181,71,.07)' : 'rgba(53,214,242,.06)',
      border: a.sev === 'HÖG' ? 'rgba(255,90,110,.28)' : a.sev === 'MEDEL' ? 'rgba(255,181,71,.26)' : 'rgba(53,214,242,.2)',
    }));
  }
  dirName(abbr) {
    return ({ N: 'norr', 'NÖ': 'nordöst', 'Ö': 'öster', 'SÖ': 'sydöst', S: 'söder', SV: 'sydväst', V: 'väster', NV: 'nordväst' })[abbr] || abbr;
  }
  windPack(wd, ws, gust, raining) {
    const fromTxt = this.compass(wd);
    const toTxt = this.compass(wd + 180);
    const arrowDeg = ((wd + 180) % 360 + 360) % 360; // bearing the wind (and rain) travels toward
    return {
      fromTxt, toTxt, arrowDeg,
      streamDeg: arrowDeg - 90, // horizontal streamlines point east (90°); align to travel bearing
      showDrift: !!raining, // only claim "rain drifts toward X" when it's actually raining
      driftTxt: 'Regnet drar mot ' + this.dirName(toTxt),
      speedTxt: Math.round(ws).toString(),
      gustTxt: Math.round(gust).toString(),
    };
  }
  wind() {
    const w = this.weather;
    if (w) return this.windPack(w.wd, w.ws, w.gust, (w.maxP || 0) >= 0.2);
    return this.windPack(225, 6 + this.j(1, 0.6, 5), 10 + this.j(1, 0.8, 6), true); // simulated: assume rain
  }
  skyfallText() {
    const w = this.weather;
    if (w && w.wettest && w.wettest.length) return 'SKYFALLSVARNING · ' + w.wettest.slice(0, 2).join(' / ');
    if (w) return 'NEDERBÖRD ÖVERVAKAS · LÄGET STABILT';
    return 'SKYFALLSVARNING · Örkelljunga / Perstorp';
  }

  weatherNow() {
    const w = this.weather;
    const labels = { rain: 'Regn', cloudy: 'Molnigt', sunny: 'Soligt' };
    if (w && w.temp != null) {
      const sym = w.symbol || 0;
      let cond;
      if ((w.maxP || 0) >= 0.2 || sym >= 8) cond = 'rain';
      else if (sym >= 5) cond = 'cloudy';
      else cond = 'sunny';
      return { tempTxt: Math.round(w.temp) + '°', condTxt: labels[cond], sunny: cond === 'sunny', cloudy: cond === 'cloudy', rain: cond === 'rain' };
    }
    const t = Math.round(this.j(9, 1.5, 4));
    return { tempTxt: t + '°', condTxt: labels.cloudy, sunny: false, cloudy: true, rain: false };
  }

  renderVals() {
    const acMap = { Cyan: ['#35d6f2', '53,214,242'], Teal: ['#2dd4bf', '45,212,191'], 'Blå': ['#4aa8ff', '74,168,255'] };
    const d2 = this.state.design === 2;
    // Design 2: accent = NSVA Blå 03 (logo bright blue)
    const [ac, acglow] = d2 ? ['#008ed4', '0,142,212'] : (acMap[this.props.accent] || acMap.Cyan);
    const setDesign = n => { try { localStorage.setItem('nsva_design', String(n)); } catch (e) {} this.setState({ design: n }); };
    const segOn = 'rgba(var(--acg,53,214,242),.18)', segOff = 'transparent';
    const showRadar = this.props.showWeatherRadar !== false;

    const baseM = this.baseMunis();
    const byId = {};
    baseM.forEach(m => { byId[m.id] = m; });

    // overview nodes are drawn on the Leaflet map (see tryInitMap)

    // aggregate
    let totalProd = 0, allLevels = [];
    baseM.forEach((m, i) => { totalProd += this.j(m.prod, m.prod * 0.02, i); allLevels.push(m.res[0], m.res[1]); });
    const avgLevel = allLevels.reduce((a, b) => a + b, 0) / allLevels.length;

    // alarms (filtered when a municipality is selected)
    const sel = this.state.selected;
    const baseA = this.currentAlarms();
    const alarmsRaw = sel ? baseA.filter(a => a.muni === sel) : baseA;
    const alarms = alarmsRaw.map(a => ({
      sev: a.sev, msg: a.msg, time: a.time, muniName: this.muniName(a.muni),
      color: this.sevColor(a.sev), bg: this.sevBg(a.sev), border: this.sevBorder(a.sev),
    }));
    const critCount = baseA.filter(a => a.sev === 'KRITISK').length;

    // reservoir list (left panel)
    let reservoirs;
    if (sel) {
      const m = byId[sel];
      reservoirs = [
        { name: 'Reservoar Norra', lvl: this.j(m.res[0], 1.2, 1) },
        { name: 'Reservoar Södra', lvl: this.j(m.res[1], 1.2, 2) },
      ].map(r => ({ name: r.name, pct: Math.round(r.lvl), pctTxt: Math.round(r.lvl) + '%', color: this.colorFor(r.lvl) }));
    } else {
      reservoirs = [
        { name: 'Örkelljunga · Södra', b: 28 },
        { name: 'Svalöv · Södra', b: 43 },
        { name: 'Perstorp · Södra', b: 50 },
        { name: 'Bjuv · Södra', b: 55 },
        { name: 'Helsingborg · Ringstorp', b: 81 },
      ].map((r, i) => { const v = this.j(r.b, 1.2, i); return { name: r.name, pct: Math.round(v), pctTxt: Math.round(v) + '%', color: this.colorFor(v) }; });
    }

    // production scope
    const prodVal = sel ? this.j(byId[sel].prod, byId[sel].prod * 0.02, 3) : totalProd;
    const consVal = (sel ? byId[sel].prod : totalProd) * 0.92;

    // sparkline
    const sparks = Array.from({ length: 16 }, (_, i) => ({ h: Math.max(12, Math.min(96, Math.round(48 + Math.sin((this.state.tick + i) * 0.6) * 24 + (i / 16) * 12))) }));

    // detail view
    let isDetail = !!sel, isOverview = !sel;
    let detailVals = {};
    if (sel) {
      const m = byId[sel];
      const facs = this.facilitiesFor(m);
      const fLayout = facs.map(f => ({ x: f.x, y: f.y }));
      const ei = [[0,1],[0,4],[4,3],[1,2],[0,2]];
      const detailEdges = ei.map(([a, b]) => ({ x1: fLayout[a].x, y1: fLayout[a].y, x2: fLayout[b].x, y2: fLayout[b].y }));
      const selLvl = (this.j(m.res[0], 1.2, 1) + this.j(m.res[1], 1.2, 2)) / 2;
      const station = this.state.selFac != null ? this.stationDetail(m, this.state.selFac) : null;
      detailVals = {
        selName: m.name,
        facilities: facs,
        facList: facs.map((f, i) => ({ name: f.name, type: f.type, color: f.color, valueTxt: f.valueTxt, open: () => this.selectFac(i) })),
        isStation: !!station,
        station: station || {},
        backFac: () => this.backFac(),
        detailEdges,
        selProdTxt: this.fmt(this.j(m.prod, m.prod * 0.02, 3)),
        selLevelTxt: Math.round(selLvl) + '%',
        selPressureTxt: this.j(4.1, 0.06, 5).toFixed(1).replace('.', ','),
        selAlarmCount: alarmsRaw.length,
        selAlarmColor: alarmsRaw.some(a => a.sev === 'KRITISK') ? '#ff5a6e' : alarmsRaw.some(a => a.sev === 'VARNING') ? '#ffb547' : '#2fe6c4',
        selAlarmBg: alarmsRaw.some(a => a.sev === 'KRITISK') ? 'rgba(255,90,110,.08)' : 'rgba(74,196,224,.06)',
        selAlarmBorder: alarmsRaw.some(a => a.sev === 'KRITISK') ? 'rgba(255,90,110,.3)' : 'rgba(74,196,224,.18)',
      };
    } else {
      detailVals.selName = ''; detailVals.isStation = false; detailVals.station = {};
    }

    // radar cells (skyfall over NE)
    // radar cells (skyfall over NE) — only when there is actual precipitation; empty when live data shows it's dry
    // small-radar decorative cells: only in simulated mode (live mode shows the real RainViewer layer instead)
    const wxLive = this.weather;
    void wxLive;
    const radarCells = [] || [
      { x: 62, y: 30, s: 70, mm: 16, anim: 'driftNE 9s ease-in-out infinite alternate' },
      { x: 72, y: 24, s: 48, mm: 9, anim: 'driftNE 11s ease-in-out infinite alternate' },
      { x: 54, y: 44, s: 56, mm: 4, anim: 'driftNE 13s ease-in-out infinite alternate' },
      { x: 46, y: 62, s: 40, mm: 1.2, anim: 'driftNE 10s ease-in-out infinite alternate' },
    ].map(c => ({ x: c.x, y: c.y, s: c.s, anim: c.anim, color: 'rgba(' + this.rainRgb(c.mm) + ',.55)' }));
    const fc = [['Nu',32,'#ff5a6e'],['+1h',24,'#ffb547'],['+2h',13,'#ffb547'],['+3h',6,'#35d6f2'],['+4h',2,'#35d6f2'],['+5h',0,'#3a5560']];
    const forecast = fc.map(([t, mm, color]) => ({ t, h: Math.max(6, mm / 32 * 100), color }));

    // chat
    const messages = this.state.messages.map(m => ({ text: m.text, isUser: m.role === 'user', isJarvis: m.role !== 'user', just: m.role === 'user' ? 'flex-end' : 'flex-start' }));
    const quickPrompts = [
      { label: 'Översvämningsrisk', run: () => this.send('Var är översvämningsrisken störst?') },
      { label: 'Dagvatten', run: () => this.send('Hur ser dagvattnet ut?') },
      { label: 'Vind & regn', run: () => this.send('Vart drar regnet med vinden?') },
    ];

    return {
      ac, acglow, showRadar,
      scale: this.state.scale,
      clock: this.state.clock,
      wxNow: this.weatherNow(),
      date: new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }),
      scope: sel ? byId[sel].name.toUpperCase() : '8 KOMMUNER',
      mapTitle: sel ? byId[sel].name + ' · Drill-down' : 'Översikt · Nordvästra Skåne',

      mapRef: (el) => { this.mapEl = el; if (el) this.tryInitMap(); },
      radarMapRef: (el) => { if (el) { this.radarEl = el; this.initRadarMap(); } else { this.radarEl = null; if (this.radarMap) { this.radarMap.remove(); this.radarMap = null; } } },
      detailMapRef: (el) => { this.detailEl = el; if (el) this.initDetailMap(); },
      isOverview, isDetail,

      prodTxt: this.fmt(prodVal),
      prodDelta: '+' + this.fmt(this.j(2.4, 0.6, 1)) + '%',
      consumptionTxt: this.fmt(consVal) + ' m³/h',
      onlineTxt: '8 / 8',
      avgLevelTxt: Math.round(this.j(avgLevel, 0.6, 4)) + '%',
      pressureTxt: this.j(4.2, 0.06, 2).toFixed(1).replace('.', ','),
      reservoirs, sparks,

      alarms, alarmCount: alarmsRaw.length, critCount,
      noAlarms: sel && alarmsRaw.length === 0,

      radarCells, forecast,

      sys: this.systems(sel),
      sea: this.seaLevel(),
      wdet: this.widgetDetailData(),
      prog: this.prognos(),
      aiList: this.aiNotices(sel),
      aiCount: this.aiNotices(sel).length,
      noAi: sel && this.aiNotices(sel).length === 0,
      wind: this.wind(),
      radarMmh: this.weather ? (Math.round(this.weather.maxP * 10) / 10).toString().replace('.', ',') + ' mm/h' : '32 mm/h',
      radarMmhColor: this.rainHex(this.weather ? (this.weather.maxP || 0) : 32),
      skyfallText: this.skyfallText(),
      skyTone: /STABILT/.test(this.skyfallText()) ? { rgb: '47,230,196', dot: '#2fe6c4', txt: '#9ff0db' } : { rgb: '255,90,110', dot: '#ff5a6e', txt: '#ffb3bc' },
      dragActive: this.state.dragActive,
      dragGx: this.state.dragGx,
      dragGy: this.state.dragGy,
      dragLabel: this.state.dragId ? '⠿ ' + this.widgetLabel(this.state.dragId) : '',
      wxSource: this.weather ? 'SMHI LIVE' : 'SIMULERAD',
      wxSourceColor: this.weather ? '#2fe6c4' : '#7fa8b5',
      anmalOn: !!this.state.filters.anmal,
      anmalActive: this.state.anmalScope !== 'all',
      anmalAll: this.state.anmalScope === 'all',
      anmalActiveBg: this.state.anmalScope !== 'all' ? 'rgba(255,138,74,.18)' : 'rgba(8,22,30,.5)',
      anmalActiveBorder: this.state.anmalScope !== 'all' ? '#ff8a4a' : 'rgba(74,196,224,.18)',
      anmalActiveColor: this.state.anmalScope !== 'all' ? '#ffd9c2' : '#7fa8b5',
      anmalAllBg: this.state.anmalScope === 'all' ? 'rgba(255,138,74,.18)' : 'rgba(8,22,30,.5)',
      anmalAllBorder: this.state.anmalScope === 'all' ? '#ff8a4a' : 'rgba(74,196,224,.18)',
      anmalAllColor: this.state.anmalScope === 'all' ? '#ffd9c2' : '#7fa8b5',
      setAnmalActive: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ anmalScope: 'active' }); },
      setAnmalAll: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ anmalScope: 'all' }); },
      src: this.srcBadges(),
      wxSourceLive: !!this.weather,
      wxUpdated: this.weather ? this.weather.updated : '',
      fm: this.flowSummary(),
      W: {
        flode: this.widgetCtl('flode'),
        dricks: this.widgetCtl('dricks'),
        spill: this.widgetCtl('spill'),
        dag: this.widgetCtl('dag'),
        hav: this.widgetCtl('hav'),
        radar: this.widgetCtl('radar'),
        prognos: this.widgetCtl('prognos'),
        ai: this.widgetCtl('ai'),
        alarm: this.widgetCtl('alarm'),
        anmal: this.widgetCtl('anmal'),
        matare: this.widgetCtl('matare'),
      },
      rg: this.gaugeWidget(),
      anm: this.reportsSummary(sel),
      colLeft: this.colDropCtl('left'),
      colRight: this.colDropCtl('right'),
      settingsOpen: this.state.settingsOpen,
      onMenu: !this.state.view && !this.state.tv,
      tv: !!this.state.tv,
      notTv: !this.state.tv,
      tvClass: this.state.tv ? 'nsva-tv' : '',
      // cloud drift on TV: a few px along the direction the SMHI wind moves the rain (bearing "toward")
      tvDx: (() => { const a = (this.wind().arrowDeg || 0) * Math.PI / 180; return Math.round(Math.sin(a) * 26); })(),
      tvDy: (() => { const a = (this.wind().arrowDeg || 0) * Math.PI / 180; return Math.round(-Math.cos(a) * 26); })(),
      clockShort: (this.state.clock || '').slice(0, 5) + ' · live',
      showClickHint: !sel && !this.state.tv,
      viewHasSkyfall: (() => { const d = this.viewDefs()[this.state.view || 'hydra']; return !d.filters || d.filters.includes('skyfall'); })(),
      // per-view map overlays: Visky = nederbörd + havsvattenstånd (no SCADA status); Produktion = no sea gauge
      showStatusOverlay: !sel && this.state.view !== 'visky',
      showSeaGauge: !sel && ['hydra', 'visky'].includes(this.state.view || 'hydra'),
      viewTitle: this.viewDefs()[this.state.view || 'hydra'].title,
      viewSub: this.viewDefs()[this.state.view || 'hydra'].sub,
      goMenu: () => this.setState({ view: null, settingsOpen: false, openWidget: null }),
      rainBgRef: this._rainBgRefFn || (this._rainBgRefFn = (el) => { this._rainBgEl = el; }),
      openHydra: () => this.setView('hydra'),
      openVisky: () => this.setView('visky'),
      openProd: () => this.setView('prod'),
      widgetMenu: this.widgetMenu(),
      toggleSettings: () => this.setState(s => ({ settingsOpen: !s.settingsOpen })),
      designClass: d2 ? 'nsva-d2' : '',
      isD1: !d2, isD2: d2,
      setDesign1: () => setDesign(1),
      setDesign2: () => setDesign(2),
      d1Bg: d2 ? segOff : segOn, d2Bg: d2 ? segOn : segOff,
      d1Color: d2 ? '#7fa8b5' : '#eaf7fb', d2Color: d2 ? '#eaf7fb' : '#7fa8b5',
      d1Border: d2 ? 'rgba(74,196,224,.16)' : 'rgba(var(--acg,53,214,242),.5)', d2Border: d2 ? 'rgba(var(--acg,53,214,242),.5)' : 'rgba(74,196,224,.16)',
      setTabWidgets: () => this.setState({ settingsTab: 'widgets' }),
      setTabInfo: () => this.setState({ settingsTab: 'info' }),
      toggleFullscreen: () => this.toggleFullscreen(),
      live: this.liveStrip(),
      fsLabel: this.isFullscreen() ? 'Helskärm på' : 'Helskärmsläge',
      fsBg: this.isFullscreen() ? 'rgba(var(--acg,53,214,242),.12)' : 'rgba(8,22,30,.45)',
      fsBorder: this.isFullscreen() ? 'rgba(var(--acg,53,214,242),.5)' : 'rgba(74,196,224,.18)',
      fsTrack: this.isFullscreen() ? 'var(--ac,#35d6f2)' : 'rgba(74,196,224,.25)',
      fsKnob: this.isFullscreen() ? '17px' : '2px',
      tabWidgets: this.state.settingsTab !== 'info',
      tabInfo: this.state.settingsTab === 'info',
      tabWBg: this.state.settingsTab !== 'info' ? 'rgba(var(--acg,53,214,242),.16)' : 'transparent',
      tabWColor: this.state.settingsTab !== 'info' ? '#eaf7fb' : '#7fa8b5',
      tabWBorder: this.state.settingsTab !== 'info' ? 'rgba(var(--acg,53,214,242),.5)' : 'rgba(74,196,224,.16)',
      tabIBg: this.state.settingsTab === 'info' ? 'rgba(var(--acg,53,214,242),.16)' : 'transparent',
      tabIColor: this.state.settingsTab === 'info' ? '#eaf7fb' : '#7fa8b5',
      tabIBorder: this.state.settingsTab === 'info' ? 'rgba(var(--acg,53,214,242),.5)' : 'rgba(74,196,224,.16)',
      settingsWidth: this.state.settingsTab === 'info' ? '880px' : '340px',
      infoTopics: this.infoTopics(),
      it: this.infoTopicFlags(),
      infoLive: this.infoLive(),
      closeSettings: () => this.setState({ settingsOpen: false }),
      resetLayout: () => this.resetLayout(),
      filters: this.state.filters,
      skyfallScanning: this.state.skyfallScan,
      skyfallNoResult: this.state.skyfallResult === 'none',
      skyfallScrubber: true, // always visible at the bottom of the map
      sv: this.skyfallScrubVals(),
      toggleSkyMode: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState(s => ({ skyfallMode: s.skyfallMode === 'int' ? 'rp' : 'int' })); },
      skyIntBoxBg: this.state.skyfallMode === 'int' ? '#ff9a2e' : 'rgba(8,22,30,.6)',
      skyIntBoxBorder: this.state.skyfallMode === 'int' ? '#ff9a2e' : 'rgba(74,196,224,.3)',
      skyIntLabelColor: this.state.skyfallMode === 'int' ? '#eaf7fb' : '#9bc3d0',
      skyModeRp: (this.state.skyfallMode || 'int') === 'rp',
      skyModeInt: (this.state.skyfallMode || 'int') === 'int',
      skyWarn: this.skyfallWarning(),
      skyWarnShow: !this.state.selected && (() => { const d = this.viewDefs()[this.state.view || 'hydra']; return !d.filters || d.filters.includes('skyfall'); })() && this.skyfallWarning().on,
      openSkyWarn: (e) => { if (e && e.stopPropagation) e.stopPropagation(); const w = this.skyfallWarning(); this.setState(s => ({ filters: Object.assign({}, s.filters, { skyfall: true }), skyfallHour: w.hour || 0 })); },
      openSkyNow: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState(s => ({ filters: Object.assign({}, s.filters, { skyfall: true }), skyfallScan: false, skyfallHour: 0 })); setTimeout(() => { try { this.applyMapFilters(); } catch (x) {} }, 60); },
      openSkyAhead: (e) => { if (e && e.stopPropagation) e.stopPropagation(); const w = this.skyfallWarning(); this.setState(s => ({ filters: Object.assign({}, s.filters, { skyfall: true }), skyfallScan: false, skyfallHour: w.ahead.hour || 0 })); setTimeout(() => { try { this.applyMapFilters(); } catch (x) {} }, 60); },
      setModeRp: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ skyfallMode: 'rp' }); },
      setModeInt: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ skyfallMode: 'int' }); },
      intLegend: this.intSteps().slice().reverse().map(s => ({ hex: s.hex, v: s.v, label: s.label })),
      rpInfoOpen: !!this.state.rpInfoOpen,
      toggleRpInfo: () => this.setState(s => ({ rpInfoOpen: !s.rpInfoOpen })),
      skyfallHour: this.skyfallScrubVals().hour,
      skyfallMax: this.skyfallScrubVals().max,
      skyfallMin: this.skyfallScrubVals().min,
      skyfallHourLabel: this.skyfallScrubVals().label,
      skyfallHourMm: this.skyfallScrubVals().mmTxt,
      skyfallHourColor: this.skyfallScrubVals().mmColor,
      onSkyfallScrub: (e) => this.setState({ skyfallHour: parseInt(e.target.value, 10) || 0 }),
      windArrows: Array.from({ length: 14 }, (_, i) => ({ top: ((i * 17 + 8) % 88) + 4, delay: ((i * 0.5) % 4).toFixed(2), dur: (5 + (i % 3)) })),
      mapFilters: [
        { key: 'skyfall', label: 'Skyfall', dot: '#4aacff' },
        { key: 'vind', label: 'Vind', dot: '#9ff0db' },
        { key: 'alarm', label: 'Alarm', dot: '#ff5a6e' },
        { key: 'anmal', label: 'Anmälningar', dot: '#ff8a4a' },
        { key: 'regn', label: 'Regnmätare', dot: '#4aacff' },
        { key: 'radartack', label: 'Radartäckning', dot: '#c9b6ff' },
      ].filter(o => { const d = this.viewDefs()[this.state.view || 'hydra']; return !d.filters || d.filters.includes(o.key); }).map(o => {
        const on = !!this.state.filters[o.key];
        return {
          key: o.key, label: o.label, on, dot: o.dot,
          toggle: () => this.toggleFilter(o.key),
          boxBg: on ? this.acHex() : 'transparent',
          boxBorder: on ? this.acHex() : 'rgba(74,196,224,.4)',
          labelColor: on ? '#eaf7fb' : '#9bb9c4',
        };
      }),

      messages, sending: this.state.sending, chatOpen: this.state.chatOpen,
      input: this.state.input, quickPrompts,

      onInput: (e) => this.setState({ input: e.target.value }),
      onKey: (e) => { if (e.key === 'Enter') this.send(); },
      doSend: () => this.send(),
      toggleVoice: () => this.toggleVoice(),
      agentOn: (this.state.agentStatus || 'off') !== 'off',
      voiceOn: this.state.agentStatus === 'listening' || this.state.agentStatus === 'speaking' || (this.state.agentStatus === 'connecting' && this._convVoice !== false),
      voiceIdle: !(this.state.agentStatus === 'listening' || this.state.agentStatus === 'speaking'),
      agentSpeaking: this.state.agentStatus === 'speaking',
      agentStatusTxt: ({ off: '', connecting: 'Ansluter…', listening: 'Lyssnar…', speaking: 'MR. Hydra talar', text: '' })[this.state.agentStatus || 'off'],
      micBg: (this.state.agentStatus === 'listening' || this.state.agentStatus === 'speaking') ? 'rgba(var(--acg,53,214,242),.32)' : 'rgba(var(--acg,53,214,242),.07)',
      micBorder: (this.state.agentStatus === 'listening' || this.state.agentStatus === 'speaking') ? 'var(--ac,#35d6f2)' : 'rgba(var(--acg,53,214,242),.3)',
      orbAnim: this.state.agentStatus === 'speaking' ? 'orbPulse .5s infinite' : this.state.agentStatus === 'listening' ? 'orbPulse 1.1s infinite' : 'orbPulse 2.4s infinite',
      back: () => this.back(),
      gd: this.gaugeDetail(),
      rd: this.radarDetail(),
      rl: this.radarList(),
      evd: this.evidence(),
      smhiW: this.smhiWarnView(),
      openEvNow: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.openEvidence('now'); },
      openEvAhead: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.openEvidence('ahead'); },
      // sea gauge sits above the Kartlager box with the same 32 px gap as Kartlager ↔ reglaget
      seaGaugeBottom: (() => { const d = this.viewDefs()[this.state.view || 'hydra']; const n = d && d.filters ? d.filters.length + 1 : 7; /* +1 = V2-raden i Skyfall */ return 125 + 46 + n * 25 + 32; })(),
      closeChat: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ chatOpen: false, chatMin: false }); },
      toggleChatMin: () => this.setState(s => ({ chatMin: !s.chatMin })),
      chatMinShown: this.state.chatOpen && this.state.chatMin,
      chatFullShown: this.state.chatOpen && !this.state.chatMin,
      chatLastTxt: (() => { const m = this.state.messages; if (this.state.sending) return 'Tänker…'; if (!m.length) return 'Ingen konversation än'; const l = m[m.length - 1]; return (l.role === 'user' ? 'Du: ' : '') + l.text; })(),

      ...detailVals,
    };
  }
}
