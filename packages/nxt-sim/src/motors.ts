import type { OutputPort } from '@nxt/compiler';

/** Speed of an NXT motor at full power, in degrees per second (about 140 rpm under load). */
export const MAX_SPEED = 850;

/** One output port's motor. */
export interface Motor {
  /** Requested power, −100..100 (negative runs backwards). */
  power: number;
  /** 'run' drives at `power`; 'brake' holds still; 'coast' spins down freely. */
  mode: 'run' | 'brake' | 'coast';
  /** Degrees still to turn before stopping, or null for no limit. */
  remaining: number | null;
  /** What to do when `remaining` reaches 0. */
  then: 'brake' | 'coast';
  /** Current speed in degrees per second. */
  speed: number;
  /** Degrees turned since the program started or the last reset (the rotation sensor). */
  rotation: number;
}

/** A stopped motor. */
export function idleMotor(): Motor {
  return { power: 0, mode: 'coast', remaining: null, then: 'brake', speed: 0, rotation: 0 };
}

/** Powers of the given ports after steering: the second port is the right-hand motor. */
export function steeredPowers(ports: OutputPort[], power: number, turnRatio: number): number[] {
  if (ports.length !== 2) return ports.map(() => power);
  const ratio = Math.max(-100, Math.min(100, turnRatio));
  const slow = power * (1 - Math.abs(ratio) / 50);
  return ratio >= 0 ? [power, slow] : [slow, power];
}

/** Starts motors. `degrees` (if given) is how far the fastest one turns. */
export function startMotors(
  motors: Motor[],
  ports: OutputPort[],
  power: number,
  turnRatio: number,
  degrees: number | null,
  then: 'brake' | 'coast',
): void {
  const powers = steeredPowers(ports, Math.max(-100, Math.min(100, power)), turnRatio);
  const fastest = Math.max(...powers.map(Math.abs));
  ports.forEach((port, i) => {
    const m = motors[port]!;
    const p = powers[i]!;
    m.power = p;
    m.mode = 'run';
    m.then = then;
    m.remaining =
      degrees === null ? null : fastest === 0 ? 0 : (Math.abs(degrees) * Math.abs(p)) / fastest;
  });
}

/** Stops motors, braking or coasting. */
export function stopMotors(motors: Motor[], ports: OutputPort[], mode: 'brake' | 'coast'): void {
  for (const port of ports) {
    const m = motors[port]!;
    m.power = 0;
    m.mode = mode;
    m.remaining = null;
    if (mode === 'brake') m.speed = 0;
  }
}

/** True while a motor is still turning towards a degree limit. */
export function isBusy(m: Motor): boolean {
  return m.mode === 'run' && m.remaining !== null && m.remaining > 0;
}

/**
 * Advances a motor by `dt` milliseconds. Returns the degrees it turned (signed).
 * Speed follows the requested power with a short ramp; limits stop it exactly.
 */
export function stepMotor(m: Motor, dt: number): number {
  const seconds = dt / 1000;
  if (m.mode === 'run') {
    const target = (m.power / 100) * MAX_SPEED;
    m.speed += (target - m.speed) * Math.min(1, dt / 40);
  } else if (m.mode === 'brake') {
    m.speed = 0;
  } else {
    m.speed *= Math.exp(-dt / 120);
    if (Math.abs(m.speed) < 1) m.speed = 0;
  }
  let turned = m.speed * seconds;
  if (m.mode === 'run' && m.remaining !== null) {
    if (Math.abs(turned) >= m.remaining) {
      turned = Math.sign(turned || m.power) * m.remaining;
      m.remaining = 0;
      m.mode = m.then;
      m.power = 0;
      if (m.then === 'brake') m.speed = 0;
    } else {
      m.remaining -= Math.abs(turned);
    }
  }
  m.rotation += turned;
  return turned;
}
