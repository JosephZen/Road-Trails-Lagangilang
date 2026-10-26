import React, { useState, useEffect } from 'react';
import PseudoImage from './PseudoImage';
import { normalizeCategoryName } from '../services/touristSpotsService';

/**
 * Floating Street View Card for Tourist Spots & POIs.
 * Features:
 * - Anchored neatly at the bottom-left of the street view UI
 * - Ultra-minimal footprint on mobile devices & small scale aspect ratios
 * - Collapsible / minimizable into a compact pill so the panoramic scene remains unobstructed
 * - Defaults to minimized pill mode on mobile/small viewports so 360 map is never covered
 * - Dynamic category icons
 * - Interactive 360 orientation/navigation
 * - 3-Way Engine Switching (Google Street View, Mapillary Campus Trail, Dedicated 360)
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
  // Mobile / small screen detection
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 || window.innerHeight < 600;
    }
    return false;
  });

  // Default to minimized pill when in 360 viewer on mobile / small screens
  const [isMinimized, setIsMinimized] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 || window.innerHeight < 600;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768 || window.innerHeight < 600;
      setIsMobile(mobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Compact minimized pill view when street view is open
  if (isViewerOpen && isMinimized) {
    return (
      <div
        className="glass-panel tourist-streetview-card tourist-card-minimized"
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '12px',
          maxWidth: 'min(270px, calc(100% - 24px))',
          width: 'calc(100% - 24px)',
          zIndex: 40,
          padding: '6px 10px',
          borderRadius: 'var(--radius-full, 9999px)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(16px)',
          border: isPoi ? '1.5px solid rgba(6, 214, 160, 0.45)' : '1.5px solid rgba(255, 215, 0, 0.45)',
          animation: 'fadeInUp 0.25s ease-out',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            onClick={() => setIsMinimized(false)}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: isPoi ? 'rgba(6, 214, 160, 0.2)' : 'rgba(255, 215, 0, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            {displayIcon}
          </div>
          <div
            onClick={() => setIsMinimized(false)}
            style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            title="Click to view full landmark details"
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {spot.name}
            </div>
            <div style={{ fontSize: '0.64rem', color: isPoi ? '#34d399' : '#ffd700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayIcon} {categoryName}
            </div>
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 'var(--radius-full, 9999px)',
              color: '#ffffff',
              padding: '4px 8px',
              fontSize: '0.68rem',
              cursor: 'pointer',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
            title="Expand Details"
          >
            ▴ Details
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.72rem',
              flexShrink: 0,
            }}
            title="Dismiss Card"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="glass-panel tourist-streetview-card"
      style={{
        position: 'absolute',
        top: isViewerOpen ? 'auto' : '72px',
        bottom: isViewerOpen ? '16px' : 'auto',
        left: isViewerOpen ? '12px' : '16px',
        maxWidth: isViewerOpen ? (isMobile ? 'min(270px, calc(100% - 24px))' : '290px') : '350px',
        width: 'calc(100% - 24px)',
        zIndex: 40,
        maxHeight: isViewerOpen ? (isMobile ? 'min(48vh, 320px)' : 'calc(100% - 32px)') : 'none',
        overflowY: isViewerOpen ? 'auto' : 'visible',
        padding: isViewerOpen ? (isMobile ? '8px 10px' : '10px 12px') : '12px',
        borderRadius: 'var(--radius-lg, 12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(16px)',
        border: isPoi ? '1.5px solid rgba(6, 214, 160, 0.45)' : '1.5px solid rgba(255, 215, 0, 0.45)',
        animation: 'fadeInUp 0.25s ease-out',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '6px',
          gap: '6px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.64rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '1px 6px',
                borderRadius: '4px',
                background: isPoi ? 'rgba(6, 214, 160, 0.2)' : 'rgba(255, 215, 0, 0.2)',
                color: isPoi ? '#34d399' : '#ffd700',
                border: isPoi ? '1px solid rgba(6, 214, 160, 0.4)' : '1px solid rgba(255, 215, 0, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <span>{displayIcon}</span>
              <span>{categoryName}</span>
            </span>

            {isStaged ? (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(245, 158, 11, 0.25)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                }}
              >
                🟡 Staged
              </span>
            ) : isVerified ? (
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(16, 185, 129, 0.25)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                }}
              >
                🟢 Verified
              </span>
            ) : null}
          </div>

          <h3
            style={{
              fontSize: isMobile ? '0.88rem' : '0.98rem',
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 1px 0',
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={spot.name}
          >
            {spot.name}
          </h3>
          <p
            style={{
              fontSize: '0.68rem',
              color: 'var(--text-secondary)',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            📍 Brgy. {spot.barangay}, Lagangilang
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
          {isViewerOpen && (
            <button
              onClick={() => setIsMinimized(true)}
              className="btn btn-ghost"
              style={{
                padding: '2px',
                minWidth: '22px',
                height: '22px',
                borderRadius: '50%',
                fontSize: '0.8rem',
                lineHeight: 1,
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Minimize to Corner Pill"
            >
              –
            </button>
          )}

          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{
              padding: '2px',
              minWidth: '22px',
              height: '22px',
              borderRadius: '50%',
              fontSize: '0.75rem',
              lineHeight: 1,
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Dismiss Card"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Image Banner: Only shown on 2D Map view so it never blocks the 360 viewer */}
      {!isViewerOpen && (
        <div style={{ marginBottom: '8px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
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
      )}

      {/* Interactive Description Box */}
      <div
        onClick={handleDescriptionClick}
        title="Click description to orient the 360° Street View to this landmark"
        style={{
          cursor: 'pointer',
          padding: isMobile ? '6px 8px' : '7px 9px',
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
            marginBottom: '3px',
          }}
        >
          <span
            style={{
              fontSize: '0.64rem',
              fontWeight: 700,
              color: isPoi ? '#34d399' : '#ffd700',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            🧭 Description
          </span>
          {isViewerOpen && (
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
              (Click to Align 360°)
            </span>
          )}
        </div>

        <p
          style={{
            fontSize: isMobile ? '0.72rem' : '0.76rem',
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.35,
            maxHeight: isViewerOpen ? (isMobile ? '55px' : '80px') : 'none',
            overflowY: isViewerOpen ? 'auto' : 'visible',
          }}
        >
          {spot.description}
        </p>
      </div>

      {/* 360 Scene Engine Switcher (Google Street View, Mapillary Campus Trail, Dedicated 360) */}
      {isViewerOpen && (
        <div
          style={{
            display: 'flex',
            gap: '3px',
            marginTop: '8px',
            padding: '2px',
            background: 'rgba(0, 0, 0, 0.45)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          <button
            onClick={() => onToggleViewerMode?.('google')}
            style={{
              flex: 1,
              padding: '4px 2px',
              fontSize: '0.66rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              background:
                viewerPanoMode === 'google'
                  ? 'linear-gradient(135deg, #05cb63 0%, #047857 100%)'
                  : 'transparent',
              color: viewerPanoMode === 'google' ? '#ffffff' : '#94a3b8',
              boxShadow: viewerPanoMode === 'google' ? '0 2px 8px rgba(5, 203, 99, 0.4)' : 'none',
              transition: 'all var(--transition-fast)',
              whiteSpace: 'nowrap',
            }}
            title="Switch to Google Street View at this location"
          >
            <span>🌐</span>
            <span>Google</span>
          </button>

          <button
            onClick={() => onToggleViewerMode?.('mapillary')}
            style={{
              flex: 1,
              padding: '4px 2px',
              fontSize: '0.66rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              background:
                viewerPanoMode === 'mapillary'
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'transparent',
              color: viewerPanoMode === 'mapillary' ? '#ffffff' : '#94a3b8',
              boxShadow: viewerPanoMode === 'mapillary' ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none',
              transition: 'all var(--transition-fast)',
              whiteSpace: 'nowrap',
            }}
            title="Switch to Mapillary sequence (Campus grounds & interior trails)"
          >
            <span>🚗</span>
            <span>Mapillary</span>
          </button>

          {hasDedicatedPano && (
            <button
              onClick={() => onToggleViewerMode?.('dedicated')}
              style={{
                flex: 1,
                padding: '4px 2px',
                fontSize: '0.66rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                background:
                  viewerPanoMode === 'dedicated'
                    ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                    : 'transparent',
                color: viewerPanoMode === 'dedicated' ? '#ffffff' : '#94a3b8',
                boxShadow: viewerPanoMode === 'dedicated' ? '0 2px 8px rgba(59, 130, 246, 0.4)' : 'none',
                transition: 'all var(--transition-fast)',
                whiteSpace: 'nowrap',
              }}
              title="View dedicated uploaded 360 panorama for this landmark"
            >
              <span>📷</span>
              <span>Dedicated</span>
            </button>
          )}
        </div>
      )}

      {/* Main Actions Row */}
      <div
        style={{
          display: 'flex',
          gap: '5px',
          marginTop: '8px',
        }}
      >
        {!isViewerOpen && (
          <button
            onClick={() => onNavigateTo360?.(spot)}
            className="btn btn-primary"
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '0.76rem',
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
            flex: isViewerOpen ? 1 : 'none',
            padding: '5px 8px',
            fontSize: '0.72rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
          }}
          title="Plan route to this destination"
        >
          <span>🧭</span>
          <span>Route</span>
        </button>

        {spot.connected360?.heading !== undefined && onSteerHeading && isViewerOpen && (
          <button
            onClick={() =>
              onSteerHeading(spot.connected360.heading, spot.connected360.pitch || 0)
            }
            className="btn btn-secondary"
            style={{
              padding: '5px 8px',
              fontSize: '0.72rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
            }}
            title="Rotate camera to face this spot"
          >
            <span>👁️</span>
            <span>Aim</span>
          </button>
        )}
      </div>

      {/* Admin Action Bar (Edit & Delete on card click) */}
      {isAdmin && (
        <div
          style={{
            display: 'flex',
            gap: '5px',
            marginTop: '8px',
            paddingTop: '6px',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <button
            onClick={() => onEdit?.(spot)}
            className="btn btn-ghost"
            style={{
              flex: 1,
              padding: '4px 6px',
              fontSize: '0.7rem',
              fontWeight: 600,
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#93c5fd',
              border: '1px solid rgba(147, 197, 253, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Edit this location details in modal"
          >
            <span>✎</span>
            <span>Edit</span>
          </button>

          <button
            onClick={() => onDelete?.(spot.id)}
            className="btn btn-ghost"
            style={{
              flex: 1,
              padding: '4px 6px',
              fontSize: '0.7rem',
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
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
