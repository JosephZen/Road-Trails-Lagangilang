const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generate() {
  const artifactDir = 'C:/Users/Joseph Zen/.gemini/antigravity/brain/a577dff6-94d1-4dbf-9e39-4dfc622846e3';
  const publicDir = './public/assets';

  const sourceImagePath = path.join(publicDir, 'road_trail_360_v2.jpg');
  if (!fs.existsSync(sourceImagePath)) {
    throw new Error('Source image road_trail_360_v2.jpg not found');
  }

  // Load the raw image
  const { data, info } = await sharp(sourceImagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  // Clone buffer to clean top text (y < 115) and bottom text (y > 875)
  // Replacing top and bottom text areas with pure white
  const cleanedBuffer = Buffer.from(data);

  function setWhite(x, y) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = (y * width + x) * info.channels;
      cleanedBuffer[idx] = 255;
      cleanedBuffer[idx + 1] = 255;
      cleanedBuffer[idx + 2] = 255;
    }
  }

  // Clear top margin where old text was: y from 52 to 118, between outer borders
  for (let y = 52; y <= 118; y++) {
    for (let x = 60; x <= 964; x++) {
      setWhite(x, y);
    }
  }

  // Clear bottom margin where old text was: y from 875 to 975, between outer borders
  for (let y = 875; y <= 975; y++) {
    for (let x = 60; x <= 964; x++) {
      setWhite(x, y);
    }
  }

  // Convert cleaned artwork buffer to JPEG base64 for embedding inside SVG
  const cleanedJpegBuffer = await sharp(cleanedBuffer, {
    raw: {
      width,
      height,
      channels: info.channels,
    },
  })
    .jpeg({ quality: 96 })
    .toBuffer();

  const base64Artwork = cleanedJpegBuffer.toString('base64');

  // Build the complete SVG with:
  // 1. Embedded high-res artwork of the exact AI render background and camera
  // 2. Crisp vector typography: "360" on top, "Road & Trail" on bottom
  // 3. Crisp outer squircle outline border
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Drop shadow for the outer squircle box -->
    <filter id="box-shadow" x="-8%" y="-8%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000000" flood-opacity="0.25" />
    </filter>

    <!-- Clip path matching the squircle boundary -->
    <clipPath id="squircle-clip">
      <rect x="52" y="52" width="920" height="920" rx="150" ry="150" />
    </clipPath>
  </defs>

  <!-- Base White Canvas with subtle drop shadow -->
  <rect x="52" y="52" width="920" height="920" rx="150" ry="150" fill="#ffffff" filter="url(#box-shadow)" />

  <!-- Embedded High-Resolution Approved Artwork (Clipped to Squircle) -->
  <g clip-path="url(#squircle-clip)">
    <image href="data:image/jpeg;base64,${base64Artwork}" x="0" y="0" width="1024" height="1024" />
    
    <!-- Top White Margin Banner for Crisp Typography -->
    <rect x="52" y="52" width="920" height="70" fill="#ffffff" />
    
    <!-- Bottom White Margin Banner for Crisp Typography -->
    <rect x="52" y="870" width="920" height="102" fill="#ffffff" />

    <!-- ==================== TOP TEXT: "360" ==================== -->
    <text x="512" y="106" font-family="'Inter', 'Montserrat', 'Segoe UI', system-ui, -apple-system, sans-serif" font-size="54" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="6">
      360
    </text>

    <!-- ==================== BOTTOM TEXT: "Road & Trail" ==================== -->
    <text x="512" y="942" font-family="'Inter', 'Montserrat', 'Segoe UI', system-ui, -apple-system, sans-serif" font-size="48" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="3">
      Road &amp; Trail
    </text>
  </g>

  <!-- ==================== OUTER BLACK OUTLINE SQUIRCLE ==================== -->
  <rect x="52" y="52" width="920" height="920" rx="150" ry="150" fill="none" stroke="#0f172a" stroke-width="22" stroke-linejoin="round" />
</svg>`;

  // 1. Save SVG files
  const svgPathArtifact = path.join(artifactDir, 'road_trail_360_logo.svg');
  const svgPathPublic = path.join(publicDir, 'road_trail_360_logo.svg');
  fs.writeFileSync(svgPathArtifact, svg, 'utf8');
  fs.writeFileSync(svgPathPublic, svg, 'utf8');
  console.log('Saved SVG to:', svgPathArtifact, 'and', svgPathPublic);

  // 2. Generate High-Res PNG (1024x1024)
  const pngPathArtifact = path.join(artifactDir, 'road_trail_360_logo.png');
  const pngPathPublic = path.join(publicDir, 'road_trail_360_logo.png');

  await sharp(Buffer.from(svg))
    .resize(1024, 1024)
    .png({ quality: 100 })
    .toFile(pngPathArtifact);

  await sharp(Buffer.from(svg))
    .resize(1024, 1024)
    .png({ quality: 100 })
    .toFile(pngPathPublic);

  console.log('Generated 1024x1024 PNG to:', pngPathArtifact, 'and', pngPathPublic);

  // 3. Generate 512x512 app icon
  const icon512Public = path.join(publicDir, 'icon-512.png');
  await sharp(Buffer.from(svg))
    .resize(512, 512)
    .png({ quality: 100 })
    .toFile(icon512Public);

  console.log('Generated 512x512 Icon to:', icon512Public);
}

generate().catch(console.error);
