import { newId } from './ids.js';
import type { Block, MyBlockParamDef, Program, Wire } from './model.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
import {
  childSequences,
  findBlock,
  insertBlock,
  isWithin,
  pruneWires,
  roots,
  updateSequence,
  walk,
  type SeqRef,
} from './tree.js';

/** Blocks copied to the clipboard, with the wires that run between them. */
export interface Clip {
  format: 'nxt-web-studio-blocks';
  blocks: Block[];
  wires: Wire[];
}

/**
 * The selected blocks in program order, leaving out any that sit inside another
 * selected block (copying a loop copies its contents).
 */
export function topSelected(program: Program, ids: readonly string[]): Block[] {
  const set = new Set(ids);
  const result: Block[] = [];
  for (const r of roots(program)) {
    walk(r.blocks, (b) => {
      if (set.has(b.id) && !ids.some((other) => other !== b.id && isWithin(program, b.id, other))) {
        result.push(b);
      }
    });
  }
  return result;
}

/** Copies blocks and the wires between them. */
export function copyBlocks(program: Program, ids: readonly string[]): Clip {
  const blocks = topSelected(program, ids);
  const inside = new Set<string>();
  walk(blocks, (b) => inside.add(b.id));
  const wires = program.wires.filter((w) => inside.has(w.from.block) && inside.has(w.to.block));
  return { format: 'nxt-web-studio-blocks', blocks: clone(blocks), wires: clone(wires) };
}

/** True if a value read from the clipboard is a {@link Clip}. */
export function isClip(value: unknown): value is Clip {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Clip).format === 'nxt-web-studio-blocks' &&
    Array.isArray((value as Clip).blocks)
  );
}

function renumber(block: Block, ids: Map<string, string>): Block {
  const id = newId('b');
  ids.set(block.id, id);
  const copy = { ...clone(block), id } as Block;
  if (copy.kind === 'loop') copy.body = copy.body.map((b) => renumber(b, ids));
  if (copy.kind === 'switch') {
    copy.whenTrue = copy.whenTrue.map((b) => renumber(b, ids));
    copy.whenFalse = copy.whenFalse.map((b) => renumber(b, ids));
    if (copy.cases)
      copy.cases = copy.cases.map((c) => ({ ...c, blocks: c.blocks.map((b) => renumber(b, ids)) }));
  }
  return copy;
}

/**
 * Inserts copies of the clip's blocks (with new ids) into a sequence at `index`.
 * Returns the new program and the ids of the pasted top-level blocks.
 */
export function pasteBlocks(
  program: Program,
  clip: Clip,
  ref: SeqRef,
  index: number,
): { program: Program; ids: string[] } {
  const ids = new Map<string, string>();
  const blocks = clip.blocks.map((b) => renumber(b, ids));
  let next = program;
  blocks.forEach((b, i) => {
    next = insertBlock(next, ref, index + i, b);
  });
  const wires = clip.wires.flatMap((w) => {
    const from = ids.get(w.from.block);
    const to = ids.get(w.to.block);
    return from && to
      ? [{ id: newId('w'), from: { ...w.from, block: from }, to: { ...w.to, block: to } }]
      : [];
  });
  return { program: { ...next, wires: [...next.wires, ...wires] }, ids: blocks.map((b) => b.id) };
}

/** Removes several blocks (and their contents and wires). */
export function removeBlocks(program: Program, ids: readonly string[]): Program {
  let next = program;
  for (const b of topSelected(program, ids)) {
    const found = findBlock(next, b.id);
    if (found)
      next = updateSequence(next, found.ref, (blocks) => blocks.filter((x) => x.id !== b.id));
  }
  return pruneWires(next);
}

/** Every block by id, with its JSON (children left out) to spot changes. */
function blockIndex(program: Program): Map<string, { block: Block; json: string }> {
  const map = new Map<string, { block: Block; json: string }>();
  for (const r of roots(program)) {
    walk(r.blocks, (b) => {
      const shallow: Record<string, unknown> = { ...b };
      for (const c of childSequences(b))
        delete shallow[c.branch.startsWith('case:') ? 'cases' : c.branch];
      if (b.kind === 'switch' && b.cases) shallow['cases'] = b.cases.map((c) => c.value);
      map.set(b.id, { block: b, json: JSON.stringify(shallow) });
    });
  }
  return map;
}

/** A short description of what changed between two versions, for the undo history. */
export function describeChange(
  before: Program,
  after: Program,
  label: (b: Block) => string,
): string {
  if (before.name !== after.name) return `Renamed program to “${after.name}”`;
  const a = blockIndex(before);
  const b = blockIndex(after);
  const added = [...b.keys()].filter((id) => !a.has(id));
  const removed = [...a.keys()].filter((id) => !b.has(id));
  const name = (list: string[], index: Map<string, { block: Block }>) => {
    const first = index.get(list[0]!)!.block;
    return list.length === 1 ? label(first) : `${list.length} blocks`;
  };
  if (added.length && !removed.length) return `Added ${name(added, b)}`;
  if (removed.length && !added.length) return `Deleted ${name(removed, a)}`;
  if (added.length && removed.length) return `Replaced ${name(removed, a)}`;
  const changed = [...b.keys()].filter((id) => a.get(id)!.json !== b.get(id)!.json);
  if (changed.length === 1) return `Changed ${label(b.get(changed[0]!)!.block)}`;
  if (changed.length > 1) return `Changed ${changed.length} blocks`;
  if (after.wires.length > before.wires.length) return 'Added a data wire';
  if (after.wires.length < before.wires.length) return 'Removed a data wire';
  if (JSON.stringify(before.variables) !== JSON.stringify(after.variables))
    return 'Changed variables';
  if (JSON.stringify(before.comments ?? []) !== JSON.stringify(after.comments ?? []))
    return 'Edited a comment';
  if (after.parallel.length !== before.parallel.length) {
    return after.parallel.length > before.parallel.length
      ? 'Added a parallel beam'
      : 'Removed a parallel beam';
  }
  if (after.myBlocks.length !== before.myBlocks.length) return 'Changed My Blocks';
  return 'Moved blocks';
}

/**
 * Copies each My Block's parameters (its parameter blocks, in order) onto every call
 * of it, and drops wires to plugs that no longer exist. Returns the same program
 * object when nothing changed.
 */
export function syncMyBlockParams(program: Program): Program {
  const params = new Map<string, MyBlockParamDef[]>();
  for (const def of program.myBlocks) {
    const list: MyBlockParamDef[] = [];
    walk(def.body, (b) => {
      if (b.kind === 'myBlockParam')
        list.push({ name: b.name, type: b.valueType, direction: b.direction });
    });
    params.set(def.id, list);
  }
  let changed = false;
  const fix = (blocks: Block[]): Block[] =>
    blocks.map((b) => {
      let next = b;
      if (b.kind === 'myBlock') {
        const want = params.get(b.ref) ?? [];
        if (JSON.stringify(want) !== JSON.stringify(b.params ?? [])) {
          changed = true;
          next = { ...b, params: want };
        }
      }
      if (next.kind === 'loop') return { ...next, body: fix(next.body) };
      if (next.kind === 'switch') {
        return {
          ...next,
          whenTrue: fix(next.whenTrue),
          whenFalse: fix(next.whenFalse),
          ...(next.cases
            ? { cases: next.cases.map((c) => ({ ...c, blocks: fix(c.blocks) })) }
            : {}),
        };
      }
      return next;
    });
  const next: Program = {
    ...program,
    body: fix(program.body),
    parallel: program.parallel.map(fix),
    myBlocks: program.myBlocks.map((m) => ({ ...m, body: fix(m.body) })),
  };
  return changed ? pruneWires(next) : program;
}
