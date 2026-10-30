import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import { brickFileName, imageToRic, saveFile } from './convert';
import * as pic from './picture';

type Tool = 'pencil' | 'eraser' | 'line' | 'rect' | 'box' | 'ellipse' | 'fill' | 'text';

const TOOLS: [Tool, string, string][] = [
  ['pencil', 'pencil', 'Pencil'],
  ['eraser', 'draw_eraser', 'Eraser'],
  ['line', 'draw_line', 'Line'],
  ['rect', 'shape_square', 'Rectangle'],
  ['box', 'draw_points', 'Filled rectangle'],
  ['ellipse', 'draw_ellipse', 'Ellipse'],
  ['fill', 'paintcan', 'Fill'],
  ['text', 'text_large_cap', 'Text (in the brick’s font)'],
];

/** Screen pixels per picture pixel. */
const ZOOM = 6;

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/**
 * Tools → Picture editor: draw a black-and-white picture for the brick's screen (up to
 * 100 × 64) and save it as an .ric file for the Display block.
 */
export function PictureEditor({ onClose }: { onClose(): void }) {
  const brick = useBrick();
  const [bitmap, setBitmap] = useState(() => pic.blank());
  const [history, setHistory] = useState<pic.Bitmap[]>([]);
  const [tool, setTool] = useState<Tool>('pencil');
  const [label, setLabel] = useState('Hello');
  const [name, setName] = useState('My picture');
  const [grid, setGrid] = useState(true);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  /** While drawing: the picture before the stroke, where it started and the last point. */
  const stroke = useRef<{
    base: pic.Bitmap;
    from: [number, number];
    last: [number, number];
  } | null>(null);

  const change = (next: pic.Bitmap) => {
    setHistory((h) => [...h.slice(-49), bitmap]);
    setBitmap(next);
  };
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setBitmap(previous);
  };

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const { width, height, pixels } = bitmap;
    ctx.fillStyle = '#b8cc94';
    ctx.fillRect(0, 0, width * ZOOM, height * ZOOM);
    ctx.fillStyle = '#26321a';
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y * width + x]) ctx.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
      }
    }
    if (grid) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < width; x++) {
        ctx.moveTo(x * ZOOM + 0.5, 0);
        ctx.lineTo(x * ZOOM + 0.5, height * ZOOM);
      }
      for (let y = 1; y < height; y++) {
        ctx.moveTo(0, y * ZOOM + 0.5);
        ctx.lineTo(width * ZOOM, y * ZOOM + 0.5);
      }
      ctx.stroke();
    }
  }, [bitmap, grid]);

  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return [
      Math.floor(((e.clientX - r.left) * c.width) / r.width / ZOOM),
      Math.floor(((e.clientY - r.top) * c.height) / r.height / ZOOM),
    ];
  };

  /** The picture with the current stroke from `from` to `to` drawn on `base`. */
  const paint = (
    base: pic.Bitmap,
    from: [number, number],
    last: [number, number],
    to: [number, number],
  ) => {
    const b = pic.copy(base);
    const on = tool !== 'eraser';
    switch (tool) {
      case 'pencil':
      case 'eraser':
        pic.line(b, last[0], last[1], to[0], to[1], on);
        break;
      case 'line':
        pic.line(b, from[0], from[1], to[0], to[1], true);
        break;
      case 'rect':
      case 'box':
        pic.rect(b, from[0], from[1], to[0], to[1], tool === 'box', true);
        break;
      case 'ellipse':
        pic.ellipse(b, from[0], from[1], to[0], to[1], true);
        break;
      case 'fill':
        pic.flood(b, to[0], to[1], !pic.get(b, to[0], to[1]));
        break;
      case 'text':
        pic.text(b, to[0], to[1], label, true);
        break;
    }
    return b;
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = at(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setMessage(null);
    if (tool === 'fill' || tool === 'text') {
      change(paint(bitmap, p, p, p));
      return;
    }
    stroke.current = { base: bitmap, from: p, last: p };
    setHistory((h) => [...h.slice(-49), bitmap]);
    setBitmap(paint(bitmap, p, p, p));
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    if (!s) return;
    const p = at(e);
    if (tool === 'pencil' || tool === 'eraser') {
      // Freehand strokes add to the picture; shapes are redrawn from the base each time.
      const last = s.last;
      setBitmap((b) => paint(b, s.from, last, p));
      s.last = p;
    } else {
      setBitmap(paint(s.base, s.from, s.last, p));
    }
  };

  const up = () => {
    stroke.current = null;
  };

  const fileName = brickFileName(name, 'ric');
  const bytes = () => pic.toRic(bitmap);

  const open = async () => {
    const file = await pickFile('.ric,image/*');
    if (!file) return;
    try {
      if (/\.ric$/i.test(file.name)) {
        change(pic.fromRic(new Uint8Array(await file.arrayBuffer())));
      } else {
        const image = await imageToRic(file);
        change({
          width: image.width,
          height: image.height,
          pixels: Uint8Array.from(image.preview, (p) => (p ? 1 : 0)),
        });
      }
      setName(file.name.replace(/\.[^.]*$/, '').slice(0, 15));
      setMessage(null);
    } catch (e) {
      setMessage({
        error: true,
        text: e instanceof Error ? e.message : 'This file is not a picture.',
      });
    }
  };

  const upload = async () => {
    if (!brick.client) return;
    try {
      await brick.client.uploadFile(fileName, bytes());
      setMessage({
        error: false,
        text: `${fileName} is on the brick. Pick it in a Display block.`,
      });
    } catch (e) {
      setMessage({ error: true, text: friendlyError(e) ?? String(e) });
    }
  };

  const size = (key: 'width' | 'height', max: number) => (
    <input
      className="num-input"
      type="number"
      min={1}
      max={max}
      value={bitmap[key]}
      aria-label={key === 'width' ? 'Width' : 'Height'}
      onChange={(e) => {
        const v = e.target.valueAsNumber;
        if (v >= 1 && v <= max) {
          change(
            pic.resize(
              bitmap,
              key === 'width' ? v : bitmap.width,
              key === 'height' ? v : bitmap.height,
            ),
          );
        }
      }}
    />
  );

  return (
    <Dialog
      title="Picture editor"
      icon="picture_edit"
      width={860}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            style={{ marginRight: 'auto' }}
            onClick={() => void open()}
          >
            Open…
          </button>
          <button type="button" className="btn" onClick={() => saveFile(fileName, bytes())}>
            Save .ric…
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!brick.client}
            title={brick.client ? undefined : 'Connect a brick first'}
            onClick={() => void upload()}
          >
            <img src={iconUrl('page_white_put')} alt="" /> Send to brick
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div
        className="picture-editor"
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
              aria-label={title}
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
        <div className="picture-canvas">
          <canvas
            ref={canvas}
            width={bitmap.width * ZOOM}
            height={bitmap.height * ZOOM}
            tabIndex={0}
            aria-label={`Picture, ${bitmap.width} by ${bitmap.height} pixels`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>
        <div className="mat-props">
          <label className="robot-field">
            Name
            <input
              className="text-input"
              value={name}
              maxLength={15}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="robot-field">
            Size {size('width', 100)} × {size('height', 64)}
          </label>
          {tool === 'text' && (
            <label className="robot-field">
              Text
              <input
                className="text-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
          )}
          <div className="log-setup">
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              onClick={() => change(pic.invert(bitmap))}
            >
              Invert
            </button>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              title="Flip left to right"
              onClick={() => change(pic.flip(bitmap, 'horizontal'))}
            >
              <img src={iconUrl('shape_flip_horizontal')} alt="Flip left to right" />
            </button>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              title="Flip upside down"
              onClick={() => change(pic.flip(bitmap, 'vertical'))}
            >
              <img src={iconUrl('shape_flip_vertical')} alt="Flip upside down" />
            </button>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              onClick={() => change(pic.blank(bitmap.width, bitmap.height))}
            >
              Clear
            </button>
          </div>
          <label className="robot-field">
            <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
            Show grid
          </label>
          <p className="sim-muted">
            {fileName} · {bytes().length} bytes. Open a photo or drawing to turn it into black and
            white, or an .ric file from the brick.
          </p>
          {message && (
            <p className={`notice ${message.error ? 'error' : ''}`} role="status">
              {message.text}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
