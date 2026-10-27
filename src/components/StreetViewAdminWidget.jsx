import React, { useState, useEffect } from 'react';
import { streetviewAlignmentService } from '../services/streetviewAlignmentService';

/**
 * StreetViewAdminWidget
 * Minimized floating widget on the left side of the 360 viewer for admins.
 * Implements Workstream 6 (Node Repositioning & Intersection Branch Calibration)
 * and Workstream 7 (Minimized Left-Side Widget for Node/Sequence Exclusions).
 */
export default function StreetViewAdminWidget({
  currentPos,
  isAdmin,
  onExcludeImage,
  onExcludeSequence,
  onCalibrateHeading,
  onNudgePosition,
  onNavigateToNode,
  isPinDraggable = false,
  onTogglePinDraggable,
  showToast,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('quick'); // 'quick' | 'branches' | 'offset'
  const [copiedField, setCopiedField] = useState(null);

  // Intersection branch linking form state
  const [forwardNodeId, setForwardNodeId] = useState('');
  const [branchLeftNodeId, setBranchLeftNodeId] = useState('');
  const [branchRightNodeId, setBranchRightNodeId] = useState('');
  const [branchNote, setBranchNote] = useState('');

  // Load existing links and overrides for active node
  useEffect(() => {
    if (!currentPos?.id) return;
    const existingLink = streetviewAlignmentService.getIntersectionLink(currentPos.id);
    if (existingLink) {
      setForwardNodeId(existingLink.forwardNodeId || '');
      setBranchLeftNodeId(existingLink.branchLeftNodeId || '');
      setBranchRightNodeId(existingLink.branchRightNodeId || '');
      setBranchNote(existingLink.note || '');
    } else {
      setForwardNodeId('');
      setBranchLeftNodeId('');
      setBranchRightNodeId('');
      setBranchNote('');
    }
  }, [currentPos?.id]);

  // Strict role guard: only render for authenticated admin
  if (!isAdmin || !currentPos) return null;

  const handleCopy = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedField(fieldName);
    showToast?.(`📋 Copied ${fieldName}: ${text}`);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleSaveBranches = () => {
    if (!currentPos?.id) return;
    streetviewAlignmentService.setIntersectionLink(currentPos.id, {
      forwardNodeId: forwardNodeId.trim() || null,
      branchLeftNodeId: branchLeftNodeId.trim() || null,
      branchRightNodeId: branchRightNodeId.trim() || null,
      note: branchNote.trim() || '',
    });
    showToast?.('💾 Intersection branch links calibrated & saved!');
  };

  const handleClearBranches = () => {
    if (!currentPos?.id) return;
    streetviewAlignmentService.removeIntersectionLink(currentPos.id);
    setForwardNodeId('');
    setBranchLeftNodeId('');
    setBranchRightNodeId('');
    setBranchNote('');
    showToast?.('🗑️ Branch links cleared for this node');
  };

  const truncatedKey = currentPos.id ? `${String(currentPos.id).slice(0, 10)}...` : 'N/A';
  const truncatedSeq = currentPos.sequenceId ? `${String(currentPos.sequenceId).slice(0, 10)}...` : 'N/A';

  // Collapsed State: Sleek left-docked pill
  if (isCollapsed) {
    return (
      <div
        className="streetview-admin-minimized"
        style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 35,
        }}
      >
        <button
          onClick={() => setIsCollapsed(false)}
          title="Expand Street View Admin Tools & Calibration"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '9999px',
            padding: '8px 12px',
            color: '#f8fafc',
            fontSize: '0.74rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            transition: 'all 0.2s ease',
          }}
        >
          <span style={{ fontSize: '0.9rem' }}>🛡️</span>
          <span>Admin</span>
          <span style={{ color: '#38bdf8' }}>›</span>
        </button>
      </div>
    );
  }

  // Expanded State: Compact left-side dock
  return (
    <div
      className="streetview-admin-dock"
      style={{
        position: 'absolute',
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 35,
        width: '270px',
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: '14px',
        padding: '12px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        animation: 'fadeInLeft 0.2s ease',
        fontSize: '0.75rem',
      }}
    >
      {/* Dock Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '8px',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.95rem' }}>🛡️</span>
          <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#e2e8f0' }}>
            Node &amp; Trail Admin
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          title="Minimize admin controls"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            borderRadius: '6px',
            color: '#94a3b8',
            padding: '2px 6px',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          ‹
        </button>
      </div>

      {/* Node Identity Display */}
      <div
        style={{
          background: 'rgba(2, 6, 23, 0.6)',
          borderRadius: '8px',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          marginBottom: '10px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Key:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <code style={{ color: '#38bdf8', fontSize: '0.72rem' }}>{truncatedKey}</code>
            <button
              onClick={() => handleCopy(currentPos.id, 'Image Key')}
              title="Copy full Image Key"
              style={{
                background: 'none',
                border: 'none',
                color: copiedField === 'Image Key' ? '#34d399' : '#94a3b8',
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: '0.72rem',
              }}
            >
              {copiedField === 'Image Key' ? '✓' : '📋'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Seq:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <code style={{ color: '#bae6fd', fontSize: '0.72rem' }}>{truncatedSeq}</code>
            {currentPos.sequenceId && (
              <button
                onClick={() => handleCopy(currentPos.sequenceId, 'Sequence ID')}
                title="Copy full Sequence ID"
                style={{
                  background: 'none',
                  border: 'none',
                  color: copiedField === 'Sequence ID' ? '#34d399' : '#94a3b8',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontSize: '0.72rem',
                }}
              >
                {copiedField === 'Sequence ID' ? '✓' : '📋'}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: '#64748b' }}>
          <span>GPS:</span>
          <span>{currentPos.lat?.toFixed(5)}, {currentPos.lng?.toFixed(5)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        <button
          onClick={() => setActiveTab('quick')}
          style={{
            flex: 1,
            padding: '5px 4px',
            fontSize: '0.7rem',
            fontWeight: 600,
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'quick' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 255, 255, 0.05)',
            color: activeTab === 'quick' ? '#60a5fa' : '#94a3b8',
            cursor: 'pointer',
          }}
        >
          🚫 Exclude
        </button>
        <button
          onClick={() => setActiveTab('branches')}
          style={{
            flex: 1.2,
            padding: '5px 4px',
            fontSize: '0.7rem',
            fontWeight: 600,
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'branches' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.05)',
            color: activeTab === 'branches' ? '#34d399' : '#94a3b8',
            cursor: 'pointer',
          }}
        >
          🌿 Branches
        </button>
        <button
          onClick={() => setActiveTab('offset')}
          style={{
            flex: 1,
            padding: '5px 4px',
            fontSize: '0.7rem',
            fontWeight: 600,
            borderRadius: '6px',
            border: 'none',
            background: activeTab === 'offset' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(255, 255, 255, 0.05)',
            color: activeTab === 'offset' ? '#fbbf24' : '#94a3b8',
            cursor: 'pointer',
          }}
        >
          📐 Calibrate
        </button>
      </div>

      {/* Tab 1: Quick Exclude Controls (Workstream 7) */}
      {activeTab === 'quick' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => onExcludeImage?.(currentPos.id)}
              className="btn btn-sm"
              title="Exclude only this specific image node"
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#fca5a5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
            >
              <span>🚫</span>
              <span>Exclude Node</span>
            </button>

            {currentPos.sequenceId && (
              <button
                onClick={() => onExcludeSequence?.(currentPos.sequenceId)}
                className="btn btn-sm"
                title="Exclude entire erratic sequence corridor"
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  borderRadius: '8px',
                  background: 'rgba(220, 38, 38, 0.3)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#fee2e2',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                <span>⚠️</span>
                <span>Exclude Seq</span>
              </button>
            )}
          </div>
          <span style={{ fontSize: '0.67rem', color: '#64748b', textAlign: 'center' }}>
            Excluding removes points instantly from map and traversal.
          </span>
        </div>
      )}

      {/* Tab 2: Intersection Branch Calibration (Workstream 6.3 - Screenshot 005359) */}
      {activeTab === 'branches' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
            Calibrate true road directions at forks &amp; intersections:
          </span>

          {/* Straight Ahead (^) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '20px', color: '#38bdf8', fontWeight: 800 }}>^</span>
            <input
              type="text"
              placeholder="Straight ahead image ID..."
              value={forwardNodeId}
              onChange={(e) => setForwardNodeId(e.target.value.trim())}
              style={{
                flex: 1,
                fontSize: '0.7rem',
                padding: '4px 6px',
                borderRadius: '6px',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#f8fafc',
              }}
            />
          </div>

          {/* Branch Left (↰) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '20px', color: '#4ade80', fontWeight: 800 }}>↰</span>
            <input
              type="text"
              placeholder="Left turn branch image ID..."
              value={branchLeftNodeId}
              onChange={(e) => setBranchLeftNodeId(e.target.value.trim())}
              style={{
                flex: 1,
                fontSize: '0.7rem',
                padding: '4px 6px',
                borderRadius: '6px',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#f8fafc',
              }}
            />
          </div>

          {/* Branch Right (↱) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '20px', color: '#fbbf24', fontWeight: 800 }}>↱</span>
            <input
              type="text"
              placeholder="Right turn branch image ID..."
              value={branchRightNodeId}
              onChange={(e) => setBranchRightNodeId(e.target.value.trim())}
              style={{
                flex: 1,
                fontSize: '0.7rem',
                padding: '4px 6px',
                borderRadius: '6px',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#f8fafc',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button
              onClick={handleSaveBranches}
              style={{
                flex: 1,
                padding: '5px',
                fontSize: '0.72rem',
                fontWeight: 700,
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              💾 Save Branches
            </button>
            {(forwardNodeId || branchLeftNodeId || branchRightNodeId) && (
              <button
                onClick={handleClearBranches}
                style={{
                  padding: '5px 8px',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  cursor: 'pointer',
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Node Calibration & Offsets (Workstream 6.1 & 6.2) */}
      {activeTab === 'offset' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Compass Bearing Offset */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Compass Bearing:</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8' }}>
                {Math.round(currentPos.heading || 0)}°
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => onCalibrateHeading?.(-15)}
                title="Rotate compass -15°"
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '0.68rem',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f1f5f9',
                  cursor: 'pointer',
                }}
              >
                -15°
              </button>
              <button
                onClick={() => onCalibrateHeading?.(0, true)}
                title="Reset compass heading to default"
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '0.68rem',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
              <button
                onClick={() => onCalibrateHeading?.(+15)}
                title="Rotate compass +15°"
                style={{
                  flex: 1,
                  padding: '4px',
                  fontSize: '0.68rem',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f1f5f9',
                  cursor: 'pointer',
                }}
              >
                +15°
              </button>
            </div>
          </div>

          {/* Position Nudge D-Pad */}
          <div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              GPS Position Nudge (~4m):
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '4px',
                maxWidth: '120px',
                margin: '0 auto',
              }}
            >
              <div />
              <button
                onClick={() => onNudgePosition?.(0.00004, 0)}
                title="Nudge North"
                style={{
                  padding: '4px',
                  fontSize: '0.7rem',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                ▲
              </button>
              <div />
              <button
                onClick={() => onNudgePosition?.(0, -0.00004)}
                title="Nudge West"
                style={{
                  padding: '4px',
                  fontSize: '0.7rem',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                ◄
              </button>
              <button
                onClick={() => onNudgePosition?.(-0.00004, 0)}
                title="Nudge South"
                style={{
                  padding: '4px',
                  fontSize: '0.7rem',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                ▼
              </button>
              <button
                onClick={() => onNudgePosition?.(0, 0.00004)}
                title="Nudge East"
                style={{
                  padding: '4px',
                  fontSize: '0.7rem',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                ►
              </button>
            </div>
          </div>

          {/* Toggle 2D Map Dragging */}
          {onTogglePinDraggable && (
            <button
              onClick={onTogglePinDraggable}
              style={{
                marginTop: '4px',
                padding: '6px',
                borderRadius: '8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                border: 'none',
                background: isPinDraggable ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                color: isPinDraggable ? '#34d399' : '#cbd5e1',
                border: isPinDraggable ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <span>{isPinDraggable ? '🟢' : '⚪'}</span>
              <span>{isPinDraggable ? 'Map Pin Dragging: ON' : 'Enable Pin Drag on 2D Map'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
