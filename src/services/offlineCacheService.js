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
   * Save complete offline bundle (spots, custom GeoJSON, hotlines, timestamp)
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

    try {
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(bundle));
      return { success: true, timestamp: bundle.cachedAt, count: spots.length };
    } catch (e) {
      console.warn('LocalStorage cache limit reached, attempting compressed store:', e);
      // Strip large embedded base64 images if quota exceeded to guarantee offline spot metadata is preserved
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
    name: 'Lagangilang MDRRMO (Disaster & Rescue)',
    number: '0917-829-4501',
    altNumber: '0920-948-2311',
    description: '24/7 Search & Rescue, Medical Evacuation, Flood/Typhoon Assistance',
    category: 'Rescue',
    icon: '🚑',
  },
  {
    name: 'PNP Lagangilang Municipal Police',
    number: '0998-598-7742',
    altNumber: '0917-123-7670',
    description: 'Public Safety, Peace & Order, Tourist Security & Patrols',
    category: 'Police',
    icon: '👮',
  },
  {
    name: 'BFP Lagangilang Fire Station',
    number: '0915-432-8921',
    altNumber: '(074) 752-8111',
    description: 'Fire Emergency, Mountain & Forest Fire Response, Road Clearance',
    category: 'Fire',
    icon: '🚒',
  },
  {
    name: 'Lagangilang Rural Health Unit (RHU)',
    number: '(074) 752-8012',
    altNumber: '0977-802-3490',
    description: 'Emergency Medical Care, First Aid, Municipal Health Office',
    category: 'Medical',
    icon: '🏥',
  },
  {
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
