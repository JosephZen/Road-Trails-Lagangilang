const { Pool } = require('pg');
const spots = require('../src/data/tourist_spots.json');

const NEON_URL = process.env.VITE_NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_NCe0hgVyZ7qx@ep-shy-art-aoq0wgaf-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('Connecting to Neon PostgreSQL...');
  const client = await pool.connect();
  try {
    // 1. Fetch existing categories
    const catRes = await client.query('SELECT id, name FROM public.categories');
    console.log('Existing categories in Neon:', catRes.rows);

    // 2. Ensure standard categories exist so foreign keys never fail
    const standardCategories = [
      { id: 'cat_nature', name: 'Nature & Eco-Tourism', icon: '🏞️' },
      { id: 'cat_heritage', name: 'Historical & Cultural Heritage', icon: '🏛️' },
      { id: 'cat_adventure', name: 'Adventure & Trekking Trail', icon: '🌉' },
      { id: 'cat_agri', name: 'Agri-Tourism & Cultural Handicrafts', icon: '🌾' },
      { id: 'cat_religious', name: 'Religious & Spiritual Site', icon: '⛪' },
      { id: 'cat_civic', name: 'Civic & Public Park', icon: '🌳' },
      { id: 'cat_viewpoint', name: 'Scenic Viewpoint & Overlook', icon: '🌄' }
    ];

    for (const cat of standardCategories) {
      await client.query(`
        INSERT INTO public.categories (id, name, icon)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon
      `, [cat.id, cat.name, cat.icon]);
    }

    // 3. Delete obsolete/legacy spots that are not part of the 12 official landmarks
    const officialIds = spots.map(s => s.id);
    console.log('Official Landmark IDs (12 total):', officialIds);

    const deleteObsoleteRes = await client.query(
      'DELETE FROM public.tourist_spots WHERE NOT (id = ANY($1))',
      [officialIds]
    );
    console.log(`Deleted ${deleteObsoleteRes.rowCount} obsolete spot(s) from Neon.`);

    // 4. Upsert all 12 official landmarks into Neon
    for (const s of spots) {
      const lat = s.location?.lat ?? s.lat;
      const lng = s.location?.lng ?? s.lng;
      const targetId = s.connected360?.targetId || null;
      const heading = s.connected360?.heading || 0;
      const pitch = s.connected360?.pitch || 0;

      // Find matching category
      let categoryId = null;
      const matchedCat = standardCategories.find(c => c.name.toLowerCase() === (s.category || '').toLowerCase());
      if (matchedCat) {
        categoryId = matchedCat.id;
      }

      await client.query(`
        INSERT INTO public.tourist_spots (
          id, name, category_id, barangay, latitude, longitude, address,
          description, image_url, is_pseudo_image, pseudo_theme,
          primary_pano_id, target_heading, target_pitch, sync_status,
          staged_at, synced_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'synced_cloud',
          NOW(), NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category_id = EXCLUDED.category_id,
          barangay = EXCLUDED.barangay,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          address = EXCLUDED.address,
          description = EXCLUDED.description,
          image_url = EXCLUDED.image_url,
          is_pseudo_image = EXCLUDED.is_pseudo_image,
          pseudo_theme = EXCLUDED.pseudo_theme,
          primary_pano_id = EXCLUDED.primary_pano_id,
          target_heading = EXCLUDED.target_heading,
          target_pitch = EXCLUDED.target_pitch,
          sync_status = 'synced_cloud',
          synced_at = NOW(),
          updated_at = NOW();
      `, [
        s.id,
        s.name,
        categoryId,
        s.barangay || 'Poblacion',
        lat,
        lng,
        s.location?.address || `${s.name}, Lagangilang, Abra`,
        s.description || '',
        s.image || null,
        s.isPseudoImage ?? !s.image,
        s.pseudoTheme || 'indigo',
        targetId,
        heading,
        pitch
      ]);
      console.log(`  ✓ Synced to Neon: ${s.name} (${s.id}) at [${lat}, ${lng}]`);
    }

    // 5. Verify the current records in Neon
    const verifyRes = await client.query('SELECT id, name, latitude, longitude, primary_pano_id FROM public.tourist_spots ORDER BY id');
    console.log(`\nVerified Neon tourist_spots count: ${verifyRes.rows.length}`);
    verifyRes.rows.forEach(r => {
      console.log(`  - ${r.name} (${r.id}): lat=${r.latitude}, lng=${r.longitude}, pano=${r.primary_pano_id}`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
