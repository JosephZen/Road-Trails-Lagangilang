import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { formatDuration, formatDistance, getManeuverIcon } from '../services/routingService';

setWorkerUrl(maplibreWorkerUrl);

/**
 * Full-screen turn-by-turn navigation view.
 * Integrates MapLibre GL JS for rendering, with hooks ready for Ferrostar's Rust/WASM Core TripState.
 * Currently uses Simulated GPS movement along the OSRM route for development.
 */
export default function NavigationView({
  routeData,
  onExit,
  theme = 'light',
  isMinimized = false,
  onToggleMinimize,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const animationRef = useRef(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(routeData?.distance || 0);
  const [remainingDuration, setRemainingDuration] = useState(routeData?.duration || 0);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Get all route coordinates
  const routeCoords = routeData?.geometry?.coordinates || [];
  
  // Get all steps from all legs
  const steps = routeData?.legs?.flatMap(leg => leg.steps) || [];
  const currentStep = steps[currentStepIndex] || null;

  // Resolve tile style according to active app theme
  const getStyleObj = (t) => {
    switch (t) {
      case 'light': return 'https://tiles.openfreemap.org/styles/liberty';
      case 'beige': return 'https://tiles.openfreemap.org/styles/positron';
      case 'satellite': return {
        version: 8,
        sources: {
          'esri-satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: '© Esri',
          },
        },
        layers: [
          {
            id: 'esri-satellite-layer',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      };
      case 'dark':
      default:
        return 'https://tiles.openfreemap.org/styles/dark';
    }
  };

  useEffect(() => {
    if (isMinimized) return; // Do not initialize heavy 3D map when running in minimized banner mode
    if (!mapContainerRef.current || mapRef.current) return;

    const startCoord = routeCoords[0] || [120.738083, 17.60825];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getStyleObj(theme),
      center: startCoord,
      zoom: 17,
      pitch: 50,
      bearing: 0,
      antialias: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // Route line
      map.addSource('nav-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: routeData.geometry,
          properties: {},
        },
      });

      map.addLayer({
        id: 'nav-route-casing',
        type: 'line',
        source: 'nav-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1e3a5f', 'line-width': 12, 'line-opacity': 0.3 },
      });

      map.addLayer({
        id: 'nav-route-line',
        type: 'line',
        source: 'nav-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': 6, 'line-opacity': 0.9 },
      });

      // User puck
      map.addSource('nav-puck', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: startCoord }, properties: {} },
      });

      map.addLayer({
        id: 'nav-puck-glow',
        type: 'circle',
        source: 'nav-puck',
        paint: {
          'circle-radius': 18,
          'circle-color': '#3b82f6',
          'circle-opacity': 0.15,
        },
      });

      map.addLayer({
        id: 'nav-puck-layer',
        type: 'circle',
        source: 'nav-puck',
        paint: {
          'circle-radius': 8,
          'circle-color': '#22c55e',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Start simulation
      startSimulation(map);
    });

    mapRef.current = map;

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const startSimulation = useCallback((map) => {
    if (routeCoords.length < 2) return;

    let progress = 0;
    const speed = 0.0005; // Progress increment per frame (adjust for speed)
    const totalPoints = routeCoords.length - 1;

    const animate = () => {
      if (!mapRef.current) return;

      progress += speed;
      if (progress >= 1) {
        progress = 1;
      }

      const idx = Math.floor(progress * totalPoints);
      const subProgress = (progress * totalPoints) - idx;

      if (idx >= totalPoints) {
        // Arrived
        setCurrentStepIndex(steps.length - 1);
        setRemainingDistance(0);
        setRemainingDuration(0);
        setSimulationProgress(1);
        return;
      }

      const from = routeCoords[idx];
      const to = routeCoords[idx + 1];

      // Interpolate position
      const lng = from[0] + (to[0] - from[0]) * subProgress;
      const lat = from[1] + (to[1] - from[1]) * subProgress;

      // Calculate bearing
      const bearing = calculateBearing(from[1], from[0], to[1], to[0]);

      // Update puck
      const puckSource = mapRef.current.getSource('nav-puck');
      if (puckSource) {
        puckSource.setData({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {},
        });
      }

      // Follow camera
      mapRef.current.easeTo({
        center: [lng, lat],
        bearing: bearing,
        pitch: 50,
        zoom: 17,
        duration: 50,
      });

      // Update remaining distance/duration
      const pctRemaining = 1 - progress;
      setRemainingDistance(Math.round((routeData?.distance || 0) * pctRemaining));
      setRemainingDuration(Math.round((routeData?.duration || 0) * pctRemaining));
      setSimulationProgress(progress);

      // Determine current step
      let accumulatedDist = 0;
      const distanceTraveled = (routeData?.distance || 0) * progress;
      for (let i = 0; i < steps.length; i++) {
        accumulatedDist += steps[i].distance;
        if (accumulatedDist >= distanceTraveled) {
          setCurrentStepIndex(i);
          break;
        }
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [routeCoords, steps, routeData]);

  // Bearing calculation
  function calculateBearing(lat1, lng1, lat2, lng2) {
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;
    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  if (isMinimized) {
    return (
      <div className="nav-minimized-hud glass-panel">
        <div className="nav-minimized-left">
          <span className="maneuver-icon-mini">
            {getManeuverIcon(currentStep?.maneuver?.type, currentStep?.maneuver?.modifier)}
          </span>
          <div className="nav-minimized-text">
            <div className="nav-minimized-instruction">
              {currentStep?.name
                ? `${currentStep.maneuver?.modifier ? `Turn ${currentStep.maneuver.modifier} onto` : 'Continue on'} ${currentStep.name}`
                : (currentStep?.maneuver?.type === 'arrive' ? '🏁 Arrived at destination!' : 'Follow route')}
            </div>
            <div className="nav-minimized-stats">
              <span className="stat-highlight">{formatDistance(remainingDistance)}</span>
              <span>•</span>
              <span className="stat-highlight">{formatDuration(remainingDuration)} ETA</span>
              <span>•</span>
              <span>{Math.round(simulationProgress * 100)}%</span>
            </div>
          </div>
        </div>
        <div className="nav-minimized-actions">
          {onToggleMinimize && (
            <button
              className="btn btn-primary btn-sm"
              onClick={onToggleMinimize}
              title="Expand to full 3D Navigation Cockpit"
              style={{ padding: '6px 12px', fontSize: '0.76rem', fontWeight: 700 }}
            >
              ⤢ 3D View
            </button>
          )}
          <button
            className="btn btn-danger btn-sm"
            onClick={onExit}
            title="End Navigation"
            style={{ padding: '6px 10px', fontSize: '0.76rem' }}
          >
            ✕ Exit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`navigation-view theme-${theme}`}>
      {/* Map */}
      <div ref={mapContainerRef} className="navigation-map" />

      {/* Top Maneuver Banner */}
      {currentStep && (
        <div className="maneuver-banner">
          <span className="maneuver-icon">
            {getManeuverIcon(currentStep.maneuver?.type, currentStep.maneuver?.modifier)}
          </span>
          <div className="maneuver-info">
            <div className="maneuver-instruction">
              {currentStep.name
                ? `${currentStep.maneuver?.modifier ? `Turn ${currentStep.maneuver.modifier} onto` : 'Continue on'} ${currentStep.name}`
                : (currentStep.maneuver?.type === 'arrive' ? '🏁 You have arrived!' : 'Continue on route')}
            </div>
            <div className="maneuver-distance">
              {formatDistance(currentStep.distance)}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Stats Bar */}
      <div className="nav-stats-bar">
        <div className="nav-stat">
          <span className="nav-stat-value">{formatDistance(remainingDistance)}</span>
          <span className="nav-stat-label">Remaining</span>
        </div>
        <div className="nav-stat">
          <span className="nav-stat-value">{formatDuration(remainingDuration)}</span>
          <span className="nav-stat-label">ETA</span>
        </div>
        <div className="nav-stat">
          <span className="nav-stat-value">{Math.round(simulationProgress * 100)}%</span>
          <span className="nav-stat-label">Progress</span>
        </div>
      </div>

      {/* Action Buttons (Minimize to main map / Exit) */}
      <div className="nav-actions-group">
        {onToggleMinimize && (
          <button
            className="nav-minimize-btn"
            onClick={onToggleMinimize}
            title="Minimize to top card and explore on main map"
          >
            ⤡ Show Main Map
          </button>
        )}
        <button className="nav-exit-btn" onClick={onExit} title="End Navigation">
          ✕ Exit Navigation
        </button>
      </div>

      {/* Simulation Badge */}
      <div className="nav-sim-badge">
        <span>🔬</span>
        <span>Simulated GPS</span>
      </div>
    </div>
  );
}
