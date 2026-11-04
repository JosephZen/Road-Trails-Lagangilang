export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  const z = url.searchParams.get('z');
  const x = url.searchParams.get('x');
  const y = url.searchParams.get('y');

  if (!z || !x || !y) {
    return new Response('Missing z, x, or y tile coordinate', { status: 400 });
  }

  // Esri World Street Map tile URL (uses z/y/x convention)
  const esriTileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;

  try {
    const tileRes = await fetch(esriTileUrl, {
      headers: {
        'User-Agent': 'LagangilangTourismApp/1.0',
        Accept: 'image/png,image/jpeg,image/*,*/*',
      },
    });

    if (!tileRes.ok) {
      return new Response('Tile fetch failed', { status: tileRes.status });
    }

    const contentType = tileRes.headers.get('content-type') || 'image/png';
    const tileBuffer = await tileRes.arrayBuffer();

    return new Response(tileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response('Error proxying tile: ' + err.message, { status: 502 });
  }
}
