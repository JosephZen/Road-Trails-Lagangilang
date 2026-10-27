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
   * Built with pure embedded SVG & JavaScript — 100% offline, requires ZERO external tile servers
   * and is completely immune to OpenStreetMap 403 access blocks.
   */
  downloadOfflineMapHtml(spots = []) {
    const spotsData = JSON.stringify(spots || []);
    const hotlinesData = JSON.stringify(EMERGENCY_HOTLINES);
    const guidelinesData = JSON.stringify(TRAIL_SAFETY_GUIDELINES);
    const generatedDate = new Date().toLocaleDateString();

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=2.0">
  <title>Lagangilang Eco-Trails & Emergency Guide (Offline Map)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1329; color: #f8fafc; display: flex; flex-direction: column; min-height: 100vh; }
    header { background: #111e38; padding: 12px 18px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; position: sticky; top: 0; z-index: 100; }
    header h1 { font-size: 1.1rem; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .badge-offline { background: #059669; color: #fff; font-size: 0.72rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
    
    /* Map Container */
    .map-section { position: relative; width: 100%; height: 52vh; min-height: 340px; background: #070c1b; overflow: hidden; border-bottom: 2px solid #1e293b; }
    #svg-map { width: 100%; height: 100%; cursor: grab; user-select: none; }
    #svg-map:active { cursor: grabbing; }
    .map-controls { position: absolute; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 6px; z-index: 20; }
    .map-ctrl-btn { width: 34px; height: 34px; border-radius: 8px; background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
    .map-legend { position: absolute; bottom: 12px; left: 12px; background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 6px 12px; font-size: 0.7rem; color: #cbd5e1; display: flex; gap: 10px; z-index: 20; backdrop-filter: blur(8px); }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-color { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    
    /* Active Spot Card */
    #active-popup { position: absolute; bottom: 12px; right: 12px; max-width: 320px; width: calc(100% - 24px); background: rgba(15, 23, 42, 0.95); border: 1.5px solid #38bdf8; border-radius: 12px; padding: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 30; display: none; backdrop-filter: blur(12px); animation: fadeIn 0.2s ease; }
    
    /* Filter Bar */
    .filter-bar { background: #111e38; padding: 10px 18px; display: flex; gap: 6px; overflow-x: auto; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .filter-btn { padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #94a3b8; font-size: 0.76rem; font-weight: 700; cursor: pointer; white-space: nowrap; }
    .filter-btn.active { background: #0284c7; color: #ffffff; border-color: #38bdf8; }
    
    /* Content Columns */
    .content-container { padding: 16px 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; flex: 1; }
    .card { background: #111e38; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); padding: 16px; }
    .card h2 { font-size: 0.95rem; font-weight: 700; color: #f1f5f9; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; }
    .search-input { width: 100%; padding: 8px 12px; border-radius: 8px; background: #070c1b; border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 0.82rem; margin-bottom: 12px; outline: none; }
    
    .spot-item { padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.03); margin-bottom: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; }
    .spot-item:hover, .spot-item.active { background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.4); }
    .spot-title { font-weight: 700; font-size: 0.86rem; color: #ffffff; display: flex; justify-content: space-between; align-items: center; }
    .spot-meta { font-size: 0.73rem; color: #94a3b8; margin-top: 3px; line-height: 1.3; }
    
    .hotline-item { padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); margin-bottom: 10px; }
    .hotline-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #fff; font-size: 0.78rem; font-weight: 700; text-decoration: none; margin-top: 8px; margin-right: 6px; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4); }
    .rule-item { display: flex; gap: 8px; margin-bottom: 10px; font-size: 0.8rem; line-height: 1.4; color: #cbd5e1; }
    
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    @media print {
      body { background: #fff; color: #000; }
      .map-section { height: 400px; background: #f0f0f0; }
      .card { border: 1px solid #ccc; background: #fff; color: #000; }
      .spot-item { background: #f8f8f8; color: #000; }
      .spot-title, .card h2, header h1 { color: #000; }
      .hotline-btn { background: #333; color: #fff; }
    }
  </style>
</head>
<body>
  <header>
    <h1>🌲 Lagangilang, Abra • Offline Eco-Trails Map</h1>
    <div>
      <span class="badge-offline">100% Offline Standalone Map (${generatedDate})</span>
    </div>
  </header>

  <div class="map-section">
    <div class="map-controls">
      <button class="map-ctrl-btn" onclick="zoomMap(1.25)" title="Zoom In">+</button>
      <button class="map-ctrl-btn" onclick="zoomMap(0.8)" title="Zoom Out">-</button>
      <button class="map-ctrl-btn" onclick="resetMap()" title="Reset View" style="font-size:0.8rem;">⟲</button>
    </div>

    <div class="map-legend">
      <div class="legend-item"><span class="legend-color" style="background:#0284c7;"></span><span>Abra/Ugiao River</span></div>
      <div class="legend-item"><span class="legend-color" style="background:#f59e0b;"></span><span>Highway 204</span></div>
      <div class="legend-item"><span class="legend-color" style="background:#10b981;"></span><span>Tourist Spot</span></div>
      <div class="legend-item"><span class="legend-color" style="background:#ef4444;"></span><span>Emergency Station</span></div>
    </div>

    <!-- SVG Vector Map -->
    <svg id="svg-map" viewBox="0 0 1000 700">
      <defs>
        <radialGradient id="mapBg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#111c38"/>
          <stop offset="100%" stop-color="#070c1b"/>
        </radialGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <rect width="1000" height="700" fill="url(#mapBg)"/>

      <!-- Topographic Grid -->
      <g stroke="rgba(255,255,255,0.04)" stroke-width="1">
        <line x1="100" y1="0" x2="100" y2="700"/>
        <line x1="300" y1="0" x2="300" y2="700"/>
        <line x1="500" y1="0" x2="500" y2="700"/>
        <line x1="700" y1="0" x2="700" y2="700"/>
        <line x1="900" y1="0" x2="900" y2="700"/>
        <line x1="0" y1="150" x2="1000" y2="150"/>
        <line x1="0" y1="350" x2="1000" y2="350"/>
        <line x1="0" y1="550" x2="1000" y2="550"/>
      </g>

      <g id="map-transform-group">
        <!-- Municipality Boundary Outline -->
        <path d="M 120 180 Q 250 80 480 90 T 820 160 Q 940 320 890 520 T 680 640 Q 420 660 220 580 T 110 380 Z" fill="rgba(30, 41, 59, 0.45)" stroke="#334155" stroke-width="2.5" stroke-dasharray="6,4"/>

        <!-- Abra River Corridor (Winding from South to North) -->
        <path d="M 160 680 Q 240 540 220 440 T 260 280 Q 300 180 320 20" fill="none" stroke="#0284c7" stroke-width="14" stroke-linecap="round" opacity="0.6"/>
        <path d="M 160 680 Q 240 540 220 440 T 260 280 Q 300 180 320 20" fill="none" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" opacity="0.9"/>
        <text x="180" y="470" fill="#38bdf8" font-size="11" font-weight="700" letter-spacing="2" transform="rotate(-65 180 470)">ABRA RIVER</text>

        <!-- Ugiao River Tributary (South-East to West) -->
        <path d="M 760 620 Q 560 560 380 520 T 230 460" fill="none" stroke="#0284c7" stroke-width="8" stroke-linecap="round" opacity="0.5"/>
        <path d="M 760 620 Q 560 560 380 520 T 230 460" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
        <text x="490" y="555" fill="#38bdf8" font-size="10" font-weight="600" letter-spacing="1">UGIAO RIVER</text>

        <!-- Major Highway (Abra - Kalinga Road / Route 204) -->
        <path d="M 60 480 Q 220 420 380 360 T 640 280 Q 780 230 940 180" fill="none" stroke="#f59e0b" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
        <path d="M 60 480 Q 220 420 380 360 T 640 280 Q 780 230 940 180" fill="none" stroke="#fef08a" stroke-width="1.5" stroke-dasharray="8,6"/>
        <text x="660" y="260" fill="#fef08a" font-size="10" font-weight="700">ABRA-KALINGA ROAD (HWY 204)</text>

        <!-- Secondary Roads & Poblacion Grid -->
        <g stroke="#64748b" stroke-width="2" opacity="0.6">
          <line x1="380" y1="360" x2="440" y2="440"/>
          <line x1="440" y1="440" x2="520" y2="430"/>
          <line x1="420" y1="340" x2="480" y2="390"/>
          <line x1="340" y1="380" x2="410" y2="460"/>
          <!-- Road to Bacooc & BANAT Caves -->
          <path d="M 440 440 Q 520 490 620 460 T 730 430" fill="none"/>
          <!-- Road to San Isidro & Quirsodan -->
          <path d="M 520 430 Q 640 500 780 510" fill="none"/>
        </g>

        <!-- Barangay Region Labels -->
        <g fill="#94a3b8" font-size="11" font-weight="700" letter-spacing="1" opacity="0.55">
          <text x="390" y="330">POBLACION</text>
          <text x="420" y="520">BRGY. PAWA</text>
          <text x="650" y="530">BRGY. SAN ISIDRO</text>
          <text x="660" y="410">BRGY. BACOOC</text>
          <text x="520" y="240">BRGY. TAGODTOD</text>
          <text x="310" y="230">BRGY. LA PAZ BORDER</text>
        </g>

        <!-- Rendered POI Markers Container -->
        <g id="markers-group"></g>
      </g>
    </svg>

    <!-- Floating Active Spot Card -->
    <div id="active-popup">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
        <h3 id="pop-title" style="font-size:0.95rem; font-weight:800; color:#38bdf8;"></h3>
        <button onclick="closePopup()" style="background:none; border:none; color:#94a3b8; font-size:1.1rem; cursor:pointer;">✕</button>
      </div>
      <div id="pop-cat" style="font-size:0.75rem; color:#f59e0b; font-weight:700; margin-bottom:4px;"></div>
      <p id="pop-desc" style="font-size:0.74rem; color:#cbd5e1; margin-bottom:6px; line-height:1.3;"></p>
      <div id="pop-meta" style="font-size:0.7rem; color:#94a3b8; margin-bottom:6px;"></div>
      <div id="pop-action"></div>
    </div>
  </div>

  <!-- Filter Bar -->
  <div class="filter-bar">
    <button class="filter-btn active" onclick="filterCategory('all', this)">All Landmarks (<span id="all-count">0</span>)</button>
    <button class="filter-btn" onclick="filterCategory('tourist_spot', this)">🏞️ Tourist Spots</button>
    <button class="filter-btn" onclick="filterCategory('emergency', this)">🚨 Emergency Stations</button>
    <button class="filter-btn" onclick="filterCategory('services', this)">🏪 Local Services & POIs</button>
  </div>

  <!-- Content Grid -->
  <div class="content-container">
    <div class="card">
      <h2>📍 Directory (<span id="list-count">0</span>)</h2>
      <input type="text" id="search-box" class="search-input" placeholder="🔍 Search spots, caves, rivers, stations..." oninput="handleSearch()">
      <div id="spots-list" style="max-height: 480px; overflow-y: auto;"></div>
    </div>

    <div class="card">
      <h2>🚨 Emergency Hotlines (Lagangilang LGU)</h2>
      <div id="hotlines-list"></div>
    </div>

    <div class="card">
      <h2>🛡️ Trail Safety Guidelines</h2>
      <div id="guidelines-list"></div>
    </div>
  </div>

  <script>
    const spots = ${spotsData};
    const hotlines = ${hotlinesData};
    const guidelines = ${guidelinesData};

    let activeFilter = 'all';
    let searchQuery = '';
    let currentScale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    // Bounds for Lagangilang coordinates
    const MIN_LAT = 17.575;
    const MAX_LAT = 17.655;
    const MIN_LNG = 120.700;
    const MAX_LNG = 120.800;

    function projectCoords(lat, lng) {
      const x = ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * 800 + 100;
      const y = (1 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * 520 + 90;
      return { x: Math.max(80, Math.min(920, x)), y: Math.max(60, Math.min(640, y)) };
    }

    document.getElementById('all-count').textContent = spots.length;

    // Render Markers on SVG Map
    function renderMapMarkers() {
      const group = document.getElementById('markers-group');
      group.innerHTML = '';

      const filtered = getFilteredSpots();
      document.getElementById('list-count').textContent = filtered.length;

      filtered.forEach((s) => {
        const lat = s.lat || s.location?.lat;
        const lng = s.lng || s.location?.lng;
        if (!lat || !lng) return;

        const { x, y } = projectCoords(lat, lng);
        const isEmergency = s.category === 'Government & Emergency Services' || s.id.startsWith('poi_lagangilang_');
        const color = isEmergency ? '#ef4444' : (s.spotType === 'poi' ? '#0ea5e9' : '#10b981');
        const icon = s.categoryIcon || (isEmergency ? '🚨' : '📍');

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', 'translate(' + x + ',' + y + ')');
        g.setAttribute('cursor', 'pointer');
        g.id = 'marker-' + s.id;

        g.innerHTML =
          '<circle r="16" fill="' + color + '" opacity="0.25"/>' +
          '<circle r="11" fill="' + color + '" stroke="#ffffff" stroke-width="1.8"/>' +
          '<text text-anchor="middle" dy="4" font-size="10">' + icon + '</text>' +
          '<text y="22" text-anchor="middle" fill="#f8fafc" font-size="9" font-weight="700" stroke="#070c1b" stroke-width="2" paint-order="stroke fill">' + s.name.slice(0, 18) + '</text>';

        g.onclick = (e) => {
          e.stopPropagation();
          showSpotDetails(s, x, y);
        };

        group.appendChild(g);
      });
    }

    function getFilteredSpots() {
      return spots.filter((s) => {
        const isEmergency = s.category === 'Government & Emergency Services' || s.id.startsWith('poi_lagangilang_');
        const isPoi = s.spotType === 'poi' && !isEmergency;
        const isTouristSpot = s.spotType !== 'poi' && !isEmergency;

        if (activeFilter === 'tourist_spot' && !isTouristSpot) return false;
        if (activeFilter === 'emergency' && !isEmergency) return false;
        if (activeFilter === 'services' && !isPoi) return false;

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchName = (s.name || '').toLowerCase().includes(q);
          const matchDesc = (s.description || '').toLowerCase().includes(q);
          const matchBrgy = (s.barangay || '').toLowerCase().includes(q);
          if (!matchName && !matchDesc && !matchBrgy) return false;
        }

        return true;
      });
    }

    function renderList() {
      const container = document.getElementById('spots-list');
      container.innerHTML = '';
      const list = getFilteredSpots();

      list.forEach((s) => {
        const lat = s.lat || s.location?.lat;
        const lng = s.lng || s.location?.lng;
        const isEmergency = s.category === 'Government & Emergency Services' || s.id.startsWith('poi_lagangilang_');

        const div = document.createElement('div');
        div.className = 'spot-item';
        div.id = 'list-item-' + s.id;
        div.innerHTML =
          '<div class="spot-title"><span>' + (s.categoryIcon || '📍') + ' ' + s.name + '</span><span style="font-size:0.68rem; padding:2px 6px; border-radius:999px; background:rgba(255,255,255,0.08); color:' + (isEmergency ? '#f87171' : '#38bdf8') + ';">' + (isEmergency ? '🚨 Emergency' : (s.barangay ? 'Brgy. ' + s.barangay : 'Spot')) + '</span></div>' +
          '<div class="spot-meta">' + (s.description ? s.description.slice(0, 110) + '...' : '') + '</div>' +
          (lat && lng ? '<div class="spot-meta">📍 ' + Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5) + (s.operating_hours ? ' • ⏰ ' + s.operating_hours : '') + '</div>' : '');

        div.onclick = () => {
          if (lat && lng) {
            const { x, y } = projectCoords(lat, lng);
            centerOnMarker(x, y);
            showSpotDetails(s, x, y);
          }
        };

        container.appendChild(div);
      });
    }

    function showSpotDetails(s, x, y) {
      const popup = document.getElementById('active-popup');
      document.getElementById('pop-title').textContent = (s.categoryIcon || '📍') + ' ' + s.name;
      document.getElementById('pop-cat').textContent = s.category || 'Tourist Landmark';
      document.getElementById('pop-desc').textContent = s.description || 'No description available.';
      
      const lat = s.lat || s.location?.lat;
      const lng = s.lng || s.location?.lng;
      document.getElementById('pop-meta').innerHTML =
        (s.barangay ? '<strong>Barangay:</strong> ' + s.barangay + '<br>' : '') +
        (s.operating_hours ? '<strong>Hours:</strong> ' + s.operating_hours + '<br>' : '') +
        (lat && lng ? '<strong>GPS:</strong> ' + Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5) : '');

      const action = document.getElementById('pop-action');
      action.innerHTML = '';

      // Check if it's an emergency service
      const matchedHotline = hotlines.find(h => h.spotId === s.id || h.name.toLowerCase() === s.name.toLowerCase());
      if (matchedHotline) {
        action.innerHTML = '<a href="tel:' + matchedHotline.number.replace(/[^0-9+]/g, '') + '" class="hotline-btn">📞 Call ' + matchedHotline.number + '</a>';
      }

      popup.style.display = 'block';

      // Highlight in list
      document.querySelectorAll('.spot-item').forEach(el => el.classList.remove('active'));
      const activeEl = document.getElementById('list-item-' + s.id);
      if (activeEl) {
        activeEl.classList.add('active');
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function closePopup() {
      document.getElementById('active-popup').style.display = 'none';
      document.querySelectorAll('.spot-item').forEach(el => el.classList.remove('active'));
    }

    function filterCategory(cat, btn) {
      activeFilter = cat;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMapMarkers();
      renderList();
      closePopup();
    }

    function handleSearch() {
      searchQuery = document.getElementById('search-box').value.trim();
      renderMapMarkers();
      renderList();
    }

    // Map Pan & Zoom Engine
    const svgMap = document.getElementById('svg-map');
    const transformGroup = document.getElementById('map-transform-group');

    function updateTransform() {
      transformGroup.setAttribute('transform', 'translate(' + translateX + ',' + translateY + ') scale(' + currentScale + ')');
    }

    function zoomMap(factor) {
      currentScale = Math.max(0.7, Math.min(4.5, currentScale * factor));
      updateTransform();
    }

    function resetMap() {
      currentScale = 1;
      translateX = 0;
      translateY = 0;
      updateTransform();
      closePopup();
    }

    function centerOnMarker(x, y) {
      currentScale = 2.0;
      translateX = 500 - x * 2.0;
      translateY = 350 - y * 2.0;
      updateTransform();
    }

    // Touch & Drag Handling for Mobile / Desktop
    svgMap.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Mobile touch events
    svgMap.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX - translateX;
        startY = e.touches[0].clientY - translateY;
      }
    }, { passive: true });

    svgMap.addEventListener('touchmove', (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      translateX = e.touches[0].clientX - startX;
      translateY = e.touches[0].clientY - startY;
      updateTransform();
    }, { passive: true });

    svgMap.addEventListener('touchend', () => {
      isDragging = false;
    });

    // Populate Emergency Hotlines
    const hotlinesList = document.getElementById('hotlines-list');
    hotlines.forEach(h => {
      const div = document.createElement('div');
      div.className = 'hotline-item';
      div.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
        '  <strong>' + h.icon + ' ' + h.name + '</strong>' +
        '  <span style="font-size:0.68rem; font-weight:700; color:#f87171; background:rgba(239,68,68,0.15); padding:2px 8px; border-radius:999px;">' + h.category + '</span>' +
        '</div>' +
        '<div style="font-size:0.73rem; color:#94a3b8; margin: 4px 0;">' + h.description + '</div>' +
        '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
        '  <a href="tel:' + h.number.replace(/[^0-9+]/g, '') + '" class="hotline-btn">📞 ' + h.number + '</a>' +
        (h.altNumber ? '  <a href="tel:' + h.altNumber.replace(/[^0-9+]/g, '') + '" class="hotline-btn" style="background:#475569;">Alt: ' + h.altNumber + '</a>' : '') +
        '</div>';
      hotlinesList.appendChild(div);
    });

    // Populate Trail Guidelines
    const guidelinesList = document.getElementById('guidelines-list');
    guidelines.forEach(g => {
      const div = document.createElement('div');
      div.className = 'rule-item';
      div.innerHTML = '<span style="font-size:1.1rem;">' + g.icon + '</span><div><strong>' + g.title + '</strong><br>' + g.detail + '</div>';
      guidelinesList.appendChild(div);
    });

    // Initial render
    renderMapMarkers();
    renderList();
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lagangilang-Offline-Map-Guide-${new Date().toISOString().slice(0, 10)}.html`;
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
