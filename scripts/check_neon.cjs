const { neon } = require('@neondatabase/serverless');

const dbUrl = 'postgresql://neondb_owner:npg_NCe0hgVyZ7qx@ep-shy-art-aoq0wgaf-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(dbUrl);

async function check() {
  try {
    const rows = await sql`SELECT sequence_id, name, jsonb_array_length(images) as img_count, updated_at FROM public.aligned_sequences`;
    console.log('Neon aligned_sequences rows:', rows);
  } catch (e) {
    console.error('Error:', e);
  }
}

check();
