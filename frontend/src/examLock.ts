// The exam lock in this browser — issue #189.
//
// Opening an instructor's exam link stores its token here until it expires.
// While it is active, the app is in exam mode whatever Settings say, the
// student cannot switch out of it, and every request to the server carries
// the token so the server enforces the same rule.

const KEY = 'glance.examlock.v1';

export interface ExamLockState {
  token: string;
  /** Unix seconds. */
  expiresAt: number;
}

export function activeLock(now = Date.now()): ExamLockState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const lock = JSON.parse(raw) as ExamLockState;
    if (typeof lock?.token !== 'string' || typeof lock?.expiresAt !== 'number') return null;
    if (lock.expiresAt * 1000 <= now) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return lock;
  } catch {
    return null;
  }
}

export function storeLock(lock: ExamLockState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lock));
  } catch {
    // Storage refused (private window): the lock still holds for this page.
  }
}

export function clearLock(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** "3:00 PM", the way the time is said and shown. */
export function lockTime(lock: ExamLockState): string {
  return new Date(lock.expiresAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
