import seedSpots from '../data/tourist_spots.json';

const STORAGE_KEY = 'lagangilang_tourist_spots_v1';
const NEON_URL_KEY = 'lagangilang_neon_db_url';

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
    return localStorage.getItem(NEON_URL_KEY) || import.meta.env.VITE_NEON_DATABASE_URL || '';
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
   * Initialize and get all tourist spots from storage or seed JSON.
   */
  getAllSpots() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      // Initialize with seed data
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seedSpots));
      return seedSpots;
    } catch (err) {
      console.warn('Error reading tourist spots from localStorage, falling back to seed data:', err);
      return seedSpots;
    }
  },

  /**
   * Save array of spots to local storage.
   */
  saveAllSpots(spots) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));
    } catch (err) {
      console.error('Failed to persist tourist spots to localStorage:', err);
    }
  },

  /**
   * Get all locally staged spots (Step 1: Staged locally for field verification)
   */
  getStagedSpots() {
    const all = this.getAllSpots();
    return all.filter((s) => s.sync_status === 'staged_local');
  },

  /**
   * Step 1: Save draft tourist spot locally (offline-ready)
   */
  saveDraftLocally(spotData, availablePanoramas = []) {
    const all = this.getAllSpots();
    const lat = parseFloat(spotData.lat || spotData.location?.lat);
    const lng = parseFloat(spotData.lng || spotData.location?.lng);

    // Auto-link to nearest 360 panorama if not explicitly provided
    let connected360 = spotData.connected360;
    if (!connected360 || !connected360.targetId) {
      const nearest = findNearestPanorama(lat, lng, availablePanoramas);
      if (nearest) {
        connected360 = {
          type: 'local',
          targetId: nearest.id,
          heading: nearest.heading || 0,
          pitch: 0,
          distanceMeters: nearest.distanceMeters,
        };
      }
    }

    const id = spotData.id || `poi_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newSpot = {
      id,
      name: spotData.name.trim(),
      category: spotData.category || 'General Attraction',
      categoryIcon: spotData.categoryIcon || 'map-pin',
      barangay: spotData.barangay || 'Poblacion',
      location: {
        lat,
        lng,
        address: spotData.address || `${spotData.barangay || 'Lagangilang'}, Abra`,
      },
      description: spotData.description || 'Scenic point of interest in Lagangilang, Abra.',
      image: spotData.image || null,
      isPseudoImage: !spotData.image,
      pseudoTheme: spotData.pseudoTheme || 'indigo',
      connected360: connected360 || {
        type: 'local',
        targetId: null,
        heading: 0,
        pitch: 0,
      },
      sync_status: 'staged_local',
      staged_at: new Date().toISOString(),
      synced_at: null,
    };

    const existingIndex = all.findIndex((s) => s.id === id);
    if (existingIndex >= 0) {
      all[existingIndex] = { ...all[existingIndex], ...newSpot };
    } else {
      all.unshift(newSpot);
    }

    this.saveAllSpots(all);
    return newSpot;
  },

  /**
   * Mark a staged spot as verified by the surveyor
   */
  verifyDraft(spotId) {
    const all = this.getAllSpots();
    const updated = all.map((s) =>
      s.id === spotId ? { ...s, sync_status: 'verified' } : s
    );
    this.saveAllSpots(updated);
  },

  /**
   * Step 2: Push staged/verified spots to Neon Serverless PostgreSQL
   */
  async syncToNeonCloud(spotId = null) {
    const dbUrl = this.getNeonUrl();
    const all = this.getAllSpots();
    const targets = spotId
      ? all.filter((s) => s.id === spotId)
      : all.filter((s) => s.sync_status === 'staged_local' || s.sync_status === 'verified');

    if (targets.length === 0) {
      return { success: true, count: 0, message: 'No staged spots to sync.' };
    }

    // If Neon URL is configured, push to Neon PostgreSQL over HTTPS
    if (dbUrl) {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(dbUrl);

        for (const spot of targets) {
          await sql`
            INSERT INTO public.tourist_spots (
              id, name, barangay, latitude, longitude, address,
              description, image_url, is_pseudo_image, pseudo_theme,
              primary_pano_id, target_heading, target_pitch, sync_status,
              staged_at, synced_at
            ) VALUES (
              ${spot.id},
              ${spot.name},
              ${spot.barangay},
              ${spot.location.lat},
              ${spot.location.lng},
              ${spot.location.address},
              ${spot.description},
              ${spot.image},
              ${spot.isPseudoImage},
              ${spot.pseudoTheme},
              ${spot.connected360?.targetId || null},
              ${spot.connected360?.heading || 0},
              ${spot.connected360?.pitch || 0},
              'synced_cloud',
              ${spot.staged_at || new Date().toISOString()},
              NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
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
      } catch (neonErr) {
        console.error('Neon PostgreSQL sync failed:', neonErr);
        throw new Error(`Neon PostgreSQL sync error: ${neonErr.message}`);
      }
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
      message: dbUrl
        ? `Successfully pushed ${targets.length} spot(s) to Neon PostgreSQL!`
        : `Verified & marked ${targets.length} spot(s) as synced (Local Mock mode)!`,
    };
  },

  /**
   * Delete a tourist spot
   */
  deleteSpot(spotId) {
    const all = this.getAllSpots();
    const filtered = all.filter((s) => s.id !== spotId);
    this.saveAllSpots(filtered);
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
   * Reset to initial seed dataset
   */
  resetToSeed() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedSpots));
    return seedSpots;
  },
};
