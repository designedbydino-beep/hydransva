// Cloudflare Worker — serves the static dashboard AND proxies /smhi-proxy/* to SMHI (adds CORS).
// Replaces the Pages functions/ proxy, since the project deploys as a Worker with static assets.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/smhi-proxy/")) {
      const rest = url.pathname.replace(/^\/smhi-proxy\//, "");
      const target = "https://opendata-download-metfcst.smhi.se/" + rest + url.search;
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
    }

    // everything else → static files (index.html, kommuner.js, …)
    return env.ASSETS.fetch(request);
  },
};
