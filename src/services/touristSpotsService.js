import seedSpots from '../data/tourist_spots.json';

const STORAGE_KEY = 'lagangilang_tourist_spots_v2';
const LEGACY_STORAGE_KEY = 'lagangilang_tourist_spots_v1';
const DELETED_KEY = 'lagangilang_deleted_spot_ids_v1';
const NEON_URL_KEY = 'lagangilang_neon_db_url';
const API_BASE = import.meta.env.VITE_API_BASE || '';
const DEFAULT_NEON_URL =
  'postgresql://neondb_owner:npg_ZN9TowMbiJ8j@ep-gentle-water-azs3l8ig-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

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
        // Check for legacy v1 storage to migrate custom POIs
        const legacyStored = localStorage.getItem(LEGACY_STORAGE_KEY);
        let customSpots = [];
        if (legacyStored) {
          try {
            const legacyParsed = JSON.parse(legacyStored);
            if (Array.isArray(legacyParsed)) {
              // Retain user-created custom spots that aren't old dummy spot_00* records or deleted
              customSpots = legacyParsed.filter(
                (s) => !s.id.startsWith('spot_') && !deletedIds.has(s.id) && !seedSpots.some((seed) => seed.id === s.id)
              );
            }
          } catch (e) {
            console.warn('Could not parse legacy tourist spots storage:', e);
          }
        }
        const initial = [...seedSpots.filter((s) => !deletedIds.has(s.id)), ...customSpots];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Filter out legacy dummy spots and any explicitly deleted spots
        let cleaned = parsed.filter((s) => !s.id.startsWith('spot_') && !deletedIds.has(s.id));
        const existingIds = new Set(cleaned.map((s) => s.id));
        let changed = cleaned.length !== parsed.length;

        // Ensure newly seeded spots are present ONLY if not deleted by the user
        if (Array.isArray(seedSpots)) {
          for (const seed of seedSpots) {
            if (!existingIds.has(seed.id) && !deletedIds.has(seed.id)) {
              cleaned.push(seed);
              changed = true;
            }
          }
        }

        // Normalize legacy typos (e.g. Bawa -> Pawa)
        cleaned.forEach((s) => {
          if (s.barangay === 'Bawa') {
            s.barangay = 'Pawa';
            if (s.location?.address) s.location.address = s.location.address.replace('Bawa', 'Pawa');
            changed = true;
          }

          // Migrate legacy local "pano_..." or small integer IDs to verified Mapillary IDs
          const targetId = s.connected360?.targetId;
          if (targetId && (String(targetId).startsWith('pano_') || String(targetId).length < 10 || !/^\d+$/.test(String(targetId)))) {
            const matchedSeed = Array.isArray(seedSpots) ? seedSpots.find((seed) => seed.id === s.id) : null;
            if (matchedSeed && matchedSeed.connected360?.targetId) {
              s.connected360 = matchedSeed.connected360;
            } else {
              s.connected360 = {
                type: 'mapillary',
                targetId: '1532761357806896',
                heading: s.connected360?.heading || 0,
                pitch: s.connected360?.pitch || 0,
              };
            }
            changed = true;
          }
        });

        if (changed) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        }
        return cleaned;
      }

      // Fallback: Initialize with seed data excluding deleted IDs
      const initial = Array.isArray(seedSpots) ? seedSpots.filter((s) => !deletedIds.has(s.id)) : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    } catch (err) {
      console.warn('Error reading tourist spots from localStorage, falling back to seed data:', err);
      return Array.isArray(seedSpots) ? seedSpots : [];
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
      spotType: spotData.spotType || 'tourist_spot',
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

    // Asynchronously mirror write to local Express server
    fetch(`${API_BASE}/api/tourist-spots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSpot),
    }).catch(() => {});

    // Asynchronously mirror write to Neon Cloud PostgreSQL
    const dbUrl = this.getNeonUrl();
    if (dbUrl) {
      import('@neondatabase/serverless').then(({ neon }) => {
        const sql = neon(dbUrl);
        sql`
          INSERT INTO public.tourist_spots (
            id, name, barangay, latitude, longitude, address,
            description, image_url, is_pseudo_image, pseudo_theme,
            primary_pano_id, target_heading, target_pitch, sync_status,
            staged_at, synced_at, updated_at
          ) VALUES (
            ${newSpot.id}, ${newSpot.name}, ${newSpot.barangay}, ${lat}, ${lng},
            ${newSpot.location.address}, ${newSpot.description}, ${newSpot.image},
            ${newSpot.isPseudoImage}, ${newSpot.pseudoTheme},
            ${newSpot.connected360?.targetId || null},
            ${newSpot.connected360?.heading || 0}, ${newSpot.connected360?.pitch || 0},
            'synced_cloud', NOW(), NOW(), NOW()
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
        `.catch((err) => console.warn('Neon direct save error:', err));
      }).catch(() => {});
    }

    return newSpot;
  },

  /**
   * Fetch spots from local Express server (which connects to local PostgreSQL via pgAdmin 4)
   */
  async fetchFromLocalApi() {
    try {
      const res = await fetch(`${API_BASE}/api/tourist-spots`);
      if (res.ok) {
        const spots = await res.json();
        if (Array.isArray(spots) && spots.length > 0) {
          this.saveAllSpots(spots);
          return spots;
        }
      }
    } catch (e) {
      // Local server not running, ignore
    }
    return this.getAllSpots();
  },

  /**
   * Check if local PostgreSQL is reachable via the local server
   */
  async checkLocalPostgres() {
    try {
      const res = await fetch(`${API_BASE}/api/health/postgres`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // ignore
    }
    return { connected: false, message: 'Local server not running' };
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
    this.markSpotDeleted(spotId);
    const all = this.getAllSpots();
    const filtered = all.filter((s) => s.id !== spotId);
    this.saveAllSpots(filtered);

    // Asynchronously delete from local Express server (which updates tourist_spots.json on disk)
    fetch(`${API_BASE}/api/tourist-spots/${spotId}`, {
      method: 'DELETE',
    }).catch(() => {});

    // Asynchronously delete from Neon Cloud DB
    const dbUrl = this.getNeonUrl();
    if (dbUrl) {
      import('@neondatabase/serverless').then(({ neon }) => {
        const sql = neon(dbUrl);
        sql`DELETE FROM public.tourist_spots WHERE id = ${spotId}`.catch((err) =>
          console.warn('Neon direct delete error:', err)
        );
      }).catch(() => {});
    }

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
    const all = this.getAllSpots();
    const parsedLat = parseFloat(Number(lat).toFixed(6));
    const parsedLng = parseFloat(Number(lng).toFixed(6));
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
        updated_at: new Date().toISOString(),
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
    const dbUrl = this.getNeonUrl();
    if (dbUrl) {
      import('@neondatabase/serverless').then(({ neon }) => {
        const sql = neon(dbUrl);
        sql`
          UPDATE public.tourist_spots
          SET latitude = ${parsedLat}, longitude = ${parsedLng}, updated_at = NOW()
          WHERE id = ${spotId}
        `.catch((err) => console.warn('Neon direct location update error:', err));
      }).catch(() => {});
    }

    return updated.find((s) => s.id === spotId);
  },

  /**
   * Fetch freshest spots from Neon Cloud Database (background sync)
   */
  async fetchFromCloud() {
    const dbUrl = this.getNeonUrl();
    if (!dbUrl) return this.getAllSpots();

    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(dbUrl);
      const rows = await sql`
        SELECT * FROM public.tourist_spots ORDER BY created_at ASC
      `;

      if (Array.isArray(rows) && rows.length > 0) {
        const deletedIds = this.getDeletedSpotIds();
        const cloudSpots = rows
          .filter((r) => !deletedIds.has(r.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category_id || 'General Attraction',
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
          }));

        const local = this.getAllSpots();
        const stagedDrafts = local.filter((s) => s.sync_status === 'staged_local');
        const finalSpots = [...stagedDrafts];
        const addedIds = new Set(finalSpots.map((s) => s.id));

        for (const cs of cloudSpots) {
          if (!addedIds.has(cs.id)) {
            finalSpots.push(cs);
            addedIds.add(cs.id);
          }
        }

        this.saveAllSpots(finalSpots);
        return finalSpots;
      }
    } catch (err) {
      console.warn('Neon Cloud fetch error, using local buffer:', err.message);
    }
    return this.getAllSpots();
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
