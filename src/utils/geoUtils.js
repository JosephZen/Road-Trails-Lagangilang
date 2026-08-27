/**
 * Geographic utility functions for distance, bearing, and neighbor calculations.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Haversine distance between two lat/lng points in meters.
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLng = (lng2 - lng1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG2RAD) *
      Math.cos(lat2 * DEG2RAD) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate initial bearing from point 1 to point 2.
 * Returns degrees (0-360, where 0 = North).
 */
export function calculateBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * DEG2RAD;
  const y = Math.sin(dLng) * Math.cos(lat2 * DEG2RAD);
  const x =
    Math.cos(lat1 * DEG2RAD) * Math.sin(lat2 * DEG2RAD) -
    Math.sin(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.cos(dLng);
  const bearing = Math.atan2(y, x) * RAD2DEG;
  return (bearing + 360) % 360;
}

/**
 * Find the N nearest panoramas to a given point, sorted by distance.
 */
export function findNearestPanoramas(lat, lng, panoramas, maxCount = 5, maxDistance = 200) {
  return panoramas
    .map((pano) => ({
      ...pano,
      distance: haversineDistance(lat, lng, pano.lat, pano.lng),
    }))
    .filter((pano) => pano.distance <= maxDistance && pano.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxCount);
}

/**
 * Auto-link neighbors for all panoramas based on proximity.
 * Each panorama gets linked to nearby panoramas within maxDistance.
 */
export function autoLinkNeighbors(panoramas, maxDistance = 200, maxNeighbors = 8) {
  return panoramas.map((pano) => {
    const nearest = findNearestPanoramas(pano.lat, pano.lng, panoramas, maxNeighbors, maxDistance);
    return {
      ...pano,
      neighbors: nearest.map((n) => n.id),
    };
  });
}

/**
 * Get the panorama that the user is "looking at" based on current yaw/heading.
 */
export function getPanoramaInDirection(currentPano, yaw, panoramas) {
  if (!currentPano || !currentPano.neighbors || currentPano.neighbors.length === 0) {
    return null;
  }

  const neighbors = currentPano.neighbors
    .map((id) => panoramas.find((p) => p.id === id))
    .filter(Boolean);

  if (neighbors.length === 0) return null;

  // Find the neighbor closest to the user's look direction
  let bestMatch = null;
  let bestAngleDiff = 360;

  for (const neighbor of neighbors) {
    const bearing = calculateBearing(
      currentPano.lat, currentPano.lng,
      neighbor.lat, neighbor.lng
    );
    let angleDiff = Math.abs(bearing - yaw);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;

    if (angleDiff < bestAngleDiff) {
      bestAngleDiff = angleDiff;
      bestMatch = neighbor;
    }
  }

  return bestMatch;
}

/**
 * Format coordinates for display.
 */
export function formatCoords(lat, lng) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * Format distance for display.
 */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
