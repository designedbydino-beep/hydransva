// Downloads the raw inputs for the vision data (cached on disk):
//  - AWS Terrain Tiles (terrarium PNG, z12 ≈ 20 m/px) over NV Skåne
//  - OpenStreetMap roads via Overpass (regional main roads + streets in the 8 NSVA towns)
import fs from 'node:fs';
import { BB, Z, TOWNS } from './common.mjs';

const UA = { 'User-Agent': 'NSVA-Hydra-vision-build/1.0' };
const lon2x = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };

async function tiles() {
  const jobs = [];
  for (let x = lon2x(BB.w, Z); x <= lon2x(BB.e, Z); x++)
    for (let y = lat2y(BB.n, Z); y <= lat2y(BB.s, Z); y++) jobs.push([x, y]);
  let done = 0;
  const run = async () => {
    for (;;) {
      const j = jobs.shift(); if (!j) return;
      const f = `tiles/${Z}_${j[0]}_${j[1]}.png`;
      if (!fs.existsSync(f)) {
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${j[0]}/${j[1]}.png`, { headers: UA });
        if (!r.ok) throw new Error(f + ' ' + r.status);
        fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      }
      done++;
    }
  };
  const n = jobs.length;
  await Promise.all(Array.from({ length: 8 }, run));
  console.log('terrain tiles', done, '/', n);
}

async function overpass(name, q) {
  const f = `osm/${name}.json`;
  if (fs.existsSync(f)) return;
  for (let i = 0; i < 4; i++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { ...UA, Accept: '*/*', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
    if (r.ok) { fs.writeFileSync(f, await r.text()); console.log('osm', name, fs.statSync(f).size); return; }
    console.log('overpass', name, r.status, 'retry'); await new Promise(r => setTimeout(r, 15000));
  }
  throw new Error('overpass failed ' + name);
}

await tiles();
const bb = `${BB.s},${BB.w},${BB.n},${BB.e}`;
await overpass('main', `[out:json][timeout:180];way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${bb});out geom;`);
// public VA facilities (OpenStreetMap): water towers, works, treatment plants, pumping stations, wells, tanks
await overpass('va', `[out:json][timeout:150];(nwr["man_made"~"^(water_tower|water_works|wastewater_plant|reservoir_covered|pumping_station|water_well|storage_tank)$"](${bb});nwr["pumping_station"](${bb}););out center tags;`);
for (const t of TOWNS) {
  await overpass('town-' + t.id, `[out:json][timeout:120];way["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street)$"](around:${t.r},${t.lat},${t.lng});out geom;`);
}
