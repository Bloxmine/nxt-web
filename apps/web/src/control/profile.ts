/**
 * Control profiles for the remote control: how the robot steers, what each motor may do,
 * which keys (or gamepad controls) do what, and named sequences of commands.
 */

export type Port = 0 | 1 | 2;
export const PORTS: readonly Port[] = [0, 1, 2];
export const PORT_NAMES = ['A', 'B', 'C'] as const;

/** Settings for one output port. Positions are degrees from the motor's centre. */
export interface MotorSettings {
  /** What the motor does on this robot, e.g. "Steering" or "Left wheel". */
  name: string;
  /** Turn the other way (for motors mounted back to front). */
  reversed: boolean;
  /** Highest power the motor gets, 1–100 %. */
  maxPower: number;
  /** What the motor does when nothing drives it. */
  release: 'brake' | 'coast';
  /** How far the motor may turn each way from its centre. */
  limit: { enabled: boolean; min: number; max: number };
}

/** How the robot drives and turns. */
export type Steering =
  | {
      kind: 'differential';
      left: Port;
      right: Port;
      /** How much the inner wheel slows when turning while driving, 0–100 %. */
      sharpness: number;
    }
  | {
      kind: 'car';
      /** Motors that drive the wheels. */
      drive: Port[];
      /** The motor that turns the front wheels. */
      steer: Port;
      /** How far the steering motor turns each way from the centre (degrees). */
      range: number;
      /** Turn the steering back to the centre when no steering key is held. */
      autoCentre: boolean;
      /** Highest power for the steering motor, 1–100 %. */
      steerPower: number;
    }
  | { kind: 'none' };

export type DriveDirection = 'forward' | 'backward' | 'left' | 'right';

/** What an input does. */
export type Action =
  /** Drive or steer, using the profile's steering. */
  | { kind: 'drive'; direction: DriveDirection }
  /** Run one side of a two-wheel or tracked robot on its own (tank controls). */
  | { kind: 'track'; side: 'left' | 'right'; direction: 1 | -1 }
  /** Run a motor at a power while held, or switch it on and off with each press. */
  | { kind: 'motor'; port: Port; power: number; toggle: boolean }
  /** Turn a motor to a position (degrees from its centre). */
  | { kind: 'position'; port: Port; degrees: number }
  /** Start a sequence; with `whileHeld` it repeats while held and stops on release. */
  | { kind: 'sequence'; sequence: string; whileHeld: boolean }
  /** Change the driving speed: set it, step it up or down, or boost it while held. */
  | { kind: 'speed'; mode: 'set' | 'up' | 'down' | 'boost'; value: number }
  /** Sound a tone while held (a horn). */
  | { kind: 'tone'; frequency: number }
  /** Stop every motor and sequence. */
  | { kind: 'stop' };

/**
 * Something to press: keys held together (KeyboardEvent.code values, with left and
 * right modifiers merged, see input.ts) and/or gamepad controls ("pad:b0", "pad:a1-").
 */
export interface Binding {
  id: string;
  inputs: string[];
  action: Action;
}

/** One step of a sequence. */
export type Step =
  | {
      kind: 'run';
      ports: Port[];
      power: number;
      /** How long: seconds, degrees (of the first motor), or start it and go on. */
      amount: { unit: 'seconds' | 'degrees' | 'start'; value: number };
      then: 'brake' | 'coast';
    }
  | { kind: 'position'; port: Port; degrees: number }
  | { kind: 'stop'; ports: Port[]; brake: boolean }
  | { kind: 'wait'; seconds: number }
  | { kind: 'tone'; frequency: number; seconds: number };

export interface Sequence {
  id: string;
  name: string;
  steps: Step[];
}

export interface Profile {
  id: string;
  name: string;
  steering: Steering;
  /** Driving speed when the remote control opens, 10–100 %. */
  speed: number;
  motors: [MotorSettings, MotorSettings, MotorSettings];
  bindings: Binding[];
  sequences: Sequence[];
}

let counter = 0;
/** A short id that is unique within this page. */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function defaultMotor(name = ''): MotorSettings {
  return {
    name,
    reversed: false,
    maxPower: 100,
    release: 'brake',
    limit: { enabled: false, min: -90, max: 90 },
  };
}

const bind = (inputs: string[], action: Action): Binding => ({
  id: newId('b'),
  inputs,
  action,
});

const driveKeys = (): Binding[] => [
  bind(['ArrowUp'], { kind: 'drive', direction: 'forward' }),
  bind(['ArrowDown'], { kind: 'drive', direction: 'backward' }),
  bind(['ArrowLeft'], { kind: 'drive', direction: 'left' }),
  bind(['ArrowRight'], { kind: 'drive', direction: 'right' }),
  bind(['KeyW'], { kind: 'drive', direction: 'forward' }),
  bind(['KeyS'], { kind: 'drive', direction: 'backward' }),
  bind(['KeyA'], { kind: 'drive', direction: 'left' }),
  bind(['KeyD'], { kind: 'drive', direction: 'right' }),
];

const commonKeys = (): Binding[] => [
  bind(['Space'], { kind: 'stop' }),
  bind(['Shift'], { kind: 'speed', mode: 'boost', value: 100 }),
  bind(['Digit1'], { kind: 'speed', mode: 'set', value: 30 }),
  bind(['Digit2'], { kind: 'speed', mode: 'set', value: 60 }),
  bind(['Digit3'], { kind: 'speed', mode: 'set', value: 100 }),
  bind(['KeyH'], { kind: 'tone', frequency: 440 }),
];

export type PresetKey = 'two-wheel' | 'tank' | 'car' | 'empty';

export const PRESETS: { key: PresetKey; name: string; description: string }[] = [
  {
    key: 'two-wheel',
    name: 'Two-wheel robot',
    description: 'Wheels on B and C. Arrow keys or W A S D drive and turn.',
  },
  {
    key: 'tank',
    name: 'Tank controls',
    description: 'Each track on its own keys: W/S for the left track, ↑/↓ for the right.',
  },
  {
    key: 'car',
    name: 'Car with a steering motor',
    description: 'A steering motor (A) turns the front wheels, never past its ends; B and C drive.',
  },
  { key: 'empty', name: 'Empty', description: 'No keys yet; build your own.' },
];

/** A new profile from a preset. */
export function createProfile(preset: PresetKey, name?: string): Profile {
  const base: Profile = {
    id: newId('p'),
    name: name ?? PRESETS.find((p) => p.key === preset)!.name,
    steering: { kind: 'differential', left: 1, right: 2, sharpness: 50 },
    speed: 60,
    motors: [defaultMotor(), defaultMotor('Left wheel'), defaultMotor('Right wheel')],
    bindings: [],
    sequences: [],
  };
  switch (preset) {
    case 'two-wheel':
      return { ...base, bindings: [...driveKeys(), ...commonKeys()] };
    case 'tank':
      return {
        ...base,
        motors: [defaultMotor(), defaultMotor('Left track'), defaultMotor('Right track')],
        bindings: [
          bind(['KeyW'], { kind: 'track', side: 'left', direction: 1 }),
          bind(['KeyS'], { kind: 'track', side: 'left', direction: -1 }),
          bind(['ArrowUp'], { kind: 'track', side: 'right', direction: 1 }),
          bind(['ArrowDown'], { kind: 'track', side: 'right', direction: -1 }),
          ...commonKeys(),
        ],
      };
    case 'car':
      return {
        ...base,
        steering: {
          kind: 'car',
          drive: [1, 2],
          steer: 0,
          range: 60,
          autoCentre: true,
          steerPower: 40,
        },
        speed: 75,
        motors: [
          { ...defaultMotor('Steering'), maxPower: 40 },
          defaultMotor('Drive'),
          defaultMotor('Drive'),
        ],
        bindings: [...driveKeys(), ...commonKeys()],
      };
    case 'empty':
      return {
        ...base,
        steering: { kind: 'none' },
        motors: [defaultMotor(), defaultMotor(), defaultMotor()],
      };
  }
}

/** Powers and positions the user can type, kept in range. */
export const clampPower = (n: number) => Math.max(-100, Math.min(100, Math.round(n) || 0));
const clampTo = (n: unknown, lo: number, hi: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;

const isPort = (p: unknown): p is Port => p === 0 || p === 1 || p === 2;
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function readMotor(v: unknown): MotorSettings {
  const o = obj(v) ?? {};
  const limit = obj(o['limit']) ?? {};
  const min = clampTo(limit['min'], -100_000, 0, -90);
  const max = clampTo(limit['max'], 0, 100_000, 90);
  return {
    name: typeof o['name'] === 'string' ? o['name'].slice(0, 40) : '',
    reversed: o['reversed'] === true,
    maxPower: clampTo(o['maxPower'], 1, 100, 100),
    release: o['release'] === 'coast' ? 'coast' : 'brake',
    limit: { enabled: limit['enabled'] === true, min, max },
  };
}

function readSteering(v: unknown): Steering {
  const o = obj(v);
  if (o?.['kind'] === 'differential' && isPort(o['left']) && isPort(o['right']))
    return {
      kind: 'differential',
      left: o['left'],
      right: o['right'],
      sharpness: clampTo(o['sharpness'], 0, 100, 50),
    };
  if (o?.['kind'] === 'car' && isPort(o['steer']) && Array.isArray(o['drive']))
    return {
      kind: 'car',
      drive: [...new Set(o['drive'].filter(isPort))].filter((p) => p !== o['steer']),
      steer: o['steer'],
      range: clampTo(o['range'], 1, 100_000, 60),
      autoCentre: o['autoCentre'] !== false,
      steerPower: clampTo(o['steerPower'], 1, 100, 40),
    };
  return { kind: 'none' };
}

function readAction(v: unknown): Action | null {
  const o = obj(v);
  if (!o) return null;
  switch (o['kind']) {
    case 'drive':
      return ['forward', 'backward', 'left', 'right'].includes(o['direction'] as string)
        ? { kind: 'drive', direction: o['direction'] as DriveDirection }
        : null;
    case 'track':
      return o['side'] === 'left' || o['side'] === 'right'
        ? { kind: 'track', side: o['side'], direction: o['direction'] === -1 ? -1 : 1 }
        : null;
    case 'motor':
      return isPort(o['port'])
        ? {
            kind: 'motor',
            port: o['port'],
            power: clampPower(Number(o['power'])),
            toggle: o['toggle'] === true,
          }
        : null;
    case 'position':
      return isPort(o['port'])
        ? {
            kind: 'position',
            port: o['port'],
            degrees: clampTo(o['degrees'], -100_000, 100_000, 0),
          }
        : null;
    case 'sequence':
      return typeof o['sequence'] === 'string'
        ? { kind: 'sequence', sequence: o['sequence'], whileHeld: o['whileHeld'] === true }
        : null;
    case 'speed':
      return ['set', 'up', 'down', 'boost'].includes(o['mode'] as string)
        ? {
            kind: 'speed',
            mode: o['mode'] as 'set',
            value: clampTo(o['value'], 1, 100, 10),
          }
        : null;
    case 'tone':
      return { kind: 'tone', frequency: clampTo(o['frequency'], 200, 14_000, 440) };
    case 'stop':
      return { kind: 'stop' };
    default:
      return null;
  }
}

function readPorts(v: unknown): Port[] {
  return Array.isArray(v) ? [...new Set(v.filter(isPort))] : [];
}

function readStep(v: unknown): Step | null {
  const o = obj(v);
  if (!o) return null;
  switch (o['kind']) {
    case 'run': {
      const amount = obj(o['amount']) ?? {};
      const unit = ['seconds', 'degrees', 'start'].includes(amount['unit'] as string)
        ? (amount['unit'] as 'seconds')
        : 'seconds';
      return {
        kind: 'run',
        ports: readPorts(o['ports']),
        power: clampPower(Number(o['power'])),
        amount: { unit, value: clampTo(amount['value'], 0, 100_000, 1) },
        then: o['then'] === 'coast' ? 'coast' : 'brake',
      };
    }
    case 'position':
      return isPort(o['port'])
        ? {
            kind: 'position',
            port: o['port'],
            degrees: clampTo(o['degrees'], -100_000, 100_000, 0),
          }
        : null;
    case 'stop':
      return { kind: 'stop', ports: readPorts(o['ports']), brake: o['brake'] !== false };
    case 'wait':
      return { kind: 'wait', seconds: clampTo(o['seconds'], 0, 3600, 1) };
    case 'tone':
      return {
        kind: 'tone',
        frequency: clampTo(o['frequency'], 200, 14_000, 440),
        seconds: clampTo(o['seconds'], 0, 60, 0.5),
      };
    default:
      return null;
  }
}

/**
 * Reads a profile from stored or imported data. Anything missing or out of range is
 * replaced by a default, so a damaged file never breaks the remote control.
 * Returns null when the data is not a profile at all.
 */
export function readProfile(v: unknown): Profile | null {
  const o = obj(v);
  if (!o || !Array.isArray(o['bindings'])) return null;
  const motors = Array.isArray(o['motors']) ? o['motors'] : [];
  const sequences: Sequence[] = (Array.isArray(o['sequences']) ? o['sequences'] : [])
    .map(obj)
    .filter((s): s is Record<string, unknown> => s !== null && typeof s['id'] === 'string')
    .map((s) => ({
      id: s['id'] as string,
      name: typeof s['name'] === 'string' ? s['name'].slice(0, 60) : 'Sequence',
      steps: (Array.isArray(s['steps']) ? s['steps'] : [])
        .map(readStep)
        .filter((x): x is Step => x !== null),
    }));
  const bindings: Binding[] = o['bindings']
    .map(obj)
    .filter((b): b is Record<string, unknown> => b !== null)
    .map((b) => ({
      id: typeof b['id'] === 'string' ? b['id'] : newId('b'),
      inputs: Array.isArray(b['inputs'])
        ? b['inputs'].filter((i): i is string => typeof i === 'string').slice(0, 6)
        : [],
      action: readAction(b['action']),
    }))
    .filter((b): b is Binding => b.action !== null);
  return {
    id: typeof o['id'] === 'string' ? o['id'] : newId('p'),
    name: typeof o['name'] === 'string' && o['name'].trim() ? o['name'].slice(0, 60) : 'Controls',
    steering: readSteering(o['steering']),
    speed: clampTo(o['speed'], 10, 100, 60),
    motors: [readMotor(motors[0]), readMotor(motors[1]), readMotor(motors[2])],
    bindings,
    sequences,
  };
}

/** The ports a profile's steering uses, with what they do. */
export function steeringRoles(s: Steering): Map<Port, string> {
  const roles = new Map<Port, string>();
  if (s.kind === 'differential') {
    roles.set(s.left, 'left wheel');
    roles.set(s.right, 'right wheel');
  } else if (s.kind === 'car') {
    for (const p of s.drive) roles.set(p, 'drive');
    roles.set(s.steer, 'steering');
  }
  return roles;
}

/** How far a motor may turn: its own limit and, for a car's steering motor, the range. */
export function limitsOf(profile: Profile, port: Port): { min: number; max: number } | null {
  const own = profile.motors[port].limit;
  let min = own.enabled ? own.min : -Infinity;
  let max = own.enabled ? own.max : Infinity;
  const s = profile.steering;
  if (s.kind === 'car' && s.steer === port) {
    min = Math.max(min, -s.range);
    max = Math.min(max, s.range);
  }
  return Number.isFinite(min) || Number.isFinite(max) ? { min, max } : null;
}

/** Short description of an action, for lists. */
export function describeAction(a: Action, profile: Profile): string {
  const port = (p: Port) => {
    const name = profile.motors[p].name;
    return name ? `${PORT_NAMES[p]} (${name})` : PORT_NAMES[p];
  };
  switch (a.kind) {
    case 'drive':
      return {
        forward: 'Drive forward',
        backward: 'Drive backward',
        left: profile.steering.kind === 'car' ? 'Steer left' : 'Turn left',
        right: profile.steering.kind === 'car' ? 'Steer right' : 'Turn right',
      }[a.direction];
    case 'track':
      return `${a.side === 'left' ? 'Left' : 'Right'} track ${a.direction > 0 ? 'forward' : 'backward'}`;
    case 'motor':
      return `${a.toggle ? 'Switch on/off' : 'Run'} motor ${port(a.port)} at ${a.power}%`;
    case 'position':
      return `Turn motor ${port(a.port)} to ${a.degrees}°`;
    case 'sequence': {
      const name = profile.sequences.find((s) => s.id === a.sequence)?.name ?? '(missing)';
      return `${a.whileHeld ? 'Repeat while held' : 'Run'}: ${name}`;
    }
    case 'speed':
      return {
        set: `Speed ${a.value}%`,
        up: `Faster (+${a.value}%)`,
        down: `Slower (−${a.value}%)`,
        boost: `Boost to ${a.value}% while held`,
      }[a.mode];
    case 'tone':
      return `Horn (${a.frequency} Hz)`;
    case 'stop':
      return 'Stop everything';
  }
}

/** Short description of a sequence step. */
export function describeStep(s: Step): string {
  const ports = (ps: Port[]) => (ps.length ? ps.map((p) => PORT_NAMES[p]).join('+') : '—');
  switch (s.kind) {
    case 'run':
      return `Motor ${ports(s.ports)} at ${s.power}% ${
        s.amount.unit === 'start'
          ? '(keep going)'
          : s.amount.unit === 'seconds'
            ? `for ${s.amount.value} s`
            : `for ${s.amount.value}°`
      }`;
    case 'position':
      return `Motor ${PORT_NAMES[s.port]} to ${s.degrees}°`;
    case 'stop':
      return `Stop ${ports(s.ports)} (${s.brake ? 'brake' : 'coast'})`;
    case 'wait':
      return `Wait ${s.seconds} s`;
    case 'tone':
      return `Tone ${s.frequency} Hz for ${s.seconds} s`;
  }
}
