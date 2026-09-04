import React, { useEffect, useRef, useState } from 'react';

const MAPILLARY_ACCESS_TOKEN = 'MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9';

/**
 * Mapillary cloud-based 360° viewer using mapillary-js.
 * Renders street-level imagery from Mapillary's CDN.
 */
export default function MapillaryViewer({
  imageId,
  onPositionChange,
  onHeadingChange,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const currentImageIdRef = useRef(null);

  // Effect 1: Initialize Viewer
  useEffect(() => {
    if (!containerRef.current) return;

    let viewer;
    let isMounted = true;

    const initViewer = async () => {
      try {
        const { Viewer } = await import('mapillary-js');
        await import('mapillary-js/dist/mapillary.css');

        if (!isMounted) return;

        viewer = new Viewer({
          accessToken: MAPILLARY_ACCESS_TOKEN,
          container: containerRef.current,
          imageId: imageId || '123456789', // Fallback if somehow null
        });

        viewer.on('image', (event) => {
          setIsLoading(false);
          setError(null);
          const image = event.image;
          if (image) {
            currentImageIdRef.current = image.id;
            onPositionChange?.({
              lat: image.lngLat?.lat,
              lng: image.lngLat?.lng,
              id: image.id,
            });
          }
        });

        viewer.on('pov', (event) => {
          onHeadingChange?.(event.bearing);
        });

        viewer.on('load', () => {
          setIsLoading(false);
        });

        viewerRef.current = viewer;

        // If imageId changed while initializing, move to it
        if (imageId && currentImageIdRef.current !== imageId) {
          currentImageIdRef.current = imageId;
          viewer.moveTo(imageId).catch(console.error);
        }

      } catch (err) {
        console.error('Failed to initialize Mapillary viewer:', err);
        if (isMounted) {
          setError('Failed to initialize Mapillary viewer');
          setIsLoading(false);
        }
      }
    };

    initViewer();

    return () => {
      isMounted = false;
      if (viewerRef.current) {
        viewerRef.current.remove();
        viewerRef.current = null;
      }
    };
  }, []); // Run only once on mount

  // Effect 2: Handle imageId changes
  useEffect(() => {
    if (viewerRef.current && imageId) {
      if (currentImageIdRef.current === imageId) return; // Already on this image
      
      setIsLoading(true);
      currentImageIdRef.current = imageId;
      viewerRef.current.moveTo(imageId).catch((err) => {
        console.error('Mapillary navigation error:', err);
        setError('Failed to load image');
        setIsLoading(false);
      });
    }
  }, [imageId]);

  return (
    <div className="panorama-wrapper">
      {/* Loading overlay */}
      <div className={`pano-loading-overlay ${!isLoading ? 'fade-out' : ''}`}>
        <div className="spinner" />
        <p className="loading-text">Loading Mapillary imagery...</p>
      </div>

      {/* Error state */}
      {error && (
        <div className="pano-loading-overlay">
          <p className="loading-text" style={{ color: 'var(--accent-warning)' }}>
            ⚠ {error}
          </p>
        </div>
      )}

      {/* Viewer container */}
      <div ref={containerRef} className="panorama-container" />
    </div>
  );
}
