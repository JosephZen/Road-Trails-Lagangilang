import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const DB_URL =
  process.env.VITE_NEON_DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  'postgresql://neondb_owner:npg_NCe0hgVyZ7qx@ep-shy-art-aoq0wgaf-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const sql = neon(DB_URL);

  // Ensure table exists
  try {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS lagangilang_global_state (
        state_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.warn('[GlobalState] Table check warning:', err.message);
  }

  // GET: Retrieve global state
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const requestedKey = url.searchParams.get('key');

      let query = 'SELECT state_key, payload, updated_at FROM lagangilang_global_state';
      let rows = [];

      if (requestedKey) {
        rows = await sql.query(
          'SELECT state_key, payload, updated_at FROM lagangilang_global_state WHERE state_key = $1',
          [requestedKey]
        );
      } else {
        rows = await sql.query(query);
      }

      const stateMap = {};
      rows.forEach((r) => {
        stateMap[r.state_key] = r.payload;
      });

      return new Response(
        JSON.stringify({
          success: true,
          state: stateMap,
          rowsCount: rows.length,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: e.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // POST: Upsert state key
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { state_key, payload } = body;

      if (!state_key || payload === undefined) {
        return new Response(
          JSON.stringify({ success: false, error: 'Missing state_key or payload' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await sql.query(
        `INSERT INTO lagangilang_global_state (state_key, payload, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (state_key)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [state_key, JSON.stringify(payload)]
      );

      return new Response(
        JSON.stringify({
          success: true,
          state_key,
          updated_at: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: e.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: corsHeaders }
  );
}
