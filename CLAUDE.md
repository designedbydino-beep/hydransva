# HYDRA – projektkontext för Claude Code

HYDRA är NSVA:s (Nordvästra Skånes Vatten och Avlopp) kontrollcenter för vatten och avlopp.
Den visas på en stor pekskärm i driftrummet och på personalens datorer. Ägare: Dino Jusufovic
(digitaliseringssamordnare, IT Digitalisering & Säkerhet).

Projektet byggdes i Claude Design och flyttades hit oktober 2026. Claude Design används inte längre –
**`public/index.html` är nu enda källan.** Ingen export eller bundling behövs.

## Språk och ton
- All UI-text, kommentarer i commit-meddelanden och dokumentation på **svenska**.
- Klarspråk, meningsversaler (sentence case), inga emoji i UI.
- Siffror: svensk decimalkomma och mellanslag som tusentalsavgränsare (`7 247 m³/h`, `4,2 mm/h`).

## Struktur
```
public/            ← det som publiceras (Cloudflare assets)
  index.html       ← HELA appen: mall + logik (≈7 300 rader, .dc.html-format)
  support.js       ← körmiljön för .dc-formatet (rör ej)
  kommuner.js      ← kommungränser/geodata för de 8 kommunerna
  kunskapsbas.js   ← kunskapsbas för MR. Hydra (offline-svar)
  assets/          ← NSVA-logotyper
worker.js          ← Cloudflare Worker: servar public/ + API-proxy + cron (radar, DMI)
wrangler.toml      ← Worker-konfig, KV-binding RADAR
design-system/     ← NSVA Design System (tokens, readme). Källa för färger/typsnitt/spacing
docs/              ← UX-analys, MR. Hydra-underlag, referensbilder, dc-format
arkiv/             ← originalexport från Claude Design (endast för återställning, redigera inte)
```

## Köra och driftsätta
- `npm install` en gång.
- `npm run dev` → `wrangler dev` på http://localhost:8787. Servar `public/` OCH proxy-rutterna,
  så SMHI/DMI/hav fungerar lokalt. KV är lokal och tom: anropa `/radar-hist/run` för att fylla radararkivet.
- `npm run dev:remote` → kör mot riktig KV i Cloudflare (delad radarhistorik).
- Driftsätt via Cloudflare-flödet: gren → förhandsvisnings-URL → pull request → `main` = live.
  Arbeta aldrig direkt i `main`; det är live-grenen som publiceras direkt.
- Öppna aldrig `public/index.html` direkt som fil (file://) – relativa API-anrop kräver workern.

## .dc.html-formatet (viktigt – läs innan du redigerar index.html)
Fullständig beskrivning: `docs/dc-format.md`. Det viktigaste:
- Filen har tre delar: `<helmet>` (CSS/externa skript, rad ~10–98), mallen inne i `<x-dc>`
  (rad ~108–2741) och logiken i `<script type="text/x-dc" data-dc-script>` (rad ~2742–slut).
- Logiken är EN klass: `class Component extends DCLogic` med `state`, `setState`, React-livscykel
  och `renderVals()` som returnerar allt mallen använder. Ingen `render()`, inga import/export, ingen TypeScript.
- Mallens hål `{{ path }}` är **bara uppslag med punktnotation** – aldrig uttryck. `{{ a + b }}`, `{{ !x }}`,
  `{{ fn() }}` misslyckas tyst. Räkna ut i `renderVals()` och exponera ett namn.
- Villkor/loopar: `<sc-if value="{{ cond }}" hint-placeholder-val="{{ true }}">` och
  `<sc-for list="{{ items }}" as="item">`. Händelser: `onClick="{{ handler }}"` (funktion från renderVals).
- `data-props` på script-taggen är HTML-escapad JSON (`&quot;`). Props: `accent`, `showWeatherRadar`,
  `liveData`, `useSmhi`, `copilotEndpoint` (+ `elevenlabsAgentId` läses i koden).
- Stilar är mest inline `style="..."`. Design 2 (`.nsva-d2`) skrivs över i `<helmet>` med
  attributselektorer som matchar exakta färgsträngar, t.ex. `[style*="rgba(18, 42, 54"]`.
  **Ändrar du en inline-färg kan Design 2 sluta fungera på det elementet.** Sök efter färgsträngen i
  helmet-CSS:en innan du ändrar. Långsiktigt mål: ersätt med CSS-variabler (se UX-analysen).

## Hitta i index.html (logiken)
- Skalning: `calcScale()` – ytan är fast 1920×1080 och skalas till fönstret.
- Vyer: `viewDefs()`, `setView()` – `hydra` (kontrollcenter), `visky` (skyfall), `prod` (produktion), `null` = startmeny.
- Widgets/layout: `allWidgets()`, `defaultLayout()`, `loadLayout()`, `moveWidget()`, `toggleWidget()`, `widgetDetailData()`.
- Karta (Leaflet): `tryInitMap()`, `loadBoundaries()`, `applyMapFilters()`, `updateMarkers()`, `muniHtml()`.
- Regn/skyfall: `dahlYears()`/`dahlMm()` (Dahlström 2010), `skyfallWarning()`, `rainOutlook()`, `radarAt()`.
- Larm: `baseAlarms()`, `currentAlarms()`, `sevColor()/sevBg()/sevBorder()`.
- MR. Hydra (ElevenLabs-agent): `agentId()`, `agentTools()`, `agentToolsRaw()`, `kbAnswer()`, `tourSteps()`.
- localStorage-nycklar: `nsva_design`, `nsva_layout_v3`, `nsva_view_layout`, `nsva_view_hidden`, `nsva_radar_hist`.

## Domänregler (får inte brytas)
- Återkomsttid räknas **endast** med Dahlström 2010 (`i = 190·∛Å·ln(T)/T^0,98 + 2`). Inga SMHI-tabeller.
- 2–10 år ger varning, ≥10 år ger kritisk nivå. Färgskala V2 = SMHI:s intensitetsfärger (mm/h).
- Märken: LIVE = riktig data, EST = beräknat, SIM = simulerat. Dricks-, spill-, dagvatten, larm och
  flödesmätare är fortfarande simulerade (SCADA kopplas senare).
- De åtta kommunerna: Helsingborg, Landskrona, Båstad, Bjuv, Åstorp, Svalöv, Örkelljunga, Perstorp.

## MR. Hydra
- Verktygsnamnen i `agentToolsRaw()` måste matcha exakt det som är konfigurerat i ElevenLabs
  (`docs/mr-hydra/MR Hydra - ElevenLabs verktyg.txt`). Lägger du till/byter namn på ett verktyg:
  uppdatera båda och säg till användaren att ElevenLabs måste uppdateras manuellt.
- Agentprompt och kunskapsbas: `docs/mr-hydra/`.

## Worker-rutter (worker.js)
`/smhi-proxy/*` prognos · `/smhi-metobs/*` regnmätare · `/smhi-ocean/*` havsvattenstånd ·
`/smhi-warn/*` varningar · `/dmi-metobs/*` danska mätare · `/dmi-fc/*` DMI HARMONIE (cachas i KV) ·
`/radar-hist/*` 12 h radararkiv (cron var 10:e min). `DMI_API_KEY` är valfri secret (`.dev.vars` lokalt).
KV-ID för radararkivet (namespace `hydra-radar`): `798ff9bc12b847f580b73e186a0a7bf6` – ska alltid stå i wrangler.toml.

## Säkerhet (NSVA är samhällsviktig verksamhet, NIS2)
- Inga API-nycklar eller hemligheter i `public/` – de hör hemma i workern (`wrangler secret put`).
- Inga personuppgifter i data, kunskapsbas eller loggar (agenten är publik).
- Kör inte deploy, ändra inte KV eller Cloudflare-inställningar utan att fråga.

## Färdplan
1. **Nu:** förbättra UX i befintlig fil – prioriteringar i `docs/UX-analys.md`.
2. **Sedan:** bygg om till Vite + React + TypeScript med komponenter och typade API-kontrakt,
   driftsätt på Azure Static Web Apps med Azure Functions som proxy (ersätter Cloudflare Worker).
   Integrationsbriefen mot Fabric görs om och ligger inte i repot.

## Arbetssätt
- Gör små, avgränsade ändringar i index.html och testa i `npm run dev` efter varje.
- Verifiera visuellt med skärmdump (Playwright) i 1920×1080 och 1366×768 vid UX-ändringar.
- Använd NSVA:s tokens i `design-system/tokens/` som referens för färg, typsnitt och spacing.
