import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// Default '/' for Vercel. For GitHub Pages: VITE_BASE=/3-D-US-Map/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
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
