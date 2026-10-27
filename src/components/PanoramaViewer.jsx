import React, { useEffect, useRef, useState, useCallback } from 'react';
import { touristSpotsService } from '../services/touristSpotsService';

import 'pannellum/build/pannellum.css';
import 'pannellum/build/pannellum.js';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Local 360° panorama viewer using Pannellum.
 * Supports navigation hotspots, compass sync, Neon Cloud textures, and street view transitions.
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
  onCloseViewer,
  onFallbackToMapillary,
  viewerLayout = 'split',
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [viewerReady, setViewerReady] = useState(true);
  const currentPanoRef = useRef(null);
  const activeBlobUrlRef = useRef(null);

  // Helper to convert base64 data URI to standard Blob URL (bypasses browser XHR CORS/status:0 issues in Pannellum)
  const dataUriToBlobUrl = useCallback((dataUri) => {
    if (!dataUri || !dataUri.startsWith('data:')) return dataUri;
    try {
      const parts = dataUri.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.warn('Could not convert data URI to blob URL:', err);
      return dataUri;
    }
  }, []);

  // Cleanup created blob URLs on unmount
  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current && activeBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
    };
  }, []);

  // Initialize or update the viewer when panorama changes
  useEffect(() => {
    if (!viewerReady || !panorama || !containerRef.current) return;

    // Guard: Prevent re-initialization if the exact same panorama and texture is already loaded and active
    const panoTextureKey = `${panorama.id}_${panorama.imageData ? panorama.imageData.length : ''}_${panorama.imageUrl || ''}`;
    if (currentPanoRef.current === panoTextureKey && viewerRef.current) {
      return;
    }

    let isCancelled = false;

    async function loadPanoTexture() {
      setIsLoading(true);

      // 1. If explicit data URI texture was passed (from Neon upload or state)
      let finalImageUrl =
        panorama.imageData ||
        (panorama.imageUrl?.startsWith('data:') ? panorama.imageUrl : null) ||
        (panorama.image?.startsWith('data:') && panorama.image.length > 35000 ? panorama.image : null);

      // 2. Query Neon Cloud DB for direct image_data if not found in props
      if (!finalImageUrl && panorama.id) {
        try {
          let cloudTexture = await touristSpotsService.fetchPanoramaImageData(panorama.id);
          if (!cloudTexture && !String(panorama.id).startsWith('pano_')) {
            cloudTexture = await touristSpotsService.fetchPanoramaImageData(`pano_${panorama.id}`);
          }
          if (cloudTexture && !isCancelled) {
            finalImageUrl = cloudTexture;
          }
        } catch (e) {
          console.warn('Could not retrieve Neon Cloud 360 texture:', e);
        }
      }

      // 3. Fallback to static URL
      if (!finalImageUrl) {
        finalImageUrl =
          panorama.imageUrl ||
          panorama.image ||
          (getCachedUrl
            ? getCachedUrl(panorama.id) || `${API_BASE}/panoramas/${panorama.filename}`
            : `${API_BASE}/panoramas/${panorama.filename}`);
      }

      if (isCancelled) return;

      // 4. Convert base64 data URI to Blob URL to ensure Pannellum XHR succeeds with status 200
      if (finalImageUrl && finalImageUrl.startsWith('data:')) {
        const blobUrl = dataUriToBlobUrl(finalImageUrl);
        if (activeBlobUrlRef.current && activeBlobUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(activeBlobUrlRef.current);
        }
        activeBlobUrlRef.current = blobUrl;
        finalImageUrl = blobUrl;
      }

      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
        } catch (e) {}
      }

      createViewer(finalImageUrl, [], panorama.heading || 0, panorama.heading !== undefined ? panorama.heading : viewerHeading);
      currentPanoRef.current = panoTextureKey;
    }

    loadPanoTexture();

    return () => {
      isCancelled = true;
    };
  }, [panorama?.id, panorama?.imageData, panorama?.imageUrl, viewerReady, getCachedUrl]);

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
  }, [steerTarget, panorama?.heading, onHeadingChange]);

  /**
   * Create a new Pannellum viewer instance.
   */
  const createViewer = useCallback((imageUrl, hotSpots, heading, currentAbsoluteHeading) => {
    if (!containerRef.current || !window.pannellum) return;

    // Clear the container
    containerRef.current.innerHTML = '';

    setIsLoading(true);

    const initialYaw = steerTarget?.heading !== undefined 
      ? (steerTarget.heading - (heading || 0)) 
      : 0;

    const initialPitch = steerTarget?.pitch !== undefined
      ? steerTarget.pitch
      : (panorama?.pitch || 0);

    const isBlobOrData = String(imageUrl).startsWith('blob:') || String(imageUrl).startsWith('data:');

    const viewer = window.pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      panorama: imageUrl,
      crossOrigin: isBlobOrData ? undefined : 'anonymous',
      ignoreGPanoXMP: true,
      autoLoad: true,
      showControls: false,
      showZoomCtrl: false,
      showFullscreenCtrl: false,
      compass: false,
      yaw: initialYaw,
      pitch: initialPitch,
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

    // Safety watchdog: ensure loading screen dismisses even on slower connections
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

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
      clearTimeout(timer);
      setIsLoading(false);
      setHasLoadError(false);
    });

    viewer.on('error', (err) => {
      clearTimeout(timer);
      console.warn('Pannellum viewer load error:', err);
      setIsLoading(false);
      setHasLoadError(true);
    });

    viewerRef.current = viewer;
  }, [onHeadingChange]);

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

  // Handle container resizing (e.g. split <-> fullscreen, mobile orientation change)
  useEffect(() => {
    if (!containerRef.current) return;

    const handleResize = () => {
      try {
        if (viewerRef.current && typeof viewerRef.current.resize === 'function') {
          viewerRef.current.resize();
        }
      } catch (e) {}
    };

    const ro = new ResizeObserver(() => {
      handleResize();
    });
    ro.observe(containerRef.current);

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Staggered resize when viewer layout changes
  useEffect(() => {
    const handleResize = () => {
      try {
        if (viewerRef.current && typeof viewerRef.current.resize === 'function') {
          viewerRef.current.resize();
        }
      } catch (e) {}
    };

    handleResize();
    const t1 = setTimeout(handleResize, 60);
    const t2 = setTimeout(handleResize, 200);
    const t3 = setTimeout(handleResize, 450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [viewerLayout]);

  return (
    <div className="panorama-wrapper">
      {/* Loading overlay */}
      <div className={`pano-loading-overlay ${!isLoading ? 'fade-out' : ''}`}>
        <div className="spinner" />
        <p className="loading-text">Loading panorama...</p>
      </div>

      {/* Fallback overlay if texture cannot be loaded */}
      {hasLoadError && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '12px',
            padding: '24px 20px',
            textAlign: 'center',
            zIndex: 60,
            maxWidth: 'min(380px, 90vw)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
            color: '#f8fafc',
            animation: 'fadeInUp 0.3s ease',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚠️</div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: '#f87171' }}>
            360 Photo Unavailable
          </h4>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.4 }}>
            The custom 360 panorama image could not be accessed from the cloud database. Would you like to view the street view instead?
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={() => onFallbackToMapillary?.()}
              style={{
                fontSize: '0.78rem',
                padding: '6px 14px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🚗 View Street View
            </button>
            <button
              className="btn btn-secondary"
              onClick={onCloseViewer}
              style={{ fontSize: '0.78rem', padding: '6px 14px', cursor: 'pointer' }}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}

      {/* Pannellum container */}
      <div ref={containerRef} className="panorama-container" />

      {/* Zoom controls */}
      <div className="zoom-controls glass-panel-sm">
        <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
        <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
      </div>
    </div>
  );
}
