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
  showMapillaryDots = true,
  onToggleDots,
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

        {onToggleDots && (
          <button
            className={`btn-secondary aligner-btn-dots ${!showMapillaryDots ? 'dots-hidden' : ''}`}
            onClick={onToggleDots}
            title={showMapillaryDots ? 'Hide raw green dots to see only road and cyan line' : 'Show green dots'}
          >
            {showMapillaryDots ? '🟢 Hide Dots' : '⚪ Show Dots'}
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
