// Whether this browser has already been welcomed (issue #200).
//
// A cookie rather than localStorage: "start over" and clearing work wipe
// localStorage, and the welcome is a one-time introduction, not part of the
// work. The cookie is first-party and never sent to the API (a different
// host). Wrapped in try/catch: a browser that blocks cookies just sees the
// welcome again, which is harmless.

const NAME = 'glance_welcomed';

export function hasBeenWelcomed(): boolean {
  try {
    return document.cookie.split(';').some((c) => c.trim() === `${NAME}=1`);
  } catch {
    return false;
  }
}

export function markWelcomed(): void {
  try {
    document.cookie = `${NAME}=1; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
  } catch {
    // Nothing to do: the welcome will simply show again next time.
  }
}

/** Shown on the welcome screen, so a screen reader reads it on arrival. */
export const WELCOME_TEXT =
  'Welcome to Glance. Press any key to start, and I will read everything aloud. If you use a screen reader, press Escape and I will stay quiet.';

/** Spoken once speech is on. Home's own introduction follows it. */
export const WELCOME_SPOKEN = "Hi, I'm Glance. Reading aloud is on.";
