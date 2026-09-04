import React from 'react';

const THEMES = {
  indigo: {
    from: '#3a0ca3',
    to: '#4361ee',
    accent: '#4cc9f0',
    icon: '🏛️',
  },
  emerald: {
    from: '#0f5132',
    to: '#198754',
    accent: '#75b798',
    icon: '🌳',
  },
  amber: {
    from: '#78350f',
    to: '#d97706',
    accent: '#fde68a',
    icon: '⛪',
  },
  cyan: {
    from: '#0e7490',
    to: '#06b6d4',
    accent: '#a5f3fc',
    icon: '🌊',
  },
  rose: {
    from: '#881337',
    to: '#e11d48',
    accent: '#fecdd3',
    icon: '⛰️',
  },
  teal: {
    from: '#134e4a',
    to: '#0d9488',
    accent: '#99f6e4',
    icon: '🌉',
  },
  violet: {
    from: '#4c1d95',
    to: '#7c3aed',
    accent: '#ddd6fe',
    icon: '✨',
  },
  orange: {
    from: '#7c2d12',
    to: '#ea580c',
    accent: '#fed7aa',
    icon: '📷',
  },
};

/**
 * PseudoImage Component
 * Generates an SVG pseudo-image card for tourist spots without uploaded photography.
 */
export default function PseudoImage({
  title = 'Tourist Attraction',
  category = 'Point of Interest',
  theme = 'indigo',
  className = '',
  height = '140px',
  showWatermark = true,
}) {
  const t = THEMES[theme] || THEMES.indigo;

  return (
    <div
      className={`pseudo-image-container ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: height,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${t.from} 0%, ${t.to} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '12px',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Background SVG Motif */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0.15,
          pointerEvents: 'none',
        }}
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
      >
        <path d="M0 160 Q 100 80, 200 130 T 400 90 L 400 200 L 0 200 Z" fill="#ffffff" />
        <circle cx="340" cy="50" r="30" fill="#ffffff" />
        <path d="M50 200 L110 90 L170 200 Z" fill="#ffffff" opacity="0.6" />
        <path d="M140 200 L210 110 L280 200 Z" fill="#ffffff" opacity="0.4" />
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
            border: `1px solid rgba(255,255,255,0.15)`,
          }}
        >
          {category}
        </span>
        <span
          style={{
            fontSize: '1.2rem',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
        >
          {t.icon}
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
