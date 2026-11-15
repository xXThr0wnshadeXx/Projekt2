// Installing Glance as its own app window — issue #160.
//
// The manifest and its icons must be served, the Install button must exist
// only when the browser has offered installing, and the service worker must
// never answer or keep a request to /api.

import { test, expect, type Page } from '@playwright/test';

const polite = (page: Page) => page.getByTestId('live-polite');

test.describe('@smoke installing Glance', () => {
  test('the manifest opens in its own window and every icon is served', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const response = await request.get(href!);
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');

    // Chromium wants a 192 and a 512 raster icon; iOS uses the touch icon.
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    for (const src of [...manifest.icons.map((icon: { src: string }) => icon.src), touch]) {
      const image = await request.get(src);
      expect(image.ok(), src).toBe(true);
      expect(image.headers()['content-type'], src).toMatch(/^image\//);
    }
  });

  test('with no offer from the browser, it says how instead of showing a dead button', async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('beforeinstallprompt', (event) => event.stopImmediatePropagation());
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Install Glance' })).toHaveCount(0);
    await expect(page.getByTestId('install-status')).toContainText('Install app option');
    await expect(page.getByTestId('install-status')).toContainText('Add to Home Screen');
  });

  test('when the browser offers it, Install is a real button that asks the browser', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('install-status')).toBeVisible();

    // What Chromium sends when the page can be installed.
    await page.evaluate(() => {
      const w = window as unknown as { prompted: boolean };
      w.prompted = false;
      const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {
          w.prompted = true;
        },
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      });
      window.dispatchEvent(offer);
    });

    const install = page.getByRole('button', { name: 'Install Glance' });
    await install.focus();
    await page.keyboard.press('Enter');
    await expect(polite(page)).toHaveText('Glance is being installed. It will open in its own window.');
    expect(await page.evaluate(() => (window as unknown as { prompted: boolean }).prompted)).toBe(true);

    // The offer can be used once; the button does not stay behind doing nothing.
    await expect(install).toHaveCount(0);
  });
});

test.describe('@smoke the service worker', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Service workers are exercised in Chromium.');
  // The suite blocks service workers (playwright.config.ts); this test is about one.
  test.use({ serviceWorkers: 'allow' });

  test('never answers or keeps a request to /api', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    // If the worker answered /api requests itself, this stub would never be
    // reached: the request would go to the dev server instead.
    await page.route('**/api/ping', (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'reached the network' }),
    );
    expect(
      await page.evaluate(() =>
        fetch('/api/ping', { method: 'POST', body: 'student work' }).then((r) => r.text()),
      ),
    ).toBe('reached the network');
    expect(await page.evaluate(() => fetch('/api/ping').then((r) => r.text()))).toBe(
      'reached the network',
    );

    const cached = await page.evaluate(async () => {
      const paths: string[] = [];
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) paths.push(new URL(request.url).pathname);
      }
      return paths;
    });
    expect(cached).toContain('/');
    expect(cached.filter((path) => path.startsWith('/api'))).toEqual([]);
  });
});
