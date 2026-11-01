import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NumberInput } from '../components/fields';
import { iconUrl } from '../lib/icons';
import {
  browserReserved,
  chordLabel,
  inputLabel,
  keyName,
  readGamepad,
  sameChord,
  sortChord,
} from './input';
import type { ControlLoop, LoopState } from './loop';
import {
  clampPower,
  describeStep,
  limitsOf,
  newId,
  PORT_NAMES,
  PORTS,
  steeringRoles,
  type Action,
  type Binding,
  type Port,
  type Profile,
  type Sequence,
  type Step,
} from './profile';

export interface SetupProps {
  profile: Profile;
  update(change: (p: Profile) => Profile): void;
  loop: ControlLoop | null;
  live: LoopState;
  /** A robot (the brick or the simulator) is there to calibrate. */
  canCalibrate: boolean;
}

function PortSelect({
  value,
  onChange,
  profile,
  label,
}: {
  value: Port;
  onChange(p: Port): void;
  profile: Profile;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as Port)}
    >
      {PORTS.map((p) => (
        <option key={p} value={p}>
          {PORT_NAMES[p]}
          {profile.motors[p].name ? ` – ${profile.motors[p].name}` : ''}
        </option>
      ))}
    </select>
  );
}

function PortChecks({
  value,
  onChange,
  exclude,
  label,
}: {
  value: Port[];
  onChange(ports: Port[]): void;
  exclude?: Port;
  label: string;
}) {
  return (
    <span className="rc-ports" role="group" aria-label={label}>
      {PORTS.filter((p) => p !== exclude).map((p) => (
        <label key={p}>
          <input
            type="checkbox"
            checked={value.includes(p)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, p].sort((a, b) => a - b)
                  : value.filter((x) => x !== p),
              )
            }
          />
          {PORT_NAMES[p]}
        </label>
      ))}
    </span>
  );
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rc-row">
      <span className="rc-label">{label}</span>
      <div className="rc-value">
        {children}
        {hint && <div className="sim-muted">{hint}</div>}
      </div>
    </div>
  );
}

/** Runs a calibration and reports errors next to the button. */
function useTask() {
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => {
    setError(null);
    fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  return { error, run };
}

// ---------------------------------------------------------------- Steering

export function SteeringTab({ profile, update, loop, live, canCalibrate }: SetupProps) {
  const s = profile.steering;
  const task = useTask();
  const setSteering = (steering: Profile['steering']) => update((p) => ({ ...p, steering }));
  const kinds: { kind: Profile['steering']['kind']; title: string; text: string; icon: string }[] =
    [
      {
        kind: 'differential',
        title: 'Two wheels or tracks',
        text: 'Turns by running the left and right side at different speeds. Also for tank controls.',
        icon: 'arrow_rotate_clockwise',
      },
      {
        kind: 'car',
        title: 'Car with a steering motor',
        text: 'One motor turns the front wheels, never past its ends; others drive.',
        icon: 'car',
      },
      {
        kind: 'none',
        title: 'No steering',
        text: 'Only your own motor keys and sequences (an arm, a crane, a turntable).',
        icon: 'cog',
      },
    ];
  return (
    <div className="rc-setup">
      <div className="rc-kinds" role="radiogroup" aria-label="How the robot steers">
        {kinds.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={s.kind === k.kind}
            className={`rc-kind ${s.kind === k.kind ? 'active' : ''}`}
            onClick={() => {
              if (k.kind === s.kind) return;
              if (k.kind === 'differential')
                setSteering({ kind: 'differential', left: 1, right: 2, sharpness: 50 });
              else if (k.kind === 'car')
                setSteering({
                  kind: 'car',
                  drive: [1, 2],
                  steer: 0,
                  range: 60,
                  autoCentre: true,
                  steerPower: 40,
                });
              else setSteering({ kind: 'none' });
            }}
          >
            <img src={iconUrl(k.icon, 32)} alt="" width={32} height={32} />
            <strong>{k.title}</strong>
            <span>{k.text}</span>
          </button>
        ))}
      </div>

      {s.kind === 'differential' && (
        <fieldset className="groupbox">
          <legend>Two wheels or tracks</legend>
          <Row label="Left side">
            <PortSelect
              label="Left motor"
              profile={profile}
              value={s.left}
              onChange={(left) => setSteering({ ...s, left })}
            />
          </Row>
          <Row label="Right side">
            <PortSelect
              label="Right motor"
              profile={profile}
              value={s.right}
              onChange={(right) => setSteering({ ...s, right })}
            />
          </Row>
          {s.left === s.right && (
            <div className="notice">
              <img src={iconUrl('error')} alt="" /> Left and right use the same motor.
            </div>
          )}
          <Row
            label="Turn sharpness"
            hint="How much the inner side slows down when turning while driving. At 100 it stops, so the robot turns around it. Turning without driving always spins on the spot."
          >
            <input
              type="range"
              min={0}
              max={100}
              value={s.sharpness}
              aria-label="Turn sharpness"
              onChange={(e) => setSteering({ ...s, sharpness: e.target.valueAsNumber })}
            />{' '}
            {s.sharpness}%
          </Row>
          <p className="sim-muted">
            For tank controls, give each side its own keys under <strong>Keys</strong> (“Left track
            forward” and so on). The drive keys still work as well.
          </p>
        </fieldset>
      )}

      {s.kind === 'car' && (
        <fieldset className="groupbox">
          <legend>Car with a steering motor</legend>
          <Row label="Steering motor">
            <PortSelect
              label="Steering motor"
              profile={profile}
              value={s.steer}
              onChange={(steer) =>
                setSteering({ ...s, steer, drive: s.drive.filter((p) => p !== steer) })
              }
            />
          </Row>
          <Row label="Drive motors" hint="Both turn at the same power.">
            <PortChecks
              label="Drive motors"
              value={s.drive}
              exclude={s.steer}
              onChange={(drive) => setSteering({ ...s, drive })}
            />
          </Row>
          <Row
            label="Steering range"
            hint="How far the steering motor may turn each way from the centre. Keep it a little short of where the wheels stop, so the motor never pushes against the end."
          >
            ±{' '}
            <NumberInput
              label="Steering range in degrees"
              value={s.range}
              min={1}
              max={3600}
              width={70}
              onChange={(range) => setSteering({ ...s, range: Math.max(1, Math.min(3600, range)) })}
            />{' '}
            degrees{' '}
            <button
              type="button"
              className="btn"
              disabled={!loop || !canCalibrate || live.busy !== null}
              title={
                canCalibrate
                  ? 'Turns the steering slowly to each end, then sets the range and the centre'
                  : 'Needs a robot: connect the brick, or open the simulator'
              }
              onClick={() =>
                task.run(async () => {
                  const range = await loop!.findEnds(s.steer);
                  setSteering({ ...s, range });
                })
              }
            >
              <img src={iconUrl('arrow_out')} alt="" /> Find the ends
            </button>
          </Row>
          {task.error && <div className="notice error">{task.error}</div>}
          <Row label="When you let go">
            <label>
              <input
                type="checkbox"
                checked={s.autoCentre}
                onChange={(e) => setSteering({ ...s, autoCentre: e.target.checked })}
              />{' '}
              Turn the steering back to the centre
            </label>
          </Row>
          <Row label="Steering power" hint="Lower is gentler on the gears; higher steers faster.">
            <input
              type="range"
              min={10}
              max={100}
              value={s.steerPower}
              aria-label="Steering power"
              onChange={(e) => setSteering({ ...s, steerPower: e.target.valueAsNumber })}
            />{' '}
            {s.steerPower}%
          </Row>
          <p className="sim-muted">
            The centre is where the steering was when the remote control started. Straighten the
            wheels and click <strong>Set centre</strong> under Motors, or use{' '}
            <strong>Find the ends</strong>.
          </p>
        </fieldset>
      )}

      <fieldset className="groupbox">
        <legend>Speed</legend>
        <Row label="Start speed" hint="The speed keys change it while you drive.">
          <input
            type="range"
            min={10}
            max={100}
            value={profile.speed}
            aria-label="Start speed"
            onChange={(e) => update((p) => ({ ...p, speed: e.target.valueAsNumber }))}
          />{' '}
          {profile.speed}%
        </Row>
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------- Motors

export function MotorsTab({ profile, update, loop, live, canCalibrate }: SetupProps) {
  const roles = steeringRoles(profile.steering);
  const task = useTask();
  const setMotor = (port: Port, change: Partial<Profile['motors'][number]>) =>
    update((p) => {
      const motors = [...p.motors] as Profile['motors'];
      motors[port] = { ...motors[port], ...change };
      return { ...p, motors };
    });
  const busy = !loop || live.busy !== null;
  return (
    <div className="rc-setup">
      {task.error && <div className="notice error">{task.error}</div>}
      <div className="rc-motor-grid">
        {PORTS.map((port) => {
          const m = profile.motors[port];
          const role = roles.get(port);
          const pos = live.positions[port];
          const lim = limitsOf(profile, port);
          return (
            <fieldset key={port} className="groupbox rc-motor-setup">
              <legend>
                Motor {PORT_NAMES[port]}
                {role && <span className="rc-role"> · {role}</span>}
              </legend>
              <Row label="Name">
                <input
                  type="text"
                  className="text-input"
                  value={m.name}
                  maxLength={40}
                  placeholder="What it does"
                  aria-label={`Name of motor ${PORT_NAMES[port]}`}
                  onChange={(e) => setMotor(port, { name: e.target.value })}
                />
              </Row>
              <Row label="Direction">
                <label>
                  <input
                    type="checkbox"
                    checked={m.reversed}
                    onChange={(e) => setMotor(port, { reversed: e.target.checked })}
                  />{' '}
                  Reversed (mounted the other way round)
                </label>
              </Row>
              <Row label="Top power">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={m.maxPower}
                  aria-label={`Top power of motor ${PORT_NAMES[port]}`}
                  onChange={(e) => setMotor(port, { maxPower: e.target.valueAsNumber })}
                />{' '}
                {m.maxPower}%
              </Row>
              <Row label="When let go">
                <select
                  value={m.release}
                  aria-label={`When motor ${PORT_NAMES[port]} is let go`}
                  onChange={(e) => setMotor(port, { release: e.target.value as 'brake' })}
                >
                  <option value="brake">Brake (stop at once, hold)</option>
                  <option value="coast">Coast (roll to a stop)</option>
                </select>
              </Row>
              <Row
                label="Limits"
                hint={
                  profile.steering.kind === 'car' && profile.steering.steer === port
                    ? `The steering range (±${profile.steering.range}°) applies as well.`
                    : undefined
                }
              >
                <label>
                  <input
                    type="checkbox"
                    checked={m.limit.enabled}
                    onChange={(e) =>
                      setMotor(port, { limit: { ...m.limit, enabled: e.target.checked } })
                    }
                  />{' '}
                  Only between
                </label>{' '}
                <NumberInput
                  label={`Lowest position of motor ${PORT_NAMES[port]}`}
                  value={m.limit.min}
                  max={0}
                  width={64}
                  onChange={(min) =>
                    setMotor(port, { limit: { ...m.limit, min: Math.min(0, min) } })
                  }
                />{' '}
                and{' '}
                <NumberInput
                  label={`Highest position of motor ${PORT_NAMES[port]}`}
                  value={m.limit.max}
                  min={0}
                  width={64}
                  onChange={(max) =>
                    setMotor(port, { limit: { ...m.limit, max: Math.max(0, max) } })
                  }
                />{' '}
                degrees
              </Row>
              <Row label="Position">
                <span className="rc-pos">
                  {pos === null || pos === undefined ? '—' : `${Math.round(pos)}°`}
                </span>
                {lim && pos !== null && pos !== undefined && <LimitBar pos={pos} lim={lim} />}
              </Row>
              <div className="rc-motor-buttons">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  title="Turn back a little"
                  aria-label={`Nudge motor ${PORT_NAMES[port]} backward`}
                  onClick={() => task.run(() => loop!.nudge(port, -30))}
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  title="Turn forward a little"
                  aria-label={`Nudge motor ${PORT_NAMES[port]} forward`}
                  onClick={() => task.run(() => loop!.nudge(port, 30))}
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  title="Make where the motor is now its centre (0°)"
                  onClick={() => loop!.setCentre(port)}
                >
                  Set centre
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !canCalibrate}
                  title={
                    canCalibrate
                      ? 'Turns the motor slowly to each end, centres it and sets the limits'
                      : 'Needs a robot: connect the brick, or open the simulator'
                  }
                  onClick={() =>
                    task.run(async () => {
                      const range = await loop!.findEnds(port);
                      setMotor(port, { limit: { enabled: true, min: -range, max: range } });
                    })
                  }
                >
                  Find the ends
                </button>
              </div>
            </fieldset>
          );
        })}
      </div>
      <p className="sim-muted">
        Positions are degrees from each motor’s centre. Near a limit the motor slows down and stops
        a little before it; turning away from the limit always works. The nudge buttons ignore the
        limits, so you can free a motor that got stuck.
      </p>
    </div>
  );
}

/** A bar from the lowest to the highest allowed position, with where the motor is. */
export function LimitBar({
  pos,
  lim,
  target,
}: {
  pos: number;
  lim: { min: number; max: number };
  target?: number | null;
}) {
  const lo = Number.isFinite(lim.min) ? lim.min : Math.min(pos, -Math.abs(lim.max));
  const hi = Number.isFinite(lim.max) ? lim.max : Math.max(pos, Math.abs(lim.min));
  const span = hi - lo || 1;
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%`;
  return (
    <span className="rc-limitbar" aria-hidden="true">
      <span className="rc-limitbar-centre" style={{ left: at(0) }} />
      {target !== null && target !== undefined && (
        <span className="rc-limitbar-target" style={{ left: at(target) }} />
      )}
      <span className="rc-limitbar-pos" style={{ left: at(pos) }} />
    </span>
  );
}

// ---------------------------------------------------------------- Keys

/** Records a key combination or gamepad control: everything held before all is let go. */
function useRecorder(onDone: (inputs: string[]) => void) {
  const [recording, setRecording] = useState<string | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!recording) return;
    const all = new Set<string>();
    const held = new Set<string>();
    const finish = (cancel: boolean) => {
      setRecording(null);
      setShown([]);
      if (!cancel && all.size) done.current(sortChord([...all]));
    };
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape' && all.size === 0) return finish(true);
      const k = keyName(e.code);
      held.add(k);
      all.add(k);
      setShown([...all]);
    };
    const up = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      held.delete(keyName(e.code));
      if (held.size === 0 && all.size) finish(false);
    };
    let frame = 0;
    let padHeld = false;
    const poll = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const now = new Set<string>();
      for (const pad of pads)
        if (pad) for (const [k, v] of readGamepad(pad)) if (v > 0.5) now.add(k);
      if (now.size) {
        padHeld = true;
        for (const k of now) all.add(k);
        setShown([...all]);
      } else if (padHeld && held.size === 0) {
        return finish(false);
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [recording]);

  return { recording, shown, start: setRecording, cancel: () => setRecording(null) };
}

const ACTION_KINDS: { value: string; label: string; make(p: Profile): Action }[] = [
  {
    value: 'drive:forward',
    label: 'Drive forward',
    make: () => ({ kind: 'drive', direction: 'forward' }),
  },
  {
    value: 'drive:backward',
    label: 'Drive backward',
    make: () => ({ kind: 'drive', direction: 'backward' }),
  },
  {
    value: 'drive:left',
    label: 'Turn / steer left',
    make: () => ({ kind: 'drive', direction: 'left' }),
  },
  {
    value: 'drive:right',
    label: 'Turn / steer right',
    make: () => ({ kind: 'drive', direction: 'right' }),
  },
  {
    value: 'track:left:1',
    label: 'Left track forward',
    make: () => ({ kind: 'track', side: 'left', direction: 1 }),
  },
  {
    value: 'track:left:-1',
    label: 'Left track backward',
    make: () => ({ kind: 'track', side: 'left', direction: -1 }),
  },
  {
    value: 'track:right:1',
    label: 'Right track forward',
    make: () => ({ kind: 'track', side: 'right', direction: 1 }),
  },
  {
    value: 'track:right:-1',
    label: 'Right track backward',
    make: () => ({ kind: 'track', side: 'right', direction: -1 }),
  },
  {
    value: 'motor',
    label: 'Run a motor',
    make: () => ({ kind: 'motor', port: 0, power: 50, toggle: false }),
  },
  {
    value: 'position',
    label: 'Turn a motor to a position',
    make: () => ({ kind: 'position', port: 0, degrees: 0 }),
  },
  {
    value: 'sequence',
    label: 'Run a sequence',
    make: (p) => ({ kind: 'sequence', sequence: p.sequences[0]?.id ?? '', whileHeld: false }),
  },
  {
    value: 'speed:set',
    label: 'Set the speed',
    make: () => ({ kind: 'speed', mode: 'set', value: 50 }),
  },
  { value: 'speed:up', label: 'Faster', make: () => ({ kind: 'speed', mode: 'up', value: 10 }) },
  {
    value: 'speed:down',
    label: 'Slower',
    make: () => ({ kind: 'speed', mode: 'down', value: 10 }),
  },
  {
    value: 'speed:boost',
    label: 'Boost while held',
    make: () => ({ kind: 'speed', mode: 'boost', value: 100 }),
  },
  {
    value: 'tone',
    label: 'Horn (tone while held)',
    make: () => ({ kind: 'tone', frequency: 440 }),
  },
  { value: 'stop', label: 'Stop everything', make: () => ({ kind: 'stop' }) },
];

function actionValue(a: Action): string {
  switch (a.kind) {
    case 'drive':
      return `drive:${a.direction}`;
    case 'track':
      return `track:${a.side}:${a.direction}`;
    case 'speed':
      return `speed:${a.mode}`;
    default:
      return a.kind;
  }
}

function ActionEditor({
  action,
  profile,
  onChange,
}: {
  action: Action;
  profile: Profile;
  onChange(a: Action): void;
}) {
  return (
    <span className="rc-action">
      <select
        aria-label="Action"
        value={actionValue(action)}
        onChange={(e) =>
          onChange(ACTION_KINDS.find((k) => k.value === e.target.value)!.make(profile))
        }
      >
        {ACTION_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      {action.kind === 'motor' && (
        <>
          <PortSelect
            label="Motor"
            profile={profile}
            value={action.port}
            onChange={(port) => onChange({ ...action, port })}
          />
          at
          <NumberInput
            label="Power"
            value={action.power}
            min={-100}
            max={100}
            width={56}
            onChange={(power) => onChange({ ...action, power: clampPower(power) })}
          />
          %
          <select
            aria-label="How"
            value={action.toggle ? 'toggle' : 'hold'}
            onChange={(e) => onChange({ ...action, toggle: e.target.value === 'toggle' })}
          >
            <option value="hold">while held</option>
            <option value="toggle">on/off with each press</option>
          </select>
        </>
      )}
      {action.kind === 'position' && (
        <>
          <PortSelect
            label="Motor"
            profile={profile}
            value={action.port}
            onChange={(port) => onChange({ ...action, port })}
          />
          to
          <NumberInput
            label="Position in degrees"
            value={action.degrees}
            width={64}
            onChange={(degrees) => onChange({ ...action, degrees })}
          />
          °
        </>
      )}
      {action.kind === 'sequence' && (
        <>
          <select
            aria-label="Sequence"
            value={action.sequence}
            onChange={(e) => onChange({ ...action, sequence: e.target.value })}
          >
            {profile.sequences.length === 0 && <option value="">(make one under Sequences)</option>}
            {profile.sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="How"
            value={action.whileHeld ? 'held' : 'once'}
            onChange={(e) => onChange({ ...action, whileHeld: e.target.value === 'held' })}
          >
            <option value="once">once per press</option>
            <option value="held">again and again while held</option>
          </select>
        </>
      )}
      {action.kind === 'speed' && (
        <>
          <NumberInput
            label="Speed in percent"
            value={action.value}
            min={1}
            max={100}
            width={56}
            onChange={(value) => onChange({ ...action, value: Math.max(1, Math.min(100, value)) })}
          />
          %
        </>
      )}
      {action.kind === 'tone' && (
        <>
          <NumberInput
            label="Frequency in hertz"
            value={action.frequency}
            min={200}
            max={14000}
            width={70}
            onChange={(frequency) =>
              onChange({ ...action, frequency: Math.max(200, Math.min(14000, frequency)) })
            }
          />
          Hz
        </>
      )}
    </span>
  );
}

export function KeysTab({ profile, update }: SetupProps) {
  const setBindings = (change: (b: Binding[]) => Binding[]) =>
    update((p) => ({ ...p, bindings: change(p.bindings) }));
  const recorder = useRecorder((inputs) => {
    const id = recorder.recording;
    setBindings((list) => list.map((b) => (b.id === id ? { ...b, inputs } : b)));
  });
  const [pads, setPads] = useState<string[]>([]);
  useEffect(() => {
    const read = () =>
      setPads((navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p).map((p) => p.id));
    read();
    window.addEventListener('gamepadconnected', read);
    window.addEventListener('gamepaddisconnected', read);
    return () => {
      window.removeEventListener('gamepadconnected', read);
      window.removeEventListener('gamepaddisconnected', read);
    };
  }, []);

  const warning = (b: Binding): string | null => {
    if (b.inputs.length === 0) return 'No keys yet: click the key button and press some.';
    if (profile.bindings.some((o) => o !== b && o.inputs.length && sameChord(o.inputs, b.inputs)))
      return 'Another line uses the same keys; both happen.';
    if (browserReserved(b.inputs)) return 'The browser keeps this combination for itself.';
    if (b.action.kind === 'track' && profile.steering.kind !== 'differential')
      return 'Track keys only work with “Two wheels or tracks” steering.';
    if (b.action.kind === 'drive' && profile.steering.kind === 'none')
      return 'Drive keys do nothing without steering (see Steering).';
    const action = b.action;
    if (action.kind === 'sequence' && !profile.sequences.some((s) => s.id === action.sequence))
      return 'Pick a sequence.';
    return null;
  };

  return (
    <div className="rc-setup">
      <p className="sim-muted" style={{ marginTop: 0 }}>
        Click a key button, then press a key or a combination (such as Shift + W) and let go. A
        combination wins over its keys alone. Gamepad buttons and sticks work too
        {pads.length
          ? ` (connected: ${pads.join(', ')})`
          : ' (press a button on a gamepad to connect it)'}
        .
      </p>
      <ul className="rc-bindings">
        {profile.bindings.map((b) => {
          const warn = warning(b);
          const isRecording = recorder.recording === b.id;
          return (
            <li key={b.id}>
              <button
                type="button"
                className={`rc-chord ${isRecording ? 'recording' : ''}`}
                title="Click, then press the keys"
                onClick={() => (isRecording ? recorder.cancel() : recorder.start(b.id))}
              >
                {isRecording
                  ? recorder.shown.length
                    ? chordLabel(recorder.shown)
                    : 'Press keys…'
                  : b.inputs.length
                    ? sortChord(b.inputs).map((i) => <kbd key={i}>{inputLabel(i)}</kbd>)
                    : 'Set keys'}
              </button>
              <ActionEditor
                action={b.action}
                profile={profile}
                onChange={(action) =>
                  setBindings((list) => list.map((x) => (x.id === b.id ? { ...x, action } : x)))
                }
              />
              <button
                type="button"
                className="btn rc-remove"
                aria-label="Remove"
                title="Remove"
                onClick={() => setBindings((list) => list.filter((x) => x.id !== b.id))}
              >
                <img src={iconUrl('delete')} alt="" />
              </button>
              {warn && (
                <span className="rc-warn">
                  <img src={iconUrl('error')} alt="" /> {warn}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const id = newId('b');
          setBindings((list) => [
            ...list,
            { id, inputs: [], action: { kind: 'motor', port: 0, power: 50, toggle: false } },
          ]);
          recorder.start(id);
        }}
      >
        <img src={iconUrl('page_white_add')} alt="" /> Add a key
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Sequences

const STEP_KINDS: { kind: Step['kind']; label: string; make(): Step }[] = [
  {
    kind: 'run',
    label: 'Run motors',
    make: () => ({
      kind: 'run',
      ports: [1, 2],
      power: 50,
      amount: { unit: 'seconds', value: 1 },
      then: 'brake',
    }),
  },
  {
    kind: 'position',
    label: 'Turn a motor to a position',
    make: () => ({ kind: 'position', port: 0, degrees: 0 }),
  },
  {
    kind: 'stop',
    label: 'Stop motors',
    make: () => ({ kind: 'stop', ports: [0, 1, 2], brake: true }),
  },
  { kind: 'wait', label: 'Wait', make: () => ({ kind: 'wait', seconds: 0.5 }) },
  {
    kind: 'tone',
    label: 'Play a tone',
    make: () => ({ kind: 'tone', frequency: 440, seconds: 0.3 }),
  },
];

function StepEditor({
  step,
  profile,
  onChange,
}: {
  step: Step;
  profile: Profile;
  onChange(s: Step): void;
}) {
  return (
    <span className="rc-action">
      <select
        aria-label="Step"
        value={step.kind}
        onChange={(e) => onChange(STEP_KINDS.find((k) => k.kind === e.target.value)!.make())}
      >
        {STEP_KINDS.map((k) => (
          <option key={k.kind} value={k.kind}>
            {k.label}
          </option>
        ))}
      </select>
      {step.kind === 'run' && (
        <>
          <PortChecks
            label="Motors"
            value={step.ports}
            onChange={(ports) => onChange({ ...step, ports })}
          />
          at
          <NumberInput
            label="Power"
            value={step.power}
            min={-100}
            max={100}
            width={56}
            onChange={(power) => onChange({ ...step, power: clampPower(power) })}
          />
          %
          <select
            aria-label="For how long"
            value={step.amount.unit}
            onChange={(e) =>
              onChange({ ...step, amount: { ...step.amount, unit: e.target.value as 'seconds' } })
            }
          >
            <option value="seconds">for seconds</option>
            <option value="degrees">for degrees</option>
            <option value="start">and go on (keep running)</option>
          </select>
          {step.amount.unit !== 'start' && (
            <NumberInput
              label={step.amount.unit === 'seconds' ? 'Seconds' : 'Degrees'}
              value={step.amount.value}
              min={0}
              step={step.amount.unit === 'seconds' ? 0.1 : 1}
              width={64}
              onChange={(value) =>
                onChange({ ...step, amount: { ...step.amount, value: Math.max(0, value) } })
              }
            />
          )}
          {step.amount.unit !== 'start' && (
            <select
              aria-label="Then"
              value={step.then}
              onChange={(e) => onChange({ ...step, then: e.target.value as 'brake' })}
            >
              <option value="brake">then brake</option>
              <option value="coast">then coast</option>
            </select>
          )}
        </>
      )}
      {step.kind === 'position' && (
        <>
          <PortSelect
            label="Motor"
            profile={profile}
            value={step.port}
            onChange={(port) => onChange({ ...step, port })}
          />
          to
          <NumberInput
            label="Position in degrees"
            value={step.degrees}
            width={64}
            onChange={(degrees) => onChange({ ...step, degrees })}
          />
          °
        </>
      )}
      {step.kind === 'stop' && (
        <>
          <PortChecks
            label="Motors"
            value={step.ports}
            onChange={(ports) => onChange({ ...step, ports })}
          />
          <select
            aria-label="How"
            value={step.brake ? 'brake' : 'coast'}
            onChange={(e) => onChange({ ...step, brake: e.target.value === 'brake' })}
          >
            <option value="brake">brake</option>
            <option value="coast">coast</option>
          </select>
        </>
      )}
      {step.kind === 'wait' && (
        <>
          <NumberInput
            label="Seconds"
            value={step.seconds}
            min={0}
            step={0.1}
            width={64}
            onChange={(seconds) => onChange({ ...step, seconds: Math.max(0, seconds) })}
          />
          s
        </>
      )}
      {step.kind === 'tone' && (
        <>
          <NumberInput
            label="Frequency in hertz"
            value={step.frequency}
            min={200}
            max={14000}
            width={70}
            onChange={(frequency) => onChange({ ...step, frequency })}
          />
          Hz for
          <NumberInput
            label="Seconds"
            value={step.seconds}
            min={0}
            step={0.1}
            width={56}
            onChange={(seconds) => onChange({ ...step, seconds: Math.max(0, seconds) })}
          />
          s
        </>
      )}
    </span>
  );
}

export function SequencesTab({ profile, update, loop, live }: SetupProps) {
  const [selected, setSelected] = useState<string | null>(profile.sequences[0]?.id ?? null);
  const seq = profile.sequences.find((s) => s.id === selected) ?? profile.sequences[0] ?? null;
  const setSeq = (change: (s: Sequence) => Sequence) =>
    update((p) => ({
      ...p,
      sequences: p.sequences.map((s) => (s.id === seq?.id ? change(s) : s)),
    }));
  const setSteps = (change: (steps: Step[]) => Step[]) =>
    setSeq((s) => ({ ...s, steps: change(s.steps) }));
  const keysFor = (id: string) =>
    profile.bindings
      .filter((b) => b.action.kind === 'sequence' && b.action.sequence === id && b.inputs.length)
      .map((b) => chordLabel(b.inputs));
  // Re-read on every update of the loop (live), so the list shows what runs now.
  const running = new Set(live.outputs ? (loop?.engine.running ?? []) : []);

  return (
    <div className="rc-setup rc-sequences">
      <div className="rc-seq-list">
        <ul>
          {profile.sequences.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={s.id === seq?.id ? 'active' : ''}
                onClick={() => setSelected(s.id)}
              >
                {running.has(s.id) && <img src={iconUrl('control_play')} alt="Running: " />}
                {s.name}
              </button>
            </li>
          ))}
          {profile.sequences.length === 0 && <li className="sim-muted">No sequences yet.</li>}
        </ul>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const s: Sequence = {
              id: newId('s'),
              name: `Sequence ${profile.sequences.length + 1}`,
              steps: [STEP_KINDS[0]!.make()],
            };
            update((p) => ({ ...p, sequences: [...p.sequences, s] }));
            setSelected(s.id);
          }}
        >
          <img src={iconUrl('page_white_add')} alt="" /> New sequence
        </button>
      </div>
      {seq ? (
        <div className="rc-seq-body">
          <div className="log-setup">
            <label>
              Name{' '}
              <input
                type="text"
                className="text-input"
                value={seq.name}
                maxLength={60}
                onChange={(e) => setSeq((s) => ({ ...s, name: e.target.value }))}
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={!loop || seq.steps.length === 0}
              onClick={() => loop?.engine.startSequence(seq.id)}
            >
              <img src={iconUrl('control_play')} alt="" /> Try it
            </button>
            <button
              type="button"
              className="btn"
              disabled={!loop}
              onClick={() => loop?.engine.stopAll()}
            >
              <img src={iconUrl('control_stop')} alt="" /> Stop
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                update((p) => ({
                  ...p,
                  sequences: p.sequences.filter((s) => s.id !== seq.id),
                  bindings: p.bindings.filter(
                    (b) => !(b.action.kind === 'sequence' && b.action.sequence === seq.id),
                  ),
                }));
                setSelected(null);
              }}
            >
              <img src={iconUrl('delete')} alt="" /> Delete
            </button>
          </div>
          <p className="sim-muted">
            {keysFor(seq.id).length
              ? `Started with ${keysFor(seq.id).join(', ')}.`
              : 'No key starts it yet: add one under Keys (“Run a sequence”).'}{' '}
            While it runs it has the motors it uses; when it ends they go back to your keys.
          </p>
          <ol className="rc-steps">
            {seq.steps.map((step, i) => (
              <li key={i} title={describeStep(step)}>
                <StepEditor
                  step={step}
                  profile={profile}
                  onChange={(next) =>
                    setSteps((steps) => steps.map((s, j) => (j === i ? next : s)))
                  }
                />
                <span className="rc-step-buttons">
                  <button
                    type="button"
                    className="btn"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() =>
                      setSteps((steps) => {
                        const next = [...steps];
                        [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                        return next;
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label="Move down"
                    disabled={i === seq.steps.length - 1}
                    onClick={() =>
                      setSteps((steps) => {
                        const next = [...steps];
                        [next[i + 1], next[i]] = [next[i]!, next[i + 1]!];
                        return next;
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-label="Remove step"
                    onClick={() => setSteps((steps) => steps.filter((_, j) => j !== i))}
                  >
                    <img src={iconUrl('delete')} alt="" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn"
            onClick={() => setSteps((steps) => [...steps, STEP_KINDS[3]!.make()])}
          >
            <img src={iconUrl('page_white_add')} alt="" /> Add a step
          </button>
        </div>
      ) : (
        <p className="sim-muted">
          A sequence is a chain of commands one key can start: for example close the claw, lift the
          arm and beep.
        </p>
      )}
    </div>
  );
}
