// Is the worksheet in the picture? — issue #198.
//
// A blind student cannot see the camera preview, so Glance has to tell them
// how to move the phone. This looks at one small, downscaled camera frame and
// says what is wrong with it, or that it is good. It runs entirely in the
// browser on pixels that are never uploaded: only the final photo is sent.
//
// The page is found the simple, robust way: a worksheet is much brighter than
// the desk or table under it. Pixels above an automatic (Otsu) threshold are
// "paper"; the rows and columns that are mostly paper give the page's edges.

export type Guidance =
  | 'too-dark'
  | 'no-page'
  | 'move-left'
  | 'move-right'
  | 'move-up'
  | 'move-down'
  | 'closer'
  | 'further'
  | 'good';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FrameReport {
  guidance: Guidance;
  /** The page's edges as fractions of the frame (0 to 1), if one was found. */
  page: Box | null;
  /** How well centred the page is, 0 (not at all) to 1 (perfectly). */
  centred: number;
  /** Which way to move, -1 (left) to 1 (right), for panning the guide tone. */
  pan: number;
}

/** What to say for each kind of guidance. Short: they repeat while moving. */
export const SAY: Record<Guidance, string> = {
  'too-dark': 'It is too dark. Move toward a light.',
  'no-page': 'I cannot see a page yet. Point the camera down at the paper.',
  'move-left': 'Move the phone left.',
  'move-right': 'Move the phone right.',
  'move-up': 'Move the phone up, toward the top of the page.',
  'move-down': 'Move the phone down, toward the bottom of the page.',
  closer: 'Bring the phone closer.',
  further: 'Lift the phone higher. The page is cut off.',
  good: 'Hold still.',
};

// A page edge closer than this to the frame edge is treated as cut off.
const EDGE = 0.02;
// A page smaller than this share of the frame is too far away to read.
const MIN_AREA = 0.25;
// A row or column is part of the page when this much of it is paper.
const FILL = 0.5;

function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v] += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    weightB += hist[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Look at one RGBA frame and say how to move the phone. */
export function analyseFrame(rgba: Uint8ClampedArray, width: number, height: number): FrameReport {
  const gray = new Uint8Array(width * height);
  let total = 0;
  for (let i = 0, p = 0; p < gray.length; i += 4, p += 1) {
    const v = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    gray[p] = v;
    total += v;
  }
  const mean = total / gray.length;
  const none = { page: null, centred: 0, pan: 0 };
  if (mean < 40) return { guidance: 'too-dark', ...none };

  const threshold = otsu(gray);
  // A frame with no real contrast (all desk, or all paper) has no page edge.
  let paper = 0;
  for (const v of gray) if (v > threshold) paper += 1;
  const share = paper / gray.length;
  let dark = 0;
  let light = 0;
  for (const v of gray) {
    if (v > threshold) light += v;
    else dark += v;
  }
  const contrast = light / Math.max(1, paper) - dark / Math.max(1, gray.length - paper);
  if (contrast < 40 && share > 0.97) return { guidance: 'further', page: { left: 0, top: 0, right: 1, bottom: 1 }, centred: 0, pan: 0 };
  if (contrast < 40 || share < 0.02) return { guidance: 'no-page', ...none };

  const rowFull = (y: number) => {
    let n = 0;
    for (let x = 0; x < width; x += 1) if (gray[y * width + x] > threshold) n += 1;
    return n / width;
  };
  const colFull = (x: number) => {
    let n = 0;
    for (let y = 0; y < height; y += 1) if (gray[y * width + x] > threshold) n += 1;
    return n / height;
  };
  const rows = Array.from({ length: height }, (_, y) => rowFull(y));
  const cols = Array.from({ length: width }, (_, x) => colFull(x));
  // Measured against the page's own size, so a page that fills half the
  // frame still has "full" rows and columns.
  const rowPeak = Math.max(...rows);
  const colPeak = Math.max(...cols);
  const top = rows.findIndex((r) => r >= rowPeak * FILL);
  const bottom = height - 1 - [...rows].reverse().findIndex((r) => r >= rowPeak * FILL);
  const left = cols.findIndex((c) => c >= colPeak * FILL);
  const right = width - 1 - [...cols].reverse().findIndex((c) => c >= colPeak * FILL);
  if (top < 0 || left < 0) return { guidance: 'no-page', ...none };

  const page: Box = {
    left: left / width,
    top: top / height,
    right: (right + 1) / width,
    bottom: (bottom + 1) / height,
  };
  const cut = {
    left: page.left <= EDGE,
    right: page.right >= 1 - EDGE,
    top: page.top <= EDGE,
    bottom: page.bottom >= 1 - EDGE,
  };
  const area = (page.right - page.left) * (page.bottom - page.top);
  const cx = (page.left + page.right) / 2;
  const cy = (page.top + page.bottom) / 2;
  const centred = Math.max(0, 1 - 2 * Math.max(Math.abs(cx - 0.5), Math.abs(cy - 0.5)));
  const pan = Math.max(-1, Math.min(1, (cx - 0.5) * 2));
  const report = (guidance: Guidance) => ({ guidance, page, centred, pan });

  // Cut off on opposite sides means the phone is too close.
  if ((cut.left && cut.right) || (cut.top && cut.bottom)) return report('further');
  // Cut off on one side: move the phone toward that side.
  if (cut.left) return report('move-left');
  if (cut.right) return report('move-right');
  if (cut.top) return report('move-up');
  if (cut.bottom) return report('move-down');
  if (area < MIN_AREA) return report('closer');
  return report('good');
}
