import { conditionOf, EXAMPLES, findBlock, labelOf, walkProgram } from '@nxt/blocks';
import type { SensorKind } from '@nxt/compiler';
import {
  CHALLENGES,
  LCD_HEIGHT,
  LCD_WIDTH,
  SCENARIOS,
  type ButtonName,
  type Scenario,
  type Simulation,
} from '@nxt/sim';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { listLibrary, type LibraryEntry } from '../lib/library';
import { blankMat, newMatId } from '../lib/mats';
import { drawLcd, drawMat, matTransform } from './draw';
import { MatEditor } from './MatEditor';
import { formatValue, useSimulator, type SecondBrick } from './SimulatorContext';

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
    // Just below the toolbar, so the whole window fits on most screens.
    y: Math.max(8, Math.min(90, window.innerHeight - 600)),
  }));
  const [mailbox, setMailbox] = useState(1);
  const [message, setMessage] = useState('');
  const [sound, setSound] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [brick, setBrick] = useState<1 | 2>(1);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const sim = s.sim;
  const sim2 = s.sim2;
  /** The brick whose screen, buttons and read-outs are shown. */
  const shown = brick === 2 && sim2 ? sim2 : sim;
  const overlay = useRef({ challenge: s.challenge, reached: s.result?.reached ?? 0 });
  useEffect(() => {
    overlay.current = { challenge: s.challenge, reached: s.result?.reached ?? 0 };
  });

  useEffect(() => {
    let live = true;
    void listLibrary().then((entries) => live && setLibrary(entries));
    return () => {
      live = false;
    };
  }, []);

  // Redraw the mat and screen on every animation frame while the window is open.
  useEffect(() => {
    let id = 0;
    let lcdVersion = -1;
    const draw = () => {
      const mat = matRef.current?.getContext('2d');
      const lcd = lcdRef.current?.getContext('2d');
      if (sim && mat) drawMat(mat, sim, { second: sim2, ...overlay.current });
      if (shown && lcd && shown.lcd.version !== lcdVersion) {
        lcdVersion = shown.lcd.version;
        drawLcd(lcd, shown.lcd, LCD_SCALE);
      }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [sim, sim2, shown]);

  // Messages the programs send show up in a small log.
  useEffect(() => {
    const listen = (from: Simulation | null, name: string) =>
      from?.on((e) => {
        if (e.type === 'message') {
          const to = e.connection === 0 ? 'master' : `connection ${e.connection}`;
          setLog((l) =>
            [`${name}→ ${to}, mailbox ${e.mailbox}: ${formatValue(e.value)}`, ...l].slice(0, 6),
          );
        }
      });
    const offs = [listen(sim, sim2 ? 'Brick 1 ' : ''), listen(sim2, 'Brick 2 ')];
    return () => offs.forEach((off) => off?.());
  }, [sim, sim2]);

  useEffect(() => {
    sim?.setSoundLevel(sound);
    sim2?.setSoundLevel(sound);
  }, [sim, sim2, sound]);

  // Keep the window on screen when the browser window gets smaller.
  useEffect(() => {
    const clamp = () =>
      setPos((p) => ({
        x: Math.max(0, Math.min(p.x, window.innerWidth - 120)),
        y: Math.max(0, Math.min(p.y, window.innerHeight - 40)),
      }));
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  const press = (button: ButtonName, down: boolean) => {
    shown?.setButton(button, down);
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
  // During a challenge only before the start, so the robot can't be carried to the goal.
  const editable = sim !== null && (s.challenge ? s.status === 'ready' : s.status !== 'running');
  const placeRobot = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    if (!sim || !editable) return;
    const toMat = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const { scale, ox, oy } = matTransform(canvas, sim.world.scenario);
      const px = ((clientX - rect.left) * canvas.width) / rect.width;
      const py = ((clientY - rect.top) * canvas.height) / rect.height;
      return { x: (px - ox) / scale, y: (py - oy) / scale };
    };
    // Move whichever robot is nearer to where the drag starts.
    const start = toMat(e.clientX, e.clientY);
    const near = (r: Simulation) => Math.hypot(r.world.pose.x - start.x, r.world.pose.y - start.y);
    const robot = sim2 && near(sim2) < near(sim) ? sim2 : sim;
    const update = (clientX: number, clientY: number) => robot.placeRobot(toMat(clientX, clientY));
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
    if (!shown || !editable) return;
    shown.placeRobot({ heading: shown.world.pose.heading + (e.deltaY > 0 ? 15 : -15) });
  };

  const running = s.status === 'running' || s.status2 === 'running';
  const scenario = s.scenario;
  const custom = s.customMats.some((m) => m.id === scenario.id);
  const editMat = () =>
    setEditing(
      custom
        ? scenario
        : { ...structuredClone(scenario), id: newMatId(), name: `${scenario.name} (copy)` },
    );
  const secondValue = !s.second
    ? ''
    : s.second.kind === 'same'
      ? 'same'
      : `program:${s.second.name}`;
  const chooseSecond = (value: string) => {
    let next: SecondBrick = null;
    if (value === 'same') next = { kind: 'same' };
    else if (value.startsWith('example:')) {
      const ex = EXAMPLES.find((x) => `example:${x.key}` === value);
      if (ex) next = { kind: 'program', name: ex.name, program: ex.create() };
    } else if (value.startsWith('library:')) {
      const entry = library.find((x) => `library:${x.id}` === value);
      if (entry) next = { kind: 'program', name: entry.name, program: entry.program };
    }
    s.setSecond(next);
    if (!next) setBrick(1);
  };
  const result = s.result;
  const time = (sim?.time ?? 0) / 1000;
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
  const shownProgram =
    brick === 2 && s.second?.kind === 'program' ? s.second.program : state.program;
  // Every new program has a "Number 1" variable; only list it when it is used.
  const used = new Set<string>();
  walkProgram(shownProgram, (b) => {
    if (b.kind === 'variable') used.add(b.name);
    else if (b.kind === 'display' && b.action === 'variable') used.add(b.variable);
    const c = conditionOf(b);
    if (c?.source === 'variable') used.add(c.name);
  });
  const userVars = shownProgram.variables.filter((v) => v.name !== 'Number 1' || used.has(v.name));

  return (
    <div
      className="sim-window"
      role="dialog"
      aria-label="Simulator"
      style={{ left: pos.x, top: pos.y, maxHeight: `calc(100vh - ${pos.y + 8}px)` }}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (e.key === 'Escape' && !target.closest('input, select, textarea, .dialog')) {
          s.pause();
          s.setOpen(false);
          return;
        }
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
          <select
            value={scenario.id}
            aria-label="Mat"
            onChange={(e) =>
              e.target.value === '+new' ? setEditing(blankMat()) : s.setScenario(e.target.value)
            }
          >
            <optgroup label="Mats">
              {SCENARIOS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="My mats">
              {s.customMats.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
              <option value="+new">New mat…</option>
            </optgroup>
          </select>
        </label>
        <button
          type="button"
          className="tool-btn"
          title={custom ? 'Edit this mat' : 'Edit a copy of this mat'}
          disabled={running}
          onClick={editMat}
        >
          <img src={iconUrl('map_edit')} alt="" />
        </button>
        <label className="sim-field" title="Challenge">
          <img src={iconUrl('cup_gold')} alt="" />
          <select
            value={s.challenge?.id ?? ''}
            aria-label="Challenge"
            onChange={(e) => s.setChallenge(e.target.value || null)}
          >
            <option value="">No challenge</option>
            {CHALLENGES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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

      {s.challenge && (
        <div className={`sim-challenge ${result?.state ?? 'running'}`} role="status">
          <img src={iconUrl(result?.state === 'won' ? 'cup_gold' : 'flag_finish')} alt="" />
          <div>
            <strong>{s.challenge.name}</strong> — {s.challenge.description}
            <div className="sim-challenge-line">
              <span>
                {Math.min(time, s.challenge.timeLimit).toFixed(1)} / {s.challenge.timeLimit} s
              </span>
              <span>Score {result?.score ?? 0}</span>
              {result && result.bumps > 0 && <span>Bumps {result.bumps}</span>}
              {result?.state === 'won' && (
                <span className="stars" aria-label={`${result.stars} stars`}>
                  {'★'.repeat(result.stars)}
                  {'☆'.repeat(3 - result.stars)}
                </span>
              )}
              <span className="sim-challenge-message">
                {!result || (result.state === 'running' && s.status === 'ready')
                  ? 'Press Run to start.'
                  : result.message}
                {result && result.state !== 'running' && ' Press Run to try again.'}
              </span>
            </div>
          </div>
        </div>
      )}

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
            {editable && ` Drag to place ${sim2 ? 'a' : 'the'} robot, scroll to turn it.`}
          </p>
        </div>

        <div className="sim-brick">
          {sim2 && (
            <div className="sim-brick-tabs" role="tablist" aria-label="Brick">
              {([1, 2] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="tab"
                  aria-selected={brick === b}
                  className={brick === b ? 'active' : ''}
                  title={b === 1 ? state.program.name : (s.secondName ?? '')}
                  onClick={() => setBrick(b)}
                >
                  Brick {b}
                  {(b === 1 ? s.status : s.status2) === 'finished' && ' ✓'}
                </button>
              ))}
            </div>
          )}
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
          <Readouts sim={shown} />
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
            <p className="sim-muted">This program uses no variables.</p>
          ) : (
            <table className="sim-table">
              <tbody>
                {userVars.map((v) => (
                  <tr key={v.name}>
                    <th>{v.name}</th>
                    <td>{shown ? formatValue(shown.variables().get(v.name)) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="sim-muted">Values on data wires appear on the wires while simulating.</p>
        </fieldset>
        <fieldset className="groupbox">
          <legend>Bluetooth messages</legend>
          <label className="sim-second">
            <img src={iconUrl('bricks')} alt="" />
            Second brick
            <select
              value={secondValue}
              aria-label="Second brick"
              disabled={running}
              onFocus={() => void listLibrary().then(setLibrary)}
              onChange={(e) => chooseSecond(e.target.value)}
            >
              <option value="">None</option>
              <option value="same">This program</option>
              {s.second?.kind === 'program' && <option value={secondValue}>{s.second.name}</option>}
              <optgroup label="Examples">
                {EXAMPLES.map((ex) => (
                  <option key={ex.key} value={`example:${ex.key}`}>
                    {ex.name}
                  </option>
                ))}
              </optgroup>
              {library.length > 0 && (
                <optgroup label="Program library">
                  {library.slice(0, 40).map((entry) => (
                    <option key={entry.id} value={`library:${entry.id}`}>
                      {entry.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {sim2 && (
            <p className="sim-muted">
              Brick 1 is the master: it sends to brick 2 on connection 1, brick 2 answers on
              connection 0. The robots can see and bump into each other.
            </p>
          )}
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
              disabled={!shown || message === ''}
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
                shown?.receive(mailbox, value);
                const to = sim2 ? `brick ${brick} ` : '';
                setLog((l) =>
                  [`← ${to}mailbox ${mailbox}: ${formatValue(value)}`, ...l].slice(0, 6),
                );
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
      {editing && (
        <MatEditor
          mat={editing}
          custom={s.customMats.some((m) => m.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={async (mat) => {
            await s.saveMat(mat);
            s.setScenario(mat.id);
          }}
          onDelete={async (id) => {
            await s.deleteMat(id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Sensor and motor read-outs of one brick. */
function Readouts({ sim }: { sim: Simulation | null }) {
  const s = useSimulator();
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
