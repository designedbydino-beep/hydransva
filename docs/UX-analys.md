# UX-analys av HYDRA (oktober 2026)

Genomgång av alla vyer (startmeny, Skyfall, Produktion, Hydra, kommundetalj, widget-modal,
inställningar) i Design 1 och 2, plus mätningar i koden. Analysen gjordes utan livedata –
kartbakgrund, radar och verklig larmmängd behöver kontrolleras separat.

## Helhetsbedömning
Stark visuell identitet med tydlig kontrollrumskänsla. Huvudproblemen: läsbarhet, att allt larmar
lika högt, och att varje stil är handskriven inline i stället för att komma från tokens.

## Prioriterade åtgärder

1. **Läsbarhet vid skalning.** Ytan är 1920×1080 och skalas ner. På 1600 px blir 9–10 px-text
   7,5–8 px, på 1366 ca 6,5 px. Koden har 160+ förekomster av 9–9,5 px och 184 av 11 px.
   → Minsta storlek 12 px på 1920-ytan.
2. **Kontrast i sekundärtext.** `#577684` (260 ggr) ger 3,55:1 mot panelbakgrunden, `#3f5e69` 2,47:1.
   I Design 2 sjunker `#577684` till 2,45:1. → Tre textnivåer som alla klarar ≥4,5:1:
   `#EAF7FB` / `#9BC3D0` / `#7FA8B5`.
3. **Larmtrötthet.** 13 larm, nästan alla röda "KRITISK", AI-notiser röda "HÖG", plus en lila banner –
   tre larmspråk där inget sticker ut. → Rött endast för "agera nu", tydlig nivåskala, kvitterat läge.
4. **Dold klippning.** Dagvatten, Havsvattenstånd och AI-notiser klipps mitt i rad.
   "Klicka på en kommun för detaljvy" ligger bakom tidsreglaget. → Tonad nederkant + "+3 till".
5. **Kommunnamn bara vid hover**, medan icke-NSVA-orter (Höganäs, Ängelholm, Eslöv, Hörby, Kävlinge)
   alltid syns. → Visa de åtta NSVA-kommunernas namn permanent; tona ner övriga orter.

## Typografi
- ~35 fontstorlekar (6,5–64 px) och ~25 letter-spacing-värden (0,01–0,42 em).
- Föreslagen skala (1920-yta): **12 / 13 / 15 / 18 / 24 / 34 / 52**.
- Letter-spacing: **0 / .04em / .12em** (det sista endast för versala etiketter).
- Mycket versaler och extrem spärrning ("H Y D R A", "VISKY · VISUALISERING AV SKYFALL") sänker läsbarheten.
- Design 1 blandar Chakra Petch, JetBrains Mono (271 ggr) och Ubuntu. Design 2 använder Ubuntu (NSVA-profil).
- `font-variant-numeric: tabular-nums` på alla mätvärden (används bara 2 gånger idag) så siffror inte hoppar.

## Färg
- Följ ISA-101 (högpresterande HMI): **neutralt i normalläge, färg = avvikelse.** Idag är staplar cyan/lila
  och nivåer gröna även när allt är normalt.
- Färgkonflikter:
  - Skyfall och Regnmätare har samma blå prick i Kartlager.
  - Anmälningar är orange = samma som Varning.
  - Lila används för Spillvatten, Radartäckning och återkomsttid.
- 93 unika hex-färger och 56 rgba-varianter → koka ner till ~12 tokens.
- Värmekartan i Skyfall täcker kommungränserna. → Lägre opacitet eller konturer över tröskelvärde.

## Spacing, padding och former
- 40+ padding-kombinationer (t.ex. `14px 16px 13px`, `7px 10px`) och 28 olika border-radius (1–24 px).
- Spacing: **4 / 8 / 12 / 16 / 24 / 32**. Radius: **4 chips · 8 kontroller · 12 paneler · pill**.
- Ojämn inre luft gör att rubriker och siffror inte linjerar mellan kolumner.
- Produktionsvyn: vänsterkolumnen mest tom, högerkolumnen halvfull. → Layouten bör anpassas efter aktiva widgets.

## Animationer
- 41 oändliga animationer (orbPulse, sweep, nodePulse, flowDash m.fl.). Regn-canvasen syns genom
  genomskinliga paneler och headern, så streck korsar text.
- 69 `backdrop-filter` ovanpå animerad canvas – tungt för GPU på vägg-PC som står på dygnet runt.
- Ingen `prefers-reduced-motion`, ingen paus vid dold flik (`visibilitychange`).
- Rörelsebudget: nytt larm 3 pulser → statiskt; värdeförändring 600 ms blink; radarsvep bara i radarwidgeten;
  regn bara inom kartytan eller bort.

## Interaktion och tillgänglighet
- 0 `<button>`, 0 aria-attribut, 0 fokusstilar, 2 `:hover`. 147 klickbara element är `div` – inte
  tangentbordsnåbara och nästan ingen hover-återkoppling.
- Krysset (×) och draghandtag syns alltid → risk att stänga widget av misstag. Visa i "Redigera layout"-läge.
- 104 `title=`-tooltips – långsamma och fungerar inte på pekskärm.
- Inställningar: "V/H" är kryptiskt → "Vänster/Höger" eller ikoner. Design 1/2-valet hör inte hemma i drift.
- "SIM" på varje widget skapar brus → en global banner "Simulerat läge".

## Vyspecifikt
- **Startmeny:** märken med olika betydelse (AKTIV, SIMULERAD, ÖVERSIKT). Bara Skyfall har taggar.
  Fyllt cyan "AKTIV" drar mest blick men säger minst.
- **Kommundetalj:** noder utan förbindelselinjer, trunkerade namn ("Helsingborg V…"), tom ruta nere till höger,
  tidsreglaget ligger kvar fast det inte hör hit.
- **Diagram:** staplar utan axlar, enheter och tidsetiketter. Prognosstaplarna i Nederbörd slår i taket.
  Modalens stapeldiagram är massiv cyan utan y-axel.
- **Dubbletter:** havsvattenstånd på kartan och i widget; vind i radarwidget och Skyfall.
- **Chattfältet:** tar 60 px höjd permanent.

## Teknisk skuld som påverkar UX
Design 2 bygger på attributselektorer som matchar exakta inline-färger + `!important`. Ändras en färg
slutar temat fungera där, utan att något syns. Rekommendation: välj Design 2-riktningen (närmast NSVA:s
profil) och bygg den med CSS-variabler; ta bort Design 1.

## Föreslagna tokens (startpunkt)

```css
:root {
  /* text */
  --hy-text-1: #EAF7FB;  --hy-text-2: #9BC3D0;  --hy-text-3: #7FA8B5;
  /* status – endast för avvikelse */
  --hy-ok: #3CC8C2;  --hy-warn: #FFB547;  --hy-crit: #FF5A6E;  --hy-info: #4AACFF;
  /* typografi (1920-yta) */
  --hy-fs-xs: 12px; --hy-fs-sm: 13px; --hy-fs-md: 15px; --hy-fs-lg: 18px;
  --hy-fs-xl: 24px; --hy-fs-2xl: 34px; --hy-fs-3xl: 52px;
  --hy-track-0: 0; --hy-track-1: .04em; --hy-track-caps: .12em;
  /* spacing och form */
  --hy-s1: 4px; --hy-s2: 8px; --hy-s3: 12px; --hy-s4: 16px; --hy-s6: 24px; --hy-s8: 32px;
  --hy-r-chip: 4px; --hy-r-ctl: 8px; --hy-r-panel: 12px; --hy-r-pill: 999px;
}
```
