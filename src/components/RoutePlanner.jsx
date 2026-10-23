import React, { useState, useMemo } from 'react';
import { getRoute, formatDuration, formatDistance, getManeuverIcon } from '../services/routingService';

/**
 * Route Planner sidebar component.
 * Enhanced with interactive point picking (Start / Destination),
 * GPS "My Location" with loading state, swap points, and spot-based routing.
 */
export default function RoutePlanner({
  routeOrigin,
  routeDestination,
  routeData,
  routingProfile,
  routingMode,
  pickingTarget,
  isNavigating,
  isAdmin,
  isLocating = false,
  touristSpots = [],
  userLocation,
  onSetRoutingMode,
  onSetPickingTarget,
  onSetProfile,
  onClearRoute,
  onRouteCalculated,
  onStartNavigation,
  onSetOrigin,
  onSetDestination,
  onUseMyLocation,
  onSwapPoints,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpotId, setSelectedSpotId] = useState(null);

  // Filter tourist spots based on search query
  const filteredSpots = useMemo(() => {
    if (!searchQuery.trim()) return touristSpots;
    const q = searchQuery.toLowerCase();
    return touristSpots.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.barangay?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q)
    );
  }, [touristSpots, searchQuery]);

  // Check if destination matches any tourist spot
  const destinationSpot = useMemo(() => {
    if (!routeDestination) return null;
    return touristSpots.find((s) => {
      const lat = s.location?.lat ?? s.lat;
      const lng = s.location?.lng ?? s.lng;
      return (
        Math.abs(lat - routeDestination[1]) < 0.0001 &&
        Math.abs(lng - routeDestination[0]) < 0.0001
      );
    });
  }, [routeDestination, touristSpots]);

  // Check if origin matches any tourist spot
  const originSpot = useMemo(() => {
    if (!routeOrigin) return null;
    return touristSpots.find((s) => {
      const lat = s.location?.lat ?? s.lat;
      const lng = s.location?.lng ?? s.lng;
      return (
        Math.abs(lat - routeOrigin[1]) < 0.0001 &&
        Math.abs(lng - routeOrigin[0]) < 0.0001
      );
    });
  }, [routeOrigin, touristSpots]);

  const handleCalculateRoute = async () => {
    if (!routeOrigin || !routeDestination) return;
    setIsLoading(true);
    setError(null);
    try {
      const route = await getRoute(routeOrigin, routeDestination, routingProfile);
      onRouteCalculated(route);
    } catch (err) {
      console.error('Route calculation failed:', err);
      setError(err.message || 'Failed to calculate route. Try picking points closer to marked roads.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setError(null);
    setSelectedSpotId(null);
    setSearchQuery('');
    onClearRoute();
  };

  const handleSetSpotAsDestination = (spot) => {
    const lat = spot.location?.lat ?? spot.lat;
    const lng = spot.location?.lng ?? spot.lng;
    setSelectedSpotId(spot.id);
    onSetDestination([lng, lat]);

    // If user has location, auto-set as origin if not already set
    if (userLocation && !routeOrigin) {
      onSetOrigin([userLocation.lng, userLocation.lat]);
    }
  };

  const handleSetSpotAsOrigin = (spot) => {
    const lat = spot.location?.lat ?? spot.lat;
    const lng = spot.location?.lng ?? spot.lng;
    onSetOrigin([lng, lat]);
  };

  const handlePickOriginOnMap = () => {
    if (onSetPickingTarget) {
      onSetPickingTarget(pickingTarget === 'origin' ? null : 'origin');
    } else {
      onSetRoutingMode(!routingMode);
    }
  };

  const handlePickDestinationOnMap = () => {
    if (onSetPickingTarget) {
      onSetPickingTarget(pickingTarget === 'destination' ? null : 'destination');
    } else {
      onSetRoutingMode(!routingMode);
    }
  };

  const handleSetPoblacionDefault = () => {
    onSetOrigin([120.734, 17.6142]); // Poblacion Town Plaza
  };

  // Gather turn-by-turn steps
  const steps = routeData?.legs?.flatMap((leg) => leg.steps) || [];

  return (
    <div className="route-planner">
      <h3 className="route-planner-title">🧭 Route & Navigation</h3>

      {/* Travel Profile Selector */}
      <div className="route-profile-selector" style={{ marginBottom: '12px' }}>
        {[
          { id: 'driving', icon: '🚗', label: 'Driving' },
          { id: 'foot', icon: '🚶', label: 'Walking' },
        ].map((p) => (
          <button
            key={p.id}
            className={`btn btn-sm ${routingProfile === p.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onSetProfile(p.id)}
            style={{ flex: 1 }}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {/* Point A (Origin / Start) Card */}
      <div className={`route-point-box ${pickingTarget === 'origin' ? 'active-picking' : ''}`}>
        <div className="route-point-header">
          <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '5px' }}>
            ● Point A (Start)
          </span>
          {routeOrigin && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.68rem', padding: '1px 6px', color: '#ef4444' }}
              onClick={() => onSetOrigin(null)}
              title="Clear Point A"
            >
              ✕ Clear
            </button>
          )}
        </div>
        <div className="route-point-body">
          <div className="route-point-coord" title={routeOrigin ? `${routeOrigin[1]}, ${routeOrigin[0]}` : 'Not set'}>
            {originSpot
              ? `📍 ${originSpot.name}`
              : routeOrigin
              ? `${routeOrigin[1].toFixed(5)}, ${routeOrigin[0].toFixed(5)}`
              : 'Choose starting point'}
          </div>
          <div className="route-point-btn-group">
            <button
              className={`btn btn-sm ${pickingTarget === 'origin' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={handlePickOriginOnMap}
              title="Click on the map to set Point A"
            >
              🗺️ Pick
            </button>
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#3b82f6' }}
              onClick={onUseMyLocation}
              disabled={isLocating}
              title="Use GPS current position"
            >
              {isLocating ? '⏳ GPS...' : '📍 GPS'}
            </button>
          </div>
        </div>
      </div>

      {/* Swap Button */}
      <div className="route-swap-row">
        <button
          className="route-swap-btn"
          onClick={onSwapPoints}
          disabled={!routeOrigin && !routeDestination}
          title="Swap Point A and Point B"
        >
          ⇅ Swap Start & Destination
        </button>
      </div>

      {/* Point B (Destination) Card */}
      <div className={`route-point-box ${pickingTarget === 'destination' ? 'active-picking' : ''}`}>
        <div className="route-point-header">
          <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '5px' }}>
            ● Point B (Destination)
          </span>
          {routeDestination && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.68rem', padding: '1px 6px', color: '#ef4444' }}
              onClick={() => onSetDestination(null)}
              title="Clear Point B"
            >
              ✕ Clear
            </button>
          )}
        </div>
        <div className="route-point-body">
          <div className="route-point-coord" title={routeDestination ? `${routeDestination[1]}, ${routeDestination[0]}` : 'Not set'}>
            {destinationSpot
              ? `⭐ ${destinationSpot.name}`
              : routeDestination
              ? `${routeDestination[1].toFixed(5)}, ${routeDestination[0].toFixed(5)}`
              : 'Choose destination'}
          </div>
          <div className="route-point-btn-group">
            <button
              className={`btn btn-sm ${pickingTarget === 'destination' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={handlePickDestinationOnMap}
              title="Click on the map to set Point B"
            >
              🗺️ Pick
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="route-actions" style={{ marginTop: '12px' }}>
        {/* If neither point is set, offer 1-click pick both */}
        {!routeOrigin && !routeDestination && (
          <button
            className={`btn btn-block ${routingMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onSetRoutingMode(!routingMode)}
            style={{ fontSize: '0.82rem' }}
          >
            {routingMode ? '✕ Cancel Map Pick' : '📍 Pick Both Points on Map'}
          </button>
        )}

        {/* Quick fallback for start */}
        {!routeOrigin && (
          <button
            className="btn btn-ghost btn-block"
            style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}
            onClick={handleSetPoblacionDefault}
            title="Set Lagangilang Town Plaza as Point A"
          >
            🏛️ Quick Start: Poblacion Town Plaza
          </button>
        )}

        {/* Calculate button */}
        {routeOrigin && routeDestination && !routeData && (
          <button
            className="btn btn-primary btn-block"
            onClick={handleCalculateRoute}
            disabled={isLoading}
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              fontWeight: 700,
              fontSize: '0.88rem',
            }}
          >
            {isLoading ? '⏳ Calculating Route...' : '🔍 Calculate Route'}
          </button>
        )}

        {/* Navigation button */}
        {routeData && (
          <button
            className="btn btn-block"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.88rem',
              boxShadow: '0 4px 15px rgba(5, 150, 105, 0.4)',
            }}
            onClick={() => onStartNavigation(routeData)}
            disabled={isNavigating}
          >
            🧭 Start Turn-by-Turn Navigation
          </button>
        )}

        {/* Clear Route */}
        {(routeOrigin || routeDestination || routeData) && (
          <button
            className="btn btn-secondary btn-block"
            onClick={handleClear}
            style={{ fontSize: '0.78rem' }}
          >
            🗑️ Clear Points & Route
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="route-error" style={{ marginTop: '10px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Route Summary */}
      {routeData && (
        <div className="route-summary" style={{ marginTop: '14px' }}>
          {destinationSpot && (
            <div className="route-info-panel" style={{ marginBottom: '12px' }}>
              <div className="route-info-destination">
                <span style={{ fontSize: '1.2rem' }}>⭐</span>
                <span className="route-info-destination-name">{destinationSpot.name}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Brgy. {destinationSpot.barangay} · {destinationSpot.category}
              </div>
            </div>
          )}
          <div className="route-summary-stats">
            <div className="route-stat">
              <span className="route-stat-value">{formatDistance(routeData.distance)}</span>
              <span className="route-stat-label">Distance</span>
            </div>
            <div className="route-stat">
              <span className="route-stat-value">{formatDuration(routeData.duration)}</span>
              <span className="route-stat-label">Est. Time</span>
            </div>
            <div className="route-stat">
              <span className="route-stat-value">{steps.length}</span>
              <span className="route-stat-label">Turns</span>
            </div>
          </div>
        </div>
      )}

      {/* Step-by-Step Directions */}
      {steps.length > 0 && (
        <div className="route-steps" style={{ marginTop: '14px' }}>
          <h4 className="route-steps-title">Turn-by-Turn Directions</h4>
          <div className="route-steps-list">
            {steps.map((step, i) => (
              <div key={i} className="route-step">
                <span className="route-step-icon">
                  {getManeuverIcon(step.maneuver?.type, step.maneuver?.modifier)}
                </span>
                <div className="route-step-info">
                  <span className="route-step-instruction">
                    {step.name
                      ? `${step.maneuver?.type === 'depart' ? 'Start on' : step.maneuver?.modifier ? `Turn ${step.maneuver.modifier} onto` : 'Continue on'} ${step.name}`
                      : step.maneuver?.type === 'arrive'
                      ? 'Arrive at destination'
                      : 'Continue along path'}
                  </span>
                  <span className="route-step-distance">
                    {formatDistance(step.distance)} · {formatDuration(step.duration)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tourist Spots Quick Destination Picker */}
      {!routeData && (
        <div className="destination-picker" style={{ marginTop: '16px' }}>
          <div className="destination-picker-title">
            <span>⭐</span> Route to a Lagangilang Spot
          </div>

          <input
            type="text"
            className="destination-search-input"
            placeholder="Search attractions, barangay, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="destination-list">
            {filteredSpots.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '12px 0' }}>
                No matching spots found.
              </p>
            ) : (
              filteredSpots.map((spot) => {
                const isSelectedDest = destinationSpot?.id === spot.id;
                const isSelectedOrig = originSpot?.id === spot.id;
                return (
                  <div
                    key={spot.id}
                    className={`destination-item ${isSelectedDest ? 'selected' : ''}`}
                    onClick={() => handleSetSpotAsDestination(spot)}
                  >
                    <div
                      className="destination-item-icon"
                      style={{
                        background: isSelectedDest
                          ? 'rgba(76, 201, 240, 0.25)'
                          : 'rgba(255, 215, 0, 0.15)',
                      }}
                    >
                      ⭐
                    </div>
                    <div className="destination-item-info">
                      <div className="destination-item-name">{spot.name}</div>
                      <div className="destination-item-address">
                        Brgy. {spot.barangay} · {spot.category}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="btn btn-ghost"
                        style={{
                          fontSize: '0.68rem',
                          padding: '2px 6px',
                          color: isSelectedOrig ? '#22c55e' : 'var(--text-muted)',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetSpotAsOrigin(spot);
                        }}
                        title="Set as Start (Point A)"
                      >
                        {isSelectedOrig ? '✓ Start' : 'Start'}
                      </button>
                      <button
                        className="destination-item-route-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetSpotAsDestination(spot);
                        }}
                      >
                        {isSelectedDest ? '✓ Dest' : '→ Dest'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
