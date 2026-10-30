import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linkedViNames, parseRsrc, resourcesOfType, RsrcFormatError } from './index.js';

/** Builds a tiny container with the given resources, matching the documented layout. */
function build(resources: { type: string; id: number; data: number[] }[]): Uint8Array {
  const types = [...new Set(resources.map((r) => r.type))];
  const data: number[] = [];
  const offsets = resources.map((r) => {
    const at = data.length;
    data.push(0, 0, 0, r.data.length, ...r.data);
    return at;
  });
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  const dataOffset = 32;
  const indexOffset = dataOffset + data.length;
  const header = [
    ...ascii('RSRC\r\n'),
    0,
    3,
    ...ascii('LVIN'),
    ...ascii('LBVW'),
    ...u32(indexOffset),
    ...u32(0),
    ...u32(dataOffset),
    ...u32(data.length),
  ];
  const index: number[] = [...header, ...new Array(0x34 - 32).fill(0), ...u32(types.length - 1)];
  const typeTable = 4 + types.length * 12;
  let entryOffset = typeTable;
  const entries: number[] = [];
  for (const type of types) {
    const list = resources.map((r, i) => ({ r, i })).filter((x) => x.r.type === type);
    index.push(...ascii(type), ...u32(list.length - 1), ...u32(entryOffset));
    for (const { r, i } of list)
      entries.push(...u32(r.id), ...u32(0xffffffff), ...u32(0), ...u32(offsets[i]!), ...u32(0));
    entryOffset += list.length * 20;
  }
  return Uint8Array.from([...header, ...data, ...index, ...entries]);
}

describe('parseRsrc', () => {
  it('reads types, ids and data from a synthetic container', () => {
    const file = parseRsrc(
      build([
        { type: 'VINS', id: 0, data: [1, 2] },
        { type: 'VINS', id: 1, data: [3] },
        { type: 'LIvi', id: 0, data: [...Array.from('\x01Sound.vi\x00', (c) => c.charCodeAt(0))] },
      ]),
    );
    expect(file.fileType).toBe('LVIN');
    expect(resourcesOfType(file, 'VINS').map((r) => [r.id, Array.from(r.data)])).toEqual([
      [0, [1, 2]],
      [1, [3]],
    ]);
    expect(linkedViNames(file)).toEqual(['Sound.vi']);
  });

  it('rejects other files', () => {
    expect(() => parseRsrc(new Uint8Array([1, 2, 3]))).toThrow(RsrcFormatError);
  });

  it('rejects truncated files', () => {
    const bytes = build([{ type: 'VINS', id: 0, data: [1] }]);
    expect(() => parseRsrc(bytes.slice(0, 40))).toThrow(RsrcFormatError);
  });
});

// Real programs are not committed (their licences don't allow it). Run
// `pnpm fetch:nxtprograms` to download them for local compatibility testing.
const external = join(import.meta.dirname, '../../../fixtures/external/nxtprograms');
const samples = existsSync(external) ? readdirSync(external).filter((f) => f.endsWith('.rbt')) : [];

describe.skipIf(samples.length === 0)('real .rbt programs (local only)', () => {
  it.each(samples)('%s parses and links to known blocks', (name) => {
    const file = parseRsrc(new Uint8Array(readFileSync(join(external, name))));
    expect(file.fileType).toBe('LVIN');
    expect(resourcesOfType(file, 'BDHP')).toHaveLength(1);
    expect(linkedViNames(file).length).toBeGreaterThan(0);
  });
});
