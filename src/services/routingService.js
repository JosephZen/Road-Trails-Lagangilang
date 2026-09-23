/**
 * OSRM Routing Service
 * Calls the OSRM HTTP API for turn-by-turn route calculation.
 * Uses the public demo server by default (configurable via env var).
 */
const OSRM_URL = import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org';

/**
 * Fetch a route from OSRM.
 * @param {[number, number]} origin - [lng, lat]
 * @param {[number, number]} destination - [lng, lat]
 * @param {'driving'|'foot'|'bicycle'} profile
 * @returns {Promise<Object>} OSRM route object with geometry, legs, steps, duration, distance
 */
export async function getRoute(origin, destination, profile = 'driving') {
  const coords = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url = `${OSRM_URL}/route/v1/${profile}/${coords}?steps=true&geometries=geojson&overview=full&annotations=duration,distance`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM request failed: ${res.status}`);
  
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.message || 'No route found');
  }
  
  return data.routes[0];
}

/**
 * Fetch route with alternatives.
 */
export async function getRouteWithAlternatives(origin, destination, profile = 'driving') {
  const coords = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url = `${OSRM_URL}/route/v1/${profile}/${coords}?steps=true&geometries=geojson&overview=full&alternatives=true`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM request failed: ${res.status}`);
  
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(data.message || 'No route found');
  
  return data.routes || [];
}

/**
 * Format duration in seconds to human-readable string.
 */
export function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

/**
 * Format distance in meters to human-readable string.
 */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Get maneuver icon for a step type.
 */
export function getManeuverIcon(type, modifier) {
  const icons = {
    'depart': '🚩',
    'arrive': '🏁',
    'turn': {
      'left': '↰',
      'right': '↱',
      'slight left': '↖',
      'slight right': '↗',
      'sharp left': '⤺',
      'sharp right': '⤻',
      'uturn': '⤴',
      'straight': '↑',
    },
    'continue': '↑',
    'merge': '↗',
    'fork': modifier === 'left' ? '↰' : '↱',
    'roundabout': '🔄',
    'rotary': '🔄',
    'new name': '↑',
    'end of road': modifier === 'left' ? '↰' : '↱',
  };
  
  if (type === 'turn' && modifier) {
    return icons.turn[modifier] || '↑';
  }
  return icons[type] || '↑';
}
