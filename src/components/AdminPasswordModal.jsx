import React, { useState, useEffect, useRef } from 'react';

const STORAGE_ADMIN_PASSWORD_KEY = 'lagangilang_admin_password';
const DEFAULT_PASSWORDS = ['admin123', 'lagangilang2026', 'admin'];

/**
 * Validate entered password against custom stored password or default fallback passwords.
 */
export const checkAdminPassword = (entered) => {
  if (!entered) return false;
  const trimmed = String(entered).trim();
  const custom = localStorage.getItem(STORAGE_ADMIN_PASSWORD_KEY);
  if (custom && custom.trim()) {
    return trimmed === custom.trim();
  }
  return DEFAULT_PASSWORDS.includes(trimmed);
};

/**
 * Update the admin password in localStorage.
 */
export const setAdminPassword = (newPassword) => {
  if (!newPassword || !newPassword.trim()) return false;
  localStorage.setItem(STORAGE_ADMIN_PASSWORD_KEY, newPassword.trim());
  return true;
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
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Reset fields when opening/closing
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setShowPassword(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, isChangePassword]);

  if (!isOpen) return null;

  // Handle unlocking Admin Mode
  const handleUnlockSubmit = (e) => {
    e?.preventDefault();
    setError('');

    if (!password) {
      setError('Please enter the admin password.');
      return;
    }

    if (checkAdminPassword(password)) {
      onSuccess?.();
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
      inputRef.current?.focus();
    }
  };

  // Handle changing Admin Password
  const handleChangeSubmit = (e) => {
    e?.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('Please enter your current admin password.');
      return;
    }

    if (!checkAdminPassword(currentPassword)) {
      setError('Current password is incorrect.');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      setError('New password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setAdminPassword(newPassword);
    showToast?.('🔑 Admin password updated successfully!');
    onClose?.();
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
          maxWidth: '420px',
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
                  ? 'Update the security password for Admin Mode'
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
              <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                Default password: <code style={{ color: '#38bdf8' }}>admin123</code>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  padding: '8px 18px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
                }}
              >
                🔓 Unlock Admin
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
                  style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    padding: '7px 16px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  }}
                >
                  Save Password
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
