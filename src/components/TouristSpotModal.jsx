import React, { useState, useEffect, useRef } from 'react';
import PseudoImage, { THEMES } from './PseudoImage';
import PrivacyBlurStudio from './PrivacyBlurStudio';
import {
  touristSpotsService,
  normalizeCategoryName,
  getDefaultCategoryIcon,
} from '../services/touristSpotsService';
import { useMapillary } from '../hooks/useMapillary';

const API_BASE = import.meta.env.VITE_API_BASE || '';

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

export const PRESET_ICONS = [
  // Spiritual & Heritage
  '⛪', '🏛️', '⛰️', '🎓', '🕌', '🏰',
  // Nature & Trail
  '🏞️', '🌊', '💧', '🪨', '🦇', '🌳', '🌄', '🌉', '🧗',
  // Agriculture & Products
  '🌾', '🐟', '🍫', '🌴', '🌻',
  // Services & POI
  '⛽', '🏪', '🍽️', '🍲', '☕', '🏨', '💊', '🏧', '🚌', '🏥', '🚨', '🛒',
  // Markers & Highlights
  '⭐', '📍', '✨', '🎯'
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
  const [uploadingNeon, setUploadingNeon] = useState(false);
  const [neonUploaded, setNeonUploaded] = useState(false);
  const [panoSourceTab, setPanoSourceTab] = useState('upload'); // 'upload' | 'mapillary'
  const [showBlurStudio, setShowBlurStudio] = useState(false);
  const [privacyBlurredCount, setPrivacyBlurredCount] = useState(0);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    category: TOURIST_CATEGORIES[0].name,
    categoryIcon: TOURIST_CATEGORIES[0].icon,
    cardVisualIcon: null, // null means auto-linked to categoryIcon
    barangay: BARANGAYS[0],
    lat: '17.6167',
    lng: '120.7333',
    address: 'Lagangilang, Abra, Philippines',
    description: '',
    image: '',
    usePseudoImage: true,
    pseudoTheme: 'indigo',
    connectedPanoId: '',
    connectedPanoType: 'mapillary',
    uploadedPanoUrl: '',
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
      // Normalize category so raw DB strings like 'cat_religious' match human dropdown options
      const currentCategory = normalizeCategoryName(editingSpot.category || defaultCat);
      const matched = categoryList.find((c) => c.name === currentCategory);
      const defaultIcon = matched?.icon || getDefaultCategoryIcon(currentCategory, currentType);

      const targetId = editingSpot.connected360?.targetId || '';
      const isLocal =
        editingSpot.connected360?.type === 'local' ||
        editingSpot.connected360?.imageUrl ||
        String(targetId).startsWith('pano_');

      setPanoSourceTab(isLocal ? 'upload' : 'mapillary');

      setFormData({
        name: editingSpot.name || '',
        category: currentCategory,
        categoryIcon:
          editingSpot.categoryIcon && editingSpot.categoryIcon !== '⭐'
            ? editingSpot.categoryIcon
            : defaultIcon,
        cardVisualIcon: editingSpot.cardVisualIcon || null,
        barangay: editingSpot.barangay || BARANGAYS[0],
        lat: String(editingSpot.location?.lat || editingSpot.lat || '17.6167'),
        lng: String(editingSpot.location?.lng || editingSpot.lng || '120.7333'),
        address: editingSpot.location?.address || 'Lagangilang, Abra',
        description: editingSpot.description || '',
        image: editingSpot.image || '',
        usePseudoImage: editingSpot.isPseudoImage ?? !editingSpot.image,
        pseudoTheme: editingSpot.pseudoTheme || (isPoi ? 'cyan' : 'indigo'),
        connectedPanoId: targetId,
        connectedPanoType: isLocal ? 'local' : 'mapillary',
        uploadedPanoUrl:
          editingSpot.connected360?.imageUrl ||
          (isLocal && targetId ? `${API_BASE}/panoramas/${targetId}.jpg` : '') ||
          '',
        heading: String(editingSpot.connected360?.heading ?? '0'),
        pitch: String(editingSpot.connected360?.pitch ?? '0'),
      });
    } else {
      setSpotType('tourist_spot');
      setPanoSourceTab('upload');
      const baseLat = initialCoords ? parseFloat(initialCoords.lat).toFixed(6) : '17.6082';
      const baseLng = initialCoords ? parseFloat(initialCoords.lng).toFixed(6) : '120.7380';

      setFormData({
        name: '',
        category: TOURIST_CATEGORIES[0].name,
        categoryIcon: TOURIST_CATEGORIES[0].icon,
        cardVisualIcon: null,
        barangay: BARANGAYS[0],
        lat: baseLat,
        lng: baseLng,
        address: 'Lagangilang, Abra, Philippines',
        description: '',
        image: '',
        usePseudoImage: true,
        pseudoTheme: 'indigo',
        connectedPanoId: '',
        connectedPanoType: 'mapillary',
        uploadedPanoUrl: '',
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

  // Dedicated 360 Panorama File Upload handler (Direct to Neon PostgreSQL Cloud DB)
  const handlePanoFileUpload = async (e) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setUploadingNeon(true);
    setDetectingMapillary(true);
    const defaultPanoId = (formData.connectedPanoId && String(formData.connectedPanoId).startsWith('pano_'))
      ? formData.connectedPanoId
      : `pano_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    try {
      // 1. Client-side compression & direct upload to Neon PostgreSQL Cloud DB
      const result = await touristSpotsService.uploadPanoToNeon({
        id: defaultPanoId,
        fileOrDataUrl: rawFile,
        lat: formData.lat,
        lng: formData.lng,
        heading: formData.heading || '0',
        label: formData.name || 'Tourist Spot 360',
        description: formData.description || '',
      });

      setFormData((prev) => ({
        ...prev,
        connectedPanoId: result.id,
        connectedPanoType: 'local',
        uploadedPanoUrl: result.imageData,
        image: result.thumbnailData, // compact 18KB thumbnail data URI stored in tourist_spots table!
        usePseudoImage: false,
      }));
      setNeonUploaded(true);

      // 2. Also send to local Express server if running in background
      try {
        const uploadData = new FormData();
        uploadData.append('panorama', rawFile);
        uploadData.append('lat', formData.lat);
        uploadData.append('lng', formData.lng);
        uploadData.append('heading', formData.heading || '0');
        uploadData.append('label', formData.name || 'Tourist Spot 360');
        uploadData.append('description', formData.description || '');
        fetch(`${API_BASE}/api/panoramas`, { method: 'POST', body: uploadData }).catch(() => {});
      } catch (_) {}
    } catch (err) {
      console.error('Neon direct upload error:', err);
      alert(`Could not upload to Neon Cloud: ${err.message}`);
    } finally {
      setUploadingNeon(false);
      setDetectingMapillary(false);
    }
  };

  // Handler when privacy blur is applied from PrivacyBlurStudio
  const handleSaveBlurredImage = async (blurredDataUrl, zoneCount) => {
    setUploadingNeon(true);
    setPrivacyBlurredCount(zoneCount);
    const defaultPanoId = (formData.connectedPanoId && String(formData.connectedPanoId).startsWith('pano_'))
      ? formData.connectedPanoId
      : `pano_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    try {
      // Direct upload & compression of the blurred image to Neon Cloud DB
      const result = await touristSpotsService.uploadPanoToNeon({
        id: defaultPanoId,
        fileOrDataUrl: blurredDataUrl,
        lat: formData.lat,
        lng: formData.lng,
        heading: formData.heading || '0',
        label: formData.name || 'Tourist Spot 360',
        description: formData.description || '',
      });

      setFormData((prev) => ({
        ...prev,
        connectedPanoId: result.id,
        connectedPanoType: 'local',
        uploadedPanoUrl: result.imageData,
        image: result.thumbnailData,
        usePseudoImage: false,
      }));
      setNeonUploaded(true);
    } catch (err) {
      console.warn('Neon blurred image upload warning:', err);
    } finally {
      setUploadingNeon(false);
    }
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
          connectedPanoType: 'mapillary',
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

  // Save to System
  const handleSaveToSystem = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter a location name.');
      return;
    }

    setSaving(true);
    const latNum = parseFloat(formData.lat);
    const lngNum = parseFloat(formData.lng);

    const isLocalPano = formData.connectedPanoType === 'local' || !!formData.uploadedPanoUrl || neonUploaded;
    const finalTargetId = isLocalPano
      ? ((formData.connectedPanoId && String(formData.connectedPanoId).startsWith('pano_'))
          ? formData.connectedPanoId
          : `pano_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`)
      : formData.connectedPanoId;

    // Image URL handling: preserve compact thumbnail (< 35KB data URI) so cards render everywhere without broken links
    const cleanImageUrl = (formData.image && formData.image.startsWith('data:') && formData.image.length <= 35000)
      ? formData.image
      : (formData.usePseudoImage ? null : (formData.image?.startsWith('data:') ? null : formData.image));

    const cleanPanoUrl = isLocalPano
      ? (String(formData.uploadedPanoUrl || '').startsWith('data:') ? `/panoramas/${finalTargetId}.jpg` : formData.uploadedPanoUrl || `/panoramas/${finalTargetId}.jpg`)
      : null;

    const spotPayload = {
      ...(editingSpot || {}),
      name: formData.name.trim(),
      spotType,
      category: formData.category,
      categoryIcon: formData.categoryIcon,
      cardVisualIcon: formData.cardVisualIcon || null,
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
      image: cleanImageUrl || null,
      isPseudoImage: formData.usePseudoImage && !cleanImageUrl,
      pseudoTheme: formData.pseudoTheme,
      connected360: {
        type: isLocalPano ? 'local' : 'mapillary',
        targetId: finalTargetId,
        imageUrl: cleanPanoUrl || null,
        heading: parseFloat(formData.heading) || 0,
        pitch: parseFloat(formData.pitch) || 0,
      },
    };

    try {
      const saved = touristSpotsService.saveDraftLocally(spotPayload, []);
      setSaving(false);
      onSpotSaved?.(saved);
      onClose();
    } catch (saveErr) {
      setSaving(false);
      console.error('Failed to save spot:', saveErr);
      alert(`Could not save location: ${saveErr.message}`);
    }
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
      <div className="modal-card glass-panel" style={{ maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto' }}>
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

        {/* Spot Type Switcher Tabs */}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', marginBottom: '8px' }}>
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
                title="Marker emoji icon (pick below or type custom)"
              />
            </div>
          </div>

          {/* Quick Select Icon Palette Grid */}
          <div
            style={{
              marginBottom: '12px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                ⚡ Quick Select Icon (or type above):
              </span>
              <span style={{ fontSize: '0.72rem', color: '#ffd700' }}>
                Active: <strong style={{ fontSize: '0.95rem' }}>{formData.categoryIcon || '⭐'}</strong>
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, categoryIcon: icon }))}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    border: formData.categoryIcon === icon ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.12)',
                    background: formData.categoryIcon === icon ? 'rgba(255, 215, 0, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    fontSize: '1.15rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: formData.categoryIcon === icon ? '0 0 8px rgba(255, 215, 0, 0.4)' : 'none',
                    transform: formData.categoryIcon === icon ? 'scale(1.08)' : 'scale(1)',
                  }}
                  title={`Select ${icon}`}
                >
                  {icon}
                </button>
              ))}
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

          {/* ========== Coherent Placement & Coordinates Box ========== */}
          <div
            className="placement-box"
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
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
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '3px 10px',
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
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
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
                    color: '#38bdf8',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
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
                    color: '#38bdf8',
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
                background: 'rgba(0, 0, 0, 0.3)',
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

          {/* ========== Card Visual Representation (14 Themes + Auto-Linked Icon) ========== */}
          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              marginBottom: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1rem' }}>🖼️</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
                  Card Visual Representation
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer', color: '#93c5fd' }}>
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
                {/* 14 Themes Gradient Palette */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Theme Palette ({Object.keys(THEMES).length} Gradients):
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#ffd700', fontWeight: 600 }}>
                      {THEMES[formData.pseudoTheme]?.name || 'Theme'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.values(THEMES).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, pseudoTheme: t.id }))}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          border: formData.pseudoTheme === t.id ? '2.5px solid #ffd700' : '1px solid rgba(255,255,255,0.25)',
                          background: `linear-gradient(135deg, ${t.from}, ${t.to})`,
                          cursor: 'pointer',
                          boxShadow: formData.pseudoTheme === t.id ? '0 0 10px rgba(255, 215, 0, 0.7)' : 'none',
                          transform: formData.pseudoTheme === t.id ? 'scale(1.15)' : 'scale(1)',
                          transition: 'all 0.15s ease',
                        }}
                        title={t.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Card Icon Link Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', padding: '5px 10px', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>
                    Visual Card Icon:
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.15rem' }}>
                      {formData.cardVisualIcon || formData.categoryIcon || '⭐'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: !formData.cardVisualIcon ? '#34d399' : '#ffd700' }}>
                      {!formData.cardVisualIcon ? '🔗 Synced with Location Marker' : 'Custom Card Icon'}
                    </span>
                    {formData.cardVisualIcon && (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, cardVisualIcon: null }))}
                        className="btn btn-ghost"
                        style={{ fontSize: '0.68rem', padding: '1px 6px', color: '#93c5fd' }}
                        title="Reset to automatically follow location marker icon"
                      >
                        Reset to Sync
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Preview */}
                <PseudoImage
                  title={formData.name || (spotType === 'tourist_spot' ? 'Sample Attraction' : 'Sample Facility')}
                  category={formData.category}
                  categoryIcon={formData.cardVisualIcon || formData.categoryIcon}
                  theme={formData.pseudoTheme}
                  height="100px"
                  showWatermark={true}
                />
              </div>
            ) : (
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Image URL or Path</label>
                <input
                  type="text"
                  name="image"
                  placeholder="https://... or photo URL"
                  value={formData.image}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </div>
            )}
          </div>

          {/* ========== Connected 360° Street View & Dedicated Panorama Image Section ========== */}
          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1.1rem' }}>🌐</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-glow)' }}>
                  Connected 360° Street View & Panorama Node
                </span>
              </div>
            </div>

            {/* Source Switcher: Upload 360 Photo vs Mapillary Sequence */}
            <div
              style={{
                display: 'flex',
                gap: '6px',
                background: 'rgba(0,0,0,0.3)',
                padding: '3px',
                borderRadius: 'var(--radius-md)',
                marginBottom: '12px',
              }}
            >
              <button
                type="button"
                onClick={() => setPanoSourceTab('upload')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: panoSourceTab === 'upload' ? 'rgba(67, 97, 238, 0.45)' : 'transparent',
                  color: panoSourceTab === 'upload' ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                <span>📷</span>
                <span>Dedicated 360° Photo Upload</span>
                {formData.uploadedPanoUrl && <span style={{ color: '#34d399', fontSize: '0.75rem' }}>✓</span>}
              </button>
              <button
                type="button"
                onClick={() => setPanoSourceTab('mapillary')}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: panoSourceTab === 'mapillary' ? 'rgba(67, 97, 238, 0.45)' : 'transparent',
                  color: panoSourceTab === 'mapillary' ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                <span>🌐</span>
                <span>Mapillary Sequence Link</span>
                {formData.connectedPanoId && panoSourceTab !== 'upload' && <span style={{ color: '#34d399', fontSize: '0.75rem' }}>✓</span>}
              </button>
            </div>

            {panoSourceTab === 'upload' ? (
              <div>
                {/* Upload Dropzone */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handlePanoFileUpload}
                  style={{ display: 'none' }}
                />

                {formData.uploadedPanoUrl ? (
                  <div
                    style={{
                      position: 'relative',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      border: '1px solid rgba(52, 211, 153, 0.5)',
                      background: 'rgba(0,0,0,0.4)',
                      padding: '8px',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <img
                        src={formData.uploadedPanoUrl}
                        alt="360 Panorama Preview"
                        style={{
                          width: '110px',
                          height: '60px',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          border: '1px solid rgba(255,255,255,0.2)',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34d399' }}>
                            ✓ Dedicated 360° Photo Attached
                          </span>
                          {(neonUploaded || String(formData.connectedPanoId || '').startsWith('pano_')) && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(59, 130, 246, 0.25)',
                                color: '#60a5fa',
                                border: '1px solid rgba(96, 165, 250, 0.4)',
                              }}
                            >
                              ☁ Neon Cloud Synced
                            </span>
                          )}
                          {privacyBlurredCount > 0 && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(52, 211, 153, 0.2)',
                                color: '#34d399',
                                border: '1px solid rgba(52, 211, 153, 0.4)',
                              }}
                            >
                              🛡️ Privacy Anonymized ({privacyBlurredCount} zones)
                            </span>
                          )}
                        </div>
                        {uploadingNeon && (
                          <div style={{ margin: '4px 0', fontSize: '0.72rem', color: '#ffd700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>⚡ Optimizing 360 texture & uploading directly to Neon Cloud DB...</span>
                          </div>
                        )}
                        <p style={{ fontSize: '0.68rem', color: '#94a3b8', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ID: {formData.connectedPanoId || 'local_panorama'}
                        </p>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setShowBlurStudio(true)}
                            className="btn btn-secondary"
                            style={{
                              fontSize: '0.72rem',
                              padding: '3px 8px',
                              background: 'rgba(16, 185, 129, 0.2)',
                              color: '#34d399',
                              borderColor: 'rgba(52, 211, 153, 0.4)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Open Privacy Blur Studio to outline & blur faces, license plates, and camera rigs"
                          >
                            <span>🛡️</span>
                            <span>Privacy Blur (Faces & Plates)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn-ghost"
                            style={{ fontSize: '0.68rem', padding: '2px 6px', color: '#93c5fd' }}
                          >
                            🔄 Replace Photo
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                uploadedPanoUrl: '',
                                connectedPanoId: '',
                                connectedPanoType: 'mapillary',
                              }))
                            }
                            className="btn btn-ghost"
                            style={{ fontSize: '0.68rem', padding: '2px 6px', color: '#ef4444' }}
                          >
                            ✕ Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      cursor: 'pointer',
                      padding: '16px',
                      borderRadius: 'var(--radius-sm)',
                      border: '2px dashed rgba(67, 97, 238, 0.45)',
                      background: 'rgba(67, 97, 238, 0.08)',
                      textAlign: 'center',
                      marginBottom: '10px',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#ffd700';
                      e.currentTarget.style.background = 'rgba(255, 215, 0, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(67, 97, 238, 0.45)';
                      e.currentTarget.style.background = 'rgba(67, 97, 238, 0.08)';
                    }}
                  >
                    <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '4px' }}>📁</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc', display: 'block' }}>
                      Click to Browse or Drag & Drop 360° Panorama Image
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      Supports 360° equirectangular JPG / PNG photos taken at this location
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Mapillary Street View Linkage */
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr auto', gap: '8px', alignItems: 'end', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Mapillary Image ID</label>
                  <input
                    type="text"
                    name="connectedPanoId"
                    placeholder="e.g. 1532761357806896"
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
              </div>
            )}

            {/* Orientation Row: Heading & Pitch */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Camera Initial Heading (°)</label>
                <input
                  type="number"
                  name="heading"
                  min="0"
                  max="360"
                  value={formData.heading}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="0-360°"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Camera Initial Pitch (°)</label>
                <input
                  type="number"
                  name="pitch"
                  min="-90"
                  max="90"
                  value={formData.pitch}
                  onChange={handleChange}
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="-90 to +90°"
                />
              </div>
            </div>
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
                background:
                  spotType === 'tourist_spot'
                    ? 'linear-gradient(135deg, #ffd700 0%, #f59e0b 100%)'
                    : 'linear-gradient(135deg, #06d6a0 0%, #0284c7 100%)',
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

      {/* Privacy Blur Studio Modal */}
      {showBlurStudio && formData.uploadedPanoUrl && (
        <PrivacyBlurStudio
          isOpen={showBlurStudio}
          onClose={() => setShowBlurStudio(false)}
          imageUrl={formData.uploadedPanoUrl}
          imageName={formData.name || '360 Panorama'}
          onSaveBlurredImage={handleSaveBlurredImage}
        />
      )}
    </div>
  );
}
