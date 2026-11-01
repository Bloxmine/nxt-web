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
import type { Simulation } from '@nxt/sim';
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
 * Drives the simulated robot through its own motors, so it moves exactly as it would
 * under a program: a two-wheel robot by its wheels, a car by its steering motor (which
 * stops at full lock) and its drive motors. See Tools → Robot setup.
 */
export class SimDriver implements MotorDriver {
  readonly kind = 'simulator';
  readonly interval = 20;
  private frame = 0;
  private last = performance.now();

  constructor(private readonly sim: Simulation) {
    const loop = (now: number) => {
      // While a program runs, the simulator moves the robot itself.
      if (!this.busy) this.sim.stepWorld(Math.min(50, now - this.last));
      this.last = now;
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  read(): Promise<(number | null)[]> {
    return Promise.resolve(this.sim.motors.map((m) => m.rotation));
  }

  send(port: Port, power: number, brake: boolean): Promise<void> {
    this.sim.runMotorManually(port, power, brake);
    return Promise.resolve();
  }

  tone(): Promise<void> {
    return Promise.resolve();
  }

  /** The simulator only runs a program or the remote control, not both. */
  get busy(): boolean {
    return this.sim.status === 'running';
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    if (!this.busy) for (const p of [0, 1, 2] as const) this.sim.runMotorManually(p, 0, true);
  }
}
