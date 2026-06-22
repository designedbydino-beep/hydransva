// Cloudflare Pages Function — proxies /smhi-proxy/* → SMHI open data (adds CORS).
// Replaces the Netlify _redirects proxy, which Cloudflare Pages does not support for external hosts.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const rest = url.pathname.replace(/^\/smhi-proxy\//, "");
  const target = "https://opendata-download-metfcst.smhi.se/" + rest + url.search;

  const upstream = await fetch(target, {
    headers: { "User-Agent": "NSVA-HYDRA-Dashboard" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });

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
