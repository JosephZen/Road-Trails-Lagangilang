/**
 * Master Global Sync Service (Neon PostgreSQL)
 * 
 * Guarantees One Global Truth across Desktop, Mobile, Tablet, and Public Tourists.
 * All mutations (POI edits, pin coordinate drags, hotlines, trail alignments, bridges)
 * persist immediately to Neon PostgreSQL (table: lagangilang_global_state).
 */

const ACTIVE_NEON_URL =
  'postgresql://neondb_owner:npg_lHhZV7o5xvMt@ep-silent-heart-azsxtkkj-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

function getNeonUrl() {
  const custom = typeof localStorage !== 'undefined' && localStorage.getItem('lagangilang_neon_db_url');
  if (custom && custom.includes('ep-silent-heart-azsxtkkj')) return custom;
  const env = import.meta.env.VITE_NEON_DATABASE_URL;
  if (env && env.includes('ep-silent-heart-azsxtkkj')) return env;
  return ACTIVE_NEON_URL;
}

const NEON_URL = getNeonUrl();

const API_BASE = import.meta.env.VITE_API_BASE || '';

export const GLOBAL_STATE_KEYS = {
  POIS: 'pois_and_landmarks',
  HOTLINES: 'hotlines_and_checkpoints',
  TRAILS: 'trail_alignments_and_bridges',
  ADMIN_PASSWORD: 'admin_security_credentials',
};

class GlobalSyncService {
  constructor() {
    this.listeners = new Set();
    this.syncStatus = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error'
    this.lastSyncTime = null;
    this.cachedState = {};
    this.pollInterval = null;
    this.isInitialized = false;

    // Start background sync on browser load
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.fetchGlobalState().catch(() => {});
      });
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event) {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (e) {
        console.error('[GlobalSync] Listener error:', e);
      }
    });
  }

  setSyncStatus(status) {
    this.syncStatus = status;
    this.notify({ type: 'status_change', status, lastSyncTime: this.lastSyncTime });
  }

  /**
   * Direct Neon SQL runner fallback
   */
  async getNeonSql() {
    const { neon } = await import('@neondatabase/serverless');
    return neon(NEON_URL);
  }

  /**
   * Fetch master global state from /api/global-state or direct Neon DB fallback
   */
  async fetchGlobalState() {
    this.setSyncStatus('syncing');

    // 1. Try Vercel Serverless API first
    try {
      const res = await fetch(`${API_BASE}/api/global-state?t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.state) {
          this.cachedState = { ...this.cachedState, ...data.state };
          this.lastSyncTime = new Date().toISOString();
          this.setSyncStatus('synced');
          this.notify({ type: 'state_updated', state: this.cachedState });
          return this.cachedState;
        }
      }
    } catch (_) {
      // API endpoint unavailable (e.g. local dev without server or edge routing)
    }

    // 2. Direct Neon Serverless query fallback
    try {
      const sql = await this.getNeonSql();
      // Ensure table exists
      await sql`
        CREATE TABLE IF NOT EXISTS lagangilang_global_state (
          state_key TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;

      const rows = await sql`SELECT state_key, payload, updated_at FROM lagangilang_global_state`;
      const stateMap = {};
      rows.forEach((r) => {
        stateMap[r.state_key] = r.payload;
      });

      this.cachedState = { ...this.cachedState, ...stateMap };
      this.lastSyncTime = new Date().toISOString();
      this.setSyncStatus('synced');
      this.notify({ type: 'state_updated', state: this.cachedState });
      return this.cachedState;
    } catch (err) {
      console.warn('[GlobalSync] Neon query failed:', err.message);
      this.setSyncStatus('error');
      return this.cachedState;
    }
  }

  /**
   * Save a specific key to Neon DB and notify all listeners
   */
  async saveKey(key, payload) {
    if (!key) return false;
    this.setSyncStatus('syncing');
    this.cachedState[key] = payload;

    // 1. Try /api/global-state
    try {
      const res = await fetch(`${API_BASE}/api/global-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_key: key, payload }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          this.lastSyncTime = new Date().toISOString();
          this.setSyncStatus('synced');
          this.notify({ type: 'key_saved', key, payload });
          return true;
        }
      }
    } catch (_) {}

    // 2. Direct Neon DB fallback
    try {
      const sql = await this.getNeonSql();
      await sql`
        INSERT INTO lagangilang_global_state (state_key, payload, updated_at)
        VALUES (${key}, ${JSON.stringify(payload)}::jsonb, NOW())
        ON CONFLICT (state_key)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `;

      this.lastSyncTime = new Date().toISOString();
      this.setSyncStatus('synced');
      this.notify({ type: 'key_saved', key, payload });
      return true;
    } catch (err) {
      console.error(`[GlobalSync] Failed to persist ${key}:`, err);
      this.setSyncStatus('error');
      return false;
    }
  }

  /**
   * Fetch global state once on startup (background polling loop deprecated per Phase 5)
   */
  startAutoSync() {
    this.fetchGlobalState().catch(() => {});
  }

  stopAutoSync() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

export const globalSyncService = new GlobalSyncService();
export default globalSyncService;
