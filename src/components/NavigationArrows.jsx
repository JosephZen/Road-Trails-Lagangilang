import React from 'react';
import { calculateBearing } from '../utils/geoUtils';

/**
 * Google Street View–style directional navigation arrows.
 * Shows arrows pointing toward neighboring panoramas.
 */
export default function NavigationArrows({ currentPano, panoramas, onNavigate }) {
  if (!currentPano || !currentPano.neighbors || currentPano.neighbors.length === 0) {
    return null;
  }

  const neighbors = currentPano.neighbors
    .map((id) => panoramas.find((p) => p.id === id))
    .filter(Boolean);

  if (neighbors.length === 0) return null;

  return (
    <div className="nav-arrows-container">
      {neighbors.map((neighbor, index) => {
        const bearing = calculateBearing(
          currentPano.lat,
          currentPano.lng,
          neighbor.lat,
          neighbor.lng
        );

        // Determine arrow direction label
        const direction = getDirectionLabel(bearing);
        const isPrimary = index === 0; // First neighbor is primary

        return (
          <button
            key={neighbor.id}
            className={`nav-arrow-btn ${isPrimary ? 'primary' : ''}`}
            onClick={() => onNavigate(neighbor)}
            title={`Go ${direction} to ${neighbor.label || neighbor.id}`}
          >
            <span
              style={{
                display: 'inline-block',
                transform: `rotate(${bearing}deg)`,
                transition: 'transform 0.2s ease',
              }}
            >
              ↑
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Convert bearing to compass direction label.
 */
function getDirectionLabel(bearing) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}
