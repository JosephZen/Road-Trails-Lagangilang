import { touristSpotsService } from './touristSpotsService';

/**
 * High-Capacity Offline Map Manager (Up to 1 GB)
 * 
 * Powered by IndexedDB (`lagangilang_offline_db`) and Cache API.
 * Packages and persists:
 * 1. Base Map Tiles (Zoom levels 12 - 18 across Lagangilang bounding box)
 * 2. Custom Map Overlays (Campus polygons, aligned streetview lines, local GeoJSON)
 * 3. Offline Road Network Routing Graph (lagangilang_roads_graph.json)
 * 4. POIs, Tourist Spots, Hotlines, and DENR Checkpoints
 * 5. Full 360° Landmark Panoramas directly from Neon Cloud Database
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
   * Auto-migration: Purges any old corrupted watermarked CartoDB tiles from IndexedDB
   */
  async checkTileMigration() {
    if (typeof localStorage === 'undefined') return;
    const MIGRATION_KEY = 'lagangilang_clean_tiles_migrated_v3';
    if (localStorage.getItem(MIGRATION_KEY) === 'true') return;
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(STORE_TILES, 'readwrite');
      tx.objectStore(STORE_TILES).clear();
      localStorage.setItem(MIGRATION_KEY, 'true');
    } catch (_) {}
  }

  /**
   * Get cached offline metadata
   */
  async getStatus() {
    await this.checkTileMigration();
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
            cached360Count: meta?.cached360Count || 0,
            maxZoom: meta?.maxZoom || 16,
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
   * Get device storage quota and usage
   */
  async getStorageEstimate() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usageMB = (estimate.usage / (1024 * 1024)).toFixed(1);
        const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
        const quotaGB = (estimate.quota / (1024 * 1024 * 1024)).toFixed(1);
        const percentUsed = Math.round((estimate.usage / estimate.quota) * 100) || 0;
        return { usageMB, quotaMB, quotaGB, percentUsed };
      } catch (_) {}
    }
    return { usageMB: '0', quotaMB: '1000', quotaGB: '1.0', percentUsed: 0 };
  }

  /**
   * Download and package full offline bundle up to 1 GB
   * 
   * @param {Object} options
   * @param {Array} options.touristSpots
   * @param {Object} options.customGeoJSON
   * @param {Array} options.hotlines
   * @param {number} options.maxZoom - Maximum zoom level (16 for ~55MB, 17 for ~140MB, 18 for ~470MB)
   * @param {Function} options.onProgress - ({ stage, percent, mbDownloaded, message }) => void
   */
  async downloadFullOfflineBundle({
    touristSpots = [],
    customGeoJSON = null,
    hotlines = [],
    maxZoom = 17,
    onProgress = () => {},
  }) {
    if (this.isDownloading) return;
    this.isDownloading = true;

    // Request persistent storage to protect downloaded data from browser eviction
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        await navigator.storage.persist();
      } catch (_) {}
    }

    try {
      const db = await openOfflineDB();
      let totalBytes = 0;

      // Stage 1: Save POIs, Tourist Spots & DENR Checkpoints / Hotlines (5%)
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

      // Stage 2: Cache Custom Map Overlays (15%)
      onProgress({
        stage: 'custom_map',
        percent: 15,
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

      // Stage 3: Cache Road Network Routing Graph (25%)
      onProgress({
        stage: 'routing',
        percent: 25,
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

      // Stage 4: Cache Full 360° Landmark Panoramas from Neon Cloud Database (55%)
      onProgress({
        stage: 'media_360',
        percent: 32,
        mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
        message: 'Connecting to Neon Cloud Database for full 360° Landmark Panoramas...',
      });

      let cachedMediaCount = 0;
      let panoList = [];
      try {
        panoList = await touristSpotsService.fetchPanoramaIdsWithImages();
      } catch (err) {
        console.warn('Could not query 360 panoramas list from NeonDB:', err);
      }

      // 1. Process all 360 Panoramas retrieved from Neon Cloud Database individually (safely under 10MB limit)
      if (Array.isArray(panoList) && panoList.length > 0) {
        for (let i = 0; i < panoList.length; i++) {
          const np = panoList[i];
          const panoPercent = 30 + Math.round(((i + 1) / panoList.length) * 26);
          onProgress({
            stage: 'media_360',
            percent: panoPercent,
            mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
            message: `📸 Downloading 360° Photo (${i + 1}/${panoList.length}): ${np.label || np.id}...`,
          });

          let dataUri = null;
          try {
            dataUri = await touristSpotsService.fetchPanoramaImageData(np.id);
          } catch (fetchErr) {
            console.warn(`Could not fetch image data for pano ${np.id}:`, fetchErr);
          }
          if (!dataUri) continue;

          const panoClean = String(np.id).replace(/^pano_/, '');
          const panoFull = String(np.id).startsWith('pano_') ? String(np.id) : `pano_${np.id}`;
          
          // Approximate byte size of base64 data URI
          totalBytes += Math.round(dataUri.length * 0.75);

          const record = {
            dataUri,
            id: np.id,
            label: np.label,
            heading: np.heading,
            updatedAt: new Date().toISOString(),
          };

          // Save under all possible identifier aliases for instant recall
          const keys = new Set([
            panoFull,
            panoClean,
            np.id,
            `${panoClean}.jpg`,
            `${panoFull}.jpg`,
            `/panoramas/${panoClean}.jpg`,
            `/panoramas/${panoFull}.jpg`,
          ]);

          if (np.filename) {
            keys.add(np.filename);
            keys.add(`/panoramas/${np.filename}`);
          }

          // Match against any tourist spots that reference this panorama
          touristSpots.forEach((s) => {
            const matchesId =
              s.primary_pano_id === panoFull ||
              s.primary_pano_id === panoClean ||
              s.connected360?.targetId === panoFull ||
              s.connected360?.targetId === panoClean ||
              (s.name && np.label && s.name.trim().toLowerCase() === np.label.trim().toLowerCase());

            if (matchesId) {
              keys.add(s.id);
              if (s.connected360?.targetId) keys.add(s.connected360.targetId);
              if (s.primary_pano_id) keys.add(s.primary_pano_id);
            }
          });

          for (const k of keys) {
            await this.put360Media(db, k, record);
          }
          cachedMediaCount++;
        }
      }

      // 2. Also ensure all spots with embedded images/panos in touristSpots array are saved
      for (const s of touristSpots) {
        const spotImg = s.imageUrl || s.image;
        if (spotImg && typeof spotImg === 'string' && spotImg.startsWith('data:')) {
          await this.put360Media(db, s.id, { dataUri: spotImg, spotId: s.id });
          await this.put360Media(db, `${s.id}_cover`, { dataUri: spotImg, spotId: s.id });
          if (s.primary_pano_id) {
            await this.put360Media(db, s.primary_pano_id, { dataUri: spotImg, spotId: s.id });
          }
          if (s.connected360?.targetId) {
            await this.put360Media(db, s.connected360.targetId, { dataUri: spotImg, spotId: s.id });
          }
        }
      }

      // 2. Also cache any remaining tourist spot images / thumbnails
      const spotMediaCandidates = [];
      touristSpots.forEach((s) => {
        const urls = [];
        if (s.image && !s.image.includes('mapillary') && !s.image.includes('google')) urls.push(s.image);
        if (Array.isArray(s.images)) {
          s.images.forEach((img) => {
            if (img && typeof img === 'string' && !img.includes('mapillary')) urls.push(img);
          });
        }
        urls.forEach((url) => spotMediaCandidates.push({ spotId: s.id, url }));
      });

      const uniqueSpotMedia = spotMediaCandidates.filter(
        (item, idx, arr) => arr.findIndex((x) => x.url === item.url) === idx
      );

      for (let i = 0; i < uniqueSpotMedia.length; i++) {
        const item = uniqueSpotMedia[i];
        try {
          if (item.url.startsWith('data:')) {
            await this.put360Media(db, item.url, { dataUri: item.url, spotId: item.spotId });
            await this.put360Media(db, `${item.spotId}_cover`, { dataUri: item.url, spotId: item.spotId });
          } else {
            const res = await fetch(item.url, { mode: 'cors' });
            if (res.ok) {
              const blob = await res.blob();
              totalBytes += blob.size;
              const dataUri = await this.blobToDataUri(blob);
              await this.put360Media(db, item.url, { blob, dataUri, spotId: item.spotId });
              await this.put360Media(db, `${item.spotId}_cover`, { blob, dataUri, spotId: item.spotId });
            }
          }
        } catch (_) {}
      }

      // Stage 5: Cache Map Tiles (Zooms 12 - maxZoom across Lagangilang BBox) (100%)
      // Uses 100% free, CORS-friendly Esri World Street Map (zero API key, no watermarks, no 403 blocks)
      const tileList = getBboxTileList(LAGANGILANG_BBOX, 12, maxZoom);
      const totalTiles = tileList.length;

      onProgress({
        stage: 'tiles',
        percent: 58,
        mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
        message: `Downloading ${totalTiles} Clean Esri World Street Map Tiles (Zoom 12-${maxZoom})...`,
      });

      const batchSize = 12;
      let completedTiles = 0;

      for (let i = 0; i < tileList.length; i += batchSize) {
        const batch = tileList.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (t) => {
            const tileKey = `${t.z}/${t.x}/${t.y}`;
            // Esri World Street Map endpoint (order: z/y/x)
            const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${t.z}/${t.y}/${t.x}`;

            try {
              const res = await fetch(tileUrl, { mode: 'cors' });
              if (res.ok && res.status === 200) {
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

        const tilePercent = 58 + Math.round((completedTiles / totalTiles) * 40);
        onProgress({
          stage: 'tiles',
          percent: tilePercent,
          mbDownloaded: (totalBytes / (1024 * 1024)).toFixed(1),
          message: `Caching Esri World Street Tiles: ${completedTiles} of ${totalTiles} complete...`,
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
        maxZoom,
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

  /**
   * Save a single 360 panorama texture to local offline IndexedDB
   */
  async save360Media(key, dataUriOrBlob, spotId = null) {
    if (!key || !dataUriOrBlob) return false;
    try {
      const db = await openOfflineDB();
      let dataUri = typeof dataUriOrBlob === 'string' ? dataUriOrBlob : null;
      let blob = dataUriOrBlob instanceof Blob ? dataUriOrBlob : null;

      if (blob && !dataUri) {
        dataUri = await this.blobToDataUri(blob);
      }

      const record = {
        dataUri,
        blob,
        spotId: spotId || null,
        updatedAt: new Date().toISOString(),
      };

      const strKey = String(key).trim();
      const cleanKey = strKey.replace(/^pano_/, '').replace(/\.jpg$/, '');
      const keysToSave = new Set([
        strKey,
        cleanKey,
        strKey.startsWith('pano_') ? strKey : `pano_${cleanKey}`,
        `${cleanKey}.jpg`,
        `pano_${cleanKey}.jpg`,
        `/panoramas/${cleanKey}.jpg`,
        `/panoramas/pano_${cleanKey}.jpg`,
      ]);

      if (spotId) {
        keysToSave.add(String(spotId));
      }

      for (const k of keysToSave) {
        await this.put360Media(db, k, record);
      }
      return true;
    } catch (e) {
      console.warn('Could not save 360 media to offline storage:', e);
      return false;
    }
  }

  /**
   * Retrieve cached 360 panorama by any alias or identifier
   */
  async get360Media(idOrUrl) {
    if (!idOrUrl) return null;
    try {
      const db = await openOfflineDB();
      const tx = db.transaction(STORE_360_MEDIA, 'readonly');
      const store = tx.objectStore(STORE_360_MEDIA);

      const strId = String(idOrUrl).trim();
      const cleanId = strId.replace(/^pano_/, '').replace(/\.jpg$/, '');
      const candidates = [
        strId,
        cleanId,
        `pano_${cleanId}`,
        `${cleanId}.jpg`,
        `pano_${cleanId}.jpg`,
        `/panoramas/${cleanId}.jpg`,
        `/panoramas/pano_${cleanId}.jpg`,
      ];

      for (const cand of candidates) {
        const val = await new Promise((resolve) => {
          const req = store.get(cand);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });

        if (val) {
          if (val.dataUri) return val.dataUri;
          if (val.blob) return URL.createObjectURL(val.blob);
          if (typeof val === 'string') return val;
        }
      }
      return null;
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
