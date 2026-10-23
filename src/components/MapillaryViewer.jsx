import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Viewer } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';

const MAPILLARY_ACCESS_TOKEN = 'MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9';
const DEFAULT_IMAGE_ID = '1532761357806896'; // UA Campus Entrance Gate, Lagangilang

const isValidMapillaryId = (id) => {
  return id && String(id).length >= 10 && /^\d+$/.test(String(id));
};

/**
 * Robust Mapillary 360° Street View Viewer using mapillary-js v4.
 * Renders high-performance street imagery from Mapillary Graph API & Meta CDN.
 */
export default function MapillaryViewer({
  imageId,
  onPositionChange,
  onHeadingChange,
  steerTarget,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const currentImageIdRef = useRef(null);
  const isNavigatingRef = useRef(false);

  // Initialize Viewer on Mount
  useEffect(() => {
    if (!containerRef.current) return;

    let viewer;
    let isMounted = true;
    const targetId = isValidMapillaryId(imageId) ? String(imageId) : DEFAULT_IMAGE_ID;
    currentImageIdRef.current = targetId;

    try {
      viewer = new Viewer({
        accessToken: MAPILLARY_ACCESS_TOKEN,
        container: containerRef.current,
        imageId: targetId,
        component: {
          cover: false,
          direction: true,
          sequence: true,
          spatial: false, // Disabled: avoids distracting 3D camera wireframes and SfM artifacts
          zoom: true,
        },
      });

      // Event: Image displayed in viewer
      viewer.on('image', (event) => {
        if (!isMounted) return;
        setIsLoading(false);
        setError(null);
        isNavigatingRef.current = false;

        const image = event.image;
        if (image) {
          currentImageIdRef.current = String(image.id);
          const pos = {
            lat: image.lngLat?.lat,
            lng: image.lngLat?.lng,
            id: String(image.id),
          };
          onPositionChange?.(pos);
        }
      });

      // Event: Viewer fully loaded
      viewer.on('load', () => {
        if (!isMounted) return;
        setIsLoading(false);
      });

      // Event: Camera bearing/pitch change
      viewer.on('pov', (event) => {
        if (!isMounted) return;
        if (typeof event.bearing === 'number') {
          onHeadingChange?.(event.bearing);
        }
      });

      viewerRef.current = viewer;

      // Force initial resizes after DOM layout stabilizes
      setTimeout(() => {
        if (isMounted && viewerRef.current) {
          try { viewerRef.current.resize(); } catch (e) { /* ignore */ }
        }
      }, 100);

      setTimeout(() => {
        if (isMounted && viewerRef.current) {
          try { viewerRef.current.resize(); } catch (e) { /* ignore */ }
        }
      }, 500);

    } catch (err) {
      console.error('Failed to initialize Mapillary viewer:', err);
      if (isMounted) {
        setError(err?.message || 'Failed to initialize Mapillary street view');
        setIsLoading(false);
      }
    }

    // ResizeObserver ensures WebGL canvas continuously matches panel dimensions
    const ro = new ResizeObserver(() => {
      if (viewerRef.current) {
        try {
          viewerRef.current.resize();
        } catch (e) {
          // ignore
        }
      }
    });

    if (containerRef.current) {
      ro.observe(containerRef.current);
    }

    return () => {
      isMounted = false;
      ro.disconnect();
      if (viewerRef.current) {
        try {
          viewerRef.current.remove();
        } catch (e) {
          // ignore
        }
        viewerRef.current = null;
      }
    };
  }, []); // Run once on mount

  // Handle imageId navigation changes
  useEffect(() => {
    if (!viewerRef.current || !imageId) return;
    if (!isValidMapillaryId(imageId)) {
      console.warn('Ignoring invalid Mapillary ID:', imageId);
      return;
    }
    const targetId = String(imageId);
    if (currentImageIdRef.current === targetId && !error) return;

    let isCancelled = false;

    const navigateToImage = async () => {
      setIsLoading(true);
      setError(null);
      isNavigatingRef.current = true;

      const viewer = viewerRef.current;
      if (!viewer) return;

      // Wait if viewer is still initializing or in cover mode
      if (!viewer.isNavigable) {
        await new Promise((resolve) => {
          const handler = (evt) => {
            if (evt?.navigable || viewer?.isNavigable) {
              viewer?.off('navigable', handler);
              resolve();
            }
          };
          viewer.on('navigable', handler);
          setTimeout(resolve, 3000); // safety fallback timeout
        });
      }

      if (isCancelled || !viewerRef.current) return;

      try {
        currentImageIdRef.current = targetId;
        await viewerRef.current.moveTo(targetId);
        if (!isCancelled) {
          setIsLoading(false);
          setError(null);
          isNavigatingRef.current = false;
        }
      } catch (err) {
        if (isCancelled) return;
        // Ignore CancelMapillaryError (user clicked another spot or image while transitioning)
        if (
          err?.name === 'CancelMapillaryError' ||
          err?.message?.toLowerCase().includes('cancel')
        ) {
          return;
        }
        console.warn('Mapillary navigation warning:', err);
        setError(err?.message || 'Failed to load street view image');
        setIsLoading(false);
        isNavigatingRef.current = false;
      }
    };

    navigateToImage();

    return () => {
      isCancelled = true;
    };
  }, [imageId]);

  // Steer camera toward landmark heading if requested
  useEffect(() => {
    if (!viewerRef.current || !steerTarget?.heading) return;
    try {
      const normalizedBearing = (steerTarget.heading % 360 + 360) % 360;
      const x = normalizedBearing / 360;
      viewerRef.current.setCenter([x, 0.5]);
    } catch (e) {
      // ignore steering if viewer not ready
    }
  }, [steerTarget]);

  // Retry handler
  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    const target = String(imageId || currentImageIdRef.current || DEFAULT_IMAGE_ID);
    if (viewerRef.current) {
      viewerRef.current.moveTo(target).then(() => {
        setIsLoading(false);
        setError(null);
      }).catch((e) => {
        setError(e?.message || 'Failed to load street view image');
        setIsLoading(false);
      });
    }
  }, [imageId]);

  return (
    <div className="panorama-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Loading overlay */}
      <div className={`pano-loading-overlay ${!isLoading || error ? 'fade-out' : ''}`}>
        <div className="spinner" />
        <p className="loading-text">Loading Mapillary street view...</p>
      </div>

      {/* Error state with Retry button */}
      {error && (
        <div
          className="pano-loading-overlay"
          style={{
            flexDirection: 'column',
            gap: '10px',
            background: 'rgba(10, 14, 23, 0.92)',
            zIndex: 60,
          }}
        >
          <p className="loading-text" style={{ color: 'var(--accent-warning)', margin: 0, fontSize: '0.88rem' }}>
            ⚠ {error}
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-sm btn-primary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              onClick={handleRetry}
            >
              🔄 Retry
            </button>
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              onClick={() => {
                setError(null);
                setIsLoading(true);
                currentImageIdRef.current = DEFAULT_IMAGE_ID;
                if (viewerRef.current) {
                  viewerRef.current.moveTo(DEFAULT_IMAGE_ID).catch(() => setIsLoading(false));
                }
              }}
            >
              🏠 Reset to Gate
            </button>
          </div>
        </div>
      )}

      {/* Street View Viewer container */}
      <div ref={containerRef} className="panorama-container" style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
