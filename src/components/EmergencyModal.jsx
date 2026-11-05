import React, { useState, useEffect } from 'react';
import hotlinesService from '../services/hotlinesService';
import { TRAIL_SAFETY_GUIDELINES } from '../services/offlineCacheService';

/**
 * Emergency Contacts, DENR Checkpoints & Trail Safety Modal
 * Supports full Admin CRUD for hotlines, environmental checkpoints, and municipal rescue units.
 */
export default function EmergencyModal({
  isOpen,
  onClose,
  onLocateSpot,
  onRouteToSpot,
  isAdmin = false,
  showToast,
  touristSpots = [],
}) {
  const [activeTab, setActiveTab] = useState('hotlines'); // 'hotlines' | 'safety'
  const [hotlinesList, setHotlinesList] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    category: 'DENR Checkpoint',
    categoryIcon: '🌲',
    phone: '',
    altPhone: '',
    description: '',
    operatingHours: '',
    lat: '',
    lng: '',
    notes: '',
  });

  useEffect(() => {
    if (isOpen) {
      const all = hotlinesService.getAll();
      const reconciled = all.map((h) => {
        const spot = touristSpots.find((s) => s.id === h.id);
        if (spot) {
          const lat = spot.location?.lat ?? spot.lat;
          const lng = spot.location?.lng ?? spot.lng;
          return {
            ...h,
            lat,
            lng,
            location: { ...(h.location || {}), ...(spot.location || {}), lat, lng },
          };
        }
        return h;
      });
      setHotlinesList(reconciled);
    }
  }, [isOpen, touristSpots]);

  useEffect(() => {
    const unsub = hotlinesService.subscribe((updated) => {
      setHotlinesList(updated);
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleOpenAdd = () => {
    setEditingEntry(null);
    setFormData({
      name: '',
      category: 'DENR Checkpoint',
      categoryIcon: '🌲',
      phone: '',
      altPhone: '',
      description: '',
      operatingHours: '24/7 Monitoring Station',
      lat: '17.6185',
      lng: '120.7315',
      notes: '',
    });
    setIsEditing(true);
  };

  const handleOpenEdit = (entry) => {
    setEditingEntry(entry);
    setFormData({
      name: entry.name || '',
      category: entry.category || 'DENR Checkpoint',
      categoryIcon: entry.categoryIcon || (entry.category?.includes('Checkpoint') ? '🌲' : '🚨'),
      phone: entry.phone || '',
      altPhone: entry.altPhone || '',
      description: entry.description || '',
      operatingHours: entry.operatingHours || '',
      lat: entry.location?.lat ? String(entry.location.lat) : '',
      lng: entry.location?.lng ? String(entry.location.lng) : '',
      notes: entry.notes || '',
    });
    setIsEditing(true);
  };

  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      hotlinesService.deleteEntry(id);
      showToast?.(`🗑️ Deleted "${name}"`);
    }
  };

  const handleSaveForm = (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      alert('Please fill in Name and Phone Number.');
      return;
    }

    const latNum = parseFloat(formData.lat);
    const lngNum = parseFloat(formData.lng);

    const hasCoords = !isNaN(latNum) && !isNaN(lngNum) && latNum > 0 && lngNum > 0;

    const payload = {
      id: editingEntry?.id,
      name: formData.name.trim(),
      category: formData.category,
      categoryIcon: formData.categoryIcon || (formData.category.includes('Checkpoint') ? '🌲' : '🚨'),
      phone: formData.phone.trim(),
      altPhone: formData.altPhone.trim(),
      description: formData.description.trim(),
      operatingHours: formData.operatingHours.trim(),
      notes: formData.notes.trim(),
      location: hasCoords
        ? {
            lat: latNum,
            lng: lngNum,
            address: `${formData.name}, Lagangilang, Abra`,
          }
        : null,
    };

    hotlinesService.saveEntry(payload);
    setIsEditing(false);
    showToast?.(`✅ Saved "${payload.name}" successfully!`);
  };

  return (
    <div
      className="modal-overlay modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="glass-panel modal-content-emergency"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '600px',
          width: '94%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-xl, 16px)',
          border: '1.5px solid rgba(239, 68, 68, 0.45)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75), 0 0 25px rgba(239, 68, 68, 0.25)',
          background: 'rgba(15, 23, 42, 0.96)',
          backdropFilter: 'blur(20px)',
          overflow: 'hidden',
          animation: 'fadeInUp 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 23, 42, 0) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>🚨</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f87171', letterSpacing: '-0.02em' }}>
                Emergency Hotlines & DENR Checkpoints
              </h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                Municipality of Lagangilang, Abra • Official LGU & Environmental Protection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ width: '32px', height: '32px', padding: 0, borderRadius: '50%', fontSize: '1rem', color: '#94a3b8' }}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher & Admin Add Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px 4px 20px',
            gap: '8px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
            <button
              onClick={() => { setActiveTab('hotlines'); setIsEditing(false); }}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-md, 8px)',
                border: activeTab === 'hotlines' ? '1px solid #ef4444' : '1px solid transparent',
                background: activeTab === 'hotlines' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                color: activeTab === 'hotlines' ? '#fca5a5' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <span>📞</span>
              <span>Hotlines & Checkpoints</span>
            </button>

            <button
              onClick={() => { setActiveTab('safety'); setIsEditing(false); }}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-md, 8px)',
                border: activeTab === 'safety' ? '1px solid #38bdf8' : '1px solid transparent',
                background: activeTab === 'safety' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                color: activeTab === 'safety' ? '#bae6fd' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <span>🛡️</span>
              <span>Trail Safety Rules</span>
            </button>
          </div>

          {/* Admin "+ Add Hotline / Checkpoint" Button */}
          {isAdmin && activeTab === 'hotlines' && !isEditing && (
            <button
              className="btn btn-primary"
              onClick={handleOpenAdd}
              style={{
                fontSize: '0.76rem',
                padding: '6px 12px',
                borderRadius: '9999px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
              title="Add a new Emergency Hotline or DENR Checkpoint"
            >
              + Add Entry
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {isEditing ? (
            /* Admin Add/Edit Form */
            <form onSubmit={handleSaveForm} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#10b981', fontWeight: 700 }}>
                  {editingEntry ? '✏️ Edit Hotline / Checkpoint' : '🌲 Add New Hotline / Checkpoint'}
                </h4>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsEditing(false)}
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                >
                  Cancel
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Name / Facility Title *
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. DENR Environmental Checkpoint - Lagangilang"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>
                    Category
                  </label>
                  <select
                    className="input-field"
                    value={formData.category}
                    onChange={(e) => {
                      const cat = e.target.value;
                      let icon = '🚨';
                      if (cat.includes('DENR') || cat.includes('Checkpoint')) icon = '🌲';
                      else if (cat.includes('Police')) icon = '👮';
                      else if (cat.includes('Fire')) icon = '🚒';
                      else if (cat.includes('MDRRMO')) icon = '🚑';
                      else if (cat.includes('Health')) icon = '🏥';
                      else if (cat.includes('Tourism')) icon = '🌴';
                      setFormData({ ...formData, category: cat, categoryIcon: icon });
                    }}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="DENR Checkpoint">🌲 DENR Checkpoint</option>
                    <option value="MDRRMO">🚑 MDRRMO Rescue</option>
                    <option value="Police">👮 Police Station</option>
                    <option value="Fire">🚒 Fire Station</option>
                    <option value="Health / RHU">🏥 Health / RHU</option>
                    <option value="Tourism">🌴 Tourism Office</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>
                    Primary Phone (for 1-tap dial) *
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 0917-889-3321"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>
                    Alternative Phone
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. (074) 752-8234"
                    value={formData.altPhone}
                    onChange={(e) => setFormData({ ...formData, altPhone: e.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>
                    Operating Hours
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 24/7 Official Station"
                    value={formData.operatingHours}
                    onChange={(e) => setFormData({ ...formData, operatingHours: e.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Coordinates for Map Pin Sync */}
              <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', display: 'block', marginBottom: '6px' }}>
                  📍 2D Map Pin Coordinates (Optional - Automatically renders pin on map)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '2px' }}>
                      Latitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="input-field"
                      placeholder="e.g. 17.6185"
                      value={formData.lat}
                      onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '2px' }}>
                      Longitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="input-field"
                      placeholder="e.g. 120.7315"
                      value={formData.lng}
                      onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Description & Safety Advisory
                </label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Timber & Wildlife Inspection, Mountain Trail Entry Registration..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditing(false)}
                  style={{ padding: '7px 16px', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    padding: '7px 20px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  }}
                >
                  💾 Save Entry & Sync Map
                </button>
              </div>
            </form>
          ) : activeTab === 'hotlines' ? (
            /* Hotlines Directory List */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: '10px 14px',
                  fontSize: '0.78rem',
                  color: '#fecaca',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>💡</span>
                <span>Tap any phone button for 1-tap direct emergency dialing, or click "Locate Pin" to highlight on map.</span>
              </div>

              {hotlinesList.map((h) => {
                const isDenrCheckpoint = h.isCheckpoint || h.category?.toLowerCase().includes('checkpoint');
                return (
                  <div
                    key={h.id}
                    style={{
                      background: isDenrCheckpoint ? 'rgba(21, 128, 61, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: isDenrCheckpoint ? '1.5px solid rgba(34, 197, 94, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 'var(--radius-lg, 12px)',
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      boxShadow: isDenrCheckpoint ? '0 4px 16px rgba(21, 128, 61, 0.2)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.25rem' }}>{h.categoryIcon || '🚨'}</span>
                        <strong style={{ fontSize: '0.9rem', color: isDenrCheckpoint ? '#86efac' : '#ffffff' }}>
                          {h.name}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: isDenrCheckpoint ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.2)',
                            color: isDenrCheckpoint ? '#4ade80' : '#f87171',
                            border: `1px solid ${isDenrCheckpoint ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`,
                          }}
                        >
                          {h.category}
                        </span>

                        {/* Admin Action Buttons */}
                        {isAdmin && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => handleOpenEdit(h)}
                              style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#e2e8f0',
                                fontSize: '0.7rem',
                                padding: '2px 6px',
                                cursor: 'pointer',
                              }}
                              title="Edit this hotline/checkpoint"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDelete(h.id, h.name)}
                              style={{
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#f87171',
                                fontSize: '0.7rem',
                                padding: '2px 6px',
                                cursor: 'pointer',
                              }}
                              title="Delete entry"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8', lineHeight: 1.35 }}>
                      {h.description}
                    </p>

                    {h.operatingHours && (
                      <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>
                        ⏱️ <span style={{ color: '#6ee7b7' }}>{h.operatingHours}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <a
                        href={`tel:${h.phone.replace(/[^0-9+]/g, '')}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          borderRadius: 'var(--radius-full, 9999px)',
                          background: isDenrCheckpoint
                            ? 'linear-gradient(135deg, #15803d 0%, #166534 100%)'
                            : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                          color: '#ffffff',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                        }}
                      >
                        <span>📞 Call:</span>
                        <span>{h.phone}</span>
                      </a>

                      {h.altPhone && (
                        <a
                          href={`tel:${h.altPhone.replace(/[^0-9+]/g, '')}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: 'var(--radius-full, 9999px)',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            color: '#cbd5e1',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          <span>Alt:</span>
                          <span>{h.altPhone}</span>
                        </a>
                      )}

                      {h.location?.lat && onLocateSpot && (
                        <button
                          onClick={() => {
                            onLocateSpot(h.id);
                            onClose();
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: 'var(--radius-full, 9999px)',
                            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                            border: 'none',
                            color: '#ffffff',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
                          }}
                          title="Locate station pin on map"
                        >
                          <span>📍 Locate Pin</span>
                        </button>
                      )}

                      {h.location?.lat && onRouteToSpot && (
                        <button
                          onClick={() => {
                            const spot = touristSpots.find((s) => s.id === h.id);
                            const finalCoords = spot
                              ? [spot.location?.lng ?? spot.lng, spot.location?.lat ?? spot.lat]
                              : [h.location.lng, h.location.lat];
                            onRouteToSpot(finalCoords);
                            onClose();
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: 'var(--radius-full, 9999px)',
                            background: 'rgba(59, 130, 246, 0.25)',
                            border: '1px solid rgba(59, 130, 246, 0.5)',
                            color: '#93c5fd',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Calculate route to this location"
                        >
                          <span>🧭 Route Here</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Trail Safety Rules */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: '10px 14px',
                  fontSize: '0.78rem',
                  color: '#bae6fd',
                }}
              >
                🌲 Follow these LGU safety guidelines to ensure a safe and eco-friendly journey across Lagangilang.
              </div>

              {TRAIL_SAFETY_GUIDELINES.map((g, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 'var(--radius-lg, 12px)',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <span style={{ fontSize: '1.4rem', marginTop: '2px' }}>{g.icon}</span>
                  <div>
                    <h4 style={{ margin: '0 0 3px 0', fontSize: '0.88rem', fontWeight: 700, color: '#f1f5f9' }}>
                      {g.title}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8', lineHeight: 1.4 }}>
                      {g.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'rgba(0, 0, 0, 0.3)',
          }}
        >
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '6px 18px', fontSize: '0.8rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
