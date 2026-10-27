// Cloudflare Worker — serves the static dashboard AND proxies open weather APIs (adds CORS).
// /smhi-proxy/*  → SMHI meteorological forecast (väder, SNOW1g)
// /smhi-metobs/* → SMHI meteorological observations (regnmätare, inkl. Försvarsmaktens stationer)
// /smhi-ocean/*  → SMHI oceanographic observations (havsvattenstånd)
// /dmi-metobs/*  → DMI Frie Data, metObs (danska regnmätare kring Öresund)
// /dmi-fc/*      → DMI Forecast EDR (HARMONIE DINI 2 km nederbördsprognos), cached 15 min at the edge
// /radar-hist/*  → 12 h radar archive over NV Skåne, saved centrally by the cron job below (same for every device)

// RainViewer zoom-7 tiles covering NV Skåne (same tiles the dashboard decodes)
const TILES = [[68, 39], [69, 39], [68, 40], [69, 40]];
const KEEP_MS = 7 * 24 * 3600 * 1000; // 7 days of radar history (same write rate, more storage)

async function archiveRadar(env) {
  if (!env.RADAR) return;
  const r = await fetch("https://api.rainviewer.com/public/weather-maps.json");
  if (!r.ok) return;
  const j = await r.json();
  const past = (j.radar && j.radar.past) || [];
  let index = (await env.RADAR.get("index", "json")) || [];
  const have = new Set(index.map(f => f.t));
  // newest frame only, rounded to 20 min — keeps KV writes well inside the free tier
  const f = past[past.length - 1];
  if (f) {
    const t = f.time * 1000;
    if (!have.has(t) && !index.some(x => Math.abs(x.t - t) < 19 * 60 * 1000)) {
      let ok = 0;
      for (const [x, y] of TILES) {
        const tr = await fetch(j.host + f.path + "/256/7/" + x + "/" + y + "/2/1_1.png");
        if (!tr.ok) continue;
        await env.RADAR.put("tile:" + t + ":" + x + ":" + y, await tr.arrayBuffer(), { expirationTtl: 7 * 24 * 3600 + 6 * 3600 });
        ok++;
      }
      if (ok) index.push({ t });
    }
  }
  const cut = Date.now() - KEEP_MS;
  index = index.filter(x => x.t >= cut).sort((a, b) => a.t - b.t);
  await env.RADAR.put("index", JSON.stringify(index));
}

// DMI HARMONIE forecast: fetched centrally (cron, max every 30 min, with retry on 429) and stored in KV,
// so all screens share ONE request instead of each hitting DMI's rate-limited API.
const DMI_EVERY_MS = 30 * 60 * 1000;
function dmiUrl() {
  const iso = t => new Date(t).toISOString().slice(0, 19) + "Z";
  const h0 = Math.floor(Date.now() / 3600000) * 3600000;
  return "https://opendataapi.dmi.dk/v1/forecastedr/collections/harmonie_dini_sf/bbox?bbox=11.0,55.1,14.6,56.95&crs=crs84&f=CoverageJSON" +
    "&parameter-name=total-precipitation,latitude,longitude&datetime=" + iso(h0 - 3600000) + "/" + iso(h0 + 13 * 3600000);
}
async function fetchDmi(env, force) {
  if (!env.RADAR) return { ok: false, status: 0, note: "no KV" };
  const meta = (await env.RADAR.get("dmi:meta", "json")) || {};
  if (!force && meta.at && Date.now() - meta.at < DMI_EVERY_MS) return { ok: true, status: 200, note: "fresh" };
  const headers = { "User-Agent": "NSVA-HYDRA-Dashboard" };
  if (env.DMI_API_KEY) headers["X-Gravitee-Api-Key"] = env.DMI_API_KEY;
  let last = 0;
  for (const wait of [0, 8000, 25000]) {
    if (wait) await new Promise(r => setTimeout(r, wait));
    const r = await fetch(dmiUrl(), { headers });
    last = r.status;
    if (r.ok) {
      await env.RADAR.put("dmi:fc", await r.arrayBuffer(), { expirationTtl: 12 * 3600 });
      await env.RADAR.put("dmi:meta", JSON.stringify({ at: Date.now(), status: 200 }));
      return { ok: true, status: 200 };
    }
    if (r.status !== 429 && r.status < 500) break; // 401/403/400: retrying won't help
  }
  await env.RADAR.put("dmi:meta", JSON.stringify(Object.assign({}, meta, { lastErr: last, errAt: Date.now() })));
  return { ok: false, status: last };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const proxy = async (prefix, host, maxAge) => {
      const rest = url.pathname.replace(prefix, "");
      const target = host + rest + url.search;
      const headers = { "User-Agent": "NSVA-HYDRA-Dashboard" };
      if (env.DMI_API_KEY && host.indexOf("dmi.dk") >= 0) headers["X-Gravitee-Api-Key"] = env.DMI_API_KEY; // only if DMI ever requires a key
      const upstream = await fetch(target, { headers });
      const body = await upstream.arrayBuffer();
      return new Response(body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") || "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=" + (maxAge || 300),
        },
      });
    };

    if (url.pathname.startsWith("/smhi-proxy/")) return proxy(/^\/smhi-proxy\//, "https://opendata-download-metfcst.smhi.se/");
    if (url.pathname.startsWith("/smhi-metobs/")) return proxy(/^\/smhi-metobs\//, "https://opendata-download-metobs.smhi.se/");
    if (url.pathname.startsWith("/smhi-ocean/")) return proxy(/^\/smhi-ocean\//, "https://opendata-download-ocobs.smhi.se/");
    if (url.pathname.startsWith("/dmi-metobs/")) return proxy(/^\/dmi-metobs\//, "https://opendataapi.dmi.dk/");
    if (url.pathname.startsWith("/smhi-warn/")) return proxy(/^\/smhi-warn\//, "https://opendata-download-warnings.smhi.se/");

    // DMI HARMONIE forecast, stored centrally by the cron job
    if (url.pathname === "/dmi-fc/latest.json") {
      const buf = env.RADAR ? await env.RADAR.get("dmi:fc", "arrayBuffer") : null;
      const meta = env.RADAR ? ((await env.RADAR.get("dmi:meta", "json")) || {}) : {};
      if (!buf) return new Response(JSON.stringify({ error: "no forecast stored yet", lastErr: meta.lastErr || null }), { status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      return new Response(buf, { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300", "X-Hydra-Fetched": String(meta.at || "") } });
    }
    if (url.pathname === "/dmi-fc/run") { const r = await fetchDmi(env, true); return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } }); }
    // direct pass-through (testing only) — large response, cached at the edge
    if (url.pathname.startsWith("/dmi-fc/")) {
      const cache = caches.default;
      const key = new Request(url.toString().replace(/datetime=[^&]*/, "h=" + Math.floor(Date.now() / 900000)), request);
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = await proxy(/^\/dmi-fc\//, "https://opendataapi.dmi.dk/", 900);
      if (res.ok) ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    }

    // central radar archive
    if (url.pathname === "/radar-hist/index.json") {
      const idx = env.RADAR ? ((await env.RADAR.get("index", "json")) || []) : [];
      return new Response(JSON.stringify({ frames: idx, enabled: !!env.RADAR }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
    }
    const m = url.pathname.match(/^\/radar-hist\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (m) {
      const buf = env.RADAR ? await env.RADAR.get("tile:" + m[1] + ":" + m[2] + ":" + m[3], "arrayBuffer") : null;
      if (!buf) return new Response("not found", { status: 404 });
      return new Response(buf, { headers: { "Content-Type": "image/png", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400" } });
    }
    // manual trigger to fill the archive right after deploy
    if (url.pathname === "/radar-hist/run") { await archiveRadar(env); return new Response("ok"); }

    // TV-versionen är borttagen: gamla länkar (/tv.html, /?tv) → vanliga dashboarden
    if (url.pathname === "/tv.html" || ((url.pathname === "/" || url.pathname === "/index.html") && url.searchParams.has("tv"))) {
      return Response.redirect(new URL("/", url).toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },

  // runs every 10 minutes (see wrangler.toml) — saves the newest radar frame
  async scheduled(event, env, ctx) {
    ctx.waitUntil(archiveRadar(env));
    ctx.waitUntil(fetchDmi(env, false));
  },
};
