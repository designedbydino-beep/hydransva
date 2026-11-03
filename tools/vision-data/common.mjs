// Shared constants for the vision data build
export const BB = { s: 55.78, n: 56.50, w: 12.45, e: 13.62 };
export const Z = 12;
// grid ≈ 100 × 100 m at 56° N
export const DLAT = 0.0009, DLNG = 0.0016;
// the 8 NSVA kommuner (same ids/coords as baseMunis() in logic.js) + street radius for the town networks
export const TOWNS = [
  { id: 'helsingborg', name: 'Helsingborg', lat: 56.0465, lng: 12.6945, prod: 3200, r: 3200 },
  { id: 'landskrona', name: 'Landskrona', lat: 55.8708, lng: 12.8300, prod: 1450, r: 2200 },
  { id: 'bastad', name: 'Båstad', lat: 56.4258, lng: 12.8517, prod: 540, r: 1400 },
  { id: 'bjuv', name: 'Bjuv', lat: 56.0833, lng: 12.9167, prod: 470, r: 1300 },
  { id: 'astorp', name: 'Åstorp', lat: 56.1333, lng: 12.9500, prod: 610, r: 1400 },
  { id: 'svalov', name: 'Svalöv', lat: 55.9131, lng: 13.1100, prod: 380, r: 1100 },
  { id: 'orkelljunga', name: 'Örkelljunga', lat: 56.2833, lng: 13.2833, prod: 290, r: 1100 },
  { id: 'perstorp', name: 'Perstorp', lat: 56.1350, lng: 13.3900, prod: 240, r: 1100 },
];
