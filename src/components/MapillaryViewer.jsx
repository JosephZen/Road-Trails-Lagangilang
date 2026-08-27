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

  useEffect(() => {
    if (!containerRef.current || !imageId) return;

    let viewer = viewerRef.current;

    const initViewer = async () => {
      try {
        // Dynamic import since mapillary-js is an ESM module
        const { Viewer } = await import('mapillary-js');
        await import('mapillary-js/dist/mapillary.css');

        if (viewer) {
          // Just navigate to new image
          setIsLoading(true);
          viewer.moveTo(imageId).catch((err) => {
            console.error('Mapillary navigation error:', err);
            setError('Failed to load image');
            setIsLoading(false);
          });
          return;
        }

        // Create new viewer
        viewer = new Viewer({
          accessToken: MAPILLARY_ACCESS_TOKEN,
          container: containerRef.current,
          imageId: imageId,
        });

        // Listen for image changes
        viewer.on('image', (event) => {
          setIsLoading(false);
          setError(null);

          const image = event.image;
          if (image) {
            onPositionChange?.({
              lat: image.lngLat?.lat,
              lng: image.lngLat?.lng,
              id: image.id,
            });
          }
        });

        // Listen for bearing changes
        viewer.on('pov', (event) => {
          onHeadingChange?.(event.bearing);
        });

        viewer.on('load', () => {
          setIsLoading(false);
        });

        viewerRef.current = viewer;
      } catch (err) {
        console.error('Failed to initialize Mapillary viewer:', err);
        setError('Failed to initialize Mapillary viewer');
        setIsLoading(false);
      }
    };

    initViewer();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.remove();
        viewerRef.current = null;
      }
    };
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
