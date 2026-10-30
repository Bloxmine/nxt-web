import { newId, type CanvasComment, type Program } from '@nxt/blocks';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useEditor } from '../editor/EditorContext';

const commentsOf = (p: Program) => p.comments ?? [];

/** Adds a comment near the top-left of the visible canvas area. */
export function addComment(program: Program, tab: string, x: number, y: number): Program {
  const comment: CanvasComment = { id: newId('c'), tab, x, y, text: '' };
  return { ...program, comments: [...commentsOf(program), comment] };
}

/** Yellow notes on the canvas, like the original's comment tool. */
export function Comments({ zoom }: { zoom: number }) {
  const { state, dispatch } = useEditor();
  const comments = commentsOf(state.program).filter((c) => c.tab === state.activeTab);
  const update = (id: string, patch: Partial<CanvasComment>, coalesce: string) =>
    dispatch({
      type: 'edit',
      coalesce,
      update: (p) => ({
        ...p,
        comments: commentsOf(p).map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }),
    });

  return (
    <>
      {comments.map((c) => (
        <div
          key={c.id}
          className="canvas-comment"
          style={{ left: c.x, top: c.y }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="canvas-comment-bar"
            title="Drag to move"
            onPointerDown={(e) => {
              e.stopPropagation();
              const start = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y };
              const move = (ev: PointerEvent) =>
                update(
                  c.id,
                  {
                    x: Math.max(0, Math.round(start.cx + (ev.clientX - start.x) / zoom)),
                    y: Math.max(0, Math.round(start.cy + (ev.clientY - start.y) / zoom)),
                  },
                  `comment-move-${c.id}`,
                );
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          >
            <button
              type="button"
              aria-label="Delete comment"
              title="Delete comment"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() =>
                dispatch({
                  type: 'edit',
                  update: (p) => ({ ...p, comments: commentsOf(p).filter((x) => x.id !== c.id) }),
                })
              }
            >
              ×
            </button>
          </div>
          <textarea
            aria-label="Comment"
            value={c.text}
            placeholder="Type a comment…"
            autoFocus={c.text === ''}
            onChange={(e) => update(c.id, { text: e.target.value }, `comment-${c.id}`)}
          />
        </div>
      ))}
    </>
  );
}

/** Rectangle being dragged out on empty canvas, in content coordinates. */
export interface Marquee {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Box selection: dragging on empty canvas selects every block the box touches.
 * Returns the box to draw (or null) and a pointer-down handler for the canvas.
 */
export function useMarquee(content: RefObject<HTMLDivElement | null>, zoom: number) {
  const { dispatch } = useEditor();
  const [box, setBox] = useState<Marquee | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    // Box selection is for mice; on touch screens a drag scrolls the canvas.
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        '[data-block-id], button, [data-plug], .canvas-comment, .node, input, textarea',
      )
    )
      return;
    const el = content.current;
    if (!el) return;
    const origin = el.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      moved = true;
      setBox({
        x: (Math.min(sx, ev.clientX) - origin.left) / zoom,
        y: (Math.min(sy, ev.clientY) - origin.top) / zoom,
        w: Math.abs(ev.clientX - sx) / zoom,
        h: Math.abs(ev.clientY - sy) / zoom,
      });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setBox(null);
      if (!moved) return;
      const left = Math.min(sx, ev.clientX);
      const right = Math.max(sx, ev.clientX);
      const top = Math.min(sy, ev.clientY);
      const bottom = Math.max(sy, ev.clientY);
      const ids = [...el.querySelectorAll<HTMLElement>('[data-block-id]')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return r.left < right && r.right > left && r.top < bottom && r.bottom > top;
        })
        .map((b) => b.dataset['blockId']!);
      dispatch({ type: 'selectMany', ids });
      // The release also fires a click on the canvas, which would clear the selection.
      const swallow = (ce: Event) => ce.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return { box, onPointerDown };
}

/**
 * The Work Map: a small overview of the whole canvas with the visible part outlined.
 * Click or drag on it to scroll there.
 */
export function WorkMap({
  scroller,
  content,
  version,
}: {
  scroller: RefObject<HTMLDivElement | null>;
  content: RefObject<HTMLDivElement | null>;
  /** Changes whenever the program changes, to redraw. */
  version: unknown;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const redraw = () => setTick((t) => t + 1);
    el.addEventListener('scroll', redraw);
    window.addEventListener('resize', redraw);
    return () => {
      el.removeEventListener('scroll', redraw);
      window.removeEventListener('resize', redraw);
    };
  }, [scroller]);

  const scale = () => {
    const el = scroller.current!;
    const c = canvas.current!;
    return Math.min(c.width / el.scrollWidth, c.height / el.scrollHeight);
  };

  useEffect(() => {
    const el = scroller.current;
    const root = content.current;
    const ctx = canvas.current?.getContext('2d');
    if (!el || !root || !ctx) return;
    const s = scale();
    const origin = el.getBoundingClientRect();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#efede4';
    ctx.fillRect(0, 0, el.scrollWidth * s, el.scrollHeight * s);
    const colors: Record<string, string> = {
      action: '#39a12f',
      sensor: '#d8b800',
      flow: '#f39012',
      data: '#d8402f',
      advanced: '#7b5bd6',
      custom: '#3b9be0',
    };
    for (const b of root.querySelectorAll<HTMLElement>('[data-block-id]')) {
      const r = b.getBoundingClientRect();
      const cat = /cat-(\w+)/.exec(b.className)?.[1];
      ctx.fillStyle =
        b.classList.contains('loop') || b.classList.contains('switch')
          ? 'rgba(243,144,18,0.35)'
          : (colors[cat ?? ''] ?? '#888');
      ctx.fillRect(
        (r.left - origin.left + el.scrollLeft) * s,
        (r.top - origin.top + el.scrollTop) * s,
        Math.max(2, r.width * s),
        Math.max(2, r.height * s),
      );
    }
    ctx.strokeStyle = '#2f6fd1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(el.scrollLeft * s, el.scrollTop * s, el.clientWidth * s, el.clientHeight * s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, version]);

  const jump = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = scroller.current;
    if (!el) return;
    const go = (clientX: number, clientY: number) => {
      const r = canvas.current!.getBoundingClientRect();
      const s = scale() * (r.width / canvas.current!.width);
      el.scrollTo({
        left: (clientX - r.left) / s - el.clientWidth / 2,
        top: (clientY - r.top) / s - el.clientHeight / 2,
      });
    };
    go(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => go(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="work-map" onClick={(e) => e.stopPropagation()}>
      <div className="work-map-title">Work Map</div>
      <canvas
        ref={canvas}
        width={200}
        height={120}
        onPointerDown={jump}
        aria-label="Overview of the program; click to scroll there"
      />
    </div>
  );
}
