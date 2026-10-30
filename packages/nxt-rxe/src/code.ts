import { OP, type ComparisonCode } from './opcodes.js';

/** A jump target inside one clump's code. */
export interface Label {
  readonly id: number;
}

const VARIABLE_SIZE = 0xe;

/**
 * First word of a long instruction. The spec numbers bits from the most significant
 * bit of each byte, so in the second byte the size is the high nibble and the flags
 * (comparison code) the low nibble: ADD with 3 arguments is bytes 00 80 (word 0x8000).
 */
export function instructionWord(opcode: number, size: number, flags: number): number {
  return (opcode & 0xff) | ((size & 0xf) << 12) | ((flags & 0xf) << 8);
}

/** Splits an instruction's first word into opcode, size (bytes) and flags. */
export function decodeInstructionWord(word: number): {
  opcode: number;
  size: number;
  flags: number;
} {
  return { opcode: word & 0xff, size: (word >> 12) & 0xf, flags: (word >> 8) & 0xf };
}

/**
 * Assembles the instructions of one clump (long encoding only). Branch offsets are
 * filled in by {@link finish}: they are signed code-word counts from the start of the
 * branch instruction to its target.
 */
export class CodeBuilder {
  private words: number[] = [];
  private labels = new Map<number, number>();
  private fixups: { at: number; instr: number; label: number }[] = [];
  private nextLabel = 0;

  /** Code words emitted so far. */
  get length(): number {
    return this.words.length;
  }

  /** An instruction with a fixed number of arguments. */
  emit(opcode: number, args: readonly number[], flags = 0): void {
    const size = 2 + 2 * args.length;
    if (size > 0xf || size === VARIABLE_SIZE) {
      throw new Error(`Instruction 0x${opcode.toString(16)} is too long for a fixed size`);
    }
    this.words.push(instructionWord(opcode, size, flags), ...args.map((a) => a & 0xffff));
  }

  /** A variable-length instruction (OP_ARRBUILD, OP_STRCAT, OP_SETOUT): size word first. */
  emitVariable(opcode: number, args: readonly number[]): void {
    const size = 4 + 2 * args.length;
    this.words.push(
      instructionWord(opcode, VARIABLE_SIZE, 0),
      size,
      ...args.map((a) => a & 0xffff),
    );
  }

  label(): Label {
    return { id: this.nextLabel++ };
  }

  /** Makes `label` point at the next instruction. */
  mark(label: Label): void {
    this.labels.set(label.id, this.words.length);
  }

  jmp(target: Label): void {
    this.branch(OP.JMP, target, [], 0);
  }

  /** Jumps when `a <cmp> b`. */
  brcmp(cmp: ComparisonCode, target: Label, a: number, b: number): void {
    this.branch(OP.BRCMP, target, [a, b], cmp);
  }

  /** Jumps when `a <cmp> 0`. */
  brtst(cmp: ComparisonCode, target: Label, a: number): void {
    this.branch(OP.BRTST, target, [a], cmp);
  }

  private branch(opcode: number, target: Label, rest: number[], flags: number): void {
    const instr = this.words.length;
    this.emit(opcode, [0, ...rest], flags);
    this.fixups.push({ at: instr + 1, instr, label: target.id });
  }

  /** The finished code words with branch offsets resolved. */
  finish(): number[] {
    for (const f of this.fixups) {
      const target = this.labels.get(f.label);
      if (target === undefined) throw new Error('Branch to a label that was never marked');
      this.words[f.at] = (target - f.instr) & 0xffff;
    }
    return [...this.words];
  }
}
