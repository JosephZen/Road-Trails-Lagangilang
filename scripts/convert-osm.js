import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import osmtogeojson from 'osmtogeojson';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CUSTOM_MAPS_DIR = resolve(__dirname, '../CustomMaps');
const GEOJSON_OUTPUT = resolve(__dirname, '../public/data/lagangilang-custom.geojson');

console.log('📍 Converting OSM XML → GeoJSON...');
console.log(`   Scanning: ${CUSTOM_MAPS_DIR}`);
console.log(`   Output:   ${GEOJSON_OUTPUT}`);

// Collect all input files
let inputFiles = [];

if (existsSync(CUSTOM_MAPS_DIR)) {
  const dirFiles = readdirSync(CUSTOM_MAPS_DIR)
    .filter(f => f.endsWith('.osm') || f.endsWith('.xml'))
    .map(f => join(CUSTOM_MAPS_DIR, f));
  if (dirFiles.length > 0) {
    inputFiles = dirFiles;
  }
}

// Fallback candidates if CustomMaps has no .osm files
if (inputFiles.length === 0) {
  const fallbacks = [
    resolve(__dirname, '../map.osm'),
    resolve(__dirname, '../map-1.osm'),
    resolve(__dirname, '../../UA_Lagangilang_Map/map.osm'),
  ];
  const found = fallbacks.find(p => existsSync(p));
  if (found) inputFiles = [found];
}

if (inputFiles.length === 0) {
  console.error(`❌ No .osm input files found in CustomMaps/ or project root!`);
  process.exit(1);
}

console.log(`   Found ${inputFiles.length} OSM file(s) to process:`);
inputFiles.forEach(f => console.log(`   • ${f}`));

const parser = new DOMParser();
const mergedFeaturesMap = new Map();

for (const filePath of inputFiles) {
  const osmXml = readFileSync(filePath, 'utf-8');
  const dom = parser.parseFromString(osmXml, 'text/xml');
  const geojson = osmtogeojson(dom, { flatProperties: true });

  (geojson.features || []).forEach(f => {
    if (!f.properties) f.properties = {};
    if (f.properties.tags && typeof f.properties.tags === 'object') {
      f.properties = { ...f.properties.tags, ...f.properties };
    }
    const id = f.id || `${f.properties.type || 'feat'}/${f.properties.id || Math.random()}`;
    mergedFeaturesMap.set(id, f);
  });
}

const allFeatures = Array.from(mergedFeaturesMap.values());

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
allFeatures.forEach(f => {
  if (f.geometry?.coordinates) expandBounds(f.geometry.coordinates);
});

const resultGeoJSON = {
  type: 'FeatureCollection',
  metadata: {
    source: 'OpenStreetMap export - Lagangilang, Abra',
    convertedAt: new Date().toISOString(),
    inputFiles: inputFiles.map(f => f.split(/[\\/]/).pop()),
    featureCount: allFeatures.length,
    bounds: { minlat: minLat, minlon: minLon, maxlat: maxLat, maxlon: maxLon }
  },
  features: allFeatures
};

console.log(`   Total Merged Features: ${allFeatures.length}`);
console.log(`   Calculated Bounds:`, resultGeoJSON.metadata.bounds);

// Count feature types
const types = {};
allFeatures.forEach(f => {
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
writeFileSync(GEOJSON_OUTPUT, JSON.stringify(resultGeoJSON, null, 2));
console.log('✅ Conversion complete! Output written to public/data/lagangilang-custom.geojson');
