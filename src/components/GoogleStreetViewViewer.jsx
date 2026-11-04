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
 * All transition buttons, engine switches, and status badges are anchored on the BOTTOM LEFT,
 * leaving the top of the viewer clean and unobstructed.
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

      {/* ===== BOTTOM-LEFT OF STREETVIEW: All transitions and engine controls (Responsive to device aspect ratio) ===== */}
      <div className={`streetview-bottom-left-controls ${hasDedicatedCard ? 'has-spot-card' : ''}`}>
        {/* Transition prompt: Inside Campus Ground (No Google vehicle coverage) */}
          {inCampus && onSwitchToMapillary && (
            <div className="streetview-transition-prompt campus-prompt">
              <span style={{ fontSize: '0.9rem' }}>🏫</span>
              <span className="prompt-label">Inside UA Campus (No Google coverage)</span>
              <button
                onClick={handleEnterMapillaryCampus}
                className="prompt-btn"
              >
                <span>🚗 Switch to Mapillary</span>
                <span>→</span>
              </button>
            </div>
          )}

          {/* Transition prompt: Near UA Campus Entrance Highway Junction */}
          {!inCampus && nearJunction && onSwitchToMapillary && (
            <div className="streetview-transition-prompt junction-prompt">
              <span style={{ fontSize: '0.9rem' }}>🚗</span>
              <span className="prompt-label">Junction Connected:</span>
              <button
                onClick={handleEnterMapillaryCampus}
                className="prompt-btn"
              >
                <span>Enter Campus (Mapillary)</span>
                <span>→</span>
              </button>
            </div>
          )}

          {/* Google Street View Status & Transition Hub (Aspect Ratio Adaptive Pill) */}
          <div className="streetview-engine-switch-pill">
            <span style={{ fontSize: '0.95rem' }}>🌐</span>
            <div className="switch-text-group">
              <span className="switch-title-desktop">Google Street View</span>
              <span className="switch-title-mobile">Google</span>
            </div>

            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="streetview-external-link"
              title="Open in official Google Maps app or browser tab"
            >
              <span className="link-text-desktop">Open in Google Maps</span>
              <span className="link-text-mobile">Maps</span>
              <span>↗</span>
            </a>

            {onSwitchToMapillary && (
              <button
                onClick={() => onSwitchToMapillary({ lat: parsedLat, lng: parsedLng })}
                className="streetview-switch-btn mapillary-switch"
                title="Transition to Mapillary streetview at this location"
              >
                <span>🚗</span>
                <span className="btn-label-desktop">Switch to Mapillary</span>
                <span className="btn-label-mobile">Mapillary</span>
              </button>
            )}
          </div>
        </div>
    </div>
  );
}
