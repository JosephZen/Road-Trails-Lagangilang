const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = 'MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9';
const MAPILLARY_GRAPH_API = 'https://graph.mapillary.com';

function interpolatePath(controlPoints, totalSteps = 100) {
  if (controlPoints.length < 2) return controlPoints;
  const result = [];
  const segSteps = Math.max(2, Math.floor(totalSteps / (controlPoints.length - 1)));

  for (let i = 0; i < controlPoints.length - 1; i++) {
    const p0 = controlPoints[Math.max(0, i - 1)];
    const p1 = controlPoints[i];
    const p2 = controlPoints[i + 1];
    const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)];

    const steps = i === controlPoints.length - 2 ? totalSteps - result.length : segSteps;

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;

      const lng =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);

      const lat =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

      result.push([lng, lat]);
    }
  }

  result.push([...controlPoints[controlPoints.length - 1]]);
  return result;
}

async function run() {
  const filePath = path.join(__dirname, '../server/data/aligned_sequences.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  for (const seqId of Object.keys(data)) {
    try {
      console.log(`Checking sequence ${seqId}...`);
      const url = `${MAPILLARY_GRAPH_API}/images?sequence_ids=${encodeURIComponent(seqId)}&access_token=${ACCESS_TOKEN}&fields=id,geometry,compass_angle,captured_at&limit=2000`;
      const res = await fetch(url);
      if (!res.ok) continue;

      const apiData = await res.json();
      const fullImages = (apiData.data || [])
        .filter((img) => img.geometry?.coordinates)
        .map((img) => ({
          id: String(img.id),
          lng: img.geometry.coordinates[0],
          lat: img.geometry.coordinates[1],
          originalLng: img.geometry.coordinates[0],
          originalLat: img.geometry.coordinates[1],
          capturedAt: img.captured_at,
          heading: img.compass_angle,
        }));

      fullImages.sort((a, b) => a.capturedAt - b.capturedAt);
      console.log(`Sequence ${seqId}: existing ${data[seqId].images?.length || 0} vs full ${fullImages.length}`);

      if (fullImages.length > (data[seqId].images?.length || 0)) {
        // Extend control points if existing ones didn't reach the true start or end
        const existingCps = data[seqId].controlPoints || [];
        const rawCoords = fullImages.map((i) => [i.lng, i.lat]);

        // If existing control points were just a small subset, generate full end-to-end control points
        let cps = existingCps;
        if (existingCps.length < 4 || (data[seqId].images?.length || 0) < fullImages.length * 0.5) {
          const handleCount = Math.max(6, Math.min(14, Math.ceil(rawCoords.length / 8)));
          cps = [];
          const step = (rawCoords.length - 1) / (handleCount - 1);
          for (let i = 0; i < handleCount; i++) {
            const idx = Math.min(rawCoords.length - 1, Math.round(i * step));
            cps.push([...rawCoords[idx]]);
          }
        }

        const coords = interpolatePath(cps, Math.max(50, fullImages.length * 2));
        const mapped = fullImages.map((img, index) => {
          const fraction = fullImages.length > 1 ? index / (fullImages.length - 1) : 0;
          const coordIdx = Math.min(coords.length - 1, Math.round(fraction * (coords.length - 1)));
          const [bentLng, bentLat] = coords[coordIdx];
          return {
            ...img,
            lat: bentLat,
            lng: bentLng,
          };
        });

        data[seqId].images = mapped;
        data[seqId].controlPoints = cps;
        data[seqId].coordinates = coords;
        data[seqId].updatedAt = Date.now();
        console.log(`-> Updated ${seqId} with ${fullImages.length} photos and ${cps.length} handles`);
      }
    } catch (e) {
      console.warn(`Error on ${seqId}:`, e);
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  fs.writeFileSync(path.join(__dirname, '../public/data/aligned_sequences.json'), JSON.stringify(data, null, 2), 'utf8');
  console.log('Saved updated sequences to server/data and public/data!');
}

run();
