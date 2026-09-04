// Cloudflare Worker — serves the static dashboard AND proxies SMHI APIs (adds CORS).
// /smhi-proxy/*  → meteorological forecast (väder)
// /smhi-ocean/*  → oceanographic observations (havsvattenstånd)
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const proxy = async (prefix, host) => {
      const rest = url.pathname.replace(prefix, "");
      const target = host + rest + url.search;
      const upstream = await fetch(target, { headers: { "User-Agent": "NSVA-HYDRA-Dashboard" } });
      const body = await upstream.arrayBuffer();
      return new Response(body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") || "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=300",
        },
      });
    };

    if (url.pathname.startsWith("/smhi-proxy/")) {
      return proxy(/^\/smhi-proxy\//, "https://opendata-download-metfcst.smhi.se/");
    }
    if (url.pathname.startsWith("/smhi-ocean/")) {
      return proxy(/^\/smhi-ocean\//, "https://opendata-download-ocobs.smhi.se/");
    }

    // everything else → static files (index.html, kommuner.js, …)
    return env.ASSETS.fetch(request);
  },
};
