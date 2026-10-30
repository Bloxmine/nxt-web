import type { Block, Program } from './model.js';
import { findPlug } from './plugs.js';

/** Which nested sequence of a container block. */
/** Which nested sequence: loop body, switch true/false branch, or value-switch case n. */
export type Branch = 'body' | 'whenTrue' | 'whenFalse' | `case:${number}`;

/**
 * Points at one sequence of blocks: the root of the main program or of a My
 * Block (`parent` null), or a branch of a loop or switch.
 */
export interface SeqRef {
  /** "main", a parallel lane "main#1", "main#2"…, or a My Block id. */
  root: string;
  /** Container block id, or null for the root sequence. */
  parent: string | null;
  branch: Branch;
}

export const MAIN: SeqRef = { root: 'main', parent: null, branch: 'body' };

/** The nested sequences of a block (empty for non-containers). */
export function childSequences(block: Block): { branch: Branch; blocks: Block[] }[] {
  if (block.kind === 'loop') return [{ branch: 'body', blocks: block.body }];
  if (block.kind === 'switch') {
    if (block.cases) {
      return block.cases.map((c, i) => ({ branch: `case:${i}` as Branch, blocks: c.blocks }));
    }
    return [
      { branch: 'whenTrue', blocks: block.whenTrue },
      { branch: 'whenFalse', blocks: block.whenFalse },
    ];
  }
  return [];
}

function withChild(block: Block, branch: Branch, blocks: Block[]): Block {
  if (block.kind === 'loop' && branch === 'body') return { ...block, body: blocks };
  if (block.kind === 'switch' && branch === 'whenTrue') return { ...block, whenTrue: blocks };
  if (block.kind === 'switch' && branch === 'whenFalse') return { ...block, whenFalse: blocks };
  if (block.kind === 'switch' && block.cases && branch.startsWith('case:')) {
    const i = Number(branch.slice(5));
    return { ...block, cases: block.cases.map((c, k) => (k === i ? { ...c, blocks } : c)) };
  }
  throw new Error(`Block ${block.id} has no "${branch}" branch`);
}

/** Root id of parallel lane `n` (1-based); lane 0 is "main". */
export function laneRoot(n: number): string {
  return n === 0 ? 'main' : `main#${n}`;
}

/** Lane number of a root id, or null if it is not a main-program lane. */
export function laneOf(root: string): number | null {
  if (root === 'main') return 0;
  const match = /^main#(\d+)$/.exec(root);
  return match ? Number(match[1]) : null;
}

/** The editor tab a root belongs to: all lanes live on the "main" tab. */
export function tabOf(root: string): string {
  return laneOf(root) === null ? root : 'main';
}

/** All root sequences: the main beam, its parallel lanes, and each My Block. */
export function roots(program: Program): { root: string; blocks: Block[] }[] {
  return [
    { root: 'main', blocks: program.body },
    ...program.parallel.map((blocks, i) => ({ root: laneRoot(i + 1), blocks })),
    ...program.myBlocks.map((m) => ({ root: m.id, blocks: m.body })),
  ];
}

function rootBlocks(program: Program, root: string): Block[] {
  const lane = laneOf(root);
  if (lane === 0) return program.body;
  if (lane !== null) {
    const blocks = program.parallel[lane - 1];
    if (!blocks) throw new Error(`Unknown lane ${root}`);
    return blocks;
  }
  const def = program.myBlocks.find((m) => m.id === root);
  if (!def) throw new Error(`Unknown My Block ${root}`);
  return def.body;
}

function withRoot(program: Program, root: string, blocks: Block[]): Program {
  const lane = laneOf(root);
  if (lane === 0) return { ...program, body: blocks };
  if (lane !== null) {
    return { ...program, parallel: program.parallel.map((b, i) => (i === lane - 1 ? blocks : b)) };
  }
  return {
    ...program,
    myBlocks: program.myBlocks.map((m) => (m.id === root ? { ...m, body: blocks } : m)),
  };
}

/**
 * Adds an empty parallel beam. With `afterLane` (0 = main beam) the new beam
 * goes directly below that one; otherwise it goes at the bottom.
 */
export function addLane(program: Program, afterLane?: number): Program {
  const at =
    afterLane === undefined
      ? program.parallel.length
      : Math.min(afterLane, program.parallel.length);
  return {
    ...program,
    parallel: [...program.parallel.slice(0, at), [], ...program.parallel.slice(at)],
  };
}

/** Removes parallel lane `n` (1-based) and any wires to its blocks. */
export function removeLane(program: Program, n: number): Program {
  if (n < 1 || n > program.parallel.length) return program;
  return pruneWires({ ...program, parallel: program.parallel.filter((_, i) => i !== n - 1) });
}

/**
 * Drops wires whose blocks or plugs no longer exist (after a delete, or after a
 * setting change that removed a plug).
 */
export function pruneWires(program: Program): Program {
  if (program.wires.length === 0) return program;
  const blocks = new Map<string, Block>();
  for (const r of roots(program)) walk(r.blocks, (b) => blocks.set(b.id, b));
  const valid = (end: { block: string; plug: string }) => {
    const block = blocks.get(end.block);
    return block !== undefined && findPlug(block, end.plug) !== undefined;
  };
  const wires = program.wires.filter((w) => valid(w.from) && valid(w.to));
  return wires.length === program.wires.length ? program : { ...program, wires };
}

/** Calls `fn` for every block in a sequence, depth first. */
export function walk(
  blocks: readonly Block[],
  fn: (block: Block, depth: number) => void,
  depth = 0,
): void {
  for (const block of blocks) {
    fn(block, depth);
    for (const child of childSequences(block)) walk(child.blocks, fn, depth + 1);
  }
}

/** Calls `fn` for every block in the program, including My Block bodies. */
export function walkProgram(program: Program, fn: (block: Block, root: string) => void): void {
  for (const r of roots(program)) walk(r.blocks, (b) => fn(b, r.root));
}

/** Returns the blocks of a sequence. */
export function getSequence(program: Program, ref: SeqRef): Block[] {
  const top = rootBlocks(program, ref.root);
  if (ref.parent === null) return top;
  const found = findIn(top, ref.parent);
  if (!found) throw new Error(`Unknown block ${ref.parent}`);
  const child = childSequences(found.block).find((c) => c.branch === ref.branch);
  if (!child) throw new Error(`Block ${ref.parent} has no "${ref.branch}" branch`);
  return child.blocks;
}

function findIn(
  blocks: readonly Block[],
  id: string,
  parent: string | null = null,
  branch: Branch = 'body',
): { block: Block; parent: string | null; branch: Branch; index: number } | null {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.id === id) return { block, parent, branch, index: i };
    for (const child of childSequences(block)) {
      const found = findIn(child.blocks, id, block.id, child.branch);
      if (found) return found;
    }
  }
  return null;
}

/** Finds a block anywhere in the program. */
export function findBlock(
  program: Program,
  id: string,
): { block: Block; ref: SeqRef; index: number } | null {
  for (const r of roots(program)) {
    const found = findIn(r.blocks, id);
    if (found) {
      return {
        block: found.block,
        ref: { root: r.root, parent: found.parent, branch: found.branch },
        index: found.index,
      };
    }
  }
  return null;
}

function mapSequence(blocks: Block[], ref: SeqRef, fn: (blocks: Block[]) => Block[]): Block[] {
  if (ref.parent === null) return fn(blocks);
  return blocks.map((block) => {
    if (block.id === ref.parent) {
      const child = childSequences(block).find((c) => c.branch === ref.branch);
      if (!child) throw new Error(`Block ${block.id} has no "${ref.branch}" branch`);
      return withChild(block, ref.branch, fn(child.blocks));
    }
    let next = block;
    for (const child of childSequences(block)) {
      const mapped = mapSequence(child.blocks, ref, fn);
      if (mapped !== child.blocks) next = withChild(next, child.branch, mapped);
    }
    return next;
  });
}

/** Returns a new program with one sequence replaced by `fn(sequence)`. */
export function updateSequence(
  program: Program,
  ref: SeqRef,
  fn: (blocks: Block[]) => Block[],
): Program {
  return withRoot(program, ref.root, mapSequence(rootBlocks(program, ref.root), ref, fn));
}

/** Inserts a block into a sequence at `index` (clamped). */
export function insertBlock(program: Program, ref: SeqRef, index: number, block: Block): Program {
  return updateSequence(program, ref, (blocks) => {
    const i = Math.max(0, Math.min(index, blocks.length));
    return [...blocks.slice(0, i), block, ...blocks.slice(i)];
  });
}

function detachBlock(program: Program, id: string): Program {
  const found = findBlock(program, id);
  if (!found) return program;
  return updateSequence(program, found.ref, (blocks) => blocks.filter((b) => b.id !== id));
}

/** Removes a block (and its contents) and its wires. Unchanged if not found. */
export function removeBlock(program: Program, id: string): Program {
  return pruneWires(detachBlock(program, id));
}

/** Replaces a block with `fn(block)`, dropping wires to plugs that disappear. */
export function updateBlock(program: Program, id: string, fn: (block: Block) => Block): Program {
  const found = findBlock(program, id);
  if (!found) return program;
  return pruneWires(
    updateSequence(program, found.ref, (blocks) => blocks.map((b) => (b.id === id ? fn(b) : b))),
  );
}

/** True if `id` is `ancestorId` or nested inside it. */
export function isWithin(program: Program, id: string, ancestorId: string): boolean {
  if (id === ancestorId) return true;
  const ancestor = findBlock(program, ancestorId);
  if (!ancestor) return false;
  let inside = false;
  walk(
    childSequences(ancestor.block).flatMap((c) => c.blocks),
    (b) => {
      if (b.id === id) inside = true;
    },
  );
  return inside;
}

/**
 * Moves a block to `index` in another (or the same) sequence. `index` refers
 * to positions before the move. Moving a container into itself is ignored.
 */
export function moveBlock(program: Program, id: string, ref: SeqRef, index: number): Program {
  const found = findBlock(program, id);
  if (!found) return program;
  if (ref.parent !== null && isWithin(program, ref.parent, id)) return program;
  const sameSequence =
    found.ref.root === ref.root &&
    found.ref.parent === ref.parent &&
    found.ref.branch === ref.branch;
  const target = sameSequence && found.index < index ? index - 1 : index;
  return insertBlock(detachBlock(program, id), ref, target, found.block);
}
