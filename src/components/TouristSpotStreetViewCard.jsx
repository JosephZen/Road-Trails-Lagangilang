import React from 'react';
import PseudoImage from './PseudoImage';

/**
 * Floating Street View Card for Tourist Spots.
 * Features an interactive description that triggers 360° orientation/navigation.
 */
export default function TouristSpotStreetViewCard({
  spot,
  onClose,
  onNavigateTo360,
  onSteerHeading,
  isViewerOpen = true,
}) {
  if (!spot) return null;

  const isStaged = spot.sync_status === 'staged_local';
  const isVerified = spot.sync_status === 'verified';

  const handleDescriptionClick = () => {
    // 1. If we have a steer heading handler, rotate the 360 camera toward the landmark
    if (spot.connected360?.heading !== undefined && onSteerHeading) {
      onSteerHeading(spot.connected360.heading, spot.connected360.pitch || 0);
    }
    // 2. Trigger navigate into 360 image if requested
    if (onNavigateTo360) {
      onNavigateTo360(spot);
    }
  };

  return (
    <div
      className="glass-panel tourist-streetview-card"
      style={{
        position: 'absolute',
        top: '72px',
        left: '16px',
        maxWidth: '340px',
        width: 'calc(100% - 32px)',
        zIndex: 'var(--z-controls)',
        padding: '12px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 215, 0, 0.4)',
        animation: 'fadeInUp 0.3s ease-out',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '8px',
          gap: '8px',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(255, 215, 0, 0.2)',
                color: '#ffd700',
                border: '1px solid rgba(255, 215, 0, 0.4)',
              }}
            >
              ⭐ POI • {spot.category || 'Attraction'}
            </span>

            {isStaged ? (
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(245, 158, 11, 0.25)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                }}
              >
                🟡 Staged Draft
              </span>
            ) : isVerified ? (
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.25)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                }}
              >
                🟢 Verified
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                }}
              >
                ☁ Cloud Synced
              </span>
            )}
          </div>

          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 2px 0',
              lineHeight: 1.3,
            }}
          >
            {spot.name}
          </h3>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            📍 Brgy. {spot.barangay}, Lagangilang, Abra
          </p>
        </div>

        <button
          onClick={onClose}
          className="btn btn-ghost"
          style={{
            padding: '4px',
            minWidth: '24px',
            height: '24px',
            borderRadius: '50%',
            fontSize: '0.85rem',
            lineHeight: 1,
          }}
          title="Close Tourist Spot Card"
        >
          ✕
        </button>
      </div>

      {/* Image or Pseudo-Image Banner */}
      <div style={{ marginBottom: '10px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {spot.image ? (
          <img
            src={spot.image}
            alt={spot.name}
            style={{ width: '100%', height: '130px', objectFit: 'cover' }}
          />
        ) : (
          <PseudoImage
            title={spot.name}
            category={spot.category}
            theme={spot.pseudoTheme || 'indigo'}
            height="115px"
          />
        )}
      </div>

      {/* Interactive Description Box */}
      <div
        onClick={handleDescriptionClick}
        title="Click description to orient the 360° Street View to this landmark"
        style={{
          cursor: 'pointer',
          padding: '8px 10px',
          background: 'rgba(255, 255, 255, 0.06)',
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed rgba(255, 215, 0, 0.5)',
          transition: 'all var(--transition-fast)',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 215, 0, 0.12)';
          e.currentTarget.style.borderColor = '#ffd700';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
          e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.5)';
          e.currentTarget.style.transform = 'none';
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '4px',
          }}
        >
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: '#ffd700',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            🧭 Interactive Description
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            (Click to Navigate 360°)
          </span>
        </div>

        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.45,
          }}
        >
          {spot.description}
        </p>
      </div>

      {/* Action Navigation Footer */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          marginTop: '10px',
        }}
      >
        <button
          onClick={() => onNavigateTo360?.(spot)}
          className="btn btn-primary"
          style={{
            flex: 1,
            padding: '6px 10px',
            fontSize: '0.78rem',
            background: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
            color: '#1a1a2e',
            fontWeight: 700,
            border: 'none',
            boxShadow: '0 2px 10px rgba(255, 215, 0, 0.3)',
          }}
        >
          🌐 View in 360°
        </button>

        {spot.connected360?.heading !== undefined && onSteerHeading && (
          <button
            onClick={() =>
              onSteerHeading(spot.connected360.heading, spot.connected360.pitch || 0)
            }
            className="btn btn-secondary"
            style={{
              padding: '6px 10px',
              fontSize: '0.78rem',
            }}
            title="Rotate camera to face this spot"
          >
            👁️ Aim Camera
          </button>
        )}
      </div>
    </div>
  );
}
