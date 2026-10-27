import React, { useState, useEffect } from 'react';
import offlineCacheService from '../services/offlineCacheService';

/**
 * OfflineGuideModal Component
 * Allows tourists and municipal officers to download the entire Lagangilang map,
 * tourist spots, trail routes, emergency contacts, and offline guide into local storage
 * so the system functions in dead zones and zero-signal mountain trails.
 */
export default function OfflineGuideModal({
  isOpen,
  onClose,
  touristSpots = [],
  customGeoJSON = null,
  showToast,
}) {
  const [cachedBundle, setCachedBundle] = useState(null);
  const [isCaching, setIsCaching] = useState(false);
  const [isDataSaver, setIsDataSaver] = useState(() => offlineCacheService.isDataSaver);

  useEffect(() => {
    if (isOpen) {
      setCachedBundle(offlineCacheService.getCachedBundle());
      setIsDataSaver(offlineCacheService.isDataSaver);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsCaching(true);
    try {
      const res = await offlineCacheService.cacheOfflineBundle(touristSpots, customGeoJSON);
      setCachedBundle(offlineCacheService.getCachedBundle());
      showToast?.(`📥 Successfully cached ${res.count} spots & trail guide for offline use!`);
    } catch (e) {
      showToast?.(`⚠️ Cache error: ${e.message}`);
    } finally {
      setIsCaching(false);
    }
  };

  const handleClear = () => {
    offlineCacheService.clearCachedBundle();
    setCachedBundle(null);
    showToast?.('🗑️ Offline cache cleared');
  };

  const handleToggleDataSaver = () => {
    const next = !isDataSaver;
    setIsDataSaver(next);
    offlineCacheService.setDataSaverPreference(next);
    showToast?.(
      next
        ? '⚡ Low-Data Mode ENABLED: 360 preloading paused, lighter image fallbacks'
        : '🌐 Full Bandwidth Mode restored'
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '520px',
          width: '92%',
          padding: '20px',
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
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#34d399' }}>
                Offline Maps & Low-Data Mode
              </h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                For Zero-Signal Mountain Trails & Remote Areas in Lagangilang
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
            background: cachedBundle ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
            border: cachedBundle ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '14px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff' }}>
              {cachedBundle ? '🟢 Offline Guide Ready' : '⚪ No Offline Guide Cached'}
            </span>
            {cachedBundle && (
              <span style={{ fontSize: '0.7rem', color: '#6ee7b7' }}>
                {cachedBundle.spotsCount} Spots Available Offline
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
            {cachedBundle
              ? `Downloaded on ${new Date(cachedBundle.cachedAt).toLocaleDateString()} at ${new Date(cachedBundle.cachedAt).toLocaleTimeString()}. All spot GPS pins, descriptions, emergency hotlines, and trail tips are stored on your device.`
              : 'Download the offline guide package before heading out to trails with spotty or zero cellular coverage (e.g. Ugiao River, BANAT Caves, Quirsodan Dam).'}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={isCaching}
            style={{
              flex: 1,
              padding: '8px 14px',
              fontSize: '0.82rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              borderColor: '#10b981',
            }}
          >
            {isCaching ? '⏳ Downloading Guide...' : '📥 Download Offline Guide'}
          </button>

          {cachedBundle && (
            <button
              className="btn btn-danger"
              onClick={handleClear}
              style={{ padding: '8px 12px', fontSize: '0.78rem' }}
            >
              🗑️ Clear Cache
            </button>
          )}
        </div>

        {/* Data Saver Mode Toggle */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '12px 14px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '1rem' }}>⚡</span>
              <strong style={{ fontSize: '0.84rem', color: '#ffffff' }}>Low-Data / Data Saver Mode</strong>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
              Compresses panoramas and prevents heavy background 360 pre-fetching to save mobile data.
            </p>
          </div>
          <button
            onClick={handleToggleDataSaver}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full, 9999px)',
              fontSize: '0.76rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: isDataSaver ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.2)',
              background: isDataSaver ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              color: isDataSaver ? '#34d399' : '#94a3b8',
              transition: 'all 0.18s ease',
            }}
          >
            {isDataSaver ? 'ON 🟢' : 'OFF ⚪'}
          </button>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '6px 18px', fontSize: '0.8rem' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
