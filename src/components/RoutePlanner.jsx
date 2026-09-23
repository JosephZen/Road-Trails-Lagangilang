import React, { useState } from 'react';
import { getRoute, formatDuration, formatDistance, getManeuverIcon } from '../services/routingService';

/**
 * Route Planner sidebar component.
 * Allows users to click-on-map to set origin/destination,
 * select routing profile, view route summary and step-by-step directions.
 */
export default function RoutePlanner({
  routeOrigin,
  routeDestination,
  routeData,
  routingProfile,
  routingMode,
  isNavigating,
  onSetRoutingMode,
  onSetProfile,
  onClearRoute,
  onRouteCalculated,
  onStartNavigation,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCalculateRoute = async () => {
    if (!routeOrigin || !routeDestination) return;
    setIsLoading(true);
    setError(null);
    try {
      const route = await getRoute(routeOrigin, routeDestination, routingProfile);
      onRouteCalculated(route);
    } catch (err) {
      console.error('Route calculation failed:', err);
      setError(err.message || 'Failed to calculate route');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setError(null);
    onClearRoute();
  };

  // Gather all steps from all legs
  const steps = routeData?.legs?.flatMap(leg => leg.steps) || [];

  return (
    <div className="route-planner">
      <h3 className="route-planner-title">🧭 Route Planner</h3>

      {/* Profile Selector */}
      <div className="route-profile-selector">
        {[
          { id: 'driving', icon: '🚗', label: 'Drive' },
          { id: 'foot', icon: '🚶', label: 'Walk' },
        ].map(p => (
          <button
            key={p.id}
            className={`btn btn-sm ${routingProfile === p.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onSetProfile(p.id)}
            title={p.label}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {/* Set Points */}
      <div className="route-points">
        <div className="route-point">
          <span className="route-point-icon" style={{ color: '#22c55e' }}>●</span>
          <span className="route-point-text">
            {routeOrigin
              ? `${routeOrigin[1].toFixed(5)}, ${routeOrigin[0].toFixed(5)}`
              : 'Click map to set start'
            }
          </span>
        </div>
        <div className="route-point">
          <span className="route-point-icon" style={{ color: '#ef4444' }}>●</span>
          <span className="route-point-text">
            {routeDestination
              ? `${routeDestination[1].toFixed(5)}, ${routeDestination[0].toFixed(5)}`
              : 'Click map to set end'
            }
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="route-actions">
        {!routingMode ? (
          <button
            className="btn btn-primary btn-block"
            onClick={() => onSetRoutingMode(true)}
          >
            📍 Set Route Points
          </button>
        ) : (
          <button
            className="btn btn-secondary btn-block"
            onClick={() => onSetRoutingMode(false)}
          >
            ✕ Cancel Routing Mode
          </button>
        )}

        {routeOrigin && routeDestination && !routeData && (
          <button
            className="btn btn-primary btn-block"
            onClick={handleCalculateRoute}
            disabled={isLoading}
          >
            {isLoading ? '⏳ Calculating...' : '🔍 Calculate Route'}
          </button>
        )}

        {routeData && (
          <button
            className="btn btn-block"
            style={{ background: 'linear-gradient(135deg, #06d6a0 0%, #118ab2 100%)', color: '#fff', border: 'none' }}
            onClick={() => onStartNavigation(routeData)}
            disabled={isNavigating}
          >
            🧭 Start Navigation
          </button>
        )}

        {(routeOrigin || routeDestination || routeData) && (
          <button className="btn btn-secondary btn-block" onClick={handleClear}>
            🗑️ Clear Route
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="route-error">
          ⚠️ {error}
        </div>
      )}

      {/* Route Summary */}
      {routeData && (
        <div className="route-summary">
          <div className="route-summary-stats">
            <div className="route-stat">
              <span className="route-stat-value">{formatDistance(routeData.distance)}</span>
              <span className="route-stat-label">Distance</span>
            </div>
            <div className="route-stat">
              <span className="route-stat-value">{formatDuration(routeData.duration)}</span>
              <span className="route-stat-label">Duration</span>
            </div>
            <div className="route-stat">
              <span className="route-stat-value">{steps.length}</span>
              <span className="route-stat-label">Steps</span>
            </div>
          </div>
        </div>
      )}

      {/* Step-by-Step Directions */}
      {steps.length > 0 && (
        <div className="route-steps">
          <h4 className="route-steps-title">Directions</h4>
          <div className="route-steps-list">
            {steps.map((step, i) => (
              <div key={i} className="route-step">
                <span className="route-step-icon">
                  {getManeuverIcon(step.maneuver?.type, step.maneuver?.modifier)}
                </span>
                <div className="route-step-info">
                  <span className="route-step-instruction">
                    {step.name ? `${step.maneuver?.type === 'depart' ? 'Start on' : step.maneuver?.modifier ? `Turn ${step.maneuver.modifier} onto` : 'Continue on'} ${step.name}` : (step.maneuver?.type === 'arrive' ? 'Arrive at destination' : 'Continue')}
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
    </div>
  );
}
