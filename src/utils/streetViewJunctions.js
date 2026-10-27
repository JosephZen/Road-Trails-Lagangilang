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
    parsedLng >= 120.7360 &&
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
