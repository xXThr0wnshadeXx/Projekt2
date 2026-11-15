import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function openWork(page: Page, latex: string) {
  await page.addInitScript((line) => {
    window.localStorage.setItem('glance.work.v1', JSON.stringify([
      { id: 'W1', latex: line, readback: 'a over b', valid: true },
    ]));
  }, latex);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await page.getByRole('button', { name: 'Start working' }).click();
}

test('downloads a numbered LaTeX document and SRE Nemeth for saved work', async ({ page }) => {
  const fraction = String.raw`\frac{a}{b}`;
  await openWork(page, fraction);
  const exports = page.getByRole('region', { name: 'Export your work' });

  const texEvent = page.waitForEvent('download');
  await exports.getByRole('button', { name: 'Download LaTeX (.tex)' }).click();
  const tex = await texEvent;
  expect(tex.suggestedFilename()).toBe('glance-work.tex');
  expect(await readFile((await tex.path())!, 'utf8')).toContain(
    ['\\begin{equation}', fraction, '\\end{equation}'].join('\n'),
  );

  await exports.getByRole('button', { name: 'Show Nemeth braille' }).click();
  await expect(exports.getByRole('heading', { name: 'Nemeth braille' })).toBeFocused();
  await expect(exports.getByRole('listitem')).toHaveText('⠹⠁⠌⠃⠼');
  const brailleEvent = page.waitForEvent('download');
  await exports.getByRole('button', { name: 'Download Nemeth (.txt)' }).click();
  const braille = await brailleEvent;
  expect(braille.suggestedFilename()).toBe('glance-nemeth.txt');
  expect(await readFile((await braille.path())!, 'utf8')).toBe('⠹⠁⠌⠃⠼\n');
});

test('does not export commands outside supported LaTeX math', async ({ page }) => {
  await openWork(page, '\\input{private}');
  await page.getByRole('button', { name: 'Download LaTeX (.tex)' }).click();
  await expect(page.getByTestId('live-assertive')).toHaveText(
    'Line 1 contains LaTeX that cannot be exported.',
  );
});
