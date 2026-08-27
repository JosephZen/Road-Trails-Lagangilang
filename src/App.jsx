import React, { useState, useEffect, useCallback, useRef } from 'react';
import MapView from './components/MapView';
import PanoramaViewer from './components/PanoramaViewer';
import MapillaryViewer from './components/MapillaryViewer';
import NavigationArrows from './components/NavigationArrows';
import MiniMap from './components/MiniMap';
import UploadModal from './components/UploadModal';
import { usePreloader } from './hooks/usePreloader';
import { useMapillary } from './hooks/useMapillary';
import { formatCoords } from './utils/geoUtils';

const API_BASE = 'http://localhost:3001';

/**
 * Main application shell.
 * Split-screen layout: Map (left) | Panorama Viewer (right).
 * Supports Local mode (Pannellum) and Cloud mode (Mapillary).
 */
export default function App() {
  // App state
  const [mode, setMode] = useState('local'); // 'local' | 'cloud'
  const [panoramas, setPanoramas] = useState([]);
  const [activePano, setActivePano] = useState(null);
  const [viewerHeading, setViewerHeading] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Mapillary state
  const [mapillaryImageId, setMapillaryImageId] = useState(null);
  const [mapillaryImages, setMapillaryImages] = useState([]);
  const { searchNearby, accessToken } = useMapillary();

  // Preloader for local mode
  const { preloadStatus, getCachedUrl } = usePreloader(
    activePano?.id,
    panoramas
  );

  // Map resize
  const [mapWidth, setMapWidth] = useState(45); // percentage
  const resizing = useRef(false);

  // Fetch panoramas from backend
  const fetchPanoramas = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/panoramas`);
      if (res.ok) {
        const data = await res.json();
        setPanoramas(data.panoramas || []);
      }
    } catch (err) {
      console.warn('Backend not running, using empty panorama list');
    }
  }, []);

  useEffect(() => {
    fetchPanoramas();
  }, [fetchPanoramas]);

  // Handle selecting a panorama from the map
  const handleSelectPano = useCallback(
    (pano) => {
      if (mode === 'local') {
        setActivePano(pano);
        setViewerOpen(true);
      } else {
        // In cloud mode, search for Mapillary images near this point
        searchNearby(pano.lat, pano.lng).then((images) => {
          setMapillaryImages(images);
          if (images.length > 0) {
            setMapillaryImageId(images[0].id);
            setViewerOpen(true);
          }
        });
      }
    },
    [mode, searchNearby]
  );

  // Handle navigating to a neighbor panorama (bullet view)
  const handleNavigate = useCallback((neighborPano) => {
    setActivePano(neighborPano);
  }, []);

  // Handle clicking on the map — works in both modes
  const handleMapClick = useCallback(
    async (lat, lng, clickedMapillaryId) => {
      // If we clicked on a Mapillary feature (green line/dot)
      if (clickedMapillaryId) {
        // Auto-switch to cloud mode and open the Mapillary viewer directly
        setMode('cloud');
        setMapillaryImageId(clickedMapillaryId);
        setViewerOpen(true);
        return;
      }

      // If we clicked on a Mapillary sequence (no direct ID), search nearby
      if (mode === 'cloud') {
        const images = await searchNearby(lat, lng);
        setMapillaryImages(images);
        if (images.length > 0) {
          setMapillaryImageId(images[0].id);
          setViewerOpen(true);
        }
      }
    },
    [mode, searchNearby]
  );

  // Resize handle logic
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    resizing.current = true;

    const onMouseMove = (e) => {
      if (!resizing.current) return;
      const percentage = (e.clientX / window.innerWidth) * 100;
      setMapWidth(Math.max(25, Math.min(75, percentage)));
    };

    const onMouseUp = () => {
      resizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Close viewer
  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
    setActivePano(null);
    setMapillaryImageId(null);
  }, []);

  return (
    <div className="app-container">
      {/* ===== Map Panel ===== */}
      <div
        className={`panel-map ${!viewerOpen ? 'expanded' : ''}`}
        style={viewerOpen ? { flex: `0 0 ${mapWidth}%` } : {}}
      >
        {/* Map top controls */}
        <div className="map-overlay-top">
          {/* Mode Toggle */}
          <div className="mode-toggle">
            <button
              className={`mode-toggle-btn ${mode === 'local' ? 'active' : ''}`}
              onClick={() => setMode('local')}
            >
              📁 Local
            </button>
            <button
              className={`mode-toggle-btn ${mode === 'cloud' ? 'active' : ''}`}
              onClick={() => setMode('cloud')}
            >
              ☁ Cloud
            </button>
          </div>

          {/* Upload button */}
          <button
            className="btn btn-primary btn-icon"
            onClick={() => setShowUpload(true)}
            title="Upload 360° panorama"
            style={{ fontSize: '1.2rem' }}
          >
            +
          </button>

          {/* Sidebar toggle */}
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Panorama list"
          >
            ☰
          </button>
        </div>

        {/* MapLibre Map */}
        <MapView
          panoramas={panoramas}
          activePanoId={activePano?.id}
          onSelectPano={handleSelectPano}
          onMapClick={handleMapClick}
          viewerHeading={viewerHeading}
          mapCenter={
            panoramas.length > 0
              ? [panoramas[0].lng, panoramas[0].lat]
              : [120.7333, 17.6167]
          }
          mapZoom={15}
        />

        {/* Resize handle */}
        {viewerOpen && (
          <div
            className={`resize-handle ${resizing.current ? 'active' : ''}`}
            onMouseDown={handleResizeStart}
          />
        )}

        {/* Sidebar - Panorama List */}
        <div className={`sidebar glass-panel ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <span className="sidebar-title">📍 Panoramas</span>
            <button
              className="sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
            >
              ✕
            </button>
          </div>

          {panoramas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No panoramas yet.
              </p>
              <button
                className="btn btn-primary"
                style={{ marginTop: '12px' }}
                onClick={() => {
                  setSidebarOpen(false);
                  setShowUpload(true);
                }}
              >
                + Upload First Image
              </button>
            </div>
          ) : (
            <div className="pano-list">
              {panoramas.map((pano) => (
                <div
                  key={pano.id}
                  className={`pano-list-item ${activePano?.id === pano.id ? 'active' : ''}`}
                  onClick={() => handleSelectPano(pano)}
                >
                  {pano.thumbnail && (
                    <img
                      className="pano-thumb"
                      src={`${API_BASE}/panoramas/${pano.thumbnail}`}
                      alt={pano.label || pano.id}
                    />
                  )}
                  <div className="pano-info">
                    <h4>{pano.label || pano.id}</h4>
                    <p>{formatCoords(pano.lat, pano.lng)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Viewer Panel ===== */}
      <div className={`panel-viewer ${!viewerOpen ? 'hidden' : ''}`}>
        {viewerOpen && (
          <>
            {/* Top bar with location info */}
            <div className="viewer-top-bar glass-panel-sm">
              <div className="viewer-location-info">
                <div className="location-icon">
                  {mode === 'local' ? '📍' : '☁'}
                </div>
                <div className="location-text">
                  <h3>
                    {activePano?.label || activePano?.id || 'Mapillary View'}
                  </h3>
                  <p>
                    {activePano
                      ? formatCoords(activePano.lat, activePano.lng)
                      : 'Cloud imagery'}
                    {mode === 'local' && activePano?.heading !== undefined && (
                      <span> • Heading: {Math.round(viewerHeading)}°</span>
                    )}
                  </p>
                </div>
              </div>

              <button
                className="btn btn-ghost"
                onClick={handleCloseViewer}
                title="Close viewer"
                style={{ fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            {/* Panorama Viewer */}
            {mode === 'local' && activePano ? (
              <>
                <PanoramaViewer
                  panorama={activePano}
                  panoramas={panoramas}
                  getCachedUrl={getCachedUrl}
                  onNavigate={handleNavigate}
                  onHeadingChange={setViewerHeading}
                />

                {/* Navigation arrows */}
                <NavigationArrows
                  currentPano={activePano}
                  panoramas={panoramas}
                  onNavigate={handleNavigate}
                />

                {/* Preload status indicator */}
                <div className="preload-indicator glass-panel-sm">
                  <div
                    className={`preload-dot ${preloadStatus.loading ? 'loading' : ''}`}
                  />
                  <span>
                    {preloadStatus.loading
                      ? 'Preloading...'
                      : `${preloadStatus.cached} cached`}
                  </span>
                </div>
              </>
            ) : mode === 'cloud' && mapillaryImageId ? (
              <MapillaryViewer
                imageId={mapillaryImageId}
                onPositionChange={(pos) => {
                  // Update active pano info so top bar and mini-map track position
                  setActivePano({
                    id: pos.id,
                    lat: pos.lat,
                    lng: pos.lng,
                    label: `Mapillary ${pos.id}`,
                  });
                  // Update the Mapillary image ID so re-renders stay in sync
                  setMapillaryImageId(pos.id);
                }}
                onHeadingChange={setViewerHeading}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🌐</div>
                <h3>No panorama selected</h3>
                <p>Click on a marker on the map to view a 360° panorama</p>
              </div>
            )}

            {/* Mini map in viewer */}
            {activePano && (
              <MiniMap
                lat={activePano.lat}
                lng={activePano.lng}
                heading={viewerHeading}
                panoramas={panoramas}
              />
            )}

            {/* Floating toolbar */}
            <div className="floating-toolbar glass-panel-sm">
              <button
                className={`toolbar-btn ${mode === 'local' ? 'active' : ''}`}
                onClick={() => setMode('local')}
                title="Local mode"
              >
                📁
              </button>
              <div className="toolbar-divider" />
              <button
                className={`toolbar-btn ${mode === 'cloud' ? 'active' : ''}`}
                onClick={() => setMode('cloud')}
                title="Cloud mode (Mapillary)"
              >
                ☁
              </button>
              <div className="toolbar-divider" />
              <button
                className="toolbar-btn"
                onClick={() => setShowUpload(true)}
                title="Upload panorama"
              >
                📤
              </button>
            </div>
          </>
        )}

        {/* Empty state when viewer is hidden */}
        {!viewerOpen && (
          <div className="empty-state" style={{ display: 'none' }}>
            {/* Hidden when panel is collapsed */}
          </div>
        )}
      </div>

      {/* ===== Upload Modal ===== */}
      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onUploadComplete={fetchPanoramas}
      />
    </div>
  );
}
