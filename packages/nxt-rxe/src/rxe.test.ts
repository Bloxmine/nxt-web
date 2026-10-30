import { describe, expect, it } from 'vitest';
import { CodeBuilder } from './code.js';
import { Dataspace, T, stringBytes } from './dataspace.js';
import { CMP, OP, TC } from './opcodes.js';
import { initialValues, readRxe } from './reader.js';
import { writeRxe } from './writer.js';

/** The 84-byte example program from the specification ("Adding scalar numbers"). */
const SPEC_EXAMPLE = [
  '4D69 6E64 7374 6F72 6D73 4E58 5400 0005',
  '0300 1600 0C00 0F00 0500 0A00 0000 0000',
  '0C00 0100 0700 0601 0000 0600 0400 0100',
  '0800 8813 0000 010C 000A 0001 00FF FFFF',
  'FFFF 0000 0000 0080 0000 0100 0200 2A60',
  'FFFF FFFF',
]
  .join(' ')
  .split(' ')
  .flatMap((w) => [parseInt(w.slice(0, 2), 16), parseInt(w.slice(2), 16)]);

describe('.rxe writer', () => {
  it('reproduces the specification example byte for byte', () => {
    const ds = new Dataspace();
    const dest = ds.add(T.slong, 0);
    const a = ds.add(T.slong, 5000);
    const b = ds.add(T.ubyte, 1);
    const code = new CodeBuilder();
    code.emit(OP.ADD, [dest.id, a.id, b.id]);
    code.emit(OP.FINCLUMP, [0xffff, 0xffff]);
    const bytes = writeRxe({
      dataspace: ds,
      clumps: [{ fireCount: 0, dependents: [], code: code.finish() }],
    });
    // The example's padding byte is 0xFF (any value is allowed).
    const hex = (b: ArrayLike<number>) =>
      Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
    expect(hex(bytes)).toBe(hex(SPEC_EXAMPLE));
  });

  it('reads back the example', () => {
    const file = readRxe(Uint8Array.from(SPEC_EXAMPLE));
    expect(file.dataspace).toMatchObject({ count: 3, initialSize: 22, staticSize: 12 });
    expect(file.toc.map((t) => t.descriptor)).toEqual([0, 4, 8]);
    expect(file.code).toEqual([0x8000, 0, 1, 2, 0x602a, 0xffff, 0xffff]);
    expect([...initialValues(file)]).toEqual([
      [0, 0],
      [1, 5000],
      [2, 1],
    ]);
  });

  it('lays out arrays, strings, clusters and mutexes and reads them back', () => {
    const ds = new Dataspace();
    const n = ds.add(T.sword, -2);
    const text = ds.add(T.string, stringBytes('Hi'));
    const empty = ds.add(T.array(TC.SLONG));
    const cluster = ds.add(T.cluster(T.sbyte, T.string, T.ulong), [-1, stringBytes('ab'), 7]);
    const mutex = ds.add(T.mutex);
    const longs = ds.add(T.array(TC.SLONG), [1, -1, 100000]);
    const file = readRxe(
      writeRxe({
        dataspace: ds,
        clumps: [{ fireCount: 0, dependents: [], code: [0x602a, 0xffff, 0xffff] }],
      }),
    );
    const values = initialValues(file);
    expect(values.get(n.id)).toBe(-2);
    expect(values.get(text.id)).toEqual([72, 105, 0]);
    expect(values.get(empty.id)).toEqual([]);
    expect(cluster.fields.map((f) => values.get(f.id))).toEqual([-1, [97, 98, 0], 7]);
    expect(values.has(mutex.id)).toBe(false);
    expect(values.get(longs.id)).toEqual([1, -1, 100000]);
    // Root DV plus one per array; static data ends on a 4-byte boundary.
    expect(file.dataspace.staticSize % 4).toBe(0);
    expect(file.dataspace.dopeVectorOffset).toBe(file.dataspace.staticSize);
    // Memory manager list: head and tail are the arrays with the lowest/highest offsets.
    expect(file.dataspace.memMgrHead).toBeGreaterThan(0);
    expect(file.dataspace.memMgrTail).toBeGreaterThan(0);
  });

  it('encodes branches as word offsets from the branch instruction', () => {
    const code = new CodeBuilder();
    const top = code.label();
    const end = code.label();
    code.mark(top);
    code.brtst(CMP.EQ, end, 3); // word 0
    code.jmp(top); // word 3
    code.mark(end);
    code.emitVariable(OP.STRCAT, [1, 2, 3]); // word 5
    expect(code.finish()).toEqual([
      0x6027 | (CMP.EQ << 8),
      5,
      3,
      0x4025,
      0xfffd,
      0xe021,
      10,
      1,
      2,
      3,
    ]);
  });
});
