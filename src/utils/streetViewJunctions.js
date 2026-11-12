import { haversineDistance } from './geoUtils';

// University of Abra (UA) Lagangilang Campus Gate & Junction Coordinates
export const UA_CAMPUS_GATE = {
  lat: 17.608139,
  lng: 120.738139,
  title: 'University of Abra Main Gate',
};

// Abra-Kalinga National Highway directly outside the gate (Google Street View covered)
export const UA_HIGHWAY_JUNCTION = {
  lat: 17.607472,
  lng: 120.738417,
  title: 'Abra-Kalinga Highway (UA Campus Gate Entrance)',
};

// Starting Mapillary Sequence Image ID at the Campus Gate (Active 360° Pano at UA Campus Gate)
export const MAPILLARY_CAMPUS_GATE_IMAGE_ID = '1171410495001931';
export const MAPILLARY_CAMPUS_NORTH_GATE_IMAGE_ID = '2181045539141833';

/**
 * Determine if a given coordinate is located inside the University of Abra Lagangilang Campus grounds,
 * where Google Street View has no vehicle coverage, but Mapillary has dedicated campus trails.
 */
export function isInsideUACampus(lat, lng) {
  if (lat == null || lng == null) return false;
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  return (
    parsedLat >= 17.6078 &&
    parsedLat <= 17.6165 &&
    parsedLng >= 120.7365 &&
    parsedLng <= 120.7430
  );
}

/**
 * Determine if coordinates are near the junction where Google Street View Highway connects with
 * the Mapillary Campus Trail (within thresholdMeters).
 */
export function isNearCampusJunction(lat, lng, thresholdMeters = 220) {
  if (lat == null || lng == null) return false;
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const distToGate = haversineDistance(parsedLat, parsedLng, UA_CAMPUS_GATE.lat, UA_CAMPUS_GATE.lng);
  const distToHighway = haversineDistance(parsedLat, parsedLng, UA_HIGHWAY_JUNCTION.lat, UA_HIGHWAY_JUNCTION.lng);
  return distToGate <= thresholdMeters || distToHighway <= thresholdMeters;
}

/**
 * Determine if a given coordinate is located along the official Google Street View coverage
 * corridor in Lagangilang (Abra-Kalinga Road Route 204, Poblacion, Laang, and Balais).
 * Google Street View vehicle covered the national road and municipal center,
 * but did NOT enter UA campus interior grounds or remote nature trails/caves.
 */
export function isNearGoogleStreetViewCorridor(lat, lng, spot = null) {
  if (lat == null || lng == null) return false;
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  // If inside UA Campus grounds, Google Street View has no vehicle coverage
  if (isInsideUACampus(parsedLat, parsedLng)) return false;

  // Remote nature trails, caves, and rivers without road vehicle access
  const spotName = (spot?.name || '').toLowerCase();
  const spotCategory = (spot?.category || '').toLowerCase();
  if (
    spotName.includes('cave') ||
    spotName.includes('dam') ||
    spotName.includes('ugiao') ||
    spotName.includes('rock formation') ||
    spotName.includes('galangugong') ||
    spotName.includes('banat') ||
    spotCategory.includes('cave') ||
    spotCategory.includes('trekking') ||
    spotCategory.includes('adventure')
  ) {
    return false;
  }

  // Google Street View National Highway corridor in Lagangilang spans:
  // Lat: ~17.580 to ~17.635
  // Lng: ~120.730 to ~120.765 along Route 204
  return (
    parsedLat >= 17.580 &&
    parsedLat <= 17.635 &&
    parsedLng >= 120.730 &&
    parsedLng <= 120.765
  );
}

