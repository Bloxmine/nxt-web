import { EXAMPLES, emptyProgram, type Program } from '@nxt/blocks';

/** Editor state: the program, history for undo/redo, selection and open tabs. */
export interface EditorState {
  program: Program;
  past: Program[];
  future: Program[];
  selected: string | null;
  /** Open tabs: "main" or My Block ids. */
  tabs: string[];
  activeTab: string;
  zoom: number;
  /** True when there are changes not yet saved to a file. */
  dirty: boolean;
  /** Key and time of the last coalescing edit, so slider drags make one undo step. */
  lastEdit: { key: string; at: number } | null;
}

export type EditorAction =
  | {
      type: 'edit';
      update: (program: Program) => Program;
      select?: string | null;
      /** Edits with the same key within a second merge into one undo step. */
      coalesce?: string;
    }
  | { type: 'load'; program: Program }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; id: string | null }
  | { type: 'openTab'; tab: string }
  | { type: 'closeTab'; tab: string }
  | { type: 'zoom'; zoom: number }
  | { type: 'saved' };

const HISTORY_LIMIT = 100;

export function initialState(program: Program = emptyProgram()): EditorState {
  return {
    program,
    past: [],
    future: [],
    selected: null,
    tabs: ['main'],
    activeTab: 'main',
    zoom: 1,
    dirty: false,
    lastEdit: null,
  };
}

function validTabs(program: Program, tabs: string[]): string[] {
  const ids = new Set(program.myBlocks.map((m) => m.id));
  return tabs.filter((t) => t === 'main' || ids.has(t));
}

function withProgram(state: EditorState, program: Program): EditorState {
  const tabs = validTabs(program, state.tabs);
  return {
    ...state,
    program,
    tabs,
    activeTab: tabs.includes(state.activeTab) ? state.activeTab : 'main',
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'edit': {
      const program = action.update(state.program);
      if (program === state.program) return state;
      const now = Date.now();
      const merge =
        action.coalesce !== undefined &&
        state.lastEdit?.key === action.coalesce &&
        now - state.lastEdit.at < 1000;
      return {
        ...withProgram(state, program),
        past: merge ? state.past : [...state.past.slice(-HISTORY_LIMIT + 1), state.program],
        lastEdit: action.coalesce !== undefined ? { key: action.coalesce, at: now } : null,
        future: [],
        selected: action.select !== undefined ? action.select : state.selected,
        dirty: true,
      };
    }
    case 'load':
      return initialState(action.program);
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...withProgram(state, previous),
        past: state.past.slice(0, -1),
        future: [state.program, ...state.future],
        dirty: true,
        lastEdit: null,
      };
    }
    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        ...withProgram(state, next),
        past: [...state.past, state.program],
        future: rest,
        dirty: true,
        lastEdit: null,
      };
    }
    case 'select':
      return { ...state, selected: action.id };
    case 'openTab':
      return {
        ...state,
        tabs: state.tabs.includes(action.tab) ? state.tabs : [...state.tabs, action.tab],
        activeTab: action.tab,
        selected: null,
      };
    case 'closeTab': {
      if (action.tab === 'main') return state;
      const tabs = state.tabs.filter((t) => t !== action.tab);
      return {
        ...state,
        tabs,
        activeTab: state.activeTab === action.tab ? 'main' : state.activeTab,
      };
    }
    case 'zoom':
      return { ...state, zoom: Math.min(1.5, Math.max(0.5, action.zoom)) };
    case 'saved':
      return { ...state, dirty: false };
  }
}

export { EXAMPLES };
