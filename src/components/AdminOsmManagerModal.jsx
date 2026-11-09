import React, { useState, useEffect, useRef } from 'react';
import osmtogeojson from 'osmtogeojson';

const STORAGE_CUSTOM_OSM_KEY = 'lagangilang_custom_osm_geojson';

export default function AdminOsmManagerModal({ isOpen, onClose, onUpdate, showToast }) {
  const [currentGeoJSON, setCurrentGeoJSON] = useState(null);
  const [stats, setStats] = useState({ total: 0, buildings: 0, roads: 0, barriers: 0, other: 0 });
  const [isCustomOverride, setIsCustomOverride] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [importMode, setImportMode] = useState('replace'); // 'replace' | 'merge'
  const fileInputRef = useRef(null);

  // Load current GeoJSON on open
  useEffect(() => {
    if (!isOpen) return;

    const loadCurrent = async () => {
      let geojson = null;
      let isOverride = false;
      try {
        const stored = localStorage.getItem(STORAGE_CUSTOM_OSM_KEY);
        if (stored) {
          geojson = JSON.parse(stored);
          isOverride = true;
        }
      } catch (_) {}

      if (!geojson) {
        try {
          const res = await fetch('/data/lagangilang-custom.geojson');
          if (res.ok) {
            geojson = await res.json();
          }
        } catch (e) {
          console.warn('Failed to load default bundled osm:', e);
        }
      }

      if (geojson && geojson.features) {
        setCurrentGeoJSON(geojson);
        setIsCustomOverride(isOverride);
        computeStats(geojson.features);
      }
    };

    loadCurrent();
    setPreviewData(null);
  }, [isOpen]);

  const computeStats = (features = []) => {
    let buildings = 0;
    let roads = 0;
    let barriers = 0;
    let other = 0;

    features.forEach((f) => {
      const p = f.properties || {};
      if (p.building || p.tags?.building) buildings++;
      else if (p.highway || p.tags?.highway) roads++;
      else if (p.barrier || p.tags?.barrier || p.access === 'no') barriers++;
      else other++;
    });

    setStats({ total: features.length, buildings, roads, barriers, other });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = async (file) => {
    setIsProcessing(true);
    const fileName = file.name;

    try {
      const text = await file.text();
      let parsedGeoJSON = null;

      // Check if file is XML (starts with < or has .osm / .xml extension)
      const isXml = fileName.endsWith('.osm') || fileName.endsWith('.xml') || text.trim().startsWith('<');

      if (isXml) {
        const parser = new DOMParser();
        const dom = parser.parseFromString(text, 'text/xml');
        parsedGeoJSON = osmtogeojson(dom, { flatProperties: true });
      } else {
        // Assume GeoJSON / JSON
        parsedGeoJSON = JSON.parse(text);
      }

      if (!parsedGeoJSON || !Array.isArray(parsedGeoJSON.features)) {
        throw new Error('Invalid file structure. Expected GeoJSON FeatureCollection or OSM XML.');
      }

      // Ensure flattened properties on all features
      parsedGeoJSON.features = parsedGeoJSON.features.map((f) => {
        if (!f.properties) f.properties = {};
        if (f.properties.tags && typeof f.properties.tags === 'object') {
          f.properties = { ...f.properties.tags, ...f.properties };
        }
        return f;
      });

      // Compute preview stats
      let pBuildings = 0, pRoads = 0, pBarriers = 0, pOther = 0;
      parsedGeoJSON.features.forEach((f) => {
        const p = f.properties || {};
        if (p.building) pBuildings++;
        else if (p.highway) pRoads++;
        else if (p.barrier || p.access === 'no') pBarriers++;
        else pOther++;
      });

      setPreviewData({
        fileName,
        features: parsedGeoJSON.features,
        stats: {
          total: parsedGeoJSON.features.length,
          buildings: pBuildings,
          roads: pRoads,
          barriers: pBarriers,
          other: pOther,
        },
      });

      if (showToast) showToast(`Parsed ${parsedGeoJSON.features.length} features from ${fileName}`);
    } catch (err) {
      console.error('OSM file parsing error:', err);
      alert(`Failed to parse file: ${err.message}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApplyChanges = () => {
    if (!previewData || !previewData.features) return;

    let finalFeatures = [];

    if (importMode === 'replace') {
      // Replace existing custom map completely
      finalFeatures = previewData.features;
    } else {
      // Add / Merge Area: Keep current features, append new ones, deduplicate by feature.id
      const existingMap = new Map();
      (currentGeoJSON?.features || []).forEach((f) => {
        const id = f.id || `${f.properties?.type || 'feat'}/${f.properties?.id || Math.random()}`;
        existingMap.set(id, f);
      });

      previewData.features.forEach((f) => {
        const id = f.id || `${f.properties?.type || 'feat'}/${f.properties?.id || Math.random()}`;
        existingMap.set(id, f); // Overwrite or add
      });

      finalFeatures = Array.from(existingMap.values());
    }

    const updatedGeoJSON = {
      type: 'FeatureCollection',
      features: finalFeatures,
      metadata: {
        updatedAt: new Date().toISOString(),
        mode: importMode,
        featureCount: finalFeatures.length,
      },
    };

    // Save locally
    try {
      localStorage.setItem(STORAGE_CUSTOM_OSM_KEY, JSON.stringify(updatedGeoJSON));
    } catch (e) {
      console.warn('LocalStorage save notice (exceeded quota?):', e);
    }

    // Update parent and dispatch event
    setCurrentGeoJSON(updatedGeoJSON);
    setIsCustomOverride(true);
    computeStats(finalFeatures);
    setPreviewData(null);

    if (onUpdate) onUpdate(updatedGeoJSON);
    window.dispatchEvent(new CustomEvent('custom-osm-updated', { detail: updatedGeoJSON }));

    if (showToast) {
      showToast(
        importMode === 'replace'
          ? `✅ Replaced custom map (${finalFeatures.length} features active)`
          : `✅ Merged new area! Total features: ${finalFeatures.length}`
      );
    }
  };

  const handleResetToDefault = async () => {
    if (!window.confirm('Reset custom map back to the default bundled Lagangilang OSM map?')) return;

    localStorage.removeItem(STORAGE_CUSTOM_OSM_KEY);
    setIsCustomOverride(false);

    try {
      const res = await fetch('/data/lagangilang-custom.geojson');
      if (res.ok) {
        const defaultGeoJSON = await res.json();
        setCurrentGeoJSON(defaultGeoJSON);
        computeStats(defaultGeoJSON.features);
        if (onUpdate) onUpdate(defaultGeoJSON);
        window.dispatchEvent(new CustomEvent('custom-osm-updated', { detail: defaultGeoJSON }));
        if (showToast) showToast('Restored default bundled Lagangilang custom OSM map');
      }
    } catch (e) {
      console.error('Reset error:', e);
    }
  };

  const handleDownloadGeoJSON = () => {
    if (!currentGeoJSON) return;
    const blob = new Blob([JSON.stringify(currentGeoJSON, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lagangilang-custom-osm-${Date.now()}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (showToast) showToast('GeoJSON exported to downloads');
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 2200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#f8fafc',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>🗺️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Custom OSM Map Manager</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Import OpenStreetMap (.osm XML) or GeoJSON for Lagangilang
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ width: '32px', height: '32px', padding: 0, borderRadius: '50%' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Current Status Box */}
          <div
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8' }}>ACTIVE MAP OVERLAY</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: isCustomOverride ? 'rgba(59, 130, 246, 0.25)' : 'rgba(16, 185, 129, 0.25)',
                  color: isCustomOverride ? '#93c5fd' : '#6ee7b7',
                  border: `1px solid ${isCustomOverride ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                }}
              >
                {isCustomOverride ? 'Custom Imported' : 'Bundled Default'}
              </span>
            </div>

            <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>
              {stats.total.toLocaleString()} Total Features
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc',
                }}
              >
                🏛️ Buildings: {stats.buildings}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fcd34d',
                }}
              >
                🛣️ Roads: {stats.roads}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#fca5a5',
                }}
              >
                🚧 Barriers: {stats.barriers}
              </span>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            style={{
              border: '2px dashed rgba(255, 255, 255, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'rgba(15, 23, 42, 0.5)',
              transition: 'border-color 0.2s',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              const file = e.dataTransfer.files?.[0];
              if (file) processFile(file);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".osm,.xml,.geojson,.json"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>📁</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Click to browse or drop an .osm or .geojson file</div>
            <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: '4px' }}>
              Supports OpenStreetMap XML exports (.osm) from JOSM / OSM.org &amp; GeoJSON
            </div>
          </div>

          {/* Processing Indicator */}
          {isProcessing && (
            <div style={{ textAlign: 'center', padding: '10px', color: '#38bdf8' }}>
              ⏳ Parsing OSM geometries and flattening tags...
            </div>
          )}

          {/* Preview of Selected File */}
          {previewData && (
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(30, 41, 59, 0.9)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>
                  📄 Ready to Import: {previewData.fileName}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {previewData.stats.total} features found
                </span>
              </div>

              {/* Import Mode Selector */}
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '8px' }}>
                  Select Import Action:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    style={{
                      padding: '10px',
                      borderRadius: 'var(--radius-sm)',
                      border: importMode === 'replace' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                      background: importMode === 'replace' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                      color: importMode === 'replace' ? '#fff' : '#94a3b8',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>🔄 Replace Map</div>
                    <div style={{ fontSize: '0.7rem', marginTop: '2px', opacity: 0.8 }}>
                      Overwrites current map in this area
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    style={{
                      padding: '10px',
                      borderRadius: 'var(--radius-sm)',
                      border: importMode === 'merge' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      background: importMode === 'merge' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                      color: importMode === 'merge' ? '#fff' : '#94a3b8',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>➕ Add / Merge Area</div>
                    <div style={{ fontSize: '0.7rem', marginTop: '2px', opacity: 0.8 }}>
                      Appends new area to existing features
                    </div>
                  </button>
                </div>
              </div>

              {/* Action Buttons for Preview */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleApplyChanges}
                  style={{ flex: 1, padding: '10px', fontSize: '0.85rem' }}
                >
                  {importMode === 'replace' ? 'Apply & Replace Map' : 'Apply & Merge Area'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setPreviewData(null)}
                  style={{ padding: '10px 14px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              className="btn btn-secondary"
              onClick={handleDownloadGeoJSON}
              style={{ flex: 1, fontSize: '0.8rem', padding: '8px 12px' }}
              title="Export current GeoJSON to your device"
            >
              📥 Export GeoJSON
            </button>
            {isCustomOverride && (
              <button
                className="btn btn-secondary"
                onClick={handleResetToDefault}
                style={{ flex: 1, fontSize: '0.8rem', padding: '8px 12px', color: '#f87171' }}
                title="Discard custom imported map and revert to default"
              >
                🔄 Reset to Default
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '8px 18px', fontSize: '0.85rem' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
