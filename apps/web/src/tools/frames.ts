import type { Bitmap } from './picture';

/** How a colour frame becomes black and white. */
export interface MonoOptions {
  /** Pixels darker than this (0–255) become black. */
  threshold: number;
  /** Spread the rounding error to neighbours (Floyd–Steinberg), for photos and shading. */
  dither: boolean;
  /** Swap black and white. */
  invert: boolean;
}

/** The largest size with the source's aspect ratio that fits in the box (at least 1×1). */
export function fitSize(
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return {
    width: Math.max(1, Math.min(boxWidth, Math.round(width * scale))),
    height: Math.max(1, Math.min(boxHeight, Math.round(height * scale))),
  };
}

/** RGBA pixels (transparent counts as white) to a black-and-white picture. */
export function toMono(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options: MonoOptions,
): Bitmap {
  const light = new Float32Array(width * height);
  for (let i = 0; i < light.length; i++) {
    const alpha = rgba[i * 4 + 3]! / 255;
    const lum = 0.3 * rgba[i * 4]! + 0.59 * rgba[i * 4 + 1]! + 0.11 * rgba[i * 4 + 2]!;
    light[i] = lum * alpha + 255 * (1 - alpha);
  }
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const black = light[i]! < options.threshold;
      pixels[i] = black !== options.invert ? 1 : 0;
      if (!options.dither) continue;
      const error = light[i]! - (black ? 0 : 255);
      const spread = (dx: number, dy: number, part: number) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny < height) light[ny * width + nx]! += (error * part) / 16;
      };
      spread(1, 0, 7);
      spread(-1, 1, 3);
      spread(0, 1, 5);
      spread(1, 1, 1);
    }
  }
  return { width, height, pixels };
}
