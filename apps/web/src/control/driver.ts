/**
 * Where the remote control's commands go: a connected brick (direct commands) or the
 * simulated robot. Drivers work in the motors' own units: raw positions in degrees and
 * powers −100…100 before "reversed" is applied (the control loop does that).
 */
import {
  OutputMode,
  RegulationMode,
  RunState,
  type NxtClient,
  type OutputPort,
} from '@nxt/protocol';
import { idleMotor, startMotors, stepMotor, stopMotors, type Simulation } from '@nxt/sim';
import type { Port, Profile } from './profile';

export interface MotorDriver {
  readonly kind: 'brick' | 'simulator';
  /** Time between control steps (ms). */
  readonly interval: number;
  /** Raw positions of the given ports (others may be null). */
  read(ports: readonly Port[]): Promise<(number | null)[]>;
  /**
   * Runs a motor (power ≠ 0) or stops it, braking or coasting. Unregulated power is
   * used for steering and calibration, where speed regulation would push harder and
   * harder against an end stop.
   */
  send(port: Port, power: number, brake: boolean, regulated: boolean): Promise<void>;
  tone(frequency: number, ms: number): Promise<void>;
  /** Called when the profile changes (the simulator needs to know how the robot steers). */
  setProfile?(profile: Profile): void;
  dispose(): void;
}

export class BrickDriver implements MotorDriver {
  readonly kind = 'brick';
  readonly interval = 50;

  constructor(private readonly client: NxtClient) {}

  async read(ports: readonly Port[]): Promise<(number | null)[]> {
    const out: (number | null)[] = [null, null, null];
    for (const p of ports)
      out[p] = (await this.client.getOutputState(p as OutputPort)).rotationCount;
    return out;
  }

  async send(port: Port, power: number, brake: boolean, regulated: boolean): Promise<void> {
    if (power === 0) return this.client.stopMotor(port as OutputPort, brake);
    if (regulated) return this.client.runMotor(port as OutputPort, power);
    await this.client.setOutputState(port as OutputPort, {
      power,
      mode: OutputMode.MotorOn | OutputMode.Brake,
      regulationMode: RegulationMode.Idle,
      turnRatio: 0,
      runState: RunState.Running,
      tachoLimit: 0,
    });
  }

  tone(frequency: number, ms: number): Promise<void> {
    return this.client.playTone(frequency, ms);
  }

  dispose(): void {}
}

/**
 * Drives the simulated robot. Its motors are simulated here, so any port can be used;
 * the robot on the mat then moves like the profile's steering says: two wheels from the
 * left and right motors, or a car whose turning follows its steering motor's position.
 */
export class SimDriver implements MotorDriver {
  readonly kind = 'simulator';
  readonly interval = 20;
  private readonly motors = [idleMotor(), idleMotor(), idleMotor()];
  private profile: Profile | null = null;
  private frame = 0;
  private last = performance.now();

  constructor(private readonly sim: Simulation) {
    const loop = (now: number) => {
      this.step(Math.min(50, now - this.last));
      this.last = now;
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  setProfile(profile: Profile): void {
    this.profile = profile;
  }

  read(): Promise<(number | null)[]> {
    return Promise.resolve(this.motors.map((m) => m.rotation));
  }

  send(port: Port, power: number, brake: boolean): Promise<void> {
    if (power === 0) stopMotors(this.motors, [port], brake ? 'brake' : 'coast');
    else startMotors(this.motors, [port], power, 0, null, brake ? 'brake' : 'coast');
    return Promise.resolve();
  }

  tone(): Promise<void> {
    return Promise.resolve();
  }

  /** The simulator only runs a program or the remote control, not both. */
  get busy(): boolean {
    return this.sim.status === 'running';
  }

  private step(dt: number): void {
    for (const m of this.motors) stepMotor(m, dt);
    if (this.busy) return;
    const [left, right] = this.wheels();
    this.sim.driveManually(Math.round(left), Math.round(right));
    this.sim.stepWorld(dt);
  }

  /** Powers for the simulated robot's two wheels. */
  private wheels(): [number, number] {
    const p = this.profile;
    // In the motor's own direction, so a "reversed" motor still drives forwards.
    const power = (port: Port) => {
      const m = this.motors[port]!;
      const raw = m.mode === 'run' ? m.power : 0;
      return p?.motors[port].reversed ? -raw : raw;
    };
    const s = p?.steering;
    if (s?.kind === 'differential') return [power(s.left), power(s.right)];
    if (s?.kind === 'car') {
      const drive = s.drive.length ? power(s.drive[0]!) : 0;
      const sign = p!.motors[s.steer].reversed ? -1 : 1;
      const angle = Math.max(-1, Math.min(1, (sign * this.motors[s.steer]!.rotation) / s.range));
      // The inner wheels go slower, as on a car turning a corner.
      return [drive * (1 + 0.6 * angle), drive * (1 - 0.6 * angle)];
    }
    const robot = this.sim.world.robot;
    return [power(robot.leftMotor), power(robot.rightMotor)];
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    if (!this.busy) this.sim.driveManually(0, 0);
  }
}
