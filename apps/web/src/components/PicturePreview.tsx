import { useEffect, useRef, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { listMedia, MEDIA_CHANGED, rememberMedia } from '../lib/media';
import { drawLcd } from '../sim/draw';
import { fromRic, place } from '../tools/picture';

type State =
  | { kind: 'loading' }
  | { kind: 'shown'; bytes: Uint8Array; from: 'browser' | 'brick' }
  | { kind: 'missing' };

/**
 * What a Display block's picture looks like on the screen: the picture made in this
 * browser, or read from the connected brick (and remembered), placed at (x, y).
 */
export function PicturePreview({ name, x, y }: { name: string; x: number; y: number }) {
  const brick = useBrick();
  const client = brick.client;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const file = `${name.replace(/\.ric$/i, '')}.ric`;

  useEffect(() => {
    let live = true;
    const load = async () => {
      const local = (await listMedia()).find((f) => f.name.toLowerCase() === file.toLowerCase());
      if (!live) return;
      if (local) return setState({ kind: 'shown', bytes: local.bytes, from: 'browser' });
      if (client) {
        try {
          const onBrick = (await client.listFiles(file)).some(
            (f) => f.name.toLowerCase() === file.toLowerCase(),
          );
          if (onBrick) {
            const bytes = await client.downloadFile(file);
            if (!live) return;
            setState({ kind: 'shown', bytes, from: 'brick' });
            // Remember it, so the simulator can show it too.
            void rememberMedia(file, bytes);
            return;
          }
        } catch {
          // Fall through: shown as missing.
        }
      }
      if (live) setState({ kind: 'missing' });
    };
    void load();
    const reload = () => void load();
    window.addEventListener(MEDIA_CHANGED, reload);
    return () => {
      live = false;
      window.removeEventListener(MEDIA_CHANGED, reload);
    };
  }, [file, client]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    let screen = place({ width: 0, height: 0, pixels: new Uint8Array() }, 0, 0);
    if (state.kind === 'shown') {
      try {
        screen = place(fromRic(state.bytes), x, y);
      } catch {
        // A damaged file shows as an empty screen.
      }
    }
    drawLcd(ctx, screen, 2);
  }, [state, x, y]);

  return (
    <figure className="config-preview">
      <canvas ref={canvas} width={200} height={128} aria-label={`Preview of ${file}`} />
      <figcaption>
        {state.kind === 'loading'
          ? 'Loading…'
          : state.kind === 'missing'
            ? client
              ? `${file} is not on the brick or in this browser`
              : `${file}: not made in this browser; connect the brick to see it`
            : state.from === 'brick'
              ? `${file} (from the brick)`
              : file}
      </figcaption>
    </figure>
  );
}
