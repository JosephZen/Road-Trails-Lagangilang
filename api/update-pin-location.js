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
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();
    const { id, type, lat, lng } = body;

    if (!id || lat === undefined || lng === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: id, lat, or lng' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const latNum = parseFloat(Number(lat).toFixed(6));
    const lngNum = parseFloat(Number(lng).toFixed(6));
    const nowIso = new Date().toISOString();

    const sql = neon(DB_URL);

    // 1. Authoritative Update in lagangilang_global_state (both POIs and Hotlines)
    try {
      const rows = await sql.query(
        `SELECT state_key, payload FROM lagangilang_global_state
         WHERE state_key IN ('pois_and_landmarks', 'hotlines_and_checkpoints')`
      );

      for (const row of rows) {
        if (Array.isArray(row.payload)) {
          let hasChange = false;
          const newList = row.payload.map((item) => {
            if (item.id === id) {
              hasChange = true;
              return {
                ...item,
                lat: latNum,
                lng: lngNum,
                location: {
                  ...(item.location || {}),
                  lat: latNum,
                  lng: lngNum,
                },
                updated_at: nowIso,
              };
            }
            return item;
          });

          if (hasChange) {
            await sql.query(
              `UPDATE lagangilang_global_state
               SET payload = $2, updated_at = NOW()
               WHERE state_key = $1`,
              [row.state_key, JSON.stringify(newList)]
            );
          }
        }
      }
    } catch (e) {
      console.warn('[UpdatePin] lagangilang_global_state update warning:', e.message);
    }

    // 2. Specific Table Upserts for granular queries
    if (type === 'hotline') {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS lagangilang_hotlines (
            id TEXT PRIMARY KEY,
            lat NUMERIC NOT NULL,
            lng NUMERIC NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `;
        await sql`
          INSERT INTO lagangilang_hotlines (id, lat, lng, updated_at)
          VALUES (${id}, ${latNum}, ${lngNum}, NOW())
          ON CONFLICT (id) DO UPDATE SET
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            updated_at = NOW();
        `;
      } catch (e) {
        console.warn('[UpdatePin] lagangilang_hotlines upsert warning:', e.message);
      }
    } else {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS lagangilang_pois (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `;
        await sql.query(
          `INSERT INTO lagangilang_pois (id, data, updated_at)
           VALUES ($1, jsonb_build_object('id', $1::text, 'lat', $2::numeric, 'lng', $3::numeric), NOW())
           ON CONFLICT (id) DO UPDATE SET
             data = jsonb_set(
                      jsonb_set(lagangilang_pois.data, '{lat}', to_jsonb($2::numeric)),
                      '{lng}', to_jsonb($3::numeric)
                    ),
             updated_at = NOW();`,
          [id, latNum, lngNum]
        );
      } catch (e) {
        console.warn('[UpdatePin] lagangilang_pois upsert warning:', e.message);
      }

      try {
        await sql`
          UPDATE public.tourist_spots
          SET latitude = ${latNum}, longitude = ${lngNum}, updated_at = NOW()
          WHERE id = ${id};
        `;
      } catch (e) {
        console.warn('[UpdatePin] public.tourist_spots update warning:', e.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true, id, lat: latNum, lng: lngNum }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('[UpdatePin] SQL error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}
