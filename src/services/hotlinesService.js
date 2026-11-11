/**
 * Hotlines & Environmental Checkpoint Service
 * 
 * Provides unified, database/localStorage-backed CRUD management for:
 * - DENR Environmental Checkpoints & Monitoring Stations
 * - Municipal Emergency Response Units (MDRRMO, Police, Fire, Health)
 * - Official Tourism Information Desks
 * 
 * Handles real-time two-way synchronization between the Hotline Directory
 * and the 2D Map POI pins.
 */

import globalSyncService, { GLOBAL_STATE_KEYS } from './globalSyncService';

const STORAGE_KEY = 'lagangilang_hotlines_checkpoints_v2';

export const INITIAL_HOTLINES_AND_CHECKPOINTS = [
  {
    id: 'poi_denr_checkpoint_lagangilang',
    name: 'DENR Environmental Checkpoint - Lagangilang',
    category: 'DENR Checkpoint',
    categoryIcon: '🌲',
    phone: '0917-889-3321',
    altPhone: '(074) 752-8234',
    description: 'Timber & Wildlife Monitoring, Watershed Protection, Mountain Trail Registration & Environmental Safety Inspection',
    operatingHours: '24/7 Official Monitoring & Registration Desk',
    location: {
      lat: 17.60386,
      lng: 120.741372,
      address: 'Abra-Kalinga National Highway, Poblacion, Lagangilang, Abra',
    },
    notes: 'Required registration point for hikers traversing upland eco-trails and municipal forest corridors.',
    spotType: 'poi',
    isCheckpoint: true,
  },
  {
    id: 'poi_lagangilang_mdrrmo',
    name: 'Lagangilang MDRRMO (Disaster & Rescue)',
    category: 'MDRRMO',
    categoryIcon: '🚑',
    phone: '0917-829-4501',
    altPhone: '0920-948-2311',
    description: '24/7 Search & Rescue, Medical Evacuation, Flood/Typhoon Monitoring, Mountain Assistance',
    operatingHours: '24/7 Disaster Operations Center',
    location: {
      lat: 17.612657,
      lng: 120.733619,
      address: 'Municipal Hall Complex, Poblacion, Lagangilang, Abra',
    },
    spotType: 'poi',
  },
  {
    id: 'poi_lagangilang_pnp',
    name: 'PNP Lagangilang Municipal Police',
    category: 'Police',
    categoryIcon: '👮',
    phone: '0998-598-7742',
    altPhone: '0917-123-7670',
    description: 'Public Safety, Peace & Order, Highway Patrols, Tourist Security Assistance',
    operatingHours: '24/7 Police Desk & Mobile Patrols',
    location: {
      lat: 17.606696,
      lng: 120.736523,
      address: 'Kalinga Road, Poblacion, Lagangilang, Abra',
    },
    spotType: 'poi',
  },
  {
    id: 'poi_lagangilang_bfp',
    name: 'BFP Lagangilang Fire Station',
    category: 'Fire',
    categoryIcon: '🚒',
    phone: '0915-432-8921',
    altPhone: '(074) 752-8111',
    description: 'Fire Emergency, Mountain & Forest Fire Response, Road Clearance & Disaster Rescue',
    operatingHours: '24/7 Emergency Dispatch',
    location: {
      lat: 17.60848,
      lng: 120.735801,
      address: 'Kalinga Road, Poblacion, Lagangilang, Abra',
    },
    spotType: 'poi',
  },
  {
    id: 'poi_lagangilang_rhu',
    name: 'Lagangilang Rural Health Unit (RHU)',
    category: 'Health / RHU',
    categoryIcon: '🏥',
    phone: '(074) 752-8012',
    altPhone: '0977-802-3490',
    description: 'Emergency Medical Care, Outpatient Consultation, First Aid & Antivenom Administration',
    operatingHours: '8:00 AM - 5:00 PM (24/7 On-Call Emergency)',
    location: {
      lat: 17.607668,
      lng: 120.735759,
      address: 'Health Center, Poblacion, Lagangilang, Abra',
    },
    spotType: 'poi',
  },
  {
    id: 'poi_lagangilang_tourism_office',
    name: 'Lagangilang Municipal Tourism Office',
    category: 'Tourism',
    categoryIcon: '🌴',
    phone: '0917-504-2299',
    altPhone: '(074) 752-8001',
    description: 'Trail Information, Tourist Assistance, Tour Guide Accreditation & Cultural Advisories',
    operatingHours: '8:00 AM - 5:00 PM Monday to Friday',
    location: {
      lat: 17.61267,
      lng: 120.733661,
      address: 'Tourism Desk, Presidencia Ti Lagangilang, Poblacion',
    },
    spotType: 'poi',
  },
];

class HotlinesService {
  constructor() {
    this.listeners = new Set();
  }

  /**
   * Load current list of hotlines & checkpoints
   */
  getAll() {
    if (typeof window === 'undefined') return INITIAL_HOTLINES_AND_CHECKPOINTS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let modified = false;
          // Heal any entries that still have legacy Poblacion spawn coordinates
          const healed = parsed.map((item) => {
            const init = INITIAL_HOTLINES_AND_CHECKPOINTS.find((i) => i.id === item.id);
            if (init) {
              const itemLat = item.location?.lat ?? item.lat;
              const isOldSpawn = (
                (item.id === 'poi_lagangilang_pnp' && Math.abs(itemLat - 17.6141) < 0.001) ||
                (item.id === 'poi_lagangilang_bfp' && Math.abs(itemLat - 17.6138) < 0.001) ||
                (item.id === 'poi_lagangilang_rhu' && Math.abs(itemLat - 17.6152) < 0.001) ||
                (item.id === 'poi_denr_checkpoint_lagangilang' && Math.abs(itemLat - 17.6185) < 0.001)
              );
              if (isOldSpawn) {
                modified = true;
                return {
                  ...item,
                  ...init,
                  location: { ...(item.location || {}), ...init.location },
                  lat: init.location.lat,
                  lng: init.location.lng,
                };
              }
            }
            return item;
          });
          if (modified) {
            this.saveAll(healed, false);
            return healed;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse hotlines from storage:', e);
    }
    // Initialize default storage
    this.saveAll(INITIAL_HOTLINES_AND_CHECKPOINTS);
    return INITIAL_HOTLINES_AND_CHECKPOINTS;
  }

  saveAll(list, syncToCloud = true) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      this.notify(list);
      if (syncToCloud) {
        globalSyncService.saveKey(GLOBAL_STATE_KEYS.HOTLINES, list).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to save hotlines to storage:', e);
    }
  }

  /**
   * Create or update a hotline/checkpoint
   */
  saveEntry(entry) {
    const list = this.getAll();
    const id = entry.id || `poi_custom_${Date.now()}`;
    const cleanEntry = {
      ...entry,
      id,
      spotType: 'poi',
      isCheckpoint: entry.category?.toLowerCase().includes('checkpoint') || entry.category?.toLowerCase().includes('denr'),
      categoryIcon: entry.categoryIcon || (entry.category?.toLowerCase().includes('checkpoint') ? '🌲' : '📞'),
    };

    const idx = list.findIndex((h) => h.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...cleanEntry };
    } else {
      list.push(cleanEntry);
    }

    this.saveAll(list);
    return cleanEntry;
  }

  /**
   * Delete a hotline/checkpoint by ID
   */
  deleteEntry(id) {
    const list = this.getAll().filter((h) => h.id !== id);
    this.saveAll(list);
  }

  /**
   * Update coordinates for a hotline or checkpoint and persist immediately
   */
  updateCoordinates(id, { lat, lng }) {
    const list = this.getAll();
    const parsedLat = parseFloat(Number(lat).toFixed(6));
    const parsedLng = parseFloat(Number(lng).toFixed(6));
    const idx = list.findIndex((h) => h.id === id);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        lat: parsedLat,
        lng: parsedLng,
        location: {
          ...(list[idx].location || {}),
          lat: parsedLat,
          lng: parsedLng,
        },
      };
      this.saveAll(list);

      // Fast per-item location update to Neon PostgreSQL (/api/update-pin-location and /api/item-location)
      const apiBase = import.meta.env.VITE_API_BASE || '';
      fetch(`${apiBase}/api/update-pin-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type: 'hotline', lat: parsedLat, lng: parsedLng }),
      }).catch((e) => console.warn('Hotline update-pin-location warning:', e));

      fetch(`${apiBase}/api/item-location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, lat: parsedLat, lng: parsedLng }),
      }).catch((e) => console.warn('Hotline location sync warning:', e));

      // Direct Neon DB execution fallback for 100% cloud persistence
      try {
        const customUrl = typeof localStorage !== 'undefined' && localStorage.getItem('lagangilang_neon_db_url');
        const envUrl = import.meta.env.VITE_NEON_DATABASE_URL;
        const fallbackUrl = 'postgresql://neondb_owner:npg_lHhZV7o5xvMt@ep-silent-heart-azsxtkkj-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
        const NEON_URL = (customUrl && customUrl.includes('ep-silent-heart-azsxtkkj')) ? customUrl
          : (envUrl && envUrl.includes('ep-silent-heart-azsxtkkj')) ? envUrl
          : fallbackUrl;
        import('@neondatabase/serverless').then(async ({ neon }) => {
          const sql = neon(NEON_URL);
          // 1. Update in lagangilang_global_state
          try {
            const rows = await sql`SELECT payload FROM lagangilang_global_state WHERE state_key = 'hotlines_and_checkpoints'`;
            if (rows && rows[0] && Array.isArray(rows[0].payload)) {
              const updatedList = rows[0].payload.map((item) =>
                item.id === id ? { ...item, lat: parsedLat, lng: parsedLng, location: { ...(item.location || {}), lat: parsedLat, lng: parsedLng } } : item
              );
              await sql`
                UPDATE lagangilang_global_state
                SET payload = ${JSON.stringify(updatedList)}::jsonb, updated_at = NOW()
                WHERE state_key = 'hotlines_and_checkpoints'
              `;
            }
          } catch (_) {}

          // 2. Update tourist_spots table
          sql`
            UPDATE public.tourist_spots
            SET latitude = ${parsedLat}, longitude = ${parsedLng}, updated_at = NOW()
            WHERE id = ${id}
          `.catch(() => {});
        }).catch(() => {});
      } catch (_) {}
    }
  }

  /**
   * Convert hotlines with valid coordinates into Map POI spots
   */
  asMapPois() {
    const list = this.getAll();
    return list
      .filter((h) => h.location?.lat && h.location?.lng)
      .map((h) => ({
        id: h.id,
        name: h.name,
        category: h.category,
        categoryIcon: h.categoryIcon || (h.isCheckpoint ? '🌲' : '🚨'),
        spotType: 'poi',
        isCheckpoint: h.isCheckpoint,
        phone: h.phone,
        altPhone: h.altPhone,
        description: h.description,
        operatingHours: h.operatingHours,
        notes: h.notes,
        location: h.location,
        lat: h.location.lat,
        lng: h.location.lng,
      }));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(list) {
    this.listeners.forEach((fn) => {
      try {
        fn(list);
      } catch (err) {
        console.error('Hotline subscriber error:', err);
      }
    });
  }
}

export const hotlinesService = new HotlinesService();
export default hotlinesService;
