import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { queryOverpass } from './overpass-proxy.mjs';

function overpassDevProxy() {
  const handle = async (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/overpass')) {
      next();
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'POST only' }));
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const query = Buffer.concat(chunks).toString('utf8').trim();

    try {
      const data = await queryOverpass(query);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    } catch (err) {
      res.statusCode = 504;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err && err.message ? err.message : 'Overpass unavailable' }));
    }
  };

  return {
    name: 'overpass-dev-proxy',
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

// Default '/' for Vercel. For GitHub Pages: VITE_BASE=/3-D-US-Map/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    overpassDevProxy(),
    cesium({
      rebuildCesium: true,
    }),
  ],
  build: {
    chunkSizeWarningLimit: 5000,
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: true,
  },
});
