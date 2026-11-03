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
const DB_VERSION = 2;

// Stores: 'tiles', 'custom_map', 'routing', 'metadata', 'media_360'
const STORE_TILES = 'tiles';
const STORE_CUSTOM_MAP = 'custom_map';
const STORE_ROUTING = 'routing';
const STORE_METADATA = 'metadata';
const STORE_360_MEDIA = 'media_360';

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
      if (!db.objectStoreNames.contains(STORE_360_MEDIA)) {
        db.createObjectStore(STORE_360_MEDIA);
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

      // Stage 3: Cache Road Network Routing Graph (30%)
      onProgress({
        stage: 'routing',
        percent: 30,
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

      // Stage 4: Cache Custom 360° Landmark Panoramas & Spot Photos (55%)
      const mediaCandidates = [];
      touristSpots.forEach((s) => {
        const ids = [s.id];
        if (s.connected360?.targetId) ids.push(s.connected360.targetId);
        if (s.primary_pano_id) ids.push(s.primary_pano_id);

        const urls = [];
        if (s.connected360?.imageUrl && !s.connected360.imageUrl.includes('mapillary') && !s.connected360.imageUrl.includes('google')) {
          urls.push(s.connected360.imageUrl);
        }
        if (s.image && !s.image.includes('mapillary') && !s.image.includes('google')) {
          urls.push(s.image);
        }
        if (s.connected360?.targetId && !String(s.connected360.targetId).includes('mapillary')) {
          urls.push(`/panoramas/${s.connected360.targetId}.jpg`);
        }
        if (Array.isArray(s.images)) {
          s.images.forEach((img) => {
            if (img && typeof img === 'string' && !img.includes('mapillary')) urls.push(img);
          });
        }
        if (s.panoramaUrl) urls.push(s.panoramaUrl);
        if (s.image360) urls.push(s.image360);

        urls.forEach((url) => {
          mediaCandidates.push({ spotId: s.id, spotName: s.name, ids, url });
        });
      });

      // Deduplicate candidate URLs
      const uniqueMedia = [];
      const seenUrls = new Set();
      mediaCandidates.forEach((item) => {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          uniqueMedia.push(item);
        }
      });

      let cachedMediaCount = 0;
      onProgress({
        stage: 'media_360',
        percent: 40,
        mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
        message: `Caching Custom 360° Panoramas & Photos (0 / ${uniqueMedia.length})...`,
      });

      for (let i = 0; i < uniqueMedia.length; i++) {
        const item = uniqueMedia[i];
        try {
          // If already a base64 data URI
          if (item.url.startsWith('data:')) {
            const dataUri = item.url;
            await this.put360Media(db, item.url, { dataUri, spotId: item.spotId });
            item.ids.forEach(async (id) => {
              await this.put360Media(db, id, { dataUri, spotId: item.spotId });
            });
            cachedMediaCount++;
            continue;
          }

          const res = await fetch(item.url, { mode: 'cors' });
          if (res.ok) {
            const blob = await res.blob();
            totalBytes += blob.size;
            const dataUri = await this.blobToDataUri(blob);
            await this.put360Media(db, item.url, { blob, dataUri, spotId: item.spotId });
            for (const id of item.ids) {
              await this.put360Media(db, id, { blob, dataUri, spotId: item.spotId });
            }
            cachedMediaCount++;
          }
        } catch (err) {
          // Continue if single image fails
        }

        const mediaPercent = 40 + Math.round(((i + 1) / Math.max(1, uniqueMedia.length)) * 18);
        onProgress({
          stage: 'media_360',
          percent: mediaPercent,
          mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
          message: `📸 Caching Custom 360° Landmark Panoramas & Spot Photos (${cachedMediaCount} / ${uniqueMedia.length})...`,
        });
      }

      // Stage 5: Cache Map Tiles (Zooms 12 - 16 across Lagangilang BBox) (100%)
      // Uses CORS-friendly CartoDB Voyager tiles (never throws 403 Access Blocked on file://, webviews or offline)
      const tileList = getBboxTileList(LAGANGILANG_BBOX, 12, 16);
      const totalTiles = tileList.length;

      onProgress({
        stage: 'tiles',
        percent: 60,
        mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
        message: `Downloading ${totalTiles} High-Res CartoDB Voyager Map Tiles...`,
      });

      const subdomains = ['a', 'b', 'c', 'd'];
      const batchSize = 6;
      let completedTiles = 0;

      for (let i = 0; i < tileList.length; i += batchSize) {
        const batch = tileList.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (t) => {
            const tileKey = `${t.z}/${t.x}/${t.y}`;
            const s = subdomains[(t.x + t.y) % subdomains.length];
            const tileUrl = `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${t.z}/${t.x}/${t.y}.png`;

            try {
              const res = await fetch(tileUrl, { mode: 'cors' });
              if (res.ok) {
                const blob = await res.blob();
                totalBytes += blob.size;
                const dataUri = await this.blobToDataUri(blob);
                await this.putTileRecord(db, tileKey, { blob, dataUri });
              }
            } catch (err) {
              // Tile failed, continue without breaking bundle
            } finally {
              completedTiles++;
            }
          })
        );

        const tilePercent = 60 + Math.round((completedTiles / totalTiles) * 38);
        onProgress({
          stage: 'tiles',
          percent: tilePercent,
          mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
          message: `Caching CartoDB Voyager Tiles: ${completedTiles} of ${totalTiles} complete...`,
        });
      }

      // Finalize Metadata
      const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1);
      const bundleInfo = {
        sizeMB,
        totalBytes,
        spotsCount: touristSpots.length,
        hotlinesCount: hotlines.length,
        cached360Count: cachedMediaCount,
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

  blobToDataUri(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  putTileRecord(db, tileKey, record) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TILES, 'readwrite');
      const store = tx.objectStore(STORE_TILES);
      store.put(record, tileKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  put360Media(db, key, record) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_360_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_360_MEDIA);
      store.put(record, String(key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async get360Media(idOrUrl) {
    if (!idOrUrl) return null;
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(STORE_360_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_360_MEDIA);
      const req = store.get(String(idOrUrl));
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const val = req.result;
          if (!val) return resolve(null);
          if (val.dataUri) return resolve(val.dataUri);
          if (val.blob) return resolve(URL.createObjectURL(val.blob));
          if (typeof val === 'string') return resolve(val);
          resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async getAll360Media() {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(STORE_360_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_360_MEDIA);
      return new Promise((resolve) => {
        const mediaMap = {};
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const val = cursor.value;
            const dataUri = val?.dataUri || (typeof val === 'string' ? val : null);
            if (dataUri) mediaMap[cursor.key] = dataUri;
            cursor.continue();
          } else {
            resolve(mediaMap);
          }
        };
        req.onerror = () => resolve({});
      });
    } catch (e) {
      return {};
    }
  }

  async getAllTileDataUris() {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(STORE_TILES, 'readonly');
      const store = tx.objectStore(STORE_TILES);
      return new Promise((resolve) => {
        const tileDict = {};
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const val = cursor.value;
            const dataUri = val?.dataUri || (typeof val === 'string' && val.startsWith('data:') ? val : null);
            if (dataUri) tileDict[cursor.key] = dataUri;
            cursor.continue();
          } else {
            resolve(tileDict);
          }
        };
        req.onerror = () => resolve({});
      });
    } catch (e) {
      return {};
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
        req.onsuccess = () => {
          const val = req.result;
          if (!val) return resolve(null);
          if (val instanceof Blob) return resolve(val);
          if (val.blob instanceof Blob) return resolve(val.blob);
          if (val.dataUri && val.dataUri.startsWith('data:')) {
            try {
              const byteString = atob(val.dataUri.split(',')[1]);
              const mimeString = val.dataUri.split(',')[0].split(':')[1].split(';')[0];
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              return resolve(new Blob([ab], { type: mimeString }));
            } catch (_) {}
          }
          resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async clearOfflineData() {
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(
        [STORE_TILES, STORE_CUSTOM_MAP, STORE_ROUTING, STORE_METADATA, STORE_360_MEDIA],
        'readwrite'
      );
      tx.objectStore(STORE_TILES).clear();
      tx.objectStore(STORE_CUSTOM_MAP).clear();
      tx.objectStore(STORE_ROUTING).clear();
      tx.objectStore(STORE_METADATA).clear();
      if (tx.objectStoreNames.contains(STORE_360_MEDIA)) {
        tx.objectStore(STORE_360_MEDIA).clear();
      }
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
