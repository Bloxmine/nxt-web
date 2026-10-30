import {
  createBlock,
  emptyProgram,
  EXAMPLES,
  findBlock,
  lowerProgram,
  newId,
  removeBlock,
  updateSequence,
  type Block,
  type Program,
} from '@nxt/blocks';
import { visitStatements } from '@nxt/compiler';
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
import { NxtWindow } from './components/NxtWindow';
import { Palette } from './components/Palette';
import { SupportBanner } from './components/SupportBanner';
import { Toolbar } from './components/Toolbar';
import { VariablesDialog } from './components/VariablesDialog';
import { EditorContext, useIssues } from './editor/EditorContext';
import { editorReducer, initialState } from './editor/store';
import { checkBrowserSupport } from './lib/browserSupport';
import { openProjectFile, saveProjectFile, type SavedFile } from './lib/files';
import { iconUrl } from './lib/icons';
import { loadValue, saveValue } from './lib/storage';

const support = checkBrowserSupport(navigator);
const AUTOSAVE_KEY = 'autosave';

type Modal =
  'nxt' | 'variables' | 'about' | { title: string; icon: string; body: ReactNode } | null;

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
  const connected = brick.state === 'connected';

  // Restore the last session, then autosave every change.
  useEffect(() => {
    // ?example=<key> opens an example directly (handy for links and docs).
    const exampleKey = new URLSearchParams(window.location.search).get('example');
    const example = EXAMPLES.find((e) => e.key === exampleKey);
    void loadValue<unknown>(AUTOSAVE_KEY).then((saved) => {
      if (example) dispatch({ type: 'load', program: example.create() });
      else if (isProgram(saved)) dispatch({ type: 'load', program: saved });
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => void saveValue(AUTOSAVE_KEY, state.program), 400);
    return () => clearTimeout(id);
  }, [state.program, ready]);

  useEffect(() => {
    document.title = `${state.program.name}${state.dirty ? '*' : ''} - NXT Web Studio`;
  }, [state.program.name, state.dirty]);

  const confirmDiscard = () =>
    !state.dirty || window.confirm('Discard unsaved changes to this program?');

  const message = (title: string, icon: string, body: ReactNode) => setModal({ title, icon, body });

  const actions = {
    newProgram: () => {
      if (!confirmDiscard()) return;
      fileHandle.current = null;
      dispatch({ type: 'load', program: emptyProgram() });
    },
    open: async () => {
      if (!confirmDiscard()) return;
      try {
        const result = await openProjectFile();
        if (!result) return;
        fileHandle.current = result.handle;
        dispatch({ type: 'load', program: result.program });
      } catch (e) {
        message('Could not open', 'exclamation', e instanceof Error ? e.message : String(e));
      }
    },
    save: async (saveAs = false) => {
      try {
        fileHandle.current = await saveProjectFile(state.program, fileHandle.current, saveAs);
        dispatch({ type: 'saved' });
      } catch (e) {
        message('Could not save', 'exclamation', e instanceof Error ? e.message : String(e));
      }
    },
    loadExample: (key: string) => {
      const example = EXAMPLES.find((e) => e.key === key);
      if (!example || !confirmDiscard()) return;
      fileHandle.current = null;
      dispatch({ type: 'load', program: example.create() });
    },
    renameProgram: () => {
      const name = window.prompt('Program name:', state.program.name);
      if (name?.trim())
        dispatch({ type: 'edit', update: (p) => ({ ...p, name: name.trim().slice(0, 15) }) });
    },
    deleteSelected: () => {
      const id = state.selected;
      if (id) dispatch({ type: 'edit', update: (p) => removeBlock(p, id), select: null });
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
        if (first) dispatch({ type: 'openTab', tab: first.ref.root });
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
      const ir = lowerProgram(state.program);
      let count = 0;
      visitStatements(ir.main, () => count++);
      for (const s of ir.subroutines) visitStatements(s.body, () => count++);
      message(
        run ? 'Download and run' : 'Download',
        'information',
        <>
          <p style={{ marginTop: 0 }}>
            <strong>Your program checks out.</strong> It was translated into {count} steps for the
            brick.
          </p>
          <p>
            Turning those steps into a file the brick can run is the next stage of development (the
            compiler, Phase 3). Until then, use the NXT window to drive motors and read sensors
            live.
          </p>
          {!connected && <p>Tip: connect your brick with the button in the top-right corner.</p>}
        </>,
      );
    },
    stop: () => void brick.stopEverything(),
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

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'New', icon: 'page_white_add', onClick: actions.newProgram },
        { label: 'Open…', icon: 'folder', shortcut: 'Ctrl+O', onClick: () => void actions.open() },
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
          label: 'Delete block',
          icon: 'delete',
          shortcut: 'Del',
          disabled: !state.selected,
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
      label: 'Tools',
      items: [
        { label: 'NXT Window', icon: 'monitor_window', onClick: () => setModal('nxt') },
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
      label: 'Help',
      items: [
        { label: 'About NXT Web Studio', icon: 'information', onClick: () => setModal('about') },
      ],
    },
  ];

  if (!ready) return null;

  return (
    <EditorContext.Provider value={{ state, dispatch, issues, issuesByBlock }}>
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
                  disabled: !state.selected,
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
      {(modal === 'nxt' || (modal === null && brick.error)) && (
        <NxtWindow
          onClose={() => {
            brick.clearError();
            setModal(null);
          }}
        />
      )}
      {modal === 'variables' && <VariablesDialog onClose={() => setModal(null)} />}
      {modal === 'about' && <AboutDialog onClose={() => setModal(null)} />}
      {modal !== null && typeof modal === 'object' && (
        <MessageDialog title={modal.title} icon={modal.icon} onClose={() => setModal(null)}>
          {modal.body}
        </MessageDialog>
      )}
    </EditorContext.Provider>
  );
}
