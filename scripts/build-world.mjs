// Builds src/data/world.json: SVG path strings per ISO 3166-1 alpha-2 code, projected
// with Equal Earth into a fixed viewBox, from Natural Earth 110m admin-0 countries.
//
//   curl -sL -o /tmp/ne110.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
//   node scripts/build-world.mjs /tmp/ne110.geojson
//
// Natural Earth data is public domain. Antarctica is dropped to keep the map compact.

import fs from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-world.mjs <ne_110m_admin_0_countries.geojson>');
  process.exit(1);
}
const geo = JSON.parse(fs.readFileSync(src, 'utf8'));

// Equal Earth projection (Šavrič, Patterson, Jenny 2018).
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
function project(lon, lat) {
  const lam = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const theta = Math.asin(M * Math.sin(phi));
  const t2 = theta * theta, t6 = t2 * t2 * t2;
  const x = (lam * Math.cos(theta)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, -y];
}

const WIDTH = 960;
const features = [];
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const f of geo.features) {
  const p = f.properties;
  let iso = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
  if (!iso || iso === '-99') continue;
  if (iso === 'AQ') continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const pts = ring.map(([lon, lat]) => project(lon, lat));
      for (const [x, y] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      rings.push(pts);
    }
  }
  features.push({ iso, name: p.NAME_LONG || p.NAME, rings });
}

const scale = WIDTH / (maxX - minX);
const HEIGHT = Math.ceil((maxY - minY) * scale);
const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
const countries = {};
for (const f of features) {
  let d = '';
  for (const ring of f.rings) {
    let prev = null;
    let seg = '';
    for (const [x, y] of ring) {
      const px = (x - minX) * scale, py = (y - minY) * scale;
      const key = `${fmt(px)},${fmt(py)}`;
      if (key === prev) continue;
      seg += (seg ? 'L' : 'M') + key;
      prev = key;
    }
    if (seg.split('L').length >= 3) d += seg + 'Z';
  }
  if (!d) continue;
  // A few territories share an ISO code with their parent in this dataset; merge them.
  countries[f.iso] = countries[f.iso] ? { name: countries[f.iso].name, d: countries[f.iso].d + d } : { name: f.name, d };
}

const out = { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, countries };
fs.writeFileSync(new URL('../src/data/world.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${Object.keys(countries).length} countries, viewBox ${out.viewBox}, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
