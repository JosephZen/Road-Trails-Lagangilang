import React, { useState, useMemo } from 'react';
import { formatDuration, formatDistance, getManeuverIcon } from '../services/routingService';

/**
 * RouteSummaryCard
 * Floating non-blocking card displayed on the main map when a route is active.
 * Deprecates full-screen takeover navigation in favor of on-map route overview.
 */
export default function RouteSummaryCard({
  routeData,
  routeOrigin,
  routeDestination,
  routingProfile = 'driving',
  onReverseRoute,
  onClearRoute,
  onStartStreetViewRoute,
  touristSpots = [],
  isSplitView = false,
}) {
  const [showSteps, setShowSteps] = useState(false);

  // Helper to resolve origin/destination names from tourist spots or coordinates
  const resolveLocationName = (coords, fallbackLabel) => {
    if (!coords) return fallbackLabel;
    const [lng, lat] = coords;
    
    // Check if coordinates match Lagangilang Town Plaza
    if (Math.abs(lng - 120.734) < 0.005 && Math.abs(lat - 17.6142) < 0.005) {
      return '🏛️ Poblacion Town Plaza';
    }

    // Match with tourist spot
    const match = touristSpots.find((s) => {
      const sLat = s.location?.lat ?? s.lat;
      const sLng = s.location?.lng ?? s.lng;
      return Math.abs(sLat - lat) < 0.0003 && Math.abs(sLng - lng) < 0.0003;
    });

    if (match) return match.name;
    return `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
  };

  const originName = useMemo(
    () => resolveLocationName(routeOrigin, 'Point A (Start)'),
    [routeOrigin, touristSpots]
  );

  const destinationName = useMemo(
    () => resolveLocationName(routeDestination, 'Point B (Destination)'),
    [routeDestination, touristSpots]
  );

  if (!routeData) return null;

  const distanceText = formatDistance(routeData.distance || 0);
  const drivingTimeText = formatDuration(routeData.duration || 0);
  
  // Walking calculation (average walking speed 4.5 km/h = 1.25 m/s)
  const walkingSeconds = Math.round((routeData.distance || 0) / 1.25);
  const walkingTimeText = formatDuration(walkingSeconds);

  // Steps
  const steps = routeData?.legs?.flatMap((l) => l.steps) || [];

  return (
    <div
      className={`route-summary-floating-card ${isSplitView ? 'split-mode' : ''}`}
      style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        maxWidth: '380px',
        width: 'calc(100vw - 32px)',
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(59, 130, 246, 0.35)',
        borderRadius: '16px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
        color: '#f8fafc',
        padding: '16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'all 0.25s ease',
      }}
    >
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🛣️</span>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#60a5fa' }}>
              Active Route
            </h4>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              {routingProfile === 'walking' ? '🚶 Pedestrian Mode' : '🚗 Vehicle Mode'}
            </span>
          </div>
        </div>

        <button
          onClick={onClearRoute}
          title="Clear active route"
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#f87171',
            padding: '4px 8px',
            fontSize: '0.75rem',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          ✕ Clear
        </button>
      </div>

      {/* Origin & Destination */}
      <div
        style={{
          background: 'rgba(2, 6, 23, 0.55)',
          borderRadius: '10px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          fontSize: '0.82rem',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#22c55e',
              color: '#000',
              fontWeight: 800,
              fontSize: '0.65rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            A
          </span>
          <span style={{ color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {originName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#ef4444',
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.65rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            B
          </span>
          <span style={{ color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {destinationName}
          </span>
        </div>
      </div>

      {/* Metrics Row: Distance & ETAs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginTop: '12px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            padding: '8px 4px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Distance</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#38bdf8' }}>{distanceText}</div>
        </div>

        <div
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            padding: '8px 4px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Drive ETA</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#4ade80' }}>{drivingTimeText}</div>
        </div>

        <div
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            padding: '8px 4px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Walk ETA</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fbbf24' }}>{walkingTimeText}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '12px',
        }}
      >
        {onReverseRoute && (
          <button
            onClick={onReverseRoute}
            title="Swap Origin and Destination"
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#e2e8f0',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            ⇄ Reverse
          </button>
        )}

        {steps.length > 0 && (
          <button
            onClick={() => setShowSteps(!showSteps)}
            title="Toggle Step-by-Step Directions"
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: showSteps ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              color: showSteps ? '#60a5fa' : '#e2e8f0',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {showSteps ? '▲ Hide Steps' : '▼ View Steps'}
          </button>
        )}
      </div>

      {/* Expandable Step-by-Step Turn-by-turn breakdown */}
      {showSteps && steps.length > 0 && (
        <div
          style={{
            marginTop: '12px',
            maxHeight: '180px',
            overflowY: 'auto',
            background: 'rgba(2, 6, 23, 0.75)',
            borderRadius: '8px',
            padding: '8px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {steps.map((st, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '0.76rem',
                color: '#cbd5e1',
                paddingBottom: '4px',
                borderBottom: i < steps.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
              }}
            >
              <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>
                {getManeuverIcon(st.maneuver?.type, st.maneuver?.modifier)}
              </span>
              <div style={{ flex: 1 }}>
                <div>{st.maneuver?.instruction || st.name || `Step ${i + 1}`}</div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  {formatDistance(st.distance)} · {formatDuration(st.duration)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
