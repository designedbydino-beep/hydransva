# .dc.html-formatet – referens

`public/index.html` är skriven i Claude Designs komponentformat.
Körmiljön är `support.js`, som laddar React 18.3.1 och Babel från unpkg och renderar filen i webbläsaren.
Formatet fungerar fristående – Claude Design behövs inte.

## Filens form

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
  <helmet>
    <!-- <style>, <link>, externa <script> – hamnar i <head> -->
  </helmet>
  <div>{{ title }}</div>          <!-- mallen -->
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{...}">
class Component extends DCLogic {
  state = { n: 0 };
  renderVals() {
    return { title: 'Hej', inc: () => this.setState(s => ({ n: s.n + 1 })) };
  }
}
</script>
</body>
</html>
```

## Mallregler

| Konstruktion | Syntax | Notera |
|---|---|---|
| Hål | `{{ user.name }}`, `{{ $index }}`, `{{ true }}` | Endast uppslag med punkt. **Inga uttryck** – `{{ a + b }}`, `{{ !x }}`, `{{ fn() }}` misslyckas tyst. |
| Attribut | `x="text"` → sträng · `x="{{ p }}"` → rått värde · `x="a {{p}} b"` → interpolerad sträng | `class`/`for` mappas till `className`/`htmlFor`. |
| Händelser | `onClick="{{ pick }}"` | Funktionen kommer från `renderVals()`. Per objekt i loop: lägg handlern på objektet (`items.map(x => ({...x, pick: () => ...}))`) och bind `{{ item.pick }}`. |
| Villkor | `<sc-if value="{{ cond }}" hint-placeholder-val="{{ true }}">…</sc-if>` | Ingen else – använd två sc-if med motsatta flaggor (t.ex. `isD1` / `isD2`). |
| Loop | `<sc-for list="{{ items }}" as="item" hint-placeholder-count="3">` | `{{ item.x }}` och `{{ $index }}` i scope. |
| Refs | `ref="{{ myRef }}"` | Callback-ref från `renderVals()` (används för karta och regn-canvas). |
| Inline-stil med hål | `style="width:{{ w }}px"` | OK för levande värden; statiska tokens skrivs rakt in. |

## Logikklassen
- Klassisk JS, ingen TypeScript, inga import/export. Måste heta `class Component extends DCLogic`.
- Har `this.props`, `this.state`, `setState`, `forceUpdate` och React-livscykel
  (`componentDidMount`, `componentDidUpdate`, `componentWillUnmount`) – men **ingen `render()`**.
- `renderVals()` returnerar allt mallen behöver: värden, listor, handlers, refs.
  Räkna ut villkor och strängar här, inte i mallen.

## data-props
JSON i ett HTML-attribut. I `index.html` är attributet dubbelfnuttat, så alla `"` är skrivna som `&quot;`
och `&` som `&amp;`. Varje prop: `{"editor": "text"|"boolean"|"enum"|..., "default": ..., "tsType": ...}`.
Default används som startvärde – läs alltid med fallback i koden: `this.props.x ?? standard`.

## Fallgropar i HYDRA
- **Design 2-överskrivningar:** helmet-CSS:en matchar exakta inline-färger (`[style*="color: rgb(87, 118, 132)"]`).
  Webbläsaren normaliserar `#577684` till `rgb(87, 118, 132)` i style-attributet, och det är den strängen som matchas.
  Ändra en färg → kontrollera att Design 2 fortfarande ser rätt ut.
- **Fast yta 1920×1080:** allt ritas i den storleken och skalas (`calcScale()`). Textstorlekar i koden är
  därför "innan skalning" – 10px blir ca 8px på en 1600-skärm.
- **Hål som inte kan lösas** syns som `{{text}}` på sidan och SVG-attribut ger konsolfel. Det betyder
  oftast att ett namn saknas i `renderVals()`.
