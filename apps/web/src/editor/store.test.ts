import { createBlock, insertBlock, MAIN } from '@nxt/blocks';
import { describe, expect, it } from 'vitest';
import { editorReducer, initialState, selectedIds } from './store';

describe('editorReducer', () => {
  it('undoes and redoes edits', () => {
    const block = createBlock('move');
    let s = initialState();
    s = editorReducer(s, {
      type: 'edit',
      update: (p) => insertBlock(p, MAIN, 0, block),
      select: block.id,
    });
    expect(s.program.body).toHaveLength(1);
    expect(s.selected).toBe(block.id);
    s = editorReducer(s, { type: 'undo' });
    expect(s.program.body).toHaveLength(0);
    s = editorReducer(s, { type: 'redo' });
    expect(s.program.body).toHaveLength(1);
  });

  it('ignores edits that change nothing', () => {
    const s = initialState();
    expect(editorReducer(s, { type: 'edit', update: (p) => p })).toBe(s);
  });

  it('closes tabs of deleted My Blocks', () => {
    let s = initialState();
    s = editorReducer(s, {
      type: 'edit',
      update: (p) => ({ ...p, myBlocks: [{ id: 'm1', name: 'A', body: [] }] }),
    });
    s = editorReducer(s, { type: 'openTab', tab: 'm1' });
    expect(s.activeTab).toBe('m1');
    s = editorReducer(s, { type: 'edit', update: (p) => ({ ...p, myBlocks: [] }) });
    expect(s.tabs).toEqual(['main']);
    expect(s.activeTab).toBe('main');
  });
});

describe('coalescing', () => {
  it('merges rapid edits with the same key into one undo step', () => {
    let s = initialState();
    const rename = (name: string) => ({
      type: 'edit' as const,
      update: (p: typeof s.program) => ({ ...p, name }),
      coalesce: 'name',
    });
    s = editorReducer(s, rename('a'));
    s = editorReducer(s, rename('ab'));
    s = editorReducer(s, rename('abc'));
    expect(s.past).toHaveLength(1);
    s = editorReducer(s, { type: 'undo' });
    expect(s.program.name).toBe('Untitled-1');
  });
});

describe('selection and history', () => {
  it('toggles blocks into a multi-selection', () => {
    let s = initialState();
    s = editorReducer(s, { type: 'select', id: 'a' });
    s = editorReducer(s, { type: 'select', id: 'b', toggle: true });
    expect(selectedIds(s)).toEqual(['a', 'b']);
    s = editorReducer(s, { type: 'select', id: 'a', toggle: true });
    expect(selectedIds(s)).toEqual(['b']);
    s = editorReducer(s, { type: 'select', id: null });
    expect(selectedIds(s)).toEqual([]);
  });

  it('labels history steps and travels several at once', () => {
    let s = initialState();
    for (const kind of ['move', 'sound', 'wait'] as const) {
      const block = createBlock(kind);
      s = editorReducer(s, { type: 'edit', update: (p) => insertBlock(p, MAIN, 0, block) });
    }
    expect(s.pastLabels).toEqual(['Added Move', 'Added Sound', 'Added Wait']);
    s = editorReducer(s, { type: 'travel', steps: -2 });
    expect(s.program.body).toHaveLength(1);
    expect(s.futureLabels).toEqual(['Added Sound', 'Added Wait']);
    s = editorReducer(s, { type: 'travel', steps: 1 });
    expect(s.program.body).toHaveLength(2);
    expect(s.pastLabels).toEqual(['Added Move', 'Added Sound']);
  });
});
