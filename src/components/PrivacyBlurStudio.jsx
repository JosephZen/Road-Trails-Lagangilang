import React, { useState, useRef, useEffect, useCallback } from 'react';
import { touristSpotsService } from '../services/touristSpotsService';

const PRESETS_STORAGE_KEY = 'lagangilang_privacy_presets_v1';
const DEFAULT_PRESET_KEY = 'lagangilang_default_privacy_preset_id';

// Default built-in presets for common 360 camera rigs
const DEFAULT_PRESETS = [
  {
    id: 'preset_tripod_nadir',
    name: '📷 Tripod / Selfie Stick Nadir',
    description: 'Blurs the bottom center tripod mount',
    zones: [
      { xPct: 0.42, yPct: 0.84, wPct: 0.16, hPct: 0.16, type: 'pixelate', strength: 16 },
    ],
  },
  {
    id: 'preset_vehicle_hood',
    name: '🚗 Survey Vehicle Hood & Roof',
    description: 'Blurs bottom vehicle hood and roof rack',
    zones: [
      { xPct: 0.25, yPct: 0.82, wPct: 0.50, hPct: 0.18, type: 'pixelate', strength: 18 },
    ],
  },
];

/**
 * PrivacyBlurStudio
 * Allows users to manually outline/draw blur regions over faces, vehicle plates,
 * or camera rigs in raw 360 panoramas before saving to database.
 * Supports saving and applying reusable blur presets across all or certain images.
 */
export default function PrivacyBlurStudio({
  isOpen,
  onClose,
  imageUrl,
  imageName = '360 Panorama',
  onSaveBlurredImage,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Editing state
  const [blurMode, setBlurMode] = useState('pixelate'); // 'pixelate' | 'blur' | 'blackout'
  const [blurStrength, setBlurStrength] = useState(16); // px block size or blur radius
  const [zones, setZones] = useState([]); // Array of { id, x, y, w, h, xPct, yPct, wPct, hPct, type, strength }
  const [history, setHistory] = useState([]); // Undo history

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentRect, setCurrentRect] = useState(null);

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const imgElementRef = useRef(null);

  // Presets state
  const [presets, setPresets] = useState(() => {
    try {
      const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : DEFAULT_PRESETS;
      }
    } catch (_) {}
    return DEFAULT_PRESETS;
  });
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [autoApplyDefaultPreset, setAutoApplyDefaultPreset] = useState(() => {
    return !!localStorage.getItem(DEFAULT_PRESET_KEY);
  });

  // Save presets to localStorage
  const savePresetsToStorage = (newPresets) => {
    setPresets(newPresets);
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(newPresets));
    } catch (_) {}
  };

  // Load image onto canvas with automatic Neon Cloud DB resolution
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    setImageLoaded(false);
    setLoadError(null);
    setZones([]);
    setHistory([]);
    setCurrentRect(null);

    let isCancelled = false;

    async function loadStudioCanvas() {
      let finalSrc = imageUrl;

      // If imageUrl is a static path or ID instead of a base64/blob URI, resolve from Neon Cloud DB
      if (!finalSrc.startsWith('data:') && !finalSrc.startsWith('blob:')) {
        const match = finalSrc.match(/pano_[a-zA-Z0-9_]+|\d{12,20}/);
        const panoId = match ? match[0] : null;
        if (panoId) {
          try {
            const neonData = await touristSpotsService.fetchPanoramaImageData(panoId);
            if (neonData && !isCancelled) {
              finalSrc = neonData;
            }
          } catch (_) {}
        }
      }

      if (isCancelled) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        if (isCancelled) return;
        imgElementRef.current = img;
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        setImageLoaded(true);
        setLoadError(null);

        // Check if default preset is configured
        const defaultId = localStorage.getItem(DEFAULT_PRESET_KEY);
        if (defaultId) {
          const found = presets.find((p) => p.id === defaultId);
          if (found) {
            applyPresetZones(found.zones, canvas.width, canvas.height);
          }
        }
      };

      img.onerror = async () => {
        if (isCancelled) return;
        // Fallback: if regular URL failed, try Neon Cloud DB
        if (!finalSrc.startsWith('data:')) {
          const match = imageUrl.match(/pano_[a-zA-Z0-9_]+|\d{12,20}/);
          const panoId = match ? match[0] : null;
          if (panoId) {
            try {
              const neonData = await touristSpotsService.fetchPanoramaImageData(panoId);
              if (neonData && !isCancelled) {
                img.src = neonData;
                return;
              }
            } catch (_) {}
          }
        }
        setLoadError('Could not load 360 panorama image from cloud or server.');
      };

      img.src = finalSrc;
    }

    loadStudioCanvas();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, imageUrl]);

  // Apply pixelation effect to canvas area
  const applyPixelate = (ctx, x, y, w, h, blockSize) => {
    const size = Math.max(4, blockSize);
    const imgData = ctx.getImageData(x, y, w, h);
    const data = imgData.data;

    for (let py = 0; py < h; py += size) {
      for (let px = 0; px < w; px += size) {
        // Sample average color of block
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = 0; dy < size && py + dy < h; dy++) {
          for (let dx = 0; dx < size && px + dx < w; dx++) {
            const idx = ((py + dy) * w + (px + dx)) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        // Fill block with average color
        for (let dy = 0; dy < size && py + dy < h; dy++) {
          for (let dx = 0; dx < size && px + dx < w; dx++) {
            const idx = ((py + dy) * w + (px + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
          }
        }
      }
    }
    ctx.putImageData(imgData, x, y);
  };

  // Apply Gaussian blur effect
  const applyBlur = (ctx, x, y, w, h, radius) => {
    const rad = Math.max(4, radius);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.drawImage(canvasRef.current, x, y, w, h, 0, 0, w, h);

    ctx.save();
    ctx.filter = `blur(${rad}px)`;
    ctx.drawImage(tempCanvas, 0, 0, w, h, x, y, w, h);
    ctx.restore();
  };

  // Apply Solid blackout mask
  const applyBlackout = (ctx, x, y, w, h) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, w, h);
  };

  // Re-render canvas from original image + all applied zones
  const redrawCanvas = useCallback((activeZones) => {
    const canvas = canvasRef.current;
    const img = imgElementRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    ctx.filter = 'none';
    ctx.drawImage(img, 0, 0);

    activeZones.forEach((z) => {
      if (z.type === 'pixelate') {
        applyPixelate(ctx, z.x, z.y, z.w, z.h, z.strength);
      } else if (z.type === 'blur') {
        applyBlur(ctx, z.x, z.y, z.w, z.h, z.strength);
      } else if (z.type === 'blackout') {
        applyBlackout(ctx, z.x, z.y, z.w, z.h);
      }
    });
  }, []);

  // Mouse / Touch drawing handlers
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.max(0, Math.min(canvas.width, (clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(canvas.height, (clientY - rect.top) * scaleY));

    return { x: Math.round(x), y: Math.round(y) };
  };

  const handleMouseDown = (e) => {
    if (!imageLoaded) return;
    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    setStartPoint(coords);
    setCurrentRect({ x: coords.x, y: coords.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !startPoint) return;
    const coords = getCanvasCoords(e);
    const x = Math.min(startPoint.x, coords.x);
    const y = Math.min(startPoint.y, coords.y);
    const w = Math.abs(coords.x - startPoint.x);
    const h = Math.abs(coords.y - startPoint.y);
    setCurrentRect({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentRect || currentRect.w < 5 || currentRect.h < 5) {
      setIsDrawing(false);
      setCurrentRect(null);
      return;
    }

    const canvas = canvasRef.current;
    const newZone = {
      id: `zone_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      x: currentRect.x,
      y: currentRect.y,
      w: currentRect.w,
      h: currentRect.h,
      xPct: parseFloat((currentRect.x / canvas.width).toFixed(4)),
      yPct: parseFloat((currentRect.y / canvas.height).toFixed(4)),
      wPct: parseFloat((currentRect.w / canvas.width).toFixed(4)),
      hPct: parseFloat((currentRect.h / canvas.height).toFixed(4)),
      type: blurMode,
      strength: blurStrength,
    };

    const nextZones = [...zones, newZone];
    setHistory((prev) => [...prev, zones]);
    setZones(nextZones);
    redrawCanvas(nextZones);

    setIsDrawing(false);
    setCurrentRect(null);
  };

  // Undo last action
  const handleUndo = () => {
    if (history.length === 0 && zones.length === 0) return;
    const prevZones = history.length > 0 ? history[history.length - 1] : [];
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setZones(prevZones);
    redrawCanvas(prevZones);
  };

  // Clear all zones
  const handleClearAll = () => {
    if (zones.length === 0) return;
    setHistory((prev) => [...prev, zones]);
    setZones([]);
    redrawCanvas([]);
  };

  // Apply preset zones
  const applyPresetZones = (presetZones, canvasWidth, canvasHeight) => {
    const w = canvasWidth || canvasRef.current?.width || 1;
    const h = canvasHeight || canvasRef.current?.height || 1;

    const newZones = presetZones.map((pz) => ({
      id: `preset_zone_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      x: Math.round(pz.xPct * w),
      y: Math.round(pz.yPct * h),
      w: Math.round(pz.wPct * w),
      h: Math.round(pz.hPct * h),
      xPct: pz.xPct,
      yPct: pz.yPct,
      wPct: pz.wPct,
      hPct: pz.hPct,
      type: pz.type || blurMode,
      strength: pz.strength || blurStrength,
    }));

    const combined = [...zones, ...newZones];
    setHistory((prev) => [...prev, zones]);
    setZones(combined);
    redrawCanvas(combined);
  };

  const handleApplySelectedPreset = () => {
    const preset = presets.find((p) => p.id === selectedPresetId);
    if (!preset) {
      alert('Please select a preset from the dropdown first.');
      return;
    }
    applyPresetZones(preset.zones);
  };

  // Save current zones as a new reusable preset
  const handleSaveCurrentAsPreset = () => {
    if (zones.length === 0) {
      alert('Draw at least one blur zone first before saving as a preset.');
      return;
    }

    const name = window.prompt(
      'Enter a name for this Privacy Blur Preset (e.g., "Survey Rig Nadir Mask" or "Car Roof Mask"):',
      `Custom Preset (${zones.length} zones)`
    );
    if (!name || !name.trim()) return;

    const newPreset = {
      id: `preset_${Date.now()}`,
      name: name.trim(),
      description: `User-defined preset with ${zones.length} zone(s)`,
      zones: zones.map((z) => ({
        xPct: z.xPct,
        yPct: z.yPct,
        wPct: z.wPct,
        hPct: z.hPct,
        type: z.type,
        strength: z.strength,
      })),
    };

    const updated = [...presets, newPreset];
    savePresetsToStorage(updated);
    setSelectedPresetId(newPreset.id);
    alert(`Preset "${newPreset.name}" saved! You can now apply it to any image with 1 click.`);
  };

  // Toggle default preset across all images
  const handleToggleDefaultPreset = (e) => {
    const checked = e.target.checked;
    setAutoApplyDefaultPreset(checked);
    if (checked && selectedPresetId) {
      localStorage.setItem(DEFAULT_KEY, selectedPresetId);
    } else {
      localStorage.removeItem(DEFAULT_KEY);
    }
  };

  // Final export and save
  const handleSaveAndApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Export as high quality JPEG
    const blurredDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onSaveBlurredImage?.(blurredDataUrl, zones.length);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="glass-panel"
        style={{
          width: '95vw',
          maxWidth: '1100px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1.5px solid rgba(67, 97, 238, 0.4)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>🛡️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc' }}>
                Privacy Blur Studio · RA 10173 Compliance
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                Outline and anonymize faces, license plates, and vehicle rigs ({imageName})
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '3px 8px',
                borderRadius: 'var(--radius-full)',
                background: zones.length > 0 ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                color: zones.length > 0 ? '#34d399' : '#cbd5e1',
                border: zones.length > 0 ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              {zones.length} Zone(s) Blurred
            </span>
            <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: '1.2rem' }}>
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar: Blur Type, Strength, Presets, Undo */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '10px 18px',
            background: 'rgba(0, 0, 0, 0.25)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Mode Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>Filter:</span>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.4)', padding: '2px', borderRadius: 'var(--radius-sm)' }}>
              <button
                type="button"
                onClick={() => setBlurMode('pixelate')}
                className="btn btn-ghost"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  background: blurMode === 'pixelate' ? 'rgba(67, 97, 238, 0.4)' : 'transparent',
                  color: blurMode === 'pixelate' ? '#ffffff' : '#94a3b8',
                }}
              >
                ⬛ Mosaic / Pixelate
              </button>
              <button
                type="button"
                onClick={() => setBlurMode('blur')}
                className="btn btn-ghost"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  background: blurMode === 'blur' ? 'rgba(67, 97, 238, 0.4)' : 'transparent',
                  color: blurMode === 'blur' ? '#ffffff' : '#94a3b8',
                }}
              >
                🌫️ Smooth Blur
              </button>
              <button
                type="button"
                onClick={() => setBlurMode('blackout')}
                className="btn btn-ghost"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  background: blurMode === 'blackout' ? 'rgba(67, 97, 238, 0.4)' : 'transparent',
                  color: blurMode === 'blackout' ? '#ffffff' : '#94a3b8',
                }}
              >
                🖤 Blackout Mask
              </button>
            </div>
          </div>

          {/* Strength Slider */}
          {blurMode !== 'blackout' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>Strength:</span>
              <input
                type="range"
                min="6"
                max="36"
                step="2"
                value={blurStrength}
                onChange={(e) => setBlurStrength(parseInt(e.target.value, 10))}
                style={{ width: '90px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.72rem', color: '#f8fafc', minWidth: '32px' }}>{blurStrength}px</span>
            </div>
          )}

          {/* Preset Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', color: '#ffd700', fontWeight: 600 }}>⚡ Presets:</span>
            <select
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value)}
              className="input-field"
              style={{ width: '180px', padding: '4px 8px', fontSize: '0.75rem', height: '28px' }}
            >
              <option value="">-- Choose Preset --</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleApplySelectedPreset}
              disabled={!selectedPresetId}
              className="btn btn-secondary"
              style={{ fontSize: '0.72rem', padding: '4px 8px', height: '28px' }}
              title="Apply saved preset zones to this image"
            >
              Apply Preset
            </button>
            <button
              type="button"
              onClick={handleSaveCurrentAsPreset}
              className="btn btn-ghost"
              style={{ fontSize: '0.72rem', padding: '4px 8px', height: '28px', color: '#ffd700' }}
              title="Save current drawn blur boxes as reusable preset for all images"
            >
              💾 Save Preset
            </button>
          </div>

          {/* Action buttons: Undo & Clear */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={handleUndo}
              disabled={zones.length === 0}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 8px', height: '28px' }}
              title="Undo last drawn blur box"
            >
              ↩ Undo
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={zones.length === 0}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 8px', height: '28px', color: '#ef4444' }}
              title="Clear all blur zones"
            >
              🗑️ Clear
            </button>
          </div>
        </div>

        {/* Interactive Canvas Workspace */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            minHeight: '360px',
            position: 'relative',
            overflow: 'auto',
            background: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            userSelect: 'none',
          }}
        >
          {!imageLoaded && (
            <div style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center' }}>
              {loadError ? (
                <div style={{ color: '#f87171', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                  <span>⚠️ {loadError}</span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '4px 12px' }}
                  >
                    Close
                  </button>
                </div>
              ) : (
                <span>⏳ Loading 360° panorama image...</span>
              )}
            </div>
          )}

          <div
            style={{
              position: 'relative',
              display: 'inline-block',
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease',
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              style={{
                display: imageLoaded ? 'block' : 'none',
                maxWidth: '100%',
                maxHeight: '62vh',
                height: 'auto',
                cursor: 'crosshair',
                borderRadius: '4px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              }}
            />

            {/* Live Dragging Outline Box Overlay */}
            {isDrawing && currentRect && (
              <div
                style={{
                  position: 'absolute',
                  left: `${(currentRect.x / (canvasRef.current?.width || 1)) * 100}%`,
                  top: `${(currentRect.y / (canvasRef.current?.height || 1)) * 100}%`,
                  width: `${(currentRect.w / (canvasRef.current?.width || 1)) * 100}%`,
                  height: `${(currentRect.h / (canvasRef.current?.height || 1)) * 100}%`,
                  border: '2px dashed #ffd700',
                  background: 'rgba(255, 215, 0, 0.25)',
                  boxShadow: '0 0 10px rgba(255, 215, 0, 0.5)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>

          {/* Quick Zoom Controls Floating Overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: '24px',
              right: '24px',
              display: 'flex',
              gap: '4px',
              background: 'rgba(15, 23, 42, 0.85)',
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
              className="btn btn-ghost"
              style={{ padding: '2px 8px', fontSize: '0.85rem' }}
              title="Zoom In"
            >
              +
            </button>
            <span style={{ fontSize: '0.72rem', color: '#cbd5e1', alignSelf: 'center', minWidth: '40px', textAlign: 'center' }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
              className="btn btn-ghost"
              style={{ padding: '2px 8px', fontSize: '0.85rem' }}
              title="Zoom Out"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              className="btn btn-ghost"
              style={{ padding: '2px 6px', fontSize: '0.7rem', color: '#93c5fd' }}
              title="Reset Zoom"
            >
              Fit
            </button>
          </div>
        </div>

        {/* Bottom Footer: Instructions & Final Save */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(0, 0, 0, 0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.74rem', color: '#94a3b8' }}>
            <span>💡</span>
            <span>
              <strong>Tip:</strong> Click & drag directly over faces, vehicle plates, or house signs to anonymize them.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ padding: '6px 14px' }}>
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveAndApply}
              className="btn btn-primary"
              style={{
                padding: '6px 18px',
                fontSize: '0.85rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 2px 12px rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>✓</span>
              <span>Apply & Save Privacy Blur ({zones.length} Zones)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
