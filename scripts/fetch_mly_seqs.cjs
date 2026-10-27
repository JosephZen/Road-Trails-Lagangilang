const ACCESS_TOKEN = 'MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9';

async function inspectPQv() {
  const url = `https://graph.mapillary.com/images?sequence_ids=PQvElJ06hLpmqZbVuDt4Ta&access_token=${ACCESS_TOKEN}&fields=id,geometry,compass_angle,captured_at&limit=2000`;
  const res = await fetch(url);
  const data = await res.json();
  const imgs = data.data || [];
  imgs.sort((a,b) => a.captured_at - b.captured_at);
  console.log(`PQvElJ06hLpmqZbVuDt4Ta has ${imgs.length} images`);
  console.log('Start image:', imgs[0].geometry.coordinates);
  console.log('Mid image:', imgs[Math.floor(imgs.length/2)].geometry.coordinates);
  console.log('End image:', imgs[imgs.length - 1].geometry.coordinates);
}

inspectPQv().catch(console.error);
