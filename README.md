# HYDRA – NSVA Driftövervakning

Kontrollcenter för vatten och avlopp i NSVA:s åtta kommuner. Visar nederbörd, skyfall,
havsvattenstånd, regnmätare, radar, larm och anläggningsdata på en karta, med röst- och
textassistenten MR. Hydra.

## Kom igång i VS Code

Krav: Node.js 20 eller senare, och ett Cloudflare-konto med åtkomst till workern `hydransva`.

```bash
npm install          # installerar wrangler
npm run dev          # startar lokalt på http://localhost:8787
```

Öppna http://localhost:8787 i webbläsaren. Statusraden under rubriken ska gå från
"ANSLUTER / väntar" till ansluten när SMHI, regnmätare och hav har svarat.

- Radarhistoriken är tom lokalt. Öppna http://localhost:8787/radar-hist/run för att hämta senaste bilden,
  eller kör `npm run dev:remote` för att använda den riktiga, delade historiken i Cloudflare.
- Första gången: `npx wrangler login` för att koppla ditt Cloudflare-konto.
- Valfritt: lägg `DMI_API_KEY=...` i en fil `.dev.vars` (ignoreras av git) om DMI kräver nyckel.

## Driftsättning via Cloudflare

Arbeta alltid i en egen gren, till exempel `flytt-claude-code`. När du vill testa:

1. Pusha grenen till GitHub/Git remoten.
2. Cloudflare skapar automatiskt en förhandsvisnings-URL för den grenen.
3. Testa och verifiera i förhandsvisningen.
4. Skapa en pull request mot `main`.
5. När PR:n godkänns och mergas till `main` går ändringen live i Cloudflare.

`main` är den live-grenen. Den ska inte användas för direkt experiment eller testutgåvor.
Sidan serveras nu direkt från `public/` i stället för en exporterad bundle, och bara `public/`
publiceras via Cloudflare Worker.

## Mappar

| Mapp/fil | Innehåll |
|---|---|
| `public/index.html` | Hela appen (mall + logik). Redigeras direkt. |
| `public/*.js` | Körmiljö (`support.js`), kommungränser, kunskapsbas |
| `worker.js` | API-proxy (SMHI, DMI), radararkiv, cron |
| `design-system/` | NSVA:s grafiska profil som tokens |
| `docs/UX-analys.md` | UX-genomgång med prioriterade åtgärder |
| `docs/dc-format.md` | Hur filformatet i index.html fungerar |
| `docs/mr-hydra/` | Agentprompt, verktyg och kunskapsbas för ElevenLabs |
| `docs/referensbilder/` | Logotyper och skärmdumpar från designarbetet |
| `arkiv/claude-design-export/` | Originalexporten från Claude Design – endast för återställning |
| `CLAUDE.md` | Kontext som Claude Code läser automatiskt |

## Arbeta med Claude Code

Öppna mappen i VS Code och starta Claude Code. `CLAUDE.md` ger Claude all bakgrund
(format, struktur, domänregler, säkerhet). Bra första uppgifter:

1. "Starta Hydra lokalt och ta skärmdumpar av alla vyer i 1920×1080 och 1366×768."
2. "Gå igenom docs/UX-analys.md och åtgärda de fem prioriterade punkterna, en i taget."
3. "Ersätt de hårdkodade färgerna med CSS-variabler så att Design 2 inte behöver attributselektorer."

## Versionshantering

Rekommenderat: lägg projektet i ett git-repo (Azure DevOps Repos) direkt:

```bash
git init
git add .
git commit -m "Flytt från Claude Design till Claude Code"
```
