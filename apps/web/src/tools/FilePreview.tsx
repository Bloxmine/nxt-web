import { decodeRic, decodeRso, fromPcm8, renderRic, ricSize } from '@nxt/media';
import { useEffect, useRef } from 'react';
import { iconUrl } from '../lib/icons';

/** Shows a brick file: plays sounds, draws pictures, prints text. */
export function FilePreview({ name, bytes }: { name: string; bytes: Uint8Array }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'rso') return <SoundPreview bytes={bytes} />;
  if (ext === 'ric') return <PicturePreview bytes={bytes} />;
  if (ext === 'txt' || ext === 'log') {
    return <pre className="outline">{new TextDecoder('latin1').decode(bytes).slice(0, 4000)}</pre>;
  }
  return <p className="sim-muted">{bytes.length} bytes. No preview for this kind of file.</p>;
}

function SoundPreview({ bytes }: { bytes: Uint8Array }) {
  let sound;
  try {
    sound = decodeRso(bytes);
  } catch (e) {
    return <p className="notice error">{String(e instanceof Error ? e.message : e)}</p>;
  }
  const seconds = sound.samples.length / (sound.sampleRate || 8000);
  return (
    <p>
      <button
        type="button"
        className="btn"
        disabled={sound.samples.length === 0}
        onClick={() => {
          const ctx = new AudioContext();
          const buffer = ctx.createBuffer(1, sound.samples.length, sound.sampleRate || 8000);
          buffer.getChannelData(0).set(fromPcm8(sound.samples));
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(ctx.destination);
          src.start();
          src.onended = () => void ctx.close();
        }}
      >
        <img src={iconUrl('sound')} alt="" /> Play
      </button>{' '}
      {sound.sampleRate} Hz, {seconds.toFixed(2)} s
      {sound.codec !== 0x100 && ' (compressed; cannot be played here)'}
    </p>
  );
}

function PicturePreview({ bytes }: { bytes: Uint8Array }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  let error: string | null = null;
  let ops: ReturnType<typeof decodeRic> = [];
  try {
    ops = decodeRic(bytes);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const { width, height } = ricSize(ops);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#b9c99a';
    ctx.fillRect(0, 0, 100 * 3, 64 * 3);
    ctx.fillStyle = '#26321a';
    renderRic(ops, {
      set: (x, y, on) => {
        if (x < 0 || x >= 100 || y < 0 || y >= 64) return;
        if (on) ctx.fillRect(x * 3, (63 - y) * 3, 3, 3);
      },
    });
  });
  if (error) return <p className="notice error">{error}</p>;
  return (
    <div>
      <canvas
        ref={canvas}
        width={300}
        height={192}
        className="ric-preview"
        aria-label="Picture preview"
      />
      <p className="sim-muted">
        {width}×{height} pixels, {ops.length} drawing instructions.
      </p>
    </div>
  );
}
