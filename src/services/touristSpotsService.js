import seedSpots from '../data/tourist_spots.json';

const STORAGE_KEY = 'lagangilang_tourist_spots_v3';
const LEGACY_V2_STORAGE_KEY = 'lagangilang_tourist_spots_v2';
const LEGACY_V1_STORAGE_KEY = 'lagangilang_tourist_spots_v1';
const DELETED_KEY = 'lagangilang_deleted_spot_ids_v1';
const NEON_URL_KEY = 'lagangilang_neon_db_url';
const API_BASE = import.meta.env.VITE_API_BASE || '';
const DEFAULT_NEON_URL =
  'postgresql://neondb_owner:npg_ZN9TowMbiJ8j@ep-gentle-water-azs3l8ig-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

// Obsolete spot IDs from previous seed prototypes that must never be shown
const OBSOLETE_SPOT_IDS = new Set([
  'poi_asist_main',
  'poi_lagangilang_town_hall',
  'poi_abra_river_viewpoint',
  'poi_mount_mag_atong',
  'poi_bawa_hanging_bridge',
  'poi_tagodtod_bamboo_craft',
  'poi_don_mariano_bridge_view',
  'poi_sinapangan_weaving',
  'poi_paganao_bamboo',
  'poi_la_paz_lookout',
  'poi_abra_river_poblacion',
]);

// Official categories with clean display names and default icons
export const CATEGORY_DEFINITIONS = {
  cat_religious: { id: 'cat_religious', name: 'Religious & Spiritual Site', icon: '⛪' },
  cat_nature: { id: 'cat_nature', name: 'Nature & Eco-Tourism', icon: '🏞️' },
  cat_heritage: { id: 'cat_heritage', name: 'Historical & Cultural Heritage', icon: '🏛️' },
  cat_adventure: { id: 'cat_adventure', name: 'Adventure & Trekking Trail', icon: '🌉' },
  cat_agri: { id: 'cat_agri', name: 'Agri-Tourism & Cultural Handicrafts', icon: '🌾' },
  cat_civic: { id: 'cat_civic', name: 'Civic & Public Park', icon: '🌳' },
  cat_viewpoint: { id: 'cat_viewpoint', name: 'Scenic Viewpoint & Overlook', icon: '🌄' },
  // POI & Services
  cat_gas: { id: 'cat_gas', name: 'Gas Station & Fuel', icon: '⛽' },
  cat_dining: { id: 'cat_dining', name: 'Restaurant & Dining', icon: '🍽️' },
  cat_eatery: { id: 'cat_eatery', name: 'Local Eatery & Carinderia', icon: '🍲' },
  cat_hotel: { id: 'cat_hotel', name: 'Hotel & Accommodation', icon: '🏨' },
  cat_store: { id: 'cat_store', name: 'Convenience Store & Market', icon: '🏪' },
  cat_pharmacy: { id: 'cat_pharmacy', name: 'Pharmacy & Health Clinic', icon: '💊' },
  cat_bank: { id: 'cat_bank', name: 'Bank & ATM', icon: '🏧' },
  cat_transport: { id: 'cat_transport', name: 'Transport Terminal', icon: '🚌' },
  cat_emergency: { id: 'cat_emergency', name: 'Government & Emergency Services', icon: '🏛️' },
};

/**
 * Convert database category ID or messy string into clean human-readable name
 */
export function normalizeCategoryName(rawCategory) {
  if (!rawCategory) return 'General Attraction';
  const lower = String(rawCategory).toLowerCase().trim();
  if (CATEGORY_DEFINITIONS[lower]) {
    return CATEGORY_DEFINITIONS[lower].name;
  }
  for (const def of Object.values(CATEGORY_DEFINITIONS)) {
    if (def.name.toLowerCase() === lower || def.id.toLowerCase() === lower) {
      return def.name;
    }
  }
  // If it's already a clean string like "Gas Station & Fuel", keep it
  return rawCategory;
}

/**
 * Convert clean human category name into database category ID
 */
export function normalizeCategoryId(categoryName) {
  if (!categoryName) return 'cat_heritage';
  const lower = String(categoryName).toLowerCase().trim();
  for (const def of Object.values(CATEGORY_DEFINITIONS)) {
    if (def.name.toLowerCase() === lower || def.id.toLowerCase() === lower) {
      return def.id;
    }
  }
  return 'cat_heritage';
}

/**
 * Get standard icon for a category
 */
export function getDefaultCategoryIcon(category, spotType = 'tourist_spot') {
  if (!category) return spotType === 'poi' ? '🏪' : '⭐';
  const lower = String(category).toLowerCase().trim();
  for (const def of Object.values(CATEGORY_DEFINITIONS)) {
    if (def.name.toLowerCase() === lower || def.id.toLowerCase() === lower) {
      return def.icon;
    }
  }
  if (lower.includes('gas') || lower.includes('fuel')) return '⛽';
  if (lower.includes('restaurant') || lower.includes('dining')) return '🍽️';
  if (lower.includes('eatery') || lower.includes('carinderia')) return '🍲';
  if (lower.includes('hotel') || lower.includes('accommodation')) return '🏨';
  if (lower.includes('convenience') || lower.includes('store') || lower.includes('market')) return '🏪';
  if (lower.includes('pharmacy') || lower.includes('clinic') || lower.includes('health')) return '💊';
  if (lower.includes('bank') || lower.includes('atm')) return '🏧';
  if (lower.includes('terminal') || lower.includes('transport')) return '🚌';
  if (lower.includes('emergency') || lower.includes('police')) return '🏛️';
  return spotType === 'poi' ? '🏪' : '⭐';
}

/**
 * Check if a spot is obsolete or deprecated
 */
export function isObsoleteSpot(s) {
  if (!s) return true;
  if (s.id && OBSOLETE_SPOT_IDS.has(s.id)) return true;
  return false;
}

/**
 * Calculate haversine distance between two coordinates in meters.
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the closest panorama from a list of panoramas to a given coordinate.
 */
export function findNearestPanorama(lat, lng, panoramas) {
  if (!panoramas || panoramas.length === 0) return null;
  let minDistance = Infinity;
  let closest = null;

  for (const pano of panoramas) {
    const dist = calculateDistance(lat, lng, pano.lat, pano.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = { ...pano, distanceMeters: Math.round(dist) };
    }
  }

  return closest;
}

/**
 * Service managing Tourist Spots Database.
 * Implements 2-step offline staging & direct Neon Serverless PostgreSQL sync.
 */
export const touristSpotsService = {
  /**
   * Get configured Neon Database URL from env or localStorage
   */
  getNeonUrl() {
    return (
      localStorage.getItem(NEON_URL_KEY) ||
      import.meta.env.VITE_NEON_DATABASE_URL ||
      DEFAULT_NEON_URL
    );
  },

  /**
   * Set Neon Database URL in localStorage
   */
  setNeonUrl(url) {
    if (url) {
      localStorage.setItem(NEON_URL_KEY, url.trim());
    } else {
      localStorage.removeItem(NEON_URL_KEY);
    }
  },

  /**
   * Resilient Neon query runner with automatic URL fallback
   */
  async executeNeonQuery(queryFn) {
    const primaryUrl = this.getNeonUrl();
    const urlsToTry = [primaryUrl, DEFAULT_NEON_URL].filter(Boolean);
    const uniqueUrls = [...new Set(urlsToTry)];

    let lastError = null;
    for (const url of uniqueUrls) {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(url);
        return await queryFn(sql);
      } catch (err) {
        lastError = err;
        console.warn('Neon connection/query failed:', err.message);
        // If password/auth failed, purge any corrupted custom url from localStorage and try next
        if (
          err.message &&
          (err.message.includes('authentication failed') ||
            err.message.includes('password') ||
            err.message.includes('SASL'))
        ) {
          try {
            localStorage.removeItem(NEON_URL_KEY);
          } catch (_) {}
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  },

  /**
   * Get set of explicitly deleted spot IDs to prevent resurrection from seed data
   */
  getDeletedSpotIds() {
    try {
      const raw = localStorage.getItem(DELETED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  },

  /**
   * Record a spot ID as deleted so it is never re-seeded
   */
  markSpotDeleted(spotId) {
    try {
      const set = this.getDeletedSpotIds();
      set.add(spotId);
      localStorage.setItem(DELETED_KEY, JSON.stringify([...set]));
    } catch (e) {
      console.warn('Could not persist deleted spot ID:', e);
    }
  },

  /**
   * Initialize and get all tourist spots from storage or seed JSON.
   */
  getAllSpots() {
    try {
      const deletedIds = this.getDeletedSpotIds();
      let stored = localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        // Check for legacy v2 or v1 storage to migrate custom POIs
        const legacyStored = localStorage.getItem(LEGACY_V2_STORAGE_KEY) || localStorage.getItem(LEGACY_V1_STORAGE_KEY);
        let customSpots = [];
        if (legacyStored) {
          try {
            const legacyParsed = JSON.parse(legacyStored);
            if (Array.isArray(legacyParsed)) {
              customSpots = legacyParsed.filter(
                (s) =>
                  !isObsoleteSpot(s) &&
                  !deletedIds.has(s.id) &&
                  !seedSpots.some((seed) => seed.id === s.id)
              );
            }
          } catch (e) {
            console.warn('Could not parse legacy tourist spots storage:', e);
          }
        }
        const initial = [
          ...seedSpots.filter((s) => !deletedIds.has(s.id) && !isObsoleteSpot(s)),
          ...customSpots,
        ];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Filter out obsolete, legacy dummy spots, and explicitly deleted spots
        let cleaned = parsed.filter((s) => !isObsoleteSpot(s) && !deletedIds.has(s.id));
        const existingIds = new Set(cleaned.map((s) => s.id));
        let changed = cleaned.length !== parsed.length;

        // Ensure newly seeded spots are present ONLY if not deleted by the user
        if (Array.isArray(seedSpots)) {
          for (const seed of seedSpots) {
            if (!existingIds.has(seed.id) && !deletedIds.has(seed.id) && !isObsoleteSpot(seed)) {
              cleaned.push(seed);
              changed = true;
            }
          }
        }

        // Normalize legacy typos, categories, and icons
        cleaned.forEach((s) => {
          const seedMatch = Array.isArray(seedSpots) ? seedSpots.find((seed) => seed.id === s.id) : null;
          if (seedMatch) {
            // Restore proper category & categoryIcon from official seed (e.g. Holy Cross Parish is always ⛪)
            if (!s.categoryIcon || s.categoryIcon === '⭐' || s.categoryIcon === '🏪' || s.id === 'poi_holy_cross_parish') {
              s.categoryIcon = seedMatch.categoryIcon;
              changed = true;
            }
            if (s.category?.startsWith('cat_') || !s.category || s.id === 'poi_holy_cross_parish') {
              s.category = seedMatch.category;
              changed = true;
            }
            if (!s.spotType) {
              s.spotType = seedMatch.spotType || 'tourist_spot';
              changed = true;
            }
          } else {
            // Normalize custom spots
            const normalized = normalizeCategoryName(s.category);
            if (s.category !== normalized) {
              s.category = normalized;
              changed = true;
            }
            if (!s.categoryIcon) {
              s.categoryIcon = getDefaultCategoryIcon(s.category, s.spotType);
              changed = true;
            }
          }

          if (s.barangay === 'Bawa') {
            s.barangay = 'Pawa';
            if (s.location?.address) s.location.address = s.location.address.replace('Bawa', 'Pawa');
            changed = true;
          }

          if (s.id === 'poi_quirsodan_dam' && s.connected360?.targetId === '1532761357806896') {
            s.connected360.targetId = null;
            changed = true;
          }

          // Preserve dedicated local uploads and valid 360 links
          const targetId = s.connected360?.targetId;
          const isLocalUpload =
            s.connected360?.type === 'local' ||
            !!s.connected360?.imageUrl ||
            (targetId && String(targetId).startsWith('pano_'));

          if (!isLocalUpload && targetId && (String(targetId).length < 10 || !/^\d+$/.test(String(targetId)))) {
            const matchedSeed = Array.isArray(seedSpots)
              ? seedSpots.find((seed) => seed.id === s.id)
              : null;
            if (matchedSeed && matchedSeed.connected360?.targetId) {
              s.connected360 = matchedSeed.connected360;
              changed = true;
            }
          }
        });

        if (changed) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        }
        return cleaned;
      }

      // Fallback: Initialize with seed data excluding deleted IDs
      const initial = Array.isArray(seedSpots)
        ? seedSpots.filter((s) => !deletedIds.has(s.id) && !isObsoleteSpot(s))
        : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    } catch (err) {
      console.warn('Error reading tourist spots from localStorage, falling back to seed data:', err);
      return Array.isArray(seedSpots) ? seedSpots.filter((s) => !isObsoleteSpot(s)) : [];
    }
  },

  /**
   * Save all tourist spots to localStorage.
   */
  saveAllSpots(spots) {
    try {
      const sanitized = spots
        .filter((s) => !isObsoleteSpot(s))
        .map((s) => {
          const clean = { ...s };
          // Strip out heavy base64 strings (> 20KB) to ensure localStorage quota (5MB) is never exceeded
          if (clean.image && clean.image.startsWith('data:') && clean.image.length > 20000) {
            clean.image = clean.connected360?.targetId
              ? `/panoramas/${clean.connected360.targetId}.jpg`
              : null;
          }
          if (
            clean.connected360?.imageUrl &&
            clean.connected360.imageUrl.startsWith('data:') &&
            clean.connected360.imageUrl.length > 20000
          ) {
            clean.connected360 = {
              ...clean.connected360,
              imageUrl: clean.connected360.targetId
                ? `/panoramas/${clean.connected360.targetId}.jpg`
                : null,
            };
          }
          return clean;
        });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      window.dispatchEvent(new Event('lagangilang_spots_updated'));
    } catch (err) {
      console.error('Failed to save spots to localStorage:', err);
      // Fallback: If still quota exceeded, strip image payloads entirely to save spot metadata
      try {
        const minimal = spots
          .filter((s) => !isObsoleteSpot(s))
          .map((s) => ({
            ...s,
            image: null,
            connected360: s.connected360 ? { ...s.connected360, imageUrl: null } : s.connected360,
          }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
        window.dispatchEvent(new Event('lagangilang_spots_updated'));
      } catch (innerErr) {
        console.error('Critical localStorage write failure:', innerErr);
      }
    }
  },

  /**
   * Step 1: Save new spot locally as a staged draft
   */
  saveDraftLocally(spotData, availablePanoramas = []) {
    const all = this.getAllSpots();
    const id = spotData.id || `poi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const lat = parseFloat(spotData.location?.lat ?? spotData.lat);
    const lng = parseFloat(spotData.location?.lng ?? spotData.lng);

    // Resolve 360 panorama connection
    let connected360 = spotData.connected360;
    const isLocalUpload =
      connected360?.type === 'local' ||
      !!connected360?.imageUrl ||
      (connected360?.targetId && String(connected360.targetId).startsWith('pano_'));

    if (!connected360 || (!connected360.targetId && !isLocalUpload)) {
      const nearestPano = findNearestPanorama(lat, lng, availablePanoramas);
      connected360 = nearestPano
        ? {
            type: nearestPano.type || 'mapillary',
            targetId: nearestPano.id,
            imageUrl: nearestPano.imageUrl || null,
            heading: 0,
            pitch: 0,
            distanceMeters: nearestPano.distanceMeters,
          }
        : {
            type: spotData.connected360?.type || 'mapillary',
            targetId: spotData.connected360?.targetId || null,
            imageUrl: spotData.connected360?.imageUrl || null,
            heading: parseFloat(spotData.connected360?.heading) || 0,
            pitch: parseFloat(spotData.connected360?.pitch) || 0,
          };
    }

    const cleanImage = spotData.image && spotData.image.startsWith('data:') && spotData.image.length > 20000
      ? (connected360?.targetId ? `/panoramas/${connected360.targetId}.jpg` : null)
      : (spotData.image || null);

    const cleanPanoImageUrl = connected360?.imageUrl && connected360.imageUrl.startsWith('data:') && connected360.imageUrl.length > 20000
      ? (connected360?.targetId ? `/panoramas/${connected360.targetId}.jpg` : null)
      : (connected360?.imageUrl || null);

    const newSpot = {
      ...spotData,
      id,
      lat,
      lng,
      location: {
        ...(spotData.location || {}),
        lat,
        lng,
        address: spotData.address || spotData.location?.address || `${spotData.name}, Lagangilang, Abra`,
      },
      image: cleanImage,
      sync_status: 'staged_local',
      staged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      connected360: {
        ...connected360,
        imageUrl: cleanPanoImageUrl,
      },
      isPseudoImage: spotData.isPseudoImage ?? !cleanImage,
      pseudoTheme: spotData.pseudoTheme || 'indigo',
    };

    const existingIdx = all.findIndex((s) => s.id === id);
    let updated;
    if (existingIdx >= 0) {
      updated = [...all];
      updated[existingIdx] = newSpot;
    } else {
      updated = [newSpot, ...all];
    }

    this.saveAllSpots(updated);

    // Asynchronously mirror new spot to Express backend (persisting to tourist_spots.json & DB)
    fetch(`${API_BASE}/api/tourist-spots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSpot),
    }).catch((err) => console.warn('Background mirror to server omitted:', err));

    return newSpot;
  },

  /**
   * Step 1b: Mark locally staged draft as verified
   */
  verifyDraft(spotId) {
    const all = this.getAllSpots();
    const updated = all.map((s) =>
      s.id === spotId ? { ...s, sync_status: 'verified', updated_at: new Date().toISOString() } : s
    );
    this.saveAllSpots(updated);
  },

  /**
   * Step 2: Push staged/verified spots to Neon Serverless PostgreSQL
   */
  async syncToNeonCloud(spotId = null) {
    const all = this.getAllSpots().filter((s) => !isObsoleteSpot(s));
    const targets = spotId
      ? all.filter((s) => s.id === spotId)
      : all.filter((s) => s.sync_status === 'staged_local' || s.sync_status === 'verified');

    if (targets.length === 0) {
      return { success: true, count: 0, message: 'No staged spots to sync.' };
    }

    try {
      await this.executeNeonQuery(async (sql) => {
        for (const spot of targets) {
          const lat = spot.location?.lat ?? spot.lat;
          const lng = spot.location?.lng ?? spot.lng;
          const categoryId = normalizeCategoryId(spot.category);
          const categoryName = normalizeCategoryName(spot.category);
          const icon = spot.categoryIcon || getDefaultCategoryIcon(categoryName, spot.spotType);

          // Ensure parent category exists in Neon public.categories to avoid foreign key errors
          try {
            await sql`
              INSERT INTO public.categories (id, name, icon)
              VALUES (${categoryId}, ${categoryName}, ${icon})
              ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon;
            `;
          } catch (_) {}

          await sql`
            INSERT INTO public.tourist_spots (
              id, name, category_id, barangay, latitude, longitude, address,
              description, image_url, is_pseudo_image, pseudo_theme,
              primary_pano_id, target_heading, target_pitch, sync_status,
              staged_at, synced_at, updated_at
            ) VALUES (
              ${spot.id},
              ${spot.name},
              ${categoryId},
              ${spot.barangay || 'Poblacion'},
              ${lat},
              ${lng},
              ${spot.location?.address || `${spot.name}, Lagangilang, Abra`},
              ${spot.description || ''},
              ${spot.image || null},
              ${spot.isPseudoImage ?? true},
              ${spot.pseudoTheme || 'indigo'},
              ${spot.connected360?.targetId || null},
              ${spot.connected360?.heading || 0},
              ${spot.connected360?.pitch || 0},
              'synced_cloud',
              ${spot.staged_at || new Date().toISOString()},
              NOW(),
              NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              category_id = EXCLUDED.category_id,
              barangay = EXCLUDED.barangay,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              address = EXCLUDED.address,
              description = EXCLUDED.description,
              image_url = EXCLUDED.image_url,
              is_pseudo_image = EXCLUDED.is_pseudo_image,
              pseudo_theme = EXCLUDED.pseudo_theme,
              primary_pano_id = EXCLUDED.primary_pano_id,
              target_heading = EXCLUDED.target_heading,
              target_pitch = EXCLUDED.target_pitch,
              sync_status = 'synced_cloud',
              synced_at = NOW(),
              updated_at = NOW();
          `;
        }
      });
    } catch (neonErr) {
      console.error('Neon PostgreSQL sync failed:', neonErr);
      throw new Error(`Neon PostgreSQL sync error: ${neonErr.message}`);
    }

    // Update local statuses to 'synced_cloud'
    const targetIds = new Set(targets.map((t) => t.id));
    const nowIso = new Date().toISOString();
    const updated = all.map((s) =>
      targetIds.has(s.id)
        ? { ...s, sync_status: 'synced_cloud', synced_at: nowIso }
        : s
    );

    this.saveAllSpots(updated);
    return {
      success: true,
      count: targets.length,
      message: `Successfully synchronized ${targets.length} spot(s) to Neon PostgreSQL Cloud!`,
    };
  },

  /**
   * Delete a tourist spot
   */
  deleteSpot(spotId) {
    this.markSpotDeleted(spotId);
    const all = this.getAllSpots();
    const filtered = all.filter((s) => s.id !== spotId);
    this.saveAllSpots(filtered);

    // Asynchronously delete from local Express server (which updates tourist_spots.json on disk)
    fetch(`${API_BASE}/api/tourist-spots/${spotId}`, {
      method: 'DELETE',
    }).catch(() => {});

    // Asynchronously delete from Neon Cloud DB
    this.executeNeonQuery((sql) =>
      sql`DELETE FROM public.tourist_spots WHERE id = ${spotId}`
    ).catch((err) => console.warn('Neon direct delete error:', err));

    return filtered;
  },

  /**
   * Update an existing tourist spot
   */
  updateSpot(spotId, updates) {
    const all = this.getAllSpots();
    const updated = all.map((s) => {
      if (s.id !== spotId) return s;
      return {
        ...s,
        ...updates,
        updated_at: new Date().toISOString(),
      };
    });
    this.saveAllSpots(updated);
    return updated.find((s) => s.id === spotId);
  },

  /**
   * Update coordinates of a spot/POI directly (e.g. after dragging marker on map or typing new coordinates)
   */
  updateSpotLocation(spotId, lat, lng) {
    const all = this.getAllSpots().filter((s) => !isObsoleteSpot(s));
    const parsedLat = parseFloat(Number(lat).toFixed(6));
    const parsedLng = parseFloat(Number(lng).toFixed(6));
    const nowIso = new Date().toISOString();
    const updated = all.map((s) => {
      if (s.id !== spotId) return s;
      return {
        ...s,
        location: {
          ...(s.location || {}),
          lat: parsedLat,
          lng: parsedLng,
        },
        lat: parsedLat,
        lng: parsedLng,
        updated_at: nowIso,
      };
    });
    this.saveAllSpots(updated);

    // Asynchronously mirror update to local Express server (updates tourist_spots.json on disk)
    fetch(`${API_BASE}/api/tourist-spots/${spotId}/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: parsedLat, lng: parsedLng }),
    }).catch(() => {});

    // Asynchronously mirror update to Neon Cloud DB
    this.executeNeonQuery((sql) =>
      sql`
        UPDATE public.tourist_spots
        SET latitude = ${parsedLat}, longitude = ${parsedLng}, updated_at = NOW()
        WHERE id = ${spotId}
      `
    ).catch((err) => console.warn('Neon direct location update error:', err));

    return updated.find((s) => s.id === spotId);
  },

  /**
   * Fetch freshest spots from Neon Cloud Database (background sync)
   */
  async fetchFromCloud() {
    try {
      const rows = await this.executeNeonQuery(async (sql) => {
        return await sql`
          SELECT * FROM public.tourist_spots ORDER BY created_at ASC
        `;
      });

      if (Array.isArray(rows) && rows.length > 0) {
        const deletedIds = this.getDeletedSpotIds();
        const cloudSpots = rows
          .filter((r) => !deletedIds.has(r.id) && !isObsoleteSpot(r))
          .map((r) => {
            const seedMatch = Array.isArray(seedSpots) ? seedSpots.find((seed) => seed.id === r.id) : null;
            const categoryName = normalizeCategoryName(seedMatch?.category || r.category_id);
            const categoryIcon = seedMatch?.categoryIcon || getDefaultCategoryIcon(categoryName, r.id.startsWith('poi_') ? 'tourist_spot' : 'poi');
            const spotType = seedMatch?.spotType || (r.id.startsWith('poi_ua_') || r.id.startsWith('poi_holy_') || r.id.startsWith('poi_ugiao') || r.id.startsWith('poi_quirsodan') || r.id.startsWith('poi_talinawen') || r.id.startsWith('poi_galangugong') || r.id.startsWith('poi_banat') || r.id.startsWith('poi_dj_') || r.id.startsWith('poi_rizalista') ? 'tourist_spot' : 'poi');

            return {
              id: r.id,
              name: r.name,
              category: categoryName,
              categoryIcon: categoryIcon,
              spotType: spotType,
              barangay: r.barangay,
              location: {
                lat: parseFloat(r.latitude),
                lng: parseFloat(r.longitude),
                address: r.address || `${r.name}, Lagangilang, Abra`,
              },
              lat: parseFloat(r.latitude),
              lng: parseFloat(r.longitude),
              description: r.description || '',
              image: r.image_url || null,
              isPseudoImage: r.is_pseudo_image ?? !r.image_url,
              pseudoTheme: r.pseudo_theme || 'indigo',
              connected360: {
                type: 'mapillary',
                targetId: r.primary_pano_id || null,
                heading: parseFloat(r.target_heading) || 0,
                pitch: parseFloat(r.target_pitch) || 0,
              },
              sync_status: 'synced_cloud',
              staged_at: r.staged_at,
              synced_at: r.synced_at,
              updated_at: r.updated_at,
            };
          });

        const local = this.getAllSpots().filter((s) => !isObsoleteSpot(s));
        const localMap = new Map(local.map((s) => [s.id, s]));
        const finalSpots = [];
        const seenIds = new Set();

        for (const cs of cloudSpots) {
          seenIds.add(cs.id);
          const localSpot = localMap.get(cs.id);
          if (localSpot) {
            // Compare updated_at: If local has a newer timestamp (e.g. recently dragged), keep local!
            const localTime = new Date(localSpot.updated_at || 0).getTime();
            const cloudTime = new Date(cs.updated_at || cs.synced_at || 0).getTime();
            if (localTime > cloudTime) {
              finalSpots.push(localSpot);
              const lat = localSpot.location?.lat ?? localSpot.lat;
              const lng = localSpot.location?.lng ?? localSpot.lng;
              this.executeNeonQuery((sql) =>
                sql`UPDATE public.tourist_spots SET latitude = ${lat}, longitude = ${lng}, updated_at = NOW() WHERE id = ${cs.id}`
              ).catch(() => {});
            } else {
              // Ensure custom properties like categoryIcon & spotType are preserved
              finalSpots.push({
                ...cs,
                categoryIcon: localSpot.categoryIcon || cs.categoryIcon,
                spotType: localSpot.spotType || cs.spotType,
              });
            }
          } else {
            finalSpots.push(cs);
          }
        }

        // Retain any genuine local custom spots not yet in cloud
        for (const ls of local) {
          if (!seenIds.has(ls.id) && !deletedIds.has(ls.id) && !isObsoleteSpot(ls)) {
            finalSpots.push(ls);
          }
        }

        this.saveAllSpots(finalSpots);
        return finalSpots;
      }
    } catch (err) {
      console.warn('Neon Cloud fetch error, using local buffer:', err.message);
    }
    return this.getAllSpots().filter((s) => !isObsoleteSpot(s));
  },

  /**
   * Reset to initial seed dataset
   */
  resetToSeed() {
    localStorage.removeItem(DELETED_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedSpots));
    return seedSpots;
  },
};
