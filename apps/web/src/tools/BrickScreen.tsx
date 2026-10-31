import { useEffect, useRef, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { usePolling } from '../brick/usePolling';
import { ConnectPrompt } from '../components/ConnectPrompt';
import { iconUrl } from '../lib/icons';
import { lcdGif, type LcdShot } from '../lib/gifEncoder';
import { drawLcd } from '../sim/draw';
import { saveFile } from './convert';

const SCALE = 4;
/** About a minute at the usual update rate. */
const MAX_SHOTS = 600;

/** NXT window → Screen: what the real brick's screen shows, refreshed continuously. */
export function BrickScreen() {
  const brick = useBrick();
  const client = brick.client;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pixels, setPixels] = useState<Uint8Array | null>(null);
  const [live, setLive] = useState(true);
  const [rate, setRate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Screens seen while recording (null when not recording). */
  const recording = useRef<LcdShot[] | null>(null);
  const [recorded, setRecorded] = useState<number | null>(null);

  usePolling(
    async () => {
      if (!client) return;
      const started = performance.now();
      try {
        const screen = await client.readScreen();
        setPixels(screen);
        const shots = recording.current;
        if (shots && shots.length < MAX_SHOTS) {
          shots.push({ pixels: screen, at: performance.now() });
          setRecorded(shots.length);
        }
        setRate(1000 / Math.max(1, performance.now() - started));
        setError(null);
      } catch (e) {
        setError(friendlyError(e));
      }
    },
    100,
    client !== null && live,
  );

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx && pixels) drawLcd(ctx, { pixels }, SCALE);
  }, [pixels]);

  const toggleRecording = () => {
    const shots = recording.current;
    if (!shots) {
      recording.current = [];
      setRecorded(0);
      setLive(true);
      return;
    }
    recording.current = null;
    setRecorded(null);
    if (shots.length === 0) return;
    const gif = lcdGif(shots, 3, performance.now());
    saveFile(`${brick.summary?.name ?? 'NXT'} screen.gif`, gif, 'image/gif');
  };

  const save = () => {
    const url = canvas.current?.toDataURL('image/png');
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brick.summary?.name ?? 'NXT'} screen.png`;
    a.click();
  };

  if (!client) return <ConnectPrompt what="see its screen here" />;
  return (
    <>
      {error && <div className="notice error">{error}</div>}
      <div className="brick-screen">
        <div className="sim-lcd-frame">
          <canvas
            ref={canvas}
            width={100 * SCALE}
            height={64 * SCALE}
            aria-label="The brick's screen"
          />
        </div>
        <div className="brick-screen-bar">
          <button type="button" className="btn" onClick={() => setLive((l) => !l)}>
            <img src={iconUrl(live ? 'control_pause' : 'control_play')} alt="" />
            {live ? 'Pause' : 'Continue'}
          </button>
          <button type="button" className="btn" disabled={!pixels} onClick={save}>
            <img src={iconUrl('picture')} alt="" /> Save picture
          </button>
          <button
            type="button"
            className={`btn ${recorded !== null ? 'recording' : ''}`}
            onClick={toggleRecording}
            title="Record what the screen shows as an animated GIF"
          >
            <img src={iconUrl(recorded !== null ? 'control_stop' : 'images')} alt="" />
            {recorded !== null ? `Stop and save GIF (${recorded})` : 'Record GIF'}
          </button>
          <span className="sim-muted">
            {live && rate !== null ? `About ${rate.toFixed(1)} updates a second` : 'Paused'}
          </span>
        </div>
        <p className="sim-muted">
          The screen is copied from the brick 800 bytes at a time, so fast animations look choppy,
          especially over Bluetooth.
        </p>
      </div>
    </>
  );
}
