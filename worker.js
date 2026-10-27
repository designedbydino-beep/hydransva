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

    // DMI HARMONIE forecast field — large response, so cache it at the edge (same for every screen)
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
  },
};
