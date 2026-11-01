/**
 * The remote control's brain: turns the inputs held right now (and the motors'
 * positions) into a power for each motor, many times a second. It knows nothing about
 * the brick or the simulator; a driver sends what it returns (see driver.ts).
 *
 * Positions are degrees from each motor's centre, in the motor's own direction after
 * "reversed" is applied, so limits and targets read the same on every robot.
 */
import { activeBindings } from './input';
import {
  limitsOf,
  type Binding,
  type Port,
  type Profile,
  type Sequence,
  type Step,
} from './profile';

/** What a motor should do now: run at `power`, or (power 0) brake or coast. */
export interface PortCommand {
  power: number;
  brake: boolean;
}

export interface Outputs {
  ports: [PortCommand, PortCommand, PortCommand];
  /** Tone to sound now (Hz), or null. */
  tone: number | null;
  /** Motors held back by their limit this tick. */
  atLimit: [boolean, boolean, boolean];
  /** Bindings that are active, by id (for highlighting them). */
  active: Set<string>;
  /** Current driving speed (%). */
  speed: number;
  /** Where each motor is being turned to, if anywhere. */
  targets: [number | null, number | null, number | null];
}

/** Within this many degrees, a motor counts as at its target. */
export const TOLERANCE = 3;
/** Stop this many degrees before a limit. */
export const LIMIT_MARGIN = 2;
/** Slow down over the last this many degrees before a limit. */
export const SLOW_ZONE = 40;
/** Lowest power that still turns a motor. */
export const MIN_POWER = 15;
/** Power per degree away from a target. */
const GAIN = 1.2;
/** A "turn to" step gives up after this long. */
const POSITION_TIMEOUT_MS = 3000;
/** Rough motor speed at full power (degrees per second), used when positions are unknown. */
const DEG_PER_SEC_AT_FULL = 850;

/** Power to reach `target` from `position`, at most `maxPower`; 0 when there. */
export function towards(target: number, position: number, maxPower: number): number {
  const error = target - position;
  if (Math.abs(error) <= TOLERANCE) return 0;
  const power = Math.min(maxPower, Math.max(MIN_POWER, Math.abs(error) * GAIN));
  return Math.sign(error) * Math.round(power);
}

/**
 * Holds a power back near a limit: slower over the last {@link SLOW_ZONE} degrees, and
 * 0 at the limit. Turning away from the limit is never held back.
 */
export function limitPower(
  power: number,
  position: number | null,
  limit: { min: number; max: number } | null,
): { power: number; atLimit: boolean } {
  if (!limit || position === null || power === 0) return { power, atLimit: false };
  const room = power > 0 ? limit.max - position : position - limit.min;
  if (room <= LIMIT_MARGIN) return { power: 0, atLimit: true };
  if (room < SLOW_ZONE) {
    const slowed = Math.max(MIN_POWER, (Math.abs(power) * room) / SLOW_ZONE);
    return {
      power: Math.sign(power) * Math.round(Math.min(Math.abs(power), slowed)),
      atLimit: false,
    };
  }
  return { power, atLimit: false };
}

/** Left and right wheel amounts (−1…1) for a forward amount and a turn amount. */
export function mixDifferential(
  forward: number,
  turn: number,
  sharpness: number,
): [number, number] {
  const k = forward === 0 ? 1 : sharpness / 100;
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  return [clamp(forward + turn * k), clamp(forward - turn * k)];
}

type Owned = { power: number; brake: boolean } | { target: number };

interface SequenceRun {
  sequence: Sequence;
  /** The binding that started it, for "repeat while held". */
  binding: string | null;
  whileHeld: boolean;
  step: number;
  /** When the current step started (ms), or null before it has. */
  started: number | null;
  startPositions: (number | null)[];
  owned: Map<Port, Owned>;
  tone: { frequency: number; until: number } | null;
}

export class ControlEngine {
  speed: number;
  private toggled = new Set<string>();
  private targets: [number | null, number | null, number | null] = [null, null, null];
  private steerTarget = 0;
  private wasSteering = false;
  private previous = new Set<string>();
  private runs: SequenceRun[] = [];

  constructor(private profile: Profile) {
    this.speed = profile.speed;
  }

  /** Use an edited profile; keeps what is running where it still makes sense. */
  setProfile(profile: Profile): void {
    const speedWasDefault = this.speed === this.profile.speed;
    this.profile = profile;
    if (speedWasDefault) this.speed = profile.speed;
    const ids = new Set(profile.bindings.map((b) => b.id));
    for (const id of this.toggled) if (!ids.has(id)) this.toggled.delete(id);
    this.runs = this.runs.filter((r) => profile.sequences.some((s) => s.id === r.sequence.id));
  }

  /** Stops every motor, sequence and switched-on motor. */
  stopAll(): void {
    this.toggled.clear();
    this.targets = [null, null, null];
    this.steerTarget = 0;
    this.runs = [];
  }

  /** Starts a sequence by hand (the Test button). */
  startSequence(id: string): void {
    const sequence = this.profile.sequences.find((s) => s.id === id);
    if (sequence) this.start(sequence, null, false);
  }

  /** Names of the sequences running now. */
  get running(): string[] {
    return this.runs.map((r) => r.sequence.id);
  }

  /**
   * One control step. `held` maps each held input to how far it is pressed (0–1);
   * `positions` are the motors' positions (null when unknown); `now` is in ms.
   */
  tick(
    held: ReadonlyMap<string, number>,
    positions: readonly (number | null)[],
    now: number,
  ): Outputs {
    const profile = this.profile;
    const active = activeBindings(profile.bindings, held);
    const ids = new Set([...active.keys()].map((b) => b.id));
    const pressed = (b: Binding) => !this.previous.has(b.id);

    let forward = 0;
    let turn = 0;
    let leftTrack = 0;
    let rightTrack = 0;
    let boost: number | null = null;
    let tone: number | null = null;
    const holds: (number | null)[] = [null, null, null];

    for (const [b, value] of active) {
      const a = b.action;
      switch (a.kind) {
        case 'drive':
          if (a.direction === 'forward') forward += value;
          if (a.direction === 'backward') forward -= value;
          if (a.direction === 'right') turn += value;
          if (a.direction === 'left') turn -= value;
          break;
        case 'track':
          if (a.side === 'left') leftTrack += a.direction * value;
          else rightTrack += a.direction * value;
          break;
        case 'motor':
          if (a.toggle) {
            if (pressed(b)) {
              if (this.toggled.has(b.id)) this.toggled.delete(b.id);
              else {
                // Only one switched-on binding per motor.
                for (const other of profile.bindings)
                  if (other.action.kind === 'motor' && other.action.port === a.port)
                    this.toggled.delete(other.id);
                this.toggled.add(b.id);
              }
              this.targets[a.port] = null;
            }
          } else {
            holds[a.port] = a.power * value;
            this.targets[a.port] = null;
          }
          break;
        case 'position':
          if (pressed(b)) this.setTarget(a.port, a.degrees);
          break;
        case 'sequence':
          if (pressed(b) && !this.runs.some((r) => r.sequence.id === a.sequence)) {
            const sequence = profile.sequences.find((s) => s.id === a.sequence);
            if (sequence) this.start(sequence, b.id, a.whileHeld);
          }
          break;
        case 'speed':
          if (a.mode === 'boost') boost = Math.max(boost ?? 0, a.value);
          else if (pressed(b)) {
            const next =
              a.mode === 'set'
                ? a.value
                : a.mode === 'up'
                  ? this.speed + a.value
                  : this.speed - a.value;
            this.speed = Math.max(10, Math.min(100, next));
          }
          break;
        case 'tone':
          tone = a.frequency;
          break;
        case 'stop':
          if (pressed(b)) this.stopAll();
          break;
      }
    }
    // "Repeat while held" sequences end when their binding is let go.
    this.runs = this.runs.filter((r) => !r.whileHeld || (r.binding && ids.has(r.binding)));
    this.previous = ids;

    forward = Math.max(-1, Math.min(1, forward));
    turn = Math.max(-1, Math.min(1, turn));
    const speed = boost ?? this.speed;

    // What each port wants, lowest priority first: steering, then targets, switched-on
    // motors, held motors and, on top, running sequences.
    const want: (number | { target: number } | null)[] = [null, null, null];
    const steering = profile.steering;
    if (steering.kind === 'differential') {
      const [l, r] = mixDifferential(forward, turn, steering.sharpness);
      const left = Math.max(-1, Math.min(1, l + leftTrack));
      const right = Math.max(-1, Math.min(1, r + rightTrack));
      if (left !== 0) want[steering.left] = left * speed;
      if (right !== 0) want[steering.right] = right * speed;
    } else if (steering.kind === 'car') {
      if (forward !== 0) for (const p of steering.drive) want[p] = forward * speed;
      // Back to the centre when the steering keys are let go (a "turn to" key can still
      // leave the steering somewhere else).
      if (turn !== 0) this.steerTarget = turn * steering.range;
      else if (steering.autoCentre && this.wasSteering) this.steerTarget = 0;
      this.wasSteering = turn !== 0;
      want[steering.steer] =
        positions[steering.steer] === null
          ? // Position unknown: steer while held, without limits.
            turn === 0
            ? null
            : Math.sign(turn) * steering.steerPower
          : { target: this.steerTarget };
    }
    this.targets.forEach((t, p) => {
      if (t !== null) want[p] = { target: t };
    });
    for (const id of this.toggled) {
      const b = profile.bindings.find((x) => x.id === id);
      if (b?.action.kind === 'motor') want[b.action.port] = b.action.power;
    }
    holds.forEach((h, p) => {
      if (h !== null) want[p] = h;
    });

    const runTones = this.advanceSequences(positions, now);
    for (const run of this.runs)
      for (const [p, o] of run.owned) want[p] = 'target' in o ? { target: o.target } : o.power;
    const ownedStops = new Map<Port, boolean>();
    for (const run of this.runs)
      for (const [p, o] of run.owned)
        if (!('target' in o) && o.power === 0) ownedStops.set(p, o.brake);

    const ports = [0, 1, 2].map((i) => {
      const p = i as Port;
      const motor = profile.motors[p];
      const maxPower =
        steering.kind === 'car' && steering.steer === p
          ? Math.min(motor.maxPower, steering.steerPower)
          : motor.maxPower;
      const w = want[p];
      let power: number;
      if (w === null || w === undefined) power = 0;
      else if (typeof w === 'number') power = w;
      else {
        const position = positions[p] ?? null;
        const lim = limitsOf(profile, p);
        const target = lim ? Math.max(lim.min, Math.min(lim.max, w.target)) : w.target;
        power = position === null ? 0 : towards(target, position, maxPower);
      }
      power = Math.max(-maxPower, Math.min(maxPower, Math.round(power)));
      const limited = limitPower(power, positions[p] ?? null, limitsOf(profile, p));
      const brake =
        ownedStops.get(p) ??
        // Hold a position-controlled motor in place; otherwise do what the motor is set to.
        (typeof w === 'object' && w !== null ? true : motor.release === 'brake');
      return { power: limited.power, brake, atLimit: limited.atLimit };
    }) as [
      PortCommand & { atLimit: boolean },
      PortCommand & { atLimit: boolean },
      PortCommand & { atLimit: boolean },
    ];

    return {
      ports: ports.map(({ power, brake }) => ({ power, brake })) as Outputs['ports'],
      tone: runTones ?? tone,
      atLimit: ports.map((p) => p.atLimit) as Outputs['atLimit'],
      active: ids,
      speed,
      targets: [0, 1, 2].map((p) => {
        const w = want[p];
        return typeof w === 'object' && w !== null ? w.target : null;
      }) as Outputs['targets'],
    };
  }

  private setTarget(port: Port, degrees: number): void {
    const s = this.profile.steering;
    if (s.kind === 'car' && s.steer === port) this.steerTarget = degrees;
    else this.targets[port] = degrees;
  }

  private start(sequence: Sequence, binding: string | null, whileHeld: boolean): void {
    this.runs.push({
      sequence,
      binding,
      whileHeld,
      step: 0,
      started: null,
      startPositions: [null, null, null],
      owned: new Map(),
      tone: null,
    });
  }

  /** Moves running sequences on; returns the tone they sound, if any. */
  private advanceSequences(positions: readonly (number | null)[], now: number): number | null {
    let tone: number | null = null;
    const finished: SequenceRun[] = [];
    for (const run of this.runs) {
      // Several instant steps (stop, start a motor) can happen in one tick.
      for (let guard = 0; guard < 32; guard++) {
        const step = run.sequence.steps[run.step];
        if (!step) {
          if (run.whileHeld && run.sequence.steps.length > 0) {
            run.step = 0;
            run.started = null;
            run.owned.clear();
            continue;
          }
          finished.push(run);
          break;
        }
        if (run.started === null) {
          run.started = now;
          run.startPositions = [...positions];
          this.enterStep(run, step, now);
        }
        if (!this.stepDone(run, step, positions, now)) break;
        this.leaveStep(run, step);
        run.step += 1;
        run.started = null;
      }
      if (run.tone && run.tone.until > now) tone = run.tone.frequency;
    }
    this.runs = this.runs.filter((r) => !finished.includes(r));
    return tone;
  }

  private enterStep(run: SequenceRun, step: Step, now: number): void {
    switch (step.kind) {
      case 'run':
        for (const p of step.ports) run.owned.set(p, { power: step.power, brake: true });
        break;
      case 'position':
        run.owned.set(step.port, { target: step.degrees });
        break;
      case 'stop':
        for (const p of step.ports) run.owned.set(p, { power: 0, brake: step.brake });
        break;
      case 'tone':
        run.tone = { frequency: step.frequency, until: now + step.seconds * 1000 };
        break;
      case 'wait':
        break;
    }
  }

  private stepDone(
    run: SequenceRun,
    step: Step,
    positions: readonly (number | null)[],
    now: number,
  ): boolean {
    const elapsed = now - (run.started ?? now);
    switch (step.kind) {
      case 'run': {
        if (step.amount.unit === 'start' || step.ports.length === 0 || step.power === 0)
          return true;
        if (step.amount.unit === 'seconds') return elapsed >= step.amount.value * 1000;
        const p = step.ports[0]!;
        const from = run.startPositions[p];
        const at = positions[p];
        if (from === null || from === undefined || at === null || at === undefined)
          return (
            elapsed >=
            (step.amount.value / ((DEG_PER_SEC_AT_FULL * Math.abs(step.power)) / 100)) * 1000
          );
        if (Math.abs(at - from) >= step.amount.value) return true;
        // Held at a limit: it will not get any further.
        const lim = limitsOf(this.profile, p);
        return limitPower(step.power, at, lim).atLimit;
      }
      case 'position': {
        const at = positions[step.port];
        if (at === null || at === undefined) return true;
        const lim = limitsOf(this.profile, step.port);
        const target = lim ? Math.max(lim.min, Math.min(lim.max, step.degrees)) : step.degrees;
        return Math.abs(target - at) <= TOLERANCE || elapsed >= POSITION_TIMEOUT_MS;
      }
      case 'stop':
        return true;
      case 'wait':
        return elapsed >= step.seconds * 1000;
      case 'tone':
        return elapsed >= step.seconds * 1000;
    }
  }

  private leaveStep(run: SequenceRun, step: Step): void {
    if (step.kind === 'run' && step.amount.unit !== 'start')
      for (const p of step.ports) run.owned.set(p, { power: 0, brake: step.then === 'brake' });
    if (step.kind === 'tone') run.tone = null;
  }
}
