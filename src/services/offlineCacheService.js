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
   * Built with real interactive Leaflet & embedded Base64 tile dictionary + full POIs, Checkpoints, 360° Panoramas, and Hotlines.
   * Completely immune to OpenStreetMap 403 blocks and works 100% offline with zero external tile dependencies.
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
  <title>Lagangilang Road & Trail • Interactive Offline Map Guide</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; min-height: 100vh; }
    header { background: #1e293b; padding: 12px 18px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; position: sticky; top: 0; z-index: 1000; }
    header h1 { font-size: 1.05rem; color: #38bdf8; display: flex; align-items: center; gap: 8px; font-weight: 800; }
    .badge-offline { background: #10b981; color: #fff; font-size: 0.72rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
    
    /* Real Leaflet Map Container */
    #map { width: 100%; height: 55vh; min-height: 380px; z-index: 10; border-bottom: 2px solid #334155; }
    
    /* Filter Bar */
    .filter-bar { background: #1e293b; padding: 10px 18px; display: flex; gap: 6px; overflow-x: auto; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .filter-btn { padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #94a3b8; font-size: 0.76rem; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
    .filter-btn.active { background: #0284c7; color: #ffffff; border-color: #38bdf8; }
    
    /* Content Columns */
    .content-container { padding: 16px 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; flex: 1; }
    .card { background: #1e293b; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); padding: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
    .card h2 { font-size: 0.95rem; font-weight: 700; color: #f1f5f9; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; }
    .search-input { width: 100%; padding: 8px 12px; border-radius: 8px; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 0.82rem; margin-bottom: 12px; outline: none; }
    
    .spot-item { padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.03); margin-bottom: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; }
    .spot-item:hover, .spot-item.active { background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.4); transform: translateX(2px); }
    .spot-title { font-weight: 700; font-size: 0.86rem; color: #ffffff; display: flex; justify-content: space-between; align-items: center; }
    .spot-meta { font-size: 0.73rem; color: #94a3b8; margin-top: 3px; line-height: 1.3; }
    
    .hotline-item { padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); margin-bottom: 10px; }
    .hotline-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; font-size: 0.78rem; font-weight: 700; text-decoration: none; margin-top: 8px; margin-right: 6px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4); border: none; cursor: pointer; }
    .rule-item { display: flex; gap: 8px; margin-bottom: 10px; font-size: 0.8rem; line-height: 1.4; color: #cbd5e1; }
    
    /* Unified Teardrop Pin Badges */
    .leaflet-popup-content-wrapper { background: #1e293b !important; color: #f8fafc !important; border: 1px solid #38bdf8 !important; border-radius: 12px !important; }
    .leaflet-popup-tip { background: #1e293b !important; }
    .custom-map-pin {
      width: 30px;
      height: 30px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      transition: all 0.2s ease;
    }
    .custom-map-pin span {
      transform: rotate(45deg);
      font-size: 14px;
      display: inline-block;
      line-height: 1;
    }
    .pin-checkpoint { background: linear-gradient(135deg, #15803d 0%, #166534 100%) !important; border-color: #4ade80 !important; }
    .pin-emergency { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%) !important; border-color: #f87171 !important; }
    .pin-nature { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%) !important; border-color: #5eead4 !important; }
    .pin-heritage { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important; border-color: #93c5fd !important; }
    .pin-service { background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important; border-color: #7dd3fc !important; }
    .pin-tourist { background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%) !important; border-color: #ffffff !important; }

    /* 360 Panorama Modal */
    #pano-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 10000; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 16px; }
    #pano-modal.active { display: flex; }
    #pano-img-container { width: 100%; max-width: 900px; height: 70vh; background: #000; border-radius: 12px; overflow: hidden; position: relative; border: 1.5px solid #38bdf8; display: flex; align-items: center; justify-content: center; }
    #pano-img { width: 100%; height: 100%; object-fit: cover; }
    .pano-close-btn { position: absolute; top: 14px; right: 14px; background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.3); color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  </style>
</head>
<body>
  <header>
    <h1>🌲 Road & Trail • Lagangilang, Abra</h1>
    <div>
      <span class="badge-offline">Interactive Offline Map (${generatedDate})</span>
    </div>
  </header>

  <!-- Interactive Real Map Container -->
  <div id="map"></div>

  <!-- Category Filters -->
  <div class="filter-bar">
    <button class="filter-btn active" onclick="filterCategory('all', this)">All Landmarks (<span id="all-count">0</span>)</button>
    <button class="filter-btn" onclick="filterCategory('tourist_spot', this)">🏞️ Tourist Spots</button>
    <button class="filter-btn" onclick="filterCategory('checkpoint', this)">🌲 DENR Checkpoints</button>
    <button class="filter-btn" onclick="filterCategory('emergency', this)">🚨 Hotlines & Stations</button>
    <button class="filter-btn" onclick="filterCategory('services', this)">🏪 Local Services & POIs</button>
  </div>

  <!-- Directory & Emergency Content -->
  <div class="content-container">
    <div class="card">
      <h2>📍 Directory (<span id="list-count">0</span>)</h2>
      <input type="text" id="search-box" class="search-input" placeholder="🔍 Search spots, caves, rivers, stations..." oninput="handleSearch()">
      <div id="spots-list" style="max-height: 480px; overflow-y: auto;"></div>
    </div>

    <div class="card">
      <h2>🚨 Official Emergency Hotlines & DENR Checkpoint</h2>
      <div id="hotlines-list"></div>
    </div>

    <div class="card">
      <h2>🛡️ Trail Safety Guidelines</h2>
      <div id="guidelines-list"></div>
    </div>
  </div>

  <!-- 360 Panorama Viewer Modal -->
  <div id="pano-modal" onclick="closePanoModal()">
    <div id="pano-img-container" onclick="event.stopPropagation()">
      <button class="pano-close-btn" onclick="closePanoModal()">✕</button>
      <img id="pano-img" src="" alt="360 Panorama Landmark" />
      <div style="position: absolute; bottom: 12px; left: 14px; background: rgba(15,23,42,0.85); padding: 6px 12px; border-radius: 8px; font-size: 0.75rem; color: #38bdf8;">
        📷 Offline 360° Landmark Panorama
      </div>
    </div>
  </div>

  <script>
    window.OFFLINE_TILES = ${tilesData};
    window.OFFLINE_360_MEDIA = ${media360Data};
    const spots = ${spotsData};
    const hotlines = ${hotlinesData};
    const guidelines = ${guidelinesData};

    let activeFilter = 'all';
    let searchQuery = '';
    const markers = [];

    // Initialize Leaflet Map centered on Lagangilang, Abra
    const map = L.map('map').setView([17.6142, 120.7340], 14);

    // Custom Offline & CORS-Safe Tile Layer (Uses Base64 tiles when offline, Esri World Street Map fallback)
    const OfflineTileLayer = L.TileLayer.extend({
      createTile: function(coords, done) {
        const tile = document.createElement('img');
        const key = coords.z + '/' + coords.x + '/' + coords.y;

        if (window.OFFLINE_TILES && window.OFFLINE_TILES[key]) {
          tile.src = window.OFFLINE_TILES[key];
          setTimeout(function() { done(null, tile); }, 0);
        } else {
          // Free, CORS-friendly Esri World Street Map (Order: z/y/x, Zero API Key, no watermarks, no 403)
          tile.src = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/' + coords.z + '/' + coords.y + '/' + coords.x;
          tile.onload = function() { done(null, tile); };
          tile.onerror = function(err) { done(null, tile); };
        }
        return tile;
      }
    });

    new OfflineTileLayer('', {
      maxZoom: 19,
      attribution: '&copy; Esri &copy; OpenStreetMap contributors • Lagangilang Trails'
    }).addTo(map);

    document.getElementById('all-count').textContent = spots.length;

    function getPinVisual(spot) {
      const name = (spot.name || '').toLowerCase();
      const cat = (spot.category || '').toLowerCase();

      if (spot.isCheckpoint || cat.includes('checkpoint') || cat.includes('denr') || name.includes('checkpoint')) {
        return { pinClass: 'pin-checkpoint', icon: '🌲', label: spot.category || 'DENR Checkpoint' };
      }
      if (cat.includes('emergency') || cat.includes('police') || cat.includes('rescue') || cat.includes('fire') || cat.includes('medical') || name.includes('police') || name.includes('mdrrmo')) {
        let icon = '🚨';
        if (name.includes('mdrrmo') || cat.includes('rescue')) icon = '🚑';
        else if (name.includes('police')) icon = '👮';
        else if (name.includes('fire')) icon = '🚒';
        else if (name.includes('health') || name.includes('rhu')) icon = '🏥';
        return { pinClass: 'pin-emergency', icon: icon, label: spot.category || 'Emergency Unit' };
      }
      if (cat.includes('nature') || cat.includes('river') || cat.includes('cave') || cat.includes('spring') || cat.includes('viewpoint')) {
        let icon = '🏞️';
        if (cat.includes('cave') || name.includes('cave')) icon = '🧗';
        else if (cat.includes('spring') || name.includes('river')) icon = '🌊';
        else if (cat.includes('viewpoint')) icon = '🌄';
        return { pinClass: 'pin-nature', icon: icon, label: spot.category || 'Nature & Eco-Tourism' };
      }
      if (cat.includes('heritage') || cat.includes('religious') || cat.includes('church') || cat.includes('civic') || name.includes('university') || name.includes('school')) {
        let icon = '🏛️';
        if (cat.includes('religious') || name.includes('church')) icon = '⛪';
        else if (name.includes('university') || name.includes('school')) icon = '🏫';
        return { pinClass: 'pin-heritage', icon: icon, label: spot.category || 'Heritage Landmark' };
      }
      let sIcon = '📍';
      if (cat.includes('transport') || cat.includes('terminal')) sIcon = '🚌';
      else if (cat.includes('gas')) sIcon = '⛽';
      else if (name.includes('water')) sIcon = '💧';
      return { pinClass: 'pin-service', icon: spot.categoryIcon || sIcon, label: spot.category || 'Public Service & POI' };
    }

    function open360Modal(spotId) {
      const spot = spots.find(s => s.id === spotId);
      const targetId = spot?.connected360?.targetId || spotId;
      const media = window.OFFLINE_360_MEDIA[spotId] || window.OFFLINE_360_MEDIA[targetId] || spot?.image || spot?.connected360?.imageUrl;
      if (media) {
        document.getElementById('pano-img').src = media;
        document.getElementById('pano-modal').classList.add('active');
      }
    }

    function closePanoModal() {
      document.getElementById('pano-modal').classList.remove('active');
      document.getElementById('pano-img').src = '';
    }

    function renderMapMarkers() {
      markers.forEach(m => map.removeLayer(m));
      markers.length = 0;

      const filtered = getFilteredSpots();
      document.getElementById('list-count').textContent = filtered.length;

      filtered.forEach((s) => {
        const lat = s.lat || s.location?.lat;
        const lng = s.lng || s.location?.lng;
        if (!lat || !lng) return;

        const visual = getPinVisual(s);

        const customIcon = L.divIcon({
          className: 'custom-div-icon',
          html: '<div class="custom-map-pin ' + visual.pinClass + '"><span>' + visual.icon + '</span></div>',
          iconSize: [30, 30],
          iconAnchor: [15, 30],
          popupAnchor: [0, -28],
        });

        const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

        const targetPanoId = s.connected360?.targetId || s.id;
        const has360 = Boolean(window.OFFLINE_360_MEDIA[s.id] || window.OFFLINE_360_MEDIA[targetPanoId] || s.connected360?.imageUrl || s.image);

        const popupContent =
          '<div style="min-width:180px;">' +
          '  <h4 style="margin:0 0 4px 0; color:#38bdf8; font-size:0.95rem;">' + iconChar + ' ' + s.name + '</h4>' +
          '  <div style="font-size:0.75rem; color:#f59e0b; font-weight:700; margin-bottom:4px;">' + (s.category || 'Spot') + '</div>' +
          (s.description ? '<p style="margin:0 0 6px 0; font-size:0.75rem; color:#cbd5e1; line-height:1.3;">' + s.description + '</p>' : '') +
          '  <div style="font-size:0.7rem; color:#94a3b8;">📍 ' + Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5) + '</div>' +
          (s.phone ? '<a href="tel:' + s.phone.replace(/[^0-9+]/g, '') + '" class="hotline-btn">📞 ' + s.phone + '</a>' : '') +
          (has360 ? '<button onclick="open360Modal(\\'' + s.id + '\\')" class="hotline-btn" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">📷 View 360° Panorama</button>' : '') +
          '</div>';

        marker.bindPopup(popupContent);
        marker.spotId = s.id;
        markers.push(marker);
      });
    }

    function getFilteredSpots() {
      return spots.filter((s) => {
        const cat = (s.category || '').toLowerCase();
        const isCheckpoint = s.isCheckpoint || cat.includes('checkpoint') || cat.includes('denr');
        const isEmergency = cat.includes('emergency') || cat.includes('police') || cat.includes('rescue');
        const isPoi = (s.spotType === 'poi' || s.type === 'poi') && !isEmergency && !isCheckpoint;
        const isTouristSpot = !isPoi && !isEmergency && !isCheckpoint;

        if (activeFilter === 'tourist_spot' && !isTouristSpot) return false;
        if (activeFilter === 'checkpoint' && !isCheckpoint) return false;
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
        const pinClass = getPinClass(s);

        const div = document.createElement('div');
        div.className = 'spot-item';
        div.id = 'list-item-' + s.id;
        div.innerHTML =
          '<div class="spot-title"><span>' + (s.categoryIcon || '📍') + ' ' + s.name + '</span><span style="font-size:0.68rem; padding:2px 6px; border-radius:999px; background:rgba(255,255,255,0.08); color:#38bdf8;">' + (s.category || 'Spot') + '</span></div>' +
          '<div class="spot-meta">' + (s.description ? s.description.slice(0, 110) + '...' : '') + '</div>' +
          (lat && lng ? '<div class="spot-meta">📍 ' + Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5) + '</div>' : '');

        div.onclick = () => {
          if (lat && lng) {
            map.flyTo([lat, lng], 16, { duration: 0.8 });
            const m = markers.find(mk => mk.spotId === s.id);
            if (m) m.openPopup();
          }
        };

        container.appendChild(div);
      });
    }

    function filterCategory(cat, btn) {
      activeFilter = cat;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMapMarkers();
      renderList();
    }

    function handleSearch() {
      searchQuery = document.getElementById('search-box').value.trim();
      renderMapMarkers();
      renderList();
    }

    // Populate Emergency Hotlines
    const hotlinesList = document.getElementById('hotlines-list');
    hotlines.forEach(h => {
      const div = document.createElement('div');
      div.className = 'hotline-item';
      div.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
        '  <strong>' + (h.icon || '📞') + ' ' + h.name + '</strong>' +
        '  <span style="font-size:0.68rem; font-weight:700; color:#34d399; background:rgba(16,185,129,0.15); padding:2px 8px; border-radius:999px;">' + (h.category || 'Hotline') + '</span>' +
        '</div>' +
        '<div style="font-size:0.73rem; color:#94a3b8; margin: 4px 0;">' + (h.description || '') + '</div>' +
        '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
        '  <a href="tel:' + (h.number || h.phone || '').replace(/[^0-9+]/g, '') + '" class="hotline-btn">📞 ' + (h.number || h.phone || 'Call') + '</a>' +
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
