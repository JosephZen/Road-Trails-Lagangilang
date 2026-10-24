import React, { useState, useEffect } from 'react';
import PseudoImage from './PseudoImage';
import { touristSpotsService } from '../services/touristSpotsService';
import { useMapillary } from '../hooks/useMapillary';

export const TOURIST_CATEGORIES = [
  { name: 'Nature & Eco-Tourism', icon: '🏞️' },
  { name: 'Historical & Cultural Heritage', icon: '🏛️' },
  { name: 'Scenic Viewpoint & Overlook', icon: '🌄' },
  { name: 'Adventure & Trekking Trail', icon: '🌉' },
  { name: 'Agri-Tourism & Cultural Handicrafts', icon: '🌾' },
  { name: 'Civic & Public Park', icon: '🌳' },
  { name: 'Religious & Spiritual Site', icon: '⛪' },
];

export const POI_CATEGORIES = [
  { name: 'Gas Station & Fuel', icon: '⛽' },
  { name: 'Restaurant & Dining', icon: '🍽️' },
  { name: 'Local Eatery & Carinderia', icon: '🍲' },
  { name: 'Hotel & Accommodation', icon: '🏨' },
  { name: 'Convenience Store & Market', icon: '🏪' },
  { name: 'Pharmacy & Health Clinic', icon: '💊' },
  { name: 'Bank & ATM', icon: '🏧' },
  { name: 'Transport Terminal', icon: '🚌' },
  { name: 'Government & Emergency Services', icon: '🏛️' },
];

export const LAGANGILANG_BARANGAYS = [
  'Aguet',
  'Bacooc',
  'Balais',
  'Cayapa',
  'Dalaguisen',
  'Laang',
  'Lagben',
  'Laguiben',
  'Nagtipulan',
  'Nagtupacan',
  'Paganao',
  'Pawa',
  'Poblacion',
  'Presentar',
  'San Isidro',
  'Tagodtod',
  'Taping',
];

export const BARANGAYS = LAGANGILANG_BARANGAYS;

const THEMES = ['indigo', 'emerald', 'amber', 'cyan', 'rose', 'teal', 'violet', 'orange'];

export default function TouristSpotModal({
  isOpen,
  onClose,
  onSpotSaved,
  onSpotDeleted,
  initialCoords = null,
  editingSpot = null,
}) {
  const [spotType, setSpotType] = useState('tourist_spot'); // 'tourist_spot' | 'poi'
  const { searchNearby } = useMapillary();
  const [detectingMapillary, setDetectingMapillary] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    category: TOURIST_CATEGORIES[0].name,
    categoryIcon: TOURIST_CATEGORIES[0].icon,
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
  const [deleting, setDeleting] = useState(false);

  // Pre-fill on open or edit
  useEffect(() => {
    if (editingSpot) {
      const isPoi = editingSpot.spotType === 'poi' || editingSpot.type === 'poi';
      const currentType = isPoi ? 'poi' : 'tourist_spot';
      setSpotType(currentType);

      const categoryList = isPoi ? POI_CATEGORIES : TOURIST_CATEGORIES;
      const defaultCat = categoryList[0].name;
      const currentCategory = editingSpot.category || defaultCat;
      const matched = categoryList.find((c) => c.name === currentCategory);

      setFormData({
        name: editingSpot.name || '',
        category: currentCategory,
        categoryIcon: editingSpot.categoryIcon || matched?.icon || (isPoi ? '📍' : '⭐'),
        barangay: editingSpot.barangay || BARANGAYS[0],
        lat: String(editingSpot.location?.lat || editingSpot.lat || '17.6167'),
        lng: String(editingSpot.location?.lng || editingSpot.lng || '120.7333'),
        address: editingSpot.location?.address || 'Lagangilang, Abra',
        description: editingSpot.description || '',
        image: editingSpot.image || '',
        usePseudoImage: editingSpot.isPseudoImage ?? !editingSpot.image,
        pseudoTheme: editingSpot.pseudoTheme || (isPoi ? 'cyan' : 'indigo'),
        connectedPanoId: editingSpot.connected360?.targetId || '',
        heading: String(editingSpot.connected360?.heading ?? '0'),
        pitch: String(editingSpot.connected360?.pitch ?? '0'),
      });
    } else {
      setSpotType('tourist_spot');
      const baseLat = initialCoords ? parseFloat(initialCoords.lat).toFixed(6) : '17.6082';
      const baseLng = initialCoords ? parseFloat(initialCoords.lng).toFixed(6) : '120.7380';

      setFormData({
        name: '',
        category: TOURIST_CATEGORIES[0].name,
        categoryIcon: TOURIST_CATEGORIES[0].icon,
        barangay: BARANGAYS[0],
        lat: baseLat,
        lng: baseLng,
        address: 'Lagangilang, Abra, Philippines',
        description: '',
        image: '',
        usePseudoImage: true,
        pseudoTheme: 'indigo',
        connectedPanoId: '',
        heading: '0',
        pitch: '0',
      });
    }
  }, [editingSpot, initialCoords, isOpen]);

  if (!isOpen) return null;

  const currentCategoryList = spotType === 'tourist_spot' ? TOURIST_CATEGORIES : POI_CATEGORIES;

  const handleTypeChange = (newType) => {
    setSpotType(newType);
    const catList = newType === 'tourist_spot' ? TOURIST_CATEGORIES : POI_CATEGORIES;
    setFormData((prev) => ({
      ...prev,
      category: catList[0].name,
      categoryIcon: catList[0].icon,
      pseudoTheme: newType === 'poi' ? 'cyan' : 'indigo',
    }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'category') {
      const matched = currentCategoryList.find((c) => c.name === value);
      setFormData((prev) => ({
        ...prev,
        category: value,
        categoryIcon: matched ? matched.icon : prev.categoryIcon,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Auto-detect closest Mapillary street view image based on currently typed lat/lng
  const handleAutoDetectNearestPano = async () => {
    const lat = parseFloat(formData.lat);
    const lng = parseFloat(formData.lng);
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid numerical Latitude and Longitude first.');
      return;
    }

    setDetectingMapillary(true);
    try {
      const results = await searchNearby(lat, lng);
      if (results && results.length > 0) {
        const closest = results[0];
        setFormData((prev) => ({
          ...prev,
          connectedPanoId: closest.id,
        }));
        alert(`Linked to nearest Mapillary Street View image ID: "${closest.id}"!`);
      } else {
        alert('No Mapillary street view images found near these coordinates. The system will auto-fallback to the nearest available road sequence.');
      }
    } catch (err) {
      alert(`Mapillary query error: ${err.message}`);
    } finally {
      setDetectingMapillary(false);
    }
  };

  // Save to System (local storage + mirrored to local disk & postgres)
  const handleSaveToSystem = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter a location name.');
      return;
    }

    setSaving(true);
    const latNum = parseFloat(formData.lat);
    const lngNum = parseFloat(formData.lng);

    const spotPayload = {
      ...(editingSpot || {}),
      name: formData.name.trim(),
      spotType,
      category: formData.category,
      categoryIcon: formData.categoryIcon,
      barangay: formData.barangay,
      lat: latNum,
      lng: lngNum,
      location: {
        ...(editingSpot?.location || {}),
        lat: latNum,
        lng: lngNum,
        address: formData.address,
      },
      address: formData.address,
      description: formData.description,
      image: formData.usePseudoImage ? null : formData.image || null,
      isPseudoImage: formData.usePseudoImage,
      pseudoTheme: formData.pseudoTheme,
      connected360: {
        type: 'mapillary',
        targetId: formData.connectedPanoId || null,
        heading: parseFloat(formData.heading) || 0,
        pitch: parseFloat(formData.pitch) || 0,
      },
    };

    const saved = touristSpotsService.saveDraftLocally(spotPayload, []);
    setSaving(false);
    onSpotSaved?.(saved);
    onClose();
  };

  // Delete directly in system
  const handleDelete = () => {
    if (!editingSpot) return;
    if (window.confirm(`Are you sure you want to delete "${editingSpot.name}" from the system?`)) {
      setDeleting(true);
      touristSpotsService.deleteSpot(editingSpot.id);
      setDeleting(false);
      onSpotDeleted?.(editingSpot.id);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card glass-panel" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {editingSpot ? '✎ Edit Location in System' : '⭐ Add New Location'}
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Admin Panel · Lagangilang, Abra GIS Database
            </span>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: '1.2rem' }}>
            ✕
          </button>
        </div>

        {/* Spot Type Switcher Tabs (Tourist Attraction vs POI Services) */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            background: 'rgba(0,0,0,0.3)',
            padding: '4px',
            borderRadius: 'var(--radius-full)',
            marginBottom: '16px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => handleTypeChange('tourist_spot')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: spotType === 'tourist_spot' ? 'linear-gradient(135deg, #ffd700 0%, #f59e0b 100%)' : 'transparent',
              color: spotType === 'tourist_spot' ? '#1a1a2e' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            <span>🌴</span>
            <span>Tourist Attraction</span>
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('poi')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: spotType === 'poi' ? 'linear-gradient(135deg, #06d6a0 0%, #0284c7 100%)' : 'transparent',
              color: spotType === 'poi' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            <span>🏪</span>
            <span>Point of Interest (Services & POI)</span>
          </button>
        </div>

        <form onSubmit={handleSaveToSystem}>
          {/* Name & Icon Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {spotType === 'tourist_spot' ? 'Attraction Name *' : 'Facility / Business Name *'}
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder={spotType === 'tourist_spot' ? 'e.g. Mount Mag-atong Eco-Trail' : 'e.g. Petron Gas Station / Poblacion Eatery'}
                value={formData.name}
                onChange={handleChange}
                className="input-field"
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Icon</label>
              <input
                type="text"
                name="categoryIcon"
                value={formData.categoryIcon}
                onChange={handleChange}
                className="input-field"
                style={{ width: '60px', marginTop: '4px', textAlign: 'center', fontSize: '1.2rem' }}
                title="Marker emoji icon"
              />
            </div>
          </div>

          {/* Category & Barangay Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="input-field"
                style={{ width: '100%', marginTop: '4px' }}
              >
                {currentCategoryList.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Barangay (17 Total)</label>
              <select
                name="barangay"
                value={formData.barangay}
                onChange={handleChange}
                className="input-field"
                style={{ width: '100%', marginTop: '4px' }}
              >
                {LAGANGILANG_BARANGAYS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ========== Designed Placement & Coordinates Box ========== */}
          <div
            className="placement-box"
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
              border: '1.5px solid rgba(67, 97, 238, 0.4)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              marginBottom: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.15rem' }}>📍</span>
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', display: 'block' }}>
                    Map Placement & GPS Coordinates
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                    Precise WGS84 coordinates on Lagangilang Map
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(67, 97, 238, 0.25)',
                  color: '#93c5fd',
                  border: '1px solid rgba(147, 197, 253, 0.35)',
                }}
              >
                Brgy. {formData.barangay || 'Poblacion'}
              </span>
            </div>

            {/* Coordinates Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                  <span>🌐</span> Latitude (N) *
                </label>
                <input
                  type="text"
                  name="lat"
                  required
                  placeholder="e.g. 17.608250"
                  value={formData.lat}
                  onChange={handleChange}
                  className="input-field"
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    background: 'rgba(15, 23, 42, 0.9)',
                    borderColor: 'rgba(67, 97, 238, 0.45)',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                  <span>🌐</span> Longitude (E) *
                </label>
                <input
                  type="text"
                  name="lng"
                  required
                  placeholder="e.g. 120.738083"
                  value={formData.lng}
                  onChange={handleChange}
                  className="input-field"
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    background: 'rgba(15, 23, 42, 0.9)',
                    borderColor: 'rgba(67, 97, 238, 0.45)',
                  }}
                />
              </div>
            </div>

            {/* Helper Hint */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px dashed rgba(255, 255, 255, 0.15)',
                fontSize: '0.72rem',
                color: '#cbd5e1',
              }}
            >
              <span>🎯</span>
              <span>
                <strong>Placement:</strong> Coordinates are automatically set from your map click. You can also <strong>drag this marker on the map</strong> in Admin mode anytime to relocate it.
              </span>
            </div>
          </div>

          {/* Address */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Address / Landmark</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              className="input-field"
              style={{ width: '100%', marginTop: '4px' }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Description & Visitor Info *
            </label>
            <textarea
              name="description"
              required
              rows={3}
              placeholder={spotType === 'tourist_spot' ? 'Details about the attraction, visitor tips, accessibility...' : 'Opening hours, fuel types available, food specialty, room rates...'}
              value={formData.description}
              onChange={handleChange}
              className="input-field"
              style={{ width: '100%', marginTop: '4px', resize: 'vertical' }}
            />
          </div>

          {/* Image & Pseudo-Image Palette */}
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
                🖼️ Card Visual Representation
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="usePseudoImage"
                  checked={formData.usePseudoImage}
                  onChange={handleChange}
                />
                Use Stylized Graphic
              </label>
            </div>

            {formData.usePseudoImage ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Theme Palette:</span>
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

                <PseudoImage
                  title={formData.name || (spotType === 'tourist_spot' ? 'Sample Attraction' : 'Sample Facility')}
                  category={formData.category}
                  theme={formData.pseudoTheme}
                  height="90px"
                />
              </div>
            ) : (
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Image URL or Path</label>
                <input
                  type="text"
                  name="image"
                  placeholder="https://... or photo URL"
                  value={formData.image}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%', marginTop: '2px' }}
                />
              </div>
            )}
          </div>

          {/* 360 Mapillary Street View Linkage */}
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
              🌐 Connected 360° Street View & Panorama Image (Database Upload)
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr auto 1fr 1fr', gap: '8px', alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>360 Image / Mapillary ID</label>
                <input
                  type="text"
                  name="connectedPanoId"
                  placeholder="e.g. 1532761357806896 or custom pano ID"
                  value={formData.connectedPanoId}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAutoDetectNearestPano}
                  disabled={detectingMapillary}
                  style={{ fontSize: '0.72rem', padding: '7px 10px', whiteSpace: 'nowrap' }}
                  title="Detect nearest Mapillary 360 image from coordinates"
                >
                  {detectingMapillary ? '⏳ Searching...' : '🔍 Detect Nearest'}
                </button>
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
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '6px 0 0 0' }}>
              Leave blank to automatically connect to the nearest Mapillary street view sequence when viewed on the map.
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
            {editingSpot && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="btn btn-secondary"
                style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)', marginRight: 'auto' }}
              >
                {deleting ? 'Deleting...' : '🗑️ Delete Location'}
              </button>
            )}

            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{
                background: spotType === 'tourist_spot' ? 'linear-gradient(135deg, #ffd700 0%, #f59e0b 100%)' : 'linear-gradient(135deg, #06d6a0 0%, #0284c7 100%)',
                color: spotType === 'tourist_spot' ? '#1a1a2e' : '#ffffff',
                fontWeight: 700,
                border: 'none',
              }}
            >
              {saving ? 'Saving...' : editingSpot ? '💾 Save Changes' : '⭐ Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
