// Issue #135: a deployed build with no back-end address must not try
// localhost, and must say plainly that it has no server.
//
// The decision is a pure function, so it is checked here for every case
// without a production build. The dev server the suite runs against always
// has PROD false, so the rendered wording cannot be reached from it.

import { test, expect } from '@playwright/test';
import { resolveApiBase, UNCONNECTED_MESSAGE, DEV_API_BASE } from '../../frontend/src/apiBase';

test.describe('API base @smoke', () => {
  test('a production build with no address has no server, not localhost', () => {
    expect(resolveApiBase({ PROD: true })).toBeNull();
    expect(resolveApiBase({ PROD: true, VITE_API_BASE: '' })).toBeNull();
    expect(resolveApiBase({ PROD: true, VITE_API_BASE: '   ' })).toBeNull();
  });

  test('development keeps the local fallback', () => {
    expect(resolveApiBase({ PROD: false })).toBe(DEV_API_BASE);
    expect(DEV_API_BASE).toBe('http://localhost:8000');
  });

  test('a configured address is used without a trailing slash', () => {
    const live = 'https://glance-api.onrender.com';
    expect(resolveApiBase({ PROD: true, VITE_API_BASE: `${live}/` })).toBe(live);
    expect(resolveApiBase({ PROD: false, VITE_API_BASE: live })).toBe(live);
  });

  test('the wording says the site is not connected, not that a server is down', () => {
    expect(UNCONNECTED_MESSAGE).toBe('This site has not been connected to a server yet.');
  });
});
