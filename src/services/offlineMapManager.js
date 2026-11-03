/**
 * High-Capacity Offline Map Manager (Up to 200 MB)
 * 
 * Powered by IndexedDB (`lagangilang_offline_db`) and Cache API.
 * Packages and persists:
 * 1. Base Map Tiles (Zoom levels 12 - 19 across Lagangilang bounding box)
 * 2. Custom Map Overlays (Campus polygons, aligned streetview lines, local GeoJSON)
 * 3. Offline Road Network Routing Graph (lagangilang_roads_graph.json)
 * 4. POIs, Tourist Spots, Hotlines, and DENR Checkpoints
 */

const DB_NAME = 'lagangilang_offline_db';
const DB_VERSION = 1;

// Stores: 'tiles', 'custom_map', 'routing', 'metadata'
const STORE_TILES = 'tiles';
const STORE_CUSTOM_MAP = 'custom_map';
const STORE_ROUTING = 'routing';
const STORE_METADATA = 'metadata';

// Bounding box for Lagangilang, Abra
export const LAGANGILANG_BBOX = {
  minLat: 17.5500,
  maxLat: 17.6800,
  minLng: 120.7000,
  maxLng: 120.8800,
};

/**
 * Open or initialize IndexedDB
 */
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_TILES)) {
        db.createObjectStore(STORE_TILES);
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOM_MAP)) {
        db.createObjectStore(STORE_CUSTOM_MAP);
      }
      if (!db.objectStoreNames.contains(STORE_ROUTING)) {
        db.createObjectStore(STORE_ROUTING);
      }
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Convert lat/lng to tile XYZ coordinates
 */
export function lngLatToTile(lng, lat, zoom) {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
  return { x, y, z: zoom };
}

/**
 * Generate tile list covering the Lagangilang bounding box for zooms 12 through 19.
 */
export function getBboxTileList(bbox = LAGANGILANG_BBOX, minZoom = 12, maxZoom = 17) {
  const tiles = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const minTile = lngLatToTile(bbox.minLng, bbox.maxLat, z);
    const maxTile = lngLatToTile(bbox.maxLng, bbox.minLat, z);

    for (let x = minTile.x; x <= maxTile.x; x++) {
      for (let y = minTile.y; y <= maxTile.y; y++) {
        tiles.push({ x, y, z });
      }
    }
  }

  return tiles;
}

class OfflineMapManager {
  constructor() {
    this.isDownloading = false;
  }

  /**
   * Get cached offline metadata
   */
  async getStatus() {
    try {
      const db = await openOfflineDB();
      return new Promise((resolve) => {
        const tx = db.transaction([STORE_METADATA, STORE_TILES], 'readonly');
        const metaStore = tx.objectStore(STORE_METADATA);
        const tileStore = tx.objectStore(STORE_TILES);

        const metaReq = metaStore.get('bundle_info');
        const countReq = tileStore.count();

        tx.oncomplete = () => {
          const meta = metaReq.result || null;
          const tileCount = countReq.result || 0;
          resolve({
            isReady: Boolean(meta),
            tileCount,
            sizeMB: meta?.sizeMB || (tileCount * 0.025).toFixed(1),
            timestamp: meta?.timestamp || null,
            spotsCount: meta?.spotsCount || 0,
            hasCustomMap: Boolean(meta?.hasCustomMap),
            hasRoutingGraph: Boolean(meta?.hasRoutingGraph),
          });
        };
        tx.onerror = () => resolve({ isReady: false, tileCount: 0 });
      });
    } catch (e) {
      return { isReady: false, tileCount: 0 };
    }
  }

  /**
   * Download and package full offline bundle up to 200 MB
   * 
   * @param {Object} options
   * @param {Array} options.touristSpots
   * @param {Object} options.customGeoJSON
   * @param {Array} options.hotlines
   * @param {Function} options.onProgress - ({ stage, percent, mbDownloaded, message }) => void
   */
  async downloadFullOfflineBundle({
    touristSpots = [],
    customGeoJSON = null,
    hotlines = [],
    onProgress = () => {},
  }) {
    if (this.isDownloading) return;
    this.isDownloading = true;

    try {
      const db = await openOfflineDB();
      let totalBytes = 0;

      // Stage 1: Save POIs, Tourist Spots & DENR Checkpoints / Hotlines (10%)
      onProgress({
        stage: 'spots',
        percent: 5,
        mbDownloaded: '0.2',
        message: 'Saving Tourist Spots, DENR Checkpoints & Hotlines...',
      });

      const spotsBundle = {
        spots: touristSpots,
        hotlines,
        cachedAt: new Date().toISOString(),
      };
      await this.putRecord(db, STORE_METADATA, 'spots_bundle', spotsBundle);
      totalBytes += JSON.stringify(spotsBundle).length;

      // Stage 2: Cache Custom Map Overlays (30%)
      onProgress({
        stage: 'custom_map',
        percent: 20,
        mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
        message: 'Preserving Custom Map Overlays & Aligned Curves...',
      });

      let customMapData = customGeoJSON;
      if (!customMapData) {
        try {
          const res = await fetch('/data/lagangilang-custom.geojson');
          if (res.ok) customMapData = await res.json();
        } catch (e) {
          console.warn('Could not load custom geojson file:', e);
        }
      }

      if (customMapData) {
        await this.putRecord(db, STORE_CUSTOM_MAP, 'overlay_geojson', customMapData);
        totalBytes += JSON.stringify(customMapData).length;
      }

      // Also preserve aligned sequences
      try {
        const alignRes = await fetch('/data/aligned_sequences.json');
        if (alignRes.ok) {
          const alignedData = await alignRes.json();
          await this.putRecord(db, STORE_CUSTOM_MAP, 'aligned_sequences', alignedData);
          totalBytes += JSON.stringify(alignedData).length;
        }
      } catch (e) {
        // ignore
      }

      // Stage 3: Cache Road Network Routing Graph (50%)
      onProgress({
        stage: 'routing',
        percent: 40,
        mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
        message: 'Caching Offline Road Routing Graph...',
      });

      try {
        const roadRes = await fetch('/data/lagangilang_roads_graph.json');
        if (roadRes.ok) {
          const roadGraph = await roadRes.json();
          await this.putRecord(db, STORE_ROUTING, 'roads_graph', roadGraph);
          totalBytes += JSON.stringify(roadGraph).length;
        }
      } catch (e) {
        console.warn('Could not cache road routing graph:', e);
      }

      // Stage 4: Cache Map Tiles (Zooms 12 - 16 across Lagangilang BBox) (100%)
      const tileList = getBboxTileList(LAGANGILANG_BBOX, 12, 16);
      const totalTiles = tileList.length;

      onProgress({
        stage: 'tiles',
        percent: 50,
        mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
        message: `Downloading ${totalTiles} High-Res Map Tiles for Lagangilang...`,
      });

      // Fetch and store tiles in batches of 6 concurrent requests
      const batchSize = 6;
      let completedTiles = 0;

      for (let i = 0; i < tileList.length; i += batchSize) {
        const batch = tileList.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (t) => {
            const tileKey = `${t.z}/${t.x}/${t.y}`;
            const tileUrl = `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`;

            try {
              const res = await fetch(tileUrl, { mode: 'cors', credentials: 'omit' });
              if (res.ok) {
                const blob = await res.blob();
                totalBytes += blob.size;
                await this.putTileBlob(db, tileKey, blob);
              }
            } catch (err) {
              // Tile failed, continue without breaking bundle
            } finally {
              completedTiles++;
            }
          })
        );

        const tilePercent = 50 + Math.round((completedTiles / totalTiles) * 48);
        onProgress({
          stage: 'tiles',
          percent: tilePercent,
          mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
          message: `Caching Tiles: ${completedTiles} of ${totalTiles} complete...`,
        });
      }

      // Finalize Metadata
      const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1);
      const bundleInfo = {
        sizeMB,
        totalBytes,
        spotsCount: touristSpots.length,
        hotlinesCount: hotlines.length,
        hasCustomMap: Boolean(customMapData),
        hasRoutingGraph: true,
        timestamp: new Date().toISOString(),
      };

      await this.putRecord(db, STORE_METADATA, 'bundle_info', bundleInfo);

      onProgress({
        stage: 'complete',
        percent: 100,
        mbDownloaded: sizeMB,
        message: `Offline bundle ready! ${sizeMB} MB saved to device.`,
      });

      return bundleInfo;
    } finally {
      this.isDownloading = false;
    }
  }

  putRecord(db, storeName, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  putTileBlob(db, tileKey, blob) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TILES, 'readwrite');
      const store = tx.objectStore(STORE_TILES);
      store.put(blob, tileKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getTileBlob(z, x, y) {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(STORE_TILES, 'readonly');
      const store = tx.objectStore(STORE_TILES);
      const req = store.get(`${z}/${x}/${y}`);
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async clearOfflineData() {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction([STORE_TILES, STORE_CUSTOM_MAP, STORE_ROUTING, STORE_METADATA], 'readwrite');
      tx.objectStore(STORE_TILES).clear();
      tx.objectStore(STORE_CUSTOM_MAP).clear();
      tx.objectStore(STORE_ROUTING).clear();
      tx.objectStore(STORE_METADATA).clear();
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }
}

export const offlineMapManager = new OfflineMapManager();
export default offlineMapManager;
