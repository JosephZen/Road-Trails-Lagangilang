import React, { useState, useEffect } from 'react';

/**
 * Mapillary Trail Alignment & Calibration Modal
 * Allows administrators and users to calibrate GPS drift on Mapillary sequence lines and dots
 * so they align precisely with OpenStreetMap road centerlines.
 */
export default function TrailAlignmentModal({
  isOpen,
  onClose,
  currentOffset = { x: -9, y: 3 },
  onOffsetChange,
  onSave,
}) {
  const [offset, setOffset] = useState(currentOffset);

  useEffect(() => {
    setOffset(currentOffset);
  }, [currentOffset]);

  if (!isOpen) return null;

  const handleUpdate = (nextOffset) => {
    setOffset(nextOffset);
    onOffsetChange?.(nextOffset);
  };

  const handleNudge = (dx, dy) => {
    const next = {
      x: Math.round((offset.x + dx) * 10) / 10,
      y: Math.round((offset.y + dy) * 10) / 10,
    };
    handleUpdate(next);
  };

  const handleSave = () => {
    try {
      localStorage.setItem('lagangilang_mapillary_offset_x', String(offset.x));
      localStorage.setItem('lagangilang_mapillary_offset_y', String(offset.y));
    } catch {
      // ignore
    }
    onSave?.(offset);
    onClose?.();
  };

  const handleResetRecommended = () => {
    handleUpdate({ x: -9, y: 3 });
  };

  const handleResetZero = () => {
    handleUpdate({ x: 0, y: 0 });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(5, 10, 20, 0.75)',
        backdropFilter: 'blur(6px)',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.95) 0%, rgba(10, 15, 30, 0.98) 100%)',
          borderRadius: 'var(--radius-xl, 16px)',
          border: '1px solid rgba(52, 211, 153, 0.35)',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6), 0 0 24px rgba(16, 185, 129, 0.2)',
          padding: '20px',
          color: '#ffffff',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.25rem' }}>🎯</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#34d399' }}>
                Calibrate Trail Alignment
              </h3>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                Re-align Mapillary streetview lines & dots to road
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              color: '#94a3b8',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Current Readout Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '0.82rem',
          }}
        >
          <div>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Horizontal (West/East): </span>
            <strong style={{ color: '#38bdf8' }}>{offset.x > 0 ? `+${offset.x}` : offset.x} px</strong>
          </div>
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
          <div>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Vertical (North/South): </span>
            <strong style={{ color: '#a78bfa' }}>{offset.y > 0 ? `+${offset.y}` : offset.y} px</strong>
          </div>
        </div>

        {/* Directional Nudge D-Pad */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px', textAlign: 'center' }}>
            Directional Nudge (Live Map Preview)
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 48px)',
              gridTemplateRows: 'repeat(3, 44px)',
              gap: '6px',
              justifyContent: 'center',
              alignItems: 'center',
              margin: '0 auto',
            }}
          >
            <div />
            <button
              onClick={() => handleNudge(0, -1)}
              style={dpadBtnStyle}
              title="Shift North (Up 1px)"
            >
              ▲
            </button>
            <div />

            <button
              onClick={() => handleNudge(-1, 0)}
              style={dpadBtnStyle}
              title="Shift West (Left 1px)"
            >
              ◄
            </button>
            <button
              onClick={handleResetRecommended}
              style={{
                ...dpadBtnStyle,
                background: 'rgba(52, 211, 153, 0.2)',
                borderColor: 'rgba(52, 211, 153, 0.5)',
                color: '#34d399',
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
              title="Reset to recommended calibration (-9px, +3px)"
            >
              REC
            </button>
            <button
              onClick={() => handleNudge(1, 0)}
              style={dpadBtnStyle}
              title="Shift East (Right 1px)"
            >
              ►
            </button>

            <div />
            <button
              onClick={() => handleNudge(0, 1)}
              style={dpadBtnStyle}
              title="Shift South (Down 1px)"
            >
              ▼
            </button>
            <div />
          </div>
        </div>

        {/* Fine Tuning Sliders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '4px' }}>
              <span>◄ Shift Left (West)</span>
              <span>Shift Right (East) ►</span>
            </div>
            <input
              type="range"
              min="-35"
              max="35"
              step="1"
              value={offset.x}
              onChange={(e) => handleUpdate({ ...offset, x: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '4px' }}>
              <span>▲ Shift Up (North)</span>
              <span>Shift Down (South) ▼</span>
            </div>
            <input
              type="range"
              min="-35"
              max="35"
              step="1"
              value={offset.y}
              onChange={(e) => handleUpdate({ ...offset, y: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#a78bfa' }}
            />
          </div>
        </div>

        {/* Quick Presets */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button
            onClick={handleResetRecommended}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '0.72rem',
              borderRadius: 'var(--radius-sm, 6px)',
              background: 'rgba(52, 211, 153, 0.15)',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              color: '#34d399',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ⭐ Road Calibration (-9, +3)
          </button>
          <button
            onClick={handleResetZero}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '0.72rem',
              borderRadius: 'var(--radius-sm, 6px)',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              cursor: 'pointer',
            }}
          >
            📍 Raw GPS (0, 0)
          </button>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn btn-primary"
            style={{
              flex: 2,
              padding: '8px 12px',
              fontSize: '0.8rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontWeight: 700,
              border: 'none',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
            }}
          >
            💾 Save Alignment
          </button>
        </div>
      </div>
    </div>
  );
}

const dpadBtnStyle = {
  background: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '0.9rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s ease',
  height: '100%',
  width: '100%',
};
