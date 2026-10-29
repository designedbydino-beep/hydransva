# NSVA Design System

The brand system for **NSVA — Nordvästra Skånes Vatten och Avlopp AB**, built
from NSVA's official **grafisk guide (2025-12-09)**, the colour sheet and the
logo. Tokens, components and a website UI kit for designing on-brand interfaces
and assets.

---

## 1. About NSVA

NSVA is a **municipally-owned water and wastewater company** in north-west
Skåne, Sweden. Since 2009 it runs the public water services jointly for eight
owner-municipalities: **Bjuv, Båstad, Helsingborg, Landskrona, Perstorp,
Svalöv, Åstorp and Örkelljunga.**

- Delivers drinking water, treats wastewater (avlopp) and manages stormwater
  (dagvatten) for ~270,000 residents and businesses.
- ~230–250 employees; head office in Helsingborg (Rönnowsgatan 12). Org.nr 556765-3786.
- Brand promise: **"Rent vatten. Ett jobb för livet."** (Clean water. A job for life.)
- A civic, trust-led public utility — not a consumer product.

### Sources
- `uploads/NSVA grafisk guide 2025-12-09.pdf` — **the official graphic profile**
  (logo, colours, type). Primary source.
- `uploads/NSVA-färger för organisationen.pdf` — organisation colour sheet.
- `uploads/loggafärg.png` — the two-tone colour logo.
- Public website **https://nsva.se** + LinkedIn/Mynewsdesk for tone & IA context.

> ⚠️ No production codebase or Figma was provided. The UI kit is a brand-faithful
> *recreation* of nsva.se's public patterns from documented content + the
> official profile — not a pixel copy or code import.

---

## 2. Content fundamentals

**Language:** Swedish (sv-SE) first; English only for international contexts.

**Voice:** warm, plain, civic and reassuring — NSVA writes as a responsible
public servant. Never salesy, never jargon-heavy.

- **"Vi" och "du".** The company is "vi"; the reader is "du". *"Vi rekommenderar
  att du kokar ditt dricksvatten innan du använder det."*
- **Klarspråk (plain language).** Short sentences, concrete instructions, active
  voice — Swedish government plain-language norms.
- **Reassuring under disruption.** Driftstörningar state what happened, who is
  affected, and what to do — calmly. *"Läckan är lagad och vattnet är åter."*
- **Sentence case** everywhere — headings, buttons, labels. ALL-CAPS only for
  small letter-spaced eyebrow labels.
- **No emoji** in product UI or formal copy (social posts may use them; the
  website/app do not).
- **Numbers & units:** metric, spaced thousands (270 000 invånare), m³, °dH for
  hardness, kr/Mkr.

Recurring phrases: "Rent vatten. Ett jobb för livet." · "Om något går snett" ·
"Så använder du vattnet hållbart."

---

## 3. Visual foundations

**Logo.** A two-tone, continuous line-art wordmark "NSVA" — drawn as one rounded
stroke evoking **water, sewage and pipes (vatten, avlopp och rör)**. Two blues:
dark `#004268` + bright `#008ED4`. The profile defines four variants —
**FÄRG, VIT, SVART** and the **+budskap** lockup that adds the promise "Rent
vatten. Ett jobb för livet." Keep clear space (FRI ZON) around it. Variants in
`assets/`: `nsva-logo-color/white/black.png`.

**Colour.** Six families — **Blå, Turkos, Grön, Röd, Lila, Grå** — each with
complementary tones (23 tones total). Tone scale per family:
- **01** darkest — TGA* text colour, very high contrast
- **02** mid — TGA* text colour, meets the 4.5:1 minimum
- **03** bright — NOT text-safe (~3:1); large text, graphics & fills only
- **04 bakgrund** — TGA** tint background (pair with 01 text for ≥8.5:1)

Blå dominates (the identity). Turkos/Grön/Röd/Lila are categorical/accents — Röd
is reserved for varning/driftstörning. Backgrounds stay light and clean: white
cards on a pale grey page (`--surface-page`), navy (`--blue-01`) for headers,
footers and hero bands. No purple-blue gradients, no neon. **Accessibility (TGA)
is part of the system** — see the Accessibility card; never put body text on an
03 tone.

> The guide marks the digital-safe set "TGA": TGA* = text, min 4.5:1; TGA** =
> background tint, ≥8.5:1 pairing. The 03 tones are explicitly large-text/graphic
> only.

**Type (official).** Two families, both on Google Fonts:
- **Ubuntu** — balanced, rounded, legible sans. Headings, short texts, captions
  and **all UI chrome** (buttons, labels, inputs). `--font-heading` / `--font-ui`.
- **PT Serif** — legible serif with character. **Running body copy / brödtext.**
  `--font-body`.
- **Ubuntu Mono** (system addition) — tabular data: meter readings, invoice &
  customer numbers. `--font-mono`.

Sentence case, near-neutral tracking on display.

**Spacing & shape.** 4px base scale. Soft rounded corners (8–16px on cards, pill
on buttons & tags) echoing the rounded logo. Generous white space; hairline
borders + light tints do most of the separating.

**Elevation.** Soft, **navy-tinted** shadows (never neutral black) — cards lift
gently. Prefer 1px `--border-subtle` hairlines over shadow.

**Motion.** Calm and functional. Ease-out entrances (`--ease-out`), 120–320ms.
No bounce; no infinite decorative loops (the only loop is the gentle pulse on an
*ongoing* StatusPill dot, disabled under `prefers-reduced-motion`). Hover = subtle
tint or darker fill; press = 1px nudge down.

**Cards.** White, 12–16px radius, 1px hairline, optional soft shadow. Avoid the
"rounded box with a single coloured left border" trope. Status uses a full tinted
fill + matching icon.

**Imagery.** Real photography of water, infrastructure, Skåne landscapes and
staff — natural, cool-to-neutral daylight tones. No brand photography was
supplied, so the UI kit uses tinted photo-placeholder tiles; swap in real photos.

---

## 4. Iconography

No NSVA icon set was supplied. **Substitution:** **Lucide** (https://lucide.dev)
— clean 2px line icons whose rounded caps match Ubuntu and the logo. Loaded from
CDN in the UI kit (`lucide.min.js`, `data-lucide="droplet"`, `lucide.createIcons()`).

- Stroke 2px, round caps/joins, no fills; 24px grid; `currentColor`.
- Common glyphs: `droplet`, `droplets`, `waves`, `gauge`, `wrench`,
  `triangle-alert`, `map-pin`, `file-text`, `phone`, `cloud-rain`.
- **No emoji** as icons in product UI. Unicode only for inline units.
- `Alert` and `Checkbox` ship tiny inline SVGs (zero external dependency); broader
  iconography uses Lucide.

> 🔁 Replace Lucide if NSVA has an official icon library.

---

## 5. Index / manifest

**Root**
- `styles.css` — global entry (import this). `@import`s only.
- `readme.md` — this guide · `SKILL.md` — portable Agent-Skill front matter.

**`tokens/`** — `fonts.css` (Ubuntu, PT Serif, Ubuntu Mono), `colors.css`
(6 families × tones + semantic), `typography.css`, `spacing.css`, `effects.css`,
`base.css`. All reachable from `styles.css`.

**`assets/`** — `nsva-logo-color.png`, `nsva-logo-white.png`, `nsva-logo-black.png`.

**`cards/`** — foundation specimen cards (Design System tab):
- *Colors* — Blå, Turkos, Grön, Röd, Lila, Grå, Accessibility (TGA), Status
- *Type* — Headings (Ubuntu), Body (PT Serif), Type scale, Mono
- *Spacing* — Scale, Radii, Elevation
- *Brand* — Logo, Logo on navy, Logo variants, Logo + budskap, Voice

**`components/`** — reusable React primitives (namespace via `check_design_system`):
- `forms/` — **Button, Input, Select, Checkbox, Switch**
- `feedback/` — **Alert, Badge, StatusPill**
- `layout/` — **Card, Tabs, Breadcrumb**
- Each has `.jsx` + `.d.ts` + `.prompt.md`; one `*.card.html` demo per group.

**`ui_kits/nsva-web/`** — interactive recreation of the public website
(`index.html` + `App.jsx` router, `Header/Footer`, `HomePage`, `DriftPage`,
`FelanmalanPage`, plus Avgifter/info pages, `app.css`). Routes: Startsida,
Dricksvatten, Avlopp & dagvatten, Driftinformation, Avgifter & taxa, Om NSVA,
Felanmälan.

---

## 6. Open questions
- Confirm whether **Turkos/Grön/Röd/Lila** map to specific service lines, or are
  a free extended palette.
- Provide an **icon library** and **brand photography** if available.
- Share **real screenshots / Figma / codebase** of nsva.se to tighten the UI kit
  from "faithful recreation" toward pixel-accurate.
