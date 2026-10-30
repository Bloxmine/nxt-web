import { decodeRso, encodeRso, fromPcm8, toPcm8 } from '@nxt/media';
import { useEffect, useRef, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import { brickFileName, decodeAudio, pickFile, saveFile } from './convert';

/** Longest recording, in seconds: an 8 kHz sound takes 8 KB of the brick's memory a second. */
const MAX_SECONDS = 5;
const RATES = [
  [8000, '8 kHz (best on the brick)'],
  [11025, '11 kHz'],
  [16000, '16 kHz (biggest)'],
] as const;

type Recording = { samples: Float32Array; rate: number };

/** Draws the waveform with the kept part highlighted. */
function drawWave(canvas: HTMLCanvasElement, rec: Recording, start: number, end: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.fillStyle = '#1d2a14';
  ctx.fillRect(0, 0, width, height);
  const duration = rec.samples.length / rec.rate;
  const x0 = (start / duration) * width;
  const x1 = (end / duration) * width;
  ctx.fillStyle = '#2c4020';
  ctx.fillRect(x0, 0, x1 - x0, height);
  const per = Math.max(1, Math.floor(rec.samples.length / width));
  ctx.strokeStyle = '#a9d86e';
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    let lo = 0;
    let hi = 0;
    for (let i = x * per; i < (x + 1) * per && i < rec.samples.length; i++) {
      lo = Math.min(lo, rec.samples[i]!);
      hi = Math.max(hi, rec.samples[i]!);
    }
    ctx.moveTo(x + 0.5, height / 2 - hi * (height / 2));
    ctx.lineTo(x + 0.5, height / 2 - lo * (height / 2) + 1);
  }
  ctx.stroke();
}

/**
 * Tools → Sound recorder: record from the microphone, trim, listen to how it will sound
 * on the brick, then save it as an .rso file or send it to the brick.
 */
export function SoundRecorder({ onClose }: { onClose(): void }) {
  const brick = useBrick();
  const [state, setState] = useState<'idle' | 'recording' | 'working'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [rate, setRate] = useState<number>(8000);
  const [name, setName] = useState('My sound');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stopAll = useRef<() => void>(() => {});
  const wave = useRef<HTMLCanvasElement>(null);

  useEffect(() => () => stopAll.current(), []);

  useEffect(() => {
    if (recording && wave.current) drawWave(wave.current, recording, start, end);
  }, [recording, start, end]);

  /** Loads a sound file (WAV, MP3, … or .rso) to trim and convert. */
  async function load(file: File) {
    setState('working');
    setMessage(null);
    try {
      let loaded: Recording;
      if (/\.rso$/i.test(file.name)) {
        const rso = decodeRso(new Uint8Array(await file.arrayBuffer()));
        if (rso.samples.length === 0) throw new Error('compressed .rso');
        loaded = { samples: fromPcm8(rso.samples), rate: rso.sampleRate };
      } else {
        loaded = await decodeAudio(file, MAX_SECONDS);
      }
      setRecording(loaded);
      setStart(0);
      setEnd(loaded.samples.length / loaded.rate);
      setName(file.name.replace(/\.[^.]*$/, '').slice(0, 15));
    } catch {
      setMessage({ error: true, text: `${file.name} could not be read as a sound.` });
    } finally {
      setState('idle');
    }
  }

  const record = async () => {
    setMessage(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMessage({
        error: true,
        text: 'The microphone is not available or permission was denied.',
      });
      return;
    }
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    audio.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    recorder.current = media;
    const began = performance.now();
    let frame = 0;
    const meter = () => {
      analyser.getFloatTimeDomainData(buffer);
      let peak = 0;
      for (const v of buffer) peak = Math.max(peak, Math.abs(v));
      setLevel(peak);
      const seconds = (performance.now() - began) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_SECONDS) media.stop();
      else frame = requestAnimationFrame(meter);
    };
    stopAll.current = () => {
      cancelAnimationFrame(frame);
      if (media.state !== 'inactive') media.stop();
      stream.getTracks().forEach((t) => t.stop());
      void audio.close();
    };
    media.ondataavailable = (e) => chunks.push(e.data);
    media.onstop = () => {
      stopAll.current();
      setLevel(0);
      setState('working');
      decodeAudio(new Blob(chunks, { type: media.mimeType }), MAX_SECONDS)
        .then((rec) => {
          setRecording(rec);
          setStart(0);
          setEnd(rec.samples.length / rec.rate);
        })
        .catch(() => setMessage({ error: true, text: 'The recording could not be decoded.' }))
        .finally(() => setState('idle'));
    };
    media.start();
    setState('recording');
    frame = requestAnimationFrame(meter);
  };

  /** The kept part, as it will be on the brick. */
  const rso = () => {
    if (!recording) return null;
    const from = Math.floor(start * recording.rate);
    const to = Math.max(from + 1, Math.floor(end * recording.rate));
    return encodeRso(toPcm8(recording.samples.subarray(from, to), recording.rate, rate), rate);
  };
  const bytes = rso();
  const fileName = brickFileName(name, 'rso');

  const play = () => {
    if (!bytes) return;
    const samples = fromPcm8(bytes.subarray(8));
    const audio = new AudioContext({ sampleRate: rate });
    const buffer = audio.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(Float32Array.from(samples), 0);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.onended = () => void audio.close();
    source.start();
  };

  const upload = async () => {
    if (!bytes || !brick.client) return;
    setState('working');
    setMessage(null);
    try {
      await brick.client.uploadFile(fileName, bytes);
      setMessage({ error: false, text: `${fileName} is on the brick. Pick it in a Sound block.` });
    } catch (e) {
      setMessage({ error: true, text: friendlyError(e) ?? String(e) });
    } finally {
      setState('idle');
    }
  };

  const duration = recording ? recording.samples.length / recording.rate : 0;
  const trim = (value: number, set: (v: number) => void, label: string) => (
    <input
      type="range"
      min={0}
      max={duration}
      step={0.01}
      value={value}
      aria-label={label}
      onChange={(e) => set(Number(e.target.value))}
    />
  );

  return (
    <Dialog
      title="Sound recorder"
      icon="microphone"
      width={520}
      onClose={() => {
        stopAll.current();
        onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className="btn"
            disabled={!bytes || state !== 'idle'}
            onClick={() => bytes && saveFile(fileName, bytes)}
          >
            Save .rso…
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!bytes || !brick.client || state !== 'idle'}
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
      <div className="recorder">
        {state === 'recording' ? (
          <button
            type="button"
            className="btn"
            onClick={() => recorder.current?.stop()}
            aria-label="Stop recording"
          >
            <img src={iconUrl('control_stop')} alt="" /> Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={state !== 'idle'}
            onClick={() => void record()}
          >
            <img src={iconUrl('microphone')} alt="" /> {recording ? 'Record again' : 'Record'}
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={state !== 'idle'}
          title="Use a sound file instead (WAV, MP3, OGG or .rso)"
          onClick={() => void pickFile('audio/*,.rso').then((f) => f && load(f))}
        >
          Open…
        </button>
        <div className="recorder-meter" aria-hidden="true">
          <div style={{ width: `${Math.min(100, level * 140)}%` }} />
        </div>
        <span className="recorder-time">
          {state === 'recording'
            ? `${elapsed.toFixed(1)} / ${MAX_SECONDS} s`
            : recording
              ? `${(end - start).toFixed(2)} s`
              : `up to ${MAX_SECONDS} s`}
        </span>
      </div>
      {recording && (
        <>
          <canvas ref={wave} className="recorder-wave" width={480} height={80} />
          <div className="recorder-trim">
            <label>Start {trim(start, (v) => setStart(Math.min(v, end - 0.05)), 'Start')}</label>
            <label>End {trim(end, (v) => setEnd(Math.max(v, start + 0.05)), 'End')}</label>
          </div>
          <div className="log-setup">
            <button type="button" className="btn" onClick={play}>
              <img src={iconUrl('sound')} alt="" /> Listen
            </button>
            <select
              value={rate}
              aria-label="Sample rate"
              onChange={(e) => setRate(Number(e.target.value))}
            >
              {RATES.map(([r, label]) => (
                <option key={r} value={r}>
                  {label}
                </option>
              ))}
            </select>
            <label>
              Name{' '}
              <input
                className="text-input"
                value={name}
                maxLength={15}
                aria-label="File name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <span className="sim-muted">
              {fileName} · {((bytes?.length ?? 0) / 1024).toFixed(1)} KB
            </span>
          </div>
        </>
      )}
      {message && (
        <p className={`notice ${message.error ? 'error' : ''}`} role="status">
          {message.text}
        </p>
      )}
      <p className="sim-muted">
        Quiet recordings are made louder and stored as 8-bit samples, the only kind the brick plays.
        Keep sounds short: the brick has little memory.
      </p>
    </Dialog>
  );
}
