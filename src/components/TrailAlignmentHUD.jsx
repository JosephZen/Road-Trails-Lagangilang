import React, { useState, useEffect } from 'react';

/**
 * On-Map Interactive Trail Alignment & Calibration HUD.
 * Renders as a floating on-map HUD bar (not a dark modal popup) so the user can
 * clearly see the OpenStreetMap road legends and green Mapillary trails while adjusting.
 */
export default function TrailAlignmentHUD({
  isOpen,
  onClose,
  currentOffset = { x: -24, y: 6 },
  onOffsetChange,
  onSave,
  isDragMode = false,
  onToggleDragMode,
}) {
  const [offset, setOffset] = useState(currentOffset);
  const [stepSize, setStepSize] = useState(1); // 1px or 5px

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
      x: Math.round((offset.x + dx * stepSize) * 10) / 10,
      y: Math.round((offset.y + dy * stepSize) * 10) / 10,
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
  };

  // Preset 1: Snap to Road Legends (matches Abra-Kalinga road and UA campus access road geometry)
  const handleSnapToRoadLegends = () => {
    handleUpdate({ x: -24, y: 6 });
  };

  // Preset 2: Moderate Calibration
  const handleModerateCalibration = () => {
    handleUpdate({ x: -12, y: 3 });
  };

  // Preset 3: Reset to Raw GPS
  const handleResetZero = () => {
    handleUpdate({ x: 0, y: 0 });
  };

  return (
    <div
      className="trail-alignment-hud glass-panel"
      style={{
        position: 'absolute',
        top: '72px',
        right: '16px',
        zIndex: 100,
        maxWidth: '360px',
        width: 'calc(100% - 32px)',
        background: 'rgba(15, 23, 42, 0.94)',
        borderRadius: 'var(--radius-lg, 14px)',
        border: '1.5px solid #10b981',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.25)',
        backdropFilter: 'blur(16px)',
        padding: '14px',
        color: '#ffffff',
        animation: 'fadeInDown 0.2s ease-out',
        pointerEvents: 'auto',
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.15rem' }}>🎯</span>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#34d399' }}>
              Re-align Trail to Road Legends
            </h4>
            <p style={{ margin: 0, fontSize: '0.68rem', color: '#94a3b8' }}>
              Connect green streetview lines to orange roads
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
            width: '26px',
            height: '26px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.9rem',
          }}
          title="Close alignment tool"
        >
          ✕
        </button>
      </div>

      {/* Current Offset Status Readout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          background: 'rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '6px 10px',
          marginBottom: '10px',
          fontSize: '0.78rem',
        }}
      >
        <div>
          <span style={{ color: '#94a3b8', fontSize: '0.68rem' }}>West/East (X): </span>
          <strong style={{ color: '#38bdf8' }}>{offset.x > 0 ? `+${offset.x}` : offset.x} px</strong>
        </div>
        <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.1)' }} />
        <div>
          <span style={{ color: '#94a3b8', fontSize: '0.68rem' }}>North/South (Y): </span>
          <strong style={{ color: '#a78bfa' }}>{offset.y > 0 ? `+${offset.y}` : offset.y} px</strong>
        </div>
      </div>

      {/* Quick 1-Click Action: Snap to Road Legends */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <button
          onClick={handleSnapToRoadLegends}
          style={{
            flex: 2,
            padding: '6px 8px',
            fontSize: '0.74rem',
            fontWeight: 700,
            borderRadius: 'var(--radius-sm, 6px)',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
          }}
          title="Instantly snap Mapillary trail lines onto OpenStreetMap road legend"
        >
          <span>⭐</span>
          <span>Snap to Road Legends</span>
        </button>

        <button
          onClick={handleResetZero}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: '0.72rem',
            borderRadius: 'var(--radius-sm, 6px)',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#cbd5e1',
            cursor: 'pointer',
          }}
          title="Reset to raw GPS capture coordinates"
        >
          Raw (0,0)
        </button>
      </div>

      {/* Direct Drag on Map Mode Toggle */}
      {onToggleDragMode && (
        <button
          onClick={onToggleDragMode}
          style={{
            width: '100%',
            padding: '6px 10px',
            marginBottom: '10px',
            fontSize: '0.74rem',
            fontWeight: 600,
            borderRadius: 'var(--radius-sm, 6px)',
            background: isDragMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.06)',
            border: isDragMode ? '1.5px solid #60a5fa' : '1px solid rgba(255, 255, 255, 0.15)',
            color: isDragMode ? '#93c5fd' : '#cbd5e1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
          title="Click and drag anywhere on the map to slide the green trail into position"
        >
          <span>{isDragMode ? '🖐 Dragging Trail Active (Click & Drag Map)' : '🖐 Enable Drag Trail on Map'}</span>
        </button>
      )}

      {/* Directional Nudge D-Pad with Step Size */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Nudge Controls:</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            <button
              onClick={() => setStepSize(1)}
              style={{
                padding: '2px 6px',
                fontSize: '0.65rem',
                borderRadius: '4px',
                border: 'none',
                background: stepSize === 1 ? '#10b981' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              1px (Fine)
            </button>
            <button
              onClick={() => setStepSize(5)}
              style={{
                padding: '2px 6px',
                fontSize: '0.65rem',
                borderRadius: '4px',
                border: 'none',
                background: stepSize === 5 ? '#10b981' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              5px (Fast)
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 40px)',
            gridTemplateRows: 'repeat(3, 34px)',
            gap: '4px',
            justifyContent: 'center',
            margin: '0 auto',
          }}
        >
          <div />
          <button onClick={() => handleNudge(0, -1)} style={dpadStyle} title="Shift North (Up)">
            ▲
          </button>
          <div />

          <button onClick={() => handleNudge(-1, 0)} style={dpadStyle} title="Shift West (Left towards road)">
            ◄
          </button>
          <button
            onClick={handleSnapToRoadLegends}
            style={{
              ...dpadStyle,
              background: 'rgba(52, 211, 153, 0.2)',
              borderColor: 'rgba(52, 211, 153, 0.5)',
              color: '#34d399',
              fontSize: '0.65rem',
              fontWeight: 700,
            }}
            title="Snap to road centerline"
          >
            ROAD
          </button>
          <button onClick={() => handleNudge(1, 0)} style={dpadStyle} title="Shift East (Right)">
            ►
          </button>

          <div />
          <button onClick={() => handleNudge(0, 1)} style={dpadStyle} title="Shift South (Down)">
            ▼
          </button>
          <div />
        </div>
      </div>

      {/* Sliders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>
            <span>◄ West (Shift Left)</span>
            <span>East (Shift Right) ►</span>
          </div>
          <input
            type="range"
            min="-45"
            max="30"
            step="1"
            value={offset.x}
            onChange={(e) => handleUpdate({ ...offset, x: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#38bdf8' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px' }}>
            <span>▲ North (Shift Up)</span>
            <span>South (Shift Down) ▼</span>
          </div>
          <input
            type="range"
            min="-30"
            max="30"
            step="1"
            value={offset.y}
            onChange={(e) => handleUpdate({ ...offset, y: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#a78bfa' }}
          />
        </div>
      </div>

      {/* Footer Save Button */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleSave}
          style={{
            flex: 2,
            padding: '7px 12px',
            fontSize: '0.78rem',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#ffffff',
            fontWeight: 700,
            border: 'none',
            borderRadius: 'var(--radius-sm, 6px)',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
          }}
        >
          💾 Save Alignment
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: '7px 12px',
            fontSize: '0.78rem',
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#94a3b8',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 'var(--radius-sm, 6px)',
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

const dpadStyle = {
  background: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '0.82rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  width: '100%',
};
