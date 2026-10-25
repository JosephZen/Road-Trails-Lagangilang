import React, { useState } from 'react';

/**
 * Google Street View Viewer Component
 * Connects directly to Google Maps Street View for true road coverage in Lagangilang & Abra.
 * Requires no external API key for embed mode; automatically centers on (lat, lng).
 */
export default function GoogleStreetViewViewer({
  lat,
  lng,
  heading = 0,
  pitch = 0,
  title = 'Street View',
  onClose,
}) {
  const [isLoading, setIsLoading] = useState(true);

  const parsedLat = parseFloat(lat) || 17.612749;
  const parsedLng = parseFloat(lng) || 120.733755;
  const parsedHeading = Math.round(heading || 0);

  // Google Maps Street View embed URL
  const embedUrl = `https://maps.google.com/maps?layer=c&cbll=${parsedLat},${parsedLng}&cbp=11,${parsedHeading},0,0,0&output=svembed`;

  // External full Google Maps Street View URL
  const externalUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${parsedLat},${parsedLng}&heading=${parsedHeading}`;

  return (
    <div
      className="google-streetview-wrapper"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0a0f1d',
        overflow: 'hidden',
      }}
    >
      {/* Top Banner / Controls */}
      <div
        style={{
          position: 'absolute',
          top: '14px',
          left: '16px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.88)',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        <span style={{ fontSize: '1rem' }}>🌐</span>
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
            Google Street View
          </div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
            {title || `${parsedLat.toFixed(5)}, ${parsedLng.toFixed(5)}`}
          </div>
        </div>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginLeft: '8px',
            fontSize: '0.68rem',
            color: '#60a5fa',
            textDecoration: 'none',
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(96, 165, 250, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          title="Open in official Google Maps app or browser tab"
        >
          <span>Open in Google Maps</span>
          <span>↗</span>
        </a>
      </div>

      {/* Close button if provided */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '14px',
            right: '16px',
            zIndex: 10,
            background: 'rgba(15, 23, 42, 0.88)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: 'var(--radius-full)',
            padding: '6px 14px',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          title="Back to Map"
        >
          <span>✕</span>
          <span>Back to Map</span>
        </button>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10, 15, 29, 0.9)',
            zIndex: 5,
            color: '#ffffff',
            gap: '12px',
          }}
        >
          <div className="spinner" style={{ width: '36px', height: '36px' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Connecting to Google Street View...</span>
        </div>
      )}

      {/* Interactive Google Maps Street View Iframe */}
      <iframe
        key={`${parsedLat}-${parsedLng}`}
        title="Google Street View"
        src={embedUrl}
        width="100%"
        height="100%"
        style={{
          border: 'none',
          width: '100%',
          height: '100%',
          display: 'block',
        }}
        allowFullScreen=""
        loading="lazy"
        onLoad={() => setIsLoading(false)}
      />
    </div>
  );
}
