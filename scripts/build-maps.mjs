// Builds the map assets used by the choropleths:
//   src/data/world.json      countries keyed by ISO 3166-1 alpha-2, Equal Earth projection
//   src/data/us-states.json  US states keyed by postal code, Albers USA projection
// from Natural Earth 110m data (public domain):
//
//   NE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
//   curl -sL -o /tmp/ne110.geojson        $NE/ne_110m_admin_0_countries.geojson
//   curl -sL -o /tmp/ne110_states.geojson $NE/ne_110m_admin_1_states_provinces.geojson
//   node scripts/build-maps.mjs /tmp/ne110.geojson /tmp/ne110_states.geojson
//
// Each output is { viewBox, regions: { KEY: { name, d } } } with path coordinates
// rounded to a tenth of a pixel. Antarctica is dropped from the world map.

import fs from 'node:fs';

const [countriesSrc, statesSrc] = process.argv.slice(2);
if (!countriesSrc || !statesSrc) {
  console.error('usage: node scripts/build-maps.mjs <ne_110m_admin_0_countries.geojson> <ne_110m_admin_1_states_provinces.geojson>');
  process.exit(1);
}

const RAD = Math.PI / 180;
const WIDTH = 960;

// Equal Earth (Šavrič, Patterson, Jenny 2018). Returns [x, y] with y up.
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
function equalEarth([lon, lat]) {
  const lam = lon * RAD, phi = lat * RAD;
  const theta = Math.asin(M * Math.sin(phi));
  const t2 = theta * theta, t6 = t2 * t2 * t2;
  return [
    (lam * Math.cos(theta)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))),
    theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)),
  ];
}

// Albers conic equal-area with d3-style rotate/center/scale/translate. Returns screen [x, y].
function conicEqualArea({ parallels: [p0, p1], rotate, center, scale, translate }) {
  const phi0 = p0 * RAD, phi1 = p1 * RAD;
  const sy0 = Math.sin(phi0);
  const n = (sy0 + Math.sin(phi1)) / 2;
  const c = 1 + sy0 * (2 * n - sy0);
  const r0 = Math.sqrt(c) / n;
  const raw = (lon, lat) => {
    let lam = lon + rotate;
    lam = ((((lam + 180) % 360) + 360) % 360) - 180;
    const r = Math.sqrt(c - 2 * n * Math.sin(lat * RAD)) / n;
    return [r * Math.sin(n * lam * RAD), r0 - r * Math.cos(n * lam * RAD)];
  };
  const [cx, cy] = raw(center[0] - rotate, center[1]);
  return ([lon, lat]) => {
    const [x, y] = raw(lon, lat);
    return [scale * (x - cx) + translate[0], translate[1] - scale * (y - cy)];
  };
}

// d3.geoAlbersUsa layout: insets are offset in units of the mainland scale K.
const K = 1070, TX = 480, TY = 250;
const lower48 = conicEqualArea({ parallels: [29.5, 45.5], rotate: 96, center: [-0.6, 38.7], scale: K, translate: [TX, TY] });
const alaska = conicEqualArea({ parallels: [55, 65], rotate: 154, center: [-2, 58.5], scale: 0.35 * K, translate: [TX - 0.307 * K, TY + 0.201 * K] });
const hawaii = conicEqualArea({ parallels: [8, 18], rotate: 157, center: [-3, 19.9], scale: K, translate: [TX - 0.205 * K, TY + 0.212 * K] });

function rings(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.flat();
}

const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** Project features, fit to WIDTH, and return { viewBox, regions }. */
function build(features, projectFor, yUp) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const projected = features.map((f) => {
    const project = projectFor(f);
    const rs = rings(f.geometry).map((ring) =>
      ring.map((pt) => {
        const [x, y0] = project(pt);
        const y = yUp ? -y0 : y0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        return [x, y];
      }),
    );
    return { key: f.key, name: f.name, rings: rs };
  });
  const scale = WIDTH / (maxX - minX);
  const height = Math.ceil((maxY - minY) * scale);
  const regions = {};
  for (const f of projected) {
    let d = '';
    for (const ring of f.rings) {
      let prev = null, seg = '';
      for (const [x, y] of ring) {
        const key = `${fmt((x - minX) * scale)},${fmt((y - minY) * scale)}`;
        if (key === prev) continue;
        seg += (seg ? 'L' : 'M') + key;
        prev = key;
      }
      if (seg.split('L').length >= 3) d += seg + 'Z';
    }
    if (!d) continue;
    regions[f.key] = regions[f.key] ? { name: regions[f.key].name, d: regions[f.key].d + d } : { name: f.name, d };
  }
  return { viewBox: `0 0 ${WIDTH} ${height}`, regions };
}

function write(file, data) {
  fs.writeFileSync(new URL(`../src/data/${file}`, import.meta.url), JSON.stringify(data));
  console.log(`wrote ${file}: ${Object.keys(data.regions).length} regions, viewBox ${data.viewBox}, ${(JSON.stringify(data).length / 1024).toFixed(0)} KB`);
}

// World countries.
const countries = JSON.parse(fs.readFileSync(countriesSrc, 'utf8')).features.flatMap((f) => {
  const p = f.properties;
  const iso = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2;
  if (!iso || iso === '-99' || iso === 'AQ') return [];
  return [{ key: iso, name: p.NAME_LONG || p.NAME, geometry: f.geometry }];
});
write('world.json', build(countries, () => equalEarth, true));

// US states.
const states = JSON.parse(fs.readFileSync(statesSrc, 'utf8')).features.flatMap((f) => {
  const p = f.properties;
  if (p.iso_a2 !== 'US' || !p.postal) return [];
  return [{ key: p.postal, name: p.name, geometry: f.geometry }];
});
write('us-states.json', build(states, (f) => (f.key === 'AK' ? alaska : f.key === 'HI' ? hawaii : lower48), false));
