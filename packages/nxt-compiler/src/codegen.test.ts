import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OP, SYSCALL, decodeInstructionWord, initialValues, readRxe } from '@nxt/rxe';
import { describe, expect, it } from 'vitest';
import { compileProgram } from './codegen.js';
import type { IrProgram, Stmt } from './ir.js';

const n = (value: number) => ({ kind: 'number', value }) as const;
const program = (main: Stmt[], extra: Partial<IrProgram> = {}): IrProgram => ({
  variables: [],
  sensors: {},
  subroutines: [],
  main,
  parallel: [],
  ...extra,
});

/** The Phase 3a spike: play a tone, wait, exit. */
const HELLO = program([
  { kind: 'tone', frequency: n(440), durationMs: n(500), volume: n(75), wait: true },
  { kind: 'wait', ms: n(500) },
  { kind: 'drawText', x: n(0), line: n(4), text: { kind: 'text', value: 'Hello NXT' } },
  { kind: 'wait', ms: n(2000) },
]);

/** Drive forward one rotation on B+C, turn, stop. Touch sensor on port 1. */
const DRIVE = program(
  [
    {
      kind: 'motor',
      ports: [1, 2],
      power: n(75),
      turnRatio: n(0),
      degrees: n(360),
      then: 'brake',
      regulated: true,
      wait: true,
    },
    {
      kind: 'waitUntil',
      condition: { kind: 'binary', op: '==', left: { kind: 'sensor', port: 0 }, right: n(1) },
    },
    { kind: 'motorStop', ports: [1, 2], mode: 'coast' },
  ],
  { sensors: { 0: 'touch' } },
);

const fixtures = join(import.meta.dirname, '../fixtures');

/** Golden files: set UPDATE_GOLDEN=1 to rewrite them after an intended change. */
function golden(name: string, bytes: Uint8Array) {
  const file = join(fixtures, name);
  if (process.env['UPDATE_GOLDEN'] || !existsSync(file)) {
    mkdirSync(fixtures, { recursive: true });
    writeFileSync(file, bytes);
  }
  expect([...bytes]).toEqual([...readFileSync(file)]);
}

/** Opcodes in a clump's code, in order. */
function opcodes(code: number[], from = 0, to = code.length): number[] {
  const ops: number[] = [];
  for (let pc = from; pc < to;) {
    const { opcode, size } = decodeInstructionWord(code[pc]!);
    ops.push(opcode);
    pc += (size === 0xe ? code[pc + 1]! : size) / 2;
  }
  return ops;
}

describe('compiler output', () => {
  it('hello.rxe matches the golden file', () => golden('hello.rxe', compileProgram(HELLO)));
  it('drive.rxe matches the golden file', () => golden('drive.rxe', compileProgram(DRIVE)));

  it('is a well-formed file: one clump, ends with OP_FINCLUMP, text in the dataspace', () => {
    const file = readRxe(compileProgram(HELLO));
    expect(file.clumps).toEqual([{ fireCount: 0, dependents: [], codeStart: 0 }]);
    const ops = opcodes(file.code);
    expect(ops[ops.length - 1]).toBe(OP.FINCLUMP);
    expect(ops.filter((o) => o === OP.SYSCALL)).toHaveLength(3); // start tick, tone, text
    const strings = [...initialValues(file).values()]
      .filter(Array.isArray)
      .map((b) => String.fromCharCode(...b.slice(0, -1)));
    expect(strings).toContain('Hello NXT');
    // Every SYSCALL names a parameter cluster that exists.
    for (let pc = 0; pc < file.code.length;) {
      const { opcode, size } = decodeInstructionWord(file.code[pc]!);
      if (opcode === OP.SYSCALL) {
        expect([SYSCALL.GetStartTick, SYSCALL.SoundPlayTone, SYSCALL.DrawText]).toContain(
          file.code[pc + 1],
        );
        expect(file.toc[file.code[pc + 2]!]!.type).toBe(8); // TC_CLUSTER
      }
      pc += (size === 0xe ? file.code[pc + 1]! : size) / 2;
    }
  });

  it('puts parallel beams and My Blocks in their own clumps', () => {
    const file = readRxe(
      compileProgram(
        program([{ kind: 'call', name: 'sub' }], {
          parallel: [[{ kind: 'call', name: 'sub' }]],
          subroutines: [{ name: 'sub', body: [{ kind: 'wait', ms: n(10) }] }],
        }),
      ),
    );
    expect(file.clumps.map((c) => c.fireCount)).toEqual([0, 0, 1]);
    const [main, lane, sub] = file.clumps;
    const mainOps = opcodes(file.code, main!.codeStart, lane!.codeStart);
    // Shared by two clumps, so calls are guarded by a mutex.
    expect(mainOps).toEqual(expect.arrayContaining([OP.ACQUIRE, OP.SUBCALL, OP.RELEASE]));
    expect(opcodes(file.code, sub!.codeStart).at(-1)).toBe(OP.SUBRET);
  });
});
