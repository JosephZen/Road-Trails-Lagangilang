import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import osmtogeojson from 'osmtogeojson';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the user's custom OSM file
const OSM_INPUT = resolve(__dirname, '../../UA_Lagangilang_Map/map.osm');
const GEOJSON_OUTPUT = resolve(__dirname, '../public/data/lagangilang-custom.geojson');

console.log('📍 Converting OSM XML → GeoJSON...');
console.log(`   Input:  ${OSM_INPUT}`);
console.log(`   Output: ${GEOJSON_OUTPUT}`);

// Read OSM XML
const osmXml = readFileSync(OSM_INPUT, 'utf-8');

// Parse XML to DOM
const parser = new DOMParser();
const dom = parser.parseFromString(osmXml, 'text/xml');

// Convert to GeoJSON
const geojson = osmtogeojson(dom);

// Add metadata
geojson.metadata = {
  source: 'OpenStreetMap export - Lagangilang, Abra',
  convertedAt: new Date().toISOString(),
  bounds: {
    minlat: 17.60248,
    minlon: 120.73037,
    maxlat: 17.61727,
    maxlon: 120.75560
  }
};

console.log(`   Features: ${geojson.features.length}`);

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
console.log('✅ Conversion complete!');
