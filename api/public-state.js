import { neon } from '@neondatabase/serverless';
import { fallbackPois, fallbackHotlines, fallbackTrails } from './_fallbackData.js';

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

    const rows = await sql.query(
      `SELECT state_key, payload, updated_at FROM lagangilang_global_state
       WHERE state_key IN ('pois_and_landmarks', 'hotlines_and_checkpoints', 'trail_alignments_and_bridges')`
    );

    let pois = [];
    let hotlines = [];
    let trails = null;

    rows.forEach((r) => {
      if (r.state_key === 'pois_and_landmarks' && Array.isArray(r.payload)) {
        pois = r.payload;
      } else if (r.state_key === 'hotlines_and_checkpoints' && Array.isArray(r.payload)) {
        hotlines = r.payload;
      } else if (r.state_key === 'trail_alignments_and_bridges') {
        trails = r.payload;
      }
    });

    // Resilient fallback: ensure complete dataset is served even if database state was empty or partial
    if (!pois || pois.length < fallbackPois.length) {
      pois = fallbackPois;
    }
    if (!hotlines || hotlines.length < fallbackHotlines.length) {
      hotlines = fallbackHotlines;
    }
    if (!trails || !trails.sequenceBridges || Object.keys(trails.sequenceBridges).length === 0) {
      trails = fallbackTrails;
    }

    return new Response(
      JSON.stringify({
        success: true,
        pois,
        hotlines,
        trails,
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
    console.error('[PublicState] Database fetch error (serving resilient fallback):', err.message);
    return new Response(
      JSON.stringify({
        success: true,
        fallback: true,
        warning: `Database unavailable (${err.message}), serving authoritative bundled state.`,
        pois: fallbackPois,
        hotlines: fallbackHotlines,
        trails: fallbackTrails,
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
  }
}
