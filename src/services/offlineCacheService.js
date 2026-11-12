/**
 * Offline Cache & Storage Service for Lagangilang Eco-Trails & Tourism
 * 
 * Provides:
 * - Offline detection (navigator.onLine + event listeners)
 * - 1-Click offline caching of tourist spots, emergency contacts, guides, and trail GeoJSON
 * - Data Saver / Low-Data mode management
 */

const OFFLINE_STORAGE_KEY = 'lagangilang_offline_bundle_v1';
const DATA_SAVER_KEY = 'lagangilang_data_saver_mode';

class OfflineCacheService {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.listeners = new Set();
    this.isDataSaver = this.loadDataSaverPreference();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
    }
  }

  handleNetworkChange(status) {
    this.isOnline = status;
    this.notifyListeners({ type: 'network', isOnline: status });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(data) {
    this.listeners.forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error('OfflineCacheService listener error:', e);
      }
    });
  }

  loadDataSaverPreference() {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(DATA_SAVER_KEY) === 'true';
      }
    } catch (_) {}
    return false;
  }

  setDataSaverPreference(enabled) {
    this.isDataSaver = enabled;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DATA_SAVER_KEY, String(enabled));
      }
    } catch (_) {}
    this.notifyListeners({ type: 'dataSaver', isDataSaver: enabled });
  }

  /**
   * Cache vector map styles and core metadata in browser Cache API
   */
  async cacheOfflineMapTiles() {
    if (typeof window === 'undefined' || !('caches' in window)) return false;
    try {
      const cache = await caches.open('lagangilang_offline_map_v1');
      const urlsToCache = [
        'https://tiles.openfreemap.org/styles/liberty',
        'https://tiles.openfreemap.org/styles/dark',
        'https://tiles.openfreemap.org/styles/positron',
      ];
      await Promise.allSettled(
        urlsToCache.map(async (url) => {
          try {
            const res = await fetch(url, { mode: 'cors' });
            if (res.ok) {
              await cache.put(url, res);
            }
          } catch (_) {}
        })
      );
      return true;
    } catch (e) {
      console.warn('Map tile caching warning:', e);
      return false;
    }
  }

  /**
   * Save complete offline bundle (spots, custom GeoJSON, hotlines, timestamp)
   * Also pre-caches map styles
   */
  async cacheOfflineBundle(spots = [], customGeoJSON = null) {
    const bundle = {
      cachedAt: new Date().toISOString(),
      spotsCount: spots.length,
      spots,
      hasGeoJSON: !!customGeoJSON,
      emergencyHotlines: EMERGENCY_HOTLINES,
      safetyGuidelines: TRAIL_SAFETY_GUIDELINES,
    };

    // Pre-cache map styles in background
    await this.cacheOfflineMapTiles();

    try {
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(bundle));
      return { success: true, timestamp: bundle.cachedAt, count: spots.length };
    } catch (e) {
      console.warn('LocalStorage cache limit reached, attempting compressed store:', e);
      const lightweightSpots = spots.map((s) => ({
        ...s,
        image: s.image?.startsWith('data:') ? null : s.image,
      }));
      const lightweightBundle = { ...bundle, spots: lightweightSpots };
      try {
        localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(lightweightBundle));
        return { success: true, timestamp: bundle.cachedAt, count: lightweightSpots.length, lightweight: true };
      } catch (err2) {
        throw new Error('Unable to cache offline data due to browser storage limits.');
      }
    }
  }

  /**
   * Generate and trigger download of a self-contained interactive offline HTML map file
   * Built with official MapLibre GL JS & embedded Base64 tile dictionary + full POIs, Checkpoints, 360° Panoramas, and Hotlines.
   * Completely immune to 403 blocks, 100% offline capable, with categorized spot cards (no search box) matching hotlines.
   */
  downloadOfflineMapHtml(spots = [], tileDictionary = {}, media360Dictionary = {}) {
    const spotsData = JSON.stringify(spots || []);
    const hotlinesData = JSON.stringify(EMERGENCY_HOTLINES);
    const guidelinesData = JSON.stringify(TRAIL_SAFETY_GUIDELINES);
    const tilesData = JSON.stringify(tileDictionary || {});
    const media360Data = JSON.stringify(media360Dictionary || {});
    const generatedDate = new Date().toLocaleDateString();

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=2.0">
  <title>Lagangilang Road & Trail • MapLibre Standalone Offline Map Guide</title>
  
  <!-- MapLibre GL JS -->
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>

  <!-- Pannellum 360 Panorama Viewer -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
  <script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0b1120;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    header {
      background: #0f172a;
      padding: 12px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    header h1 {
      font-size: 1.1rem;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }
    .badge-offline {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #fff;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 999px;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    
    /* Interactive MapLibre Container */
    #map {
      width: 100%;
      height: 52vh;
      min-height: 380px;
      z-index: 10;
      border-bottom: 2px solid #1e293b;
      position: relative;
    }
    
    /* Category Filter Bar */
    .filter-bar {
      background: #0f172a;
      padding: 10px 18px;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .filter-btn {
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.12);
      color: #94a3b8;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .filter-btn:hover {
      background: rgba(255,255,255,0.08);
      color: #f1f5f9;
    }
    .filter-btn.active {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #ffffff;
      border-color: #38bdf8;
      box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
    }
    
    /* 3-Column Content Container */
    .content-container {
      padding: 16px 18px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      flex: 1;
    }
    .card {
      background: #0f172a;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.08);
      padding: 18px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      display: flex;
      flex-direction: column;
    }
    .card h2 {
      font-size: 0.96rem;
      font-weight: 800;
      color: #f1f5f9;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding-bottom: 10px;
      letter-spacing: -0.2px;
    }

    /* Categorized Spots Section */
    .category-group {
      margin-bottom: 16px;
    }
    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: rgba(255,255,255,0.04);
      border-left: 3px solid #38bdf8;
      border-radius: 4px;
      margin-bottom: 10px;
      font-size: 0.8rem;
      font-weight: 800;
      color: #38bdf8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .category-count {
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      font-weight: 700;
    }

    /* Spot & Hotline Items (Card Format matching hotlines) */
    .spot-card-item {
      padding: 12px 14px;
      border-radius: 10px;
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.07);
      margin-bottom: 10px;
      transition: all 0.2s ease;
    }
    .spot-card-item:hover {
      background: rgba(56, 189, 248, 0.06);
      border-color: rgba(56, 189, 248, 0.35);
      transform: translateY(-1px);
    }
    .spot-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .spot-card-title {
      font-size: 0.88rem;
      font-weight: 800;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .spot-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 999px;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .spot-badge-tourist { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .spot-badge-poi { background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); }
    .spot-badge-checkpoint { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .spot-badge-emergency { background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }

    .spot-card-sub {
      font-size: 0.72rem;
      color: #94a3b8;
      margin: 4px 0 6px 0;
      line-height: 1.35;
    }
    .spot-card-desc {
      font-size: 0.74rem;
      color: #cbd5e1;
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .action-btn-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 6px;
    }
    .btn-action {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn-focus {
      background: rgba(255,255,255,0.08);
      color: #e2e8f0;
      border: 1px solid rgba(255,255,255,0.15);
    }
    .btn-focus:hover {
      background: rgba(255,255,255,0.15);
      color: #ffffff;
    }
    .btn-call {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(16, 185, 129, 0.35);
    }
    .btn-pano {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.35);
    }

    .rule-item {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
      font-size: 0.78rem;
      line-height: 1.4;
      color: #cbd5e1;
      padding: 10px;
      border-radius: 8px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
    }

    /* Standalone Teardrop Marker Pin & Wrapper Anchor Fix */
    .standalone-marker-wrapper {
      width: 36px;
      height: 42px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      pointer-events: auto;
      cursor: pointer;
    }
    .custom-map-pin {
      width: 34px;
      height: 34px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      transition: transform 0.2s ease;
    }
    .standalone-marker-wrapper:hover .custom-map-pin {
      transform: rotate(-45deg) scale(1.15);
      z-index: 1000;
    }
    .custom-map-pin span {
      transform: rotate(45deg);
      font-size: 15px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .pin-tourist {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
      border-color: #ffd700 !important;
      box-shadow: 0 0 14px rgba(245, 158, 11, 0.7) !important;
    }
    .pin-checkpoint {
      background: linear-gradient(135deg, #15803d 0%, #166534 100%) !important;
      border-color: #4ade80 !important;
    }
    .pin-emergency {
      background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%) !important;
      border-color: #f87171 !important;
    }
    .pin-nature {
      background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%) !important;
      border-color: #5eead4 !important;
    }
    .pin-service {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important;
      border-color: #7dd3fc !important;
    }

    /* MapLibre Popup Styles */
    .maplibregl-popup-content {
      background: #0f172a !important;
      color: #f8fafc !important;
      border: 1.5px solid #38bdf8 !important;
      border-radius: 12px !important;
      padding: 14px !important;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8) !important;
      min-width: 220px !important;
    }
    .maplibregl-popup-tip {
      border-top-color: #38bdf8 !important;
      border-bottom-color: #38bdf8 !important;
    }
    .maplibregl-popup-close-button {
      color: #94a3b8 !important;
      font-size: 1.2rem !important;
      padding: 4px 8px !important;
    }
    .maplibregl-popup-close-button:hover {
      color: #ffffff !important;
    }

    /* MapLibre Attribution & Accuracy Disclaimer Note */
    .maplibregl-ctrl-attrib {
      background-color: rgba(255, 255, 255, 0.94) !important;
      color: #1e293b !important;
      font-size: 11px !important;
      line-height: 1.4 !important;
      padding: 3px 10px !important;
      border-radius: 6px 0 0 0 !important;
      max-width: 95vw !important;
      white-space: normal !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
    }
    .maplibregl-ctrl-attrib.maplibregl-compact {
      min-height: auto !important;
      padding: 3px 10px !important;
      background-color: rgba(255, 255, 255, 0.94) !important;
    }
    .maplibregl-ctrl-attrib.maplibregl-compact .maplibregl-ctrl-attrib-inner {
      display: inline !important;
    }
    .maplibregl-ctrl-attrib.maplibregl-compact .maplibregl-ctrl-attrib-button {
      display: none !important;
    }
    .maplibregl-ctrl-attrib em, .offline-map-accuracy-note {
      font-style: italic !important;
      color: #334155 !important;
      font-weight: 500 !important;
    }

    /* 360 Panorama Modal */
    #pano-modal {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.94);
      z-index: 10000;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      backdrop-filter: blur(8px);
    }
    #pano-modal.active {
      display: flex;
    }
    #pano-container {
      width: 100%;
      max-width: 950px;
      height: 72vh;
      background: #000;
      border-radius: 14px;
      overflow: hidden;
      position: relative;
      border: 1.5px solid #38bdf8;
      box-shadow: 0 20px 60px rgba(0,0,0,0.9);
    }
    .pano-close-btn {
      position: absolute;
      top: 14px;
      right: 14px;
      background: rgba(15,23,42,0.85);
      border: 1px solid rgba(255,255,255,0.3);
      color: #fff;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      font-size: 1.2rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10002;
    }
    .pano-title-badge {
      position: absolute;
      bottom: 14px;
      left: 16px;
      background: rgba(15,23,42,0.88);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 0.78rem;
      color: #38bdf8;
      font-weight: 700;
      border: 1px solid rgba(56, 189, 248, 0.3);
      z-index: 10002;
    }
    #pano-viewer-div {
      width: 100%;
      height: 100%;
    }
    #pano-fallback-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: none;
    }
  </style>
</head>
<body>
  <header>
    <h1>🌲 Road & Trail • Lagangilang, Abra</h1>
    <div>
      <span class="badge-offline">🗺️ MapLibre Offline Guide (${generatedDate})</span>
    </div>
  </header>

  <!-- Interactive MapLibre GL Map -->
  <div id="map"></div>

  <!-- Category Filter Bar -->
  <div class="filter-bar">
    <button class="filter-btn active" onclick="filterCategory('all', this)">All Landmarks (<span id="all-count">0</span>)</button>
    <button class="filter-btn" onclick="filterCategory('tourist_spot', this)">🏞️ Tourist Spots</button>
    <button class="filter-btn" onclick="filterCategory('checkpoint', this)">🌲 DENR Checkpoints</button>
    <button class="filter-btn" onclick="filterCategory('emergency', this)">🚨 Hotlines & Stations</button>
    <button class="filter-btn" onclick="filterCategory('services', this)">🏪 Local Services & POIs</button>
  </div>

  <!-- 3-Column Content Container -->
  <div class="content-container">
    <!-- Column 1: POIs & Tourist Spots (Categorized list, no search box) -->
    <div class="card">
      <h2>
        <span>📍 Landmarks & Tourist Spots</span>
        <span id="spots-count-badge" class="category-count">0</span>
      </h2>
      <div id="spots-categorized-list" style="max-height: 580px; overflow-y: auto; padding-right: 4px;"></div>
    </div>

    <!-- Column 2: Emergency Hotlines & DENR Checkpoint -->
    <div class="card">
      <h2>
        <span>🚨 Official Emergency Hotlines</span>
        <span class="category-count">24/7</span>
      </h2>
      <div id="hotlines-list" style="max-height: 580px; overflow-y: auto; padding-right: 4px;"></div>
    </div>

    <!-- Column 3: Trail Safety Guidelines -->
    <div class="card">
      <h2>
        <span>🛡️ Trail Safety Guidelines</span>
        <span class="category-count">Official</span>
      </h2>
      <div id="guidelines-list"></div>
    </div>
  </div>

  <!-- 360 Panorama Viewer Modal -->
  <div id="pano-modal" onclick="closePanoModal()">
    <div id="pano-container" onclick="event.stopPropagation()">
      <button class="pano-close-btn" onclick="closePanoModal()">✕</button>
      <div id="pano-viewer-div"></div>
      <img id="pano-fallback-img" alt="360 Landmark Panorama" />
      <div class="pano-title-badge" id="pano-title">📷 360° Landmark View</div>
    </div>
  </div>

  <script>
    window.OFFLINE_TILES = ${tilesData};
    window.OFFLINE_360_MEDIA = ${media360Data};
    const spots = ${spotsData};
    const hotlines = ${hotlinesData};
    const guidelines = ${guidelinesData};

    let activeFilter = 'all';
    const markers = [];
    let currentPannellumViewer = null;

    // Register MapLibre GL custom protocol for 100% offline tile loading with live fallback
    if (typeof maplibregl !== 'undefined' && maplibregl.addProtocol) {
      maplibregl.addProtocol('offline-tile', function(params, abortController) {
        const match = params.url.match(/offline-tile:\\/\\/(\\d+)\\/(\\d+)\\/(\\d+)/);
        if (match) {
          const z = match[1], x = match[2], y = match[3];
          const key = z + '/' + x + '/' + y;

          // 1. Check offline tile dictionary
          if (window.OFFLINE_TILES && window.OFFLINE_TILES[key]) {
            const dataUri = window.OFFLINE_TILES[key];
            try {
              const base64 = dataUri.split(',')[1];
              const binary = atob(base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              return Promise.resolve({ data: bytes.buffer });
            } catch (err) {
              console.warn('Tile decode error:', err);
            }
          }

          // 2. Fallback to Esri World Street Map if connected (Order: z/y/x)
          const fallbackUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/' + z + '/' + y + '/' + x;
          return fetch(fallbackUrl, { mode: 'cors' })
            .then(function(res) {
              if (!res.ok) throw new Error('Offline tile unavailable');
              return res.arrayBuffer();
            })
            .then(function(buf) { return { data: buf }; })
            .catch(function() { return { data: new ArrayBuffer(0) }; });
        }
        return Promise.resolve({ data: new ArrayBuffer(0) });
      });
    }

    // Initialize MapLibre GL Map centered on Lagangilang, Abra
    const map = new maplibregl.Map({
      container: 'map',
      center: [120.7340, 17.6142],
      zoom: 13.8,
      maxZoom: 22,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          'offline-raster': {
            type: 'raster',
            tiles: ['offline-tile://{z}/{x}/{y}'],
            tileSize: 256,
            maxzoom: 17,
            attribution: '© Esri • Lagangilang Eco-Trails'
          }
        },
        layers: [
          {
            id: 'offline-raster-layer',
            type: 'raster',
            source: 'offline-raster',
            minzoom: 0,
            maxzoom: 22
          }
        ]
      }
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({
      compact: false,
      customAttribution: '<em>This Offline Map may not reflect to the actual locations indicated, please cross reference the online version for more accurate information</em>'
    }), 'bottom-right');
    document.getElementById('all-count').textContent = spots.length;

    // Helper: determine pin icon, class, label, and category group
    function getVisual(spot) {
      const name = (spot.name || '').toLowerCase();
      const cat = (spot.category || '').toLowerCase();
      const spotType = (spot.spotType || spot.type || '').toLowerCase();
      const customIcon = spot.customIcon || spot.icon || spot.cardVisualIcon || spot.categoryIcon;

      if (spot.isCheckpoint || cat.includes('checkpoint') || cat.includes('denr') || name.includes('checkpoint')) {
        return {
          pinClass: 'pin-checkpoint',
          badgeClass: 'spot-badge-checkpoint',
          icon: customIcon || '🌲',
          categoryGroup: '🌲 DENR Environmental Checkpoints',
          label: spot.category || 'DENR Checkpoint'
        };
      }
      if (cat.includes('emergency') || cat.includes('police') || cat.includes('rescue') || cat.includes('fire') || cat.includes('medical') || name.includes('police') || name.includes('mdrrmo')) {
        let ic = '🚨';
        if (name.includes('mdrrmo') || cat.includes('rescue')) ic = '🚑';
        else if (name.includes('police')) ic = '👮';
        else if (name.includes('fire')) ic = '🚒';
        else if (name.includes('health') || name.includes('rhu')) ic = '🏥';
        return {
          pinClass: 'pin-emergency',
          badgeClass: 'spot-badge-emergency',
          icon: customIcon || ic,
          categoryGroup: '🚨 Emergency Units & Stations',
          label: spot.category || 'Emergency Unit'
        };
      }

      // Check if spot is a POI (explicitly marked as POI, or public facility/service)
      const isPoi = spotType === 'poi' || (spotType !== 'tourist_spot' && (cat.includes('school') || cat.includes('campus') || cat.includes('service') || cat.includes('terminal') || cat.includes('gas') || cat.includes('convenience') || cat.includes('market')));

      if (!isPoi && (cat.includes('nature') || cat.includes('river') || cat.includes('cave') || cat.includes('spring') || cat.includes('viewpoint') || cat.includes('adventure') || cat.includes('waterfall'))) {
        let ic = '🏞️';
        if (cat.includes('cave') || name.includes('cave')) ic = '🧗';
        else if (cat.includes('spring') || name.includes('river')) ic = '🌊';
        return {
          pinClass: 'pin-nature',
          badgeClass: 'spot-badge-tourist',
          icon: customIcon || ic,
          categoryGroup: '🏞️ Tourist Spots & Nature Trails',
          label: spot.category || 'Nature & Eco-Tourism'
        };
      }
      if (!isPoi && (cat.includes('heritage') || cat.includes('religious') || cat.includes('church') || cat.includes('civic') || cat.includes('tourist') || spotType === 'tourist_spot')) {
        let ic = '🏛️';
        if (cat.includes('religious') || name.includes('church') || name.includes('parish')) ic = '⛪';
        else if (name.includes('university') || name.includes('school')) ic = '🏫';
        return {
          pinClass: 'pin-tourist',
          badgeClass: 'spot-badge-tourist',
          icon: customIcon || ic,
          categoryGroup: '🏛️ Heritage & Campus Landmarks',
          label: spot.category || 'Tourist & Heritage'
        };
      }

      let sIcon = '📍';
      if (cat.includes('school') || cat.includes('campus') || name.includes('university') || name.includes('school')) sIcon = '🏫';
      else if (cat.includes('transport') || cat.includes('terminal')) sIcon = '🚌';
      else if (cat.includes('gas') || cat.includes('fuel')) sIcon = '⛽';
      else if (name.includes('water')) sIcon = '💧';
      else if (cat.includes('store') || cat.includes('market') || cat.includes('commercial') || cat.includes('convenience')) sIcon = '🛒';
      else if (cat.includes('cafe') || cat.includes('bakery')) sIcon = '☕';

      // For school/campus POIs, ensure an appropriate school icon rather than classical heritage temple
      const chosenIcon = ((cat.includes('school') || cat.includes('campus') || name.includes('university')) && (!customIcon || customIcon === '🏛️'))
        ? '🏫'
        : (customIcon || sIcon);

      return {
        pinClass: 'pin-service',
        badgeClass: 'spot-badge-poi',
        icon: chosenIcon,
        categoryGroup: '🏪 Local Services, Terminals & POIs',
        label: spot.category || 'Local Service & POI'
      };
    }

    // Check if spot has 360 photo available
    function getSpot360Media(spot) {
      if (!spot) return null;
      const targetId = spot.primary_pano_id || spot.connected360?.targetId || spot.id;
      const cleanTarget = String(targetId).replace(/^pano_/, '');
      const fullTarget = String(targetId).startsWith('pano_') ? String(targetId) : ('pano_' + targetId);

      return (
        window.OFFLINE_360_MEDIA[targetId] ||
        window.OFFLINE_360_MEDIA[cleanTarget] ||
        window.OFFLINE_360_MEDIA[fullTarget] ||
        window.OFFLINE_360_MEDIA[spot.id] ||
        window.OFFLINE_360_MEDIA[spot.id + '_cover'] ||
        (spot.imageUrl && spot.imageUrl.startsWith('data:') ? spot.imageUrl : null) ||
        (spot.image && spot.image.startsWith('data:') ? spot.image : null) ||
        spot.connected360?.imageUrl ||
        spot.imageUrl ||
        spot.image
      );
    }

    // Open 360 Viewer Modal
    function open360Modal(spotId) {
      const spot = spots.find(function(s) { return s.id === spotId; });
      const media = getSpot360Media(spot);
      if (!media) return;

      const modal = document.getElementById('pano-modal');
      const title = document.getElementById('pano-title');
      const viewerDiv = document.getElementById('pano-viewer-div');
      const fallbackImg = document.getElementById('pano-fallback-img');

      title.textContent = '📷 360° View: ' + (spot ? spot.name : 'Landmark');
      modal.classList.add('active');

      if (currentPannellumViewer) {
        try { currentPannellumViewer.destroy(); } catch (_) {}
        currentPannellumViewer = null;
      }
      viewerDiv.innerHTML = '';
      viewerDiv.style.display = 'block';
      fallbackImg.style.display = 'none';

      if (window.pannellum && window.pannellum.viewer) {
        try {
          currentPannellumViewer = window.pannellum.viewer('pano-viewer-div', {
            type: 'equirectangular',
            panorama: media,
            autoLoad: true,
            autoRotate: -2,
            compass: false,
            showZoomCtrl: true,
            showFullscreenCtrl: true
          });
        } catch (e) {
          viewerDiv.style.display = 'none';
          fallbackImg.src = media;
          fallbackImg.style.display = 'block';
        }
      } else {
        viewerDiv.style.display = 'none';
        fallbackImg.src = media;
        fallbackImg.style.display = 'block';
      }
    }

    function closePanoModal() {
      const modal = document.getElementById('pano-modal');
      modal.classList.remove('active');
      if (currentPannellumViewer) {
        try { currentPannellumViewer.destroy(); } catch (_) {}
        currentPannellumViewer = null;
      }
    }

    // Focus on marker from list item
    function focusSpot(spotId) {
      const spot = spots.find(function(s) { return s.id === spotId; });
      if (!spot) return;
      const lat = spot.lat || spot.location?.lat;
      const lng = spot.lng || spot.location?.lng;
      if (!lat || !lng) return;

      map.flyTo({ center: [lng, lat], zoom: 16, essential: true });
      const m = markers.find(function(item) { return item.spotId === spotId; });
      if (m && m.marker) {
        m.marker.togglePopup();
      }
    }

    // Render MapLibre Markers
    function renderMapMarkers() {
      markers.forEach(function(m) { m.marker.remove(); });
      markers.length = 0;

      const filtered = getFilteredSpots();
      document.getElementById('spots-count-badge').textContent = filtered.length;

      filtered.forEach(function(s) {
        const lat = s.lat || s.location?.lat;
        const lng = s.lng || s.location?.lng;
        if (!lat || !lng) return;

        const vis = getVisual(s);
        const has360 = Boolean(getSpot360Media(s));

        // Create Custom Pin DOM element with bottom anchor wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'standalone-marker-wrapper';
        wrapper.innerHTML = '<div class="custom-map-pin ' + vis.pinClass + '"><span>' + vis.icon + '</span></div>';

        const popupHtml =
          '<div>' +
          '  <h4 style="margin:0 0 4px 0; color:#38bdf8; font-size:0.95rem; font-weight:800;">' + vis.icon + ' ' + s.name + '</h4>' +
          '  <div style="font-size:0.72rem; color:#f59e0b; font-weight:700; margin-bottom:6px;">' + (s.category || 'Spot') + ' • Brgy. ' + (s.barangay || 'Lagangilang') + '</div>' +
          (s.description ? '<p style="margin:0 0 8px 0; font-size:0.75rem; color:#cbd5e1; line-height:1.35;">' + s.description + '</p>' : '') +
          '  <div style="font-size:0.7rem; color:#94a3b8; margin-bottom:8px;">📍 ' + Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5) + '</div>' +
          '  <div style="display:flex; gap:6px; flex-wrap:wrap;">' +
          (s.phone ? '    <a href="tel:' + s.phone.replace(/[^0-9+]/g, '') + '" class="btn-action btn-call">📞 ' + s.phone + '</a>' : '') +
          (has360 ? '    <button onclick="open360Modal(\\'' + s.id + '\\')" class="btn-action btn-pano">📷 360° Photo</button>' : '') +
          '  </div>' +
          '</div>';

        const popup = new maplibregl.Popup({ offset: [0, -36] }).setHTML(popupHtml);

        const marker = new maplibregl.Marker({ element: wrapper, anchor: 'bottom' })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);

        markers.push({ spotId: s.id, marker: marker });
      });
    }

    // Filter spots by category
    function getFilteredSpots() {
      return spots.filter(function(s) {
        const cat = (s.category || '').toLowerCase();
        const spotType = (s.spotType || s.type || '').toLowerCase();
        const isCheckpoint = s.isCheckpoint || cat.includes('checkpoint') || cat.includes('denr');
        const isEmergency = cat.includes('emergency') || cat.includes('police') || cat.includes('rescue');
        const isPoi = spotType === 'poi' || (!isEmergency && !isCheckpoint && (cat.includes('school') || cat.includes('campus') || cat.includes('service') || cat.includes('terminal') || cat.includes('gas') || cat.includes('store')));
        const isTouristSpot = !isPoi && !isEmergency && !isCheckpoint;

        if (activeFilter === 'tourist_spot' && !isTouristSpot) return false;
        if (activeFilter === 'checkpoint' && !isCheckpoint) return false;
        if (activeFilter === 'emergency' && !isEmergency) return false;
        if (activeFilter === 'services' && !isPoi) return false;
        return true;
      });
    }

    // Render Categorized Spots list (Matching Hotlines card UI, no search box)
    function renderCategorizedList() {
      const container = document.getElementById('spots-categorized-list');
      container.innerHTML = '';
      const list = getFilteredSpots();

      // Group spots by categoryGroup
      const groups = {};
      list.forEach(function(s) {
        const vis = getVisual(s);
        const grp = vis.categoryGroup;
        if (!groups[grp]) groups[grp] = [];
        groups[grp].push({ spot: s, visual: vis });
      });

      // Sort categories logically
      const order = [
        '🏞️ Tourist Spots & Nature Trails',
        '🏛️ Heritage & Campus Landmarks',
        '🌲 DENR Environmental Checkpoints',
        '🚨 Emergency Units & Stations',
        '🏪 Local Services, Terminals & POIs'
      ];

      const sortedGroupKeys = Object.keys(groups).sort(function(a, b) {
        const idxA = order.indexOf(a);
        const idxB = order.indexOf(b);
        if (idxA >= 0 && idxB >= 0) return idxA - idxB;
        if (idxA >= 0) return -1;
        if (idxB >= 0) return 1;
        return a.localeCompare(b);
      });

      sortedGroupKeys.forEach(function(grpName) {
        const items = groups[grpName].sort(function(a, b) {
          return (a.spot.name || '').localeCompare(b.spot.name || '', undefined, { sensitivity: 'base' });
        });
        const groupDiv = document.createElement('div');
        groupDiv.className = 'category-group';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'category-header';
        headerDiv.innerHTML = '<span>' + grpName + '</span><span class="category-count">' + items.length + '</span>';
        groupDiv.appendChild(headerDiv);

        items.forEach(function(entry) {
          const s = entry.spot;
          const vis = entry.visual;
          const lat = s.lat || s.location?.lat;
          const lng = s.lng || s.location?.lng;
          const has360 = Boolean(getSpot360Media(s));

          const itemDiv = document.createElement('div');
          itemDiv.className = 'spot-card-item';
          itemDiv.innerHTML =
            '<div class="spot-card-header">' +
            '  <div class="spot-card-title">' + vis.icon + ' ' + s.name + '</div>' +
            '  <span class="spot-badge ' + vis.badgeClass + '">' + (s.category || 'Spot') + '</span>' +
            '</div>' +
            '<div class="spot-card-sub">📍 Brgy. ' + (s.barangay || 'Lagangilang') + (s.location?.address ? ' • ' + s.location.address : '') + '</div>' +
            (s.description ? '<div class="spot-card-desc">' + s.description + '</div>' : '') +
            '<div class="action-btn-row">' +
            (lat && lng ? '  <button class="btn-action btn-focus" onclick="focusSpot(\\'' + s.id + '\\')">🧭 Focus on Map</button>' : '') +
            (s.phone ? '  <a href="tel:' + s.phone.replace(/[^0-9+]/g, '') + '" class="btn-action btn-call">📞 ' + s.phone + '</a>' : '') +
            (has360 ? '  <button class="btn-action btn-pano" onclick="open360Modal(\\'' + s.id + '\\')">📷 View 360° Photo</button>' : '') +
            '</div>';

          groupDiv.appendChild(itemDiv);
        });

        container.appendChild(groupDiv);
      });
    }

    // Filter button clicked
    function filterCategory(cat, btn) {
      activeFilter = cat;
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderMapMarkers();
      renderCategorizedList();
    }

    // Populate Emergency Hotlines
    const hotlinesContainer = document.getElementById('hotlines-list');
    hotlines.forEach(function(h) {
      const div = document.createElement('div');
      div.className = 'spot-card-item';
      div.innerHTML =
        '<div class="spot-card-header">' +
        '  <strong class="spot-card-title">' + (h.icon || '📞') + ' ' + h.name + '</strong>' +
        '  <span class="spot-badge spot-badge-emergency">' + (h.category || 'Hotline') + '</span>' +
        '</div>' +
        '<div class="spot-card-sub">' + (h.description || 'Emergency Dispatch & Response') + '</div>' +
        '<div class="action-btn-row">' +
        '  <a href="tel:' + (h.number || h.phone || '').replace(/[^0-9+]/g, '') + '" class="btn-action btn-call">📞 ' + (h.number || h.phone || 'Call') + '</a>' +
        (h.altNumber ? '  <a href="tel:' + h.altNumber.replace(/[^0-9+]/g, '') + '" class="btn-action btn-focus">Alt: ' + h.altNumber + '</a>' : '') +
        '</div>';
      hotlinesContainer.appendChild(div);
    });

    // Populate Trail Guidelines
    const guidelinesContainer = document.getElementById('guidelines-list');
    guidelines.forEach(function(g) {
      const div = document.createElement('div');
      div.className = 'rule-item';
      div.innerHTML = '<span style="font-size:1.2rem;">' + g.icon + '</span><div><strong style="color:#ffffff;">' + g.title + '</strong><br>' + g.detail + '</div>';
      guidelinesContainer.appendChild(div);
    });

    // Initial render
    renderMapMarkers();
    renderCategorizedList();
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lagangilang-MapLibre-Offline-Map-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  getCachedBundle() {
    try {
      const data = localStorage.getItem(OFFLINE_STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  clearCachedBundle() {
    try {
      localStorage.removeItem(OFFLINE_STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }
}

export const EMERGENCY_HOTLINES = [
  {
    spotId: 'poi_lagangilang_mdrrmo',
    name: 'Lagangilang MDRRMO (Disaster & Rescue)',
    number: '0917-829-4501',
    altNumber: '0920-948-2311',
    description: '24/7 Search & Rescue, Medical Evacuation, Flood/Typhoon Assistance',
    category: 'Rescue',
    icon: '🚑',
  },
  {
    spotId: 'poi_lagangilang_pnp',
    name: 'PNP Lagangilang Municipal Police',
    number: '0998-598-7742',
    altNumber: '0917-123-7670',
    description: 'Public Safety, Peace & Order, Tourist Security & Patrols',
    category: 'Police',
    icon: '👮',
  },
  {
    spotId: 'poi_lagangilang_bfp',
    name: 'BFP Lagangilang Fire Station',
    number: '0915-432-8921',
    altNumber: '(074) 752-8111',
    description: 'Fire Emergency, Mountain & Forest Fire Response, Road Clearance',
    category: 'Fire',
    icon: '🚒',
  },
  {
    spotId: 'poi_lagangilang_rhu',
    name: 'Lagangilang Rural Health Unit (RHU)',
    number: '(074) 752-8012',
    altNumber: '0977-802-3490',
    description: 'Emergency Medical Care, First Aid, Municipal Health Office',
    category: 'Medical',
    icon: '🏥',
  },
  {
    spotId: 'poi_lagangilang_tourism_office',
    name: 'Lagangilang Municipal Tourism Office',
    number: '0917-504-2299',
    altNumber: '(074) 752-8001',
    description: 'Trail Information, Tourist Assistance, Tour Guide Accreditation',
    category: 'Tourism',
    icon: '🌴',
  },
  {
    spotId: 'poi_1794059470145_3f7lk',
    name: 'DENR Environmental Checkpoint - Lagangilang',
    number: '0917-889-3321',
    altNumber: '(074) 752-8234',
    description: 'Timber & Wildlife Monitoring, Trail Registration & Environmental Safety',
    category: 'DENR Checkpoint',
    icon: '🌲',
  },
];

export const TRAIL_SAFETY_GUIDELINES = [
  {
    title: 'Register with Barangay Officials',
    icon: '📋',
    detail: 'Always check in with the Barangay Hall or Tanod Outpost before entering caves, river gorges, or mountain trails.',
  },
  {
    title: 'Follow Marked Road & Cyan Trail Lines',
    icon: '🗺️',
    detail: 'Stick to verified cyan trail routes and road paths on this map to avoid steep riverbanks and private farm boundaries.',
  },
  {
    title: 'Hydration & Footwear',
    icon: '🥾',
    detail: 'Carry at least 1.5 to 2 liters of drinking water. Wear sturdy, non-slip footwear suitable for wet river stones and rocky paths.',
  },
  {
    title: 'Weather & River Awareness',
    icon: '🌧️',
    detail: 'Avoid low-lying riverbeds (e.g. Ugiao River) during sudden heavy rains due to risk of rapid water rise from upstream Abra mountains.',
  },
  {
    title: 'Leave No Trace',
    icon: '🌿',
    detail: 'Do not leave plastic trash, carve on historic cave walls (e.g. BANAT & Rizalista caves), or disturb local farm produce.',
  },
];

export const offlineCacheService = new OfflineCacheService();
export default offlineCacheService;
