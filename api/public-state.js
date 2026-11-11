import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ACTIVE_NEON_URL =
  'postgresql://neondb_owner:npg_lHhZV7o5xvMt@ep-silent-heart-azsxtkkj-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

function getDbUrl() {
  const envUrl = process.env.VITE_NEON_DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (envUrl && envUrl.includes('ep-silent-heart-azsxtkkj')) {
    return envUrl;
  }
  return ACTIVE_NEON_URL;
}

const DB_URL = getDbUrl();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const sql = neon(DB_URL);

    // 1. Fetch global state payloads
    let stateRows = [];
    try {
      stateRows = await sql`
        SELECT state_key, payload, updated_at
        FROM lagangilang_global_state
        WHERE state_key IN ('pois_and_landmarks', 'hotlines_and_checkpoints')
      `;
    } catch (_) {}

    let rawPois = [];
    let rawHotlines = [];

    stateRows.forEach((r) => {
      if (r.state_key === 'pois_and_landmarks' && Array.isArray(r.payload)) {
        rawPois = r.payload;
      }
      if (r.state_key === 'hotlines_and_checkpoints' && Array.isArray(r.payload)) {
        rawHotlines = r.payload;
      }
    });

    // 2. Fetch coordinate overrides from lagangilang_pois, tourist_spots, and lagangilang_hotlines
    const overrides = new Map();

    try {
      const poiRows = await sql`
        SELECT id, lat, lng, updated_at
        FROM lagangilang_pois
        WHERE lat IS NOT NULL AND lng IS NOT NULL
      `;
      poiRows.forEach((r) => {
        overrides.set(r.id, { lat: parseFloat(r.lat), lng: parseFloat(r.lng), updated_at: r.updated_at });
      });
    } catch (_) {}

    try {
      const tsRows = await sql`
        SELECT id, latitude, longitude, updated_at
        FROM tourist_spots
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      `;
      tsRows.forEach((r) => {
        const existing = overrides.get(r.id);
        const tsTime = new Date(r.updated_at || 0).getTime();
        const exTime = new Date(existing?.updated_at || 0).getTime();
        if (!existing || tsTime >= exTime) {
          overrides.set(r.id, { lat: parseFloat(r.latitude), lng: parseFloat(r.longitude), updated_at: r.updated_at });
        }
      });
    } catch (_) {}

    try {
      const hlRows = await sql`
        SELECT id, lat, lng, updated_at
        FROM lagangilang_hotlines
        WHERE lat IS NOT NULL AND lng IS NOT NULL
      `;
      hlRows.forEach((r) => {
        overrides.set(r.id, { lat: parseFloat(r.lat), lng: parseFloat(r.lng), updated_at: r.updated_at });
      });
    } catch (_) {}

    // Apply latest overrides to POIs
    const finalPois = rawPois.map((p) => {
      const ov = overrides.get(p.id);
      if (ov) {
        return {
          ...p,
          lat: ov.lat,
          lng: ov.lng,
          location: {
            ...(p.location || {}),
            lat: ov.lat,
            lng: ov.lng,
          },
          updated_at: ov.updated_at || p.updated_at,
        };
      }
      return p;
    });

    // Apply latest overrides to Hotlines
    const finalHotlines = rawHotlines.map((h) => {
      const ov = overrides.get(h.id);
      if (ov) {
        return {
          ...h,
          lat: ov.lat,
          lng: ov.lng,
          location: {
            ...(h.location || {}),
            lat: ov.lat,
            lng: ov.lng,
          },
          updated_at: ov.updated_at || h.updated_at,
        };
      }
      return h;
    });

    return new Response(
      JSON.stringify({
        success: true,
        pois: finalPois,
        hotlines: finalHotlines,
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
  } catch (err) {
    console.error('Error in public-state API:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
