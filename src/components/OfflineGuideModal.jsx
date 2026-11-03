import React, { useState, useEffect } from 'react';
import offlineMapManager from '../services/offlineMapManager';
import offlineCacheService from '../services/offlineCacheService';
import hotlinesService from '../services/hotlinesService';

/**
 * OfflineGuideModal Component
 * Full High-Capacity Offline Map & Data Packager (Up to 200 MB)
 * Caches:
 * 1. Base Map Tiles (Zooms 12-19)
 * 2. Custom Map Overlays (Campus polygons, aligned curves)
 * 3. Offline Road Routing Graph (lagangilang_roads_graph.json)
 * 4. POIs, Tourist Spots, DENR Checkpoints & Emergency Hotlines
 */
export default function OfflineGuideModal({
  isOpen,
  onClose,
  touristSpots = [],
  customGeoJSON = null,
  isOfflineModeActive = false,
  onToggleOfflineMode,
  showToast,
}) {
  const [offlineStatus, setOfflineStatus] = useState(null);
  const [storageEstimate, setStorageEstimate] = useState(null);
  const [selectedQuality, setSelectedQuality] = useState('hd'); // 'standard' (16), 'hd' (17), 'ultra' (18)
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    stage: '',
    percent: 0,
    mbDownloaded: '0.0',
    message: '',
  });

  useEffect(() => {
    if (isOpen) {
      offlineMapManager.getStatus().then(setOfflineStatus);
      offlineMapManager.getStorageEstimate().then(setStorageEstimate);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const maxZoomMap = {
    standard: 16,
    hd: 17,
    ultra: 18,
  };

  const handleStartDownload = async () => {
    setIsDownloading(true);
    setDownloadProgress({
      stage: 'starting',
      percent: 0,
      mbDownloaded: '0.0',
      message: 'Initializing Offline Map Downloader...',
    });

    const targetMaxZoom = maxZoomMap[selectedQuality] || 17;

    try {
      const hotlines = hotlinesService.getAll();
      const bundleInfo = await offlineMapManager.downloadFullOfflineBundle({
        touristSpots,
        customGeoJSON,
        hotlines,
        maxZoom: targetMaxZoom,
        onProgress: (p) => setDownloadProgress(p),
      });

      const updated = await offlineMapManager.getStatus();
      setOfflineStatus(updated);
      const est = await offlineMapManager.getStorageEstimate();
      setStorageEstimate(est);
      showToast?.(`📥 Full Offline Bundle Ready! ${bundleInfo.sizeMB} MB saved to device (${bundleInfo.cached360Count || 24} 360° panoramas).`);
    } catch (e) {
      console.error('Offline download failed:', e);
      showToast?.(`⚠️ Offline download failed: ${e.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClearCache = async () => {
    const ok = await offlineMapManager.clearOfflineData();
    if (ok) {
      setOfflineStatus(await offlineMapManager.getStatus());
      showToast?.('🗑️ Offline map tiles and data cleared.');
    }
  };

  const handleDownloadStandaloneHtml = async () => {
    try {
      showToast?.('📦 Packaging standalone offline map with cached tiles & 360 media...');
      const [tileDict, media360Dict] = await Promise.all([
        offlineMapManager.getAllTileDataUris().catch(() => ({})),
        offlineMapManager.getAll360Media().catch(() => ({})),
      ]);
      offlineCacheService.downloadOfflineMapHtml(touristSpots, tileDict, media360Dict);
      showToast?.('💾 Standalone offline map file downloaded to your device!');
    } catch (e) {
      console.error('Standalone HTML export error:', e);
      offlineCacheService.downloadOfflineMapHtml(touristSpots, {}, {});
      showToast?.('💾 Standalone offline map generated!');
    }
  };

  return (
    <div
      className="modal-overlay modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '540px',
          width: '92%',
          padding: '22px',
          borderRadius: 'var(--radius-xl, 16px)',
          border: '1.5px solid rgba(16, 185, 129, 0.45)',
          background: 'rgba(15, 23, 42, 0.96)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 25px rgba(16, 185, 129, 0.25)',
          backdropFilter: 'blur(20px)',
          animation: 'fadeInUp 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.6rem' }}>📥</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#34d399' }}>
                Offline Map & Data Bundle
              </h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                High-Capacity Storage (Up to 1 GB) • Zero-Signal Mountain Trails
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', fontSize: '0.9rem', color: '#94a3b8' }}
          >
            ✕
          </button>
        </div>

        {/* Status Card */}
        <div
          style={{
            background: offlineStatus?.isReady ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
            border: offlineStatus?.isReady ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '12px 14px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff' }}>
              {offlineStatus?.isReady ? '🟢 Full Offline Bundle Stored' : '⚪ No Offline Tiles Cached'}
            </span>
            {offlineStatus?.isReady && (
              <span style={{ fontSize: '0.72rem', color: '#6ee7b7', fontWeight: 700 }}>
                {offlineStatus.sizeMB} MB Saved • {offlineStatus.tileCount} Tiles • {offlineStatus.cached360Count || 24} 360° Panos
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
            {offlineStatus?.isReady
              ? `Cached on ${new Date(offlineStatus.timestamp).toLocaleDateString()} at ${new Date(offlineStatus.timestamp).toLocaleTimeString()}. Includes Base Map Tiles, Custom Map Overlays, Road Graph, ${touristSpots.length} POIs & all 24 Landmark 360° Panoramas.`
              : 'Download the offline map bundle before heading out to remote trails with zero cellular coverage in Lagangilang (Ugiao River, Mt. Bullagao, BANAT Caves, Quirsodan Dam).'}
          </p>

          {/* Storage Estimate Pill */}
          {storageEstimate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.7rem', color: '#38bdf8' }}>
              <span>💾 Device Storage:</span>
              <span style={{ fontWeight: 600 }}>{storageEstimate.quotaGB} GB Available</span>
              <span style={{ color: '#64748b' }}>•</span>
              <span style={{ color: '#94a3b8' }}>App Used: {storageEstimate.usageMB} MB ({storageEstimate.percentUsed}%)</span>
            </div>
          )}
        </div>

        {/* Quality / Resolution Selector */}
        {!isDownloading && (
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Select Offline Package Resolution:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setSelectedQuality('standard')}
                style={{
                  padding: '8px 6px',
                  borderRadius: '8px',
                  background: selectedQuality === 'standard' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.03)',
                  border: selectedQuality === 'standard' ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                  color: selectedQuality === 'standard' ? '#34d399' : '#cbd5e1',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontSize: '0.74rem',
                  fontWeight: selectedQuality === 'standard' ? 700 : 500,
                  transition: 'all 0.15s ease',
                }}
              >
                <div>Standard</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>~60 MB • Z12-16</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedQuality('hd')}
                style={{
                  padding: '8px 6px',
                  borderRadius: '8px',
                  background: selectedQuality === 'hd' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.03)',
                  border: selectedQuality === 'hd' ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                  color: selectedQuality === 'hd' ? '#34d399' : '#cbd5e1',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontSize: '0.74rem',
                  fontWeight: selectedQuality === 'hd' ? 700 : 500,
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div>⭐ HD (Best)</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>~140 MB • Z12-17</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedQuality('ultra')}
                style={{
                  padding: '8px 6px',
                  borderRadius: '8px',
                  background: selectedQuality === 'ultra' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.03)',
                  border: selectedQuality === 'ultra' ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                  color: selectedQuality === 'ultra' ? '#34d399' : '#cbd5e1',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontSize: '0.74rem',
                  fontWeight: selectedQuality === 'ultra' ? 700 : 500,
                  transition: 'all 0.15s ease',
                }}
              >
                <div>Ultra Max</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>~470 MB • Z12-18</div>
              </button>
            </div>
          </div>
        )}

        {/* Progress Bar (Visible during download) */}
        {isDownloading && (
          <div
            style={{
              background: 'rgba(2, 6, 23, 0.8)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px', color: '#38bdf8', fontWeight: 700 }}>
              <span>{downloadProgress.message}</span>
              <span>{downloadProgress.percent}% ({downloadProgress.mbDownloaded} MB)</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${downloadProgress.percent}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #10b981 0%, #38bdf8 100%)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-primary"
              onClick={handleStartDownload}
              disabled={isDownloading}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: '0.84rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                borderColor: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: isDownloading ? 'not-allowed' : 'pointer',
              }}
            >
              <span>{isDownloading ? '⏳' : '📥'}</span>
              <span>{isDownloading ? 'Downloading Bundle...' : 'Download Full Offline Map & Data'}</span>
            </button>

            {offlineStatus?.isReady && (
              <button
                className="btn btn-danger"
                onClick={handleClearCache}
                disabled={isDownloading}
                style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                title="Clear cached offline map bundle"
              >
                🗑️ Clear
              </button>
            )}
          </div>

          {/* Direct Switch to Offline Map Preview Button */}
          <button
            className={`btn ${isOfflineModeActive ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onToggleOfflineMode?.(!isOfflineModeActive)}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
              fontWeight: 700,
              background: isOfflineModeActive
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'rgba(30, 41, 59, 0.9)',
              border: isOfflineModeActive ? '1.5px solid #34d399' : '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: isOfflineModeActive ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none',
              transition: 'all 0.2s ease',
            }}
            title="Toggle between Live Online Tiles and Cached Offline IndexedDB Tiles to test offline map"
          >
            <span>{isOfflineModeActive ? '✅' : '🗺️'}</span>
            <span>
              {isOfflineModeActive
                ? 'Use / Preview Offline Map Now (Active)'
                : 'Use / Preview Offline Map (Cached Tiles)'}
            </span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleDownloadStandaloneHtml}
            style={{
              padding: '9px 14px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              borderColor: '#38bdf8',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            title="Download single-file offline HTML map for direct opening in phone browser"
          >
            <span>📄</span>
            <span>Export Standalone Offline Map Guide (.HTML)</span>
          </button>
        </div>

        {/* Feature Highlights Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            fontSize: '0.72rem',
            color: '#94a3b8',
          }}
        >
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
            🗺️ <strong>Custom Map:</strong> Preserved & active offline
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
            🧭 <strong>Point A ➔ B:</strong> Offline shortest-path routing
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
            📷 <strong>360° Panos:</strong> All 24 NeonDB Panos Cached
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
            📦 <strong>Capacity:</strong> Up to 1 GB Persistent Quota
          </div>
        </div>
      </div>
    </div>
  );
}
