const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

// Load current aligned sequences
const filePath = 'public/data/aligned_sequences.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Intersection point between sJAgwIHy2j8YUZiXNQ3zSl and 2NGX1fJ576gzWKtiCsALVB
const junctionCoord = [120.73544245892799, 17.613497299452277];

// Snap 2NGX1fJ576gzWKtiCsALVB start to the junction
if (data['2NGX1fJ576gzWKtiCsALVB']) {
  const seq = data['2NGX1fJ576gzWKtiCsALVB'];
  seq.controlPoints[0] = junctionCoord;
  
  // Catmull-Rom or linear interpolation for dense coordinates along control points
  const points = seq.controlPoints;
  const dense = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const steps = 10;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      dense.push([
        p1[0] + (p2[0] - p1[0]) * t,
        p1[1] + (p2[1] - p1[1]) * t
      ]);
    }
  }
  dense.push(points[points.length - 1]);
  seq.coordinates = dense;
  
  // Re-map images evenly along coordinates
  if (seq.images && seq.images.length > 0) {
    const totalImgs = seq.images.length;
    for (let i = 0; i < totalImgs; i++) {
      const coordIdx = Math.min(dense.length - 1, Math.round((i / (totalImgs - 1)) * (dense.length - 1)));
      seq.images[i].lng = dense[coordIdx][0];
      seq.images[i].lat = dense[coordIdx][1];
      if (i < totalImgs - 1) {
        seq.images[i].nextImageId = seq.images[i + 1].id;
      }
      if (i > 0) {
        seq.images[i].prevImageId = seq.images[i - 1].id;
      }
    }
  }
  seq.updatedAt = Date.now();
}

// Ensure sJAgwIHy2j8YUZiXNQ3zSl also has updatedAt timestamp
if (data['sJAgwIHy2j8YUZiXNQ3zSl']) {
  data['sJAgwIHy2j8YUZiXNQ3zSl'].updatedAt = Date.now();
}
if (data['tsnRCexAYfODZVc05EjvyL']) {
  data['tsnRCexAYfODZVc05EjvyL'].updatedAt = Date.now();
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Updated public/data/aligned_sequences.json with snapped junction connection!');

// Sync to Neon DB
async function syncNeon() {
  const dbUrl = 'postgresql://neondb_owner:npg_NCe0hgVyZ7qx@ep-shy-art-aoq0wgaf-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
  const sql = neon(dbUrl);
  for (const [seqId, record] of Object.entries(data)) {
    console.log(`Upserting ${seqId} into Neon DB...`);
    await sql`
      INSERT INTO public.aligned_sequences (sequence_id, name, control_points, coordinates, images, updated_at)
      VALUES (${seqId}, ${record.name || 'Aligned Sequence'}, ${JSON.stringify(record.controlPoints || [])}::jsonb, ${JSON.stringify(record.coordinates || [])}::jsonb, ${JSON.stringify(record.images || [])}::jsonb, NOW())
      ON CONFLICT (sequence_id) DO UPDATE SET
        name = EXCLUDED.name,
        control_points = EXCLUDED.control_points,
        coordinates = EXCLUDED.coordinates,
        images = EXCLUDED.images,
        updated_at = NOW()
    `;
  }
  console.log('Neon DB successfully synchronized!');
}

syncNeon().catch(console.error);
