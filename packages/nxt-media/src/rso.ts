/**
 * .rso sound files (docs/spec/media.md): an 8-byte big-endian header (codec, data length,
 * sample rate, loop flag) followed by the samples.
 */

/** Codec ids in the header. */
export const RSO_CODEC = { PCM8: 0x0100, IMA_ADPCM: 0x0101 } as const;

/** A decoded sound. */
export interface RsoSound {
  codec: number;
  sampleRate: number;
  loop: boolean;
  /** Unsigned 8-bit samples (128 = silence). Empty for ADPCM files, which are not decoded. */
  samples: Uint8Array;
}

/** Reads an .rso file. */
export function decodeRso(bytes: Uint8Array): RsoSound {
  if (bytes.length < 8) throw new Error('Not a sound file: too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const codec = view.getUint16(0, false);
  if (codec !== RSO_CODEC.PCM8 && codec !== RSO_CODEC.IMA_ADPCM) {
    throw new Error('Not an NXT sound file (.rso)');
  }
  const length = Math.min(view.getUint16(2, false), bytes.length - 8);
  return {
    codec,
    sampleRate: view.getUint16(4, false),
    loop: view.getUint16(6, false) !== 0,
    samples: codec === RSO_CODEC.PCM8 ? bytes.slice(8, 8 + length) : new Uint8Array(),
  };
}

/** Writes an 8-bit PCM .rso file. Samples are unsigned bytes (128 = silence). */
export function encodeRso(samples: Uint8Array, sampleRate = 8000, loop = false): Uint8Array {
  if (samples.length > 0xffff) throw new Error('Sound is too long for one .rso file (64 KB)');
  const out = new Uint8Array(8 + samples.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, RSO_CODEC.PCM8, false);
  view.setUint16(2, samples.length, false);
  view.setUint16(4, sampleRate, false);
  view.setUint16(6, loop ? 1 : 0, false);
  out.set(samples, 8);
  return out;
}

/**
 * Turns audio (floats −1…1 at `fromRate`) into 8-bit samples at `toRate` (default 8 kHz,
 * the rate the brick plays best), with simple averaging and normalisation.
 */
export function toPcm8(audio: Float32Array, fromRate: number, toRate = 8000): Uint8Array {
  const ratio = fromRate / toRate;
  const count = Math.floor(audio.length / ratio);
  let peak = 0;
  for (const v of audio) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.95 / peak : 1;
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let k = start; k < end && k < audio.length; k++) sum += audio[k]!;
    const v = (sum / (end - start)) * gain;
    out[i] = Math.max(0, Math.min(255, Math.round(128 + v * 127)));
  }
  return out;
}

/** 8-bit samples as floats −1…1, for playing in the browser. */
export function fromPcm8(samples: Uint8Array): Float32Array {
  return Float32Array.from(samples, (s) => (s - 128) / 128);
}
