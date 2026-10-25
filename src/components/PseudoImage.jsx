import React from 'react';
import { normalizeCategoryName } from '../services/touristSpotsService';

export const THEMES = {
  indigo: {
    id: 'indigo',
    name: 'Royal Indigo',
    from: '#3a0ca3',
    to: '#4361ee',
    accent: '#4cc9f0',
    color: '#4361ee',
    fallbackIcon: '🏛️',
  },
  emerald: {
    id: 'emerald',
    name: 'Forest Emerald',
    from: '#064e3b',
    to: '#10b981',
    accent: '#a7f3d0',
    color: '#10b981',
    fallbackIcon: '🌳',
  },
  amber: {
    id: 'amber',
    name: 'Warm Amber',
    from: '#78350f',
    to: '#d97706',
    accent: '#fde68a',
    color: '#d97706',
    fallbackIcon: '⛪',
  },
  cyan: {
    id: 'cyan',
    name: 'Lagoon Cyan',
    from: '#0e7490',
    to: '#06b6d4',
    accent: '#a5f3fc',
    color: '#06b6d4',
    fallbackIcon: '🌊',
  },
  rose: {
    id: 'rose',
    name: 'Sunset Rose',
    from: '#881337',
    to: '#e11d48',
    accent: '#fecdd3',
    color: '#e11d48',
    fallbackIcon: '⛰️',
  },
  teal: {
    id: 'teal',
    name: 'Deep Teal',
    from: '#134e4a',
    to: '#0d9488',
    accent: '#99f6e4',
    color: '#0d9488',
    fallbackIcon: '🌉',
  },
  violet: {
    id: 'violet',
    name: 'Mystic Violet',
    from: '#4c1d95',
    to: '#7c3aed',
    accent: '#ddd6fe',
    color: '#7c3aed',
    fallbackIcon: '✨',
  },
  orange: {
    id: 'orange',
    name: 'Solar Orange',
    from: '#7c2d12',
    to: '#ea580c',
    accent: '#fed7aa',
    color: '#ea580c',
    fallbackIcon: '☀️',
  },
  ruby: {
    id: 'ruby',
    name: 'Crimson Ruby',
    from: '#7f1d1d',
    to: '#dc2626',
    accent: '#fca5a5',
    color: '#dc2626',
    fallbackIcon: '🚨',
  },
  sapphire: {
    id: 'sapphire',
    name: 'Ocean Sapphire',
    from: '#1e3a8a',
    to: '#2563eb',
    accent: '#93c5fd',
    color: '#2563eb',
    fallbackIcon: '💧',
  },
  gold: {
    id: 'gold',
    name: 'Sunlit Gold',
    from: '#713f12',
    to: '#eab308',
    accent: '#fef08a',
    color: '#eab308',
    fallbackIcon: '🌾',
  },
  slate: {
    id: 'slate',
    name: 'Modern Slate',
    from: '#0f172a',
    to: '#475569',
    accent: '#cbd5e1',
    color: '#475569',
    fallbackIcon: '🏢',
  },
  neon: {
    id: 'neon',
    name: 'Cyber Mint',
    from: '#022c22',
    to: '#059669',
    accent: '#6ee7b7',
    color: '#059669',
    fallbackIcon: '⚡',
  },
  sunset: {
    id: 'sunset',
    name: 'Coral Dusk',
    from: '#701a75',
    to: '#db2777',
    accent: '#fbcfe8',
    color: '#db2777',
    fallbackIcon: '🌄',
  },
};

/**
 * PseudoImage Component
 * Generates an SVG pseudo-image card for tourist spots without uploaded photography.
 * Supports both full banner mode and compact list thumbnail mode.
 */
export default function PseudoImage({
  title = 'Tourist Attraction',
  category = 'Point of Interest',
  categoryIcon = null,
  theme = 'indigo',
  className = '',
  height = '140px',
  width = '100%',
  style = {},
  showWatermark = true,
}) {
  const t = THEMES[theme] || THEMES.indigo;
  const activeIcon = categoryIcon || t.fallbackIcon || '📍';
  const cleanCategory = normalizeCategoryName(category);

  // Detect compact thumbnail mode (e.g. 60px x 60px in sidebar list)
  const numericWidth = typeof width === 'number' ? width : parseInt(String(width), 10);
  const isThumbnail = !isNaN(numericWidth) && numericWidth <= 80;

  if (isThumbnail) {
    return (
      <div
        className={`pseudo-image-thumbnail ${className}`}
        style={{
          width: width || '60px',
          height: height || '60px',
          minWidth: width || '60px',
          minHeight: height || '60px',
          maxWidth: width || '60px',
          maxHeight: height || '60px',
          flexShrink: 0,
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${t.from} 0%, ${t.to} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.6rem',
          boxShadow: 'inset 0 0 10px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          ...style,
        }}
        title={`${title} • ${cleanCategory}`}
      >
        <span style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>{activeIcon}</span>
      </div>
    );
  }

  // Full Banner Mode
  return (
    <div
      className={`pseudo-image-container ${className}`}
      style={{
        position: 'relative',
        width: width || '100%',
        height: height,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${t.from} 0%, ${t.to} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '12px',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)',
        ...style,
      }}
    >
      {/* Background SVG Motif - Modern subtle contours without forced mountains */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0.14,
          pointerEvents: 'none',
        }}
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
      >
        <path d="M0 140 Q 110 80, 210 120 T 400 95 L 400 200 L 0 200 Z" fill="#ffffff" />
        <path d="M0 165 Q 130 130, 250 155 T 400 130 L 400 200 L 0 200 Z" fill="#ffffff" opacity="0.45" />
        <circle cx="340" cy="45" r="28" fill="#ffffff" opacity="0.3" />
      </svg>

      {/* Top Header Tags */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 2 }}>
        <span
          style={{
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 700,
            background: 'rgba(0,0,0,0.45)',
            color: t.accent,
            padding: '3px 8px',
            borderRadius: '999px',
            backdropFilter: 'blur(4px)',
            border: `1px solid rgba(255,255,255,0.18)`,
          }}
        >
          {cleanCategory}
        </span>
        <span
          style={{
            fontSize: '1.25rem',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
        >
          {activeIcon}
        </span>
      </div>

      {/* Title & Location Footer */}
      <div style={{ zIndex: 2 }}>
        <h4
          style={{
            color: '#ffffff',
            fontSize: '0.95rem',
            fontWeight: 700,
            lineHeight: 1.25,
            textShadow: '0 2px 6px rgba(0,0,0,0.7)',
            margin: '0 0 3px 0',
          }}
        >
          {title}
        </h4>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.7rem',
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          <span>📍 Lagangilang, Abra</span>
          {showWatermark && (
            <span
              style={{
                background: 'rgba(255,255,255,0.2)',
                padding: '1px 5px',
                borderRadius: '4px',
                fontSize: '0.6rem',
              }}
            >
              Pseudo 360° Node
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
