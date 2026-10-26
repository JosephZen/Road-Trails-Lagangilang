import React from 'react';

/**
 * StreetviewLineAligner Component
 * Floating editor bar for bending and re-aligning Mapillary streetview lines onto road curves.
 */
export default function StreetviewLineAligner({
  aligningSequence,
  onSave,
  onResetOriginal,
  onCancel,
  isSaving = false,
  showMapillaryStreetview = false,
  showMapillaryDots = false,
  showMapillaryLines = false,
  onToggleStreetview,
  onToggleDots,
  onToggleLines,
}) {
  if (!aligningSequence) return null;

  const { sequenceId, images = [], controlPoints = [] } = aligningSequence;

  return (
    <div className="streetview-aligner-panel glass-panel">
      <div className="aligner-header">
        <div className="aligner-title-group">
          <span className="aligner-badge">📐 Alignment Mode</span>
          <span className="aligner-subtitle">
            Sequence: <strong>{sequenceId.slice(0, 10)}...</strong> ({images.length} photos, {controlPoints.length} handles)
          </span>
        </div>
        <button
          className="aligner-close-btn"
          onClick={onCancel}
          title="Exit alignment mode"
        >
          ✕
        </button>
      </div>

      <div className="aligner-tips">
        <span>💡 <strong>Drag handles</strong> onto the road curve.</span>
        <span>💡 <strong>Click line</strong> to add curve point.</span>
        <span>💡 <strong>Right-click handle</strong> to remove.</span>
      </div>

      <div className="aligner-actions">
        <button
          className="btn-primary aligner-btn-save"
          onClick={onSave}
          disabled={isSaving}
          title="Save this bent alignment to map"
        >
          {isSaving ? '⏳ Saving...' : '💾 Save Alignment'}
        </button>

        {onToggleStreetview && (
          <button
            className={`btn-secondary aligner-btn-dots ${!showMapillaryStreetview ? 'dots-hidden' : ''}`}
            onClick={onToggleStreetview}
            title={showMapillaryStreetview ? 'Hide raw Mapillary green lines & dots to focus on road & cyan curve' : 'Show Mapillary streetview overlay'}
          >
            {showMapillaryStreetview ? '🟢 Hide Streetview' : '⚪ Show Streetview'}
          </button>
        )}

        {onToggleLines && showMapillaryStreetview && (
          <button
            className={`btn-ghost aligner-btn-sub ${!showMapillaryLines ? 'sub-hidden' : ''}`}
            onClick={onToggleLines}
            title={showMapillaryLines ? 'Hide green lines' : 'Show green lines'}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
          >
            {showMapillaryLines ? 'Lines: ON' : 'Lines: OFF'}
          </button>
        )}

        {onToggleDots && showMapillaryStreetview && (
          <button
            className={`btn-ghost aligner-btn-sub ${!showMapillaryDots ? 'sub-hidden' : ''}`}
            onClick={onToggleDots}
            title={showMapillaryDots ? 'Hide green dots' : 'Show green dots'}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
          >
            {showMapillaryDots ? 'Dots: ON' : 'Dots: OFF'}
          </button>
        )}

        <button
          className="btn-secondary aligner-btn-reset"
          onClick={onResetOriginal}
          title="Revert back to raw GPS capture points"
        >
          ↺ Reset GPS
        </button>

        <button
          className="btn-ghost aligner-btn-done"
          onClick={onCancel}
          title="Done editing"
        >
          Done
        </button>
      </div>
    </div>
  );
}
