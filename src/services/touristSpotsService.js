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

/**
 * Check if a spot is obsolete or deprecated
 */
export function isObsoleteSpot(s) {
  if (!s) return true;
  if (s.id && (s.id.startsWith('spot_') || OBSOLETE_SPOT_IDS.has(s.id))) return true;
  const name = (s.name || '').toLowerCase();
  // Filter out obsolete legacy ASIST (superseded by University of Abra Main Campus)
  if (name.includes('asist') && !name.includes('university of abra')) return true;
  // Filter out obsolete town hall / municipality
  if (name.includes('town hall') || name.includes('municipality') || name.includes('municipal')) return true;
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

        // Normalize legacy typos (e.g. Bawa -> Pawa)
        cleaned.forEach((s) => {
          if (s.barangay === 'Bawa') {
            s.barangay = 'Pawa';
            if (s.location?.address) s.location.address = s.location.address.replace('Bawa', 'Pawa');
            changed = true;
          }

          // Migrate legacy local "pano_..." or small integer IDs to verified Mapillary IDs
          const targetId = s.connected360?.targetId;
          if (
            targetId &&
            (String(targetId).startsWith('pano_') ||
              String(targetId).length < 10 ||
              !/^\d+$/.test(String(targetId)))
          ) {
            const matchedSeed = Array.isArray(seedSpots)
              ? seedSpots.find((seed) => seed.id === s.id)
              : null;
            if (matchedSeed && matchedSeed.connected360?.targetId) {
              s.connected360 = matchedSeed.connected360;
            } else {
              s.connected360 = {
                type: 'mapillary',
                targetId: '1532761357806896', // Fallback to University of Abra Main Campus Gate
                heading: 45,
                pitch: -5,
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
      const sanitized = spots.filter((s) => !isObsoleteSpot(s));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      window.dispatchEvent(new Event('lagangilang_spots_updated'));
    } catch (err) {
      console.error('Failed to save spots to localStorage:', err);
    }
  },

  /**
   * Step 1: Save new spot locally as a staged draft
   */
  saveDraftLocally(spotData, availablePanoramas = []) {
    const all = this.getAllSpots();
    const id = spotData.id || `poi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Resolve 360 panorama connection
    let connected360 = spotData.connected360;
    if (!connected360 || !connected360.targetId) {
      const nearestPano = findNearestPanorama(
        spotData.location.lat,
        spotData.location.lng,
        availablePanoramas
      );
      connected360 = nearestPano
        ? {
            type: 'mapillary',
            targetId: nearestPano.id,
            heading: 0,
            pitch: 0,
            distanceMeters: nearestPano.distanceMeters,
          }
        : {
            type: 'mapillary',
            targetId: '1532761357806896',
            heading: 0,
            pitch: 0,
          };
    }

    const newSpot = {
      ...spotData,
      id,
      sync_status: 'staged_local',
      staged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      connected360,
      isPseudoImage: spotData.isPseudoImage ?? !spotData.image,
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
          await sql`
            INSERT INTO public.tourist_spots (
              id, name, barangay, latitude, longitude, address,
              description, image_url, is_pseudo_image, pseudo_theme,
              primary_pano_id, target_heading, target_pitch, sync_status,
              staged_at, synced_at, updated_at
            ) VALUES (
              ${spot.id},
              ${spot.name},
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
            updated_at: r.updated_at,
          }));

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
              finalSpots.push(cs);
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
