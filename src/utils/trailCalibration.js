/**
 * Trail Calibration & Selective Alignment Utilities for Mapillary API
 * Supports granular, per-sequence and per-upload line adjustments to match
 * OpenStreetMap road legends and custom road geometry.
 */

// Primary sequence for the University of Abra (UA) Campus Gate & Access Road
export const DEFAULT_CAMPUS_SEQUENCE_ID = 'EsCxkvd59mpZD3iqzoyFjM';
export const CAMPUS_GATE_IMAGE_ID = '1532761357806896';

// Road centerline offset for University of Abra campus access road (aligned directly on road)
export const DEFAULT_CAMPUS_OFFSET = { x: 0, y: 0 };

/**
 * Predefined list of known sequence captures in the Lagangilang area
 * with user-friendly titles, icons, and capture types.
 */
export const KNOWN_SEQUENCES = [
  {
    id: 'EsCxkvd59mpZD3iqzoyFjM',
    altImageId: '1532761357806896',
    name: 'UA Campus Access Road & Gate',
    subtitle: '15 360° captures • Campus Entrance Road',
    icon: '🏫',
    defaultOffset: { x: 0, y: 0 },
    type: 'foot',
  },
  {
    id: '6ILqHDUO8mdl7iJNbfezgn',
    name: 'UA Campus Interior Grounds',
    subtitle: '152 360° captures • Campus Pathways',
    icon: '🎓',
    defaultOffset: { x: 0, y: 0 },
    type: 'foot',
  },
  {
    id: 'daygfFRm94o2xOpPQNsG0l',
    name: 'Abra-Kalinga National Highway (Oct 24)',
    subtitle: '162 360° captures • Main Road Vehicle',
    icon: '🚗',
    defaultOffset: { x: 0, y: 0 },
    type: 'vehicle',
  },
  {
    id: 'PQvElJ06hLpmqZbVuDt4Ta',
    name: 'Poblacion & Town Hall Walking Trail',
    subtitle: '178 360° captures • Municipal Center',
    icon: '🚶',
    defaultOffset: { x: 0, y: 0 },
    type: 'foot',
  },
  {
    id: 'sJAgwIHy2j8YUZiXNQ3zSl',
    name: 'Abra-Kalinga Highway (Oct 21)',
    subtitle: '142 360° captures • Highway South',
    icon: '🛣️',
    defaultOffset: { x: 0, y: 0 },
    type: 'vehicle',
  },
  {
    id: '0nzuI4MYjPhJsDCNdkovp3',
    name: 'Lagangilang Municipal Road (Oct 24)',
    subtitle: '139 360° captures • Vehicle',
    icon: '🚙',
    defaultOffset: { x: 0, y: 0 },
    type: 'vehicle',
  },
];

const STORAGE_KEY = 'lagangilang_sequence_offsets';

/**
 * Normalize sequence IDs: maps image ID 1532761357806896 to the campus sequence key.
 */
export function normalizeSequenceId(id) {
  if (!id) return DEFAULT_CAMPUS_SEQUENCE_ID;
  const s = String(id).trim();
  if (s === CAMPUS_GATE_IMAGE_ID || s === '1532761357806896') {
    return DEFAULT_CAMPUS_SEQUENCE_ID;
  }
  return s;
}

/**
 * Retrieve saved sequence offsets from localStorage, with backward-compatibility.
 */
export function getSavedSequenceOffsets() {
  const defaultOffsets = {
    [DEFAULT_CAMPUS_SEQUENCE_ID]: { x: 0, y: 0 },
    '6ILqHDUO8mdl7iJNbfezgn': { x: 0, y: 0 },
    global: { x: 0, y: 0 },
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // If legacy -24 offset was saved, reset to 0 so it aligns to the road
      if (parsed[DEFAULT_CAMPUS_SEQUENCE_ID]?.x === -24) {
        parsed[DEFAULT_CAMPUS_SEQUENCE_ID] = { x: 0, y: 0 };
      }
      return { ...defaultOffsets, ...parsed };
    }

    // Check legacy storage keys
    const legacyX = localStorage.getItem('lagangilang_mapillary_offset_x');
    const legacyY = localStorage.getItem('lagangilang_mapillary_offset_y');
    if (legacyX !== null && legacyY !== null) {
      const x = parseFloat(legacyX);
      const y = parseFloat(legacyY);
      // Reset legacy -24 to 0 so the road and dots align
      const legacyOffset = (x === -24) ? { x: 0, y: 0 } : { x, y };
      defaultOffsets[DEFAULT_CAMPUS_SEQUENCE_ID] = legacyOffset;
      defaultOffsets['6ILqHDUO8mdl7iJNbfezgn'] = legacyOffset;
    }
  } catch {
    // fallback to defaults
  }

  return defaultOffsets;
}

/**
 * Save updated sequence offsets dictionary to localStorage.
 */
export function saveSequenceOffsets(offsets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offsets));
    // Also save active campus offset to legacy keys for older consumers
    const campusOffset = offsets[DEFAULT_CAMPUS_SEQUENCE_ID] || DEFAULT_CAMPUS_OFFSET;
    localStorage.setItem('lagangilang_mapillary_offset_x', String(campusOffset.x));
    localStorage.setItem('lagangilang_mapillary_offset_y', String(campusOffset.y));
  } catch (err) {
    console.warn('Failed to save sequence offsets to localStorage:', err);
  }
}

/**
 * Get metadata & display title for a sequence ID.
 */
export function getSequenceMeta(seqId) {
  const normalized = normalizeSequenceId(seqId);
  const found = KNOWN_SEQUENCES.find((k) => k.id === normalized || k.altImageId === normalized);
  if (found) return found;

  return {
    id: normalized,
    name: `Captured Upload (${normalized.slice(0, 8)}...)`,
    subtitle: 'Custom Mapillary Sequence',
    icon: '📍',
    defaultOffset: { x: 0, y: 0 },
    type: 'custom',
  };
}
