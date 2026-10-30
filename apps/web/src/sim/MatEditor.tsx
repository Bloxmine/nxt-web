import { MAT_COLORS, type MatShape, type Pose, type Scenario, type Wall } from '@nxt/sim';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import { parseMat } from '../lib/mats';
import { saveFile } from '../tools/convert';
import { beginMat, drawScenario, drawShape, matTransform } from './draw';

type Tool = 'line' | 'rect' | 'circle' | 'wall' | 'start' | 'move' | 'erase';

const TOOLS: [Tool, string, string][] = [
  ['line', 'draw_line', 'Tape line: draw with the mouse; end where you started to close it'],
  ['rect', 'shape_square', 'Coloured box: drag from corner to corner'],
  ['circle', 'draw_ellipse', 'Coloured circle: drag from the centre outwards'],
  ['wall', 'wall', 'Wall: drag from corner to corner'],
  ['start', 'flag_green', 'Start: click where the robot starts, drag to point it'],
  ['move', 'shape_handles', 'Move: drag a shape or wall'],
  ['erase', 'draw_eraser', 'Erase: click a shape or wall'],
];

const SWATCHES = ['black', 'white', 'grey', 'red', 'green', 'blue', 'yellow'];
const LINE_WIDTHS = [1, 2, 2.5, 3, 5];
/** Pixels per centimetre for imported photos (at most this many columns). */
const PHOTO_PX_PER_CM = 2;
const PHOTO_MAX_COLS = 400;

type Point = { x: number; y: number };
type Drag =
  | { kind: 'line'; points: [number, number][] }
  | { kind: 'rect' | 'circle' | 'wall'; from: Point; to: Point }
  | { kind: 'move'; target: Target; last: Point };
type Target = { list: 'shapes' | 'walls'; index: number };

const round = (n: number) => Math.round(n * 10) / 10;

function segmentDistance(p: Point, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len));
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
}

function hitsShape(shape: MatShape, p: Point): boolean {
  switch (shape.type) {
    case 'rect':
    case 'bitmap':
      return (
        p.x >= shape.x && p.x <= shape.x + shape.w && p.y >= shape.y && p.y <= shape.y + shape.h
      );
    case 'circle':
      return Math.hypot(p.x - shape.x, p.y - shape.y) <= shape.r;
    case 'path': {
      const n = shape.closed ? shape.points.length : shape.points.length - 1;
      for (let i = 0; i < n; i++) {
        const a = shape.points[i]!;
        const b = shape.points[(i + 1) % shape.points.length]!;
        if (segmentDistance(p, a, b) <= shape.width / 2 + 1.5) return true;
      }
      return false;
    }
  }
}

const hitsWall = (w: Wall, p: Point) =>
  p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h;

/** The topmost wall or shape at a point (walls are drawn on top). */
function hitTest(mat: Scenario, p: Point): Target | null {
  for (let i = mat.walls.length - 1; i >= 0; i--) {
    if (hitsWall(mat.walls[i]!, p)) return { list: 'walls', index: i };
  }
  for (let i = mat.shapes.length - 1; i >= 0; i--) {
    if (hitsShape(mat.shapes[i]!, p)) return { list: 'shapes', index: i };
  }
  return null;
}

function moveShape(shape: MatShape, dx: number, dy: number): MatShape {
  if (shape.type === 'path') {
    return { ...shape, points: shape.points.map(([x, y]) => [round(x + dx), round(y + dy)]) };
  }
  return { ...shape, x: round(shape.x + dx), y: round(shape.y + dy) };
}

const box = (a: Point, b: Point) => ({
  x: round(Math.min(a.x, b.x)),
  y: round(Math.min(a.y, b.y)),
  w: round(Math.abs(a.x - b.x)),
  h: round(Math.abs(a.y - b.y)),
});

/** Draws the start position as an arrow. */
function drawStart(ctx: CanvasRenderingContext2D, start: Pose): void {
  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate((start.heading * Math.PI) / 180);
  ctx.fillStyle = 'rgba(30, 160, 60, 0.85)';
  ctx.strokeStyle = '#0d5a20';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -7);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Reads a picture file into a bitmap shape covering a mat `width` cm wide. */
async function photoShape(file: File, width: number): Promise<{ shape: MatShape; height: number }> {
  const image = await createImageBitmap(file);
  const height = Math.max(20, Math.round((width * image.height) / image.width));
  const cols = Math.min(PHOTO_MAX_COLS, Math.round(width * PHOTO_PX_PER_CM));
  const rows = Math.max(1, Math.round((cols * image.height) / image.width));
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot read pictures.');
  ctx.drawImage(image, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const pixels: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
  }
  return { shape: { type: 'bitmap', x: 0, y: 0, w: width, h: height, cols, rows, pixels }, height };
}

/**
 * Draws a mat for the simulator: tape lines, coloured areas, walls, where the robot
 * starts, or a photo of a real mat. Mats are kept in this browser.
 */
export function MatEditor({
  mat,
  custom,
  onClose,
  onSave,
  onDelete,
}: {
  mat: Scenario;
  /** True when editing a saved mat (it can be deleted). */
  custom: boolean;
  onClose(): void;
  onSave(mat: Scenario): Promise<void>;
  onDelete(id: string): Promise<void>;
}) {
  const [draft, setDraft] = useState(mat);
  const [history, setHistory] = useState<Scenario[]>([]);
  const [tool, setTool] = useState<Tool>('line');
  const [color, setColor] = useState('black');
  const [lineWidth, setLineWidth] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [, setFrame] = useState(0);

  const change = (update: (m: Scenario) => Scenario) => {
    setHistory((h) => [...h.slice(-49), draft]);
    setDraft(update);
  };
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setDraft(previous);
  };

  // Redraw on every change (and while dragging, via setFrame).
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    beginMat(ctx, draft);
    drawScenario(ctx, draft);
    drawStart(ctx, draft.start);
    const d = drag.current;
    if (d?.kind === 'line' && d.points.length > 1) {
      drawShape(ctx, { type: 'path', points: d.points, width: lineWidth, color });
    } else if (d?.kind === 'rect' || d?.kind === 'wall') {
      const b = box(d.from, d.to);
      ctx.fillStyle = d.kind === 'wall' ? 'rgba(150, 100, 50, 0.6)' : (MAT_COLORS[color] ?? color);
      ctx.fillRect(b.x, b.y, b.w, b.h);
    } else if (d?.kind === 'circle') {
      drawShape(ctx, {
        type: 'circle',
        x: d.from.x,
        y: d.from.y,
        r: Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y),
        color,
      });
    }
  });

  const toMat = (e: { clientX: number; clientY: number }): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { scale, ox, oy } = matTransform(canvas, draft);
    const px = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const py = ((e.clientY - rect.top) * canvas.height) / rect.height;
    return {
      x: round(Math.max(0, Math.min(draft.width, (px - ox) / scale))),
      y: round(Math.max(0, Math.min(draft.height, (py - oy) / scale))),
    };
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = toMat(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    switch (tool) {
      case 'line':
        drag.current = { kind: 'line', points: [[p.x, p.y]] };
        break;
      case 'rect':
      case 'circle':
      case 'wall':
        drag.current = { kind: tool, from: p, to: p };
        break;
      case 'start':
        change((m) => ({ ...m, start: { ...m.start, x: p.x, y: p.y } }));
        drag.current = { kind: 'rect', from: p, to: p };
        break;
      case 'move': {
        const target = hitTest(draft, p);
        if (target) {
          setHistory((h) => [...h.slice(-49), draft]);
          drag.current = { kind: 'move', target, last: p };
        }
        break;
      }
      case 'erase': {
        const target = hitTest(draft, p);
        if (target) {
          change((m) => ({
            ...m,
            [target.list]: m[target.list].filter((_, i) => i !== target.index),
          }));
        }
        break;
      }
    }
    setFrame((f) => f + 1);
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toMat(e);
    if (d.kind === 'line') {
      const last = d.points[d.points.length - 1]!;
      if (Math.hypot(p.x - last[0], p.y - last[1]) >= 2) d.points.push([p.x, p.y]);
    } else if (d.kind === 'move') {
      const dx = p.x - d.last.x;
      const dy = p.y - d.last.y;
      d.last = p;
      const { list, index } = d.target;
      setDraft((m) =>
        list === 'walls'
          ? {
              ...m,
              walls: m.walls.map((w, i) =>
                i === index ? { ...w, x: round(w.x + dx), y: round(w.y + dy) } : w,
              ),
            }
          : { ...m, shapes: m.shapes.map((s, i) => (i === index ? moveShape(s, dx, dy) : s)) },
      );
    } else if (tool === 'start') {
      const heading = (Math.atan2(p.y - d.from.y, p.x - d.from.x) * 180) / Math.PI;
      if (Math.hypot(p.x - d.from.x, p.y - d.from.y) > 2) {
        setDraft((m) => ({
          ...m,
          start: { ...m.start, heading: Math.round((heading + 360) % 360) },
        }));
      }
    } else {
      d.to = p;
    }
    setFrame((f) => f + 1);
  };

  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || tool === 'start') return setFrame((f) => f + 1);
    if (d.kind === 'line' && d.points.length > 1) {
      const first = d.points[0]!;
      const last = d.points[d.points.length - 1]!;
      const closed = d.points.length > 6 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 8;
      const points = closed ? d.points.slice(0, -1) : d.points;
      change((m) => ({
        ...m,
        shapes: [...m.shapes, { type: 'path', points, width: lineWidth, color, closed }],
      }));
    } else if (d.kind === 'rect' || d.kind === 'wall') {
      const b = box(d.from, d.to);
      if (b.w >= 1 && b.h >= 1) {
        change((m) =>
          d.kind === 'wall'
            ? { ...m, walls: [...m.walls, b] }
            : { ...m, shapes: [...m.shapes, { type: 'rect', ...b, color }] },
        );
      }
    } else if (d.kind === 'circle') {
      const r = round(Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y));
      if (r >= 1) {
        change((m) => ({
          ...m,
          shapes: [...m.shapes, { type: 'circle', x: d.from.x, y: d.from.y, r, color }],
        }));
      }
    }
    setFrame((f) => f + 1);
  };

  const importPhoto = async (file: File) => {
    try {
      const { shape, height } = await photoShape(file, draft.width);
      change((m) => ({
        ...m,
        height,
        shapes: [shape, ...m.shapes.filter((s) => s.type !== 'bitmap')],
      }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const importJson = async (file: File) => {
    try {
      const loaded = parseMat(await file.text());
      change(() => ({ ...loaded, id: draft.id }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file is not a mat.');
    }
  };

  const size = (key: 'width' | 'height', label: string) => (
    <label className="robot-field">
      {label}
      <input
        className="num-input"
        type="number"
        min={40}
        max={500}
        step={10}
        value={draft[key]}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (v >= 40 && v <= 500) change((m) => ({ ...m, [key]: v }));
        }}
      />
      cm
    </label>
  );

  return (
    <Dialog
      title={`Mat editor — ${draft.name}`}
      icon="map_edit"
      width={960}
      onClose={onClose}
      footer={
        <>
          {custom && (
            <button
              type="button"
              className="btn"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (window.confirm(`Delete the mat “${draft.name}”?`)) void onDelete(draft.id);
              }}
            >
              <img src={iconUrl('map_delete')} alt="" /> Delete
            </button>
          )}
          <button type="button" className="btn" onClick={() => jsonInput.current?.click()}>
            Import…
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              saveFile(
                `${draft.name.replace(/[^\w -]+/g, '') || 'mat'}.nxtmat.json`,
                JSON.stringify(draft),
                'application/json',
              )
            }
          >
            Export…
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              void onSave(draft).then(onClose);
            }}
          >
            <img src={iconUrl('page_save')} alt="" /> Save
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div
        className="mat-editor"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undo();
          }
        }}
      >
        <div className="mat-tools" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map(([t, icon, title]) => (
            <button
              key={t}
              type="button"
              className={`tool-btn ${tool === t ? 'pressed' : ''}`}
              aria-pressed={tool === t}
              title={title}
              aria-label={title.split(':')[0]}
              onClick={() => setTool(t)}
            >
              <img src={iconUrl(icon)} alt="" />
            </button>
          ))}
          <span className="tool-sep" />
          <button
            type="button"
            className="tool-btn"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={history.length === 0}
            onClick={undo}
          >
            <img src={iconUrl('arrow_undo')} alt="" />
          </button>
        </div>
        <canvas
          ref={canvasRef}
          className="mat-canvas"
          width={620}
          height={440}
          tabIndex={0}
          aria-label={`Mat ${draft.name}, ${draft.width} by ${draft.height} cm`}
          style={{
            cursor: tool === 'move' ? 'move' : tool === 'erase' ? 'not-allowed' : 'crosshair',
          }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <div className="mat-props">
          <label className="robot-field">
            Name
            <input
              className="text-input"
              value={draft.name}
              onChange={(e) => setDraft((m) => ({ ...m, name: e.target.value }))}
            />
          </label>
          <label className="robot-field" style={{ alignItems: 'flex-start' }}>
            About
            <textarea
              className="text-input"
              rows={3}
              value={draft.description}
              placeholder="What to do on this mat"
              onChange={(e) => setDraft((m) => ({ ...m, description: e.target.value }))}
            />
          </label>
          {size('width', 'Width')}
          {size('height', 'Height')}
          <label className="robot-field">
            <input
              type="checkbox"
              checked={draft.fenced}
              onChange={(e) => change((m) => ({ ...m, fenced: e.target.checked }))}
            />
            Fence around the edge
          </label>
          <fieldset className="groupbox">
            <legend>Colour</legend>
            <div className="mat-swatches">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={color === c ? 'active' : ''}
                  style={{ background: MAT_COLORS[c] ?? c }}
                  title={c}
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                />
              ))}
              <input
                type="color"
                aria-label="Other colour"
                title="Other colour"
                value={color.startsWith('#') ? color : (MAT_COLORS[color] ?? '#000000')}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <label className="robot-field">
              Line width
              <select
                value={lineWidth}
                aria-label="Line width"
                onChange={(e) => setLineWidth(Number(e.target.value))}
              >
                {LINE_WIDTHS.map((w) => (
                  <option key={w} value={w}>
                    {w} cm
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              onClick={() => change((m) => ({ ...m, background: color }))}
            >
              <img src={iconUrl('paintcan')} alt="" /> Fill background
            </button>
          </fieldset>
          <button type="button" className="btn" onClick={() => photoInput.current?.click()}>
            <img src={iconUrl('image')} alt="" /> Use a photo…
          </button>
          <button
            type="button"
            className="btn"
            disabled={draft.shapes.length + draft.walls.length === 0}
            onClick={() => change((m) => ({ ...m, shapes: [], walls: [] }))}
          >
            Clear everything
          </button>
          {error && <p className="notice error">{error}</p>}
          <p className="sim-muted">
            A photo covers the mat; the light and color sensors see its colours. Draw lines and
            walls on top of it.
          </p>
        </div>
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importPhoto(file);
        }}
      />
      <input
        ref={jsonInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importJson(file);
        }}
      />
    </Dialog>
  );
}
