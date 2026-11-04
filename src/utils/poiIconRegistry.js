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

export const POI_COLOR_PALETTE = {
  // DENR Environmental Checkpoints: Forest Green
  checkpoint: {
    bg: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
    color: '#15803d',
    border: '#4ade80',
    shadow: 'rgba(22, 101, 52, 0.7)',
    pulse: true,
  },
  // Government & Emergency Hotlines: Crimson Red
  emergency: {
    bg: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
    color: '#dc2626',
    border: '#f87171',
    shadow: 'rgba(220, 38, 38, 0.7)',
    pulse: true,
  },
  // Tourist Spots, Heritage, Religious Sites & Holy Cross Parish: GOLD / AMBER
  heritage: {
    bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    color: '#f59e0b',
    border: '#b45309',
    shadow: 'rgba(245, 158, 11, 0.7)',
  },
  // Cafe & Bakery / Local Eateries: Warm Terracotta / Orange
  cafe: {
    bg: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
    color: '#ea580c',
    border: '#fb923c',
    shadow: 'rgba(234, 88, 12, 0.6)',
  },
  // Nature & Eco-Tourism (Rivers, Caves, Springs): Emerald / Teal
  nature: {
    bg: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
    color: '#0d9488',
    border: '#5eead4',
    shadow: 'rgba(13, 148, 136, 0.6)',
  },
  // Civic & Public Park
  civic: {
    bg: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    color: '#d97706',
    border: '#fcd34d',
    shadow: 'rgba(217, 119, 6, 0.6)',
  },
  // Terminals, Gas, Water & Commercial POIs: Sky Blue
  service: {
    bg: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    color: '#0284c7',
    border: '#7dd3fc',
    shadow: 'rgba(2, 132, 199, 0.6)',
  },
};

/**
 * Determine classification and canonical visuals for any spot or hotline.
 * Always respects custom selected icons (customIcon || icon || cardVisualIcon) first!
 */
export function getPoiVisualConfig(spot = {}) {
  const name = (spot.name || '').toLowerCase();
  const cat = (spot.category || spot.type || '').toLowerCase();
  const spotType = (spot.spotType || '').toLowerCase();
  const customSelectedIcon = spot.customIcon || spot.icon || spot.cardVisualIcon || spot.categoryIcon;

  // 1. DENR Environmental Checkpoint
  if (
    spot.isCheckpoint ||
    cat.includes('checkpoint') ||
    cat.includes('denr') ||
    name.includes('checkpoint') ||
    name.includes('denr')
  ) {
    return {
      typeKey: 'checkpoint',
      pinClass: 'pin-checkpoint',
      icon: customSelectedIcon || '🌲',
      label: spot.category || 'DENR Checkpoint',
      palette: POI_COLOR_PALETTE.checkpoint,
    };
  }

  // 2. Emergency Services (MDRRMO, Police, Fire, Hospital/RHU, Municipal Hall)
  if (
    cat.includes('emergency') ||
    cat.includes('police') ||
    cat.includes('rescue') ||
    cat.includes('fire') ||
    cat.includes('medical') ||
    cat.includes('hospital') ||
    name.includes('mdrrmo') ||
    name.includes('police') ||
    name.includes('fire') ||
    name.includes('health') ||
    name.includes('rhu')
  ) {
    let icon = '🚨';
    if (name.includes('mdrrmo') || cat.includes('rescue')) icon = '🚑';
    else if (name.includes('police') || cat.includes('police')) icon = '👮';
    else if (name.includes('fire') || cat.includes('fire')) icon = '🚒';
    else if (name.includes('health') || name.includes('rhu') || cat.includes('medical')) icon = '🏥';

    return {
      typeKey: 'emergency',
      pinClass: 'pin-emergency',
      icon: customSelectedIcon || icon,
      label: spot.category || 'Emergency Unit',
      palette: POI_COLOR_PALETTE.emergency,
    };
  }

  // 3. Cafe & Bakery / Local Eateries (Warm Orange #EA580C)
  if (
    cat.includes('cafe') ||
    cat.includes('bakery') ||
    cat.includes('coffee') ||
    name.includes('cafe') ||
    name.includes('kape') ||
    customSelectedIcon === '☕' ||
    customSelectedIcon === '🥤'
  ) {
    return {
      typeKey: 'cafe',
      pinClass: 'pin-cafe',
      icon: customSelectedIcon || '☕',
      label: spot.category || 'Cafe & Bakery',
      palette: POI_COLOR_PALETTE.cafe,
    };
  }

  // 4. Tourist Spots, Historical & Cultural Heritage, Religious & Spiritual Sites (GOLD #F59E0B)
  if (
    cat.includes('heritage') ||
    cat.includes('history') ||
    cat.includes('religious') ||
    cat.includes('church') ||
    cat.includes('parish') ||
    cat.includes('spiritual') ||
    name.includes('church') ||
    name.includes('parish') ||
    name.includes('holy cross') ||
    spotType === 'tourist_spot' ||
    cat.includes('tourist')
  ) {
    let icon = '🏛️';
    if (cat.includes('religious') || cat.includes('church') || name.includes('church') || name.includes('parish')) {
      icon = '⛪';
    } else if (name.includes('university') || name.includes('school')) {
      icon = '🏫';
    }

    return {
      typeKey: 'heritage',
      pinClass: 'pin-heritage',
      icon: customSelectedIcon || icon,
      label: spot.category || 'Tourist & Heritage Landmark',
      palette: POI_COLOR_PALETTE.heritage,
    };
  }

  // 5. Nature & Eco-Tourism (Rivers, Caves, Springs, Mountains, Trails)
  if (
    cat.includes('nature') ||
    cat.includes('adventure') ||
    cat.includes('river') ||
    cat.includes('cave') ||
    cat.includes('spring') ||
    cat.includes('waterfall') ||
    cat.includes('viewpoint')
  ) {
    let icon = '🏞️';
    if (cat.includes('cave') || name.includes('cave')) icon = '🧗';
    else if (cat.includes('spring') || name.includes('spring') || name.includes('river')) icon = '🌊';
    else if (cat.includes('viewpoint')) icon = '🌄';

    return {
      typeKey: 'nature',
      pinClass: 'pin-nature',
      icon: customSelectedIcon || icon,
      label: spot.category || 'Nature & Eco-Tourism',
      palette: POI_COLOR_PALETTE.nature,
    };
  }

  // 6. Terminals, Transport & Local Services (Sky Blue #0284C7)
  let serviceIcon = '📍';
  if (cat.includes('transport') || cat.includes('terminal') || name.includes('terminal')) serviceIcon = '🚌';
  else if (cat.includes('gas') || name.includes('gas')) serviceIcon = '⛽';
  else if (name.includes('water')) serviceIcon = '💧';
  else if (cat.includes('store') || cat.includes('market') || cat.includes('convenience')) serviceIcon = '🛒';
  else if (cat.includes('dining') || cat.includes('eatery')) serviceIcon = '🍲';
  else if (cat.includes('hotel')) serviceIcon = '🏨';

  return {
    typeKey: 'service',
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
  const size = options.size || 30;
  const showLabel = options.showLabel !== false;
  const isDragging = options.isDragging || false;

  return `
    <div class="poi-marker-inner ${config.pinClass} ${isDragging ? 'is-dragging' : ''}">
      <div class="poi-marker-pin ${config.pinClass}" style="width: ${size}px; height: ${size}px;">
        <span class="poi-marker-icon">${config.icon}</span>
      </div>
      ${showLabel ? `<div class="poi-marker-label">${spot.name || 'Spot'}</div>` : ''}
      <div class="poi-marker-tooltip">${config.label}</div>
    </div>
  `;
}
