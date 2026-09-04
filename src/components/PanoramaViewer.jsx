import React, { useEffect, useRef, useState, useCallback } from 'react';
import { calculateBearing } from '../utils/geoUtils';

// Pannellum is loaded via CDN in index.html since it doesn't have a clean ESM build
const PANNELLUM_CDN_CSS = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
const PANNELLUM_CDN_JS = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';

const API_BASE = 'http://localhost:3001';

/**
 * Load Pannellum from CDN if not already loaded.
 */
let pannellumLoaded = false;
function loadPannellum() {
  return new Promise((resolve) => {
    if (pannellumLoaded && window.pannellum) {
      resolve();
      return;
    }

    // Load CSS
    if (!document.querySelector(`link[href="${PANNELLUM_CDN_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = PANNELLUM_CDN_CSS;
      document.head.appendChild(link);
    }

    // Load JS
    if (!document.querySelector(`script[src="${PANNELLUM_CDN_JS}"]`)) {
      const script = document.createElement('script');
      script.src = PANNELLUM_CDN_JS;
      script.onload = () => {
        pannellumLoaded = true;
        resolve();
      };
      document.head.appendChild(script);
    } else if (window.pannellum) {
      pannellumLoaded = true;
      resolve();
    } else {
      // Wait for it to load
      const interval = setInterval(() => {
        if (window.pannellum) {
          pannellumLoaded = true;
          clearInterval(interval);
          resolve();
        }
      }, 50);
    }
  });
}

/**
 * Local 360° panorama viewer using Pannellum.
 * Supports navigation hotspots, compass sync, and bullet view transitions.
 */
export default function PanoramaViewer({
  panorama,
  panoramas,
  viewerHeading,
  getCachedUrl,
  onNavigate,
  onHeadingChange,
  onPitchChange,
  steerTarget,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const currentPanoRef = useRef(null);

  // Load Pannellum on mount
  useEffect(() => {
    loadPannellum().then(() => setViewerReady(true));
  }, []);

  // Initialize or update the viewer when panorama changes
  useEffect(() => {
    if (!viewerReady || !panorama || !containerRef.current) return;

    const imageUrl = getCachedUrl
      ? getCachedUrl(panorama.id) || `${API_BASE}/panoramas/${panorama.filename}`
      : `${API_BASE}/panoramas/${panorama.filename}`;

    // Build hotspots for neighbor navigation
    const hotSpots = buildHotspots(panorama, panoramas);

    // If viewer exists and we're just switching images (bullet view), swap the texture
    if (viewerRef.current && currentPanoRef.current) {
      setIsLoading(true);

      try {
        viewerRef.current.destroy();
      } catch (e) {
        // ignore
      }

      createViewer(imageUrl, hotSpots, panorama.heading || 0, viewerHeading);
      currentPanoRef.current = panorama.id;
      return;
    }

    // First-time initialization
    createViewer(imageUrl, hotSpots, panorama.heading || 0, viewerHeading);
    currentPanoRef.current = panorama.id;
  }, [panorama, viewerReady, panoramas, getCachedUrl]); // intentional omit viewerHeading so it doesn't trigger reload when just looking around

  // Handle steering / orienting camera to face a tourist landmark
  useEffect(() => {
    if (!viewerRef.current || !steerTarget) return;
    const yaw = (steerTarget.heading - (panorama?.heading || 0));
    try {
      if (typeof viewerRef.current.lookAt === 'function') {
        viewerRef.current.lookAt(steerTarget.pitch ?? 0, yaw, 100, 1000);
      } else if (typeof viewerRef.current.setYaw === 'function') {
        viewerRef.current.setYaw(yaw);
        if (typeof viewerRef.current.setPitch === 'function') {
          viewerRef.current.setPitch(steerTarget.pitch ?? 0);
        }
      }
      onHeadingChange?.(steerTarget.heading);
    } catch (e) {
      console.warn('Could not orient Pannellum camera:', e);
    }
  }, [steerTarget, panorama, onHeadingChange]);

  /**
   * Create a new Pannellum viewer instance.
   */
  const createViewer = useCallback((imageUrl, hotSpots, heading, currentAbsoluteHeading) => {
    if (!containerRef.current || !window.pannellum) return;

    // Clear the container
    containerRef.current.innerHTML = '';

    setIsLoading(true);

    const initialYaw = currentAbsoluteHeading !== undefined 
      ? (currentAbsoluteHeading - (heading || 0)) 
      : 0;

    const viewer = window.pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      panorama: imageUrl,
      autoLoad: true,
      showControls: false,
      showZoomCtrl: false,
      showFullscreenCtrl: false,
      compass: false,
      yaw: initialYaw,
      northOffset: heading || 0,
      hfov: 100,
      minHfov: 50,
      maxHfov: 120,
      friction: 0.15,
      mouseZoom: true,
      keyboardZoom: true,
      hotSpots: hotSpots,
      hotSpotDebug: false,
    });

    // Track heading changes
    viewer.on('mouseup', () => {
      const yaw = viewer.getYaw();
      const adjustedYaw = ((yaw + (heading || 0)) % 360 + 360) % 360;
      onHeadingChange?.(adjustedYaw);
    });

    viewer.on('touchend', () => {
      const yaw = viewer.getYaw();
      const adjustedYaw = ((yaw + (heading || 0)) % 360 + 360) % 360;
      onHeadingChange?.(adjustedYaw);
    });

    viewer.on('load', () => {
      setIsLoading(false);
    });

    viewer.on('error', (err) => {
      console.error('Pannellum error:', err);
      setIsLoading(false);
    });

    viewerRef.current = viewer;
  }, [onHeadingChange]);

  /**
   * Build hotspot configs for neighboring panoramas.
   */
  function buildHotspots(currentPano, allPanoramas) {
    if (!currentPano.neighbors || !allPanoramas) return [];

    return currentPano.neighbors
      .map((neighborId) => {
        const neighbor = allPanoramas.find((p) => p.id === neighborId);
        if (!neighbor) return null;

        const bearing = calculateBearing(
          currentPano.lat, currentPano.lng,
          neighbor.lat, neighbor.lng
        );

        // Convert bearing to yaw relative to panorama heading
        const yaw = bearing - (currentPano.heading || 0);

        return {
          pitch: -15, // Below horizon (like street-level arrows)
          yaw: yaw,
          type: 'custom',
          cssClass: 'pano-hotspot-arrow',
          createTooltipFunc: (hotSpotDiv) => {
            hotSpotDiv.classList.add('pano-hotspot-arrow');
            // Create chevron element
            const arrow = document.createElement('div');
            arrow.className = 'pano-hotspot-inner';
            arrow.innerHTML = `
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                 <path d="M10 40 L30 15 L50 40" stroke="rgba(255,255,255,0.9)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
            `;
            hotSpotDiv.appendChild(arrow);
          },
          createTooltipArgs: neighborId,
          clickHandlerFunc: () => {
            onNavigate?.(neighbor);
          },
          clickHandlerArgs: neighborId,
        };
      })
      .filter(Boolean);
  }

  // Expose zoom methods
  const zoomIn = useCallback(() => {
    if (viewerRef.current) {
      const hfov = viewerRef.current.getHfov();
      viewerRef.current.setHfov(Math.max(hfov - 10, 50));
    }
  }, []);

  const zoomOut = useCallback(() => {
    if (viewerRef.current) {
      const hfov = viewerRef.current.getHfov();
      viewerRef.current.setHfov(Math.min(hfov + 10, 120));
    }
  }, []);

  return (
    <div className="panorama-wrapper">
      {/* Loading overlay */}
      <div className={`pano-loading-overlay ${!isLoading ? 'fade-out' : ''}`}>
        <div className="spinner" />
        <p className="loading-text">Loading panorama...</p>
      </div>

      {/* Pannellum container */}
      <div ref={containerRef} className="panorama-container" />

      {/* Zoom controls */}
      <div className="zoom-controls glass-panel-sm">
        <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
        <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
      </div>

      {/* Hotspot styles injected */}
      <style>{`
        .pano-hotspot-arrow {
          cursor: pointer;
          transition: transform 0.2s ease, opacity 0.2s ease;
          opacity: 0.7;
        }
        .pano-hotspot-arrow:hover {
          transform: scale(1.1);
          opacity: 1;
        }
        .pano-hotspot-inner {
          transform: perspective(400px) rotateX(65deg);
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.8));
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .pnlm-hotspot {
          width: 60px !important;
          height: 60px !important;
        }
      `}</style>
    </div>
  );
}
