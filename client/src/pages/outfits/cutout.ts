/**
 * Lifting a garment off its background.
 *
 * A photo of a jumper on a bed is a rectangle: the jumper plus the duvet
 * around it. Laid over a figure, that rectangle reads as a grey sticker rather
 * than clothing. This finds the backdrop and makes it transparent, so what
 * lands on the figure is the garment's actual outline.
 *
 * Nothing here invents pixels. It only decides which of the person's own
 * pixels are backdrop, and it refuses the job when it isn't confident:
 * a busy background, corners that disagree, or a result that ate most of the
 * picture all fall back to the untouched photo.
 */

/** Work at this size at most — the figure shows the garment far smaller. */
const MAX_EDGE = 640;

/** How far a pixel may sit from the backdrop colour and still count as it. */
const TOLERANCE = 70;

/**
 * A shadow is the backdrop with less light on it: same colour, darker. Brought
 * back up to full brightness it should land on the backdrop colour again, and
 * this is how close it has to land. Kept tight, because a genuinely grey
 * jumper on a white sheet is the same shape of thing and must survive.
 */
const SHADOW_TOLERANCE = 24;

/** Below this share of the backdrop's brightness it's too dark to be a shadow. */
const DARKEST_SHADOW = 0.45;

/** Corners must agree within this to be believed as one plain backdrop. */
const CORNER_AGREEMENT = 60;

/** If the flood eats more than this much, it found the garment, not the bed. */
const MAX_REMOVED = 0.93;

/** ...and if it eats less than this, there was no backdrop worth removing. */
const MIN_REMOVED = 0.02;

const cache = new Map<string, Promise<string>>();

/**
 * The cut-out version of `src`, or `src` itself when it can't be cut out
 * safely. Each photo is only ever processed once per page load.
 */
export function cutout(src: string): Promise<string> {
  const hit = cache.get(src);
  if (hit) return hit;
  const work = removeBackdrop(src).catch(() => src);
  cache.set(src, work);
  return work;
}

async function removeBackdrop(src: string): Promise<string> {
  const image = await load(src);

  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(image, 0, 0, w, h);

  // Reading pixels back from another origin's image is blocked by the browser.
  const frame = ctx.getImageData(0, 0, w, h);
  const px = frame.data;

  const backdrop = readBackdrop(px, w, h);
  if (!backdrop) return src;

  const removed = floodFromEdges(px, w, h, backdrop);
  const share = removed / (w * h);
  if (share > MAX_REMOVED || share < MIN_REMOVED) return src;

  softenEdges(px, w, h);
  ctx.putImageData(frame, 0, 0);
  return trim(canvas, px, w, h);
}

/**
 * Crops away the empty space the backdrop left behind.
 *
 * Without this the returned picture is still mostly nothing: a jumper
 * photographed from six feet away is a small jumper in a large square, and
 * anywhere it's placed it would be drawn at the size of the square rather than
 * the size of the jumper.
 */
function trim(
  source: HTMLCanvasElement,
  px: Uint8ClampedArray,
  w: number,
  h: number
): string {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return source.toDataURL("image/png");

  // A hair of margin, so a softened edge isn't sliced off.
  const pad = Math.round(Math.max(w, h) * 0.01);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const cropped = document.createElement("canvas");
  cropped.width = maxX - minX + 1;
  cropped.height = maxY - minY + 1;
  const ctx = cropped.getContext("2d");
  if (!ctx) return source.toDataURL("image/png");
  ctx.drawImage(
    source,
    minX,
    minY,
    cropped.width,
    cropped.height,
    0,
    0,
    cropped.width,
    cropped.height
  );
  return cropped.toDataURL("image/png");
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not load"));
    image.src = src;
  });
}

type Rgb = [number, number, number];

/**
 * The backdrop colour, taken from the four corners. They have to agree with
 * each other — corners that don't mean the photo has something going on behind
 * the garment, and guessing would cut a hole in it.
 */
function readBackdrop(
  px: Uint8ClampedArray,
  w: number,
  h: number
): Rgb | null {
  const patch = Math.max(4, Math.round(Math.min(w, h) * 0.04));
  const corners: Rgb[] = [
    average(px, w, 0, 0, patch),
    average(px, w, w - patch, 0, patch),
    average(px, w, 0, h - patch, patch),
    average(px, w, w - patch, h - patch, patch),
  ];

  for (const a of corners) {
    for (const b of corners) {
      if (distance(a, b) > CORNER_AGREEMENT) return null;
    }
  }

  return [
    Math.round(corners.reduce((s, c) => s + c[0], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[1], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[2], 0) / 4),
  ];
}

function average(
  px: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  size: number
): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      const i = (y * w + x) * 4;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

function distance(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Clears backdrop-coloured pixels reachable from the edge of the photo.
 *
 * Working inwards from the border rather than clearing every matching pixel is
 * what protects a white shirt on a white sheet: the shirt is only reached if
 * the two genuinely touch with no shadow between them.
 */
function floodFromEdges(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  backdrop: Rgb
): number {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  let cleared = 0;

  const backdropLight = backdrop[0] + backdrop[1] + backdrop[2];

  const isBackdrop = (r: number, g: number, b: number) => {
    if (distance([r, g, b], backdrop) <= TOLERANCE) return true;
    // Or the backdrop in shadow: turn the light back up and see where it lands.
    const light = r + g + b;
    if (light >= backdropLight || light < backdropLight * DARKEST_SHADOW) {
      return false;
    }
    const lift = backdropLight / Math.max(light, 1);
    return (
      distance([r * lift, g * lift, b * lift], backdrop) <= SHADOW_TOLERANCE
    );
  };

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    if (!isBackdrop(px[i], px[i + 1], px[i + 2])) return;
    px[i + 3] = 0;
    cleared++;
    stack[top++] = p;
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (top > 0) {
    const p = stack[--top];
    const x = p % w;
    const y = (p - x) / w;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  return cleared;
}

/**
 * Blurs the transparency a little so the garment's edge doesn't come out as a
 * hard staircase, and pulls the remaining backdrop tint out of the fringe.
 */
function softenEdges(px: Uint8ClampedArray, w: number, h: number) {
  const alpha = new Uint8ClampedArray(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = px[p * 4 + 3];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += alpha[p + dy * w + dx];
        }
      }
      const smoothed = sum / 9;
      // Only soften where the edge actually is; solid areas stay solid.
      if (alpha[p] > 0 && smoothed < 250) px[p * 4 + 3] = smoothed;
    }
  }
}
