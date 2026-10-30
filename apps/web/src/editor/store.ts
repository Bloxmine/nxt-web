import {
  describeChange,
  EXAMPLES,
  emptyProgram,
  labelOf,
  syncMyBlockParams,
  type Program,
} from '@nxt/blocks';

/** Editor state: the program, history for undo/redo, selection and open tabs. */
export interface EditorState {
  program: Program;
  past: Program[];
  future: Program[];
  /** What each undo step did, parallel to `past` (and `future`). */
  pastLabels: string[];
  futureLabels: string[];
  /** The primary selected block (its settings show in the config panel). */
  selected: string | null;
  /** Further selected blocks (Ctrl+click or box selection), not including `selected`. */
  extra: string[];
  /** Selected wire id (Delete removes it). */
  selectedWire: string | null;
  /** Open tabs: "main" or My Block ids. */
  tabs: string[];
  activeTab: string;
  zoom: number;
  /** True when there are changes not yet saved to a file. */
  dirty: boolean;
  /** View options (View menu). */
  view: ViewOptions;
  /** Key and time of the last coalescing edit, so slider drags make one undo step. */
  lastEdit: { key: string; at: number } | null;
}

/** View options, remembered per browser. */
export interface ViewOptions {
  /** Wires drawn behind blocks as tubes, each in its own lane (like the original). */
  classicWires: boolean;
  /** Show the Work Map overview. */
  workMap: boolean;
}

const VIEW_KEY = 'nxt-web-studio:view';

function loadView(): ViewOptions {
  const fallback = { classicWires: false, workMap: false };
  try {
    const saved = JSON.parse(
      globalThis.localStorage?.getItem(VIEW_KEY) ?? 'null',
    ) as Partial<ViewOptions> | null;
    return { ...fallback, ...saved };
  } catch {
    return fallback;
  }
}

function saveView(view: ViewOptions): void {
  try {
    globalThis.localStorage?.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // A preference only.
  }
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
  | { type: 'select'; id: string | null; toggle?: boolean }
  | { type: 'selectMany'; ids: string[] }
  /** Undo (negative) or redo (positive) several steps at once. */
  | { type: 'travel'; steps: number }
  | { type: 'selectWire'; id: string | null }
  | { type: 'openTab'; tab: string }
  | { type: 'closeTab'; tab: string }
  | { type: 'zoom'; zoom: number }
  | { type: 'saved' }
  | { type: 'view'; view: Partial<ViewOptions> };

const HISTORY_LIMIT = 100;

export function initialState(program: Program = emptyProgram()): EditorState {
  return {
    program,
    past: [],
    future: [],
    pastLabels: [],
    futureLabels: [],
    selected: null,
    extra: [],
    selectedWire: null,
    tabs: ['main'],
    activeTab: 'main',
    zoom: 1,
    view: loadView(),
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
      // My Block calls follow their parameter blocks (plugs appear and disappear).
      const program = syncMyBlockParams(action.update(state.program));
      if (program === state.program) return state;
      const now = Date.now();
      const merge =
        action.coalesce !== undefined &&
        state.lastEdit?.key === action.coalesce &&
        now - state.lastEdit.at < 1000;
      const label = describeChange(merge ? state.past.at(-1)! : state.program, program, labelOf);
      return {
        ...withProgram(state, program),
        past: merge ? state.past : [...state.past.slice(-HISTORY_LIMIT + 1), state.program],
        pastLabels: merge
          ? [...state.pastLabels.slice(0, -1), label]
          : [...state.pastLabels.slice(-HISTORY_LIMIT + 1), label],
        lastEdit: action.coalesce !== undefined ? { key: action.coalesce, at: now } : null,
        future: [],
        futureLabels: [],
        selected: action.select !== undefined ? action.select : state.selected,
        extra: action.select !== undefined ? [] : state.extra,
        dirty: true,
      };
    }
    case 'load':
      return { ...initialState(action.program), view: state.view, zoom: state.zoom };
    case 'view': {
      const view = { ...state.view, ...action.view };
      saveView(view);
      return { ...state, view };
    }
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...withProgram(state, previous),
        past: state.past.slice(0, -1),
        future: [state.program, ...state.future],
        pastLabels: state.pastLabels.slice(0, -1),
        futureLabels: [state.pastLabels.at(-1) ?? 'Edit', ...state.futureLabels],
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
        pastLabels: [...state.pastLabels, state.futureLabels[0] ?? 'Edit'],
        futureLabels: state.futureLabels.slice(1),
        dirty: true,
        lastEdit: null,
      };
    }
    case 'travel': {
      let next = state;
      for (let i = 0; i < Math.abs(action.steps); i++) {
        next = editorReducer(next, { type: action.steps < 0 ? 'undo' : 'redo' });
      }
      return next;
    }
    case 'select': {
      if (action.toggle && action.id) {
        const all = [state.selected, ...state.extra].filter((x): x is string => x !== null);
        const next = all.includes(action.id)
          ? all.filter((x) => x !== action.id)
          : [...all, action.id];
        return { ...state, selected: next[0] ?? null, extra: next.slice(1), selectedWire: null };
      }
      return { ...state, selected: action.id, extra: [], selectedWire: null };
    }
    case 'selectMany':
      return {
        ...state,
        selected: action.ids[0] ?? null,
        extra: action.ids.slice(1),
        selectedWire: null,
      };
    case 'selectWire':
      return { ...state, selectedWire: action.id, selected: action.id ? null : state.selected };
    case 'openTab':
      return {
        ...state,
        tabs: state.tabs.includes(action.tab) ? state.tabs : [...state.tabs, action.tab],
        activeTab: action.tab,
        selected: null,
        extra: [],
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

/** All selected block ids, primary first. */
export function selectedIds(state: EditorState): string[] {
  return state.selected ? [state.selected, ...state.extra] : [...state.extra];
}

export { EXAMPLES };
