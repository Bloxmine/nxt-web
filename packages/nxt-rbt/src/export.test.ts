import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkProgram, type Block, type Program } from '@nxt/blocks';
import { describe, expect, it } from 'vitest';
import {
  DataSpace,
  exportRbt,
  importRbt,
  originOf,
  parseRsrc,
  RbtExportError,
  resourcesOfType,
  rewriteRsrc,
  steeringRatio,
  steeringSlider,
} from './index.js';

describe('steering table', () => {
  it('maps slider positions to turn ratios and back', () => {
    expect([0, 8, 10, -10].map(steeringRatio)).toEqual([0, 17, 100, -100]);
    expect([0, 17, 100, -100, 50, 4].map(steeringSlider)).toEqual([0, 8, 10, -10, 9, 2]);
  });
});

const dir = join(import.meta.dirname, '../../../fixtures/external/nxtprograms');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.rbt')) : [];
const load = (name: string) => {
  const bytes = new Uint8Array(readFileSync(join(dir, name)));
  const result = importRbt(bytes, name);
  return { bytes, result, origin: originOf(result, bytes, name) };
};
const blocks = (p: Program) => {
  const list: Block[] = [];
  walkProgram(p, (b) => list.push(b));
  return list;
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A changed copy of a block's settings, or null if the exporter does not handle it. */
function mutate(b: Block): Block | null {
  switch (b.kind) {
    case 'move':
      return {
        ...b,
        power: b.power === 50 ? 60 : 50,
        steering: b.steering === 33 ? -17 : 33,
        direction: b.direction === 'backward' ? 'forward' : 'backward',
        duration: { unit: 'degrees', value: 123 },
        nextAction: b.nextAction === 'brake' ? 'coast' : 'brake',
      };
    case 'motor':
      return {
        ...b,
        power: b.power === 40 ? 45 : 40,
        duration: { unit: 'seconds', value: 1.5 },
        wait: !b.wait,
      };
    case 'sound':
      return b.action === 'stop'
        ? null
        : { ...b, frequency: 523, seconds: 0.7, volume: b.volume === 25 ? 50 : 25 };
    case 'display':
      return b.action === 'text' ? { ...b, text: 'Hi there', x: 12, line: 3 } : null;
    case 'wait':
      return b.control.type === 'time' ? { ...b, control: { type: 'time', seconds: 2.5 } } : null;
    case 'loop':
      if (b.control.type === 'count') return { ...b, control: { type: 'count', count: 7 } };
      if (b.control.type === 'time') return { ...b, control: { type: 'time', seconds: 1.2 } };
      return null;
    case 'math':
      return { ...b, b: 7, op: '*' };
    case 'compare':
      return { ...b, b: 42, op: '>' };
    case 'random':
      return { ...b, min: 3, max: 9 };
    case 'text':
      return { ...b, a: 'Hello' };
    case 'constant':
      return b.valueType === 'number' ? { ...b, number: 123 } : null;
    case 'colorLamp':
      return { ...b, color: b.color === 'blue' ? 'green' : 'blue' };
    default:
      return null;
  }
}

/** The settings `mutate` changed, as the importer should read them back. */
function expected(b: Block): Record<string, unknown> {
  const pick = (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, (b as unknown as Record<string, unknown>)[k]]));
  switch (b.kind) {
    case 'move':
      return pick(['power', 'steering', 'direction', 'duration', 'nextAction']);
    case 'motor':
      return pick(['power', 'duration', 'wait']);
    case 'sound':
      return pick(['frequency', 'seconds', 'volume']);
    case 'display':
      return pick(['text', 'x', 'line']);
    case 'wait':
    case 'loop':
      return pick(['control']);
    case 'math':
    case 'compare':
      return pick(['b', 'op']);
    case 'random':
      return pick(['min', 'max']);
    case 'text':
      return pick(['a']);
    case 'constant':
      return pick(['number']);
    case 'colorLamp':
      return pick(['color']);
    default:
      return {};
  }
}

describe.skipIf(files.length === 0)('writing .rbt files back (local only)', () => {
  it.each(files)('%s: unchanged program gives the identical file', (name) => {
    const { bytes, result, origin } = load(name);
    expect(Buffer.compare(Buffer.from(exportRbt(result.program, origin)), Buffer.from(bytes))).toBe(
      0,
    );
  });

  it.each(files)('%s: every editable setting survives export and re-import', (name) => {
    const { result, origin } = load(name);
    const program = clone(result.program);
    const changed = new Map<number, Record<string, unknown>>();
    const list = blocks(program);
    list.forEach((b, i) => {
      const next = mutate(b);
      if (!next) return;
      Object.assign(b, next);
      changed.set(i, expected(next));
    });
    if (changed.size === 0) return;
    const out = exportRbt(program, origin);
    const again = blocks(importRbt(out, name).program);
    expect(again.length).toBe(list.length);
    for (const [i, want] of changed) {
      const got = Object.fromEntries(
        Object.keys(want).map((k) => [k, (again[i] as unknown as Record<string, unknown>)[k]]),
      );
      expect({ block: list[i]!.kind, ...got }).toEqual({ block: list[i]!.kind, ...want });
    }
    // Untouched blocks read back exactly as before.
    blocks(result.program).forEach((b, i) => {
      if (changed.has(i)) return;
      const x = b as unknown as Record<string, unknown>;
      const y = again[i] as unknown as Record<string, unknown>;
      const strip = (o: Record<string, unknown>) =>
        JSON.stringify({
          ...o,
          id: undefined,
          body: undefined,
          whenTrue: undefined,
          whenFalse: undefined,
          cases: undefined,
        });
      expect(strip(y)).toBe(strip(x));
    });
    // Every embedded block still decodes completely.
    for (const v of resourcesOfType(parseRsrc(out), 'VINS').filter(
      (x) => x.id > 0 && x.data.length >= 6,
    )) {
      const vi = parseRsrc(v.data);
      expect(
        () =>
          new DataSpace(resourcesOfType(vi, 'DSTM')[0]!.data, resourcesOfType(vi, 'DFDS')[0]!.data),
      ).not.toThrow();
    }
  });

  it.skipIf(!files.includes('BumperCar.rbt'))('refuses structural changes', () => {
    const { result, origin } = load('BumperCar.rbt');
    const program = clone(result.program);
    program.body = [];
    expect(() => exportRbt(program, origin)).toThrow(RbtExportError);
  });

  it('rewriting a container without changes is the identity', () => {
    for (const name of files.slice(0, 5)) {
      const bytes = new Uint8Array(readFileSync(join(dir, name)));
      expect(Buffer.compare(Buffer.from(rewriteRsrc(bytes, new Map())), Buffer.from(bytes))).toBe(
        0,
      );
    }
  });
});
