/**
 * 17 Official Barangays of the Municipality of Lagangilang, Abra, Philippines
 * Coordinates verified for accurate centroid placement on online & offline maps.
 */

export const LAGANGILANG_BARANGAY_POINTS = [
  { name: 'Aguet', lat: 17.6335, lng: 120.7810 },
  { name: 'Bacooc', lat: 17.6015, lng: 120.7650 },
  { name: 'Balais', lat: 17.5850, lng: 120.7580 },
  { name: 'Cayapa', lat: 17.5920, lng: 120.8050 },
  { name: 'Dalaguisen', lat: 17.5755, lng: 120.7425 },
  { name: 'Laang', lat: 17.6145, lng: 120.7285 },
  { name: 'Lagben', lat: 17.6250, lng: 120.8120 },
  { name: 'Laguiben', lat: 17.6080, lng: 120.7485 },
  { name: 'Nagtipulan', lat: 17.6280, lng: 120.7520 },
  { name: 'Nagtupacan', lat: 17.5945, lng: 120.7450 },
  { name: 'Paganao', lat: 17.6190, lng: 120.7950 },
  { name: 'Pawa', lat: 17.5985, lng: 120.7330 },
  { name: 'Poblacion', lat: 17.6115, lng: 120.7335 },
  { name: 'Presentar', lat: 17.6045, lng: 120.7310 },
  { name: 'San Isidro', lat: 17.5890, lng: 120.7690 },
  { name: 'Tagodtod', lat: 17.6165, lng: 120.7590 },
  { name: 'Taping', lat: 17.6180, lng: 120.7410 },
];

export const BARANGAYS_GEOJSON = {
  type: 'FeatureCollection',
  features: LAGANGILANG_BARANGAY_POINTS.map((b) => ({
    type: 'Feature',
    properties: {
      name: b.name,
      label: `Brgy. ${b.name}`,
    },
    geometry: {
      type: 'Point',
      coordinates: [b.lng, b.lat],
    },
  })),
};

/**
 * Add or re-add the 17 official barangay labels to a MapLibre GL map instance
 */
export function addBarangayLabelsLayer(map) {
  if (!map) return;
  try {
    if (!map.getSource('lagangilang-barangay-labels')) {
      map.addSource('lagangilang-barangay-labels', {
        type: 'geojson',
        data: BARANGAYS_GEOJSON,
      });
    }

    if (!map.getLayer('lagangilang-barangay-labels-layer')) {
      map.addLayer({
        id: 'lagangilang-barangay-labels-layer',
        type: 'symbol',
        source: 'lagangilang-barangay-labels',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 9,
            12, 11,
            15, 13,
            18, 15
          ],
          'text-anchor': 'center',
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#1e293b',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2.5,
          'text-halo-blur': 0.5,
        },
      });
    }
  } catch (err) {
    console.warn('Could not add barangay labels layer:', err.message);
  }
}
