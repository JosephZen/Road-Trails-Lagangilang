import React, { useState } from 'react';

/**
 * StreetviewLineAligner Component
 * Floating editor bar for bending and re-aligning Mapillary streetview lines onto road curves.
 * Fully optimized for touch devices, mobile viewports, and phones in portrait ratio.
 */
export default function StreetviewLineAligner({
  aligningSequence,
  onSave,
  onResetOriginal,
  onResetNodesGps,
  onCancel,
  onDeleteAlignment,
  onExcludeSequence,
  isSaving = false,
  showMapillaryStreetview = false,
  showMapillaryDots = false,
  showMapillaryLines = false,
  onToggleStreetview,
  onToggleDots,
  onToggleLines,
  selectedHandleIndex = null,
  onSelectHandleIndex,
  onRemoveHandle,
}) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (!aligningSequence) return null;

  const { sequenceId, images = [], controlPoints = [], isAlreadyAligned } = aligningSequence;

  // Minimized Compact Pill Mode (Ultra space-saver on mobile phones)
  if (isMinimized) {
    return (
      <div className="streetview-aligner-panel-minimized glass-panel">
        <div
          className="aligner-mini-summary"
          onClick={() => setIsMinimized(false)}
          title="Tap to expand alignment tools"
        >
          <span className="aligner-badge">📐 Aligning</span>
          <span className="aligner-mini-nodes">{controlPoints.length} nodes</span>
        </div>

        {selectedHandleIndex !== null && onRemoveHandle ? (
          <button
            className="aligner-btn-delete-node-mini"
            onClick={() => onRemoveHandle(selectedHandleIndex)}
            title={`Delete selected handle #${selectedHandleIndex + 1}`}
          >
            🗑️ Delete #{selectedHandleIndex + 1}
          </button>
        ) : (
          controlPoints.length > 2 && onRemoveHandle && (
            <button
              className="aligner-btn-delete-node-mini"
              onClick={() => onRemoveHandle(controlPoints.length - 2)}
              title="Delete last added curve handle"
            >
              🗑️ Delete
            </button>
          )
        )}

        <button
          className="btn-primary aligner-btn-save-mini"
          onClick={onSave}
          disabled={isSaving}
          title="Save this bent alignment to map"
        >
          {isSaving ? '⏳' : '💾 Save'}
        </button>

        <button
          className="aligner-toggle-btn"
          onClick={() => setIsMinimized(false)}
          title="Expand tools"
        >
          ▾ Tools
        </button>

        <button
          className="aligner-close-btn"
          onClick={onCancel}
          title="Exit alignment mode"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="streetview-aligner-panel glass-panel">
      <div className="aligner-header">
        <div className="aligner-title-group">
          <span className="aligner-badge">📐 Alignment Mode</span>
          <span className="aligner-subtitle">
            Seq: <strong>{sequenceId.slice(0, 10)}...</strong> ({images.length} photos, {controlPoints.length} handles)
          </span>
        </div>
        <div className="aligner-header-controls">
          <button
            className="aligner-minimize-btn"
            onClick={() => setIsMinimized(true)}
            title="Minimize toolbar to see map"
          >
            ▲ Minimize
          </button>
          <button
            className="aligner-close-btn"
            onClick={onCancel}
            title="Exit alignment mode"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="aligner-tips">
        <div className="aligner-tips-text">
          <span>💡 <strong>Drag cyan nodes</strong> onto road.</span>
          <span>💡 <strong>Tap line</strong> to add node.</span>
          <span>💡 <strong>Tap node</strong> to delete (or hold / dbl-tap).</span>
        </div>
      </div>

      {/* Selected Node Action Bar */}
      {selectedHandleIndex !== null && onRemoveHandle && (
        <div className="aligner-selected-bar">
          <span className="aligner-selected-label">
            🎯 Node #{selectedHandleIndex + 1} Selected
          </span>
          <div className="aligner-selected-actions">
            <button
              className="btn-danger aligner-btn-delete-selected"
              onClick={() => onRemoveHandle(selectedHandleIndex)}
              title={`Delete node #${selectedHandleIndex + 1}`}
            >
              🗑️ Delete Node #{selectedHandleIndex + 1}
            </button>
            <button
              className="btn-ghost aligner-btn-deselect"
              onClick={() => onSelectHandleIndex?.(null)}
              title="Deselect node"
            >
              ✕ Deselect
            </button>
          </div>
        </div>
      )}

      {/* Primary Action Row (Touch scrollable on mobile) */}
      <div className="aligner-actions">
        <button
          className="btn-primary aligner-btn-save"
          onClick={onSave}
          disabled={isSaving}
          title="Save this bent alignment to map"
        >
          {isSaving ? '⏳ Saving...' : '💾 Save Alignment'}
        </button>

        {selectedHandleIndex !== null && onRemoveHandle ? (
          <button
            className="btn-danger aligner-btn-delete-selected-inline"
            onClick={() => onRemoveHandle(selectedHandleIndex)}
            title={`Delete selected handle #${selectedHandleIndex + 1}`}
          >
            🗑️ Delete Node #{selectedHandleIndex + 1}
          </button>
        ) : (
          controlPoints.length > 2 && onRemoveHandle && (
            <button
              className="btn-secondary aligner-btn-remove-last"
              onClick={() => onRemoveHandle(controlPoints.length - 2)}
              title="Remove the last intermediate curve handle"
            >
              🗑️ Delete Node
            </button>
          )
        )}

        {onToggleStreetview && (
          <button
            className={`btn-secondary aligner-btn-dots ${!showMapillaryStreetview ? 'dots-hidden' : ''}`}
            onClick={onToggleStreetview}
            title={showMapillaryStreetview ? 'Hide raw Mapillary overlay' : 'Show Mapillary streetview overlay'}
          >
            {showMapillaryStreetview ? '🟢 Hide Streetview' : '⚪ Show Streetview'}
          </button>
        )}

        {onToggleLines && showMapillaryStreetview && (
          <button
            className={`btn-secondary aligner-btn-sub ${!showMapillaryLines ? 'sub-hidden' : ''}`}
            onClick={onToggleLines}
            title={showMapillaryLines ? 'Hide green lines' : 'Show green lines'}
          >
            {showMapillaryLines ? 'Lines: ON' : 'Lines: OFF'}
          </button>
        )}

        {onToggleDots && showMapillaryStreetview && (
          <button
            className={`btn-secondary aligner-btn-sub ${!showMapillaryDots ? 'sub-hidden' : ''}`}
            onClick={onToggleDots}
            title={showMapillaryDots ? 'Hide photo dots' : 'Show photo dots'}
          >
            {showMapillaryDots ? 'Dots: ON' : 'Dots: OFF'}
          </button>
        )}

        {onResetOriginal && (
          <button
            className="btn-secondary aligner-btn-reset"
            onClick={onResetOriginal}
            title="Revert back to raw GPS capture points"
          >
            ↺ Reset GPS
          </button>
        )}

        {onResetNodesGps && (
          <button
            className="btn-secondary aligner-btn-reset-nodes"
            onClick={() => onResetNodesGps(sequenceId)}
            title="Revert all 360 photo coordinates back to original GPS while keeping visual road line"
          >
            ↩️ Reset Nodes
          </button>
        )}

        {isAlreadyAligned && onDeleteAlignment && (
          <button
            className="btn-danger aligner-btn-delete"
            onClick={() => {
              if (window.confirm(`Delete alignment for sequence ${sequenceId.slice(0, 8)}... and revert to raw GPS?`)) {
                onDeleteAlignment(sequenceId);
              }
            }}
            title="Delete custom aligned curve and revert to raw GPS"
          >
            🗑️ Delete Alignment
          </button>
        )}

        {onExcludeSequence && (
          <button
            className="btn-danger aligner-btn-exclude"
            onClick={() => {
              if (window.confirm(`Exclude and remove sequence ${sequenceId.slice(0, 8)}... from the map completely?`)) {
                onExcludeSequence(sequenceId);
              }
            }}
            title="Exclude and completely remove this sequence from display on the map"
          >
            🚫 Exclude Line
          </button>
        )}

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
