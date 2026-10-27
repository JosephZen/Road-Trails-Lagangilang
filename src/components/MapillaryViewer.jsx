import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Viewer } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';
import { isNearCampusJunction, UA_HIGHWAY_JUNCTION } from '../utils/streetViewJunctions';
import { streetviewAlignmentService } from '../services/streetviewAlignmentService';
import StreetViewAdminWidget from './StreetViewAdminWidget';

const MAPILLARY_ACCESS_TOKEN = 'MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9';
// Valid 360° panos at the campus gate entrances (active verified Mapillary imagery)
const DEFAULT_IMAGE_ID = '1171410495001931'; // UA Campus Gate Entrance
const FALLBACK_NORTH_GATE_ID = '2181045539141833'; // UA North Campus Gate

const isValidMapillaryId = (id) => {
  return id && String(id).length >= 10 && /^\d+$/.test(String(id));
};

function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Robust Mapillary 360° Street View Viewer using native mapillary-js v4.
 * Features:
 * - Native 3D interactive spatial arrows on the road surface (sequence, direction, spatialData)
 * - Exclusion & blacklist filtering for buggy sequences and erratic nodes
 * - Spatial leap guardrail (>75m warning threshold)
 * - Location menu with admin exclusion controls
 */
export default function MapillaryViewer({
  imageId,
  excludedSequences = [],
  excludedImageKeys = [],
  onPositionChange,
  onHeadingChange,
  steerTarget,
  onSwitchToGoogle,
  isAdmin = false,
  onExcludeImage,
  onExcludeSequence,
  onCalibrateNodePosition,
  isPinDraggable = false,
  onTogglePinDraggable,
  showToast,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);

  const currentImageIdRef = useRef(null);
  const currentSequenceIdRef = useRef(null);
  const lastValidPosRef = useRef(null);

  // Compass heading calibration handler (Workstream 6.2)
  const handleCalibrateHeading = useCallback(async (delta, isReset = false) => {
    const viewer = viewerRef.current;
    if (!viewer || !currentPos?.id) return;
    try {
      const pov = await viewer.getPointOfView();
      const newBearing = isReset ? (currentPos.originalHeading ?? 0) : ((pov.bearing || 0) + delta + 360) % 360;
      await viewer.setPointOfView({ bearing: newBearing, pitch: pov.pitch || 0 });
      
      const existing = streetviewAlignmentService.getNodeOverride(currentPos.id) || {};
      const newOffset = isReset ? 0 : (existing.compassAngleOffset || 0) + delta;
      streetviewAlignmentService.setNodeOverride(currentPos.id, {
        compassAngleOffset: newOffset,
      });

      setCurrentPos((prev) => ({
        ...prev,
        heading: newBearing,
      }));
      onHeadingChange?.(newBearing);
      showToast?.(`Compass bearing calibrated: ${Math.round(newBearing)}° (${newOffset >= 0 ? '+' : ''}${newOffset}°)`);
    } catch (e) {
      console.warn('Heading calibration error:', e);
    }
  }, [currentPos, onHeadingChange, showToast]);

  // GPS position nudge handler (Workstream 6.1)
  const handleNudgePosition = useCallback((dLat, dLng) => {
    if (!currentPos?.id) return;
    const newLat = currentPos.lat + dLat;
    const newLng = currentPos.lng + dLng;

    streetviewAlignmentService.setNodeOverride(currentPos.id, {
      lat: newLat,
      lng: newLng,
    });

    const updatedPos = {
      ...currentPos,
      lat: newLat,
      lng: newLng,
      isAligned: true,
    };
    setCurrentPos(updatedPos);
    onPositionChange?.(updatedPos);
    onCalibrateNodePosition?.(currentPos.id, newLat, newLng);
    showToast?.(`📍 Position calibrated: ${newLat.toFixed(5)}, ${newLng.toFixed(5)}`);
  }, [currentPos, onPositionChange, onCalibrateNodePosition, showToast]);

  // Navigate to target node (for branches)
  const handleNavigateToNode = useCallback((targetNodeId) => {
    if (!viewerRef.current || !targetNodeId) return;
    viewerRef.current.moveTo(targetNodeId).catch((err) => {
      console.warn('Failed to move to target node:', err);
      showToast?.(`⚠️ Could not branch to node ${String(targetNodeId).slice(0, 8)}`);
    });
  }, [showToast]);

  // Apply filter to exclude unwanted sequences and individual buggy image nodes
  const applyFilter = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const excludedSeq = Array.isArray(excludedSequences) ? excludedSequences.map(String) : [];
    const excludedImg = Array.isArray(excludedImageKeys) ? excludedImageKeys.map(String) : [];

    const filters = [];
    if (excludedSeq.length > 0) {
      filters.push(['!in', 'sequenceId', ...excludedSeq]);
    }
    if (excludedImg.length > 0) {
      filters.push(['!in', 'id', ...excludedImg]);
    }

    let filterExpr = null;
    if (filters.length === 1) {
      filterExpr = filters[0];
    } else if (filters.length > 1) {
      filterExpr = ['all', ...filters];
    }

    try {
      viewer.setFilter(filterExpr);
    } catch (e) {
      console.warn('Mapillary filter warning:', e);
    }
  }, [excludedSequences, excludedImageKeys]);

  // Re-apply filter whenever exclusions update
  useEffect(() => {
    applyFilter();
  }, [excludedSequences, excludedImageKeys, applyFilter]);

  // Initialize Viewer on Mount with native Mapillary navigation components
  useEffect(() => {
    if (!containerRef.current) return;

    let viewer;
    let isMounted = true;
    const targetId = isValidMapillaryId(imageId) ? String(imageId) : DEFAULT_IMAGE_ID;
    currentImageIdRef.current = targetId;

    try {
      viewer = new Viewer({
        accessToken: MAPILLARY_ACCESS_TOKEN,
        container: containerRef.current,
        imageId: targetId,
        component: {
          cover: false,
          direction: true,
          sequence: true,
          spatialData: true,
          zoom: true,
        },
      });

      // Event: Image displayed in viewer
      viewer.on('image', (event) => {
        if (!isMounted) return;
        setIsLoading(false);
        setError(null);

        const image = event.image;
        if (image) {
          const imageIdStr = String(image.id);
          currentImageIdRef.current = imageIdStr;
          const seqId = image.sequenceId || image.sequence?.id;
          currentSequenceIdRef.current = seqId;

          const rawLat = image.lngLat?.lat;
          const rawLng = image.lngLat?.lng;

          // Spatial Leap Guardrail (> 75m jump sanity check)
          if (lastValidPosRef.current && rawLat && rawLng) {
            const dist = getHaversineDistance(
              lastValidPosRef.current.lat,
              lastValidPosRef.current.lng,
              rawLat,
              rawLng
            );
            if (dist > 75) {
              console.warn(`[Mapillary Leap Guardrail] Distance jumped: ${Math.round(dist)}m > 75m threshold. Checking alignment.`);
            }
          }
          lastValidPosRef.current = { lat: rawLat, lng: rawLng };

          // Retrieve re-aligned curve coordinates if this sequence was re-aligned by admin
          const alignedPos = streetviewAlignmentService.getAlignedPositionForImage(imageIdStr);

          // Auto-recover if an excluded sequence or excluded image is ever encountered
          const excludedSeq = Array.isArray(excludedSequences) ? excludedSequences.map(String) : [];
          const excludedImg = Array.isArray(excludedImageKeys) ? excludedImageKeys.map(String) : [];

          if ((seqId && excludedSeq.includes(String(seqId))) || excludedImg.includes(imageIdStr)) {
            console.warn(`Image belongs to excluded set (${imageIdStr} / ${seqId}); auto-recovering to campus entrance...`);
            viewer.moveTo(DEFAULT_IMAGE_ID).catch(() => {
              viewer.moveTo(FALLBACK_NORTH_GATE_ID).catch(() => {});
            });
            return;
          }

          // Apply exclusion filter
          applyFilter();

          const pos = {
            lat: alignedPos?.lat ?? rawLat,
            lng: alignedPos?.lng ?? rawLng,
            id: imageIdStr,
            sequenceId: seqId,
            heading: alignedPos?.heading ?? image.compassAngle,
            isAligned: !!alignedPos,
          };
          setCurrentPos(pos);
          onPositionChange?.(pos);
        }
      });

      // Event: Viewer fully loaded
      viewer.on('load', () => {
        if (!isMounted) return;
        setIsLoading(false);
        applyFilter();
      });

      // Event: Camera bearing/pitch change
      viewer.on('pov', (event) => {
        if (!isMounted) return;
        if (typeof event.bearing === 'number') {
          onHeadingChange?.(event.bearing);
        }
      });

      viewerRef.current = viewer;

      // Force initial resizes after DOM layout stabilizes
      setTimeout(() => {
        if (isMounted && viewerRef.current) {
          try { viewerRef.current.resize(); } catch (e) { /* ignore */ }
        }
      }, 100);

      setTimeout(() => {
        if (isMounted && viewerRef.current) {
          try { viewerRef.current.resize(); } catch (e) { /* ignore */ }
        }
      }, 500);

    } catch (err) {
      console.error('Failed to initialize Mapillary viewer:', err);
      if (isMounted) {
        setError('Could not load Mapillary 360° street view. Please verify internet connection.');
        setIsLoading(false);
      }
    }

    return () => {
      isMounted = false;
      if (viewerRef.current) {
        try {
          viewerRef.current.remove();
        } catch (e) {
          console.warn('Mapillary cleanup warning:', e);
        }
        viewerRef.current = null;
      }
    };
  }, []);

  // Sync imageId prop changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (!isValidMapillaryId(imageId)) return;

    const targetIdStr = String(imageId);
    if (targetIdStr === currentImageIdRef.current) return;

    // Check if blacklisted
    if (excludedImageKeys.includes(targetIdStr)) {
      console.warn(`Target image ${targetIdStr} is blacklisted.`);
      return;
    }

    currentImageIdRef.current = targetIdStr;
    setIsLoading(true);

    viewer
      .moveTo(targetIdStr)
      .then((img) => {
        setIsLoading(false);
        if (img) {
          const alignedPos = streetviewAlignmentService.getAlignedPositionForImage(targetIdStr);
          const pos = {
            lat: alignedPos?.lat ?? img.lngLat?.lat,
            lng: alignedPos?.lng ?? img.lngLat?.lng,
            id: targetIdStr,
            sequenceId: img.sequenceId || img.sequence?.id,
            heading: alignedPos?.heading ?? img.compassAngle,
            isAligned: !!alignedPos,
          };
          setCurrentPos(pos);
          onPositionChange?.(pos);
        }
      })
      .catch((err) => {
        setIsLoading(false);
        if (err?.name !== 'CancelMapillaryError' && !err?.message?.includes('cancel')) {
          console.warn(`Could not navigate directly to ${targetIdStr}:`, err);
        }
      });
  }, [imageId, onPositionChange, excludedImageKeys]);

  // Steer Target Camera Bearing Sync
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !steerTarget || typeof steerTarget.bearing !== 'number') return;
    try {
      viewer.setPointOfView({
        bearing: steerTarget.bearing,
        pitch: typeof steerTarget.pitch === 'number' ? steerTarget.pitch : 0,
      });
    } catch (e) {
      console.warn('Could not set Mapillary POV:', e);
    }
  }, [steerTarget]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000000' }}>
      {/* Loading Overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10, 15, 29, 0.75)',
            backdropFilter: 'blur(8px)',
            color: '#ffffff',
            gap: '12px',
          }}
        >
          <div className="spinner" style={{ width: '38px', height: '38px' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}>
            Loading Mapillary 360° Trail...
          </span>
        </div>
      )}

      {/* Error Overlay */}
      {error && !isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10, 15, 29, 0.9)',
            color: '#ffffff',
            padding: '24px',
            textAlign: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '2rem' }}>⚠️</span>
          <p style={{ fontSize: '0.88rem', color: '#f87171', maxWidth: '320px', margin: 0 }}>
            {error}
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (viewerRef.current) {
                viewerRef.current.moveTo(DEFAULT_IMAGE_ID).catch(() => {});
              }
            }}
          >
            Reset to UA Campus Gate
          </button>
        </div>
      )}

      {/* Minimized Admin Tools & Calibration Widget on Left Side (Workstreams 6 & 7) */}
      <StreetViewAdminWidget
        currentPos={currentPos}
        isAdmin={isAdmin}
        onExcludeImage={onExcludeImage}
        onExcludeSequence={onExcludeSequence}
        onCalibrateHeading={handleCalibrateHeading}
        onNudgePosition={handleNudgePosition}
        onNavigateToNode={handleNavigateToNode}
        isPinDraggable={isPinDraggable}
        onTogglePinDraggable={onTogglePinDraggable}
        showToast={showToast}
      />

      {/* Intersection Branch Chevrons (Workstream 6.3 - for forks like Screenshot 005359) */}
      {(() => {
        const branchLink = currentPos?.id ? streetviewAlignmentService.getIntersectionLink(currentPos.id) : null;
        if (!branchLink || (!branchLink.branchLeftNodeId && !branchLink.forwardNodeId && !branchLink.branchRightNodeId)) {
          return null;
        }

        return (
          <div
            className="intersection-branch-hud"
            style={{
              position: 'absolute',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 34,
              display: 'flex',
              gap: '8px',
              background: 'rgba(15, 23, 42, 0.92)',
              padding: '6px 14px',
              borderRadius: 'var(--radius-full, 9999px)',
              border: '1.5px solid #10b981',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(12px)',
              animation: 'fadeInUp 0.3s ease',
            }}
          >
            {branchLink.branchLeftNodeId && (
              <button
                onClick={() => handleNavigateToNode(branchLink.branchLeftNodeId)}
                className="btn btn-sm"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '5px 12px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Branch onto left path"
              >
                <span>↰</span>
                <span>Left Branch</span>
              </button>
            )}

            {branchLink.forwardNodeId && (
              <button
                onClick={() => handleNavigateToNode(branchLink.forwardNodeId)}
                className="btn btn-sm"
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '5px 12px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Continue straight down road"
              >
                <span>⮝</span>
                <span>Straight Ahead</span>
              </button>
            )}

            {branchLink.branchRightNodeId && (
              <button
                onClick={() => handleNavigateToNode(branchLink.branchRightNodeId)}
                className="btn btn-sm"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '5px 12px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Branch onto right path"
              >
                <span>↱</span>
                <span>Right Branch</span>
              </button>
            )}
          </div>
        );
      })()}

      {/* Bottom-Left Highway Junction Transition: Step Out to Abra-Kalinga Highway on Google Street View */}
      {currentPos && isNearCampusJunction(currentPos.lat, currentPos.lng) && onSwitchToGoogle && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '16px',
            zIndex: 35,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.94)',
            padding: '6px 14px',
            borderRadius: 'var(--radius-full, 9999px)',
            border: '1.5px solid #38bdf8',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)',
            animation: 'fadeInUp 0.3s ease-out',
            width: 'fit-content',
          }}
        >
          <span style={{ fontSize: '1rem' }}>🌐</span>
          <span style={{ fontSize: '0.74rem', color: '#bae6fd', fontWeight: 600 }}>
            Highway Connection:
          </span>
          <button
            onClick={() => onSwitchToGoogle({ lat: UA_HIGHWAY_JUNCTION.lat, lng: UA_HIGHWAY_JUNCTION.lng })}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-full, 9999px)',
              padding: '4px 12px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
            }}
          >
            <span>Step Out to Highway (Google Street View)</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* Street View Viewer container with native 3D spatial arrows */}
      <div ref={containerRef} className="panorama-container" style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
