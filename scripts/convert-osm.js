import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import osmtogeojson from 'osmtogeojson';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Candidate input OSM files (prioritizing root map-1.osm or map.osm)
const candidateInputs = [
  resolve(__dirname, '../map-1.osm'),
  resolve(__dirname, '../map.osm'),
  resolve(__dirname, '../../UA_Lagangilang_Map/map.osm'),
];

const OSM_INPUT = candidateInputs.find(p => existsSync(p)) || candidateInputs[0];
const GEOJSON_OUTPUT = resolve(__dirname, '../public/data/lagangilang-custom.geojson');

console.log('📍 Converting OSM XML → GeoJSON...');
console.log(`   Input:  ${OSM_INPUT}`);
console.log(`   Output: ${GEOJSON_OUTPUT}`);

if (!existsSync(OSM_INPUT)) {
  console.error(`❌ OSM input file not found at: ${OSM_INPUT}`);
  process.exit(1);
}

// Read OSM XML
const osmXml = readFileSync(OSM_INPUT, 'utf-8');

// Parse XML to DOM
const parser = new DOMParser();
const dom = parser.parseFromString(osmXml, 'text/xml');

// Convert to GeoJSON with flattened properties
const geojson = osmtogeojson(dom, { flatProperties: true });

// Ensure any nested tags are also spread at top-level of properties
geojson.features = (geojson.features || []).map(f => {
  if (!f.properties) f.properties = {};
  if (f.properties.tags && typeof f.properties.tags === 'object') {
    f.properties = { ...f.properties.tags, ...f.properties };
  }
  return f;
});

// Calculate bounds dynamically from features
let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
function expandBounds(coords) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const [lon, lat] = coords;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    return;
  }
  coords.forEach(expandBounds);
}
geojson.features.forEach(f => {
  if (f.geometry?.coordinates) expandBounds(f.geometry.coordinates);
});

geojson.metadata = {
  source: 'OpenStreetMap export - Lagangilang, Abra',
  convertedAt: new Date().toISOString(),
  inputFile: OSM_INPUT,
  featureCount: geojson.features.length,
  bounds: { minlat: minLat, minlon: minLon, maxlat: maxLat, maxlon: maxLon }
};

console.log(`   Features: ${geojson.features.length}`);
console.log(`   Calculated Bounds:`, geojson.metadata.bounds);

// Count feature types
const types = {};
geojson.features.forEach(f => {
  const t = f.properties?.highway || f.properties?.building || f.properties?.barrier || f.properties?.natural || f.properties?.landuse || 'other';
  types[t] = (types[t] || 0) + 1;
});
console.log('   Feature breakdown:', types);

// Ensure output directory exists
const outDir = dirname(GEOJSON_OUTPUT);
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

// Write GeoJSON
writeFileSync(GEOJSON_OUTPUT, JSON.stringify(geojson, null, 2));
console.log('✅ Conversion complete! Output written to public/data/lagangilang-custom.geojson');
