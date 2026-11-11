import { neon } from '@neondatabase/serverless';
import fallbackPois from '../src/data/tourist_spots.json' with { type: 'json' };
import fallbackAlignedSequences from '../src/data/mapillary_aligned_sequences.json' with { type: 'json' };
import fallbackBridges from '../src/data/mapillary_sequence_bridges.json' with { type: 'json' };
import fallbackExcludedSequences from '../src/data/mapillary_excluded_sequences.json' with { type: 'json' };
import fallbackExcludedImages from '../src/data/mapillary_excluded_images.json' with { type: 'json' };

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

const fallbackHotlines = [
  {
    id: 'poi_denr_checkpoint_lagangilang',
    name: 'DENR Environmental Checkpoint - Lagangilang',
    category: 'DENR Checkpoint',
    categoryIcon: '🌲',
    phone: '0917-889-3321',
    altPhone: '(074) 752-8234',
    description: 'Timber & Wildlife Monitoring, Watershed Protection, Mountain Trail Registration & Environmental Safety Inspection',
    operatingHours: '24/7 Official Monitoring & Registration Desk',
    location: {
      lat: 17.592176,
      lng: 120.787685,
      address: 'San Isidro, Lagangilang, Abra, Philippines',
    },
    notes: 'Required registration point for hikers traversing upland eco-trails and municipal forest corridors.',
    spotType: 'poi',
    isCheckpoint: true,
  },
  {
    id: 'poi_lagangilang_mdrrmo',
    name: 'Lagangilang MDRRMO (Disaster & Rescue)',
    category: 'MDRRMO',
    categoryIcon: '🚑',
    phone: '0917-829-4501',
    altPhone: '0920-948-2311',
    description: '24/7 Search & Rescue, Medical Evacuation, Flood/Typhoon Monitoring, Mountain Assistance',
    operatingHours: '24/7 Disaster Operations Center',
    location: {
      lat: 17.612657,
      lng: 120.733619,
      address: 'Municipal Hall Complex, Poblacion, Lagangilang, Abra',
    },
    spotType: 'poi',
  },
  {
    id: 'poi_lagangilang_pnp',
    name: 'PNP Lagangilang Municipal Police',
    category: 'Police',
    categoryIcon: '👮',
    phone: '0998-598-7742',
    altPhone: '0917-123-7670',
    description: 'Public Safety, Peace & Order, Highway Patrols, Tourist Security Assistance',
    operatingHours: '24/7 Police Desk & Mobile Patrols',
    location: {
      lat: 17.606671,
      lng: 120.736502,
      address: 'Police Station, Municipal Hall Complex, Poblacion',
    },
    spotType: 'poi',
  },
  {
    id: 'poi_lagangilang_bfp',
    name: 'BFP Lagangilang Fire Station',
    category: 'Fire Station',
    categoryIcon: '🚒',
    phone: '0915-384-9122',
    altPhone: '(074) 752-8111',
    description: 'Fire Suppression, Emergency Medical Response, Search & Rescue Operations',
    operatingHours: '24/7 Fire Station Readiness',
    location: {
      lat: 17.60848,
      lng: 120.735801,
      address: 'Kalinga Road, Poblacion, Lagangilang, Abra',
    },
    spotType: 'poi',
  },
  {
    id: 'poi_lagangilang_rhu',
    name: 'Lagangilang Rural Health Unit (RHU)',
    category: 'Health / RHU',
    categoryIcon: '🏥',
    phone: '(074) 752-8012',
    altPhone: '0977-802-3490',
    description: 'Emergency Medical Care, Outpatient Consultation, First Aid & Antivenom Administration',
    operatingHours: '8:00 AM - 5:00 PM (24/7 On-Call Emergency)',
    location: {
      lat: 17.607668,
      lng: 120.735759,
      address: 'Health Center, Poblacion, Lagangilang, Abra',
    },
    spotType: 'poi',
  },
  {
    id: 'poi_lagangilang_tourism_office',
    name: 'Lagangilang Municipal Tourism Office',
    category: 'Tourism',
    categoryIcon: '🌴',
    phone: '0917-504-2299',
    altPhone: '(074) 752-8001',
    description: 'Trail Information, Tourist Assistance, Tour Guide Accreditation & Cultural Advisories',
    operatingHours: '8:00 AM - 5:00 PM Monday to Friday',
    location: {
      lat: 17.61267,
      lng: 120.733661,
      address: 'Tourism Desk, Presidencia Ti Lagangilang, Poblacion',
    },
    spotType: 'poi',
  },
];

const fallbackTrails = {
  alignedSequences: fallbackAlignedSequences || {},
  sequenceBridges: fallbackBridges || {},
  excludedSequences: fallbackExcludedSequences || [],
  excludedImages: fallbackExcludedImages || [],
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
    if (!trails || !trails.alignedSequences || Object.keys(trails.alignedSequences).length === 0) {
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
