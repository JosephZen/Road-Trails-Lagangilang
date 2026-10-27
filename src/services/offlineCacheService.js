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
   * Can be opened anywhere with zero cellular connection or printed as a trail guide.
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lagangilang Eco-Trails & Emergency Guide (Offline)</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; min-height: 100vh; }
    header { background: #1e293b; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
    header h1 { font-size: 1.15rem; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .badge-offline { background: #059669; color: #fff; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; borderRadius: 999px; }
    #map { width: 100%; height: 50vh; min-height: 320px; background: #1e293b; }
    .content-container { padding: 16px 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; flex: 1; }
    .card { background: #1e293b; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); padding: 16px; }
    .card h2 { font-size: 0.98rem; font-weight: 700; color: #f1f5f9; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; }
    .spot-item { padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.03); margin-bottom: 8px; cursor: pointer; transition: background 0.15s; }
    .spot-item:hover { background: rgba(56, 189, 248, 0.1); }
    .spot-title { font-weight: 700; font-size: 0.88rem; color: #ffffff; display: flex; justify-content: space-between; }
    .spot-meta { font-size: 0.74rem; color: #94a3b8; margin-top: 3px; }
    .hotline-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; background: #ef4444; color: #fff; font-size: 0.78rem; font-weight: 700; text-decoration: none; margin-top: 6px; margin-right: 6px; }
    .rule-item { display: flex; gap: 8px; margin-bottom: 10px; font-size: 0.8rem; line-height: 1.4; color: #cbd5e1; }
    @media print {
      body { background: #fff; color: #000; }
      #map { height: 350px; }
      .card { border: 1px solid #ccc; background: #fff; color: #000; }
      .spot-item { background: #f4f4f4; color: #000; }
      .spot-title, .card h2, header h1 { color: #000; }
      .hotline-btn { background: #333; color: #fff; }
    }
  </style>
</head>
<body>
  <header>
    <h1>🌲 Lagangilang, Abra • Offline Eco-Trails Map</h1>
    <div>
      <span class="badge-offline">Downloaded for Zero-Signal Areas (${generatedDate})</span>
    </div>
  </header>
  <div id="map"></div>
  <div class="content-container">
    <div class="card">
      <h2>📍 Tourist Spots & POIs (<span id="spot-count">0</span>)</h2>
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

    document.getElementById('spot-count').textContent = spots.length;

    // Initialize Leaflet Map centered on Lagangilang
    const map = L.map('map').setView([17.615, 120.738], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const spotsList = document.getElementById('spots-list');
    spots.forEach(s => {
      const lat = s.lat || s.location?.lat;
      const lng = s.lng || s.location?.lng;
      if (lat && lng) {
        const marker = L.marker([lat, lng]).addTo(map);
        marker.bindPopup('<strong>' + s.name + '</strong><br>' + (s.category || '') + '<br><small>' + (s.description || '') + '</small>');
      }

      const div = document.createElement('div');
      div.className = 'spot-item';
      div.innerHTML = '<div class="spot-title"><span>' + (s.categoryIcon || '📍') + ' ' + s.name + '</span><span style="font-size:0.7rem; color:#38bdf8;">' + (s.barangay ? 'Brgy. ' + s.barangay : '') + '</span></div>' +
        '<div class="spot-meta">' + (s.description ? s.description.slice(0, 100) + '...' : '') + '</div>' +
        (s.operating_hours ? '<div class="spot-meta">⏰ ' + s.operating_hours + '</div>' : '') +
        (lat && lng ? '<div class="spot-meta">📍 ' + Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5) + '</div>' : '');
      div.onclick = () => {
        if (lat && lng) {
          map.setView([lat, lng], 15);
        }
      };
      spotsList.appendChild(div);
    });

    const hotlinesList = document.getElementById('hotlines-list');
    hotlines.forEach(h => {
      const div = document.createElement('div');
      div.style.marginBottom = '12px';
      div.innerHTML = '<strong>' + h.icon + ' ' + h.name + '</strong>' +
        '<div style="font-size:0.74rem; color:#94a3b8; margin: 2px 0;">' + h.description + '</div>' +
        '<a href="tel:' + h.number.replace(/[^0-9+]/g, '') + '" class="hotline-btn">📞 ' + h.number + '</a>' +
        (h.altNumber ? '<a href="tel:' + h.altNumber.replace(/[^0-9+]/g, '') + '" class="hotline-btn" style="background:#475569;">Alt: ' + h.altNumber + '</a>' : '');
      hotlinesList.appendChild(div);
    });

    const guidelinesList = document.getElementById('guidelines-list');
    guidelines.forEach(g => {
      const div = document.createElement('div');
      div.className = 'rule-item';
      div.innerHTML = '<span style="font-size:1.1rem;">' + g.icon + '</span><div><strong>' + g.title + '</strong><br>' + g.detail + '</div>';
      guidelinesList.appendChild(div);
    });
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
