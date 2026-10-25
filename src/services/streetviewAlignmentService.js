/**
 * Streetview Line Alignment & Bending Service
 * Enables interactive line bending and re-alignment of Mapillary streetview sequences
 * onto road legends, while preserving 100% full 360 Street View functionality.
 */

const STORAGE_KEY = 'mapillary_aligned_sequences_v1';
const MAPILLARY_GRAPH_API = 'https://graph.mapillary.com';
const ACCESS_TOKEN = 'MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9';

class StreetviewAlignmentService {
  constructor() {
    this.alignedSequences = this.loadLocal();
    this.syncWithBackend();
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

  async syncWithBackend() {
    try {
      const res = await fetch('/api/aligned-sequences');
      if (res.ok) {
        const remote = await res.json();
        if (remote && typeof remote === 'object') {
          this.alignedSequences = { ...remote, ...this.alignedSequences };
          this.saveLocal();
        }
      }
    } catch (_) {
      // Backend not running or offline; local storage is authoritative
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
      images: data.images, // Array of { id, lat, lng, originalLng, originalLat }
      updatedAt: Date.now(),
    };

    this.alignedSequences[sequenceId] = record;
    this.saveLocal();

    // Mirror to backend if available
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
   * Fetch sequence images and raw geometry from Mapillary near a coordinate.
   */
  async fetchNearbySequence(lat, lng) {
    const delta = 0.015;
    const url = `${MAPILLARY_GRAPH_API}/images?access_token=${ACCESS_TOKEN}&fields=id,geometry,sequence,captured_at,compass_angle&bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}&limit=500`;

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

    // Find the sequence closest to the click coordinate
    let closestSeq = null;
    let minDistance = Infinity;

    for (const [seqId, seqImages] of Object.entries(sequences)) {
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

    // Sort images by capture timestamp
    const sortedImages = sequences[closestSeq].sort((a, b) => a.capturedAt - b.capturedAt);
    const rawCoordinates = sortedImages.map((img) => [img.lng, img.lat]);

    // Generate initial control handles (between 6 and 14 evenly spaced points)
    const handleCount = Math.max(6, Math.min(14, Math.ceil(rawCoordinates.length / 8)));
    const controlPoints = [];
    const step = (rawCoordinates.length - 1) / (handleCount - 1);

    for (let i = 0; i < handleCount; i++) {
      const idx = Math.min(rawCoordinates.length - 1, Math.round(i * step));
      controlPoints.push([...rawCoordinates[idx]]);
    }

    return {
      sequenceId: closestSeq,
      images: sortedImages,
      rawCoordinates,
      controlPoints,
    };
  }

  /**
   * Given control points, generates a smooth high-density path and maps
   * sequence images proportionally along the bent path.
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

      return {
        ...img,
        lat: bentLat,
        lng: bentLng,
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
}

export const streetviewAlignmentService = new StreetviewAlignmentService();
export default streetviewAlignmentService;
