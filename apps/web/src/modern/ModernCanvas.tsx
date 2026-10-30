import { pruneWires } from '@nxt/blocks';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useDebugView } from '../sim/SimulatorContext';
import { fromBlockly, toBlockly, type BlocklyState } from './convert';

import type * as BlocklyNS from 'blockly';
import type * as SetupModule from './blocklySetup';

type Setup = typeof SetupModule;

/**
 * The modern view: the same program in Blockly. Edits update the program (and undo
 * history); changes made elsewhere (undo, the settings panel) reload the workspace.
 */
export function ModernCanvas({ overlay }: { overlay: ReactNode }) {
  const { state, dispatch } = useEditor();
  const debug = useDebugView();
  const host = useRef<HTMLDivElement>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workspace = useRef<BlocklyNS.WorkspaceSvg | null>(null);
  /** The program as the workspace last saw it, to tell our own edits from others. */
  const shown = useRef<unknown>(null);
  const latest = useRef({ program: state.program, tab: state.activeTab });
  useEffect(() => {
    latest.current = { program: state.program, tab: state.activeTab };
  });
  const dark = document.documentElement.dataset['theme'] === 'dark';

  useEffect(() => {
    import('./blocklySetup')
      .then((s) => {
        s.defineBlocks();
        setSetup(s);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  // Create the workspace.
  useEffect(() => {
    if (!setup || !host.current) return;
    const { Blockly } = setup;
    const ws = Blockly.inject(host.current, {
      toolbox: setup.TOOLBOX,
      theme: setup.theme(dark),
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.9 },
      grid: { spacing: 24, length: 3, colour: dark ? '#30333a' : '#dedbd0', snap: true },
      renderer: 'geras',
    });
    workspace.current = ws;
    // Keep the zoom buttons and trashcan clear of the NXT controller in the corner: they
    // stack up from the corner, past the rectangles of components placed before them.
    const frame = host.current;
    const controllerSpot: BlocklyNS.IPositionable = {
      id: 'nxtController',
      position: () => {},
      getBoundingRectangle: () => {
        const controller = frame.parentElement?.querySelector('.controller');
        if (!controller) return null;
        const c = controller.getBoundingClientRect();
        const h = frame.getBoundingClientRect();
        return new Blockly.utils.Rect(
          c.top - h.top,
          c.bottom - h.top,
          c.left - h.left,
          c.right - h.left,
        );
      },
    };
    ws.getComponentManager().addComponent({
      component: controllerSpot,
      weight: Blockly.ComponentManager.ComponentWeight.FLYOUT_WEIGHT,
      capabilities: [Blockly.ComponentManager.Capability.POSITIONABLE],
    });
    ws.resize();
    let timer: ReturnType<typeof setTimeout> | undefined;
    ws.addChangeListener((e: BlocklyNS.Events.Abstract) => {
      if (e.type === Blockly.Events.SELECTED) {
        const id = (e as BlocklyNS.Events.Selected).newElementId;
        if (id && !id.startsWith('start:')) dispatch({ type: 'select', id });
        return;
      }
      if (e.isUiEvent || ws.isDragging()) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { program, tab } = latest.current;
        const saved = Blockly.serialization.workspaces.save(ws) as unknown as BlocklyState;
        const next = pruneWires(fromBlockly(saved, program, tab));
        shown.current = next;
        dispatch({ type: 'edit', update: () => next, coalesce: 'blockly' });
      }, 150);
    });
    const resize = new ResizeObserver(() => Blockly.svgResize(ws));
    resize.observe(host.current);
    return () => {
      clearTimeout(timer);
      resize.disconnect();
      ws.dispose();
      workspace.current = null;
      shown.current = null;
    };
  }, [setup, dark, dispatch]);

  // Load the program when it changed outside the workspace (or the tab changed).
  useEffect(() => {
    const ws = workspace.current;
    if (!setup || !ws || shown.current === state.program) return;
    const { Blockly } = setup;
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(toBlockly(state.program, state.activeTab) as never, ws);
    } finally {
      Blockly.Events.enable();
    }
    shown.current = state.program;
  }, [setup, state.program, state.activeTab]);

  // Light up the running block while simulating.
  const active = [...debug.active][0] ?? null;
  useEffect(() => {
    workspace.current?.highlightBlock(active);
  }, [active, setup]);

  return (
    <div className="canvas-frame modern">
      {error ? (
        <p className="notice error">Blockly could not be loaded: {error}</p>
      ) : (
        <div ref={host} className="blockly-host" aria-label="Program in Blockly" />
      )}
      {!setup && !error && <p className="blockly-loading">Loading blocks…</p>}
      {overlay}
    </div>
  );
}
