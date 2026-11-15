// Image preparation before upload.
//
// Two jobs, both about latency (DESIGN.md 16): a phone photo is often 4000 px
// wide and several megabytes, which costs seconds on a hotspot and buys no
// accuracy, so it is downscaled to 1600 px; and a handheld photo of a
// worksheet is frequently blurred by the shutter, so the camera takes three
// frames and keeps the sharpest (DESIGN.md 5, Flow D).

/** Longest edge after downscaling. DESIGN.md 16 asks for 1600 px. */
export const MAX_EDGE = 1600;

function drawScaled(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('could not encode image'))),
      'image/jpeg',
      quality,
    );
  });
}

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  // createImageBitmap is faster and avoids an object URL, but Safari has
  // shipped it only recently; fall back to an <img> so iPhone still works.
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { src: bmp, w: bmp.width, h: bmp.height };
    } catch {
      // Fall through to the <img> path.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('could not read that image'));
      el.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Downscale to `MAX_EDGE` and re-encode as JPEG. Small images pass through. */
export async function downscale(file: Blob): Promise<Blob> {
  const { src, w, h } = await decode(file);
  if (Math.max(w, h) <= MAX_EDGE && file.size < 1_000_000) return file;
  return toBlob(drawScaled(src, w, h));
}

/** Rough focus score: the variance of a Laplacian over a greyscale downsample.
 *
 *  A blurred frame has little high-frequency detail, so its second derivative
 *  is flat and the variance is low. Only used to rank frames taken seconds
 *  apart of the same scene, which is all it has to be good enough for.
 */
export function sharpness(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  const w = canvas.width;
  const h = canvas.height;
  if (w < 3 || h < 3) return 0;
  const { data } = ctx.getImageData(0, 0, w, h);

  const grey = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const lap =
        4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - w] - grey[i + w];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Grab `count` frames from a live video and return the sharpest, downscaled. */
export async function sharpestFrame(
  video: HTMLVideoElement,
  count = 3,
  gapMs = 120,
): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('The camera is not ready yet.');

  let best: HTMLCanvasElement | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < count; i += 1) {
    if (i > 0) await new Promise((r) => window.setTimeout(r, gapMs));
    const canvas = drawScaled(video, w, h);
    const score = sharpness(canvas);
    if (score > bestScore) {
      bestScore = score;
      best = canvas;
    }
  }
  if (!best) throw new Error('Could not take a photo.');
  return toBlob(best);
}
