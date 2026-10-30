import { encodeRic, encodeRso, toPcm8 } from '@nxt/media';

/** A brick file name: up to 15 characters plus a 3-letter extension. */
export function brickFileName(name: string, extension: string): string {
  const base =
    name
      .replace(/\.[^.]*$/, '')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim()
      .slice(0, 15) || 'File';
  return `${base}.${extension}`;
}

/** Decodes an audio file (WAV, MP3, OGG… whatever the browser plays) into an .rso. */
export async function audioToRso(file: File, maxSeconds = 8): Promise<Uint8Array> {
  const context = new OfflineAudioContext(1, 1, 44100);
  const audio = await context.decodeAudioData(await file.arrayBuffer());
  // Mix down to mono.
  const length = Math.min(audio.length, Math.floor(audio.sampleRate * maxSeconds));
  const mono = new Float32Array(length);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const data = audio.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i]! += data[i]! / audio.numberOfChannels;
  }
  return encodeRso(toPcm8(mono, audio.sampleRate, 8000), 8000);
}

/**
 * Turns an image into a black-and-white .ric that fits the screen (100×64), keeping the
 * aspect ratio. Pixels darker than `threshold` (0–255) become black.
 */
export async function imageToRic(
  file: File,
  threshold = 128,
): Promise<{ bytes: Uint8Array; preview: boolean[]; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(100 / bitmap.width, 64 / bitmap.height, 1);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const pixels: boolean[] = [];
  for (let i = 0; i < width * height; i++) {
    const lum = 0.3 * data[i * 4]! + 0.59 * data[i * 4 + 1]! + 0.11 * data[i * 4 + 2]!;
    const alpha = data[i * 4 + 3]! / 255;
    pixels.push(lum * alpha + 255 * (1 - alpha) < threshold);
  }
  return { bytes: encodeRic(width, height, pixels), preview: pixels, width, height };
}

/** Saves bytes as a download. */
export function saveFile(
  name: string,
  bytes: Uint8Array | string,
  type = 'application/octet-stream',
): void {
  const blob = new Blob([typeof bytes === 'string' ? bytes : Uint8Array.from(bytes)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
