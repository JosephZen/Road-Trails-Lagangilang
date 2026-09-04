import React, { useState, useEffect } from 'react';
import PseudoImage from './PseudoImage';
import { touristSpotsService, findNearestPanorama } from '../services/touristSpotsService';

const CATEGORIES = [
  'Education & Heritage',
  'Religious & Cultural Heritage',
  'Civic & Public Park',
  'Nature & Eco-Tourism',
  'Adventure & Trekking Trail',
  'Agri-Tourism & Cultural Handicrafts',
  'Scenic Highway & Overlook',
  'Historical Monument',
];

const BARANGAYS = [
  'Poblacion',
  'Bawa',
  'Nagtipulan',
  'Tagodtod',
  'Laguiben',
  'San Isidro',
  'La Paz',
  'Dalaguisen',
  'Pagudpud',
  'Pang-ot',
];

const THEMES = ['indigo', 'emerald', 'amber', 'cyan', 'rose', 'teal', 'violet', 'orange'];

export default function TouristSpotModal({
  isOpen,
  onClose,
  onSpotSaved,
  availablePanoramas = [],
  initialCoords = null,
  editingSpot = null,
}) {
  const [formData, setFormData] = useState({
    name: '',
    category: CATEGORIES[0],
    barangay: BARANGAYS[0],
    lat: '17.6167',
    lng: '120.7333',
    address: 'Lagangilang, Abra, Philippines',
    description: '',
    image: '',
    usePseudoImage: true,
    pseudoTheme: 'indigo',
    connectedPanoId: '',
    heading: '0',
    pitch: '0',
  });

  const [saving, setSaving] = useState(false);
  const [neonUrl, setNeonUrl] = useState('');
  const [showDbConfig, setShowDbConfig] = useState(false);
  const [dbStatusMsg, setDbStatusMsg] = useState('');

  // Pre-fill on open or edit
  useEffect(() => {
    setNeonUrl(touristSpotsService.getNeonUrl());

    if (editingSpot) {
      setFormData({
        name: editingSpot.name || '',
        category: editingSpot.category || CATEGORIES[0],
        barangay: editingSpot.barangay || BARANGAYS[0],
        lat: String(editingSpot.location?.lat || editingSpot.lat || '17.6167'),
        lng: String(editingSpot.location?.lng || editingSpot.lng || '120.7333'),
        address: editingSpot.location?.address || 'Lagangilang, Abra',
        description: editingSpot.description || '',
        image: editingSpot.image || '',
        usePseudoImage: editingSpot.isPseudoImage ?? !editingSpot.image,
        pseudoTheme: editingSpot.pseudoTheme || 'indigo',
        connectedPanoId: editingSpot.connected360?.targetId || '',
        heading: String(editingSpot.connected360?.heading ?? '0'),
        pitch: String(editingSpot.connected360?.pitch ?? '0'),
      });
    } else if (initialCoords) {
      const lat = parseFloat(initialCoords.lat).toFixed(6);
      const lng = parseFloat(initialCoords.lng).toFixed(6);
      const nearest = findNearestPanorama(parseFloat(lat), parseFloat(lng), availablePanoramas);

      setFormData((prev) => ({
        ...prev,
        lat,
        lng,
        connectedPanoId: nearest ? nearest.id : prev.connectedPanoId,
      }));
    }
  }, [editingSpot, initialCoords, isOpen, availablePanoramas]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Auto-detect closest 360 panorama based on currently typed lat/lng
  const handleAutoDetectNearestPano = () => {
    const lat = parseFloat(formData.lat);
    const lng = parseFloat(formData.lng);
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid numerical Latitude and Longitude first.');
      return;
    }

    const nearest = findNearestPanorama(lat, lng, availablePanoramas);
    if (nearest) {
      setFormData((prev) => ({
        ...prev,
        connectedPanoId: nearest.id,
      }));
      alert(`Linked to nearest panorama: "${nearest.label || nearest.id}" (~${nearest.distanceMeters}m away)`);
    } else {
      alert('No 360 panoramas found nearby.');
    }
  };

  const handleSaveNeonUrl = () => {
    touristSpotsService.setNeonUrl(neonUrl);
    setDbStatusMsg(neonUrl ? '✓ Neon URL saved to browser config!' : 'Cleared database URL.');
    setTimeout(() => setDbStatusMsg(''), 3000);
  };

  // Step 1: Save locally as draft (offline-first)
  const handleSaveDraft = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter a Tourist Spot name.');
      return;
    }

    setSaving(true);
    const spotPayload = {
      ...(editingSpot || {}),
      name: formData.name,
      category: formData.category,
      barangay: formData.barangay,
      lat: parseFloat(formData.lat),
      lng: parseFloat(formData.lng),
      address: formData.address,
      description: formData.description,
      image: formData.usePseudoImage ? null : formData.image || null,
      pseudoTheme: formData.pseudoTheme,
      connected360: {
        type: 'local',
        targetId: formData.connectedPanoId || null,
        heading: parseFloat(formData.heading) || 0,
        pitch: parseFloat(formData.pitch) || 0,
      },
    };

    const saved = touristSpotsService.saveDraftLocally(spotPayload, availablePanoramas);
    setSaving(false);
    onSpotSaved?.(saved);
    onClose();
  };

  // Step 2: Publish / Sync to Neon Cloud directly
  const handlePublishCloud = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter a Tourist Spot name.');
      return;
    }

    setSaving(true);
    try {
      // First save locally
      const spotPayload = {
        ...(editingSpot || {}),
        name: formData.name,
        category: formData.category,
        barangay: formData.barangay,
        lat: parseFloat(formData.lat),
        lng: parseFloat(formData.lng),
        address: formData.address,
        description: formData.description,
        image: formData.usePseudoImage ? null : formData.image || null,
        pseudoTheme: formData.pseudoTheme,
        connected360: {
          type: 'local',
          targetId: formData.connectedPanoId || null,
          heading: parseFloat(formData.heading) || 0,
          pitch: parseFloat(formData.pitch) || 0,
        },
      };

      const saved = touristSpotsService.saveDraftLocally(spotPayload, availablePanoramas);
      // Sync to Neon
      const result = await touristSpotsService.syncToNeonCloud(saved.id);
      alert(result.message);
      onSpotSaved?.(saved);
      onClose();
    } catch (err) {
      alert(`Cloud sync warning: ${err.message}. Draft has been saved locally.`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="upload-modal glass-panel" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2>⭐ {editingSpot ? 'Edit Tourist Spot' : 'Add Tourist Spot (POI)'}</h2>
            <p className="subtitle" style={{ margin: 0 }}>
              Lagangilang, Abra • 2-Step Offline Staging & Neon Cloud Integration
            </p>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => setShowDbConfig(!showDbConfig)}
            title="Configure Neon Database Connection"
            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
          >
            ⚙️ Neon DB
          </button>
        </div>

        {/* Database Config Drawer */}
        {showDbConfig && (
          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid var(--accent-primary)',
              marginBottom: '16px',
            }}
          >
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-glow)' }}>
              Neon PostgreSQL Connection String (Optional for Cloud Sync):
            </label>
            <input
              type="password"
              placeholder="postgresql://user:pass@ep-xyz.region.aws.neon.tech/neondb?sslmode=require"
              value={neonUrl}
              onChange={(e) => setNeonUrl(e.target.value)}
              className="input-field"
              style={{ width: '100%', fontSize: '0.8rem', marginTop: '4px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Without Neon URL, system uses offline local storage buffer.
              </span>
              <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '0.75rem' }} onClick={handleSaveNeonUrl}>
                Save URL
              </button>
            </div>
            {dbStatusMsg && (
              <p style={{ fontSize: '0.75rem', color: '#10b981', margin: '4px 0 0 0' }}>{dbStatusMsg}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSaveDraft}>
          {/* Basic Information */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Tourist Spot Name *
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. ASIST Main Campus, Mt. Mag-atong..."
                value={formData.name}
                onChange={handleChange}
                className="input-field"
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="input-field"
                style={{ width: '100%', marginTop: '4px' }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Barangay</label>
              <select
                name="barangay"
                value={formData.barangay}
                onChange={handleChange}
                className="input-field"
                style={{ width: '100%', marginTop: '4px' }}
              >
                {BARANGAYS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Location Coordinates */}
          <div
            style={{
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-glow)' }}>
                📍 GPS Coordinates (Lagangilang, Abra)
              </span>
              <button
                type="button"
                onClick={handleAutoDetectNearestPano}
                className="btn btn-ghost"
                style={{ fontSize: '0.7rem', padding: '2px 6px' }}
              >
                🔗 Link Nearest 360° Pano
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Latitude</label>
                <input
                  type="number"
                  step="any"
                  name="lat"
                  required
                  value={formData.lat}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Longitude</label>
                <input
                  type="number"
                  step="any"
                  name="lng"
                  required
                  value={formData.lng}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '8px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Local Address / Landmark Details</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="input-field"
                style={{ width: '100%', marginTop: '2px' }}
              />
            </div>
          </div>

          {/* Interactive Description */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Interactive Description * (Clickable in Street View to orient 360° camera)
            </label>
            <textarea
              name="description"
              required
              rows={3}
              placeholder="Describe the cultural, historical, or ecological significance of this spot in Lagangilang..."
              value={formData.description}
              onChange={handleChange}
              className="input-field"
              style={{ width: '100%', marginTop: '4px', resize: 'vertical' }}
            />
          </div>

          {/* Image & Pseudo-Image Options */}
          <div
            style={{
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                🖼️ Tourist Spot Imagery
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="usePseudoImage"
                  checked={formData.usePseudoImage}
                  onChange={handleChange}
                />
                Use Auto-Generated Pseudo Image
              </label>
            </div>

            {formData.usePseudoImage ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Color Palette:</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {THEMES.map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, pseudoTheme: theme }))}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: formData.pseudoTheme === theme ? '2px solid white' : '1px solid rgba(255,255,255,0.2)',
                          background: theme,
                          cursor: 'pointer',
                        }}
                        title={theme}
                      />
                    ))}
                  </div>
                </div>

                {/* Real-time Pseudo-Image Preview */}
                <PseudoImage
                  title={formData.name || 'Sample Tourist Attraction'}
                  category={formData.category}
                  theme={formData.pseudoTheme}
                  height="100px"
                />
              </div>
            ) : (
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Image URL or Path</label>
                <input
                  type="text"
                  name="image"
                  placeholder="https://... or /panoramas/..."
                  value={formData.image}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%', marginTop: '2px' }}
                />
              </div>
            )}
          </div>

          {/* 360 Panorama Linkage */}
          <div
            style={{
              padding: '10px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '16px',
            }}
          >
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-glow)', display: 'block', marginBottom: '6px' }}>
              🌐 Connected 360° Street View Panorama
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Target Panorama</label>
                <select
                  name="connectedPanoId"
                  value={formData.connectedPanoId}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%' }}
                >
                  <option value="">-- Select or Auto-Detect --</option>
                  {availablePanoramas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label || p.id} ({p.lat.toFixed(4)}, {p.lng.toFixed(4)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Heading (°)</label>
                <input
                  type="number"
                  name="heading"
                  min="0"
                  max="360"
                  value={formData.heading}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Pitch (°)</label>
                <input
                  type="number"
                  name="pitch"
                  min="-90"
                  max="90"
                  value={formData.pitch}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* 2-Step Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>

            {/* Step 1: Save Draft Locally */}
            <button
              type="submit"
              disabled={saving}
              className="btn btn-secondary"
              style={{
                border: '1px solid #f59e0b',
                color: '#fbbf24',
              }}
              title="Step 1: Save locally for field review on map and 360 viewer"
            >
              🟡 Save Draft Locally (Step 1)
            </button>

            {/* Step 2: Publish / Sync to Neon */}
            <button
              type="button"
              disabled={saving}
              onClick={handlePublishCloud}
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              }}
              title="Step 2: Commit verified data to Neon PostgreSQL Cloud"
            >
              🚀 Publish to Neon (Step 2)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
