// Local preview only (not committed): serve this build on :5300 and forward
// /api to the backend already running on :8010, presenting the origin that
// backend allows. The browser sees one origin, so no CORS is involved.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5300,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8010',
        changeOrigin: true,
        headers: { origin: 'http://localhost:5181' },
      },
    },
  },
});
