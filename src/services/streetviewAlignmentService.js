/**
 * Streetview Line Alignment & Bending Service
 * Enables interactive line bending and re-alignment of Mapillary streetview sequences
 * onto road legends, while preserving 100% full 360 Street View functionality.
 */

const STORAGE_KEY = 'mapillary_aligned_sequences_v1';
const EXCLUDED_STORAGE_KEY = 'mapillary_excluded_sequences_v1';
const EXCLUDED_IMAGES_STORAGE_KEY = 'mapillary_excluded_images_v1';
const NEON_URL_KEY = 'lagangilang_neon_db_url';
const DEFAULT_NEON_URL =
  'postgresql://neondb_owner:npg_NCe0hgVyZ7qx@ep-shy-art-aoq0wgaf-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const MAPILLARY_GRAPH_API = 'https://graph.mapillary.com';
const ACCESS_TOKEN = 'MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9';

// Default excluded sequences (e.g. erratic/unwanted traces like the school-pond campus line)
const DEFAULT_EXCLUDED_SEQUENCES = ['daygfFRm94o2xOpPQNsG0l', '6ILqHDUO8mdl7iJNbfezgn'];

class StreetviewAlignmentService {
  constructor() {
    this.alignedSequences = this.loadLocal();
    this.excludedSequences = this.loadExcludedLocal();
    this.excludedImages = this.loadExcludedImagesLocal();

    // Auto-scrub default excluded sequences from locally cached aligned sequences
    let scrubbed = false;
    for (const seqId of DEFAULT_EXCLUDED_SEQUENCES) {
      if (this.alignedSequences[seqId]) {
        delete this.alignedSequences[seqId];
        scrubbed = true;
      }
    }
    if (scrubbed) {
      this.saveLocal();
    }

    this.syncWithBackend();
    this.syncWithNeon();
  }

  loadLocal() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('Failed to load aligned sequences from localStorage:', e);
      return {};
    }
  }

  saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.alignedSequences));
    } catch (e) {
      console.warn('Failed to save aligned sequences to localStorage:', e);
    }
  }

  loadExcludedLocal() {
    try {
      const data = localStorage.getItem(EXCLUDED_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
      return new Set(DEFAULT_EXCLUDED_SEQUENCES);
    } catch (e) {
      console.warn('Failed to load excluded sequences from localStorage:', e);
      return new Set(DEFAULT_EXCLUDED_SEQUENCES);
    }
  }

  saveExcludedLocal() {
    try {
      localStorage.setItem(
        EXCLUDED_STORAGE_KEY,
        JSON.stringify(Array.from(this.excludedSequences))
      );
    } catch (e) {
      console.warn('Failed to save excluded sequences to localStorage:', e);
    }
  }

  loadExcludedImagesLocal() {
    try {
      const data = localStorage.getItem(EXCLUDED_IMAGES_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
      return new Set();
    } catch (e) {
      console.warn('Failed to load excluded images from localStorage:', e);
      return new Set();
    }
  }

  saveExcludedImagesLocal() {
    try {
      localStorage.setItem(
        EXCLUDED_IMAGES_STORAGE_KEY,
        JSON.stringify(Array.from(this.excludedImages))
      );
    } catch (e) {
      console.warn('Failed to save excluded images to localStorage:', e);
    }
  }

  getExcludedImages() {
    return Array.from(this.excludedImages);
  }

  isImageExcluded(imageId) {
    if (!imageId) return false;
    return this.excludedImages.has(String(imageId));
  }

  excludeImage(imageId) {
    if (!imageId) return;
    const strId = String(imageId);
    this.excludedImages.add(strId);
    this.saveExcludedImagesLocal();
    return this.getExcludedImages();
  }

  restoreImage(imageId) {
    if (!imageId) return;
    const strId = String(imageId);
    this.excludedImages.delete(strId);
    this.saveExcludedImagesLocal();
    return this.getExcludedImages();
  }

  getExcludedSequences() {
    return Array.from(this.excludedSequences);
  }

  isSequenceExcluded(sequenceId) {
    if (!sequenceId) return false;
    return this.excludedSequences.has(String(sequenceId));
  }

  excludeSequence(sequenceId) {
    if (!sequenceId) return;
    const strId = String(sequenceId);
    this.excludedSequences.add(strId);
    this.saveExcludedLocal();

    // If it was aligned, also remove from aligned sequences
    if (this.alignedSequences[strId]) {
      delete this.alignedSequences[strId];
      this.saveLocal();
    }
    return this.getExcludedSequences();
  }

  restoreSequence(sequenceId) {
    if (!sequenceId) return;
    const strId = String(sequenceId);
    this.excludedSequences.delete(strId);
    this.saveExcludedLocal();
    return this.getExcludedSequences();
  }

  async syncWithBackend() {
    // 1. Try Express backend API
    try {
      const res = await fetch('/api/aligned-sequences');
      if (res.ok) {
        const remote = await res.json();
        if (remote && typeof remote === 'object' && Object.keys(remote).length > 0) {
          this.alignedSequences = { ...remote, ...this.alignedSequences };
          this.saveLocal();
        }
      }
    } catch (_) {}

    // 2. Neon PostgreSQL synchronization (real-time cross-device alignment sync)
    await this.syncWithNeon();

    // 3. Fallback for static hosting: load bundled aligned_sequences.json
    try {
      const staticRes = await fetch('/data/aligned_sequences.json');
      if (staticRes.ok) {
        const staticData = await staticRes.json();
        if (staticData && typeof staticData === 'object') {
          let updated = false;
          for (const [seqId, sRecord] of Object.entries(staticData)) {
            if (this.excludedSequences.has(seqId)) continue;
            const localRecord = this.alignedSequences[seqId];
            const localTime = localRecord?.updatedAt || 0;
            const staticTime = sRecord?.updatedAt || 1;
            if (!localRecord || staticTime >= localTime) {
              this.alignedSequences[seqId] = sRecord;
              updated = true;
            }
          }
          if (updated) {
            this.saveLocal();
          }
        }
      }
    } catch (err) {
      console.warn('Fallback aligned sequences load notice:', err);
    }
  }

  async syncWithNeon() {
    try {
      const dbUrl = (typeof localStorage !== 'undefined' && localStorage.getItem(NEON_URL_KEY)) || DEFAULT_NEON_URL;
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(dbUrl);
      const rows = await sql`
        SELECT sequence_id, name, control_points, coordinates, images, updated_at
        FROM public.aligned_sequences
      `;
      if (Array.isArray(rows) && rows.length > 0) {
        let updated = false;
        for (const row of rows) {
          if (!row.sequence_id) continue;
          const localRecord = this.alignedSequences[row.sequence_id];
          const localTime = localRecord?.updatedAt || 0;
          const remoteTime = new Date(row.updated_at || 0).getTime();
          if (!localRecord || remoteTime > localTime) {
            this.alignedSequences[row.sequence_id] = {
              sequenceId: row.sequence_id,
              name: row.name,
              controlPoints: row.control_points,
              coordinates: row.coordinates,
              images: row.images,
              updatedAt: remoteTime,
            };
            updated = true;
          }
        }
        if (updated) {
          this.saveLocal();
        }
      }
    } catch (err) {
      console.warn('Neon aligned_sequences sync notice:', err?.message || err);
    }
  }

  getAlignedSequences() {
    return this.alignedSequences;
  }

  getAlignedSequence(sequenceId) {
    return this.alignedSequences[sequenceId] || null;
  }

  async saveAlignedSequence(sequenceId, data) {
    const record = {
      sequenceId,
      name: data.name || `Aligned Sequence ${sequenceId.slice(0, 8)}`,
      controlPoints: data.controlPoints, // Draggable handle coordinates [[lng, lat], ...]
      coordinates: data.coordinates, // High-res interpolated coordinates [[lng, lat], ...]
      images: data.images, // Array of { id, lat, lng, originalLng, originalLat, alignedHeading }
      updatedAt: Date.now(),
    };

    this.alignedSequences[sequenceId] = record;
    this.saveLocal();

    // 1. Save directly to Neon DB so ALL devices immediately receive it
    try {
      const dbUrl = (typeof localStorage !== 'undefined' && localStorage.getItem(NEON_URL_KEY)) || DEFAULT_NEON_URL;
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(dbUrl);
      await sql`
        INSERT INTO public.aligned_sequences (sequence_id, name, control_points, coordinates, images, updated_at)
        VALUES (${sequenceId}, ${record.name}, ${JSON.stringify(record.controlPoints || [])}::jsonb, ${JSON.stringify(record.coordinates || [])}::jsonb, ${JSON.stringify(record.images || [])}::jsonb, NOW())
        ON CONFLICT (sequence_id) DO UPDATE SET
          name = EXCLUDED.name,
          control_points = EXCLUDED.control_points,
          coordinates = EXCLUDED.coordinates,
          images = EXCLUDED.images,
          updated_at = NOW();
      `;
    } catch (neonErr) {
      console.warn('Neon save aligned sequence notice:', neonErr?.message || neonErr);
    }

    // 2. Mirror to Express backend if available
    try {
      await fetch('/api/aligned-sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch (_) {}

    return record;
  }

  async deleteAlignedSequence(sequenceId) {
    delete this.alignedSequences[sequenceId];
    this.saveLocal();

    try {
      const dbUrl = (typeof localStorage !== 'undefined' && localStorage.getItem(NEON_URL_KEY)) || DEFAULT_NEON_URL;
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(dbUrl);
      await sql`DELETE FROM public.aligned_sequences WHERE sequence_id = ${sequenceId}`;
    } catch (_) {}

    try {
      await fetch(`/api/aligned-sequences/${encodeURIComponent(sequenceId)}`, {
        method: 'DELETE',
      });
    } catch (_) {}
  }

  /**
   * Convert all saved aligned sequences to a MapLibre GeoJSON FeatureCollection
   */
  toGeoJSON() {
    const features = [];
    for (const [seqId, data] of Object.entries(this.alignedSequences)) {
      if (this.isSequenceExcluded(seqId)) continue;
      if (!data.coordinates || data.coordinates.length < 2) continue;
      features.push({
        type: 'Feature',
        id: seqId,
        properties: {
          sequenceId: seqId,
          name: data.name,
          pointCount: data.coordinates.length,
          imageCount: data.images ? data.images.length : 0,
          isAligned: true,
        },
        geometry: {
          type: 'LineString',
          coordinates: data.coordinates,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  /**
   * Fetch a specific Mapillary sequence by its exact ID.
   * Directly fetches all sequence photos from start to finish via sequence_ids,
   * guaranteeing complete end-to-end connectivity on both desktop and mobile.
   */
  async fetchSequenceById(sequenceId, lat = null, lng = null) {
    if (!sequenceId) throw new Error('Missing sequence ID');

    // 1. Fetch complete sequence imagery from Mapillary Graph API via sequence_ids
    let fullImages = [];
    try {
      const seqUrl = `${MAPILLARY_GRAPH_API}/images?sequence_ids=${encodeURIComponent(sequenceId)}&access_token=${ACCESS_TOKEN}&fields=id,geometry,compass_angle,captured_at&limit=2000`;
      const seqRes = await fetch(seqUrl);
      if (seqRes.ok) {
        const seqData = await seqRes.json();
        if (Array.isArray(seqData.data) && seqData.data.length > 0) {
          fullImages = seqData.data
            .filter((img) => img.geometry?.coordinates)
            .map((img) => ({
              id: String(img.id),
              lng: img.geometry.coordinates[0],
              lat: img.geometry.coordinates[1],
              originalLng: img.geometry.coordinates[0],
              originalLat: img.geometry.coordinates[1],
              capturedAt: img.captured_at,
              heading: img.compass_angle,
            }));
        }
      }
    } catch (e) {
      console.warn('Mapillary sequence_ids query warning:', e);
    }

    // Fallback: If sequence_ids query was empty, try bbox search
    if (fullImages.length === 0) {
      try {
        const centerLat = lat || 17.611;
        const centerLng = lng || 120.738;
        const delta = 0.04;
        const bboxUrl = `${MAPILLARY_GRAPH_API}/images?access_token=${ACCESS_TOKEN}&fields=id,geometry,sequence,captured_at,compass_angle&bbox=${centerLng - delta},${centerLat - delta},${centerLng + delta},${centerLat + delta}&limit=2000`;
        const bboxRes = await fetch(bboxUrl);
        if (bboxRes.ok) {
          const bboxData = await bboxRes.json();
          fullImages = (bboxData.data || [])
            .filter((img) => img.sequence === sequenceId && img.geometry?.coordinates)
            .map((img) => ({
              id: String(img.id),
              lng: img.geometry.coordinates[0],
              lat: img.geometry.coordinates[1],
              originalLng: img.geometry.coordinates[0],
              originalLat: img.geometry.coordinates[1],
              capturedAt: img.captured_at,
              heading: img.compass_angle,
            }));
        }
      } catch (err) {
        console.warn('Mapillary bbox query fallback warning:', err);
      }
    }

    // Check if already aligned in local storage / memory
    const existing = this.alignedSequences[sequenceId];
    if (existing && existing.controlPoints && existing.coordinates && existing.images) {
      return {
        sequenceId,
        name: existing.name || `Sequence ${sequenceId.slice(0, 8)}`,
        images: existing.images,
        rawCoordinates: existing.images.map((i) => [i.originalLng || i.lng, i.originalLat || i.lat]),
        controlPoints: existing.controlPoints,
        coordinates: existing.coordinates,
        isAlreadyAligned: true,
      };
    }

    if (fullImages.length === 0) {
      throw new Error(`Could not load images for sequence ${sequenceId}`);
    }

    // Sort chronologically by capture timestamp
    fullImages.sort((a, b) => a.capturedAt - b.capturedAt);
    const rawCoordinates = fullImages.map((img) => [img.lng, img.lat]);

    // Generate initial control handles (between 6 and 14 evenly spaced points)
    const handleCount = Math.max(6, Math.min(14, Math.ceil(rawCoordinates.length / 8)));
    const controlPoints = [];
    const step = (rawCoordinates.length - 1) / (handleCount - 1);

    for (let i = 0; i < handleCount; i++) {
      const idx = Math.min(rawCoordinates.length - 1, Math.round(i * step));
      controlPoints.push([...rawCoordinates[idx]]);
    }

    return {
      sequenceId,
      name: `Sequence ${sequenceId.slice(0, 8)}`,
      images: fullImages,
      rawCoordinates,
      controlPoints,
      isAlreadyAligned: false,
    };
  }

  /**
   * Fetch sequence images and raw geometry from Mapillary near a coordinate.
   * If preferredSequenceId is provided, strictly loads that sequence.
   */
  async fetchNearbySequence(lat, lng, preferredSequenceId = null) {
    if (preferredSequenceId) {
      return this.fetchSequenceById(preferredSequenceId, lat, lng);
    }

    const delta = 0.02;
    const url = `${MAPILLARY_GRAPH_API}/images?access_token=${ACCESS_TOKEN}&fields=id,geometry,sequence,captured_at,compass_angle&bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}&limit=1000`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapillary API error: ${res.status}`);

    const data = await res.json();
    const images = data.data || [];
    if (images.length === 0) {
      throw new Error('No Mapillary sequences found near this location.');
    }

    // Group images by sequence
    const sequences = {};
    for (const img of images) {
      if (!img.sequence || !img.geometry?.coordinates) continue;
      sequences[img.sequence] = sequences[img.sequence] || [];
      sequences[img.sequence].push({
        id: String(img.id),
        lng: img.geometry.coordinates[0],
        lat: img.geometry.coordinates[1],
        originalLng: img.geometry.coordinates[0],
        originalLat: img.geometry.coordinates[1],
        capturedAt: img.captured_at,
        heading: img.compass_angle,
      });
    }

    // Filter out tiny stray sequences with fewer than 5 images if larger sequences exist
    const candidateEntries = Object.entries(sequences);
    const validEntries = candidateEntries.filter(([_, seqImgs]) => seqImgs.length >= 5);
    const entriesToSearch = validEntries.length > 0 ? validEntries : candidateEntries;

    // Find the sequence closest to the click coordinate
    let closestSeq = null;
    let minDistance = Infinity;

    for (const [seqId, seqImages] of entriesToSearch) {
      for (const img of seqImages) {
        const d = Math.hypot(img.lat - lat, img.lng - lng);
        if (d < minDistance) {
          minDistance = d;
          closestSeq = seqId;
        }
      }
    }

    if (!closestSeq) {
      throw new Error('Could not identify a Mapillary sequence at this point.');
    }

    return this.fetchSequenceById(closestSeq, lat, lng);
  }

  /**
   * Calculate forward compass bearing (0-360 deg) between two coordinates
   */
  calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return Math.round((toDeg(Math.atan2(y, x)) + 360) % 360);
  }

  /**
   * Given control points, generates a smooth high-density path and maps
   * sequence images proportionally along the bent path.
   * Also computes the forward tangent curve bearing for every image.
   */
  generateBentGeometry(controlPoints, images) {
    if (!controlPoints || controlPoints.length < 2) {
      return { coordinates: [], mappedImages: [] };
    }

    // Generate interpolated line coordinates
    const coordinates = this.interpolatePath(controlPoints, Math.max(50, images.length * 2));

    // Distribute images proportionally along the bent path so clicking anywhere on the line
    // maps directly to a valid Mapillary image
    const mappedImages = images.map((img, index) => {
      const fraction = images.length > 1 ? index / (images.length - 1) : 0;
      const coordIdx = Math.min(coordinates.length - 1, Math.round(fraction * (coordinates.length - 1)));
      const [bentLng, bentLat] = coordinates[coordIdx];

      // Calculate forward curve tangent heading along the bent road
      let alignedHeading = img.heading || 0;
      if (coordinates.length >= 2) {
        if (coordIdx < coordinates.length - 1) {
          const [nextLng, nextLat] = coordinates[coordIdx + 1];
          alignedHeading = this.calculateBearing(bentLat, bentLng, nextLat, nextLng);
        } else if (coordIdx > 0) {
          const [prevLng, prevLat] = coordinates[coordIdx - 1];
          alignedHeading = this.calculateBearing(prevLat, prevLng, bentLat, bentLng);
        }
      }

      return {
        ...img,
        lat: bentLat,
        lng: bentLng,
        alignedHeading,
      };
    });

    return {
      coordinates,
      mappedImages,
    };
  }

  /**
   * Piecewise Catmull-Rom or smooth interpolation along control points
   */
  interpolatePath(points, targetCount) {
    if (points.length <= 2) return points;

    const result = [];
    const segments = points.length - 1;
    const pointsPerSegment = Math.max(4, Math.floor(targetCount / segments));

    for (let i = 0; i < segments; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      for (let t = 0; t <= pointsPerSegment; t++) {
        if (i > 0 && t === 0) continue; // Avoid duplicate joining points
        const u = t / pointsPerSegment;
        const u2 = u * u;
        const u3 = u2 * u;

        // Catmull-Rom spline interpolation
        const x =
          0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * u +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3);

        const y =
          0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * u +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);

        result.push([x, y]);
      }
    }

    return result;
  }

  /**
   * Find the closest Mapillary image ID along an aligned sequence to a clicked point.
   */
  findClosestImage(sequenceId, lat, lng) {
    const aligned = this.alignedSequences[sequenceId];
    if (!aligned || !aligned.images || aligned.images.length === 0) return null;

    let closest = null;
    let minD = Infinity;

    for (const img of aligned.images) {
      const d = Math.hypot(img.lat - lat, img.lng - lng);
      if (d < minD) {
        minD = d;
        closest = img;
      }
    }

    return closest;
  }

  /**
   * Find the aligned coordinate, curve heading, and sequential navigation links
   * for a specific Mapillary image ID across all active aligned sequences.
   */
  getAlignedPositionForImage(imageId) {
    if (!imageId) return null;
    const strId = String(imageId);
    if (this.isImageExcluded(strId)) return null;
    for (const [seqId, aligned] of Object.entries(this.alignedSequences)) {
      if (this.isSequenceExcluded(seqId)) continue;
      if (!Array.isArray(aligned.images)) continue;
      const foundIdx = aligned.images.findIndex((img) => String(img.id) === strId);
      if (foundIdx !== -1) {
        const found = aligned.images[foundIdx];
        return {
          lat: found.lat,
          lng: found.lng,
          heading: found.alignedHeading ?? found.heading,
          sequenceId: seqId,
          imageIndex: foundIdx,
          totalImages: aligned.images.length,
          nextImageId: foundIdx < aligned.images.length - 1 ? String(aligned.images[foundIdx + 1].id) : null,
          prevImageId: foundIdx > 0 ? String(aligned.images[foundIdx - 1].id) : null,
          isAligned: true,
        };
      }
    }
    return null;
  }
}

export const streetviewAlignmentService = new StreetviewAlignmentService();
export default streetviewAlignmentService;
