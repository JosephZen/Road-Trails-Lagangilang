const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

// Simple .env parser to avoid extra dotenv dependency
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    lines.forEach((line) => {
      const match = line.trim().match(/^([^=]+)=(.*)$/);
      if (match && !match[1].startsWith('#')) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
}
loadEnv();

const app = express();
const PORT = process.env.PORT || 3001;

// Paths
const PANORAMAS_DIR = path.join(__dirname, '..', 'public', 'panoramas');
const THUMBNAILS_DIR = path.join(PANORAMAS_DIR, 'thumbnails');
const METADATA_FILE = path.join(PANORAMAS_DIR, 'metadata.json');
const SPOTS_FILE = path.join(__dirname, '..', 'src', 'data', 'tourist_spots.json');

// Ensure directories exist
if (!fs.existsSync(PANORAMAS_DIR)) fs.mkdirSync(PANORAMAS_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

// Ensure metadata file exists
if (!fs.existsSync(METADATA_FILE)) {
  fs.writeFileSync(METADATA_FILE, JSON.stringify({ panoramas: [] }, null, 2));
}

// ============ Local PostgreSQL Setup (pgAdmin 4) ============
const pgConfig = process.env.LOCAL_DATABASE_URL
  ? { connectionString: process.env.LOCAL_DATABASE_URL, connectionTimeoutMillis: 3000 }
  : {
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432', 10),
      database: process.env.PGDATABASE || 'lagangilang_db',
      connectionTimeoutMillis: 3000,
    };

const localDbUrl =
  process.env.LOCAL_DATABASE_URL ||
  `postgresql://${pgConfig.user || 'postgres'}:****@${pgConfig.host || 'localhost'}:${pgConfig.port || 5432}/${pgConfig.database || 'lagangilang_db'}`;

let pgPool = null;
let isPgConnected = false;

try {
  pgPool = new Pool(pgConfig);
} catch (err) {
  console.warn('  ℹ PostgreSQL driver init failed, using local JSON buffer.');
}

// ============ Neon Serverless Cloud PostgreSQL Setup ============
const neonDbUrl =
  process.env.VITE_NEON_DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  'postgresql://neondb_owner:npg_NCe0hgVyZ7qx@ep-shy-art-aoq0wgaf-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

let neonPool = null;
try {
  neonPool = new Pool({
    connectionString: neonDbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });
  console.log('  ✓ Neon Cloud PostgreSQL pool initialized.');
} catch (err) {
  console.warn('  ⚠ Neon Cloud pool init error:', err.message);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve panorama images statically with explicit CORS and WebGL texture headers
app.use('/panoramas', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(PANORAMAS_DIR));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PANORAMAS_DIR),
  filename: (req, file, cb) => {
    const id = `pano_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// ============ Helper Functions ============

function readMetadata() {
  try {
    const data = fs.readFileSync(METADATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { panoramas: [] };
  }
}

function writeMetadata(data) {
  fs.writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2));
}

function readLocalSpots() {
  try {
    if (fs.existsSync(SPOTS_FILE)) {
      return JSON.parse(fs.readFileSync(SPOTS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('Error reading tourist_spots.json:', err.message);
  }
  return [];
}

function writeLocalSpots(spots) {
  try {
    fs.writeFileSync(SPOTS_FILE, JSON.stringify(spots, null, 2));
  } catch (err) {
    console.warn('Error writing tourist_spots.json:', err.message);
  }
}

/**
 * Auto-link neighbors based on both spatial proximity and chronological sequence.
 * Connects nearest neighbors within distance threshold (up to 5 closest nodes)
 * plus consecutive sequence nodes, ensuring a rich, multi-directional 360 street view graph.
 */
function autoLinkNeighbors(panoramas, maxDistance = 300) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const sorted = [...panoramas].sort(
    (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
  );

  // First pass: collect neighbors for each node
  const neighborMap = new Map();
  panoramas.forEach((pano) => {
    neighborMap.set(pano.id, new Set(pano.neighbors || []));
  });

  panoramas.forEach((pano) => {
    const currentSet = neighborMap.get(pano.id);

    // 1. Chronological predecessor & successor (linear path)
    const index = sorted.findIndex((p) => p.id === pano.id);
    if (index > 0) {
      const prev = sorted[index - 1];
      if (haversine(pano.lat, pano.lng, prev.lat, prev.lng) <= maxDistance) {
        currentSet.add(prev.id);
        neighborMap.get(prev.id)?.add(pano.id);
      }
    }
    if (index < sorted.length - 1) {
      const next = sorted[index + 1];
      if (haversine(pano.lat, pano.lng, next.lat, next.lng) <= maxDistance) {
        currentSet.add(next.id);
        neighborMap.get(next.id)?.add(pano.id);
      }
    }

    // 2. Spatial proximity: find all nearby panoramas within 150 meters
    const nearby = panoramas
      .filter((other) => other.id !== pano.id)
      .map((other) => ({
        id: other.id,
        dist: haversine(pano.lat, pano.lng, other.lat, other.lng),
      }))
      .filter((other) => other.dist <= 150)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5); // Connect to top 5 closest neighbors

    nearby.forEach((other) => {
      currentSet.add(other.id);
      neighborMap.get(other.id)?.add(pano.id);
    });
  });

  // Return panoramas with updated neighbors list
  return panoramas.map((pano) => ({
    ...pano,
    neighbors: Array.from(neighborMap.get(pano.id) || []),
  }));
}

/**
 * Generate a compressed thumbnail for a panorama image using sharp.
 */
async function generateThumbnail(inputPath, panoId) {
  try {
    const sharp = require('sharp');
    const thumbPath = path.join(THUMBNAILS_DIR, `${panoId}_thumb.jpg`);

    await sharp(inputPath)
      .resize(1024, 512, { fit: 'cover' })
      .jpeg({ quality: 60 })
      .toFile(thumbPath);

    console.log(`  ✓ Thumbnail generated: ${thumbPath}`);
    return `${panoId}_thumb.jpg`;
  } catch (err) {
    console.warn(`  ⚠ Thumbnail generation failed:`, err.message);
    return null;
  }
}

// ============ API Routes ============

/**
 * GET /api/health/postgres - Check local PostgreSQL connection status
 */
app.get('/api/health/postgres', async (req, res) => {
  if (pgPool) {
    try {
      await pgPool.query('SELECT 1');
      isPgConnected = true;
      return res.json({
        connected: true,
        type: 'PostgreSQL (Local / pgAdmin 4)',
        database: localDbUrl.replace(/:[^:@]+@/, ':****@'),
      });
    } catch (e) {
      isPgConnected = false;
    }
  }
  res.json({
    connected: false,
    type: 'Local JSON Fallback',
    message: 'Local PostgreSQL service not running. Using tourist_spots.json buffer.',
  });
});

const CATEGORY_MAP = {
  'nature & eco-tourism': 'cat_nature',
  'historical & cultural heritage': 'cat_heritage',
  'scenic viewpoint & overlook': 'cat_viewpoint',
  'adventure & trekking trail': 'cat_adventure',
  'agri-tourism & cultural handicrafts': 'cat_agri',
  'civic & public park': 'cat_civic',
  'religious & spiritual site': 'cat_religious',
  'gas station & fuel': 'cat_gas',
  'restaurant & dining': 'cat_dining',
  'local eatery & carinderia': 'cat_eatery',
  'hotel & accommodation': 'cat_hotel',
  'convenience store & market': 'cat_store',
  'pharmacy & health clinic': 'cat_pharmacy',
  'bank & atm': 'cat_bank',
  'transport terminal': 'cat_transport',
  'government & emergency services': 'cat_emergency',
};

const HUMAN_CATEGORY_MAP = {
  cat_nature: 'Nature & Eco-Tourism',
  cat_heritage: 'Historical & Cultural Heritage',
  cat_viewpoint: 'Scenic Viewpoint & Overlook',
  cat_adventure: 'Adventure & Trekking Trail',
  cat_agri: 'Agri-Tourism & Cultural Handicrafts',
  cat_civic: 'Civic & Public Park',
  cat_religious: 'Religious & Spiritual Site',
  cat_gas: 'Gas Station & Fuel',
  cat_dining: 'Restaurant & Dining',
  cat_eatery: 'Local Eatery & Carinderia',
  cat_hotel: 'Hotel & Accommodation',
  cat_store: 'Convenience Store & Market',
  cat_pharmacy: 'Pharmacy & Health Clinic',
  cat_bank: 'Bank & ATM',
  cat_transport: 'Transport Terminal',
  cat_emergency: 'Government & Emergency Services',
};

function normalizeServerCategoryId(cat) {
  if (!cat) return 'cat_heritage';
  const lower = String(cat).toLowerCase().trim();
  if (lower.startsWith('cat_')) return lower;
  return CATEGORY_MAP[lower] || 'cat_heritage';
}

function normalizeServerCategoryName(catId) {
  if (!catId) return 'General Attraction';
  const lower = String(catId).toLowerCase().trim();
  if (HUMAN_CATEGORY_MAP[lower]) return HUMAN_CATEGORY_MAP[lower];
  return catId;
}

/**
 * GET /api/tourist-spots - List all tourist spots
 * Reads from Local PostgreSQL if connected; falls back to tourist_spots.json.
 */
app.get('/api/tourist-spots', async (req, res) => {
  if (isPgConnected && pgPool) {
    try {
      const result = await pgPool.query(
        'SELECT * FROM public.tourist_spots ORDER BY created_at DESC'
      );
      const spots = result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: normalizeServerCategoryName(row.category_id),
        barangay: row.barangay,
        location: {
          lat: parseFloat(row.latitude),
          lng: parseFloat(row.longitude),
          address: row.address || '',
        },
        description: row.description,
        image: row.image_url,
        isPseudoImage: row.is_pseudo_image,
        pseudoTheme: row.pseudo_theme,
        connected360: {
          type: 'local',
          targetId: row.primary_pano_id,
          heading: parseFloat(row.target_heading) || 0,
          pitch: parseFloat(row.target_pitch) || 0,
        },
        sync_status: row.sync_status || 'synced_cloud',
        staged_at: row.staged_at,
        synced_at: row.synced_at,
      }));
      return res.json(spots);
    } catch (err) {
      console.warn('Local Postgres read error, falling back to JSON:', err.message);
    }
  }

  // Fallback to JSON
  res.json(readLocalSpots());
});

/**
 * POST /api/tourist-spots - Add or Sync a tourist spot
 */
app.post('/api/tourist-spots', async (req, res) => {
  const spot = req.body;
  if (!spot.name || !spot.location) {
    return res.status(400).json({ error: 'Name and location required' });
  }

  const id = spot.id || `poi_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const lat = parseFloat(spot.location.lat);
  const lng = parseFloat(spot.location.lng);
  const categoryId = normalizeServerCategoryId(spot.category);

  if (isPgConnected && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO public.tourist_spots (
          id, name, category_id, barangay, latitude, longitude, address,
          description, image_url, is_pseudo_image, pseudo_theme,
          primary_pano_id, target_heading, target_pitch, sync_status,
          staged_at, synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
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
          updated_at = NOW()`,
        [
          id,
          spot.name,
          categoryId,
          spot.barangay || 'Poblacion',
          lat,
          lng,
          spot.location.address || '',
          spot.description || '',
          spot.image || null,
          spot.isPseudoImage ?? !spot.image,
          spot.pseudoTheme || 'indigo',
          spot.connected360?.targetId || null,
          parseFloat(spot.connected360?.heading) || 0,
          parseFloat(spot.connected360?.pitch) || 0,
          spot.sync_status || 'synced_cloud',
          spot.staged_at || new Date().toISOString(),
        ]
      );
    } catch (err) {
      console.warn('Local Postgres write error:', err.message);
    }
  }

  // Also sync to Neon Cloud DB
  if (neonPool) {
    try {
      await neonPool.query(
        `INSERT INTO public.tourist_spots (
          id, name, category_id, barangay, latitude, longitude, address,
          description, image_url, is_pseudo_image, pseudo_theme,
          primary_pano_id, target_heading, target_pitch, sync_status,
          staged_at, synced_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'synced_cloud', NOW(), NOW(), NOW())
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
          updated_at = NOW()`,
        [
          id,
          spot.name,
          categoryId,
          spot.barangay || 'Poblacion',
          lat,
          lng,
          spot.location?.address || '',
          spot.description || '',
          spot.image || null,
          spot.isPseudoImage ?? !spot.image,
          spot.pseudoTheme || 'indigo',
          spot.connected360?.targetId || null,
          parseFloat(spot.connected360?.heading) || 0,
          parseFloat(spot.connected360?.pitch) || 0,
        ]
      );
    } catch (err) {
      console.warn('Neon write error:', err.message);
    }
  }

  // Also update local JSON file
  const spots = readLocalSpots();
  const existingIdx = spots.findIndex((s) => s.id === id);
  const fullSpot = {
    ...spot,
    id,
    location: { lat, lng, address: spot.location.address || '' },
  };

  if (existingIdx >= 0) {
    spots[existingIdx] = fullSpot;
  } else {
    spots.unshift(fullSpot);
  }
  writeLocalSpots(spots);

  res.status(201).json(fullSpot);
});

/**
 * PATCH /api/tourist-spots/:id/location - Update spot coordinates
 */
app.patch('/api/tourist-spots/:id/location', async (req, res) => {
  const { id } = req.params;
  const { lat, lng } = req.body;
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (isNaN(parsedLat) || isNaN(parsedLng)) {
    return res.status(400).json({ error: 'Valid lat and lng required' });
  }

  // Update in Neon Cloud DB
  if (neonPool) {
    try {
      await neonPool.query(
        'UPDATE public.tourist_spots SET latitude = $1, longitude = $2, updated_at = NOW() WHERE id = $3',
        [parsedLat, parsedLng, id]
      );
    } catch (err) {
      console.warn('Neon location update error:', err.message);
    }
  }

  // Update in Local PostgreSQL
  if (isPgConnected && pgPool) {
    try {
      await pgPool.query(
        'UPDATE public.tourist_spots SET latitude = $1, longitude = $2, updated_at = NOW() WHERE id = $3',
        [parsedLat, parsedLng, id]
      );
    } catch (err) {
      console.warn('Local Postgres location update error:', err.message);
    }
  }

  // Update in tourist_spots.json on disk
  const spots = readLocalSpots();
  const spot = spots.find((s) => s.id === id);
  if (spot) {
    spot.location = spot.location || {};
    spot.location.lat = parsedLat;
    spot.location.lng = parsedLng;
    spot.lat = parsedLat;
    spot.lng = parsedLng;
    writeLocalSpots(spots);
  }

  res.json({ success: true, id, lat: parsedLat, lng: parsedLng });
});

/**
 * DELETE /api/tourist-spots/:id - Delete a tourist spot
 */
app.delete('/api/tourist-spots/:id', async (req, res) => {
  const { id } = req.params;

  // Delete from Neon Cloud DB
  if (neonPool) {
    try {
      await neonPool.query('DELETE FROM public.tourist_spots WHERE id = $1', [id]);
    } catch (err) {
      console.warn('Neon delete error:', err.message);
    }
  }

  if (isPgConnected && pgPool) {
    try {
      await pgPool.query('DELETE FROM public.tourist_spots WHERE id = $1', [id]);
    } catch (err) {
      console.warn('Local Postgres delete error:', err.message);
    }
  }

  const spots = readLocalSpots().filter((s) => s.id !== id);
  writeLocalSpots(spots);
  res.json({ success: true, id });
});

/**
 * GET /api/panoramas - List all panoramas
 */
app.get('/api/panoramas', (req, res) => {
  const data = readMetadata();
  res.json(data);
});

/**
 * GET /api/panoramas/:id - Get a single panorama
 */
app.get('/api/panoramas/:id', (req, res) => {
  const data = readMetadata();
  const pano = data.panoramas.find((p) => p.id === req.params.id);
  if (!pano) return res.status(404).json({ error: 'Panorama not found' });
  res.json(pano);
});

/**
 * POST /api/panoramas - Upload a new panorama image
 */
app.post('/api/panoramas', upload.single('panorama'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { lat, lng, heading, label, description } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const filename = req.file.filename;
    const panoId = path.basename(filename, path.extname(filename));

    console.log(`\n📷 Uploading panorama: ${filename}`);
    console.log(`  📍 Location: ${lat}, ${lng}`);

    // Optimize full 360 panorama for WebGL (max 4096x2048) if raw image is oversized
    try {
      const sharp = require('sharp');
      const meta = await sharp(req.file.path).metadata();
      if (meta.width > 4096 || meta.height > 2048) {
        const tmpOpt = req.file.path + '.opt.jpg';
        await sharp(req.file.path)
          .resize(4096, 2048, { fit: 'inside' })
          .jpeg({ quality: 90 })
          .toFile(tmpOpt);
        fs.renameSync(tmpOpt, req.file.path);
        console.log(`  ✓ Optimized 360 panorama for WebGL: 4096x2048`);
      }
    } catch (optErr) {
      console.warn('  ⚠ Could not optimize panorama resolution:', optErr.message);
    }

    // Generate thumbnail
    const thumbFilename = await generateThumbnail(req.file.path, panoId);

    // Create panorama entry
    const newPano = {
      id: panoId,
      filename: filename,
      thumbnail: thumbFilename ? `thumbnails/${thumbFilename}` : null,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      heading: parseFloat(heading) || 0,
      label: label || '',
      description: description || '',
      timestamp: new Date().toISOString(),
      neighbors: [],
    };

    // Update metadata
    const data = readMetadata();
    data.panoramas.push(newPano);
    data.panoramas = autoLinkNeighbors(data.panoramas);
    writeMetadata(data);

    // If local PostgreSQL is active, record in public.panoramas
    if (isPgConnected && pgPool) {
      try {
        await pgPool.query(
          `INSERT INTO public.panoramas (
            id, source_type, filename, thumbnail_url, latitude, longitude,
            compass_heading, label, description, captured_at
          ) VALUES ($1, 'local', $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (id) DO NOTHING`,
          [
            panoId,
            filename,
            newPano.thumbnail,
            newPano.lat,
            newPano.lng,
            newPano.heading,
            newPano.label,
            newPano.description,
          ]
        );
      } catch (dbErr) {
        console.warn('Could not mirror pano to local Postgres:', dbErr.message);
      }
    }

    res.status(201).json(newPano);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/panoramas/:id - Delete a panorama
 */
app.delete('/api/panoramas/:id', async (req, res) => {
  const data = readMetadata();
  const index = data.panoramas.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Panorama not found' });

  const pano = data.panoramas[index];

  const imagePath = path.join(PANORAMAS_DIR, pano.filename);
  if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

  if (pano.thumbnail) {
    const thumbPath = path.join(PANORAMAS_DIR, pano.thumbnail);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }

  data.panoramas.splice(index, 1);
  data.panoramas = autoLinkNeighbors(data.panoramas);
  writeMetadata(data);

  if (isPgConnected && pgPool) {
    try {
      await pgPool.query('DELETE FROM public.panoramas WHERE id = $1', [req.params.id]);
    } catch (e) {
      // ignore
    }
  }

  res.json({ success: true });
});

/**
 * PUT /api/panoramas/:id - Update a panorama's metadata
 */
app.put('/api/panoramas/:id', async (req, res) => {
  const data = readMetadata();
  const index = data.panoramas.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Panorama not found' });

  const updates = req.body;
  data.panoramas[index] = { ...data.panoramas[index], ...updates };

  if (updates.lat || updates.lng) {
    data.panoramas = autoLinkNeighbors(data.panoramas);
  }

  writeMetadata(data);

  if (isPgConnected && pgPool) {
    try {
      await pgPool.query(
        'UPDATE public.panoramas SET description = $1, label = $2 WHERE id = $3',
        [updates.description || '', updates.label || '', req.params.id]
      );
    } catch (e) {
      // ignore
    }
  }

  res.json(data.panoramas[index]);
});

// ============ Aligned Streetview Sequences API ============
const ALIGNED_SEQS_FILE = path.join(__dirname, 'data', 'aligned_sequences.json');

function readAlignedSequences() {
  try {
    if (!fs.existsSync(ALIGNED_SEQS_FILE)) {
      const dataDir = path.dirname(ALIGNED_SEQS_FILE);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(ALIGNED_SEQS_FILE, JSON.stringify({}), 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(ALIGNED_SEQS_FILE, 'utf8'));
  } catch (err) {
    console.warn('Error reading aligned sequences:', err.message);
    return {};
  }
}

function writeAlignedSequences(data) {
  try {
    const dataDir = path.dirname(ALIGNED_SEQS_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(ALIGNED_SEQS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing aligned sequences:', err.message);
  }
}

/**
 * GET /api/aligned-sequences - Get all aligned streetview sequences
 */
app.get('/api/aligned-sequences', (req, res) => {
  res.json(readAlignedSequences());
});

/**
 * POST /api/aligned-sequences - Save or update an aligned streetview sequence
 */
app.post('/api/aligned-sequences', (req, res) => {
  const record = req.body;
  if (!record || !record.sequenceId) {
    return res.status(400).json({ error: 'Missing sequenceId in payload' });
  }

  const all = readAlignedSequences();
  all[record.sequenceId] = record;
  writeAlignedSequences(all);

  res.json({ success: true, record });
});

/**
 * DELETE /api/aligned-sequences/:id - Remove an aligned sequence (revert to raw GPS)
 */
app.delete('/api/aligned-sequences/:id', (req, res) => {
  const all = readAlignedSequences();
  delete all[req.params.id];
  writeAlignedSequences(all);

  res.json({ success: true });
});

// ============ Start Server ============
async function startServer() {
  if (pgPool) {
    try {
      await pgPool.query('SELECT NOW()');
      isPgConnected = true;
    } catch (err) {
      isPgConnected = false;
      console.warn(`  ℹ Local PostgreSQL not reachable: ${err.message}`);
    }
  }

  app.listen(PORT, () => {
    const data = readMetadata();
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   🌐 Lagangilang 360° Street View & Trail Server         ║
║──────────────────────────────────────────────────────────║
║   Port:          ${String(PORT).padEnd(40)}║
║   Panoramas:     ${String(data.panoramas.length).padEnd(40)}║
║   Local Postgres:${String(isPgConnected ? ' CONNECTED (localhost:5432)' : ' BUFFER (JSON Fallback)').padEnd(40)}║
╚══════════════════════════════════════════════════════════╝
    `);
    if (isPgConnected) {
      console.log('  ✓ Connected to Local PostgreSQL (pgAdmin 4: lagangilang_db)\n');
    } else {
      console.log('  ℹ Local PostgreSQL not reachable. Using local JSON buffer.\n');
    }
  });
}

startServer();
