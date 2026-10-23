import React, { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled Application Error:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem('lagangilang_tourist_spots_v1');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
          padding: '24px',
          textAlign: 'center'
        }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: '#f87171' }}>⚠️ Something went wrong</h2>
          <p style={{ color: '#94a3b8', maxWidth: '500px', marginBottom: '16px', fontSize: '0.9rem' }}>
            {this.state.error?.message || 'An unexpected error occurred while loading the application.'}
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              🔄 Reload Page
            </button>
            <button
              onClick={this.handleReset}
              style={{
                backgroundColor: '#334155',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              🧹 Clear Cache & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
