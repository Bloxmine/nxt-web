import type { Block, Program } from './model.js';

/** Which nested sequence of a container block. */
export type Branch = 'body' | 'whenTrue' | 'whenFalse';

/**
 * Points at one sequence of blocks: the root of the main program or of a My
 * Block (`parent` null), or a branch of a loop or switch.
 */
export interface SeqRef {
  /** "main" or a My Block id. */
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
  throw new Error(`Block ${block.id} has no "${branch}" branch`);
}

/** All root sequences: the main program and each My Block. */
export function roots(program: Program): { root: string; blocks: Block[] }[] {
  return [
    { root: 'main', blocks: program.body },
    ...program.myBlocks.map((m) => ({ root: m.id, blocks: m.body })),
  ];
}

function rootBlocks(program: Program, root: string): Block[] {
  if (root === 'main') return program.body;
  const def = program.myBlocks.find((m) => m.id === root);
  if (!def) throw new Error(`Unknown My Block ${root}`);
  return def.body;
}

function withRoot(program: Program, root: string, blocks: Block[]): Program {
  if (root === 'main') return { ...program, body: blocks };
  return {
    ...program,
    myBlocks: program.myBlocks.map((m) => (m.id === root ? { ...m, body: blocks } : m)),
  };
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

/** Removes a block (and its contents). Returns the program unchanged if not found. */
export function removeBlock(program: Program, id: string): Program {
  const found = findBlock(program, id);
  if (!found) return program;
  return updateSequence(program, found.ref, (blocks) => blocks.filter((b) => b.id !== id));
}

/** Replaces a block with `fn(block)`. */
export function updateBlock(program: Program, id: string, fn: (block: Block) => Block): Program {
  const found = findBlock(program, id);
  if (!found) return program;
  return updateSequence(program, found.ref, (blocks) =>
    blocks.map((b) => (b.id === id ? fn(b) : b)),
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
  return insertBlock(removeBlock(program, id), ref, target, found.block);
}
