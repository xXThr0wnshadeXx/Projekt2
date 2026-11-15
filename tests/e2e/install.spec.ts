// Installing Glance as its own app window — issue #160.
//
// The manifest and icons must be served, the Install button must exist only
// when the browser has offered installing, and the service worker must never
// touch a request to /api.

import { test, expect, type Page } from '@playwright/test';

const polite = (page: Page) => page.getByTestId('live-polite');

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeFocused();
}

test.describe('@smoke installing Glance', () => {
  test('the page links a manifest that opens in its own window, with its icons', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');

    const response = await request.get(href!);
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.short_name).toBe('Glance');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    for (const icon of manifest.icons as { src: string }[]) {
      const image = await request.get(icon.src);
      expect(image.ok(), icon.src).toBe(true);
      expect(image.headers()['content-type']).toContain('image/png');
    }
  });

  test('with no offer from the browser, Settings says how instead of showing a dead button', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByRole('heading', { name: 'Use Glance as an app' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Install Glance' })).toHaveCount(0);
    await expect(page.getByTestId('install-status')).toContainText('Add to Home Screen');
    await expect(page.getByTestId('install-status')).toContainText('works the same in a browser tab');
  });

  test('when the browser offers it, Install is a real button that asks the browser', async ({ page }) => {
    await openSettings(page);

    // What Chromium sends when the page can be installed.
    await page.evaluate(() => {
      const offer = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      };
      (window as unknown as { prompted: boolean }).prompted = false;
      offer.prompt = async () => {
        (window as unknown as { prompted: boolean }).prompted = true;
      };
      offer.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(offer);
    });

    const install = page.getByRole('button', { name: 'Install Glance' });
    await expect(install).toBeVisible();
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

  test('keeps only the app shell and lets every /api request through untouched', async ({ page }) => {
    await page.goto('/');
    // The app registers it in production builds only, so register it here.
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    // If the worker answered /api requests itself, this stub would never be
    // reached and the request would go to the dev server instead.
    await page.route('**/api/ping', (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'reached the network' }),
    );
    const body = await page.evaluate(() =>
      fetch('/api/ping', { method: 'POST', body: 'student work' }).then((r) => r.text()),
    );
    expect(body).toBe('reached the network');
    const got = await page.evaluate(() => fetch('/api/ping').then((r) => r.text()));
    expect(got).toBe('reached the network');

    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
      }
      return urls;
    });
    expect(cached).toContain('/index.html');
    expect(cached.filter((path) => path.startsWith('/api'))).toEqual([]);
  });
});
