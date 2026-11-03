# Data för "Hydra – visionen"

Bygger `public/data/vision.js` och `public/data/vision-grid.png`.

```sh
cd tools/vision-data
npm install
node fetch.mjs   # hämtar höjdplattor (AWS Terrain Tiles) och gator (OpenStreetMap/Overpass) till tiles/ och osm/
node build.mjs   # räknar fram rinnvägar, lågpunkter, ledningsnät m.m. och skriver till ../../public/data
```

Terrängen och gatorna är riktiga. Ledningar, anläggningar, år, material och exploateringsområden är påhittade, men de är placerade utifrån terrängen:
- Reservoarer ligger högt.
- Reningsverk ligger lågt vid recipienten.
- Pumpstationer ligger där självfall inte räcker.
- Trycket räknas som reservoarens nivå minus markhöjden.
