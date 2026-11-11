import { THEMES } from './themeRegistry.js';

/**
 * Unified POI & Checkpoint Icon Registry
 * 
 * Enforces 100% visual consistency across:
 * - 2D MapLibre pins
 * - Explore Directory cards
 * - Emergency & Hotlines modal
 * - In-App Offline Mode
 * - Standalone Exported HTML Map
 */

// Canonical Pin Color Mapping (Engineering Standard)
export const PIN_CATEGORY_THEMES = {
  // 🌟 Gold / Amber: Tourist Spots, Heritage, Culture, Nature & Religious Sites
  tourist: {
    bg: '#F59E0B',
    border: '#B45309',
    glow: 'rgba(245, 158, 11, 0.45)',
    label: 'Tourist Spot / Heritage',
  },
  heritage: {
    bg: '#F59E0B',
    border: '#B45309',
    glow: 'rgba(245, 158, 11, 0.45)',
    label: 'Heritage & Religious',
  },

  // 🏛️ Crimson Red: Government Offices, Police, Fire, RHU Health & Emergency Hotlines
  government: {
    bg: '#DC2626',
    border: '#991B1B',
    glow: 'rgba(220, 38, 38, 0.45)',
    label: 'Government / Emergency',
  },
  hotline: {
    bg: '#DC2626',
    border: '#991B1B',
    glow: 'rgba(220, 38, 38, 0.45)',
    label: 'Emergency Hotline',
  },

  // 🌲 Forest Green: DENR Environmental Checkpoints & Ranger Stations
  denr_checkpoint: {
    bg: '#15803D',
    border: '#14532D',
    glow: 'rgba(21, 128, 61, 0.45)',
    label: 'DENR Checkpoint',
  },

  // ☕ Terracotta / Warm Orange: Cafes, Bakeries & Eateries
  cafe: {
    bg: '#EA580C',
    border: '#9A3412',
    glow: 'rgba(234, 88, 12, 0.45)',
    label: 'Cafe & Bakery',
  },
  eatery: {
    bg: '#EA580C',
    border: '#9A3412',
    glow: 'rgba(234, 88, 12, 0.45)',
    label: 'Local Eatery',
  },

  // 🚌 Sky / Royal Blue: Transit Terminals, Commercial POIs, Water & Gas Stations
  terminal: {
    bg: '#0284C7',
    border: '#0369A1',
    glow: 'rgba(2, 132, 199, 0.45)',
    label: 'Transit Terminal',
  },
  commercial: {
    bg: '#0284C7',
    border: '#0369A1',
    glow: 'rgba(2, 132, 199, 0.45)',
    label: 'Commercial Service',
  },
};

/**
 * Normalizing Category Lookup (Preventing Accidental Blue Fallbacks)
 */
export function getPinTheme(item = {}) {
  const custom = item.customColor || item.color || item.categoryColor;
  if (custom) {
    return { bg: custom, border: '#334155', glow: 'rgba(0,0,0,0.2)', label: item.category || 'Custom' };
  }

  const rawCat = (item.category || item.type || item.category_id || '').toLowerCase();
  const rawName = (item.name || '').toLowerCase();
  const spotType = (item.spotType || item.spot_type || '').toLowerCase();

  // 1. Government & Emergency Hotlines -> Crimson Red
  if (
    rawCat.includes('government') ||
    rawCat.includes('hotline') ||
    rawCat.includes('police') ||
    rawCat.includes('pnp') ||
    rawCat.includes('bfp') ||
    rawCat.includes('rhu') ||
    rawCat.includes('mdrrmo') ||
    rawCat.includes('rescue') ||
    rawCat.includes('emergency') ||
    rawCat.includes('fire') ||
    rawCat.includes('health') ||
    rawName.includes('police') ||
    rawName.includes('pnp') ||
    rawName.includes('bfp') ||
    rawName.includes('rhu') ||
    rawName.includes('mdrrmo') ||
    rawName.includes('disaster') ||
    rawName.includes('fire station') ||
    rawName.includes('health unit')
  ) {
    return PIN_CATEGORY_THEMES.government;
  }

  // 2. DENR Checkpoints -> Forest Green
  if (
    item.isCheckpoint ||
    rawCat.includes('denr') ||
    rawCat.includes('checkpoint') ||
    rawName.includes('denr') ||
    rawName.includes('checkpoint')
  ) {
    return PIN_CATEGORY_THEMES.denr_checkpoint;
  }

  // 3. Tourist Spots, Heritage & Religious Sites (e.g. Holy Cross Parish) -> Gold / Amber
  if (
    rawCat.includes('tourist') ||
    rawCat.includes('heritage') ||
    rawCat.includes('religious') ||
    rawCat.includes('church') ||
    rawCat.includes('parish') ||
    rawCat.includes('nature') ||
    rawCat.includes('cave') ||
    rawCat.includes('river') ||
    rawCat.includes('viewpoint') ||
    rawCat.includes('adventure') ||
    rawCat.includes('spiritual') ||
    rawCat.includes('history') ||
    rawCat.includes('spring') ||
    rawCat.includes('waterfall') ||
    rawName.includes('holy cross') ||
    rawName.includes('church') ||
    rawName.includes('parish') ||
    rawName.includes('cave') ||
    rawName.includes('river') ||
    rawName.includes('dam') ||
    rawName.includes('falls') ||
    spotType === 'tourist_spot'
  ) {
    return PIN_CATEGORY_THEMES.tourist;
  }

  // 4. Cafes & Bakeries -> Terracotta / Orange
  if (
    rawCat.includes('cafe') ||
    rawCat.includes('bakery') ||
    rawCat.includes('coffee') ||
    rawCat.includes('eatery') ||
    rawCat.includes('carinderia') ||
    rawCat.includes('kape') ||
    rawName.includes('cafe') ||
    rawName.includes('bakery') ||
    rawName.includes('coffee') ||
    rawName.includes('kape')
  ) {
    return PIN_CATEGORY_THEMES.cafe;
  }

  // 5. Default: Terminals & Commercial Services -> Blue
  return PIN_CATEGORY_THEMES.terminal;
}

export const POI_COLOR_PALETTE = {
  checkpoint: {
    bg: '#15803D',
    color: '#15803D',
    border: '#14532D',
    shadow: 'rgba(21, 128, 61, 0.45)',
    pulse: true,
  },
  emergency: {
    bg: '#DC2626',
    color: '#DC2626',
    border: '#991B1B',
    shadow: 'rgba(220, 38, 38, 0.45)',
    pulse: true,
  },
  heritage: {
    bg: '#F59E0B',
    color: '#F59E0B',
    border: '#B45309',
    shadow: 'rgba(245, 158, 11, 0.45)',
  },
  tourist: {
    bg: '#F59E0B',
    color: '#F59E0B',
    border: '#B45309',
    shadow: 'rgba(245, 158, 11, 0.45)',
  },
  cafe: {
    bg: '#EA580C',
    color: '#EA580C',
    border: '#9A3412',
    shadow: 'rgba(234, 88, 12, 0.45)',
  },
  nature: {
    bg: '#F59E0B',
    color: '#F59E0B',
    border: '#B45309',
    shadow: 'rgba(245, 158, 11, 0.45)',
  },
  civic: {
    bg: '#F59E0B',
    color: '#F59E0B',
    border: '#B45309',
    shadow: 'rgba(245, 158, 11, 0.45)',
  },
  bank: {
    bg: '#059669',
    color: '#059669',
    border: '#047857',
    shadow: 'rgba(5, 150, 105, 0.45)',
  },
  service: {
    bg: '#0284C7',
    color: '#0284C7',
    border: '#0369A1',
    shadow: 'rgba(2, 132, 199, 0.45)',
  },
};

/**
 * Determine classification and canonical visuals for any spot or hotline.
 * Always respects custom selected icons (customIcon || icon || cardVisualIcon) first!
 */
export function getPoiVisualConfig(spot = {}) {
  const visual = _resolvePoiVisualConfig(spot);
  const theme = getPinTheme(spot);
  visual.theme = theme;

  if (spot.pseudoTheme && THEMES[spot.pseudoTheme]) {
    const t = THEMES[spot.pseudoTheme];
    visual.palette = {
      ...visual.palette,
      bg: `linear-gradient(135deg, ${t.from} 0%, ${t.to} 100%)`,
      color: t.color || t.to,
      border: t.accent || '#ffffff',
      shadow: 'rgba(0, 0, 0, 0.4)',
    };
  } else {
    visual.palette = {
      bg: theme.bg,
      color: theme.bg,
      border: theme.border,
      shadow: theme.glow,
    };
  }

  return visual;
}

function _resolvePoiVisualConfig(spot = {}) {
  const name = (spot.name || '').toLowerCase();
  const cat = (spot.category || spot.type || '').toLowerCase();
  const customSelectedIcon = spot.customIcon || spot.icon || spot.cardVisualIcon || spot.categoryIcon;
  const theme = getPinTheme(spot);

  // 1. DENR Environmental Checkpoint
  if (theme === PIN_CATEGORY_THEMES.denr_checkpoint) {
    return {
      typeKey: 'checkpoint',
      pinClass: 'pin-checkpoint',
      icon: customSelectedIcon || '🌲',
      label: spot.category || 'DENR Checkpoint',
      palette: POI_COLOR_PALETTE.checkpoint,
    };
  }

  // 2. Emergency Services (MDRRMO, Police, Fire, Hospital/RHU, Municipal Hall, Hotlines)
  if (theme === PIN_CATEGORY_THEMES.government) {
    let icon = '🚨';
    if (name.includes('mdrrmo') || cat.includes('rescue')) icon = '🚑';
    else if (name.includes('police') || cat.includes('police') || cat.includes('pnp')) icon = '👮';
    else if (name.includes('fire') || cat.includes('fire') || cat.includes('bfp')) icon = '🚒';
    else if (name.includes('health') || name.includes('rhu') || cat.includes('medical') || cat.includes('health')) icon = '🏥';
    else if (cat.includes('tourism') || name.includes('tourism')) icon = 'ℹ️';

    return {
      typeKey: 'emergency',
      pinClass: 'pin-emergency',
      icon: customSelectedIcon || icon,
      label: spot.category || 'Government / Emergency',
      palette: POI_COLOR_PALETTE.emergency,
    };
  }

  // 3. Cafe & Bakery / Local Eateries
  if (theme === PIN_CATEGORY_THEMES.cafe) {
    return {
      typeKey: 'cafe',
      pinClass: 'pin-cafe',
      icon: customSelectedIcon || '☕',
      label: spot.category || 'Cafe & Bakery',
      palette: POI_COLOR_PALETTE.cafe,
    };
  }

  // 4. Tourist Spots, Heritage, Culture, Nature & Religious Sites (Gold / Amber #F59E0B)
  if (theme === PIN_CATEGORY_THEMES.tourist) {
    let icon = '🏛️';
    if (
      cat.includes('religious') ||
      cat.includes('church') ||
      cat.includes('parish') ||
      cat.includes('spiritual') ||
      name.includes('church') ||
      name.includes('parish') ||
      name.includes('holy cross')
    ) {
      icon = '⛪';
    } else if (cat.includes('cave') || name.includes('cave')) {
      icon = '🧗';
    } else if (cat.includes('spring') || name.includes('river') || cat.includes('waterfall') || name.includes('falls')) {
      icon = '🌊';
    } else if (cat.includes('viewpoint') || name.includes('viewpoint')) {
      icon = '🌄';
    } else if (cat.includes('adventure') || cat.includes('trail')) {
      icon = '🌉';
    } else if (name.includes('university') || name.includes('school')) {
      icon = '🏫';
    }

    return {
      typeKey: 'tourist',
      pinClass: 'pin-tourist',
      icon: customSelectedIcon || icon,
      label: spot.category || 'Tourist Spot / Heritage',
      palette: POI_COLOR_PALETTE.heritage,
    };
  }

  // 5. Default: Terminals, Gas, Water & Commercial POIs (Sky Blue #0284C7)
  let serviceIcon = '📍';
  if (cat.includes('school') || cat.includes('campus') || name.includes('university') || name.includes('school')) serviceIcon = '🏫';
  else if (cat.includes('transport') || cat.includes('terminal') || name.includes('terminal')) serviceIcon = '🚌';
  else if (cat.includes('gas') || name.includes('gas')) serviceIcon = '⛽';
  else if (name.includes('water')) serviceIcon = '💧';
  else if (cat.includes('store') || cat.includes('market') || cat.includes('convenience')) serviceIcon = '🛒';
  else if (cat.includes('hotel')) serviceIcon = '🏨';
  else if (cat.includes('bank') || name.includes('bank') || name.includes('atm')) serviceIcon = '🏧';

  return {
    typeKey: 'terminal',
    pinClass: 'pin-service',
    icon: customSelectedIcon || serviceIcon,
    label: spot.category || 'Public Service & POI',
    palette: POI_COLOR_PALETTE.service,
  };
}

/**
 * Generate standard HTML for a teardrop map pin badge
 */
export function renderTeardropPinHtml(spot, options = {}) {
  const config = getPoiVisualConfig(spot);
  const theme = getPinTheme(spot);
  const size = options.size || 30;
  const showLabel = options.showLabel !== false;
  const isDragging = options.isDragging || false;
  const customPinStyle = `background: ${theme.bg} !important; border-color: ${theme.border} !important; box-shadow: 0 4px 14px ${theme.glow} !important;`;

  return `
    <div class="poi-marker-inner ${config.pinClass} ${isDragging ? 'is-dragging' : ''}">
      <div class="poi-marker-pin ${config.pinClass}" style="width: ${size}px; height: ${size}px; ${customPinStyle}">
        <span class="poi-marker-icon">${config.icon}</span>
      </div>
      ${showLabel ? `<div class="poi-marker-label">${spot.name || 'Spot'}</div>` : ''}
      <div class="poi-marker-tooltip">${config.label}</div>
    </div>
  `;
}
