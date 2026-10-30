import type { Block, MotorPort, Program } from './model.js';
import { labelOf } from './catalog.js';
import { roots, walk } from './tree.js';

/** A suggestion about something that is allowed but probably not what was meant. */
export interface Tip {
  blockId: string | null;
  message: string;
}

const motorsOf = (b: Block): MotorPort[] =>
  b.kind === 'move' ? b.ports : b.kind === 'motor' ? [b.port] : [];

/** True if running `blocks` can take time (waits, limited moves, loops, sounds that wait…). */
function takesTime(blocks: readonly Block[]): boolean {
  let slow = false;
  walk(blocks, (b) => {
    if (
      b.kind === 'wait' ||
      b.kind === 'loop' ||
      (b.kind === 'move' && b.duration.unit !== 'unlimited') ||
      (b.kind === 'motor' && b.duration.unit !== 'unlimited' && b.wait) ||
      (b.kind === 'sound' && b.wait)
    ) {
      slow = true;
    }
  });
  return slow;
}

/**
 * Program checker: plain-language tips on top of the errors and warnings from
 * `validateProgram`. Nothing here stops a program from running.
 */
export function checkProgram(program: Program): Tip[] {
  const tips: Tip[] = [];
  const add = (block: Block | null, message: string) =>
    tips.push({ blockId: block?.id ?? null, message });

  // Motors still running when a beam ends: the program stops them at once.
  const main = program.body;
  const last = main[main.length - 1];
  if (
    last &&
    (last.kind === 'move' || last.kind === 'motor') &&
    last.direction !== 'stop' &&
    last.duration.unit === 'unlimited'
  ) {
    add(
      last,
      `The program ends right after "${labelOf(last)}" starts the motors, so they stop at once. Add a Wait after it, or give it a duration.`,
    );
  }

  // Two beams driving the same motor fight over it.
  const beams = [program.body, ...program.parallel];
  const users = new Map<MotorPort, number[]>();
  beams.forEach((beam, i) =>
    walk(beam, (b) => {
      for (const port of motorsOf(b)) {
        const list = users.get(port) ?? [];
        if (!list.includes(i)) list.push(i);
        users.set(port, list);
      }
    }),
  );
  for (const [port, list] of users) {
    if (list.length > 1)
      tips.push({
        blockId: null,
        message: `Motor ${port} is used on ${list.length} beams at once; they will fight over it.`,
      });
  }

  // Variables: read but never set, or defined but never used.
  const reads = new Map<string, Block>();
  const writes = new Set<string>();
  for (const r of roots(program)) {
    walk(r.blocks, (b) => {
      if (b.kind === 'variable') {
        if (b.action === 'read') reads.set(b.name, b);
        else writes.add(b.name);
      }
      if (b.kind === 'display' && b.action === 'variable') reads.set(b.variable, b);
    });
  }
  for (const [name, b] of reads) {
    if (!writes.has(name)) add(b, `Variable "${name}" is read but never set, so it is always 0.`);
  }
  for (const v of program.variables) {
    if (!reads.has(v.name) && !writes.has(v.name) && v.name !== 'Number 1') {
      tips.push({ blockId: null, message: `Variable "${v.name}" is never used.` });
    }
  }

  for (const r of roots(program)) {
    walk(r.blocks, (b) => {
      if (b.kind === 'display' && b.action === 'text' && b.x + b.text.length * 6 > 100) {
        add(
          b,
          `"${b.text}" does not fit on the screen from x = ${b.x}: the brick shows 16 characters per line.`,
        );
      }
      if (b.kind === 'wait' && b.control.type === 'time' && b.control.seconds === 0) {
        add(b, 'This Wait waits 0 seconds.');
      }
      if (b.kind === 'move' && b.direction !== 'stop' && b.power === 0) {
        add(
          b,
          'This Move block has power 0, so the robot does not move. Use Direction: Stop to stop.',
        );
      }
      if (
        b.kind === 'loop' &&
        b.control.type === 'forever' &&
        b.body.length > 0 &&
        !takesTime(b.body)
      ) {
        if (
          b.body.every((x) => x.kind === 'display' || x.kind === 'variable' || x.kind === 'math')
        ) {
          add(
            b,
            'This loop repeats very fast without waiting; add a short Wait so the screen can keep up.',
          );
        }
      }
    });
    // A sound that does not wait, directly followed by another sound, is cut off.
    const seqs: Block[][] = [r.blocks];
    walk(r.blocks, (b) => {
      if (b.kind === 'loop') seqs.push(b.body);
      if (b.kind === 'switch')
        seqs.push(b.whenTrue, b.whenFalse, ...(b.cases ?? []).map((c) => c.blocks));
    });
    for (const seq of seqs) {
      seq.forEach((b, i) => {
        const next = seq[i + 1];
        if (b.kind === 'sound' && b.action === 'tone' && !b.wait && next?.kind === 'sound') {
          add(
            b,
            'This tone does not wait, so the next sound block cuts it off. Tick "Wait for completion".',
          );
        }
      });
    }
  }
  return tips;
}
