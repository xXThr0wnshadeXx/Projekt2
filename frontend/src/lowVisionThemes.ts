// High-contrast themes for low-vision mode — issue #12.
//
// Three pairings that low-vision users actually ask for. Every ratio here is
// computed and asserted in `tests/e2e/contrast.spec.ts`, not eyeballed. WCAG AAA wants
// 7:1 for body text and 4.5:1 for large text; all three clear 7:1 by a wide
// margin, which leaves room for the focus ring and the dimmed chrome.

export interface LowVisionTheme {
  id: string;
  name: string;
  bg: string;
  fg: string;
  /** Chrome (counters, hints). Still has to clear AAA against the background. */
  muted: string;
  accent: string;
}

export const LOW_VISION_THEMES: LowVisionTheme[] = [
  {
    id: 'white-on-black',
    name: 'White on black',
    bg: '#000000',
    fg: '#ffffff',
    muted: '#c9c9c9',
    accent: '#7cc4ff',
  },
  {
    id: 'black-on-white',
    name: 'Black on white',
    bg: '#ffffff',
    fg: '#000000',
    muted: '#404040',
    accent: '#0b3d91',
  },
  {
    id: 'yellow-on-black',
    name: 'Yellow on black',
    bg: '#000000',
    fg: '#ffff00',
    muted: '#d8d84a',
    accent: '#8fd3ff',
  },
];

/** Relative luminance per WCAG 2.1. */
export function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const parts = [v.slice(0, 2), v.slice(2, 4), v.slice(4, 6)].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

/** Contrast ratio between two hex colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
