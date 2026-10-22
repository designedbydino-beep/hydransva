// Cloudflare Worker — serves the static dashboard AND proxies open weather APIs (adds CORS).
// /smhi-proxy/*  → SMHI meteorological forecast (väder, SNOW1g)
// /smhi-metobs/* → SMHI meteorological observations (regnmätare, inkl. Försvarsmaktens stationer)
// /smhi-ocean/*  → SMHI oceanographic observations (havsvattenstånd)
// /dmi-metobs/*  → DMI Frie Data, metObs (danska regnmätare kring Öresund)
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
    if (url.pathname.startsWith("/smhi-metobs/")) {
      return proxy(/^\/smhi-metobs\//, "https://opendata-download-metobs.smhi.se/");
    }
    if (url.pathname.startsWith("/smhi-ocean/")) {
      return proxy(/^\/smhi-ocean\//, "https://opendata-download-ocobs.smhi.se/");
    }
    if (url.pathname.startsWith("/dmi-metobs/")) {
      return proxy(/^\/dmi-metobs\//, "https://opendataapi.dmi.dk/");
    }

    // TV-versionen är borttagen: gamla länkar (/tv.html, /?tv) → vanliga dashboarden
    if (url.pathname === "/tv.html" || ((url.pathname === "/" || url.pathname === "/index.html") && url.searchParams.has("tv"))) {
      return Response.redirect(new URL("/", url).toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },
};
