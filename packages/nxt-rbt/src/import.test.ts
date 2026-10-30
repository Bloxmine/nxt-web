import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lowerProgram, validateProgram, type Block } from '@nxt/blocks';
import { describe, expect, it } from 'vitest';
import { ByteReader } from './bytes.js';
import { importRbt } from './index.js';
import { parseTypeDesc, readFlattened } from './lvtype.js';
import { parseViTags } from './vitags.js';

const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const pstr = (s: string) => [s.length, ...Array.from(s, (c) => c.charCodeAt(0))];

describe('LabVIEW type descriptors and flattened data', () => {
  it('reads a labelled cluster of a double, an enum and a string', () => {
    const dbl = [...be16(10), 0x40, 0x0a, ...pstr('Goal'), 0];
    const en = [
      ...be16(4 + 2 + 2 + 2 + 5),
      0x40,
      0x16,
      ...be16(2),
      ...pstr('A'),
      ...pstr('B'),
      ...pstr('Port'),
    ];
    const st = [...be16(4 + 4 + 5), 0x40, 0x30, ...be32(0xffffffff), ...pstr('Name')];
    const fields = [...dbl, ...en, ...st];
    const cluster = [...be16(6 + fields.length), 0x00, 0x50, ...be16(3), ...fields];
    const data = [0x40, 0x76, 0x80, 0, 0, 0, 0, 0, ...be16(1), ...be32(2), 0x68, 0x69];
    const r = new ByteReader(Uint8Array.from([...cluster, ...data]));
    const [td, end] = parseTypeDesc(r, 0);
    expect(td.fields?.map((f) => f.label)).toEqual(['Goal', 'Port', 'Name']);
    expect(readFlattened(td, r, end)[0]).toEqual({ Goal: 360, Port: 'B', Name: 'hi' });
  });

  it('reads VI tags', () => {
    const name = 'VarName';
    const td = [...be16(8), 0x00, 0x30, ...be32(0xffffffff)];
    const data = [...be32(5), ...Array.from('Power', (c) => c.charCodeAt(0))];
    const tag = [
      ...be32(name.length),
      ...Array.from(name, (c) => c.charCodeAt(0)),
      ...be32(4 + td.length + data.length),
      ...td,
      ...data,
    ];
    const tags = parseViTags(Uint8Array.from([...be32(1), ...tag]));
    expect(tags.get('VarName')).toBe('Power');
  });
});

// Real programs from nxtprograms.com are not committed (their licence does not
// allow it). Run `pnpm fetch:nxtprograms` to test against them locally.
const dir = join(import.meta.dirname, '../../../fixtures/external/nxtprograms');
const files = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith('.rbt'))
      .sort()
  : [];
const load = (name: string) => importRbt(new Uint8Array(readFileSync(join(dir, name))), name);
const has = (name: string) => files.includes(name);

describe.skipIf(files.length === 0)('importing real .rbt programs (local only)', () => {
  it.each(files)('%s imports, validates and lowers', (name) => {
    const { program } = load(name);
    expect(validateProgram(program).filter((i) => i.severity === 'error')).toEqual([]);
    expect(() => lowerProgram(program)).not.toThrow();
  });

  it.skipIf(!has('BumperCar.rbt'))(
    'BumperCar: drive, wait for touch, back up, turn — forever',
    () => {
      const { program, warnings } = load('BumperCar.rbt');
      expect(warnings).toEqual([]);
      const loop = program.body[0] as Extract<Block, { kind: 'loop' }>;
      expect(loop.control).toEqual({ type: 'forever' });
      expect(loop.body.map((b) => b.kind)).toEqual(['move', 'wait', 'move', 'move']);
      expect(loop.body[1]).toMatchObject({
        control: { type: 'sensor', condition: { source: 'touch', port: 1, action: 'pressed' } },
      });
      expect(loop.body[2]).toMatchObject({
        direction: 'backward',
        duration: { unit: 'seconds', value: 0.5 },
      });
    },
  );

  it.skipIf(!has('GuitarTones.rbt'))('GuitarTones: three beams and nine-way value switches', () => {
    const { program } = load('GuitarTones.rbt');
    expect(program.parallel).toHaveLength(2);
    const loop = program.body[1] as Extract<Block, { kind: 'loop' }>;
    const sw = loop.body[1] as Extract<Block, { kind: 'switch' }>;
    expect(sw.condition).toEqual({ source: 'value', valueType: 'number' });
    expect(sw.cases?.map((c) => (c.blocks[0] as Extract<Block, { kind: 'display' }>).text)).toEqual(
      ['', 'A', 'C', 'D', 'D#', 'E', 'G', 'G#', 'A'],
    );
  });

  it.skipIf(!has('Drive_Test.rbt'))('Drive_Test: display labels and moves', () => {
    const { program } = load('Drive_Test.rbt');
    expect(
      program.body
        .filter((b) => b.kind === 'display')
        .map((b) => (b as Extract<Block, { kind: 'display' }>).text),
    ).toEqual([
      'Forward',
      'Backward',
      'Pivot Left',
      'Pivot Right',
      'One Wheel Left',
      'One Wheel Right',
    ]);
  });

  it.skipIf(!has('Explorer.rbt'))('Explorer: obstacle check uses "touch or close"', () => {
    const { program } = load('Explorer.rbt');
    const loop = program.body[1] as Extract<Block, { kind: 'loop' }>;
    expect(loop.body.slice(0, 4).map((b) => b.kind)).toEqual([
      'sensor',
      'sensor',
      'logic',
      'switch',
    ]);
    expect(loop.body[2]).toMatchObject({ op: 'or' });
    const sw = loop.body[3] as Extract<Block, { kind: 'switch' }>;
    expect(sw.whenTrue.length).toBeGreaterThan(3);
    expect(program.wires.some((w) => w.to.block === sw.id && w.to.plug === 'condition')).toBe(true);
  });

  it.skipIf(!has('ForkliftTest.rbt'))('ForkliftTest: color lamp colours', () => {
    const { program } = load('ForkliftTest.rbt');
    const lamps = program.body.filter((b) => b.kind === 'colorLamp') as Extract<
      Block,
      { kind: 'colorLamp' }
    >[];
    expect(lamps.slice(0, 3).map((l) => l.color)).toEqual(['green', 'blue', 'green']);
  });
});
