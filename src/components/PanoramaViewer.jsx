import React, { useEffect, useRef, useState, useCallback } from 'react';
import { calculateBearing } from '../utils/geoUtils';

import 'pannellum/build/pannellum.css';
import 'pannellum/build/pannellum.js';

const API_BASE = import.meta.env.VITE_API_BASE || '';

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
  onSwitchToMapillary,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerReady, setViewerReady] = useState(true);
  const currentPanoRef = useRef(null);

  // Initialize or update the viewer when panorama changes
  useEffect(() => {
    if (!viewerReady || !panorama || !containerRef.current) return;

    const imageUrl =
      panorama.imageUrl ||
      panorama.image ||
      (getCachedUrl
        ? getCachedUrl(panorama.id) || `${API_BASE}/panoramas/${panorama.filename}`
        : `${API_BASE}/panoramas/${panorama.filename}`);

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
      sceneFadeDuration: 600,
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
   * Build hotspot configs for neighboring panoramas with spatial discovery and smooth glide transitions.
   */
  function buildHotspots(currentPano, allPanoramas) {
    if (!allPanoramas || allPanoramas.length === 0) return [];

    // Gather neighbor IDs from pano.neighbors and spatial proximity
    const neighborIdSet = new Set(currentPano.neighbors || []);

    // Also look for spatially close panos (within 150m)
    allPanoramas.forEach((other) => {
      if (other.id !== currentPano.id) {
        const dLat = (other.lat - currentPano.lat) * 111320;
        const dLng = (other.lng - currentPano.lng) * 111320 * Math.cos((currentPano.lat * Math.PI) / 180);
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        if (dist <= 150) {
          neighborIdSet.add(other.id);
        }
      }
    });

    return Array.from(neighborIdSet)
      .map((neighborId, idx) => {
        const neighbor = allPanoramas.find((p) => p.id === neighborId);
        if (!neighbor) return null;

        // Calculate distance
        const dLat = (neighbor.lat - currentPano.lat) * 111320;
        const dLng = (neighbor.lng - currentPano.lng) * 111320 * Math.cos((currentPano.lat * Math.PI) / 180);
        const distMeters = Math.round(Math.sqrt(dLat * dLat + dLng * dLng));

        let bearing;
        if (distMeters < 2) {
          // If at nearly identical coordinate, space them out evenly
          bearing = (idx * 90) % 360;
        } else {
          bearing = calculateBearing(
            currentPano.lat, currentPano.lng,
            neighbor.lat, neighbor.lng
          );
        }

        // Convert bearing to yaw relative to panorama heading
        const rawYaw = bearing - (currentPano.heading || 0);
        const normalizedYaw = ((rawYaw % 360) + 540) % 360 - 180; // range [-180, 180]

        return {
          pitch: -20, // Ground level street view placement
          yaw: normalizedYaw,
          type: 'custom',
          cssClass: 'pano-hotspot-arrow',
          createTooltipFunc: (hotSpotDiv) => {
            hotSpotDiv.classList.add('pano-hotspot-arrow');
            const arrow = document.createElement('div');
            arrow.className = 'pano-hotspot-inner';
            const labelText = neighbor.label || (neighbor.description ? neighbor.description.slice(0, 20) : 'Step forward');
            arrow.innerHTML = `
              <div class="pano-chevron-disc">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="19" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(255, 255, 255, 0.9)" stroke-width="2.5"/>
                  <path d="M14 26 L22 15 L30 26" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="pano-hotspot-label-pill">
                <span>${labelText}</span>
                <span style="opacity: 0.7; font-size: 0.65rem;">~${distMeters}m</span>
              </div>
            `;
            hotSpotDiv.appendChild(arrow);
          },
          clickHandlerFunc: () => {
            // Smoothly glide camera toward the target arrow before navigating
            if (viewerRef.current && typeof viewerRef.current.lookAt === 'function') {
              try {
                viewerRef.current.lookAt(-12, normalizedYaw, 95, 300);
              } catch (e) {}
            }
            setTimeout(() => {
              onNavigate?.(neighbor);
            }, 180);
          },
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

      {/* Seamless Transition Pill to Mapillary Street View when near campus entrance */}
      {(panorama?.id === 'pano_1785434840169_sqgpeq' || panorama?.id === 'pano_1785458227165_1j20c9' || (panorama?.lat && Math.abs(panorama.lat - 17.60825) < 0.0002)) && onSwitchToMapillary && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          <button
            onClick={onSwitchToMapillary}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #05cb63 0%, #047857 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 15px rgba(5, 203, 99, 0.5)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            <span>🚗</span>
            <span>Enter Street View on Main Road</span>
            <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>(Mapillary)</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* Hotspot styles injected */}
      <style>{`
        .pano-hotspot-arrow {
          cursor: pointer;
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
          opacity: 0.85;
        }
        .pano-hotspot-arrow:hover {
          transform: scale(1.18);
          opacity: 1;
        }
        .pano-hotspot-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.7));
          pointer-events: auto;
        }
        .pano-chevron-disc {
          transform: perspective(300px) rotateX(55deg);
          animation: pulseArrow 2s infinite ease-in-out;
        }
        @keyframes pulseArrow {
          0%, 100% { transform: perspective(300px) rotateX(55deg) translateY(0); }
          50% { transform: perspective(300px) rotateX(55deg) translateY(-4px); }
        }
        .pano-hotspot-label-pill {
          background: rgba(15, 23, 42, 0.85);
          color: #ffffff;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(6px);
          white-space: nowrap;
          margin-top: -4px;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .pnlm-hotspot {
          width: 80px !important;
          height: 80px !important;
        }
      `}</style>
    </div>
  );
}
