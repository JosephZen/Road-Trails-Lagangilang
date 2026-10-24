const localtunnel = require('localtunnel');

let activeTunnel = null;

async function start() {
  try {
    const tunnel = await localtunnel({ port: 5173, subdomain: 'lagangilang-tourist-map' });
    activeTunnel = tunnel;
    console.log('Tunnel live at:', tunnel.url);

    tunnel.on('close', () => {
      console.log('Tunnel closed. Reconnecting in 3s...');
      setTimeout(start, 3000);
    });

    tunnel.on('error', (err) => {
      console.warn('Tunnel error:', err.message);
      try { tunnel.close(); } catch (_) {}
      setTimeout(start, 3000);
    });
  } catch (err) {
    console.warn('Failed to start tunnel, retrying in 4s...', err.message);
    setTimeout(start, 4000);
  }
}

start();
