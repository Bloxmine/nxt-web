/**
 * A small animated GIF (GIF89a) writer: one global colour table, frames as palette
 * indexes, a delay per frame, looping forever.
 */
export interface GifFrame {
  /** One palette index per pixel, rows from the top. */
  indexes: Uint8Array;
  /** How long the frame shows, in milliseconds (GIF stores hundredths of a second). */
  delayMs: number;
}

/** LZW-compresses palette indexes the way GIF wants (variable code size, clear codes). */
function lzw(indexes: Uint8Array, minCodeSize: number): number[] {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = minCodeSize + 1;
  const emit = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  let dict = new Map<number, number>();
  let next = end + 1;
  emit(clear);
  let prefix = indexes[0] ?? 0;
  for (let i = 1; i < indexes.length; i++) {
    const k = indexes[i]!;
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      dict = new Map();
      next = end + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(end);
  if (bitCount > 0) out.push(bitBuffer & 0xff);
  return out;
}

/**
 * An animated GIF of `width` × `height` frames over `palette` (up to 256 [r, g, b]
 * colours), looping forever.
 */
export function encodeGif(
  width: number,
  height: number,
  palette: readonly (readonly [number, number, number])[],
  frames: readonly GifFrame[],
): Uint8Array {
  const out: number[] = [];
  const u16 = (n: number) => out.push(n & 0xff, (n >> 8) & 0xff);
  const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))));
  const tableSize = 1 << bits;

  out.push(...Array.from('GIF89a', (c) => c.charCodeAt(0)));
  u16(width);
  u16(height);
  out.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
  for (let i = 0; i < tableSize; i++) out.push(...(palette[i] ?? [0, 0, 0]));
  // Loop forever (NETSCAPE2.0 application extension).
  out.push(0x21, 0xff, 11, ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);

  const minCodeSize = Math.max(2, bits);
  for (const frame of frames) {
    // Graphic control extension: the delay.
    out.push(0x21, 0xf9, 4, 0);
    u16(Math.max(2, Math.round(frame.delayMs / 10)));
    out.push(0, 0);
    // Image descriptor: the whole canvas, no local colour table.
    out.push(0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    out.push(0, minCodeSize);
    const data = lzw(frame.indexes, minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      out.push(chunk.length, ...chunk);
    }
    out.push(0);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}

/** A 256-colour palette: a 6 × 6 × 6 colour cube and 40 greys. */
export function webPalette(): [number, number, number][] {
  const palette: [number, number, number][] = [];
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) palette.push([r * 51, g * 51, b * 51]);
  for (let i = 0; i < 40; i++) {
    const v = Math.round(((i + 1) * 255) / 41);
    palette.push([v, v, v]);
  }
  return palette;
}

/** RGBA pixels to indexes in {@link webPalette} (nearest cube colour, or grey when greyish). */
export function toWebPalette(rgba: ArrayLike<number>, count: number): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 12) {
      const v = (r + g + b) / 3;
      const grey = Math.round((v * 41) / 255) - 1;
      out[i] = grey < 0 ? 0 : grey >= 40 ? 215 : 216 + grey;
    } else {
      out[i] = Math.round(r / 51) * 36 + Math.round(g / 51) * 6 + Math.round(b / 51);
    }
  }
  return out;
}

/** A screen (100 × 64, 1 = dark) seen at a moment, for {@link lcdGif}. */
export interface LcdShot {
  pixels: ArrayLike<number>;
  /** When it was seen, in milliseconds. */
  at: number;
}

/**
 * An animated GIF of the brick's screen in LCD colours, each pixel `scale` × `scale`.
 * Frames that look the same as the one before are merged.
 */
export function lcdGif(shots: readonly LcdShot[], scale = 3, endAt?: number): Uint8Array {
  const width = 100 * scale;
  const height = 64 * scale;
  const frames: GifFrame[] = [];
  let last: ArrayLike<number> | null = null;
  shots.forEach((shot, i) => {
    const until = shots[i + 1]?.at ?? endAt ?? shot.at + 100;
    const delayMs = Math.max(20, until - shot.at);
    const same = last !== null && Array.prototype.every.call(shot.pixels, (p, j) => p === last![j]);
    if (same && frames.length > 0) {
      frames[frames.length - 1]!.delayMs += delayMs;
      return;
    }
    last = shot.pixels;
    const indexes = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = Math.floor(y / scale) * 100;
      for (let x = 0; x < width; x++)
        indexes[y * width + x] = shot.pixels[row + Math.floor(x / scale)] ? 1 : 0;
    }
    frames.push({ indexes, delayMs });
  });
  return encodeGif(
    width,
    height,
    [
      [184, 204, 148],
      [38, 50, 26],
    ],
    frames,
  );
}

/**
 * A palette fitted to a picture: its most common colours (at 5 bits per channel) plus a
 * coarse colour cube for colours that turn up later, with a fast nearest-colour lookup.
 */
export class FittedPalette {
  readonly colors: [number, number, number][] = [];
  private readonly lookup = new Int16Array(32768).fill(-1);

  constructor(rgba: ArrayLike<number>, count: number) {
    const histogram = new Uint32Array(32768);
    for (let i = 0; i < count; i++) {
      histogram[this.key(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!)]!++;
    }
    const common = [...histogram.keys()]
      .filter((k) => histogram[k]! > 0)
      .sort((a, b) => histogram[b]! - histogram[a]!)
      .slice(0, 208);
    for (const k of common) {
      this.colors.push([((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
    }
    // A 4 × 4 × 3 cube for anything else.
    for (let r = 0; r < 4; r++)
      for (let g = 0; g < 4; g++)
        for (let b = 0; b < 3; b++) this.colors.push([r * 85, g * 85, b * 127]);
  }

  private key(r: number, g: number, b: number): number {
    return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  }

  /** Palette indexes for RGBA pixels. */
  map(rgba: ArrayLike<number>, count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const k = this.key(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!);
      let index = this.lookup[k]!;
      if (index < 0) {
        const r = ((k >> 10) & 31) * 8 + 4;
        const g = ((k >> 5) & 31) * 8 + 4;
        const b = (k & 31) * 8 + 4;
        let best = Infinity;
        this.colors.forEach(([cr, cg, cb], j) => {
          const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
          if (d < best) {
            best = d;
            index = j;
          }
        });
        this.lookup[k] = index;
      }
      out[i] = index;
    }
    return out;
  }
}
