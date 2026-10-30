import {
  createBlock,
  emptyProgram,
  EXAMPLES,
  findBlock,
  lowerProgram,
  newId,
  normalizeProgram,
  disconnect,
  tabOf,
  updateSequence,
  type Block,
  type Program,
} from '@nxt/blocks';
import { CompileError, compileProgram } from '@nxt/compiler';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { BrickProvider, useBrick } from './brick/BrickContext';
import { AboutDialog, MessageDialog } from './components/AboutDialog';
import { Canvas } from './components/Canvas';
import { ConfigPanel } from './components/ConfigPanel';
import { Controller } from './components/Controller';
import { HelpPanel } from './components/HelpPanel';
import { MenuBar, type Menu } from './components/MenuBar';
import { NxtWindow, type NxtTab } from './components/NxtWindow';
import { CalibrateDialog } from './tools/CalibrateDialog';
import { DataLogDialog } from './tools/DataLogDialog';
import { saveFile } from './tools/convert';
import type { PackedFile } from '@nxt/rbt';
import { Palette } from './components/Palette';
import { SupportBanner } from './components/SupportBanner';
import { Toolbar } from './components/Toolbar';
import { VariablesDialog } from './components/VariablesDialog';
import { addComment } from './components/CanvasExtras';
import { HistoryDialog, InsertDialog, SearchDialog, WireDialog } from './components/EditorDialogs';
import { saveVersion } from './lib/versions';
import { EditorContext, useIssues } from './editor/EditorContext';
import { describeBlock, describeProgram, editCommands } from './editor/commands';
import { editorReducer, initialState, selectedIds } from './editor/store';
import { checkBrowserSupport } from './lib/browserSupport';
import { openProjectFile, readProgramFile, saveProjectFile, type SavedFile } from './lib/files';
import { iconUrl } from './lib/icons';
import { loadValue, saveValue } from './lib/storage';
import { SimulatorProvider, useSimulator, type SimulatorControls } from './sim/SimulatorContext';
import { SimulatorWindow } from './sim/SimulatorWindow';

const support = checkBrowserSupport(navigator);
const AUTOSAVE_KEY = 'autosave';
/** Brick file name for a program: 15.3 characters, letters, digits, spaces, - and _. */
function rxeFileName(name: string): string {
  const base =
    name
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim()
      .slice(0, 15) || 'Program';
  return `${base}.rxe`;
}

function saveBytes(fileName: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes)], { type: 'application/octet-stream' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The simulator mat each example is meant for. */
const EXAMPLE_MATS: Record<string, string> = {
  square: 'square',
  avoid: 'walls',
  line: 'oval',
  bumper: 'walls',
  distance: 'walls',
  parallel: 'square',
};

type Modal =
  | 'nxt'
  | { nxt: NxtTab }
  | 'datalog'
  | 'calibrate'
  | 'variables'
  | 'about'
  | 'search'
  | 'history'
  | 'insert'
  | 'wire'
  | 'outline'
  | { title: string; icon: string; body: ReactNode }
  | null;

export function App() {
  return (
    <BrickProvider>
      <Studio />
    </BrickProvider>
  );
}

function isProgram(value: unknown): value is Program {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Program).body) &&
    Array.isArray((value as Program).variables) &&
    Array.isArray((value as Program).myBlocks)
  );
}

function Studio() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialState());
  const { issues, issuesByBlock } = useIssues(state);
  const brick = useBrick();
  const [modal, setModal] = useState<Modal>(null);
  const [ready, setReady] = useState(false);
  const fileHandle = useRef<SavedFile>(null);
  // Simulator controls, filled in by <SimulatorHooks> inside the provider.
  const simActions = useRef<SimulatorControls | null>(null);
  const [initialMat, setInitialMat] = useState('empty');
  // Polite announcements for screen readers (selection, clipboard).
  const [announcement, setAnnouncement] = useState('');
  const cmds = editCommands(state, dispatch, setAnnouncement);
  const selectionKey = selectedIds(state).join(',');
  useEffect(() => {
    if (!state.selected) return;
    const extra = state.extra.length ? ` (and ${state.extra.length} more selected)` : '';
    setAnnouncement(describeBlock(state.program, state.selected) + extra);
    // Only when the selection changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);
  const connected = brick.state === 'connected';

  // Restore the last session, then autosave every change.
  useEffect(() => {
    // ?example=<key> opens an example directly (handy for links and docs).
    const exampleKey = new URLSearchParams(window.location.search).get('example');
    const example = EXAMPLES.find((e) => e.key === exampleKey);
    void loadValue<unknown>(AUTOSAVE_KEY).then((saved) => {
      if (example) {
        dispatch({ type: 'load', program: example.create() });
        setInitialMat(EXAMPLE_MATS[example.key] ?? 'empty');
      } else if (isProgram(saved)) dispatch({ type: 'load', program: normalizeProgram(saved) });
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => void saveValue(AUTOSAVE_KEY, state.program), 400);
    return () => clearTimeout(id);
  }, [state.program, ready]);

  // Keep a copy in the browser every five minutes while there are changes.
  const programRef = useRef(state.program);
  const dirtyRef = useRef(state.dirty);
  useEffect(() => {
    programRef.current = state.program;
    dirtyRef.current = state.dirty;
  }, [state.program, state.dirty]);
  useEffect(() => {
    const id = setInterval(() => {
      if (dirtyRef.current) void saveVersion(programRef.current, 'Kept automatically');
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.title = `${state.program.name}${state.dirty ? '*' : ''} - NXT Web Studio`;
  }, [state.program.name, state.dirty]);

  const confirmDiscard = () =>
    !state.dirty || window.confirm('Discard unsaved changes to this program?');

  const message = (title: string, icon: string, body: ReactNode) => setModal({ title, icon, body });

  const showOpened = (result: {
    program: Program;
    warnings: string[];
    imported: boolean;
    files?: PackedFile[];
  }) => {
    dispatch({ type: 'load', program: result.program });
    if (!result.imported) return;
    message(
      'Program imported',
      result.warnings.length ? 'error' : 'tick',
      <>
        <p style={{ marginTop: 0 }}>
          <strong>{result.program.name}</strong> was opened from an NXT-G program (
          {result.files ? 'Pack and Go, .rbtx' : '.rbt'}). Saving creates a new project file; the
          original is not changed.
        </p>
        {result.files && result.files.length > 0 && (
          <>
            <p>It came with these files, which the program plays or shows from the brick:</p>
            <ul style={{ paddingLeft: 18 }}>
              {result.files.map((f) => (
                <li key={f.name}>
                  {f.name}{' '}
                  <button
                    type="button"
                    className="btn"
                    style={{ minWidth: 0 }}
                    onClick={() => saveFile(f.name, f.bytes)}
                  >
                    Save
                  </button>
                </li>
              ))}
            </ul>
            {connected && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void (async () => {
                    for (const f of result.files ?? [])
                      await brick.client?.uploadFile(f.name, f.bytes);
                  })().catch((e: unknown) => window.alert(String(e)))
                }
              >
                <img src={iconUrl('page_white_put')} alt="" /> Upload them to the brick
              </button>
            )}
          </>
        )}
        {result.warnings.length > 0 && (
          <>
            <p>Some parts could not be carried over exactly:</p>
            <ul style={{ paddingLeft: 18 }}>
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </>
        )}
      </>,
    );
  };

  const actions = {
    newProgram: () => {
      if (!confirmDiscard()) return;
      fileHandle.current = null;
      dispatch({ type: 'load', program: emptyProgram() });
    },
    open: async () => {
      if (!confirmDiscard()) return;
      void saveVersion(state.program, 'Before opening another program');
      try {
        const result = await openProjectFile();
        if (!result) return;
        fileHandle.current = result.handle;
        showOpened(result);
      } catch (e) {
        message('Could not open', 'exclamation', e instanceof Error ? e.message : String(e));
      }
    },
    openFile: async (file: File) => {
      if (!confirmDiscard()) return;
      void saveVersion(state.program, 'Before opening another program');
      try {
        const result = await readProgramFile(file);
        fileHandle.current = null;
        showOpened(result);
      } catch (e) {
        message('Could not open', 'exclamation', e instanceof Error ? e.message : String(e));
      }
    },
    save: async (saveAs = false) => {
      try {
        fileHandle.current = await saveProjectFile(state.program, fileHandle.current, saveAs);
        dispatch({ type: 'saved' });
        void saveVersion(state.program, 'Saved to a file');
      } catch (e) {
        message('Could not save', 'exclamation', e instanceof Error ? e.message : String(e));
      }
    },
    loadExample: (key: string) => {
      const example = EXAMPLES.find((e) => e.key === key);
      if (!example || !confirmDiscard()) return;
      void saveVersion(state.program, 'Before opening an example');
      fileHandle.current = null;
      dispatch({ type: 'load', program: example.create() });
      const mat = EXAMPLE_MATS[key];
      if (mat) simActions.current?.setScenario(mat);
    },
    renameProgram: () => {
      const name = window.prompt('Program name:', state.program.name);
      if (name?.trim())
        dispatch({ type: 'edit', update: (p) => ({ ...p, name: name.trim().slice(0, 15) }) });
    },
    deleteSelected: () => {
      const wire = state.selectedWire;
      if (wire) {
        dispatch({ type: 'edit', update: (p) => disconnect(p, wire) });
        dispatch({ type: 'selectWire', id: null });
        return;
      }
      cmds.deleteSelection();
    },
    makeMyBlock: () => {
      const found = state.selected ? findBlock(state.program, state.selected) : null;
      if (!found) {
        message(
          'Make a new My Block',
          'bricks',
          'Select the block you want to turn into a My Block first.',
        );
        return;
      }
      const name = window.prompt('Name for the new My Block:', 'My Block');
      if (!name?.trim()) return;
      const id = newId('m');
      const call: Block = { ...createBlock('myBlock'), ref: id } as Block;
      dispatch({
        type: 'edit',
        update: (p) => {
          const replaced = updateSequence(p, found.ref, (blocks) =>
            blocks.map((b) => (b.id === found.block.id ? call : b)),
          );
          return {
            ...replaced,
            myBlocks: [...replaced.myBlocks, { id, name: name.trim(), body: [found.block] }],
          };
        },
        select: call.id,
      });
    },
    zoom: (delta: number) =>
      dispatch({ type: 'zoom', zoom: Math.round((state.zoom + delta) * 10) / 10 }),
    download: (run: boolean) => {
      const errors = issues.filter((i) => i.severity === 'error');
      if (errors.length > 0) {
        const first = findBlock(state.program, errors[0]!.blockId);
        if (first) dispatch({ type: 'openTab', tab: tabOf(first.ref.root) });
        dispatch({ type: 'select', id: errors[0]!.blockId });
        message(
          'Cannot download',
          'exclamation',
          <>
            <p style={{ marginTop: 0 }}>
              The program has {errors.length} problem{errors.length === 1 ? '' : 's'}. Blocks with a
              red mark need fixing:
            </p>
            <ul style={{ paddingLeft: 18 }}>
              {errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          </>,
        );
        return;
      }
      let bytes: Uint8Array;
      try {
        bytes = compileProgram(lowerProgram(state.program));
      } catch (error) {
        message(
          'Cannot download',
          'exclamation',
          <p style={{ marginTop: 0 }}>
            {error instanceof CompileError ? error.message : String(error)}
          </p>,
        );
        return;
      }
      const fileName = rxeFileName(state.program.name);
      if (!connected) {
        message(
          'No brick connected',
          'disconnect',
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{fileName}</strong> is ready ({bytes.length} bytes). Connect your brick to
              download it, save the file to copy it over another way, or try it in the simulator.
            </p>
            <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                disabled={!support.usb}
                onClick={() => {
                  setModal(null);
                  void brick.connectUsb();
                }}
              >
                <img src={iconUrl('connect')} alt="" /> Connect via USB
              </button>
              <button type="button" className="btn" onClick={() => saveBytes(fileName, bytes)}>
                <img src={iconUrl('diskette')} alt="" /> Save {fileName}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setModal(null);
                  actionsRef.current.simulate();
                }}
              >
                <img src={iconUrl('car')} alt="" /> Simulate
              </button>
            </p>
          </>,
        );
        return;
      }
      const progress = (sent: number) =>
        message(
          run ? 'Download and run' : 'Download',
          'download',
          <>
            <p style={{ marginTop: 0 }}>
              Sending <strong>{fileName}</strong> to the brick…
            </p>
            <progress max={bytes.length} value={sent} style={{ width: '100%' }} />
          </>,
        );
      progress(0);
      void brick.downloadProgram(fileName, bytes, run, progress).then((ok) => {
        if (!ok) return setModal(null);
        message(
          run ? 'Download and run' : 'Download',
          'tick',
          <p style={{ marginTop: 0 }}>
            <strong>{fileName}</strong> ({bytes.length} bytes) is on the brick
            {run ? ' and running.' : '. Find it under My Files › Software files.'}
          </p>,
        );
      });
    },
    stop: () => void brick.stopEverything(),
    simulate: () => {
      const sim = simActions.current;
      if (!sim) return;
      sim.setOpen(true);
      sim.run();
    },
    cmds,
    toggleBreakpoint: () => {
      if (state.selected) simActions.current?.toggleBreakpoint(state.selected);
    },
  };

  const actionsRef = useRef(actions);
  useLayoutEffect(() => {
    actionsRef.current = actions;
  });

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const typing = target.closest('input, select, textarea, [contenteditable]') !== null;
    const mod = e.ctrlKey || e.metaKey;
    const a = actionsRef.current;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void a.save(e.shiftKey);
    } else if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      void a.open();
    } else if (typing) {
      return;
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      dispatch({ type: 'redo' });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      a.deleteSelected();
    } else if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setModal('search');
    } else if (!mod && !e.altKey && (e.key === 'Insert' || e.key.toLowerCase() === 'i')) {
      e.preventDefault();
      setModal('insert');
    } else if (!mod && !e.altKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      setModal('wire');
    } else if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      a.cmds.copy();
    } else if (mod && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      a.cmds.cut();
    } else if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      void a.cmds.paste();
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      a.cmds.duplicate();
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      a.cmds.selectAll();
    } else if (e.key.startsWith('Arrow') && !mod) {
      e.preventDefault();
      const dir = e.key.slice(5).toLowerCase() as 'left' | 'right' | 'up' | 'down';
      if (e.altKey && (dir === 'left' || dir === 'right')) a.cmds.shift(dir === 'left' ? -1 : 1);
      else a.cmds.navigate(dir);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('.block.selected, .loop.selected, .switch.selected')
          ?.focus(),
      );
    } else if (e.key === 'F9') {
      e.preventDefault();
      a.toggleBreakpoint();
    } else if (e.key === 'F5') {
      e.preventDefault();
      a.simulate();
    } else if (e.key === 'Escape') {
      dispatch({ type: 'select', id: null });
    } else if (mod && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      a.zoom(0.1);
    } else if (mod && e.key === '-') {
      e.preventDefault();
      a.zoom(-0.1);
    }
  }, []);

  // Drop a .rbt or project file anywhere on the window to open it.
  useEffect(() => {
    const isFileDrag = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const over = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void actionsRef.current.openFile(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'New', icon: 'page_white_add', onClick: actions.newProgram },
        {
          label: 'Open… (.nxtproj, .rbt)',
          icon: 'folder',
          shortcut: 'Ctrl+O',
          onClick: () => void actions.open(),
        },
        { label: 'Save', icon: 'diskette', shortcut: 'Ctrl+S', onClick: () => void actions.save() },
        { label: 'Save As…', shortcut: 'Ctrl+Shift+S', onClick: () => void actions.save(true) },
        { label: 'Rename program…', onClick: actions.renameProgram },
        { separator: true },
        { section: 'Examples' },
        ...EXAMPLES.map((ex) => ({
          label: ex.name,
          icon: 'brick',
          onClick: () => actions.loadExample(ex.key),
        })),
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Undo',
          icon: 'arrow_undo',
          shortcut: 'Ctrl+Z',
          disabled: state.past.length === 0,
          onClick: () => dispatch({ type: 'undo' }),
        },
        {
          label: 'Redo',
          icon: 'arrow_redo',
          shortcut: 'Ctrl+Y',
          disabled: state.future.length === 0,
          onClick: () => dispatch({ type: 'redo' }),
        },
        { separator: true },
        {
          label: 'Cut',
          icon: 'cut',
          shortcut: 'Ctrl+X',
          disabled: !state.selected,
          onClick: cmds.cut,
        },
        {
          label: 'Copy',
          icon: 'page_copy',
          shortcut: 'Ctrl+C',
          disabled: !state.selected,
          onClick: cmds.copy,
        },
        {
          label: 'Paste',
          icon: 'paste_plain',
          shortcut: 'Ctrl+V',
          onClick: () => void cmds.paste(),
        },
        {
          label: 'Duplicate',
          shortcut: 'Ctrl+D',
          disabled: !state.selected,
          onClick: cmds.duplicate,
        },
        { label: 'Select all', shortcut: 'Ctrl+A', onClick: cmds.selectAll },
        {
          label: 'Find…',
          icon: 'magnifier_zoom_in',
          shortcut: 'Ctrl+F',
          onClick: () => setModal('search'),
        },
        { label: 'History…', icon: 'clock', onClick: () => setModal('history') },
        { separator: true },
        {
          label: 'Insert block…',
          icon: 'brick_add',
          shortcut: 'I',
          onClick: () => setModal('insert'),
        },
        {
          label: 'Connect a data wire…',
          icon: 'connect',
          shortcut: 'W',
          onClick: () => setModal('wire'),
        },
        {
          label: 'Add comment',
          icon: 'comment',
          onClick: () => {
            const scroller = document.querySelector('.canvas');
            const x = ((scroller?.scrollLeft ?? 0) + 40) / state.zoom;
            const y = ((scroller?.scrollTop ?? 0) + 30) / state.zoom;
            dispatch({ type: 'edit', update: (p) => addComment(p, state.activeTab, x, y) });
          },
        },
        { separator: true },
        {
          label: 'Delete block',
          icon: 'delete',
          shortcut: 'Del',
          disabled: !state.selected && !state.selectedWire,
          onClick: actions.deleteSelected,
        },
        {
          label: 'Make a new My Block…',
          icon: 'brick_add',
          disabled: !state.selected,
          onClick: actions.makeMyBlock,
        },
        { label: 'Define variables…', icon: 'tag_red', onClick: () => setModal('variables') },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Classic wires',
          icon: state.view.classicWires ? 'tick' : 'arrow_join',
          onClick: () =>
            dispatch({ type: 'view', view: { classicWires: !state.view.classicWires } }),
        },
        {
          label: 'Work Map',
          icon: state.view.workMap ? 'tick' : 'map',
          onClick: () => dispatch({ type: 'view', view: { workMap: !state.view.workMap } }),
        },
        { separator: true },
        {
          label: 'Program outline (text)…',
          icon: 'page_white_text',
          onClick: () => setModal('outline'),
        },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'NXT Window', icon: 'monitor_window', onClick: () => setModal('nxt') },
        { label: 'Files on the brick…', icon: 'folder', onClick: () => setModal({ nxt: 'files' }) },
        { label: 'Remote control…', icon: 'joystick', onClick: () => setModal({ nxt: 'remote' }) },
        { label: 'Health check…', icon: 'heart', onClick: () => setModal({ nxt: 'health' }) },
        { label: 'Data logging…', icon: 'chart_line', onClick: () => setModal('datalog') },
        {
          label: 'Calibrate sensor…',
          icon: 'color_adjustment',
          disabled: !state.selected,
          onClick: () => setModal('calibrate'),
        },
        {
          label: brick.recording ? 'Stop recording and save…' : 'Record USB traffic',
          icon: 'transmit',
          disabled: !connected,
          onClick: () => {
            if (!brick.recording) return brick.startRecording();
            const note =
              window.prompt('What did you do while recording? (saved in the file)', '') ?? '';
            const capture = brick.stopRecording(note);
            if (capture) {
              saveFile(
                `capture-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`,
                JSON.stringify(capture, null, 2),
                'application/json',
              );
            }
          },
        },
        { separator: true },
        {
          label: 'Connect via USB',
          icon: 'connect',
          disabled: !support.usb,
          onClick: () => void brick.connectUsb(),
        },
        {
          label: 'Connect via Bluetooth (experimental)',
          icon: 'bluetooth',
          disabled: !support.serial,
          onClick: () => void brick.connectBluetooth(),
        },
        {
          label: 'Disconnect',
          icon: 'disconnect',
          disabled: !connected,
          onClick: () => void brick.disconnect(),
        },
        { separator: true },
        {
          label: 'Zoom in',
          icon: 'magnifier_zoom_in',
          shortcut: 'Ctrl++',
          onClick: () => actions.zoom(0.1),
        },
        {
          label: 'Zoom out',
          icon: 'magnifier_zoom_out',
          shortcut: 'Ctrl+-',
          onClick: () => actions.zoom(-0.1),
        },
      ],
    },
    {
      label: 'Simulator',
      items: [
        { label: 'Run in simulator', icon: 'car', shortcut: 'F5', onClick: actions.simulate },
        {
          label: 'Show simulator',
          icon: 'map',
          onClick: () => simActions.current?.setOpen(true),
        },
        {
          label: 'Toggle breakpoint',
          icon: 'bug',
          shortcut: 'F9',
          disabled: !state.selected,
          onClick: actions.toggleBreakpoint,
        },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'About NXT Web Studio', icon: 'information', onClick: () => setModal('about') },
      ],
    },
  ];

  const nxtTab = modal !== null && typeof modal === 'object' && 'nxt' in modal ? modal.nxt : null;

  if (!ready) return null;

  return (
    <EditorContext.Provider value={{ state, dispatch, issues, issuesByBlock }}>
      <SimulatorProvider initialScenario={initialMat}>
        <SimulatorHooks actionsRef={simActions} />
        <div className="sr-only" aria-live="polite" role="status">
          {announcement}
        </div>
        <div className="app-window">
          <div className="title-bar">
            <img src={iconUrl('brick')} alt="" />
            NXT Web Studio
            <span className="doc">
              — {state.program.name}
              {state.dirty ? '*' : ''}
            </span>
          </div>
          <MenuBar menus={menus} />
          <Toolbar
            onBrickClick={() => setModal('nxt')}
            groups={[
              {
                buttons: [
                  {
                    key: 'new',
                    label: 'New program',
                    icon: 'page_white_add',
                    onClick: actions.newProgram,
                  },
                  {
                    key: 'open',
                    label: 'Open (Ctrl+O)',
                    icon: 'folder',
                    onClick: () => void actions.open(),
                  },
                  {
                    key: 'save',
                    label: 'Save (Ctrl+S)',
                    icon: 'diskette',
                    onClick: () => void actions.save(),
                  },
                ],
              },
              {
                buttons: [
                  {
                    key: 'undo',
                    label: 'Undo (Ctrl+Z)',
                    icon: 'arrow_undo',
                    disabled: state.past.length === 0,
                    onClick: () => dispatch({ type: 'undo' }),
                  },
                  {
                    key: 'redo',
                    label: 'Redo (Ctrl+Y)',
                    icon: 'arrow_redo',
                    disabled: state.future.length === 0,
                    onClick: () => dispatch({ type: 'redo' }),
                  },
                  {
                    key: 'delete',
                    label: 'Delete block (Del)',
                    icon: 'delete',
                    disabled: !state.selected && !state.selectedWire,
                    onClick: actions.deleteSelected,
                  },
                ],
              },
              {
                optional: true,
                buttons: [
                  {
                    key: 'zoomin',
                    label: 'Zoom in',
                    icon: 'magnifier_zoom_in',
                    onClick: () => actions.zoom(0.1),
                  },
                  {
                    key: 'zoomout',
                    label: 'Zoom out',
                    icon: 'magnifier_zoom_out',
                    onClick: () => actions.zoom(-0.1),
                  },
                ],
              },
              {
                optional: true,
                buttons: [
                  {
                    key: 'myblock',
                    label: 'Make a new My Block',
                    icon: 'brick_add',
                    disabled: !state.selected,
                    onClick: actions.makeMyBlock,
                  },
                  {
                    key: 'vars',
                    label: 'Define variables',
                    icon: 'tag_red',
                    onClick: () => setModal('variables'),
                  },
                  {
                    key: 'nxt',
                    label: 'NXT window',
                    icon: 'monitor_window',
                    onClick: () => setModal('nxt'),
                  },
                  {
                    key: 'sim',
                    label: 'Run in simulator (F5)',
                    icon: 'car',
                    onClick: actions.simulate,
                  },
                ],
              },
            ]}
          />
          <SupportBanner support={support} />
          <div className="workspace">
            <Palette />
            <div className="editor-column">
              <Canvas
                onRenameProgram={actions.renameProgram}
                overlay={
                  <Controller
                    connected={connected}
                    onNxtWindow={() => setModal('nxt')}
                    onSimulate={actions.simulate}
                    onDownload={() => actions.download(false)}
                    onRun={() => actions.download(true)}
                    onStop={actions.stop}
                    onConnect={() => (connected ? setModal('nxt') : void brick.connectUsb())}
                  />
                }
              />
              <div className="bottom-area">
                <ConfigPanel onEditVariables={() => setModal('variables')} />
                <HelpPanel />
              </div>
            </div>
          </div>
        </div>
        {(modal === 'nxt' || nxtTab !== null || (modal === null && brick.error)) && (
          <NxtWindow
            key={nxtTab ?? 'communications'}
            initialTab={nxtTab ?? 'communications'}
            onClose={() => {
              brick.clearError();
              setModal(null);
            }}
          />
        )}
        {modal === 'variables' && <VariablesDialog onClose={() => setModal(null)} />}
        {modal === 'about' && <AboutDialog onClose={() => setModal(null)} />}
        {modal === 'search' && <SearchDialog onClose={() => setModal(null)} />}
        {modal === 'history' && <HistoryDialog onClose={() => setModal(null)} />}
        {modal === 'insert' && (
          <InsertDialog onInsert={cmds.insert} onClose={() => setModal(null)} />
        )}
        {modal === 'wire' && <WireDialog onClose={() => setModal(null)} />}
        {modal === 'outline' && (
          <MessageDialog
            title="Program outline"
            icon="page_white_text"
            onClose={() => setModal(null)}
          >
            <pre className="outline" tabIndex={0} aria-label="Program outline">
              {describeProgram(state.program)}
            </pre>
          </MessageDialog>
        )}
        {modal === 'datalog' && <DataLogDialog onClose={() => setModal(null)} />}
        {modal === 'calibrate' && <CalibrateDialog onClose={() => setModal(null)} />}
        {modal !== null && typeof modal === 'object' && 'title' in modal && (
          <MessageDialog title={modal.title} icon={modal.icon} onClose={() => setModal(null)}>
            {modal.body}
          </MessageDialog>
        )}
        <SimulatorSlot />
      </SimulatorProvider>
    </EditorContext.Provider>
  );
}

/** Hands the simulator controls to <Studio>, which renders the provider. */
function SimulatorHooks({ actionsRef }: { actionsRef: React.RefObject<SimulatorControls | null> }) {
  const controls = useSimulator();
  useLayoutEffect(() => {
    actionsRef.current = controls;
  });
  return null;
}

function SimulatorSlot() {
  const { open } = useSimulator();
  return open ? <SimulatorWindow /> : null;
}
