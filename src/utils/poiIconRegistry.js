import { THEMES } from '../components/PseudoImage';

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

export const PIN_CATEGORY_THEMES = {
  // 🌟 Gold / Amber: Tourist Spots, Heritage, Culture, Nature & Religious Sites
  tourist: {
    bg: '#F59E0B',
    border: '#B45309',
    glow: 'rgba(245, 158, 11, 0.45)',
    label: 'Tourist Spot / Heritage',
    color: '#F59E0B',
    pinClass: 'pin-heritage',
  },
  heritage: {
    bg: '#F59E0B',
    border: '#B45309',
    glow: 'rgba(245, 158, 11, 0.45)',
    label: 'Heritage & Religious',
    color: '#F59E0B',
    pinClass: 'pin-heritage',
  },

  // 🏛️ Crimson Red: Government Offices, Police, Fire, RHU Health & Emergency Hotlines
  government: {
    bg: '#DC2626',
    border: '#991B1B',
    glow: 'rgba(220, 38, 38, 0.45)',
    label: 'Government / Emergency',
    color: '#DC2626',
    pinClass: 'pin-emergency',
  },
  hotline: {
    bg: '#DC2626',
    border: '#991B1B',
    glow: 'rgba(220, 38, 38, 0.45)',
    label: 'Emergency Hotline',
    color: '#DC2626',
    pinClass: 'pin-emergency',
  },

  // 🌲 Forest Green: DENR Environmental Checkpoints & Ranger Stations
  denr_checkpoint: {
    bg: '#15803D',
    border: '#14532D',
    glow: 'rgba(21, 128, 61, 0.45)',
    label: 'DENR Checkpoint',
    color: '#15803D',
    pinClass: 'pin-checkpoint',
  },

  // 🏦 Emerald Green: Bank & ATM / Financial Services
  bank: {
    bg: '#059669',
    border: '#047857',
    glow: 'rgba(5, 150, 105, 0.45)',
    label: 'Bank & ATM',
    color: '#10B981',
    pinClass: 'pin-bank',
  },

  // ☕ Terracotta / Warm Orange: Cafes, Bakeries & Eateries
  cafe: {
    bg: '#EA580C',
    border: '#9A3412',
    glow: 'rgba(234, 88, 12, 0.45)',
    label: 'Cafe & Bakery',
    color: '#EA580C',
    pinClass: 'pin-cafe',
  },
  eatery: {
    bg: '#EA580C',
    border: '#9A3412',
    glow: 'rgba(234, 88, 12, 0.45)',
    label: 'Local Eatery',
    color: '#EA580C',
    pinClass: 'pin-cafe',
  },

  // 🚌 Sky / Royal Blue: Transit Terminals, Commercial POIs, Water & Gas Stations
  terminal: {
    bg: '#0284C7',
    border: '#0369A1',
    glow: 'rgba(2, 132, 199, 0.45)',
    label: 'Transit Terminal',
    color: '#0284C7',
    pinClass: 'pin-service',
  },
  commercial: {
    bg: '#0284C7',
    border: '#0369A1',
    glow: 'rgba(2, 132, 199, 0.45)',
    label: 'Commercial Service',
    color: '#0284C7',
    pinClass: 'pin-service',
  },
};

export const POI_COLOR_PALETTE = {
  checkpoint: {
    bg: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
    color: '#15803d',
    border: '#4ade80',
    shadow: 'rgba(22, 101, 52, 0.7)',
    pulse: true,
  },
  emergency: {
    bg: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
    color: '#dc2626',
    border: '#f87171',
    shadow: 'rgba(220, 38, 38, 0.7)',
    pulse: true,
  },
  heritage: {
    bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    color: '#f59e0b',
    border: '#b45309',
    shadow: 'rgba(245, 158, 11, 0.7)',
  },
  cafe: {
    bg: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
    color: '#ea580c',
    border: '#fb923c',
    shadow: 'rgba(234, 88, 12, 0.6)',
  },
  nature: {
    bg: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
    color: '#0d9488',
    border: '#5eead4',
    shadow: 'rgba(13, 148, 136, 0.6)',
  },
  civic: {
    bg: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    color: '#d97706',
    border: '#fcd34d',
    shadow: 'rgba(217, 119, 6, 0.6)',
  },
  bank: {
    bg: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    color: '#10b981',
    border: '#6ee7b7',
    shadow: 'rgba(16, 185, 129, 0.6)',
  },
  service: {
    bg: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    color: '#0284c7',
    border: '#7dd3fc',
    shadow: 'rgba(2, 132, 199, 0.6)',
  },
};

/**
 * Canonical Pin Theme resolver: maps any item (POI, Tourist Spot, Hotline) to its standardized palette
 */
export function getPinTheme(item = {}) {
  if (item.customColor) {
    return {
      bg: item.customColor,
      border: '#334155',
      glow: 'rgba(0,0,0,0.2)',
      color: item.customColor,
      pinClass: 'pin-custom',
      label: item.category || 'Custom Location',
    };
  }

  const rawCat = (item.category || item.type || '').toLowerCase();
  const rawName = (item.name || '').toLowerCase();
  const spotType = (item.spotType || '').toLowerCase();

  // 1. Government & Emergency Hotlines (PNP, BFP, RHU, MDRRMO, Municipal Hall, Barangay Hall) -> Crimson Red
  if (
    rawCat.includes('government') ||
    rawCat.includes('hotline') ||
    rawCat.includes('police') ||
    rawCat.includes('pnp') ||
    rawCat.includes('fire') ||
    rawCat.includes('bfp') ||
    rawCat.includes('rhu') ||
    rawCat.includes('mdrrmo') ||
    rawCat.includes('rescue') ||
    rawCat.includes('emergency') ||
    rawCat.includes('hospital') ||
    rawCat.includes('health') ||
    rawName.includes('police') ||
    rawName.includes('pnp') ||
    rawName.includes('fire') ||
    rawName.includes('bfp') ||
    rawName.includes('rhu') ||
    rawName.includes('mdrrmo') ||
    rawName.includes('municipal hall') ||
    rawName.includes('barangay hall') ||
    rawName.includes('presidencia') ||
    rawName.includes('gymnasium')
  ) {
    return PIN_CATEGORY_THEMES.government;
  }

  // 2. DENR Environmental Checkpoints & Ranger Stations -> Forest Green
  if (
    item.isCheckpoint ||
    rawCat.includes('denr') ||
    rawCat.includes('checkpoint') ||
    rawName.includes('checkpoint') ||
    rawName.includes('denr')
  ) {
    return PIN_CATEGORY_THEMES.denr_checkpoint;
  }

  // 3. Bank & ATM / Financial Services (e.g. Landbank ATM) -> Emerald Green
  if (
    rawCat.includes('bank') ||
    rawCat.includes('atm') ||
    rawCat.includes('finance') ||
    rawName.includes('bank') ||
    rawName.includes('atm') ||
    rawName.includes('landbank')
  ) {
    return PIN_CATEGORY_THEMES.bank;
  }

  // 4. Cafes, Bakeries & Eateries -> Terracotta / Warm Orange
  if (
    rawCat.includes('cafe') ||
    rawCat.includes('bakery') ||
    rawCat.includes('coffee') ||
    rawCat.includes('eatery') ||
    rawCat.includes('carinderia') ||
    rawCat.includes('dining') ||
    rawCat.includes('restaurant') ||
    rawName.includes('cafe') ||
    rawName.includes('kape') ||
    rawName.includes('bakery') ||
    rawName.includes('eatery')
  ) {
    return PIN_CATEGORY_THEMES.cafe;
  }

  // 5. Tourist Spots, Heritage, Nature, Caves & Religious Sites (Holy Cross Parish, Quirsodan Dam, Ugiao River) -> Gold / Amber
  if (
    spotType === 'tourist_spot' ||
    item.isTouristSpot ||
    rawCat.includes('tourist') ||
    rawCat.includes('heritage') ||
    rawCat.includes('history') ||
    rawCat.includes('religious') ||
    rawCat.includes('church') ||
    rawCat.includes('parish') ||
    rawCat.includes('nature') ||
    rawCat.includes('eco-tourism') ||
    rawCat.includes('cave') ||
    rawCat.includes('river') ||
    rawCat.includes('viewpoint') ||
    rawCat.includes('overlook') ||
    rawCat.includes('waterfall') ||
    rawCat.includes('spring') ||
    rawCat.includes('trekking') ||
    rawCat.includes('trail') ||
    rawCat.includes('adventure') ||
    rawCat.includes('handicraft') ||
    rawCat.includes('park') ||
    rawCat.includes('spiritual') ||
    rawName.includes('church') ||
    rawName.includes('parish') ||
    rawName.includes('holy cross') ||
    rawName.includes('dam') ||
    rawName.includes('cave') ||
    rawName.includes('river') ||
    rawName.includes('falls') ||
    rawName.includes('waterfall') ||
    rawName.includes('spring')
  ) {
    return PIN_CATEGORY_THEMES.tourist;
  }

  // 6. Default: Transit Terminals, Commercial POIs, Gas, Water Refill -> Sky Blue
  return PIN_CATEGORY_THEMES.terminal;
}

/**
 * Determine classification and canonical visuals for any spot or hotline.
 * Always respects custom selected icons (customIcon || icon || cardVisualIcon) first!
 */
export function getPoiVisualConfig(spot = {}) {
  const theme = getPinTheme(spot);
  const visual = _resolvePoiVisualConfig(spot, theme);
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
  }
  return visual;
}

function _resolvePoiVisualConfig(spot = {}, theme = null) {
  const activeTheme = theme || getPinTheme(spot);
  const name = (spot.name || '').toLowerCase();
  const cat = (spot.category || spot.type || '').toLowerCase();
  const customSelectedIcon = spot.customIcon || spot.icon || spot.cardVisualIcon || spot.categoryIcon;

  // 1. DENR Environmental Checkpoint
  if (activeTheme === PIN_CATEGORY_THEMES.denr_checkpoint) {
    return {
      typeKey: 'checkpoint',
      pinClass: 'pin-checkpoint',
      icon: customSelectedIcon || '🌲',
      label: spot.category || 'DENR Checkpoint',
      palette: {
        bg: activeTheme.bg,
        color: activeTheme.color,
        border: activeTheme.border,
        shadow: activeTheme.glow,
      },
    };
  }

  // 2. Emergency & Government Services (MDRRMO, Police, Fire, Hospital/RHU, Municipal & Barangay Halls)
  if (activeTheme === PIN_CATEGORY_THEMES.government || activeTheme === PIN_CATEGORY_THEMES.hotline) {
    let icon = '🚨';
    if (name.includes('mdrrmo') || cat.includes('rescue')) icon = '🚑';
    else if (name.includes('police') || cat.includes('police') || name.includes('pnp')) icon = '👮';
    else if (name.includes('fire') || cat.includes('fire') || name.includes('bfp')) icon = '🚒';
    else if (name.includes('health') || name.includes('rhu') || cat.includes('medical') || cat.includes('hospital')) icon = '🏥';
    else if (name.includes('hall') || cat.includes('government')) icon = '🏛️';

    return {
      typeKey: 'emergency',
      pinClass: 'pin-emergency',
      icon: customSelectedIcon || icon,
      label: spot.category || 'Government / Emergency Unit',
      palette: {
        bg: activeTheme.bg,
        color: activeTheme.color,
        border: activeTheme.border,
        shadow: activeTheme.glow,
      },
    };
  }

  // 3. Bank & ATM / Financial Services
  if (activeTheme === PIN_CATEGORY_THEMES.bank) {
    return {
      typeKey: 'bank',
      pinClass: 'pin-bank',
      icon: customSelectedIcon || '🏧',
      label: spot.category || 'Bank & ATM',
      palette: {
        bg: activeTheme.bg,
        color: activeTheme.color,
        border: activeTheme.border,
        shadow: activeTheme.glow,
      },
    };
  }

  // 4. Cafe & Bakery / Local Eateries
  if (activeTheme === PIN_CATEGORY_THEMES.cafe || activeTheme === PIN_CATEGORY_THEMES.eatery) {
    let cafeIcon = '☕';
    if (cat.includes('eatery') || cat.includes('carinderia') || cat.includes('dining')) cafeIcon = '🍲';
    return {
      typeKey: 'cafe',
      pinClass: 'pin-cafe',
      icon: customSelectedIcon || cafeIcon,
      label: spot.category || 'Cafe & Bakery',
      palette: {
        bg: activeTheme.bg,
        color: activeTheme.color,
        border: activeTheme.border,
        shadow: activeTheme.glow,
      },
    };
  }

  // 5. Tourist Spots, Historical & Cultural Heritage, Religious & Spiritual Sites
  if (activeTheme === PIN_CATEGORY_THEMES.tourist || activeTheme === PIN_CATEGORY_THEMES.heritage) {
    let icon = '🏛️';
    if (cat.includes('religious') || cat.includes('church') || name.includes('church') || name.includes('parish')) {
      icon = '⛪';
    } else if (cat.includes('cave') || name.includes('cave')) {
      icon = '🧗';
    } else if (cat.includes('waterfall') || cat.includes('river') || cat.includes('spring') || name.includes('river') || name.includes('dam')) {
      icon = '🌊';
    } else if (cat.includes('viewpoint') || cat.includes('overlook')) {
      icon = '🌄';
    } else if (name.includes('university') || name.includes('school')) {
      icon = '🏫';
    }

    return {
      typeKey: 'heritage',
      pinClass: 'pin-heritage',
      icon: customSelectedIcon || icon,
      label: spot.category || 'Tourist & Heritage Landmark',
      palette: {
        bg: activeTheme.bg,
        color: activeTheme.color,
        border: activeTheme.border,
        shadow: activeTheme.glow,
      },
    };
  }

  // 6. Terminals, Transport, Campus & Local Services (Sky Blue)
  let serviceIcon = '📍';
  if (cat.includes('school') || cat.includes('campus') || name.includes('university') || name.includes('school')) serviceIcon = '🏫';
  else if (cat.includes('transport') || cat.includes('terminal') || name.includes('terminal')) serviceIcon = '🚌';
  else if (cat.includes('gas') || name.includes('gas')) serviceIcon = '⛽';
  else if (name.includes('water')) serviceIcon = '💧';
  else if (cat.includes('store') || cat.includes('market') || cat.includes('convenience')) serviceIcon = '🛒';
  else if (cat.includes('hotel')) serviceIcon = '🏨';

  return {
    typeKey: 'service',
    pinClass: 'pin-service',
    icon: customSelectedIcon || serviceIcon,
    label: spot.category || 'Public Service & POI',
    palette: {
      bg: activeTheme.bg,
      color: activeTheme.color,
      border: activeTheme.border,
      shadow: activeTheme.glow,
    },
  };
}

/**
 * Generate standard HTML for a teardrop map pin badge
 */
export function renderTeardropPinHtml(spot, options = {}) {
  const config = getPoiVisualConfig(spot);
  const theme = config.theme || getPinTheme(spot);
  const size = options.size || 30;
  const showLabel = options.showLabel !== false;
  const isDragging = options.isDragging || false;
  
  const pinBg = theme.bg || config.palette?.bg || '#0284c7';
  const pinBorder = theme.border || config.palette?.border || '#ffffff';
  const pinGlow = theme.glow || config.palette?.shadow;

  const customPinStyle = `background: ${pinBg} !important; border-color: ${pinBorder} !important; ${
    pinGlow ? `box-shadow: 0 4px 14px ${pinGlow} !important;` : ''
  }`;

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
