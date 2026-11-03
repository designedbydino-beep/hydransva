# Hydra – NSVA:s kontrollcenter

Hydra är NSVA:s dashboard för vatten och avlopp i 8 kommuner i Nordvästra Skåne. Den visas på en TV med pekskärm och i vanliga webbläsare. Allt UI är på svenska, och kodkommentarerna är på engelska.

## Arkitektur

- **Cloudflare Worker** ([worker.js](worker.js)) + statiska filer från `public/` ([wrangler.toml](wrangler.toml)).
  - Workern proxar öppna API:er och lägger på CORS: `/smhi-proxy/`, `/smhi-metobs/`, `/smhi-ocean/`, `/smhi-warn/`, `/dmi-metobs/`.
  - Den serverar centralt lagrade data från KV-namnrymden `RADAR`: `/dmi-fc/latest.json` (DMI HARMONIE, med Open-Meteo som reserv) och `/radar-hist/…` (radararkiv).
  - Ett cron-jobb var 10:e minut fyller på KV. Allt annat går till `env.ASSETS`.
- **Frontend** är en *dc-runtime*-komponent, alltså den exporterade designen från Claude Design:
  - [public/index.html](public/index.html) laddar React, Leaflet och data. Den hämtar sedan `app/view.html` och `app/logic.js`, lägger in dem i `<x-dc>` och startar `vendor/dc-runtime.js`.
  - [app/view.html](public/app/view.html) är mallen: `{{ värde }}`, `<sc-if value>`, `<sc-for list as>`, `sc-camel-on-click`, `ref="{{ fn }}"` och `style-hover` (blir pseudo-klasser med `!important`).
  - [app/logic.js](public/app/logic.js) innehåller **en enda klass** (`class Component extends DCLogic`, cirka 4 600 rader). Mallens alla värden kommer från `renderVals()` längst ner i filen. Runtime kräver att klassen hålls i en fil.
  - Komponenten har props (`accent`, `showWeatherRadar`, `liveData`, `useSmhi`, `copilotEndpoint`) i `data-props` i `index.html`.
- `public/css/`: `theme.css` (bas), `map.css` (Leaflet och keyframes), `motion.css` (öppna/stäng-animationer, `leave()`), `vision.css`.
- `public/data/`: `kommuner.js` (kommungränser), `kunskap.js` (kunskapsbas för MR. Hydra), `vision.js` + `vision-grid.png` (visionen, genererade filer).

## Vyer och widgets

- `state.view`: `null` = startmenyn, `'visky'` (Skyfall), `'prod'` (Produktion), `'hydra'` (hela kontrollcentret), `'vision'` (Hydra – visionen). Varje vy definieras i `viewDefs()`, som anger kolumner, kartfilter och `autoOn`. Vyn byts med `setView()`.
- Det finns 11 widgets, se `allWidgets()`: `flode`, `dricks`, `spill`, `dag`, `hav`, `radar`, `prognos`, `matare`, `ai`, `alarm`, `anmal`.
  - Varje widget finns **två gånger** i mallen, en gång i vänsterkolumnen och en i högerkolumnen. Synligheten styrs av `widgetCtl(id).inLeft/inRight`.
  - Användarens layout sparas i localStorage under nycklarna `nsva_view_layout` och `nsva_view_hidden`.
- Huvudkartan (Leaflet, `this.map`) skapas en gång i `tryInitMap()` och delas av alla vyer. Kartlagren styrs av `state.filters` och `applyMapFilters()`.
  - Hjul- och pinch-zoom sköts av `smoothWheelZoom()`, inte av Leaflets egen `scrollWheelZoom`.
- Live-data:
  - Väder från SMHI/DMI via workern, radar från RainViewer.
  - Allt som inte är live simuleras och märks i UI:t med "SIM". `liveData: false` stoppar tick-loopen.
- MR. Hydra (chatt/röst): `send()`, med verktyg i `agentToolsRaw()` (öppna widget, byt vy, sätt prognostimme …). Ett externt LLM ansluts via `copilotEndpoint`.

## Hydra – visionen

- [app/vision.js](public/app/vision.js) är en fristående modul (`window.HydraVision`). Komponenten monterar den via `visionRef()` / `syncVision()` när panelen i vänsterkolumnen och HUD-ytan över kartan finns, och avmonterar den när vyn lämnas.
  - Modulen äger sitt eget innehåll i DOM i dessa två ytor och sina egna Leaflet-paneler (`hv*`).
  - React rör inte det innehållet. Rendera inte barn dit från mallen.
- Lägen (`lens`): `oversikt`, `produktion`, `distribution`, `samhalle`. Högerkolumnens widgets per läge står i `viewDefs().vision`.
- **Kopplingen till dagens widgets** går åt båda hållen.
  - Ett klick på en widget i visionen anropar `HydraVision.focusWidget(id)` och visar den delen i tvillingen. Detaljvyn nås via fokuskortet.
  - Visionen rapporterar sin simulering via `ctx.onSim()` till `this.visionSim`. Därifrån tar `systems()` (spillvatten och dagvatten) och `currentAlarms()` över medan simuleringen körs.
  - Kartlagren från dagens Hydra (nederbörd, regnmätare, anmälningar, alarm, vind) slås av och på via `ctx.toggleFilter()`.
- **Tvillingens innehåll:**
  - Mätpunkter (`buildSensors()`, `sensVal()`): flöde, nivå, tryck, regn (live från `ctx.gauges()`), kvalitet, hav (live), grundvatten, läckloggrar och energi.
  - Bräddpunkter med kammarnivå, plym, badplatser och EU-indikatorn (< 2 %).
  - Prognosstyrd bräddrisk (`forecast()`), vattenålder och avstängningsanalys (`shutOff()`).
- HUD-panelerna kan dras i rubriken och minimeras. Placeringen sparas i localStorage under `nsva_vision_ui`.
- Datan byggs med [tools/vision-data/](tools/vision-data/README.md) (`node fetch.mjs && node build.mjs`):
  - Terrängen kommer från AWS Terrain Tiles och gatorna från OpenStreetMap. Båda är verkliga.
  - Ledningar, anläggningar och exploateringsområden är **påhittade**. Visa det alltid som simulerad data.
- Terrängen ritas live i webbläsaren från terrarium-plattor (S3, CORS öppet).

## Fallgropar

- **Ref-callbacks måste vara stabila.** En ny funktion vid varje rendering gör att React anropar `ref(null)` och sedan `ref(el)`. Använd mönstret `this._xRefFn || (this._xRefFn = el => …)`, se `visionPanelRef`.
- **Leaflet-renderare blir kvar** på kartan när deras linjer tas bort. Ta bort dem uttryckligen, se `layers.renderers` i vision.js.
- **Live-data fungerar bara via workern.** På en lokal statisk server svarar SMHI/DMI/radar inte, och appen faller tillbaka på simulering.
- **SVG-attribut med `{{…}}`:** mallen parsas med `DOMParser` i `index.html`, annars validerar webbläsaren platshållarna och loggar fel.
- **Stängningsanimationer:** stäng overlays via `this.leave(key, done)`, som ger 200 ms exit-animation. Programmatiska stängningar, till exempel från AI eller turen, får vara direkta.
- **`prefers-reduced-motion`** stänger av animationerna i `motion.css` och `vision.css`. Behåll det.

## Arbetsflöde

- **main är skyddad.** Arbeta på en gren, pusha och skapa en PR. Användaren mergar själv. Merge till main deployar automatiskt till Cloudflare (Workers Builds).
- Varje gren får en förhandslänk: `https://<gren>-hydransva.designedbydino.workers.dev/`. Där fungerar live-data.
- Lokalt räcker en statisk server: `cd public && python3 -m http.server 8703`. Testa med Playwright i headless Chromium.
- Det finns inget byggsteg och inga tester i repot. Kontrollera syntax med `node --check` (vision.js), eller med `new Function` på klasskroppen för logic.js.
