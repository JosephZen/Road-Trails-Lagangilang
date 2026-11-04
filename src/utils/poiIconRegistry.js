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
  nature: {
    bg: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
    color: '#0d9488',
    border: '#5eead4',
    shadow: 'rgba(13, 148, 136, 0.6)',
  },
  heritage: {
    bg: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    color: '#2563eb',
    border: '#93c5fd',
    shadow: 'rgba(37, 99, 235, 0.6)',
  },
  civic: {
    bg: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    color: '#d97706',
    border: '#fcd34d',
    shadow: 'rgba(217, 119, 6, 0.6)',
  },
  service: {
    bg: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    color: '#0284c7',
    border: '#7dd3fc',
    shadow: 'rgba(2, 132, 199, 0.6)',
  },
};

/**
 * Determine classification and canonical visuals for any spot or hotline
 */
export function getPoiVisualConfig(spot = {}) {
  const name = (spot.name || '').toLowerCase();
  const cat = (spot.category || spot.type || '').toLowerCase();
  const spotType = (spot.spotType || '').toLowerCase();

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
      icon: '🌲',
      label: spot.category || 'DENR Checkpoint',
      palette: POI_COLOR_PALETTE.checkpoint,
    };
  }

  // 2. Emergency Services (MDRRMO, Police, Fire, Hospital/RHU)
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
      icon: spot.categoryIcon || icon,
      label: spot.category || 'Emergency Unit',
      palette: POI_COLOR_PALETTE.emergency,
    };
  }

  // 3. Nature & Eco-Tourism (Rivers, Caves, Springs, Mountains, Trails)
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
      icon: spot.categoryIcon || icon,
      label: spot.category || 'Nature & Eco-Tourism',
      palette: POI_COLOR_PALETTE.nature,
    };
  }

  // 4. Heritage, Schools, Churches & Civic
  if (
    cat.includes('heritage') ||
    cat.includes('history') ||
    cat.includes('religious') ||
    cat.includes('church') ||
    cat.includes('civic') ||
    name.includes('university') ||
    name.includes('school') ||
    name.includes('hall') ||
    name.includes('plaza')
  ) {
    let icon = '🏛️';
    if (cat.includes('religious') || name.includes('church')) icon = '⛪';
    else if (name.includes('university') || name.includes('school')) icon = '🏫';
    else if (cat.includes('civic') || name.includes('plaza')) icon = '🌳';

    return {
      typeKey: 'heritage',
      pinClass: 'pin-heritage',
      icon: spot.categoryIcon || icon,
      label: spot.category || 'Heritage & Cultural Landmark',
      palette: POI_COLOR_PALETTE.heritage,
    };
  }

  // 5. Terminals, Transport & Local Services
  let serviceIcon = '📍';
  if (cat.includes('transport') || cat.includes('terminal') || name.includes('terminal')) serviceIcon = '🚌';
  else if (cat.includes('gas') || name.includes('gas')) serviceIcon = '⛽';
  else if (name.includes('water')) serviceIcon = '💧';
  else if (cat.includes('dining') || cat.includes('eatery')) serviceIcon = '🍽️';
  else if (cat.includes('hotel')) serviceIcon = '🏨';

  return {
    typeKey: 'service',
    pinClass: 'pin-service',
    icon: spot.categoryIcon || serviceIcon,
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
