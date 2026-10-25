import React, { useState, useEffect } from 'react';
import {
  KNOWN_SEQUENCES,
  DEFAULT_CAMPUS_SEQUENCE_ID,
  DEFAULT_CAMPUS_OFFSET,
  getSequenceMeta,
  normalizeSequenceId,
} from '../utils/trailCalibration';

/**
 * On-Map Interactive Trail Alignment & Calibration HUD.
 * Supports granular, selective re-alignment of individual sequence uploads
 * (e.g., UA Campus Gate & Loop) without shifting unaffected highway lines.
 */
export default function TrailAlignmentHUD({
  isOpen,
  onClose,
  activeSequenceId = DEFAULT_CAMPUS_SEQUENCE_ID,
  onSelectSequence,
  sequenceOffsets = {},
  onOffsetChange,
  onSave,
  isDragMode = false,
  onToggleDragMode,
  alignScope = 'single', // 'single' | 'all'
  onChangeScope,
  isPickOnMap = false,
  onTogglePickOnMap,
}) {
  const normSeqId = normalizeSequenceId(activeSequenceId);
  const currentOffset = alignScope === 'all'
    ? (sequenceOffsets?.global || { x: 0, y: 0 })
    : (sequenceOffsets?.[normSeqId] || DEFAULT_CAMPUS_OFFSET);

  const [offset, setOffset] = useState(currentOffset);
  const [stepSize, setStepSize] = useState(1); // 1px or 5px

  useEffect(() => {
    setOffset(currentOffset);
  }, [normSeqId, alignScope, sequenceOffsets]);

  if (!isOpen) return null;

  const activeMeta = getSequenceMeta(normSeqId);

  const handleUpdate = (nextOffset) => {
    setOffset(nextOffset);
    onOffsetChange?.(nextOffset, normSeqId);
  };

  const handleNudge = (dx, dy) => {
    const next = {
      x: Math.round((offset.x + dx * stepSize) * 10) / 10,
      y: Math.round((offset.y + dy * stepSize) * 10) / 10,
    };
    handleUpdate(next);
  };

  const handleSave = () => {
    onSave?.(offset, normSeqId);
  };

  // Preset 1: Snap to Road Legends (matches road centerline geometry)
  const handleSnapToRoadLegends = () => {
    handleUpdate({ x: 0, y: 0 });
  };

  // Preset 2: Reset to Raw GPS (0, 0)
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
        maxWidth: '380px',
        width: 'calc(100% - 32px)',
        background: 'rgba(15, 23, 42, 0.95)',
        borderRadius: 'var(--radius-lg, 14px)',
        border: '1.5px solid #10b981',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65), 0 0 24px rgba(16, 185, 129, 0.25)',
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
          <span style={{ fontSize: '1.25rem' }}>🎯</span>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#34d399' }}>
              Re-align Trail to Road Legends
            </h4>
            <p style={{ margin: 0, fontSize: '0.68rem', color: '#94a3b8' }}>
              Calibrate individual captures or lines to match roads
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

      {/* Scope Selector: Single Line / Upload vs All API Lines */}
      <div
        style={{
          display: 'flex',
          background: 'rgba(0, 0, 0, 0.45)',
          borderRadius: '8px',
          padding: '3px',
          marginBottom: '10px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <button
          onClick={() => onChangeScope?.('single')}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: '0.72rem',
            fontWeight: alignScope === 'single' ? 700 : 500,
            borderRadius: '6px',
            border: 'none',
            background: alignScope === 'single' ? '#10b981' : 'transparent',
            color: alignScope === 'single' ? '#ffffff' : '#94a3b8',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
          title="Drag and calibrate only the selected upload line"
        >
          <span>🎯</span>
          <span>Selected Line Only</span>
        </button>
        <button
          onClick={() => onChangeScope?.('all')}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: '0.72rem',
            fontWeight: alignScope === 'all' ? 700 : 500,
            borderRadius: '6px',
            border: 'none',
            background: alignScope === 'all' ? '#3b82f6' : 'transparent',
            color: alignScope === 'all' ? '#ffffff' : '#94a3b8',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
          title="Shift all sequence lines across the municipality"
        >
          <span>🌐</span>
          <span>All Lines (Global)</span>
        </button>
      </div>

      {/* Single Line Selection Card */}
      {alignScope === 'single' ? (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '8px 10px',
            marginBottom: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.68rem', color: '#6ee7b7', fontWeight: 600, textTransform: 'uppercase' }}>
              Active Line to Re-align:
            </span>
            {onTogglePickOnMap && (
              <button
                onClick={onTogglePickOnMap}
                style={{
                  padding: '2px 8px',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  borderRadius: '4px',
                  border: isPickOnMap ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.15)',
                  background: isPickOnMap ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.06)',
                  color: isPickOnMap ? '#38bdf8' : '#cbd5e1',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Click any line or dot directly on the map to select it"
              >
                <span>👆</span>
                <span>{isPickOnMap ? 'Picking... Click Line' : 'Pick on Map'}</span>
              </button>
            )}
          </div>

          {/* Sequence Dropdown Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>{activeMeta.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <select
                value={normSeqId}
                onChange={(e) => onSelectSequence?.(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  padding: '4px 6px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {KNOWN_SEQUENCES.map((seq) => (
                  <option key={seq.id} value={seq.id} style={{ background: '#0f172a', color: '#fff' }}>
                    {seq.icon} {seq.name}
                  </option>
                ))}
                {!KNOWN_SEQUENCES.some((k) => k.id === normSeqId) && (
                  <option value={normSeqId} style={{ background: '#0f172a', color: '#fff' }}>
                    📍 Upload ({normSeqId.slice(0, 10)}...)
                  </option>
                )}
              </select>
              <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeMeta.subtitle} • <span style={{ color: '#34d399' }}>Only this line moves</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            padding: '6px 10px',
            marginBottom: '10px',
            fontSize: '0.7rem',
            color: '#93c5fd',
          }}
        >
          🌐 <strong>Global Mode:</strong> Nudging will shift all sequence lines across the municipality simultaneously.
        </div>
      )}

      {/* Current Offset Status Readout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          background: 'rgba(0, 0, 0, 0.45)',
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
            padding: '7px 10px',
            marginBottom: '10px',
            fontSize: '0.74rem',
            fontWeight: 600,
            borderRadius: 'var(--radius-sm, 6px)',
            background: isDragMode ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.06)',
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
          <span>{isDragMode ? '🖐 Dragging Line Active (Click & Drag Map)' : '🖐 Enable Drag Line on Map'}</span>
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
            min="-50"
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
            min="-35"
            max="35"
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
          💾 Save Line Alignment
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
