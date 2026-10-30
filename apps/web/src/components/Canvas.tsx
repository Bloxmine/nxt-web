import {
  addLane,
  connect,
  findBlock,
  findPlug,
  getSequence,
  laneRoot,
  removeLane,
  type DataType,
  type SeqRef,
} from '@nxt/blocks';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEditor } from '../editor/EditorContext';
import { parsePlug, WiringContext, type WireEnd } from '../editor/wiring';
import { iconUrl } from '../lib/icons';
import { Sequence, sequenceBeam } from './SequenceView';
import { WireLayer } from './WireLayer';

const NODE_HALF = 11;

/** Program tabs and the grid canvas holding the sequence beams. */
export function Canvas({
  overlay,
  onRenameProgram,
}: {
  overlay: ReactNode;
  onRenameProgram(): void;
}) {
  const { state, dispatch } = useEditor();
  const root = state.activeTab;
  const content = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<(WireEnd & { x: number; y: number }) | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Dragging a beam's start node downwards creates a parallel beam below it.
  const [beamDrag, setBeamDrag] = useState<{
    lane: number;
    x: number;
    y: number;
    toY: number;
  } | null>(null);
  const beamDragging = beamDrag !== null;
  const beamDragRef = useRef(beamDrag);
  useEffect(() => {
    beamDragRef.current = beamDrag;
  }, [beamDrag]);
  useEffect(() => {
    if (!beamDragging) return;
    const move = (e: PointerEvent) => {
      const r = content.current!.getBoundingClientRect();
      setBeamDrag((d) => (d ? { ...d, toY: (e.clientY - r.top) / state.zoom } : d));
    };
    const up = () => {
      const d = beamDragRef.current;
      setBeamDrag(null);
      if (d && d.toY - d.y > 30) dispatch({ type: 'edit', update: (p) => addLane(p, d.lane) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [beamDragging, state.zoom, dispatch]);

  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // Track the mouse while a wire is being drawn; finish on release.
  const pendingKey = pending ? `${pending.block}:${pending.plug}:${pending.side}` : null;
  useEffect(() => {
    if (!pendingKey) return;
    const toContent = (e: MouseEvent) => {
      const r = content.current!.getBoundingClientRect();
      return { x: (e.clientX - r.left) / state.zoom, y: (e.clientY - r.top) / state.zoom };
    };
    const move = (e: MouseEvent) => setPending((p) => (p ? { ...p, ...toContent(e) } : p));
    const up = (e: MouseEvent) => {
      const target = parsePlug(
        (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
          ?.closest('[data-plug]')
          ?.getAttribute('data-plug'),
      );
      const p = pendingRef.current;
      setPending(null);
      // The release also fires a click on whatever is underneath; swallow it.
      const swallow = (ev: Event) => ev.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      if (p && target && !(target.block === p.block && target.plug === p.plug)) {
        try {
          const next = connect(state.program, p, target);
          dispatch({ type: 'edit', update: () => next });
        } catch (error) {
          setToast(error instanceof Error ? error.message : String(error));
        }
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [pendingKey, state.zoom, state.program, dispatch]);

  const wiring = useMemo(
    () => ({
      start: (end: WireEnd, e: React.MouseEvent) => {
        const r = content.current!.getBoundingClientRect();
        setPending({
          ...end,
          x: (e.clientX - r.left) / state.zoom,
          y: (e.clientY - r.top) / state.zoom,
        });
      },
    }),
    [state.zoom],
  );

  const wireTypes = useMemo(() => {
    const map = new Map<string, DataType>();
    for (const w of state.program.wires) {
      const block = findBlock(state.program, w.from.block)?.block;
      const plug = block && findPlug(block, w.from.plug);
      if (plug) map.set(w.id, plug.type);
    }
    return map;
  }, [state.program]);

  const tabName = (tab: string) =>
    tab === 'main'
      ? `${state.program.name}${state.dirty ? '*' : ''}`
      : (state.program.myBlocks.find((m) => m.id === tab)?.name ?? 'My Block');

  const lanes: SeqRef[] =
    root === 'main'
      ? [0, ...state.program.parallel.map((_, i) => i + 1)].map((n) => ({
          root: laneRoot(n),
          parent: null,
          branch: 'body' as const,
        }))
      : [{ root, parent: null, branch: 'body' }];

  return (
    <div className="canvas-frame">
      <div className="tabs" role="tablist">
        {state.tabs.map((tab) => (
          <div
            key={tab}
            role="tab"
            aria-selected={tab === root}
            tabIndex={0}
            className={`tab ${tab === root ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'openTab', tab })}
            onKeyDown={(e) => e.key === 'Enter' && dispatch({ type: 'openTab', tab })}
            onDoubleClick={() => tab === 'main' && onRenameProgram()}
            title={tab === 'main' ? 'Double-click to rename' : 'My Block'}
          >
            <img src={iconUrl(tab === 'main' ? 'brick' : 'bricks')} alt="" />
            <span>{tabName(tab)}</span>
            {tab !== 'main' && (
              <button
                type="button"
                className="close"
                aria-label={`Close ${tabName(tab)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'closeTab', tab });
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="canvas" onClick={() => dispatch({ type: 'select', id: null })}>
        <WiringContext.Provider value={wiring}>
          <div
            ref={content}
            className={`canvas-content ${pending ? 'wiring' : ''}`}
            style={{ transform: `scale(${state.zoom})` }}
          >
            <WireLayer
              program={state.program}
              content={content}
              zoom={state.zoom}
              selectedWire={state.selectedWire}
              pending={pending}
              types={wireTypes}
              onSelectWire={(id) => dispatch({ type: 'selectWire', id })}
            />
            {beamDrag && beamDrag.toY > beamDrag.y && (
              <div
                className={`beam-ghost ${beamDrag.toY - beamDrag.y > 30 ? 'ok' : ''}`}
                style={{ left: beamDrag.x - 4, top: beamDrag.y, height: beamDrag.toY - beamDrag.y }}
              />
            )}
            <div className="lanes">
              {lanes.map((ref, i) => {
                const blocks = getSequence(state.program, ref);
                const beam = sequenceBeam(blocks);
                return (
                  <div key={ref.root} className="lane">
                    <div className="lane-start" style={{ marginTop: beam - NODE_HALF }}>
                      <span
                        data-lane-node=""
                        className={`node ${i === 0 ? 'main' : ''}`}
                        title={`${i === 0 ? 'Program start' : 'Parallel beam start'}. Drag downwards to add a parallel beam.`}
                        onPointerDown={(e) => {
                          if (root !== 'main') return;
                          e.preventDefault();
                          e.stopPropagation();
                          const r = content.current!.getBoundingClientRect();
                          const n = e.currentTarget.getBoundingClientRect();
                          const x = (n.left + n.width / 2 - r.left) / state.zoom;
                          const y = (n.top + n.height / 2 - r.top) / state.zoom;
                          setBeamDrag({ lane: i, x, y, toY: y });
                        }}
                      />
                      {i > 0 && blocks.length === 0 && (
                        <button
                          type="button"
                          className="lane-remove"
                          aria-label="Remove this parallel beam"
                          title="Remove this parallel beam"
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'edit', update: (p) => removeLane(p, i) });
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <Sequence seqRef={ref} blocks={blocks} />
                  </div>
                );
              })}
              {root === 'main' && (
                <button
                  type="button"
                  className="lane-add"
                  title="Add a parallel beam: its blocks run at the same time as the main beam. You can also drag a start node downwards."
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'edit', update: addLane });
                  }}
                >
                  <span className="node">+</span> Add parallel beam
                </button>
              )}
            </div>
          </div>
        </WiringContext.Provider>
        {toast && (
          <div className="canvas-toast" role="status">
            <img src={iconUrl('error')} alt="" />
            {toast}
          </div>
        )}
      </div>
      {overlay}
    </div>
  );
}
