import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

const ACTIVE_NEON_URL =
  'postgresql://neondb_owner:npg_lHhZV7o5xvMt@ep-silent-heart-azsxtkkj-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

function getDbUrl() {
  const envUrl = process.env.VITE_NEON_DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (envUrl && envUrl.includes('ep-silent-heart-azsxtkkj')) {
    return envUrl;
  }
  return ACTIVE_NEON_URL;
}

const DB_URL = getDbUrl();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const sql = neon(DB_URL);

  // Ensure lagangilang_pois table exists
  try {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS lagangilang_pois (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.warn('[POIs API] Table check warning:', err.message);
  }

  const url = new URL(req.url);
  const paramId = url.searchParams.get('id');

  // GET: Fetch all POIs or single POI by id
  if (req.method === 'GET') {
    try {
      if (paramId) {
        const rows = await sql.query(
          'SELECT id, data, updated_at FROM lagangilang_pois WHERE id = $1',
          [paramId]
        );
        if (rows.length === 0) {
          return new Response(JSON.stringify({ success: false, error: 'POI not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true, poi: rows[0].data }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const rows = await sql.query(
        'SELECT id, data, updated_at FROM lagangilang_pois ORDER BY updated_at DESC'
      );
      const pois = rows.map((r) => r.data);

      return new Response(
        JSON.stringify({
          success: true,
          count: pois.length,
          pois,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // POST or PUT: Upsert single POI
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const body = await req.json();
      const poiData = body.data || body;
      const id = body.id || poiData.id || paramId;

      if (!id) {
        return new Response(JSON.stringify({ success: false, error: 'Missing POI id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await sql.query(
        `INSERT INTO lagangilang_pois (id, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (id)
         DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [id, JSON.stringify(poiData)]
      );

      return new Response(
        JSON.stringify({
          success: true,
          id,
          updated_at: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // DELETE: Remove POI by id
  if (req.method === 'DELETE') {
    try {
      let idToDelete = paramId;
      if (!idToDelete) {
        try {
          const body = await req.json();
          idToDelete = body?.id;
        } catch (_) {}
      }

      if (!idToDelete) {
        return new Response(JSON.stringify({ success: false, error: 'Missing id for deletion' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await sql.query('DELETE FROM lagangilang_pois WHERE id = $1', [idToDelete]);

      return new Response(
        JSON.stringify({
          success: true,
          deletedId: idToDelete,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: corsHeaders,
  });
}
