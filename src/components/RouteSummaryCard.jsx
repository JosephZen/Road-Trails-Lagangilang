import React, { useState, useEffect, useMemo } from 'react';
import {
  getRouteElevationProfile,
  calculateAdvancedETAs,
  formatMinutes,
  formatKm,
} from '../services/routeConditionService';
import { getManeuverIcon } from '../services/routingService';

/**
 * RouteSummaryCard
 * In-navbar navigation HUD for phones, tablets, and desktops.
 * Integrates directly into the top navigation bar when routing is active,
 * allowing instant travel mode switching, destination changing, turn-by-turn directions,
 * and 1-tap exit to immediately revert the nav bar to normal.
 */
export default function RouteSummaryCard({
  routeData,
  routeOrigin,
  routeDestination,
  routingProfile = 'driving',
  onProfileChange,
  onReverseRoute,
  onClearRoute,
  onTriggerPopups,
  touristSpots = [],
  isSplitView = false,
  weather = null,
  onChangeDestination,
  onStartStreetViewRoute,
}) {
  const [showSteps, setShowSteps] = useState(false);
  const [elevationData, setElevationData] = useState(null);

  // Sync active mode from profile
  const activeMode = useMemo(() => {
    if (routingProfile === 'walking' || routingProfile === 'foot') return 'person';
    if (routingProfile === 'motorcycle') return 'motorcycle';
    return 'car';
  }, [routingProfile]);

  // Identify destination landmark if it matches a tourist spot
  const destinationSpot = useMemo(() => {
    if (!routeDestination) return null;
    return touristSpots.find((s) => {
      const lat = s.location?.lat ?? s.lat;
      const lng = s.location?.lng ?? s.lng;
      return (
        Math.abs(lat - routeDestination[1]) < 0.0005 &&
        Math.abs(lng - routeDestination[0]) < 0.0005
      );
    });
  }, [routeDestination, touristSpots]);

  const destDisplayName = destinationSpot?.name || 'Destination';

  // Fetch elevation profile for the route geometry
  useEffect(() => {
    if (!routeData?.geometry?.coordinates) return;

    let isMounted = true;
    getRouteElevationProfile(routeData.geometry.coordinates)
      .then((elev) => {
        if (isMounted) setElevationData(elev);
      })
      .catch((err) => {
        console.warn('Could not fetch route elevation:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [routeData]);

  // Calculate advanced mode ETAs considering elevation and road conditions
  const etas = useMemo(() => {
    if (!routeData) return null;
    return calculateAdvancedETAs(routeData, elevationData, weather);
  }, [routeData, elevationData, weather]);

  if (!routeData || !etas) return null;

  const currentModeInfo = etas[activeMode] || etas.car;
  const steps = routeData?.legs?.flatMap((l) => l.steps || []) || [];

  const handleSelectMode = (mode) => {
    let nextProfile = 'driving';
    if (mode === 'person') nextProfile = 'walking';
    else if (mode === 'motorcycle') nextProfile = 'motorcycle';
    else nextProfile = 'driving';

    if (onProfileChange) {
      onProfileChange(nextProfile);
    }
  };

  return (
    <div
      className={`nav-active-navigation-bar ${isSplitView ? 'split-mode' : ''}`}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flex: 1,
        minWidth: 0,
        background: 'rgba(15, 23, 42, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(59, 130, 246, 0.45)',
        borderRadius: '9999px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        padding: '3px 8px',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        pointerEvents: 'auto',
        animation: 'fadeInDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        minHeight: '38px',
      }}
    >
      {/* Mode Selector Segment: Car, Motorcycle, Person */}
      <div
        className="route-mode-segmented"
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(2, 6, 23, 0.65)',
          padding: '2px',
          borderRadius: '9999px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          flexShrink: 0,
        }}
      >
        {/* Car */}
        <button
          onClick={() => handleSelectMode('car')}
          title="Car Travel Mode"
          style={{
            background:
              activeMode === 'car'
                ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                : 'transparent',
            color: activeMode === 'car' ? '#ffffff' : '#94a3b8',
            border: 'none',
            borderRadius: '9999px',
            padding: '3px 6px',
            fontSize: '0.74rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            boxShadow: activeMode === 'car' ? '0 2px 8px rgba(59, 130, 246, 0.4)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🚗</span>
          <span className="mode-text-desktop">Car</span>
        </button>

        {/* Motorcycle */}
        <button
          onClick={() => handleSelectMode('motorcycle')}
          title="Motorcycle Mode"
          style={{
            background:
              activeMode === 'motorcycle'
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'transparent',
            color: activeMode === 'motorcycle' ? '#ffffff' : '#94a3b8',
            border: 'none',
            borderRadius: '9999px',
            padding: '3px 6px',
            fontSize: '0.74rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            boxShadow: activeMode === 'motorcycle' ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🏍️</span>
          <span className="mode-text-desktop">Motor</span>
        </button>

        {/* Person / Walking */}
        <button
          onClick={() => handleSelectMode('person')}
          title="Walking Mode"
          style={{
            background:
              activeMode === 'person'
                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                : 'transparent',
            color: activeMode === 'person' ? '#ffffff' : '#94a3b8',
            border: 'none',
            borderRadius: '9999px',
            padding: '3px 6px',
            fontSize: '0.74rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            boxShadow: activeMode === 'person' ? '0 2px 8px rgba(245, 158, 11, 0.4)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🚶</span>
          <span className="mode-text-desktop">Walk</span>
        </button>
      </div>

      {/* Core Stats: ETA, KM, Minutes */}
      <div
        onClick={onTriggerPopups}
        title="Click to highlight route on map"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: '6px',
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: '0.88rem',
            fontWeight: 800,
            color: activeMode === 'person' ? '#fbbf24' : activeMode === 'motorcycle' ? '#34d399' : '#60a5fa',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}
        >
          {currentModeInfo.formatted}
        </span>
        <span
          style={{
            fontSize: '0.72rem',
            color: '#94a3b8',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          · {etas.distanceKm}
        </span>
      </div>

      {/* Destination Chip & Quick Switcher Button */}
      <button
        onClick={onChangeDestination}
        title="Click to change destination or pick another spot"
        className="nav-dest-chip"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '9999px',
          padding: '3px 8px',
          color: '#ffffff',
          fontSize: '0.74rem',
          fontWeight: 600,
          cursor: 'pointer',
          maxWidth: '125px',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          flexShrink: 1,
          transition: 'all 0.15s ease',
        }}
      >
        <span>🎯</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {destDisplayName}
        </span>
        <span style={{ fontSize: '0.65rem', color: '#60a5fa' }}>▾</span>
      </button>

      {/* Reverse Start & Destination */}
      {onReverseRoute && (
        <button
          onClick={onReverseRoute}
          title="Reverse Start & Destination points"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '9999px',
            color: '#cbd5e1',
            width: '28px',
            height: '28px',
            padding: 0,
            fontSize: '0.8rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
        >
          ⇄
        </button>
      )}

      {/* Turn-by-Turn Steps Toggle */}
      {steps.length > 0 && (
        <button
          onClick={() => setShowSteps(!showSteps)}
          title={showSteps ? 'Hide steps' : 'View turn-by-turn directions'}
          style={{
            background: showSteps ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)',
            border: showSteps
              ? '1px solid rgba(59, 130, 246, 0.45)'
              : '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '9999px',
            color: showSteps ? '#60a5fa' : '#cbd5e1',
            width: '28px',
            height: '28px',
            padding: 0,
            fontSize: '0.74rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
        >
          📋
        </button>
      )}

      {/* 360° Street View at Start (if available) */}
      {onStartStreetViewRoute && (
        <button
          onClick={onStartStreetViewRoute}
          title="Open 360° Street View at route start"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '9999px',
            color: '#cbd5e1',
            width: '28px',
            height: '28px',
            padding: 0,
            fontSize: '0.74rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
        >
          📷
        </button>
      )}

      {/* Exit Navigation & Revert Nav Bar */}
      <button
        onClick={onClearRoute}
        title="Exit Navigation and restore standard nav bar"
        style={{
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid rgba(239, 68, 68, 0.45)',
          borderRadius: '9999px',
          color: '#fca5a5',
          padding: '4px 9px',
          fontSize: '0.74rem',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          flexShrink: 0,
          marginLeft: 'auto',
          transition: 'all 0.15s ease',
        }}
      >
        ✕ Exit
      </button>

      {/* Expandable Turn-by-Turn Steps Dropdown Drawer */}
      {showSteps && (
        <div
          className="nav-steps-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            minWidth: '280px',
            maxWidth: '430px',
            maxHeight: '260px',
            overflowY: 'auto',
            background: 'rgba(15, 23, 42, 0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: '16px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
            padding: '10px',
            zIndex: 1050,
            animation: 'fadeInDown 0.2s ease',
          }}
        >
          {/* Surface & Elevation Stats */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(2, 6, 23, 0.5)',
              borderRadius: '8px',
              padding: '6px 8px',
              fontSize: '0.68rem',
              color: '#94a3b8',
              marginBottom: '6px',
            }}
          >
            <span>🛣️ {etas.surfaceType}</span>
            <span>🔄 {etas.turnCount} turns</span>
          </div>

          {/* Turn Steps List */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {steps.map((st, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.72rem',
                  color: '#cbd5e1',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.04)',
                }}
              >
                <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>
                  {getManeuverIcon(st.maneuver?.type, st.maneuver?.modifier)}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {st.maneuver?.instruction || st.name || `Step ${i + 1}`}
                </span>
                <span style={{ fontSize: '0.64rem', color: '#64748b', flexShrink: 0 }}>
                  {formatKm(st.distance)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
