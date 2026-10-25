import React from 'react';
import PseudoImage from './PseudoImage';
import { normalizeCategoryName } from '../services/touristSpotsService';

/**
 * Floating Street View Card for Tourist Spots & POIs.
 * Features:
 * - Dynamic category icons (never hardcoded star)
 * - Interactive 360 orientation/navigation
 * - Admin Edit & Delete buttons directly on the card
 * - Route Here button
 */
export default function TouristSpotStreetViewCard({
  spot,
  onClose,
  onNavigateTo360,
  onSteerHeading,
  isViewerOpen = true,
  isAdmin = false,
  onEdit,
  onDelete,
  onRoute,
  viewerPanoMode = 'dedicated',
  onToggleViewerMode,
  hasDedicatedPano = false,
}) {
  if (!spot) return null;

  const isStaged = spot.sync_status === 'staged_local';
  const isVerified = spot.sync_status === 'verified';
  const isPoi = (spot.spotType || spot.type) === 'poi';
  const categoryName = normalizeCategoryName(spot.category);
  const displayIcon = spot.categoryIcon || (isPoi ? '🏪' : '⭐');

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
        maxWidth: '350px',
        width: 'calc(100% - 32px)',
        zIndex: 'var(--z-controls)',
        padding: '12px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(16px)',
        border: isPoi ? '1.5px solid rgba(6, 214, 160, 0.45)' : '1.5px solid rgba(255, 215, 0, 0.45)',
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '4px',
                background: isPoi ? 'rgba(6, 214, 160, 0.2)' : 'rgba(255, 215, 0, 0.2)',
                color: isPoi ? '#34d399' : '#ffd700',
                border: isPoi ? '1px solid rgba(6, 214, 160, 0.4)' : '1px solid rgba(255, 215, 0, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{displayIcon}</span>
              <span>{categoryName}</span>
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
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 2px 0',
              lineHeight: 1.25,
            }}
          >
            {spot.name}
          </h3>
          <p
            style={{
              fontSize: '0.74rem',
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
            minWidth: '26px',
            height: '26px',
            borderRadius: '50%',
            fontSize: '0.9rem',
            lineHeight: 1,
            background: 'rgba(255, 255, 255, 0.08)',
          }}
          title="Close Card"
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
            category={categoryName}
            categoryIcon={displayIcon}
            theme={spot.pseudoTheme || (isPoi ? 'cyan' : 'indigo')}
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
          border: isPoi ? '1px dashed rgba(6, 214, 160, 0.5)' : '1px dashed rgba(255, 215, 0, 0.5)',
          transition: 'all var(--transition-fast)',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isPoi ? 'rgba(6, 214, 160, 0.12)' : 'rgba(255, 215, 0, 0.12)';
          e.currentTarget.style.borderColor = isPoi ? '#06d6a0' : '#ffd700';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
          e.currentTarget.style.borderColor = isPoi ? 'rgba(6, 214, 160, 0.5)' : 'rgba(255, 215, 0, 0.5)';
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
              color: isPoi ? '#34d399' : '#ffd700',
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

      {/* 360 Scene Mode Switcher (When Viewer is Open and Spot has Dedicated 360 Photo) */}
      {isViewerOpen && hasDedicatedPano && (
        <div
          style={{
            display: 'flex',
            gap: '4px',
            marginTop: '10px',
            padding: '3px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          <button
            onClick={() => onToggleViewerMode?.('dedicated')}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '0.74rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: viewerPanoMode === 'dedicated'
                ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                : 'transparent',
              color: viewerPanoMode === 'dedicated' ? '#ffffff' : '#94a3b8',
              boxShadow: viewerPanoMode === 'dedicated' ? '0 2px 8px rgba(59, 130, 246, 0.4)' : 'none',
              transition: 'all var(--transition-fast)',
            }}
            title="View dedicated uploaded 360 panorama for this landmark"
          >
            <span>📷</span>
            <span>Dedicated 360</span>
          </button>

          <button
            onClick={() => onToggleViewerMode?.('road')}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '0.74rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: viewerPanoMode === 'road'
                ? 'linear-gradient(135deg, #05cb63 0%, #047857 100%)'
                : 'transparent',
              color: viewerPanoMode === 'road' ? '#ffffff' : '#94a3b8',
              boxShadow: viewerPanoMode === 'road' ? '0 2px 8px rgba(5, 203, 99, 0.4)' : 'none',
              transition: 'all var(--transition-fast)',
            }}
            title="Step out to public road Street View sequence (Mapillary)"
          >
            <span>🚗</span>
            <span>Road Street View</span>
          </button>
        </div>
      )}

      {/* Main Actions Row */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          marginTop: '10px',
        }}
      >
        {!isViewerOpen && (
          <button
            onClick={() => onNavigateTo360?.(spot)}
            className="btn btn-primary"
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '0.78rem',
              background: isPoi
                ? 'linear-gradient(135deg, #06d6a0 0%, #0284c7 100%)'
                : 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
              color: isPoi ? '#ffffff' : '#1a1a2e',
              fontWeight: 700,
              border: 'none',
              boxShadow: isPoi ? '0 2px 10px rgba(6, 214, 160, 0.3)' : '0 2px 10px rgba(255, 215, 0, 0.3)',
            }}
          >
            🌐 View in 360°
          </button>
        )}

        <button
          onClick={() => onRoute?.(spot)}
          className="btn btn-secondary"
          style={{
            padding: '6px 10px',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          title="Plan route to this destination"
        >
          <span>🧭</span>
          <span>Route</span>
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
            👁️ Aim
          </button>
        )}
      </div>

      {/* Admin Action Bar (Edit & Delete on card click) */}
      {isAdmin && (
        <div
          style={{
            display: 'flex',
            gap: '6px',
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <button
            onClick={() => onEdit?.(spot)}
            className="btn btn-ghost"
            style={{
              flex: 1,
              padding: '5px 8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#93c5fd',
              border: '1px solid rgba(147, 197, 253, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Edit this location details in modal"
          >
            <span>✎</span>
            <span>Edit Location</span>
          </button>

          <button
            onClick={() => onDelete?.(spot.id)}
            className="btn btn-ghost"
            style={{
              flex: 1,
              padding: '5px 8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Delete this location from system"
          >
            <span>🗑️</span>
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
}
