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
