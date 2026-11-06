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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    const { id, lat, lng } = body;

    if (!id || lat === undefined || lng === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing id, lat, or lng' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const latNum = parseFloat(Number(lat).toFixed(6));
    const lngNum = parseFloat(Number(lng).toFixed(6));

    const sql = neon(DB_URL);

    // 1. Update in public.tourist_spots if table exists
    try {
      await sql`
        UPDATE public.tourist_spots
        SET latitude = ${latNum}, longitude = ${lngNum}, updated_at = NOW()
        WHERE id = ${id}
      `;
    } catch (_) {}

    // 2. Update in lagangilang_pois if row exists
    try {
      await sql.query(
        `UPDATE lagangilang_pois
         SET data = jsonb_set(
                      jsonb_set(data, '{lat}', to_jsonb($2::numeric)),
                      '{lng}', to_jsonb($3::numeric)
                    ),
             updated_at = NOW()
         WHERE id = $1`,
        [id, latNum, lngNum]
      );
    } catch (_) {}

    // 3. Update in lagangilang_global_state for both pois_and_landmarks & hotlines_and_checkpoints
    try {
      const rows = await sql.query(
        `SELECT state_key, payload FROM lagangilang_global_state
         WHERE state_key IN ('pois_and_landmarks', 'hotlines_and_checkpoints')`
      );

      for (const row of rows) {
        if (Array.isArray(row.payload)) {
          let updated = false;
          const newList = row.payload.map((item) => {
            if (item.id === id) {
              updated = true;
              return {
                ...item,
                lat: latNum,
                lng: lngNum,
                location: {
                  ...(item.location || {}),
                  lat: latNum,
                  lng: lngNum,
                },
              };
            }
            return item;
          });

          if (updated) {
            await sql.query(
              `UPDATE lagangilang_global_state
               SET payload = $2, updated_at = NOW()
               WHERE state_key = $1`,
              [row.state_key, JSON.stringify(newList)]
            );
          }
        }
      }
    } catch (_) {}

    return new Response(
      JSON.stringify({
        success: true,
        id,
        lat: latNum,
        lng: lngNum,
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
