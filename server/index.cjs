const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Paths
const PANORAMAS_DIR = path.join(__dirname, '..', 'public', 'panoramas');
const THUMBNAILS_DIR = path.join(PANORAMAS_DIR, 'thumbnails');
const METADATA_FILE = path.join(PANORAMAS_DIR, 'metadata.json');

// Ensure directories exist
if (!fs.existsSync(PANORAMAS_DIR)) fs.mkdirSync(PANORAMAS_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

// Ensure metadata file exists
if (!fs.existsSync(METADATA_FILE)) {
  fs.writeFileSync(METADATA_FILE, JSON.stringify({ panoramas: [] }, null, 2));
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

/**
 * Auto-link neighbors based on proximity.
 * Ensures bidirectional linking and wider search radius.
 */
function autoLinkNeighbors(panoramas, maxDistance = 200, maxNeighbors = 8) {
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

  // Calculate nearest neighbors for each panorama
  let linkedPanoramas = panoramas.map((pano) => {
    const nearby = panoramas
      .filter((p) => p.id !== pano.id)
      .map((p) => ({ id: p.id, dist: haversine(pano.lat, pano.lng, p.lat, p.lng) }))
      .filter((p) => p.dist <= maxDistance)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, maxNeighbors)
      .map((p) => p.id);

    return { ...pano, neighbors: nearby };
  });

  // Ensure bidirectional links (if A is a neighbor of B, B must be a neighbor of A)
  linkedPanoramas.forEach((pano) => {
    pano.neighbors.forEach((neighborId) => {
      const neighbor = linkedPanoramas.find((p) => p.id === neighborId);
      if (neighbor && !neighbor.neighbors.includes(pano.id)) {
        neighbor.neighbors.push(pano.id);
      }
    });
  });

  return linkedPanoramas;
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
    console.warn(`  ⚠ Thumbnail generation failed (sharp may not be installed):`, err.message);
    return null;
  }
}

// ============ API Routes ============

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
 * GET /api/panoramas/nearby?lat=...&lng=...&radius=...
 * Find the closest panorama to a given coordinate.
 */
app.get('/api/panoramas/nearby', (req, res) => {
  const { lat, lng, radius = 200 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const data = readMetadata();
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

  const nearby = data.panoramas
    .map((p) => ({
      ...p,
      distance: haversine(parseFloat(lat), parseFloat(lng), p.lat, p.lng),
    }))
    .filter((p) => p.distance <= parseFloat(radius))
    .sort((a, b) => a.distance - b.distance);

  res.json(nearby);
});

/**
 * POST /api/panoramas - Upload a new panorama image
 * Expects multipart form: panorama (file), lat, lng, heading, label
 */
app.post('/api/panoramas', upload.single('panorama'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { lat, lng, heading, label } = req.body;
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
      timestamp: new Date().toISOString(),
      neighbors: [],
    };

    // Update metadata
    const data = readMetadata();
    data.panoramas.push(newPano);

    // Auto-link all neighbors
    data.panoramas = autoLinkNeighbors(data.panoramas);

    writeMetadata(data);

    console.log(`  ✓ Panorama saved with ID: ${panoId}`);
    console.log(`  🔗 Neighbors: ${newPano.neighbors?.length || 0} linked`);

    res.status(201).json(newPano);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/panoramas/:id - Delete a panorama
 */
app.delete('/api/panoramas/:id', (req, res) => {
  const data = readMetadata();
  const index = data.panoramas.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Panorama not found' });

  const pano = data.panoramas[index];

  // Delete image file
  const imagePath = path.join(PANORAMAS_DIR, pano.filename);
  if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

  // Delete thumbnail
  if (pano.thumbnail) {
    const thumbPath = path.join(PANORAMAS_DIR, pano.thumbnail);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  }

  // Remove from metadata
  data.panoramas.splice(index, 1);

  // Re-link neighbors
  data.panoramas = autoLinkNeighbors(data.panoramas);
  writeMetadata(data);

  res.json({ success: true });
});

/**
 * PUT /api/panoramas/:id - Update a panorama's metadata
 */
app.put('/api/panoramas/:id', (req, res) => {
  const data = readMetadata();
  const index = data.panoramas.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Panorama not found' });

  const updates = req.body;
  data.panoramas[index] = { ...data.panoramas[index], ...updates };

  // Re-link neighbors if position changed
  if (updates.lat || updates.lng) {
    data.panoramas = autoLinkNeighbors(data.panoramas);
  }

  writeMetadata(data);
  res.json(data.panoramas[index]);
});

// ============ Start Server ============
app.listen(PORT, () => {
  const data = readMetadata();
  console.log(`
╔══════════════════════════════════════════════╗
║   🌐 360° Street View API Server            ║
║──────────────────────────────────────────────║
║   Port:       ${PORT}                           ║
║   Panoramas:  ${String(data.panoramas.length).padEnd(30)}║
║   Storage:    public/panoramas/              ║
╚══════════════════════════════════════════════╝
  `);
});
