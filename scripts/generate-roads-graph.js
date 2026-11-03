/**
 * Fetch and extract road network for Lagangilang, Abra into GeoJSON format.
 * Used for 100% offline client-side routing when internet is unavailable.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function extractRoads() {
  console.log('Fetching road network from Overpass API for Lagangilang, Abra...');
  // Bounding box covering Lagangilang and neighboring Abra corridors
  const minLat = 17.5500;
  const maxLat = 17.6800;
  const minLng = 120.7000;
  const maxLng = 120.8800;

  const query = `[out:json][timeout:25];(way["highway"](${minLat},${minLng},${maxLat},${maxLng}););out geom;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  let data = null;
  for (const ep of endpoints) {
    try {
      console.log(`Trying Overpass mirror: ${ep}...`);
      const url = ep + '?data=' + encodeURIComponent(query);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'LagangilangTrailsOfflineGenerator/1.0' },
      });
      if (res.ok) {
        data = await res.json();
        break;
      }
    } catch (e) {
      console.warn(`Mirror ${ep} failed:`, e.message);
    }
  }

  if (!data || !data.elements) {
    throw new Error('All Overpass mirrors failed or timed out');
  }

  const elements = data.elements || [];
  console.log(`Fetched ${elements.length} road ways from Overpass.`);

  const features = [];
  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const coords = el.geometry.map((pt) => [pt.lon, pt.lat]);

    features.push({
      type: 'Feature',
      id: el.id,
      properties: {
        id: el.id,
        name: el.tags?.name || 'Unnamed Road / Trail',
        highway: el.tags?.highway || 'road',
        surface: el.tags?.surface || (el.tags?.highway === 'primary' || el.tags?.highway === 'secondary' ? 'paved' : 'unpaved'),
        oneway: el.tags?.oneway === 'yes',
      },
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
    });
  }

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      municipality: 'Lagangilang, Abra, Philippines',
      extractedAt: new Date().toISOString(),
      bbox: [minLng, minLat, maxLng, maxLat],
      roadCount: features.length,
    },
    features,
  };

  const outputPath = path.resolve(__dirname, '../public/data/lagangilang_roads_graph.json');
  fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2), 'utf-8');
  console.log(`Successfully saved ${features.length} road features to ${outputPath}`);
}

extractRoads().catch((err) => {
  console.error('Failed to extract roads:', err);
  process.exit(1);
});
