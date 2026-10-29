# Arkiv – export från Claude Design (29 oktober 2026)

Orörda original, endast för återställning. Redigera inte.

| Fil | Vad |
|---|---|
| `deploy-index-bundle.html` | Den bundle som låg i drift på Cloudflare före flytten (byggd från samma källa som `public/index.html`). |
| `index-gammal-bundle.html` | Äldre bundle (Design 1, assistenten hette JARVIS). Inaktuell. |
| `worker-gammal.js` | Äldre worker utan DMI-prognos. Aktuell version ligger i `/worker.js`. |
| `wrangler-original.toml` | Ursprunglig konfig (`assets.directory = "."`). |
| `compat.json` | Sidlista och flyttrapport från Claude Design. |
| `CLAUDE-original.md` | Projektanteckningar från Claude Design (innehållet finns nu i `/CLAUDE.md`). |

Snabb återställning: kopiera `deploy-index-bundle.html` till `public/index.html` och kör `npm run deploy`.
