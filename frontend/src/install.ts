// Installing Glance as its own app window — issue #160.
//
// Chromium browsers offer installation through a `beforeinstallprompt` event,
// which can fire before React has mounted. It is caught here, at module load,
// and kept until the student asks to install from Settings. Browsers that never
// fire it (Safari, Firefox) get plain instructions instead of a dead button.
//
// The service worker is registered here too. It keeps only the app's own static
// files: never a request to /api, never anything a student captured, said or
// wrote. See frontend/sw.js.

/** The parts of Chromium's BeforeInstallPromptEvent this file uses. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  /** Already running as an installed app window. */
  | 'installed'
  /** The browser has offered installation; a real Install button can be shown. */
  | 'available'
  /** No offer from this browser (yet). Show how to do it by hand. */
  | 'unavailable';

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function runningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const media = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  // iOS Safari reports a Home Screen web app this way instead.
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return media || ios;
}

export function installState(): InstallState {
  if (justInstalled || runningStandalone()) return 'installed';
  return deferred ? 'available' : 'unavailable';
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Show the browser's own install prompt. Resolves to what the student chose. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred;
  if (!event) return 'unavailable';
  // The event can be used once only.
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser from showing its own banner at a moment the student did
    // not choose; they install from Settings when they want to.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    justInstalled = true;
    notify();
  });
}

/** Register the service worker in production builds.
 *
 *  Not in development: Vite serves modules on the fly there, and a worker in
 *  the way would only make local work and the test suite harder to reason
 *  about. tests/e2e/install.spec.ts registers it explicitly to test it.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Glance works the same without it; only installing needs it.
    });
  });
}
