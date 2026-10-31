import { animationProgram, frameNames, type Program } from '@nxt/blocks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import { rememberMedia } from '../lib/media';
import { storeZip } from '../lib/zip';
import { drawLcd } from '../sim/draw';
import { pickFile, saveFile } from './convert';
import { fitSize, toMono } from './frames';
import * as pic from './picture';

/** Frames decoded from the file, at its own size. */
interface Source {
  name: string;
  frames: ImageBitmap[];
  /** Milliseconds each frame is shown in the file. */
  durations: number[];
  /** True when the browser could only read the first frame. */
  firstOnly: boolean;
}

const SIZES = {
  full: { label: 'Whole screen (100 × 64)', box: [100, 64] },
  half: { label: 'Half (50 × 32)', box: [50, 32] },
  small: { label: 'Small (32 × 24)', box: [32, 24] },
} as const;

/** Frames read from a file at most (before skipping and the frame limit). */
const MAX_DECODED = 200;

/** Splits an animated GIF (or WebP/PNG) into frames with the browser's image decoder. */
async function decode(file: File): Promise<Source> {
  const type = file.type || 'image/gif';
  if ('ImageDecoder' in window && (await ImageDecoder.isTypeSupported(type))) {
    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type });
    try {
      await decoder.tracks.ready;
      const count = Math.min(decoder.tracks.selectedTrack?.frameCount ?? 1, MAX_DECODED);
      const frames: ImageBitmap[] = [];
      const durations: number[] = [];
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i });
        frames.push(await createImageBitmap(image));
        durations.push((image.duration ?? 100_000) / 1000);
        image.close();
      }
      return { name: file.name, frames, durations, firstOnly: false };
    } finally {
      decoder.close();
    }
  }
  return {
    name: file.name,
    frames: [await createImageBitmap(file)],
    durations: [100],
    firstOnly: true,
  };
}

/** RGBA pixels of a frame scaled to `width` × `height`. */
function pixelsOf(frame: ImageBitmap, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(frame, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

/** A frame placed on a blank 100 × 64 screen. */
function onScreen(frame: pic.Bitmap, x: number, y: number): pic.Bitmap {
  const screen = pic.blank();
  const top = 64 - y - frame.height;
  for (let r = 0; r < frame.height; r++) {
    for (let c = 0; c < frame.width; c++) {
      if (frame.pixels[r * frame.width + c]) pic.set(screen, x + c, top + r, true);
    }
  }
  return screen;
}

/** Shows a picture on a small LCD-coloured canvas. */
function Thumb({ bitmap, scale }: { bitmap: pic.Bitmap; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#b8cc94';
    ctx.fillRect(0, 0, bitmap.width * scale, bitmap.height * scale);
    ctx.fillStyle = '#26321a';
    bitmap.pixels.forEach((p, i) => {
      if (p)
        ctx.fillRect(
          (i % bitmap.width) * scale,
          Math.floor(i / bitmap.width) * scale,
          scale,
          scale,
        );
    });
  }, [bitmap, scale]);
  return <canvas ref={ref} width={bitmap.width * scale} height={bitmap.height * scale} />;
}

/**
 * Tools → Animation from GIF: turns an animated GIF into black-and-white pictures for the
 * brick, and makes a program that plays them.
 */
export function GifAnimator({
  onClose,
  onMakeProgram,
}: {
  onClose(): void;
  onMakeProgram(program: Program): void;
}) {
  const brick = useBrick();
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [size, setSize] = useState<keyof typeof SIZES>('full');
  const [threshold, setThreshold] = useState(128);
  const [dither, setDither] = useState(false);
  const [invert, setInvert] = useState(false);
  const [step, setStep] = useState(1);
  const [maxFrames, setMaxFrames] = useState(12);
  const [msPerFrame, setMsPerFrame] = useState(150);
  const [repeat, setRepeat] = useState(0);
  const [prefix, setPrefix] = useState('Anim');
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const [shown, setShown] = useState(0);
  const lcd = useRef<HTMLCanvasElement>(null);

  const open = async () => {
    const file = await pickFile('image/gif,image/webp,image/png');
    if (!file) return;
    setBusy('Reading the frames…');
    setMessage(null);
    try {
      const next = await decode(file);
      source?.frames.forEach((f) => f.close());
      setSource(next);
      setSkipped(new Set());
      const sorted = [...next.durations].sort((a, b) => a - b);
      setMsPerFrame(Math.max(50, Math.round(sorted[Math.floor(sorted.length / 2)] ?? 100)));
      setPrefix(
        file.name
          .replace(/\.[^.]*$/, '')
          .replace(/[^A-Za-z0-9 _-]/g, '')
          .slice(0, 10) || 'Anim',
      );
      if (next.firstOnly) {
        setMessage({
          error: true,
          text: 'This browser can only read the first frame. Use Chrome or Edge.',
        });
      }
    } catch (e) {
      setMessage({
        error: true,
        text: e instanceof Error ? e.message : 'This file could not be read.',
      });
    } finally {
      setBusy(null);
    }
  };

  // Every `step`-th frame, up to the limit; then the ones the user didn't click away.
  const picked = useMemo(() => {
    if (!source) return [];
    const indexes: number[] = [];
    for (let i = 0; i < source.frames.length && indexes.length < maxFrames; i += step)
      indexes.push(i);
    return indexes;
  }, [source, step, maxFrames]);

  const { width, height } = source?.frames[0]
    ? fitSize(
        source.frames[0].width,
        source.frames[0].height,
        SIZES[size].box[0],
        SIZES[size].box[1],
      )
    : { width: 1, height: 1 };
  const x = Math.floor((100 - width) / 2);
  const y = Math.floor((64 - height) / 2);

  const scaled = useMemo(
    () => (source ? picked.map((i) => pixelsOf(source.frames[i]!, width, height)) : []),
    [source, picked, width, height],
  );
  const frames = useMemo(
    () => scaled.map((rgba) => toMono(rgba, width, height, { threshold, dither, invert })),
    [scaled, width, height, threshold, dither, invert],
  );
  const kept = frames.filter((_, i) => !skipped.has(i));
  const names = frameNames(prefix, kept.length);
  const files = kept.map((f, i) => ({ name: `${names[i]}.ric`, bytes: pic.toRic(f) }));
  const totalBytes = files.reduce((n, f) => n + f.bytes.length, 0);
  const freeFlash = brick.summary?.freeFlashBytes;

  // Play the preview at the chosen speed.
  useEffect(() => {
    if (kept.length === 0) return;
    const id = setInterval(() => setShown((s) => (s + 1) % kept.length), msPerFrame);
    return () => clearInterval(id);
  }, [kept.length, msPerFrame]);
  const current = kept[shown % Math.max(1, kept.length)];
  useEffect(() => {
    const ctx = lcd.current?.getContext('2d');
    if (ctx && current) drawLcd(ctx, onScreen(current, x, y), 3);
  }, [current, x, y]);

  const remember = () => Promise.all(files.map((f) => rememberMedia(f.name, f.bytes)));

  const send = async () => {
    if (!brick.client) return;
    setMessage(null);
    try {
      for (const [i, f] of files.entries()) {
        setBusy(`Sending ${f.name} (${i + 1} of ${files.length})…`);
        await brick.client.uploadFile(f.name, f.bytes);
      }
      await remember();
      setMessage({ error: false, text: `${files.length} pictures are on the brick.` });
    } catch (e) {
      setMessage({ error: true, text: friendlyError(e) ?? String(e) });
    } finally {
      setBusy(null);
    }
  };

  const num = (
    value: number,
    set: (n: number) => void,
    label: string,
    min: number,
    max: number,
  ) => (
    <input
      className="num-input"
      type="number"
      min={min}
      max={max}
      value={value}
      aria-label={label}
      onChange={(e) => {
        const v = e.target.valueAsNumber;
        if (v >= min && v <= max) set(v);
      }}
    />
  );

  return (
    <Dialog
      title="Animation from GIF"
      icon="images"
      width={820}
      onClose={onClose}
      footer={
        <>
          {source && (
            <button
              type="button"
              className="btn"
              style={{ marginRight: 'auto' }}
              onClick={() => void open()}
            >
              Open GIF…
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={files.length === 0 || busy !== null}
            onClick={() => {
              saveFile(`${prefix || 'frames'}.zip`, storeZip(files), 'application/zip');
              void remember();
            }}
          >
            Save frames (.zip)…
          </button>
          <button
            type="button"
            className="btn"
            disabled={files.length === 0 || !brick.client || busy !== null}
            title={brick.client ? undefined : 'Connect a brick first'}
            onClick={() => void send()}
          >
            <img src={iconUrl('page_white_put')} alt="" /> Send to brick
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={files.length === 0 || busy !== null}
            title="Open a new program that plays these frames"
            onClick={() => {
              void remember();
              onMakeProgram(
                animationProgram(prefix || 'Animation', {
                  frames: names,
                  x,
                  y,
                  secondsPerFrame: msPerFrame / 1000,
                  repeat,
                }),
              );
            }}
          >
            <img src={iconUrl('bricks')} alt="" /> Make a program
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {!source ? (
        <div className="gif-empty">
          <p>
            Open an animated GIF. Each frame becomes a black-and-white picture for the brick&apos;s
            screen, and <strong>Make a program</strong> builds a loop that shows them one by one.
          </p>
          <button type="button" className="btn primary" onClick={() => void open()}>
            <img src={iconUrl('images')} alt="" /> Open GIF…
          </button>
          {busy && <p className="sim-muted">{busy}</p>}
        </div>
      ) : (
        <div className="gif-animator">
          <div className="gif-preview">
            <div className="sim-lcd-frame">
              <canvas ref={lcd} width={300} height={192} aria-label="Animation preview" />
            </div>
            <p className="sim-muted">
              {source.name}: {source.frames.length} frames, using {kept.length}. {width} × {height}{' '}
              pixels.
            </p>
          </div>
          <div className="gif-settings">
            <label className="robot-field">
              Size
              <select value={size} onChange={(e) => setSize(e.target.value as keyof typeof SIZES)}>
                {Object.entries(SIZES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="robot-field">
              Darkness
              <input
                type="range"
                min={20}
                max={235}
                value={threshold}
                aria-label="Threshold"
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </label>
            <label className="robot-field">
              <input
                type="checkbox"
                checked={dither}
                onChange={(e) => setDither(e.target.checked)}
              />
              Dither (for photos and shading)
            </label>
            <label className="robot-field">
              <input
                type="checkbox"
                checked={invert}
                onChange={(e) => setInvert(e.target.checked)}
              />
              Swap black and white
            </label>
            <label className="robot-field">
              Use every {num(step, setStep, 'Use every Nth frame', 1, 10)} frame, at most{' '}
              {num(maxFrames, setMaxFrames, 'Most frames', 1, 40)}
            </label>
            <label className="robot-field">
              Each frame {num(msPerFrame, setMsPerFrame, 'Milliseconds per frame', 20, 5000)} ms
            </label>
            <label className="robot-field">
              Play
              <select value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
                <option value={0}>forever</option>
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'time' : 'times'}
                  </option>
                ))}
              </select>
            </label>
            <label className="robot-field">
              File names
              <input
                className="text-input"
                value={prefix}
                maxLength={13}
                aria-label="File name prefix"
                onChange={(e) => setPrefix(e.target.value)}
              />
            </label>
            <p className="sim-muted">
              {names[0] ?? ''}
              {names.length > 1 ? ` … ${names[names.length - 1]}` : ''} ·{' '}
              {(totalBytes / 1024).toFixed(1)} KB
              {freeFlash !== undefined &&
                `; the brick has ${(freeFlash / 1024).toFixed(0)} KB free`}
            </p>
            {freeFlash !== undefined && totalBytes > freeFlash && (
              <p className="notice error">
                Too big for the brick: use fewer frames or a smaller size, or delete files.
              </p>
            )}
          </div>
          <div className="gif-strip" role="list" aria-label="Frames (click to leave one out)">
            {frames.map((f, i) => (
              <button
                key={i}
                type="button"
                role="listitem"
                className={skipped.has(i) ? 'skipped' : ''}
                title={
                  skipped.has(i)
                    ? 'Left out: click to use it again'
                    : 'Click to leave this frame out'
                }
                onClick={() =>
                  setSkipped((s) => {
                    const next = new Set(s);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
              >
                <Thumb bitmap={f} scale={size === 'full' ? 1 : 2} />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {busy && source && <p className="sim-muted">{busy}</p>}
      {message && (
        <p className={`notice ${message.error ? 'error' : ''}`} role="status">
          {message.text}
        </p>
      )}
    </Dialog>
  );
}
