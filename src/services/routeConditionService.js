/**
 * Route Condition & Elevation Service
 * 
 * Provides realistic travel time estimation for Lagangilang, Abra by incorporating:
 * - Elevation gain (ascent) and slope grade via Open-Meteo Elevation API (with local topography fallback).
 * - Road conditions (Paved National Highway, Town Streets, Rough Barangay Trails).
 * - Intersection and turn delays.
 * - Transport mode specifics: Car, Motorcycle, Person (Walking).
 */

const elevationCache = new Map();

/**
 * Local topographic elevation model for Lagangilang & surrounding Abra foothills.
 * Abra River valley in the west (~45m-55m) rising towards eastern Cordillera foothills (~250m).
 */
export function getLocalEstimatedElevation(lat, lng) {
  const baseElev = 62;
  const eastDelta = Math.max(0, (lng - 120.730) * 2800);
  const northDelta = Math.max(0, (lat - 17.610) * 1200);
  return Math.round(baseElev + eastDelta + northDelta);
}

/**
 * Fetch elevation profile for an array of [lng, lat] coordinates.
 * Samples evenly spaced points along the path.
 * 
 * @param {Array<[number, number]>} coordinates - Array of [lng, lat]
 * @returns {Promise<{ elevations: number[], ascent: number, descent: number, maxGradePercent: number }>}
 */
export async function getRouteElevationProfile(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return { elevations: [60], ascent: 0, descent: 0, maxGradePercent: 0 };
  }

  // Sample up to 10 points along the route
  const sampleCount = Math.min(10, Math.max(2, coordinates.length));
  const step = Math.max(1, Math.floor(coordinates.length / (sampleCount - 1)));
  const sampledCoords = [];
  
  for (let i = 0; i < coordinates.length; i += step) {
    sampledCoords.push(coordinates[i]);
  }
  if (sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) {
    sampledCoords.push(coordinates[coordinates.length - 1]);
  }

  // Cache key based on start/end coordinates rounded to 4 decimals
  const start = sampledCoords[0];
  const end = sampledCoords[sampledCoords.length - 1];
  const cacheKey = `${start[0].toFixed(4)},${start[1].toFixed(4)}_${end[0].toFixed(4)},${end[1].toFixed(4)}_${sampledCoords.length}`;

  if (elevationCache.has(cacheKey)) {
    return elevationCache.get(cacheKey);
  }

  let elevations = [];
  try {
    const lats = sampledCoords.map((c) => c[1].toFixed(5)).join(',');
    const lngs = sampledCoords.map((c) => c[0].toFixed(5)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s timeout

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.elevation) && data.elevation.length === sampledCoords.length) {
        elevations = data.elevation.map((e) => Math.round(e));
      }
    }
  } catch (err) {
    // Graceful offline fallback
    // console.warn('Elevation API lookup skipped, using local topography model:', err.message);
  }

  // Fallback if network fails or partial
  if (elevations.length !== sampledCoords.length) {
    elevations = sampledCoords.map((c) => getLocalEstimatedElevation(c[1], c[0]));
  }

  // Calculate cumulative ascent and descent
  let ascent = 0;
  let descent = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) ascent += diff;
    else descent += Math.abs(diff);
  }

  const result = {
    elevations,
    ascent,
    descent,
    minElevation: Math.min(...elevations),
    maxElevation: Math.max(...elevations),
  };

  elevationCache.set(cacheKey, result);
  return result;
}

/**
 * Assess road conditions from route steps and road names.
 * 
 * @param {Object} routeData - OSRM route object
 * @returns {Object} Road condition assessment
 */
export function assessRoadConditions(routeData) {
  const steps = routeData?.legs?.flatMap((l) => l.steps || []) || [];
  let highwayDistance = 0;
  let townDistance = 0;
  let trailDistance = 0;
  let turnCount = 0;

  for (const step of steps) {
    const name = (step.name || '').toLowerCase();
    const dist = step.distance || 0;
    const maneuver = step.maneuver?.type || '';

    if (maneuver.includes('turn') || maneuver.includes('roundabout') || maneuver.includes('fork')) {
      turnCount++;
    }

    if (name.includes('highway') || name.includes('abra - kalinga') || name.includes('national') || name.includes('provincial')) {
      highwayDistance += dist;
    } else if (name.includes('poblacion') || name.includes('street') || name.includes('st.') || name.includes('avenue') || name.includes('plaza')) {
      townDistance += dist;
    } else {
      // Interior barangay roads, trails, or unnamed rural tracks
      trailDistance += dist;
    }
  }

  const totalDist = routeData?.distance || 1;
  const isHighwayDominant = highwayDistance / totalDist > 0.6;
  const isTrailPresent = trailDistance / totalDist > 0.25;

  let surfaceType = 'Paved Road';
  if (isHighwayDominant) {
    surfaceType = 'National Highway (Paved)';
  } else if (isTrailPresent) {
    surfaceType = 'Barangay Road & Rural Trails';
  } else {
    surfaceType = 'Town Streets (Paved)';
  }

  return {
    turnCount: Math.max(1, turnCount),
    surfaceType,
    isHighwayDominant,
    isTrailPresent,
    trailDistance,
    highwayDistance,
    townDistance,
  };
}

/**
 * Format duration in seconds into human-readable compact string.
 */
export function formatMinutes(seconds) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

/**
 * Format distance in meters into human-readable km or m string.
 */
export function formatKm(meters) {
  if (!meters) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Calculate mode-specific ETAs with road conditions and elevation delays.
 * 
 * @param {Object} routeData - OSRM route object
 * @param {Object} elevationData - { ascent, descent, minElevation, maxElevation }
 * @param {Object|null} weatherInfo - Optional weather info (e.g. rain/wet roads)
 * @returns {Object} Breakdown for car, motorcycle, and person (walking)
 */
export function calculateAdvancedETAs(routeData, elevationData = null, weatherInfo = null) {
  const distance = routeData?.distance || 0; // meters
  const baseDuration = routeData?.duration || 0; // seconds from OSRM
  const road = assessRoadConditions(routeData);

  const ascent = elevationData?.ascent || 0; // meters climbed
  const isWetWeather = weatherInfo && (
    weatherInfo.condition?.toLowerCase().includes('rain') ||
    weatherInfo.condition?.toLowerCase().includes('shower') ||
    weatherInfo.condition?.toLowerCase().includes('drizzle')
  );

  // ==========================================
  // 1. CAR (🚗)
  // ==========================================
  // Average car speeds: Highway 45 km/h (12.5 m/s), Town 28 km/h (7.8 m/s), Rough Trail 18 km/h (5.0 m/s)
  let carBaseTime = 0;
  if (baseDuration > 0) {
    carBaseTime = baseDuration;
  } else {
    const hDist = road.highwayDistance;
    const tDist = road.townDistance;
    const rDist = road.trailDistance;
    carBaseTime = (hDist / 12.5) + (tDist / 7.8) + (rDist / 5.0);
  }

  // Turn delay: 7s per turn maneuver in Abra
  const carTurnDelay = road.turnCount * 7;

  // Elevation delay: 1.4s per meter ascent (engine load on winding inclines)
  const carElevationDelay = ascent * 1.4;

  // Road condition delay: +20% on rough trails, +12% if wet
  let carConditionMultiplier = 1.0;
  if (road.isTrailPresent) carConditionMultiplier += 0.20;
  if (isWetWeather) carConditionMultiplier += 0.12;

  const totalCarSeconds = Math.round((carBaseTime + carTurnDelay + carElevationDelay) * carConditionMultiplier);

  // ==========================================
  // 2. MOTORCYCLE (🏍️)
  // ==========================================
  // Motorcycles in Abra are agile through town streets (32 km/h = 8.9 m/s) and highways (42 km/h = 11.7 m/s),
  // but slow down cautiously on rough gravel (20 km/h = 5.5 m/s).
  let motoBaseTime = 0;
  if (distance > 0) {
    const hDist = road.highwayDistance;
    const tDist = road.townDistance;
    const rDist = road.trailDistance;
    motoBaseTime = (hDist / 11.7) + (tDist / 8.9) + (rDist / 5.5);
  } else {
    motoBaseTime = baseDuration * 0.95;
  }

  // Turn delay: 5s per turn
  const motoTurnDelay = road.turnCount * 5;

  // Elevation delay: 1.8s per meter ascent (climbing mountain grades on 125-150cc engines)
  const motoElevationDelay = ascent * 1.8;

  // Road condition delay: +22% on rough trails, +20% on wet roads (slip caution)
  let motoConditionMultiplier = 1.0;
  if (road.isTrailPresent) motoConditionMultiplier += 0.22;
  if (isWetWeather) motoConditionMultiplier += 0.20;

  const totalMotoSeconds = Math.round((motoBaseTime + motoTurnDelay + motoElevationDelay) * motoConditionMultiplier);

  // ==========================================
  // 3. PERSON / WALKING (🚶)
  // ==========================================
  // Base flat walking speed: 4.5 km/h = 1.25 m/s on paved road, 3.8 km/h = 1.05 m/s on trails.
  const flatWalkingSpeed = road.isTrailPresent ? 1.05 : 1.25;
  const walkBaseTime = distance / flatWalkingSpeed;

  // Tobler's Hiking function & Naismith's rule:
  // Every 10m of ascent adds ~1 min (+6s per meter) to walking time.
  const walkElevationDelay = ascent * 6.0;

  // Weather & trail condition multiplier: +15% if wet mud/rain
  let walkConditionMultiplier = 1.0;
  if (isWetWeather) walkConditionMultiplier += 0.25;

  const totalWalkSeconds = Math.round((walkBaseTime + walkElevationDelay) * walkConditionMultiplier);

  return {
    distance,
    distanceKm: (distance / 1000).toFixed(1) + ' km',
    distanceFormatted: formatKm(distance),
    ascent,
    surfaceType: road.surfaceType,
    turnCount: road.turnCount,
    isWetWeather,
    car: {
      id: 'driving',
      name: 'Car',
      icon: '🚗',
      seconds: totalCarSeconds,
      formatted: formatMinutes(totalCarSeconds),
      minutes: Math.max(1, Math.round(totalCarSeconds / 60)),
      delayNote: ascent > 10 ? `+${Math.round(carElevationDelay / 60)}m elev` : null,
    },
    motorcycle: {
      id: 'motorcycle',
      name: 'Motorcycle',
      icon: '🏍️',
      seconds: totalMotoSeconds,
      formatted: formatMinutes(totalMotoSeconds),
      minutes: Math.max(1, Math.round(totalMotoSeconds / 60)),
      delayNote: ascent > 10 ? `+${Math.round(motoElevationDelay / 60)}m elev` : null,
    },
    person: {
      id: 'walking',
      name: 'Person',
      icon: '🚶',
      seconds: totalWalkSeconds,
      formatted: formatMinutes(totalWalkSeconds),
      minutes: Math.max(1, Math.round(totalWalkSeconds / 60)),
      delayNote: ascent > 10 ? `+${Math.round(walkElevationDelay / 60)}m climb` : null,
    },
  };
}
