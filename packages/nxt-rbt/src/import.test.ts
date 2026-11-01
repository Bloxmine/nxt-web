import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lowerProgram, validateProgram, walkProgram, type Block } from '@nxt/blocks';
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
const everyBlock = (program: ReturnType<typeof load>['program']) => {
  const out: Block[] = [];
  walkProgram(program, (b) => out.push(b));
  return out;
};
const findKind = (program: ReturnType<typeof load>['program'], kind: Block['kind']) =>
  everyBlock(program).find((b) => b.kind === kind);
const findId = (program: ReturnType<typeof load>['program'], id: string) =>
  everyBlock(program).find((b) => b.id === id);

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

  it.skipIf(!has('Segway.rbt'))(
    'Segway: a wire listed from an input end still reaches every input',
    () => {
      const { program } = load('Segway.rbt');
      const range = program.body.length ? findKind(program, 'range') : undefined;
      expect(range).toMatchObject({ inside: false });
      const into = (kind: Block['kind'], plug: string) =>
        program.wires.filter((w) => {
          const b = findId(program, w.to.block);
          return b?.kind === kind && w.to.plug === plug;
        }).length;
      expect(into('range', 'value')).toBe(1);
      expect(into('motor', 'power')).toBeGreaterThanOrEqual(2);
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

describe.skipIf(files.length === 0)('NXT 2.0 color sensor and file programs (local only)', () => {
  it.skipIf(!has('CheckoutScan.rbt'))(
    'CheckoutScan: calibration texts on lines 3–6 and light-mode color sensor',
    () => {
      const { program, warnings } = load('CheckoutScan.rbt');
      expect(warnings).toEqual([]);
      const texts = program.body.filter((b) => b.kind === 'display').slice(0, 4) as Extract<
        Block,
        { kind: 'display' }
      >[];
      expect(texts.map((t) => [t.text, t.line, t.clear])).toEqual([
        ['Cover sensor', 3, true],
        ['with Calibration', 4, false],
        ['Plate, and', 5, false],
        ['Press Enter.', 6, false],
      ]);
      const color = program.body.find((b) => b.kind === 'sensor') as Extract<
        Block,
        { kind: 'sensor' }
      >;
      expect(color.condition).toMatchObject({
        source: 'color',
        port: 3,
        mode: 'light',
        lamp: 'red',
      });
    },
  );

  it.skipIf(!has('DataLogLight.rbt'))('DataLogLight: delete, write header, log, close', () => {
    const { program, warnings } = load('DataLogLight.rbt');
    expect(warnings).toEqual([]);
    const files = (b: Block[]): Extract<Block, { kind: 'file' }>[] =>
      b.flatMap((x) => (x.kind === 'file' ? [x] : x.kind === 'loop' ? files(x.body) : []));
    expect(files(program.body).map((f) => [f.action, f.file])).toEqual([
      ['delete', 'ScanData'],
      ['write', 'ScanData'],
      ['write', 'ScanData'],
      ['close', 'ScanData'],
    ]);
    expect(program.body.find((b) => b.kind === 'constant')).toMatchObject({ number: 4000 });
  });

  it.skipIf(!has('LightMeter.rbt'))('LightMeter: bar graph lines and wired lamp colour', () => {
    const { program, warnings } = load('LightMeter.rbt');
    expect(warnings).toEqual([]);
    const loop = program.body.find((b) => b.kind === 'loop') as Extract<Block, { kind: 'loop' }>;
    const lines = loop.body.filter(
      (b) => b.kind === 'display' && b.action === 'drawing',
    ) as Extract<Block, { kind: 'display' }>[];
    expect(lines.map((l) => [l.shape, l.y, l.endY])).toEqual([
      ['line', 30, 30],
      ['line', 31, 31],
      ['line', 32, 32],
    ]);
    const sensor = loop.body.find((b) => b.kind === 'sensor')!;
    expect(
      program.wires
        .filter((w) => w.to.block === sensor.id)
        .map((w) => w.to.plug)
        .sort(),
    ).toEqual(['lamp', 'light']);
  });
});

describe.skipIf(files.length === 0)('Bluetooth remote programs (local only)', () => {
  it.skipIf(!has('5ButtonRemote.rbt') || !has('5ButtonSteer.rbt'))(
    'remote sends to the mailboxes the robot reads',
    async () => {
      const { walkProgram } = await import('@nxt/blocks');
      const mailboxes = (name: string, kind: 'sendMessage' | 'receiveMessage') => {
        const set = new Set<number>();
        walkProgram(load(name).program, (b) => {
          if (b.kind === kind) set.add(b.mailbox);
        });
        return [...set].sort();
      };
      expect(mailboxes('5ButtonRemote.rbt', 'sendMessage')).toEqual([1, 2]);
      expect(mailboxes('5ButtonSteer.rbt', 'receiveMessage')).toEqual([1, 2]);
    },
  );

  it.skipIf(!has('ColorRace.rbt'))('color switch cases are colors 1–6', () => {
    let values: (number | string)[] = [];
    walk(load('ColorRace.rbt').program.body, (b) => {
      if (b.kind === 'switch' && b.cases) values = b.cases.map((c) => c.value);
    });
    expect(values).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

function walk(blocks: Block[], fn: (b: Block) => void): void {
  for (const b of blocks) {
    fn(b);
    if (b.kind === 'loop') walk(b.body, fn);
    if (b.kind === 'switch') {
      walk(b.whenTrue, fn);
      walk(b.whenFalse, fn);
      for (const c of b.cases ?? []) walk(c.blocks, fn);
    }
  }
}

// NXT 1.0 programs (NXT-G 1.x), fetched by the same script into their own folder.
const dir1 = join(import.meta.dirname, '../../../fixtures/external/nxtprograms1');
const files1 = existsSync(dir1)
  ? readdirSync(dir1)
      .filter((f) => f.endsWith('.rbt'))
      .sort()
  : [];
const load1 = (name: string) => importRbt(new Uint8Array(readFileSync(join(dir1, name))), name);

describe.skipIf(files1.length === 0)('NXT 1.0 programs (local only)', () => {
  // Several NXT-G 1.x blocks are not supported yet (see docs/rbt-compat.md), so only
  // programs that import without notes have to validate and lower.
  it.each(files1)('%s imports (and runs when nothing was left out)', (name) => {
    const { program, warnings } = load1(name);
    if (warnings.length > 0) return;
    expect(validateProgram(program).filter((i) => i.severity === 'error')).toEqual([]);
    expect(() => lowerProgram(program)).not.toThrow();
  });

  const all = (program: ReturnType<typeof load1>['program']) => {
    const out: Block[] = [];
    const walk = (list: Block[]) =>
      list.forEach((b) => {
        out.push(b);
        if (b.kind === 'loop') walk(b.body);
        if (b.kind === 'switch') {
          walk(b.whenTrue);
          walk(b.whenFalse);
          b.cases?.forEach((c) => walk(c.blocks));
        }
      });
    walk(program.body);
    program.parallel.forEach(walk);
    return out;
  };
  const wiredFrom = (program: ReturnType<typeof load1>['program'], b: Block) =>
    program.wires.filter((w) => w.from.block === b.id).map((w) => w.from.plug);
  const wiredTo = (program: ReturnType<typeof load1>['program'], b: Block) =>
    program.wires.filter((w) => w.to.block === b.id).map((w) => w.to.plug);

  it.skipIf(!files1.includes('Kicker.rbt'))('Kicker: reset B, then wait for 120° forward', () => {
    const { program, warnings } = load1('Kicker.rbt');
    expect(warnings).toEqual([]);
    const blocks = all(program);
    expect(blocks).toContainEqual(expect.objectContaining({ kind: 'resetRotation', port: 'B' }));
    expect(blocks).toContainEqual(
      expect.objectContaining({
        kind: 'wait',
        control: {
          type: 'sensor',
          condition: { source: 'rotation', port: 'B', compare: '>', value: 120, unit: 'degrees' },
        },
      }),
    );
  });

  it.skipIf(!files1.includes('Ball_Hunt.rbt'))(
    'Ball_Hunt: a count backward becomes a negative amount',
    () => {
      const blocks = all(load1('Ball_Hunt.rbt').program);
      expect(blocks).toContainEqual(
        expect.objectContaining({
          kind: 'loop',
          control: {
            type: 'sensor',
            condition: {
              source: 'rotation',
              port: 'C',
              compare: '<',
              value: -1000,
              unit: 'degrees',
            },
          },
        }),
      );
      expect(blocks.filter((b) => b.kind === 'stop')).toHaveLength(2); // Abort blocks
    },
  );

  it.skipIf(!files1.includes('Joystick_Drive.rbt'))(
    'Joystick_Drive: rotation Degrees and Direction feed a Range and a Switch',
    () => {
      const { program } = load1('Joystick_Drive.rbt');
      const blocks = all(program);
      const sensor = blocks.find((b) => b.kind === 'sensor')!;
      expect(wiredFrom(program, sensor)).toEqual(expect.arrayContaining(['value', 'direction']));
      const ranges = blocks.filter((b) => b.kind === 'range');
      expect(ranges.map((r) => r.kind === 'range' && [r.low, r.high, r.inside])).toEqual(
        expect.arrayContaining([
          [101, 160, true],
          [-100, 100, true],
        ]),
      );
    },
  );

  it.skipIf(!files1.includes('LockBox.rbt'))(
    'LockBox: reads the code file and uses its Error output',
    () => {
      const { program } = load1('LockBox.rbt');
      const files = all(program).filter((b) => b.kind === 'file');
      expect(new Set(files.map((b) => b.kind === 'file' && b.action))).toEqual(
        new Set(['read', 'write', 'close', 'delete']),
      );
      const read = files.find((b) => b.kind === 'file' && b.action === 'read')!;
      expect(read).toMatchObject({ file: 'LockBoxCode', type: 'number' });
      expect(wiredFrom(program, read)).toEqual(expect.arrayContaining(['number', 'error']));
    },
  );

  it.skipIf(!files1.includes('Dial_Remote_BT.rbt') || !files1.includes('Dial_BT_Robot.rbt'))(
    'Dial remote: numbers sent on connection 1 to mailboxes 1 and 2, and read there',
    () => {
      const send = all(load1('Dial_Remote_BT.rbt').program).filter((b) => b.kind === 'sendMessage');
      expect(
        send.map((b) => b.kind === 'sendMessage' && [b.connection, b.mailbox, b.type]),
      ).toEqual(
        expect.arrayContaining([
          [1, 1, 'number'],
          [1, 2, 'number'],
        ]),
      );
      const robot = load1('Dial_BT_Robot.rbt').program;
      const read = all(robot).filter((b) => b.kind === 'receiveMessage');
      expect(read.map((b) => b.kind === 'receiveMessage' && b.mailbox).sort()).toEqual([1, 2]);
      for (const r of read)
        expect(wiredFrom(robot, r)).toEqual(expect.arrayContaining(['received', 'value']));
    },
  );

  it.skipIf(!files1.includes('Rhythm_Echo.rbt') || !files1.includes('Robo_Mower.rbt'))(
    'wired Sound durations and a random number into a Switch',
    () => {
      const echo = load1('Rhythm_Echo.rbt').program;
      expect(
        all(echo).filter((b) => b.kind === 'sound' && wiredTo(echo, b).includes('duration')),
      ).toHaveLength(2);
      const mower = load1('Robo_Mower.rbt').program;
      const random = all(mower).find((b) => b.kind === 'random')!;
      expect(random).toMatchObject({ min: 1, max: 4 });
      expect(wiredFrom(mower, random)).toEqual(['value']);
    },
  );

  it.skipIf(!files1.includes('Segway.rbt'))(
    'Segway: the tilt reaches both motors and the "fallen over" range (outside)',
    () => {
      const { program } = load1('Segway.rbt');
      const blocks = all(program);
      const range = blocks.find((b) => b.kind === 'range')!;
      expect(range).toMatchObject({ low: -1000, high: 1000, inside: false });
      expect(wiredTo(program, range)).toContain('value');
      const motors = blocks.filter(
        (b) => b.kind === 'motor' && wiredTo(program, b).includes('power'),
      );
      expect(motors.length).toBeGreaterThanOrEqual(2);
    },
  );

  it.skipIf(!files1.includes('Whack-a-Brick.rbt'))(
    'Whack-a-Brick: whole-number Math, Compare, Number To Text and Random',
    () => {
      const { program, warnings } = load1('Whack-a-Brick.rbt');
      expect(warnings).toEqual([]);
      const blocks: Block[] = [];
      const walk = (list: Block[]) =>
        list.forEach((b) => {
          blocks.push(b);
          if (b.kind === 'loop') walk(b.body);
          if (b.kind === 'switch') {
            walk(b.whenTrue);
            walk(b.whenFalse);
            b.cases?.forEach((c) => walk(c.blocks));
          }
        });
      walk(program.body);
      program.parallel.forEach(walk);
      // A brick is drawn at x = position × 34 − 24 (10, 44, 78 on the 100-pixel screen).
      const math = blocks.filter((b) => b.kind === 'math').map((b) => [b.op, b.b]);
      expect(math).toEqual(
        expect.arrayContaining([
          ['*', 34],
          ['-', 24],
          ['+', 1],
          ['-', 15],
        ]),
      );
      expect(blocks.find((b) => b.kind === 'compare')).toMatchObject({ op: '=' });
      expect(blocks.find((b) => b.kind === 'random')).toMatchObject({ min: 1, max: 3 });
      expect(blocks.some((b) => b.kind === 'numberToText')).toBe(true);
    },
  );
});

describe('Pack and Go (.rbtx)', async () => {
  const { deflateRawSync } = await import('node:zlib');
  const { importRbtx, unzip } = await import('./index.js');

  /** A minimal zip with deflated entries, like the NXT software writes. */
  function zip(entries: [string, Uint8Array][]): Uint8Array {
    const parts: number[] = [];
    const central: number[] = [];
    const u16 = (a: number[], n: number) => a.push(n & 255, (n >> 8) & 255);
    const u32 = (a: number[], n: number) =>
      a.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
    for (const [name, data] of entries) {
      const packed = deflateRawSync(data);
      const offset = parts.length;
      u32(parts, 0x04034b50);
      [20, 0, 8, 0, 0].forEach((n) => u16(parts, n));
      u32(parts, 0);
      u32(parts, packed.length);
      u32(parts, data.length);
      u16(parts, name.length);
      u16(parts, 0);
      parts.push(...Buffer.from(name, 'latin1'), ...packed);
      u32(central, 0x02014b50);
      [20, 20, 0, 8, 0, 0].forEach((n) => u16(central, n));
      u32(central, 0);
      u32(central, packed.length);
      u32(central, data.length);
      [name.length, 0, 0, 0, 0].forEach((n) => u16(central, n));
      u32(central, 0);
      u32(central, offset);
      central.push(...Buffer.from(name, 'latin1'));
    }
    const end: number[] = [];
    u32(end, 0x06054b50);
    [0, 0, entries.length, entries.length].forEach((n) => u16(end, n));
    u32(end, central.length);
    u32(end, parts.length);
    u16(end, 0);
    return Uint8Array.from([...parts, ...central, ...end]);
  }

  it('unzips deflated entries', async () => {
    const text = new TextEncoder().encode('hello hello hello hello');
    const files = await unzip(
      zip([
        ['a.txt', text],
        ['dir/b.rso', Uint8Array.of(1, 0, 0, 0)],
      ]),
    );
    expect(files.map((f) => f.name)).toEqual(['a.txt', 'b.rso']);
    expect(new TextDecoder().decode(files[0]!.bytes)).toBe('hello hello hello hello');
  });

  const rbtxDir = join(import.meta.dirname, '../../../fixtures/external/rbtx');
  const packs = existsSync(rbtxDir) ? readdirSync(rbtxDir).filter((f) => f.endsWith('.rbtx')) : [];
  it.skipIf(packs.length === 0).each(packs)(
    '%s: program, My Blocks and sounds (local only)',
    async (name) => {
      const result = await importRbtx(new Uint8Array(readFileSync(join(rbtxDir, name))));
      expect(result.warnings.filter((w) => /not in the Pack and Go/.test(w))).toEqual([]);
      expect(result.program.myBlocks.length).toBeGreaterThan(2);
      for (const m of result.program.myBlocks) expect(m.body.length).toBeGreaterThan(0);
      expect(result.files.some((f) => f.name.endsWith('.rso'))).toBe(true);
      expect(
        validateProgram(result.program)
          .filter((i) => i.severity === 'error')
          .map((i) => i.message),
      ).toEqual([]);
      expect(() => lowerProgram(result.program)).not.toThrow();
    },
  );
});
