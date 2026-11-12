import React, { useEffect, useRef, useState, useCallback } from 'react';
import { touristSpotsService } from '../services/touristSpotsService';
import offlineMapManager from '../services/offlineMapManager';

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
  isAdmin = false,
  nearestNode = null,
  onAssignNearestNode = null,
  onPickNodeFromMap = null,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const fileInputRef = useRef(null);
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
    if (!viewerReady || !containerRef.current) return;

    if (!panorama || (!panorama.id && !panorama.targetId && !panorama.primaryPanoId && !panorama.imageUrl && !panorama.imageData)) {
      setIsLoading(false);
      setHasLoadError(true);
      return;
    }

    // Guard: Prevent re-initialization if the exact same panorama and texture is already loaded and active
    const panoTextureKey = `${panorama.id}_${panorama.imageData ? panorama.imageData.length : ''}_${panorama.imageUrl || ''}`;
    if (currentPanoRef.current === panoTextureKey && viewerRef.current) {
      return;
    }

    let isCancelled = false;

    async function loadPanoTexture() {
      setIsLoading(true);

      // 1. If explicit data URI texture was passed (from Neon upload or state)
      // Guard: strictly ignore tiny thumbnails (< 50KB) to prevent 50p pixelated blur on the 360 sphere
      let finalImageUrl =
        (panorama.imageData && panorama.imageData.length > 50000 ? panorama.imageData : null) ||
        (panorama.imageUrl?.startsWith('data:') && panorama.imageUrl.length > 50000 ? panorama.imageUrl : null) ||
        (panorama.image?.startsWith('data:') && panorama.image.length > 50000 ? panorama.image : null);

      // 1.5. In-memory cache check (instant zero-delay recall)
      if (!finalImageUrl) {
        const idCandidates = [
          panorama.id,
          panorama.targetId,
          panorama.primaryPanoId,
          panorama.spotId,
        ].filter(Boolean);
        for (const candidate of idCandidates) {
          const mem = touristSpotsService.getPanoFromMemory(candidate);
          if (mem && mem.imageData && mem.imageData.length > 50000 && !isCancelled) {
            finalImageUrl = mem.imageData;
            break;
          }
        }
      }

      // 2. Offline IndexedDB check (cached 360 landmark media for web & APK offline usage)
      if (!finalImageUrl) {
        const idCandidates = [
          panorama.id,
          panorama.targetId,
          panorama.primaryPanoId,
          panorama.spotId,
          panorama.filename,
        ].filter(Boolean);

        for (const candidate of idCandidates) {
          try {
            const offlineMedia = await offlineMapManager.get360Media(candidate);
            if (offlineMedia && offlineMedia.length > 50000 && !isCancelled) {
              finalImageUrl = offlineMedia;
              break;
            }
          } catch (_) {}
        }
      }

      // 3. Query Neon Cloud DB for direct image_data if not found in props or offline storage
      if (!finalImageUrl && panorama.id) {
        try {
          let cloudTexture = await touristSpotsService.fetchPanoramaImageData(panorama.id);
          if (!cloudTexture && !String(panorama.id).startsWith('pano_')) {
            cloudTexture = await touristSpotsService.fetchPanoramaImageData(`pano_${panorama.id}`);
          }
          if (!cloudTexture && panorama.targetId) {
            cloudTexture = await touristSpotsService.fetchPanoramaImageData(panorama.targetId);
          }
          if (!cloudTexture && panorama.primaryPanoId) {
            cloudTexture = await touristSpotsService.fetchPanoramaImageData(panorama.primaryPanoId);
          }
          if (!cloudTexture && (panorama.spotId || panorama.label || panorama.lat)) {
            cloudTexture = await touristSpotsService.findPanoForSpot(panorama.spotId, panorama.label, panorama.lat, panorama.lng);
          }
          if (cloudTexture && cloudTexture.length > 50000 && !isCancelled) {
            finalImageUrl = cloudTexture;
            // Auto-persist to IndexedDB for seamless zero-signal offline recall later
            offlineMapManager.save360Media(panorama.id, cloudTexture, panorama.spotId).catch(() => {});
          }
        } catch (e) {
          console.warn('Could not retrieve Neon Cloud 360 texture:', e);
        }
      }

      // 4. Fallback to static URL (only full panorama files, NEVER low-res thumbnails or non-existent dynamic paths)
      if (!finalImageUrl) {
        const candidateUrl =
          (panorama.imageUrl && !panorama.imageUrl.includes('_thumb.') && !panorama.imageUrl.startsWith('data:')
            ? panorama.imageUrl
            : null) ||
          (panorama.filename && !panorama.filename.includes('_thumb.')
            ? (panorama.filename.startsWith('/') || panorama.filename.startsWith('http')
                ? panorama.filename
                : `/panoramas/${panorama.filename}`)
            : null) ||
          (panorama.targetId && String(panorama.targetId).startsWith('pano_')
            ? `/panoramas/${panorama.targetId}.jpg`
            : null) ||
          (panorama.id && String(panorama.id).startsWith('pano_')
            ? `/panoramas/${panorama.id}.jpg`
            : null) ||
          (getCachedUrl ? getCachedUrl(panorama.id) : null);

        if (candidateUrl && !candidateUrl.includes('_thumb.')) {
          finalImageUrl = candidateUrl;
        }
      }

      // 5. If no valid custom 360 photo found yet
      if (!finalImageUrl) {
        setIsLoading(false);
        setHasLoadError(true);
        return;
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
      console.warn('Pannellum viewer load error for', imageUrl, err);
      setIsLoading(false);
      setHasLoadError(true);
    });

    viewerRef.current = viewer;
  }, [onHeadingChange]);

  // Direct 360 photo upload / replace from viewer interface
  const handleDirectPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const targetPanoId = (panorama?.id && String(panorama.id).startsWith('pano_'))
        ? panorama.id
        : `pano_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const spotId = panorama?.spotId || panorama?.id;

      const res = await touristSpotsService.uploadPanoToNeon({
        id: targetPanoId,
        fileOrDataUrl: file,
        lat: panorama?.lat || 17.614,
        lng: panorama?.lng || 120.733,
        heading: panorama?.heading || 0,
        label: panorama?.label || 'Tourist Spot 360',
        spotId,
      });

      // Update spot in system
      if (spotId) {
        touristSpotsService.updateSpot(spotId, {
          connected360: {
            type: 'local',
            targetId: res.id,
            imageUrl: `/panoramas/${res.id}.jpg`,
            heading: panorama?.heading || 0,
            pitch: panorama?.pitch || 0,
          },
          image: res.thumbnailData,
          usePseudoImage: false,
        });
      }

      // Load blob directly into Pannellum
      const blobUrl = dataUriToBlobUrl(res.imageData);
      if (activeBlobUrlRef.current && activeBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
      activeBlobUrlRef.current = blobUrl;
      setHasLoadError(false);
      createViewer(blobUrl, [], panorama?.heading || 0, panorama?.heading || 0);

      alert('✅ 360 Photo updated successfully!\n\nSaved in high-definition to device storage (IndexedDB).');
    } catch (err) {
      console.error('Direct photo upload error:', err);
      alert(`Could not upload photo: ${err.message}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '16px',
            padding: '24px 20px',
            textAlign: 'center',
            zIndex: 60,
            maxWidth: 'min(420px, 92vw)',
            boxShadow: '0 20px 45px rgba(0,0,0,0.75)',
            color: '#f8fafc',
            animation: 'fadeInUp 0.3s ease',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📷</div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8' }}>
            No 360° image of this location
          </h4>
          <p style={{ margin: '0 0 14px 0', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.45 }}>
            {isAdmin
              ? <>A dedicated 360° photo has not been captured for <strong>{panorama?.label || 'this location'}</strong> yet. You can assign a streetview cyan node or upload a photo.</>
              : (nearestNode && nearestNode.distance <= 120)
                ? <>A dedicated 360° photo has not been recorded for <strong>{panorama?.label || 'this location'}</strong> yet. Explore the surrounding trail using Street View below.</>
                : <>No 360° photo or street-level imagery has been recorded for <strong>{panorama?.label || 'this location'}</strong> yet.</>}
          </p>

          {nearestNode && (
            <div style={{
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
              marginBottom: '16px',
              fontSize: '0.75rem',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}>
              <span>📍</span>
              {nearestNode.distance <= 120 ? (
                <span>Nearest Cyan Node: <strong>#{String(nearestNode.image?.id || nearestNode.imgId || '').slice(-6)}</strong> (~{Math.round(nearestNode.distance || 0)}m away on road)</span>
              ) : (
                <span>No Street View mapped in this immediate area (~{Math.round(nearestNode.distance)}m to nearest road node)</span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {isAdmin && nearestNode && (
              <button
                className="btn btn-primary"
                onClick={() => onAssignNearestNode?.(nearestNode)}
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(14, 165, 233, 0.4)',
                }}
                title={`Assign nearest cyan node #${String(nearestNode.image?.id || nearestNode.imgId || '').slice(-6)} as the 360 view for this landmark`}
              >
                🔗 Assign Nearest Node
              </button>
            )}

            {isAdmin && (
              <button
                className="btn btn-secondary"
                onClick={() => onPickNodeFromMap?.()}
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 14px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  borderColor: 'rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                title="Click any cyan dot on the map to assign it to this landmark"
              >
                🎯 Pick Node on Map
              </button>
            )}

            {isAdmin && (
              <button
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 14px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                📷 Upload 360
              </button>
            )}

            {(!nearestNode || nearestNode.distance <= 120) && (
              <button
                className="btn btn-secondary"
                onClick={() => onFallbackToMapillary?.()}
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                🚗 View Street View
              </button>
            )}

            <button
              className="btn btn-secondary"
              onClick={onCloseViewer}
              style={{ fontSize: '0.8rem', padding: '8px 16px', cursor: 'pointer' }}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input for direct photo upload / replacement */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleDirectPhotoUpload}
      />

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
