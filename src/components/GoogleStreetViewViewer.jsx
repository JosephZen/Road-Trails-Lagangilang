import React, { useState } from 'react';
import {
  isInsideUACampus,
  isNearCampusJunction,
  UA_CAMPUS_GATE,
  MAPILLARY_CAMPUS_GATE_IMAGE_ID,
} from '../utils/streetViewJunctions';

/**
 * Google Street View Viewer Component
 * Connects directly to Google Maps Street View for true road coverage in Lagangilang & Abra.
 * Includes intelligent junction detection and 1-click fallback to Mapillary when inside
 * campus trails or areas with no vehicle coverage.
 */
export default function GoogleStreetViewViewer({
  lat,
  lng,
  heading = 0,
  pitch = 0,
  title = 'Street View',
  onClose,
  onSwitchToMapillary,
  hasDedicatedCard = false,
}) {
  const [isLoading, setIsLoading] = useState(true);

  const parsedLat = parseFloat(lat) || 17.612749;
  const parsedLng = parseFloat(lng) || 120.733755;
  const parsedHeading = Math.round(heading || 0);

  const inCampus = isInsideUACampus(parsedLat, parsedLng);
  const nearJunction = isNearCampusJunction(parsedLat, parsedLng);

  // Google Maps Street View embed URL
  const embedUrl = `https://maps.google.com/maps?layer=c&cbll=${parsedLat},${parsedLng}&cbp=11,${parsedHeading},0,0,0&output=svembed`;

  // External full Google Maps Street View URL
  const externalUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${parsedLat},${parsedLng}&heading=${parsedHeading}`;

  const handleEnterMapillaryCampus = () => {
    onSwitchToMapillary?.({
      imageId: MAPILLARY_CAMPUS_GATE_IMAGE_ID,
      lat: UA_CAMPUS_GATE.lat,
      lng: UA_CAMPUS_GATE.lng,
    });
  };

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
      {/* Top Banner: Junction & Coverage Notice */}
      {inCampus && (
        <div
          style={{
            position: 'absolute',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(15, 23, 42, 0.92)',
            padding: '8px 16px',
            borderRadius: 'var(--radius-full, 9999px)',
            border: '1.5px solid #f59e0b',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            maxWidth: 'calc(100% - 100px)',
            animation: 'fadeInDown 0.3s ease-out',
          }}
        >
          <span style={{ fontSize: '1rem' }}>🏫</span>
          <div style={{ fontSize: '0.78rem', color: '#e2e8f0', lineHeight: 1.25 }}>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>Inside UA Campus Grounds: </span>
            Google Street View has no vehicle coverage here.
          </div>
          {onSwitchToMapillary && (
            <button
              onClick={handleEnterMapillaryCampus}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-full, 9999px)',
                padding: '4px 12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
              }}
            >
              <span>🚗 Switch to Mapillary Trail</span>
              <span>→</span>
            </button>
          )}
        </div>
      )}

      {/* Junction Bridge Pill (when viewing on highway near UA Campus Entrance) */}
      {!inCampus && nearJunction && onSwitchToMapillary && (
        <div
          style={{
            position: 'absolute',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.92)',
            padding: '6px 14px',
            borderRadius: 'var(--radius-full, 9999px)',
            border: '1px solid #10b981',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            animation: 'fadeInDown 0.3s ease-out',
          }}
        >
          <span style={{ fontSize: '0.95rem' }}>🚗</span>
          <span style={{ fontSize: '0.78rem', color: '#86efac', fontWeight: 600 }}>
            Junction Connected:
          </span>
          <button
            onClick={handleEnterMapillaryCampus}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-full, 9999px)',
              padding: '4px 12px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>Enter UA Campus Grounds (Mapillary)</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* Bottom-Left Pill: Street View Identifier & External Link */}
      {/* If tourist card is present, shift it right so they don't collide */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: hasDedicatedCard ? '348px' : '16px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.88)',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full, 9999px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          maxWidth: 'calc(100% - 32px)',
          flexWrap: 'wrap',
          transition: 'all 0.2s ease',
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
            marginLeft: '6px',
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

        {onSwitchToMapillary && (
          <button
            onClick={() => onSwitchToMapillary({ lat: parsedLat, lng: parsedLng })}
            style={{
              fontSize: '0.68rem',
              color: '#34d399',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              borderRadius: '4px',
              padding: '2px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Switch to Mapillary streetview coverage at this location"
          >
            <span>🔄 Switch to Mapillary</span>
          </button>
        )}
      </div>

      {/* Close button at Top-Right */}
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
            borderRadius: 'var(--radius-full, 9999px)',
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
