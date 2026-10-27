import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const THEMES = [
  { id: 'light', label: 'Light', icon: '☀️' },
  { id: 'dark', label: 'Dark', icon: '🌙' },
  { id: 'beige', label: 'Beige', icon: '📜' },
  { id: 'satellite', label: 'Satellite', icon: '🛰️' },
];

export default function ThemeSelector({ theme = 'light', onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 150;

    let top = rect.bottom + 6;
    let left = rect.left;

    // Boundary check so it doesn't overflow right edge of viewport
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    if (left < 8) left = 8;

    setMenuStyle({
      position: 'fixed',
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${menuWidth}px`,
      zIndex: 100000,
    });
  }, []);

  // Update menu coordinates whenever opened or on window resize/scroll
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const currentTheme = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div className="custom-theme-selector-container" style={{ display: 'inline-block', flexShrink: 0 }}>
      {/* Selector Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        className="custom-theme-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: 'var(--radius-full, 9999px)',
          padding: '6px 12px',
          color: '#ffffff',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          whiteSpace: 'nowrap',
          transition: 'all 0.18s ease',
        }}
      >
        <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{currentTheme.icon}</span>
        <span style={{ fontSize: '0.8rem', letterSpacing: '-0.01em' }}>{currentTheme.label}</span>
        <span
          style={{
            fontSize: '0.65rem',
            opacity: 0.7,
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            marginLeft: '2px',
          }}
        >
          ▼
        </span>
      </button>

      {/* Floating Glass Dropdown Menu rendered via Portal to body to prevent container clipping */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="custom-theme-menu"
            style={{
              ...menuStyle,
              background: 'rgba(15, 23, 42, 0.97)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '12px',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              animation: 'fadeInDown 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {THEMES.map((t) => {
              const isSelected = t.id === theme;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(t.id);
                    setIsOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: isSelected
                      ? '1px solid rgba(59, 130, 246, 0.5)'
                      : '1px solid transparent',
                    background: isSelected
                      ? 'rgba(59, 130, 246, 0.25)'
                      : 'transparent',
                    color: isSelected ? '#60a5fa' : '#f1f5f9',
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#f1f5f9';
                    }
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1rem', lineHeight: 1 }}>{t.icon}</span>
                    <span>{t.label}</span>
                  </span>
                  {isSelected && (
                    <span style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 800 }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
