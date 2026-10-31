import { emptyProgram, newId, type Program } from '@nxt/blocks';
import type { RbtOrigin } from '@nxt/rbt';
import { useState, type Dispatch, type RefObject } from 'react';
import type { SavedFile } from '../lib/files';
import { newLibraryId, saveToLibrary } from '../lib/library';
import type { EditorAction, EditorState } from './store';

/** A program open in a tab. The active one lives in the editor state; others are stashed. */
export interface OpenDoc {
  id: string;
  /** The editor state while another tab is active (null for the active tab). */
  stash: EditorState | null;
  fileHandle: SavedFile;
  rbtOrigin: RbtOrigin | null;
  libraryId: string;
}

/** What the tab strip shows for each open program. */
export interface DocTab {
  id: string;
  name: string;
  dirty: boolean;
  active: boolean;
}

/** Where a program comes from, to remember with its tab. */
export interface OpenOptions {
  fileHandle?: SavedFile;
  rbtOrigin?: RbtOrigin | null;
  /** Library entry it was opened from (a tab already showing it is reused). */
  libraryId?: string;
}

/** True for a new, untouched, empty program: opening something replaces it. */
function isBlank(state: EditorState): boolean {
  const p = state.program;
  return (
    !state.dirty &&
    state.past.length === 0 &&
    p.body.length === 0 &&
    p.parallel.every((lane) => lane.length === 0) &&
    p.myBlocks.length === 0 &&
    (p.comments?.length ?? 0) === 0
  );
}

/**
 * Several programs open at once, as tabs. Each keeps its own editor state (undo history,
 * selection, zoom), file and library entry; switching swaps them in and out.
 */
export function useDocuments({
  state,
  dispatch,
  fileHandleRef,
  rbtOriginRef,
  libraryIdRef,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  fileHandleRef: RefObject<SavedFile>;
  rbtOriginRef: RefObject<RbtOrigin | null>;
  libraryIdRef: RefObject<string>;
}) {
  const [docs, setDocs] = useState<OpenDoc[]>(() => [
    {
      id: newId('doc'),
      stash: null,
      fileHandle: null,
      rbtOrigin: null,
      // Filled in from libraryIdRef whenever this tab is stashed.
      libraryId: '',
    },
  ]);
  const [activeId, setActiveId] = useState(() => docs[0]!.id);

  /** The list with the active tab's live state stashed in it. */
  const stashed = (): OpenDoc[] => {
    // Keep its latest version in the library before it goes to the background.
    if (state.dirty) void saveToLibrary(libraryIdRef.current, state.program);
    return docs.map((d) =>
      d.id === activeId
        ? {
            ...d,
            stash: state,
            fileHandle: fileHandleRef.current,
            rbtOrigin: rbtOriginRef.current,
            libraryId: libraryIdRef.current,
          }
        : d,
    );
  };

  const activate = (doc: OpenDoc, list: OpenDoc[]) => {
    fileHandleRef.current = doc.fileHandle;
    rbtOriginRef.current = doc.rbtOrigin;
    libraryIdRef.current = doc.libraryId;
    if (doc.stash) dispatch({ type: 'restore', state: doc.stash });
    setDocs(list.map((d) => (d.id === doc.id ? { ...d, stash: null } : d)));
    setActiveId(doc.id);
  };

  const switchTo = (id: string) => {
    if (id === activeId) return;
    const list = stashed();
    const target = list.find((d) => d.id === id);
    if (target) activate(target, list);
  };

  /** Opens a program in a new tab (or in this one, when it is blank). */
  const openProgram = (program: Program, options: OpenOptions = {}) => {
    if (options.libraryId) {
      if (options.libraryId === libraryIdRef.current) return;
      const open = docs.find((d) => d.libraryId === options.libraryId);
      if (open) return switchTo(open.id);
    }
    const refs = {
      fileHandle: options.fileHandle ?? null,
      rbtOrigin: options.rbtOrigin ?? null,
      libraryId: options.libraryId ?? newLibraryId(),
    };
    if (isBlank(state)) {
      setDocs(docs.map((d) => (d.id === activeId ? { ...d, ...refs } : d)));
    } else {
      const doc: OpenDoc = { id: newId('doc'), stash: null, ...refs };
      setDocs([...stashed(), doc]);
      setActiveId(doc.id);
    }
    fileHandleRef.current = refs.fileHandle;
    rbtOriginRef.current = refs.rbtOrigin;
    libraryIdRef.current = refs.libraryId;
    dispatch({ type: 'load', program });
  };

  /** Closes a tab, asking first when it has unsaved changes. */
  const close = (id: string) => {
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    const active = id === activeId;
    const s = active ? state : doc.stash;
    if (
      s?.dirty &&
      !window.confirm(
        `Close "${s.program.name}" without saving it to a file? Its latest version stays in File → Program library.`,
      )
    )
      return;
    if (s?.dirty) void saveToLibrary(active ? libraryIdRef.current : doc.libraryId, s.program);
    if (docs.length === 1) {
      fileHandleRef.current = null;
      rbtOriginRef.current = null;
      libraryIdRef.current = newLibraryId();
      setDocs([{ ...doc, fileHandle: null, rbtOrigin: null, libraryId: libraryIdRef.current }]);
      dispatch({ type: 'load', program: emptyProgram() });
      return;
    }
    const remaining = docs.filter((d) => d.id !== id);
    if (!active) return setDocs(remaining);
    const index = docs.findIndex((d) => d.id === id);
    const next = docs[index + 1] ?? docs[index - 1]!;
    activate(next, remaining);
  };

  const tabs: DocTab[] = docs.map((d) =>
    d.id === activeId
      ? { id: d.id, name: state.program.name, dirty: state.dirty, active: true }
      : {
          id: d.id,
          name: d.stash?.program.name ?? '…',
          dirty: d.stash?.dirty ?? false,
          active: false,
        },
  );

  /** Every open program with its library entry, for autosave. */
  const all = (): { program: Program; libraryId: string; active: boolean }[] =>
    docs.map((d) =>
      d.id === activeId
        ? { program: state.program, libraryId: libraryIdRef.current, active: true }
        : { program: d.stash!.program, libraryId: d.libraryId, active: false },
    );

  /** Puts back tabs saved by autosave; the active one's program is loaded by the caller. */
  const restoreTabs = (
    saved: { program: Program; libraryId: string; active: boolean }[],
    makeState: (p: Program) => EditorState,
  ) => {
    const list: OpenDoc[] = saved.map((t) => ({
      id: newId('doc'),
      stash: t.active ? null : makeState(t.program),
      fileHandle: null,
      rbtOrigin: null,
      libraryId: t.libraryId,
    }));
    const active = saved.findIndex((t) => t.active);
    const current = list[Math.max(0, active)]!;
    libraryIdRef.current = current.libraryId;
    setDocs(list);
    setActiveId(current.id);
    dispatch({ type: 'load', program: saved[Math.max(0, active)]!.program });
  };

  return { tabs, switchTo, openProgram, close, all, restoreTabs, count: docs.length };
}
