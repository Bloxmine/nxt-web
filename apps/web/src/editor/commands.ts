import {
  childSequences,
  copyBlocks,
  findBlock,
  getSequence,
  insertBlock,
  isClip,
  labelOf,
  moveBlock,
  pasteBlocks,
  removeBlocks,
  roots,
  walk,
  type Block,
  type Clip,
  type Program,
  type SeqRef,
} from '@nxt/blocks';
import type { Dispatch } from 'react';
import { blockSummary } from '../lib/summary';
import { selectedIds, type EditorAction, type EditorState } from './store';

/** Blocks copied inside this tab, used when the system clipboard is unavailable. */
let memoryClip: Clip | null = null;

/** Where new blocks go: after the selected block, or at the end of the active tab's beam. */
export function insertionPoint(state: EditorState): { ref: SeqRef; index: number } {
  const found = state.selected ? findBlock(state.program, state.selected) : null;
  if (found) return { ref: found.ref, index: found.index + 1 };
  const ref: SeqRef = { root: state.activeTab, parent: null, branch: 'body' };
  return { ref, index: getSequence(state.program, ref).length };
}

/** Editing commands that work on the selection: clipboard, delete, keyboard moves. */
export function editCommands(
  state: EditorState,
  dispatch: Dispatch<EditorAction>,
  notify: (message: string) => void,
) {
  const ids = selectedIds(state);

  const paste = (clip: Clip) => {
    const { ref, index } = insertionPoint(state);
    let pasted: string[] = [];
    dispatch({
      type: 'edit',
      update: (p) => {
        const result = pasteBlocks(p, clip, ref, index);
        pasted = result.ids;
        return result.program;
      },
    });
    dispatch({ type: 'selectMany', ids: pasted });
    notify(
      `Pasted ${clip.blocks.length === 1 ? labelOf(clip.blocks[0]!) : `${clip.blocks.length} blocks`}`,
    );
  };

  const copy = () => {
    if (ids.length === 0) return false;
    memoryClip = copyBlocks(state.program, ids);
    void navigator.clipboard?.writeText(JSON.stringify(memoryClip)).catch(() => {});
    notify(`Copied ${ids.length === 1 ? 'block' : `${ids.length} blocks`}`);
    return true;
  };

  return {
    copy,
    cut: () => {
      if (!copy()) return;
      dispatch({ type: 'edit', update: (p) => removeBlocks(p, ids), select: null });
    },
    paste: async () => {
      let clip = memoryClip;
      try {
        const text = await navigator.clipboard?.readText();
        const parsed: unknown = text ? JSON.parse(text) : null;
        if (isClip(parsed)) clip = parsed;
      } catch {
        // Not our data, or no permission: use the in-memory copy.
      }
      if (clip) paste(clip);
    },
    duplicate: () => {
      if (ids.length) paste(copyBlocks(state.program, ids));
    },
    deleteSelection: () => {
      if (ids.length) dispatch({ type: 'edit', update: (p) => removeBlocks(p, ids), select: null });
    },
    selectAll: () => {
      const all: string[] = [];
      const tabRoots = roots(state.program).filter(
        (r) =>
          r.root === state.activeTab || (state.activeTab === 'main' && r.root.startsWith('main')),
      );
      for (const r of tabRoots) for (const b of r.blocks) all.push(b.id);
      dispatch({ type: 'selectMany', ids: all });
    },
    /** Arrow keys: left/right along the beam, up to the container, down into it. */
    navigate: (direction: 'left' | 'right' | 'up' | 'down') => {
      const found = state.selected ? findBlock(state.program, state.selected) : null;
      if (!found) {
        const first = getSequence(state.program, {
          root: state.activeTab,
          parent: null,
          branch: 'body',
        })[0];
        if (first) dispatch({ type: 'select', id: first.id });
        return;
      }
      const seq = getSequence(state.program, found.ref);
      let target: Block | undefined;
      if (direction === 'left') target = seq[found.index - 1];
      if (direction === 'right') target = seq[found.index + 1];
      if (direction === 'up' && found.ref.parent)
        target = findBlock(state.program, found.ref.parent)?.block;
      if (direction === 'down')
        target = childSequences(found.block).find((c) => c.blocks.length)?.blocks[0];
      if (target) dispatch({ type: 'select', id: target.id });
    },
    /** Alt+arrow: moves the selected block one place along its beam. */
    shift: (by: -1 | 1) => {
      const found = state.selected ? findBlock(state.program, state.selected) : null;
      if (!found) return;
      const length = getSequence(state.program, found.ref).length;
      const to = found.index + (by > 0 ? 2 : -1);
      if (to < 0 || to > length) return;
      const id = found.block.id;
      dispatch({ type: 'edit', update: (p) => moveBlock(p, id, found.ref, to), select: id });
    },
    insert: (block: Block) => {
      const { ref, index } = insertionPoint(state);
      dispatch({
        type: 'edit',
        update: (p) => insertBlock(p, ref, index, block),
        select: block.id,
      });
      notify(`Inserted ${labelOf(block)}`);
    },
  };
}

/** Where a block sits, for screen readers: "Move, 2 of 5 on the main beam: ▲ 75 ∞". */
export function describeBlock(program: Program, id: string): string {
  const found = findBlock(program, id);
  if (!found) return '';
  const seq = getSequence(program, found.ref);
  const where = found.ref.parent
    ? `inside ${labelOf(findBlock(program, found.ref.parent)!.block)}`
    : found.ref.root === 'main'
      ? 'on the main beam'
      : found.ref.root.startsWith('main#')
        ? `on parallel beam ${found.ref.root.slice(5)}`
        : 'in the My Block';
  return `${labelOf(found.block)}, ${found.index + 1} of ${seq.length} ${where}: ${blockSummary(found.block)}`;
}

/** The whole program as an indented outline, one block per line. */
export function describeProgram(program: Program): string {
  const lines: string[] = [`Program ${program.name}`];
  for (const r of roots(program)) {
    const title =
      r.root === 'main'
        ? 'Main beam'
        : r.root.startsWith('main#')
          ? `Parallel beam ${r.root.slice(5)}`
          : `My Block ${program.myBlocks.find((m) => m.id === r.root)?.name ?? ''}`;
    lines.push(`${title}${r.blocks.length ? ':' : ': empty'}`);
    walk(r.blocks, (b, depth) =>
      lines.push(`${'  '.repeat(depth + 1)}${labelOf(b)}: ${blockSummary(b)}`),
    );
  }
  if (program.wires.length) lines.push(`${program.wires.length} data wires`);
  return lines.join('\n');
}
