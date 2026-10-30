import { labelOf, findBlock } from '@nxt/blocks';
import type { SensorKind } from '@nxt/compiler';
import { LCD_HEIGHT, LCD_WIDTH, SCENARIOS, type ButtonName } from '@nxt/sim';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { drawLcd, drawMat, matTransform } from './draw';
import { formatValue, useSimulator } from './SimulatorContext';

const LCD_SCALE = 2;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 10];
const SENSOR_NAMES: Record<SensorKind, string> = {
  touch: 'Touch',
  lightActive: 'Light (lamp on)',
  lightAmbient: 'Light (ambient)',
  soundDb: 'Sound dB',
  soundDba: 'Sound dBA',
  ultrasonic: 'Ultrasonic cm',
  colorFull: 'Color',
  colorRed: 'Color, red lamp',
  colorGreen: 'Color, green lamp',
  colorBlue: 'Color, blue lamp',
  colorNone: 'Color, ambient',
};
const COLOR_NUMBERS = ['', 'black', 'blue', 'green', 'yellow', 'red', 'white'];

/**
 * A floating window with the simulated robot on its mat, the brick's screen and
 * buttons, run/pause/step controls and live read-outs. The editor highlights the
 * running blocks while it is open.
 */
export function SimulatorWindow() {
  const s = useSimulator();
  const { state } = useEditor();
  const matRef = useRef<HTMLCanvasElement>(null);
  const lcdRef = useRef<HTMLCanvasElement>(null);
  const [pos, setPos] = useState(() => ({
    x: Math.max(8, window.innerWidth - 720),
    y: Math.max(8, window.innerHeight - 560),
  }));
  const [mailbox, setMailbox] = useState(1);
  const [message, setMessage] = useState('');
  const [sound, setSound] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const sim = s.sim;

  // Redraw the mat and screen on every animation frame while the window is open.
  useEffect(() => {
    let id = 0;
    let lcdVersion = -1;
    const draw = () => {
      const mat = matRef.current?.getContext('2d');
      const lcd = lcdRef.current?.getContext('2d');
      if (sim && mat) drawMat(mat, sim);
      if (sim && lcd && sim.lcd.version !== lcdVersion) {
        lcdVersion = sim.lcd.version;
        drawLcd(lcd, sim.lcd, LCD_SCALE);
      }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [sim]);

  // Messages the program sends show up in a small log.
  useEffect(() => {
    if (!sim) return;
    return sim.on((e) => {
      if (e.type === 'message') {
        const to = e.connection === 0 ? 'master' : `connection ${e.connection}`;
        setLog((l) => [`→ ${to}, mailbox ${e.mailbox}: ${formatValue(e.value)}`, ...l].slice(0, 6));
      }
    });
  }, [sim]);

  useEffect(() => {
    sim?.setSoundLevel(sound);
  }, [sim, sound]);

  const press = (button: ButtonName, down: boolean) => {
    sim?.setButton(button, down);
  };

  // Drag the title bar to move the window.
  const dragWindow = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const start = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const move = (ev: PointerEvent) =>
      setPos({
        x: Math.min(window.innerWidth - 120, Math.max(0, ev.clientX - start.x)),
        y: Math.min(window.innerHeight - 40, Math.max(0, ev.clientY - start.y)),
      });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // While stopped or paused, drag on the mat to place the robot; the wheel turns it.
  const editable = sim !== null && s.status !== 'running';
  const placeRobot = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    if (!sim || !editable) return;
    const update = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const { scale, ox, oy } = matTransform(canvas, sim.world.scenario);
      const px = ((clientX - rect.left) * canvas.width) / rect.width;
      const py = ((clientY - rect.top) * canvas.height) / rect.height;
      sim.placeRobot({ x: (px - ox) / scale, y: (py - oy) / scale });
    };
    update(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => update(ev.clientX, ev.clientY);
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
  };
  const turnRobot = (e: React.WheelEvent) => {
    if (!sim || !editable) return;
    sim.placeRobot({ heading: sim.world.pose.heading + (e.deltaY > 0 ? 15 : -15) });
  };

  const running = s.status === 'running';
  const scenario = SCENARIOS.find((x) => x.id === s.scenarioId) ?? SCENARIOS[0]!;
  const activeNames = sim
    ? sim.activeBlocks().map((a) => {
        const block = findBlock(state.program, a.block)?.block;
        return `${a.task}: ${block ? labelOf(block) : a.block}`;
      })
    : [];
  const statusText =
    s.problems.length > 0
      ? 'The program has problems'
      : s.status === 'running'
        ? `Running · ${((sim?.time ?? 0) / 1000).toFixed(1)} s`
        : s.status === 'paused'
          ? `Paused · ${((sim?.time ?? 0) / 1000).toFixed(1)} s`
          : s.status === 'finished'
            ? `Finished after ${((sim?.time ?? 0) / 1000).toFixed(1)} s`
            : s.status === 'error'
              ? `Stopped: ${sim?.error ?? 'error'}`
              : 'Ready';
  const userVars = state.program.variables;

  return (
    <div
      className="sim-window"
      role="dialog"
      aria-label="Simulator"
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={(e) => {
        const key = { ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter' }[e.key] as
          ButtonName | undefined;
        if (key && (e.target as HTMLElement).tagName !== 'INPUT') {
          e.preventDefault();
          press(key, true);
        }
      }}
      onKeyUp={(e) => {
        const key = { ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter' }[e.key] as
          ButtonName | undefined;
        if (key) press(key, false);
      }}
    >
      <div className="title-bar" onPointerDown={dragWindow}>
        <img src={iconUrl('car')} alt="" />
        Simulator
        <span className="doc">— {state.program.name}</span>
        <button
          type="button"
          className="dialog-close"
          style={{ marginLeft: 'auto' }}
          aria-label="Close simulator"
          onClick={() => {
            s.pause();
            s.setOpen(false);
          }}
        >
          ×
        </button>
      </div>

      <div className="sim-toolbar">
        {running ? (
          <button type="button" className="tool-btn" title="Pause" onClick={s.pause}>
            <img src={iconUrl('control_pause')} alt="" /> Pause
          </button>
        ) : (
          <button
            type="button"
            className="tool-btn"
            title={s.status === 'paused' ? 'Continue' : 'Run in the simulator'}
            onClick={s.run}
          >
            <img src={iconUrl('control_play')} alt="" />
            {s.status === 'paused' ? 'Continue' : 'Run'}
          </button>
        )}
        <button
          type="button"
          className="tool-btn"
          title="Run until the next block starts"
          onClick={s.step}
          disabled={running}
        >
          <img src={iconUrl('control_end')} alt="" /> Step
        </button>
        <button type="button" className="tool-btn" title="Stop and reset" onClick={s.reset}>
          <img src={iconUrl('control_stop')} alt="" /> Reset
        </button>
        <span className="tool-sep" />
        <label className="sim-field" title="Simulation speed">
          <img src={iconUrl('clock')} alt="" />
          <select value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        <label className="sim-field" title="Mat">
          <img src={iconUrl('map')} alt="" />
          <select value={s.scenarioId} onChange={(e) => s.setScenario(e.target.value)}>
            {SCENARIOS.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="tool-btn"
          title="Toggle a breakpoint on the selected block (F9)"
          disabled={!state.selected}
          onClick={() => state.selected && s.toggleBreakpoint(state.selected)}
        >
          <img src={iconUrl('bug')} alt="" />
        </button>
        <button
          type="button"
          className="tool-btn"
          title={s.audio.isMuted ? 'Sound off' : 'Sound on'}
          aria-pressed={!s.audio.isMuted}
          onClick={() => {
            s.audio.setMuted(!s.audio.isMuted);
            s.refresh();
          }}
        >
          <img src={iconUrl('sound')} alt="" style={{ opacity: s.audio.isMuted ? 0.35 : 1 }} />
        </button>
      </div>

      <div className={`sim-status ${s.status}`} role="status">
        <span>{statusText}</span>
        {s.stale && (running || s.status === 'paused') && (
          <span className="sim-stale">Program changed; Reset to use the new version</span>
        )}
        {activeNames.length > 0 && (
          <span className="sim-active-list">{activeNames.join(' · ')}</span>
        )}
      </div>

      {s.problems.length > 0 && (
        <div className="notice error" role="alert">
          <img src={iconUrl('exclamation')} alt="" />
          <span>{s.problems.slice(0, 3).join(' ')}</span>
        </div>
      )}

      <div className="sim-main">
        <div className="sim-mat">
          <canvas
            ref={matRef}
            width={440}
            height={330}
            onPointerDown={placeRobot}
            onWheel={turnRobot}
            style={{ cursor: editable ? 'move' : 'default' }}
            aria-label={`Mat: ${scenario.name}`}
          />
          <p className="sim-hint">
            {scenario.description}
            {editable && ' Drag to place the robot, scroll to turn it.'}
          </p>
        </div>

        <div className="sim-brick">
          <div className="sim-lcd-frame">
            <canvas
              ref={lcdRef}
              width={LCD_WIDTH * LCD_SCALE}
              height={LCD_HEIGHT * LCD_SCALE}
              aria-label="Brick screen"
            />
          </div>
          <div className="sim-buttons">
            {(['left', 'enter', 'right'] as const).map((b) => (
              <button
                key={b}
                type="button"
                className={`sim-btn ${b}`}
                aria-label={`${b} button`}
                title={`${b[0]!.toUpperCase()}${b.slice(1)} button (${b === 'enter' ? 'Enter' : b === 'left' ? '←' : '→'})`}
                onPointerDown={() => press(b, true)}
                onPointerUp={() => press(b, false)}
                onPointerLeave={() => press(b, false)}
              />
            ))}
          </div>
          <button
            type="button"
            className="sim-btn cancel"
            aria-label="Stop the program"
            title="Dark grey button: stops the program"
            onClick={s.reset}
          />
          <Readouts />
          <label className="sim-slider" title="What the sound sensor hears">
            <img src={iconUrl('microphone')} alt="" />
            <input
              type="range"
              min={0}
              max={100}
              value={sound}
              onChange={(e) => setSound(Number(e.target.value))}
            />
            <span>{sound}%</span>
          </label>
        </div>
      </div>

      <div className="sim-bottom">
        <fieldset className="groupbox">
          <legend>Variables</legend>
          {userVars.length === 0 ? (
            <p className="sim-muted">No variables defined.</p>
          ) : (
            <table className="sim-table">
              <tbody>
                {userVars.map((v) => (
                  <tr key={v.name}>
                    <th>{v.name}</th>
                    <td>{sim ? formatValue(sim.variables().get(v.name)) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="sim-muted">Values on data wires appear on the wires while simulating.</p>
        </fieldset>
        <fieldset className="groupbox">
          <legend>Bluetooth messages</legend>
          <div className="sim-mail">
            <select
              value={mailbox}
              onChange={(e) => setMailbox(Number(e.target.value))}
              aria-label="Mailbox"
            >
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i} value={i + 1}>
                  Mailbox {i + 1}
                </option>
              ))}
            </select>
            <input
              className="text-input"
              value={message}
              placeholder="Text or number"
              aria-label="Message"
              onChange={(e) => setMessage(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              disabled={!sim || message === ''}
              onClick={() => {
                const n = Number(message);
                const value =
                  message === 'true'
                    ? true
                    : message === 'false'
                      ? false
                      : Number.isNaN(n)
                        ? message
                        : n;
                sim?.receive(mailbox, value);
                setLog((l) => [`← mailbox ${mailbox}: ${formatValue(value)}`, ...l].slice(0, 6));
                setMessage('');
              }}
            >
              <img src={iconUrl('email_go')} alt="" /> Send
            </button>
          </div>
          <ul className="sim-log">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </fieldset>
      </div>
    </div>
  );
}

/** Sensor and motor read-outs. */
function Readouts() {
  const s = useSimulator();
  const sim = s.sim;
  void s.tick;
  if (!sim) return null;
  return (
    <table className="sim-table readouts">
      <tbody>
        {[0, 1, 2, 3].map((port) => {
          const kind = sim.sensors[port];
          const value = kind ? sim.readSensor(port as 0 | 1 | 2 | 3) : null;
          return (
            <tr key={port}>
              <th>{port + 1}</th>
              <td>{kind ? SENSOR_NAMES[kind] : '—'}</td>
              <td className="num">
                {value === null
                  ? ''
                  : kind === 'colorFull'
                    ? `${value} ${COLOR_NUMBERS[value]}`
                    : value}
              </td>
            </tr>
          );
        })}
        {(['A', 'B', 'C'] as const).map((name, i) => {
          const m = sim.motors[i]!;
          return (
            <tr key={name}>
              <th>{name}</th>
              <td>
                {m.mode === 'run'
                  ? `${Math.round(m.power)}%`
                  : m.mode === 'brake'
                    ? 'brake'
                    : 'coast'}
              </td>
              <td className="num">{Math.trunc(m.rotation)}°</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
