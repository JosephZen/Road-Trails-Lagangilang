import React, { useState } from 'react';
import { EMERGENCY_HOTLINES, TRAIL_SAFETY_GUIDELINES } from '../services/offlineCacheService';

/**
 * Emergency Contacts & Trail Safety Modal
 * Directly addresses Municipal Office feedback:
 * "Embed LGU/barangay emergency hotlines and trail safety guidelines"
 */
export default function EmergencyModal({ isOpen, onClose, onLocateSpot }) {
  const [activeTab, setActiveTab] = useState('hotlines'); // 'hotlines' | 'safety'

  if (!isOpen) return null;

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
          maxWidth: '560px',
          width: '92%',
          maxHeight: '88vh',
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
                Emergency & Trail Safety
              </h3>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                Municipality of Lagangilang, Abra • Official LGU Assistance
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

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            padding: '10px 20px 4px 20px',
            gap: '8px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <button
            onClick={() => setActiveTab('hotlines')}
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
              transition: 'all 0.18s ease',
            }}
          >
            <span>📞</span>
            <span>Emergency Hotlines</span>
          </button>

          <button
            onClick={() => setActiveTab('safety')}
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
              transition: 'all 0.18s ease',
            }}
          >
            <span>🛡️</span>
            <span>Trail Safety Rules</span>
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {activeTab === 'hotlines' ? (
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
                <span>Tap any phone number to place a direct phone call in an emergency.</span>
              </div>

              {EMERGENCY_HOTLINES.map((h, i) => (
                <div
                  key={i}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 'var(--radius-lg, 12px)',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{h.icon}</span>
                      <strong style={{ fontSize: '0.9rem', color: '#ffffff' }}>{h.name}</strong>
                    </div>
                    <span
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      {h.category}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
                    {h.description}
                  </p>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <a
                      href={`tel:${h.number.replace(/[^0-9+]/g, '')}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-full, 9999px)',
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        color: '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                        boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                      }}
                    >
                      <span>📞 Call:</span>
                      <span>{h.number}</span>
                    </a>

                    {h.altNumber && (
                      <a
                        href={`tel:${h.altNumber.replace(/[^0-9+]/g, '')}`}
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
                        <span>{h.altNumber}</span>
                      </a>
                    )}

                    {h.spotId && onLocateSpot && (
                      <button
                        onClick={() => onLocateSpot(h.spotId)}
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
                        title="Locate this station on the interactive map"
                      >
                        <span>📍</span>
                        <span>Locate Station on Map</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
