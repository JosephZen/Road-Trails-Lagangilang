import { calculateOfflineRoute } from './offlineRoutingEngine';

/**
 * OSRM Routing Service
 * Calls the OSRM HTTP API for turn-by-turn route calculation.
 * Seamlessly falls back to client-side offline routing engine when disconnected.
 */
const OSRM_URL = import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org';

/**
 * Fetch a route from OSRM.
 * @param {[number, number]} origin - [lng, lat]
 * @param {[number, number]} destination - [lng, lat]
 * @param {'driving'|'foot'|'bicycle'|'motorcycle'|'car'|'walking'} profile
 * @returns {Promise<Object>} OSRM route object with geometry, legs, steps, duration, distance
 */
export async function getRoute(origin, destination, profile = 'driving') {
  // Map friendly / app profile names to standard OSRM demo server endpoints
  let osrmProfile = 'driving';
  if (profile === 'walking' || profile === 'foot' || profile === 'pedestrian') {
    osrmProfile = 'foot';
  } else if (profile === 'bicycle') {
    osrmProfile = 'bicycle';
  } else {
    osrmProfile = 'driving'; // Used for 'car', 'motorcycle', and 'driving'
  }

  const coords = `${origin[0]},${origin[1]};${destination[0]},${destination[1]}`;
  const url = `${OSRM_URL}/route/v1/${osrmProfile}/${coords}?steps=true&geometries=geojson&overview=full&annotations=duration,distance&alternatives=3`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM request failed: ${res.status}`);
    
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error(data.message || 'No route found');
    }
    
    const primary = data.routes[0];
    primary.allRoutes = data.routes;
    primary.alternatives = data.routes.slice(1);
    primary.activeRouteIndex = 0;
    return primary;
  } catch (err) {
    // If foot route fails (e.g. no pedestrian tags on rural Abra road), fallback to driving geometry
    if (osrmProfile === 'foot') {
      try {
        const fallbackUrl = `${OSRM_URL}/route/v1/driving/${coords}?steps=true&geometries=geojson&overview=full&annotations=duration,distance&alternatives=3`;
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.code === 'Ok' && fallbackData.routes?.length) {
            const primary = fallbackData.routes[0];
            primary.allRoutes = fallbackData.routes;
            primary.alternatives = fallbackData.routes.slice(1);
            primary.activeRouteIndex = 0;
            return primary;
          }
        }
      } catch (fallbackErr) {
        // Continue to offline fallback
      }
    }

    // 100% Offline Client-Side Graph Routing Fallback
    console.warn('Online routing API failed or offline. Switching to client-side offline graph router:', err.message);
    const offRoute = await calculateOfflineRoute(origin, destination, profile);
    offRoute.allRoutes = [offRoute];
    offRoute.alternatives = [];
    offRoute.activeRouteIndex = 0;
    return offRoute;
  }
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
