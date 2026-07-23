import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// Vercel / most hosts: '/'
// GitHub Pages project site: set VITE_BASE=/3-D-US-Map/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [cesium()],
  server: {
    port: 5173,
    open: true,
  },
});
