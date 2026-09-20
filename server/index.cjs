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

// Middleware
app.use(cors());
app.use(express.json());

// Serve panorama images statically
app.use('/panoramas', express.static(PANORAMAS_DIR));

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
 * Auto-link neighbors based on a chronological linear sequence.
 */
function autoLinkNeighbors(panoramas, maxDistance = 500) {
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

  return panoramas.map((pano) => {
    const index = sorted.findIndex((p) => p.id === pano.id);
    const neighbors = [];

    if (index > 0) {
      const prev = sorted[index - 1];
      if (haversine(pano.lat, pano.lng, prev.lat, prev.lng) <= maxDistance) {
        neighbors.push(prev.id);
      }
    }

    if (index < sorted.length - 1) {
      const next = sorted[index + 1];
      if (haversine(pano.lat, pano.lng, next.lat, next.lng) <= maxDistance) {
        neighbors.push(next.id);
      }
    }

    return { ...pano, neighbors };
  });
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
        category: row.category_id || 'General',
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

  if (isPgConnected && pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO public.tourist_spots (
          id, name, barangay, latitude, longitude, address,
          description, image_url, is_pseudo_image, pseudo_theme,
          primary_pano_id, target_heading, target_pitch, sync_status,
          staged_at, synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
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
 * DELETE /api/tourist-spots/:id - Delete a tourist spot
 */
app.delete('/api/tourist-spots/:id', async (req, res) => {
  const { id } = req.params;

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
