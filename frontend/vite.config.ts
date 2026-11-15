import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Static files in public/ that the installed app needs on every open.
const PUBLIC_SHELL = [
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

/** Writes sw.js from the template in frontend/sw.js — issue #160.
 *
 *  Each build gets its own VERSION, so a redeploy is a changed worker and
 *  installed apps pick it up, and the precache list is the exact set of
 *  hashed files this build produced. Only those files are ever cached.
 */
function serviceWorker(): Plugin {
  const template = () =>
    readFileSync(fileURLToPath(new URL('./sw.js', import.meta.url)), 'utf8');
  const render = (version: string, files: string[]) =>
    template()
      .replace('__GLANCE_VERSION__', version)
      .replace('__GLANCE_PRECACHE__', JSON.stringify(files));

  return {
    name: 'glance-service-worker',
    configureServer(server) {
      // Served in development only so tests can register it explicitly; the
      // app itself registers it in production builds only.
      server.middlewares.use('/sw.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(render('dev', PUBLIC_SHELL));
      });
    },
    generateBundle(_options, bundle) {
      const built = Object.values(bundle)
        .map((file) => `/${file.fileName}`)
        .filter((path) => path.startsWith('/assets/'));
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: render(new Date().toISOString(), [...PUBLIC_SHELL, ...built]),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { port: 5173 },
});
