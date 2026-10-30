/**
 * Bluetooth framing: each telegram is prefixed with its length as a 2-byte
 * little-endian value, not counting the prefix itself.
 * Source: docs/spec/telegram.md, "Bluetooth framing" (Appendix 1 p. 22).
 */
export function frameBluetooth(telegram: Uint8Array): Uint8Array {
  if (telegram.length > 0xffff) throw new RangeError('Telegram too long to frame');
  const out = new Uint8Array(telegram.length + 2);
  out[0] = telegram.length & 0xff;
  out[1] = telegram.length >> 8;
  out.set(telegram, 2);
  return out;
}

/** Reassembles length-prefixed Bluetooth telegrams from an arbitrary byte stream. */
export class BluetoothDeframer {
  private buffer = new Uint8Array(0);

  /** Adds received bytes and returns every telegram completed by them. */
  push(chunk: Uint8Array): Uint8Array[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);

    const telegrams: Uint8Array[] = [];
    let offset = 0;
    while (merged.length - offset >= 2) {
      const length = merged[offset]! | (merged[offset + 1]! << 8);
      if (merged.length - offset - 2 < length) break;
      telegrams.push(merged.slice(offset + 2, offset + 2 + length));
      offset += 2 + length;
    }
    this.buffer = merged.slice(offset);
    return telegrams;
  }

  /** Forgets any partial telegram. */
  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}
