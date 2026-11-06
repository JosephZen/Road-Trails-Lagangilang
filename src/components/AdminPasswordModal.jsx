import React, { useState, useEffect, useRef } from 'react';
import globalSyncService, { GLOBAL_STATE_KEYS } from '../services/globalSyncService';

const STORAGE_ADMIN_PASSWORD_KEY = 'lagangilang_admin_password';
export const DEFAULT_ADMIN_PASSWORD = 'touristspot2004';

let cachedGlobalPassword = null;

/**
 * Fetch the authoritative global admin password from Neon PostgreSQL database.
 */
export const fetchGlobalAdminPassword = async () => {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return getLocalAdminPassword();
  }

  // 1. Try globalSyncService (which reads /api/global-state or direct Neon query)
  try {
    const state = await globalSyncService.fetchGlobalState();
    const creds = state?.[GLOBAL_STATE_KEYS.ADMIN_PASSWORD];
    if (creds && typeof creds.password === 'string' && creds.password.trim()) {
      cachedGlobalPassword = creds.password.trim();
      try {
        localStorage.setItem(STORAGE_ADMIN_PASSWORD_KEY, cachedGlobalPassword);
      } catch (_) {}
      return cachedGlobalPassword;
    }
  } catch (e) {
    console.warn('[AdminAuth] Global password fetch error:', e);
  }

  // 2. Direct Neon SQL query fallback
  try {
    const sql = await globalSyncService.getNeonSql();
    const rows = await sql`
      SELECT payload FROM lagangilang_global_state WHERE state_key = ${GLOBAL_STATE_KEYS.ADMIN_PASSWORD}
    `;
    if (rows && rows.length > 0 && rows[0].payload?.password) {
      cachedGlobalPassword = String(rows[0].payload.password).trim();
      try {
        localStorage.setItem(STORAGE_ADMIN_PASSWORD_KEY, cachedGlobalPassword);
      } catch (_) {}
      return cachedGlobalPassword;
    }
  } catch (_) {}

  return getLocalAdminPassword();
};

/**
 * Synchronous local read with fallback to default system password.
 */
export const getLocalAdminPassword = () => {
  if (cachedGlobalPassword && cachedGlobalPassword.trim()) {
    return cachedGlobalPassword.trim();
  }
  if (typeof localStorage !== 'undefined') {
    const custom = localStorage.getItem(STORAGE_ADMIN_PASSWORD_KEY);
    if (custom && custom.trim()) {
      return custom.trim();
    }
  }
  return DEFAULT_ADMIN_PASSWORD;
};

/**
 * Validate entered password against local cache or default system password.
 */
export const checkAdminPassword = (entered) => {
  if (!entered) return false;
  const trimmed = String(entered).trim();
  const current = getLocalAdminPassword();
  return trimmed === current;
};

/**
 * Set and persist new admin password globally across all devices via Neon PostgreSQL.
 */
export const setAdminPassword = async (newPassword) => {
  if (!newPassword || !newPassword.trim()) return false;
  const clean = newPassword.trim();
  cachedGlobalPassword = clean;

  // 1. Save locally for instant offline authorization
  try {
    localStorage.setItem(STORAGE_ADMIN_PASSWORD_KEY, clean);
  } catch (_) {}

  // 2. Persist globally to Neon PostgreSQL (table: lagangilang_global_state)
  const payload = {
    password: clean,
    updated_at: new Date().toISOString(),
  };

  let saved = false;
  try {
    saved = await globalSyncService.saveKey(GLOBAL_STATE_KEYS.ADMIN_PASSWORD, payload);
  } catch (_) {}

  // 3. Direct Neon SQL execution fallback
  if (!saved) {
    try {
      const sql = await globalSyncService.getNeonSql();
      await sql`
        INSERT INTO lagangilang_global_state (state_key, payload, updated_at)
        VALUES (${GLOBAL_STATE_KEYS.ADMIN_PASSWORD}, ${JSON.stringify(payload)}::jsonb, NOW())
        ON CONFLICT (state_key)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `;
      saved = true;
    } catch (err) {
      console.warn('[AdminAuth] Direct Neon insert error:', err);
    }
  }

  return saved;
};

/**
 * Admin Authentication & Password Management Modal
 * Guards switching from Tourist Explorer mode to Admin Panel mode.
 */
export default function AdminPasswordModal({
  isOpen,
  onClose,
  onSuccess,
  isChangePassword = false,
  showToast,
}) {
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Reset fields when opening/closing and pre-fetch latest global password
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setShowPassword(false);
      setIsSubmitting(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);

      // Pre-fetch latest global password from Neon DB in background
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetchGlobalAdminPassword().catch(() => {});
      }
    }
  }, [isOpen, isChangePassword]);

  if (!isOpen) return null;

  // Handle unlocking Admin Mode
  const handleUnlockSubmit = async (e) => {
    e?.preventDefault();
    setError('');

    if (!password) {
      setError('Please enter the admin password.');
      return;
    }

    setIsSubmitting(true);

    let isValid = false;

    // 1. If online, verify against fresh cloud password first (so changes on Desktop/other devices reflect immediately)
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const fresh = await fetchGlobalAdminPassword();
        if (fresh && String(password).trim() === fresh.trim()) {
          isValid = true;
        }
      } catch (_) {}
    }

    // 2. Fallback to local cache / default password if offline or network hiccup
    if (!isValid) {
      isValid = checkAdminPassword(password);
    }

    setIsSubmitting(false);

    if (isValid) {
      onSuccess?.();
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
      inputRef.current?.focus();
    }
  };

  // Handle changing Admin Password
  const handleChangeSubmit = async (e) => {
    e?.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('Please enter your current admin password.');
      return;
    }

    setIsSubmitting(true);

    // Verify current password with fresh cloud first, then local fallback
    let isCurrentValid = false;
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const fresh = await fetchGlobalAdminPassword();
        if (fresh && String(currentPassword).trim() === fresh.trim()) {
          isCurrentValid = true;
        }
      } catch (_) {}
    }

    if (!isCurrentValid) {
      isCurrentValid = checkAdminPassword(currentPassword);
    }

    if (!isCurrentValid) {
      setIsSubmitting(false);
      setError('Current password is incorrect.');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      setIsSubmitting(false);
      setError('New password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setIsSubmitting(false);
      setError('New passwords do not match.');
      return;
    }

    try {
      await setAdminPassword(newPassword);
      showToast?.('🔑 Global admin password updated across all devices (Desktop, Mobile & Tablet)!');
      onClose?.();
    } catch (err) {
      setError('Failed to sync password globally. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 10000,
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '430px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1.5px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(2, 132, 199, 0.25)',
          animation: 'fadeInScale 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>{isChangePassword ? '🔑' : '🛡️'}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: 700 }}>
                {isChangePassword ? 'Change Admin Password' : 'Admin Authorization'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                {isChangePassword
                  ? 'Update the security password globally across all devices'
                  : 'Enter password to unlock POI & map editing tools'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.15s ease',
            }}
            title="Cancel"
          >
            ✕
          </button>
        </div>

        {/* Global sync notice in Change Password mode */}
        {isChangePassword && (
          <div
            style={{
              background: 'rgba(14, 165, 233, 0.12)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
              marginBottom: '14px',
              fontSize: '0.74rem',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🌐</span>
            <span>Changes persist to Neon PostgreSQL and update Desktop, Mobile & Tablet simultaneously.</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Unlock Form */}
        {!isChangePassword ? (
          <form onSubmit={handleUnlockSubmit}>
            <div style={{ marginBottom: '18px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  marginBottom: '6px',
                }}
              >
                Admin Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password..."
                  disabled={isSubmitting}
                  className="input-field"
                  style={{
                    width: '100%',
                    padding: '10px 42px 10px 12px',
                    fontSize: '0.9rem',
                    background: 'rgba(30, 41, 59, 0.8)',
                    borderColor: error ? '#ef4444' : 'rgba(56, 189, 248, 0.3)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    padding: '4px',
                  }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSubmitting}
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{
                  padding: '8px 18px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? '⏳ Verifying...' : '🔓 Unlock Admin'}
              </button>
            </div>
          </form>
        ) : (
          /* Change Password Form */
          <form onSubmit={handleChangeSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                Current Password
              </label>
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password..."
                disabled={isSubmitting}
                className="input-field"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                New Admin Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter at least 4 characters..."
                disabled={isSubmitting}
                className="input-field"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                Confirm New Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password..."
                disabled={isSubmitting}
                className="input-field"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>{showPassword ? '🙈 Hide' : '👁️ Show'} passwords</span>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={isSubmitting}
                  style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  style={{
                    padding: '7px 16px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? '⏳ Saving...' : 'Save Password Globally'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
