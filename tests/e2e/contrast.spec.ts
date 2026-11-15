// Contrast is asserted, not eyeballed — issue #12.
//
// DESIGN.md 13 requires AAA in low-vision mode. AAA is 7:1 for body text; every
// pairing here has to clear it, including the dimmed chrome, because a low
// vision user reading a counter at 1.5rem is still reading body text.

import { test, expect } from '@playwright/test';
import {
  LOW_VISION_THEMES,
  contrastRatio,
} from '../../frontend/src/lowVisionThemes';

const AAA = 7;

test.describe('@smoke low-vision contrast', () => {
  test('there are three pairings to choose from', () => {
    expect(LOW_VISION_THEMES).toHaveLength(3);
  });

  for (const theme of LOW_VISION_THEMES) {
    test(`${theme.name} clears AAA on text, chrome and focus ring`, () => {
      for (const [role, colour] of [
        ['text', theme.fg],
        ['muted', theme.muted],
        ['accent', theme.accent],
      ] as const) {
        const ratio = contrastRatio(colour, theme.bg);
        expect(
          ratio,
          `${theme.name} ${role} (${colour} on ${theme.bg}) is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AAA);
      }
    });
  }

  test('the known reference ratios are right', () => {
    // Sanity check on the maths itself, against values WCAG documents.
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 1);
  });
});

// The primary button is filled rather than outlined, so its label sits on the
// accent colour instead of the page background — a pairing nothing else in the
// app uses, and therefore one nothing else would catch.
//
// DESIGN.md 13 asks for AA everywhere and AAA only in low-vision mode, so AA is
// the bar here. These values are read from index.css; if they are changed there
// without being changed here the test still fails, which is the point.
test.describe('@smoke primary action contrast', () => {
  const AA = 4.5;
  const THEMES = [
    { name: 'ink (dark)', accent: '#8fe3d3', accentFg: '#0d1212' },
    { name: 'sage (light)', accent: '#141616', accentFg: '#c8f1e8' },
  ];

  for (const t of THEMES) {
    test(`${t.name}: the label on the primary button clears AA`, () => {
      const ratio = contrastRatio(t.accentFg, t.accent);
      expect(
        ratio,
        `${t.name} primary label (${t.accentFg} on ${t.accent}) is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    });
  }

  test('the tokens in index.css still match what is asserted here', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile('frontend/src/index.css', 'utf8');
    for (const t of THEMES) {
      expect(css, `${t.accent} is no longer in index.css`).toContain(t.accent);
      expect(css, `${t.accentFg} is no longer in index.css`).toContain(t.accentFg);
    }
  });
});


// The page palette (#181). AA for text and warnings, on the page and on the
// card surface; 3:1 for the edge of every control against the page (WCAG
// 1.4.11). Values are read from index.css below, so a change there that
// isn't reflected here fails.
test.describe('@smoke page palette contrast', () => {
  const PALETTES = [
    { name: 'sage (light)', bg: '#abbab9', surface: '#c4d0cf', block: '#f3f6f5', fg: '#141616', muted: '#2f3635', line: '#3f4746', warn: '#5c3200' },
    { name: 'ink (dark)', bg: '#141818', surface: '#1d2323', block: '#232b2b', fg: '#e7eeec', muted: '#aebcba', line: '#74827f', warn: '#ffc46b' },
  ];

  for (const p of PALETTES) {
    test(`${p.name}: text, warnings and edges are readable`, () => {
      for (const [role, colour, on, min] of [
        ['text', p.fg, p.bg, 4.5],
        ['muted text', p.muted, p.bg, 4.5],
        ['warning', p.warn, p.bg, 4.5],
        ['text on a card', p.fg, p.surface, 4.5],
        ['muted text on a card', p.muted, p.surface, 4.5],
        ['text on a button', p.fg, p.block, 4.5],
        ['control edge', p.line, p.bg, 3],
      ] as const) {
        const ratio = contrastRatio(colour, on);
        expect(ratio, `${p.name} ${role} (${colour} on ${on}) is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
      }
    });
  }

  test('the palette in index.css still matches what is asserted here', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile('frontend/src/index.css', 'utf8');
    for (const p of PALETTES) {
      for (const colour of [p.bg, p.surface, p.block, p.fg, p.muted, p.line, p.warn]) {
        expect(css, `${colour} (${p.name}) is no longer in index.css`).toContain(colour);
      }
    }
  });
});
