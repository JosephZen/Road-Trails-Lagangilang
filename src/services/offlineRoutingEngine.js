/**
 * Offline Routing Engine for Lagangilang, Abra
 * 
 * Provides client-side shortest path calculation using pre-extracted road network
 * GeoJSON graph (lagangilang_roads_graph.json).
 * Operates 100% offline with zero network connectivity.
 */
import { haversineDistance } from '../utils/geoUtils';

let roadGraphData = null;
let spatialGraph = null;

/**
 * Load offline road network GeoJSON.
 */
export async function loadOfflineRoadGraph() {
  if (roadGraphData) return roadGraphData;

  try {
    const res = await fetch('/data/lagangilang_roads_graph.json');
    if (res.ok) {
      roadGraphData = await res.json();
      buildSpatialGraph(roadGraphData);
      return roadGraphData;
    }
  } catch (err) {
    console.warn('Could not load offline road graph file, attempting cached fallback:', err.message);
  }

  // Fallback: Check IndexedDB / localStorage
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('lagangilang_offline_road_graph');
      if (cached) {
        roadGraphData = JSON.parse(cached);
        buildSpatialGraph(roadGraphData);
        return roadGraphData;
      }
    } catch (e) {
      // ignore
    }
  }

  return null;
}

/**
 * Build an adjacency graph from the road LineStrings.
 * Snaps vertices within 15 meters to handle intersection connectivity.
 */
function buildSpatialGraph(geojson) {
  if (!geojson?.features) return null;

  const nodes = new Map(); // id -> [lng, lat]
  const adjacency = new Map(); // nodeId -> [ { targetId, weight } ]

  const SNAP_THRESHOLD_M = 18;

  function findOrCreateNode(lng, lat) {
    // Check if an existing node is within threshold
    for (const [id, coords] of nodes.entries()) {
      const dist = haversineDistance(lat, lng, coords[1], coords[0]);
      if (dist <= SNAP_THRESHOLD_M) {
        return id;
      }
    }
    const newId = `n_${nodes.size}`;
    nodes.set(newId, [lng, lat]);
    adjacency.set(newId, []);
    return newId;
  }

  for (const feature of geojson.features) {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];

      const u = findOrCreateNode(p1[0], p1[1]);
      const v = findOrCreateNode(p2[0], p2[1]);

      if (u === v) continue;

      const uCoord = nodes.get(u);
      const vCoord = nodes.get(v);
      const dist = haversineDistance(uCoord[1], uCoord[0], vCoord[1], vCoord[0]);

      adjacency.get(u).push({ targetId: v, weight: dist });
      adjacency.get(v).push({ targetId: u, weight: dist });
    }
  }

  spatialGraph = { nodes, adjacency };
  return spatialGraph;
}

/**
 * Find the nearest graph node to a given coordinate.
 */
function findNearestNode(lng, lat, graph) {
  let bestId = null;
  let bestDist = Infinity;

  for (const [id, coords] of graph.nodes.entries()) {
    const d = haversineDistance(lat, lng, coords[1], coords[0]);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }

  return { id: bestId, distance: bestDist };
}

/**
 * Priority queue for Dijkstra / A*
 */
class MinPriorityQueue {
  constructor() {
    this.items = [];
  }
  push(val, priority) {
    this.items.push({ val, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }
  pop() {
    return this.items.shift()?.val;
  }
  isEmpty() {
    return this.items.length === 0;
  }
}

/**
 * Calculate route between origin and destination using offline road graph.
 * 
 * @param {[number, number]} origin - [lng, lat]
 * @param {[number, number]} destination - [lng, lat]
 * @param {'driving'|'motorcycle'|'walking'} profile
 * @returns {Promise<Object>} Compatible OSRM route object
 */
export async function calculateOfflineRoute(origin, destination, profile = 'driving') {
  if (!spatialGraph) {
    await loadOfflineRoadGraph();
  }

  if (!spatialGraph || spatialGraph.nodes.size === 0) {
    // Pure Euclidean corridor fallback if no graph loaded
    const dist = haversineDistance(origin[1], origin[0], destination[1], destination[0]);
    const duration = Math.round(dist / (profile === 'walking' ? 1.25 : 8.3));
    return {
      distance: Math.round(dist),
      duration,
      geometry: {
        type: 'LineString',
        coordinates: [origin, destination],
      },
      legs: [
        {
          distance: Math.round(dist),
          duration,
          steps: [
            {
              name: 'Direct Path (Offline Estimate)',
              distance: Math.round(dist),
              duration,
              maneuver: { type: 'depart', instruction: 'Head towards destination' },
            },
          ],
        },
      ],
      isOfflineRoute: true,
    };
  }

  const startNear = findNearestNode(origin[0], origin[1], spatialGraph);
  const endNear = findNearestNode(destination[0], destination[1], spatialGraph);

  if (!startNear.id || !endNear.id) {
    throw new Error('Could not connect points to offline road network');
  }

  // A* Search on graph
  const startId = startNear.id;
  const endId = endNear.id;
  const endCoord = spatialGraph.nodes.get(endId);

  const distances = new Map();
  const previous = new Map();
  const pq = new MinPriorityQueue();

  for (const id of spatialGraph.nodes.keys()) {
    distances.set(id, Infinity);
  }

  distances.set(startId, 0);
  pq.push(startId, 0);

  let found = false;

  while (!pq.isEmpty()) {
    const current = pq.pop();
    if (current === endId) {
      found = true;
      break;
    }

    const currentDist = distances.get(current);
    const neighbors = spatialGraph.adjacency.get(current) || [];

    for (const edge of neighbors) {
      const alt = currentDist + edge.weight;
      if (alt < distances.get(edge.targetId)) {
        distances.set(edge.targetId, alt);
        previous.set(edge.targetId, current);

        const targetCoord = spatialGraph.nodes.get(edge.targetId);
        const heuristic = haversineDistance(targetCoord[1], targetCoord[0], endCoord[1], endCoord[0]);
        pq.push(edge.targetId, alt + heuristic);
      }
    }
  }

  // Reconstruct path
  const pathCoords = [];
  let curr = endId;

  if (found || previous.has(endId)) {
    while (curr) {
      pathCoords.unshift(spatialGraph.nodes.get(curr));
      curr = previous.get(curr);
    }
  }

  // Ensure origin and destination are stitched to path ends
  pathCoords.unshift(origin);
  pathCoords.push(destination);

  let totalDistance = 0;
  for (let i = 0; i < pathCoords.length - 1; i++) {
    totalDistance += haversineDistance(
      pathCoords[i][1], pathCoords[i][0],
      pathCoords[i + 1][1], pathCoords[i + 1][0]
    );
  }

  const speedMs = profile === 'walking' ? 1.25 : profile === 'motorcycle' ? 8.9 : 8.3;
  const duration = Math.round(totalDistance / speedMs);

  return {
    distance: Math.round(totalDistance),
    duration,
    geometry: {
      type: 'LineString',
      coordinates: pathCoords,
    },
    legs: [
      {
        distance: Math.round(totalDistance),
        duration,
        steps: [
          {
            name: 'Offline Road Corridor',
            distance: Math.round(totalDistance),
            duration,
            maneuver: { type: 'depart', instruction: 'Follow offline trail corridor' },
          },
        ],
      },
    ],
    isOfflineRoute: true,
  };
}
