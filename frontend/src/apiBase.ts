// Where the back end is, decided once from the build environment (issue #135).
//
// Kept apart from api.ts, with no import.meta, so the tests can call it with
// any environment and check the wording without a production build.

/** Said wherever a request would have gone, on a build with no server. */
export const UNCONNECTED_MESSAGE = 'This site has not been connected to a server yet.';

export const DEV_API_BASE = 'http://localhost:8000';

/**
 * The back-end address, or null when this build has none.
 *
 * Development falls back to the local server. A production build does not:
 * VITE_API_BASE is inlined at build time, and on a deployed site
 * "localhost" means the visitor's own machine. Falling back there made the
 * live site say "nothing answered at the server address" to everyone, and
 * "the server is not accepting requests from this site" to anyone who
 * happened to have something on port 8000 — neither of which was true.
 */
export function resolveApiBase(env: { PROD: boolean; VITE_API_BASE?: string }): string | null {
  const configured = env.VITE_API_BASE?.trim();
  // The multi-service Vercel deployment rewrites /api/* to FastAPI. An empty
  // base keeps requests at this deployment's origin, regardless of its domain.
  if (configured === '/') return '';
  if (configured) return configured.replace(/\/+$/, '');
  return env.PROD ? null : DEV_API_BASE;
}
