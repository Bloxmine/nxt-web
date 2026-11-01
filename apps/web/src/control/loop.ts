/**
 * Runs the remote control: reads the motors, asks the engine what to do and sends it,
 * many times a second. Also centres motors and finds a motor's end stops.
 */
import { ControlEngine, towards, type Outputs } from './engine';
import type { MotorDriver } from './driver';
import { limitsOf, PORTS, type Port, type Profile } from './profile';

export interface LoopState {
  outputs: Outputs | null;
  /** Positions from each motor's centre (degrees), or null when not read. */
  positions: (number | null)[];
  error: string | null;
  /** What a calibration is doing, if one runs. */
  busy: string | null;
}

/** Where each brick's motors were centred, kept while the page is open. */
const centres = new WeakMap<object, (number | null)[]>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ControlLoop {
  readonly engine: ControlEngine;
  private running = false;
  private paused = false;
  /** The control step in progress, so a calibration can wait for it. */
  private current: Promise<void> = Promise.resolve();
  private sent: (string | null)[] = [null, null, null];
  private lastTone = 0;
  private tick = 0;
  private zero: (number | null)[];
  private raw: (number | null)[] = [null, null, null];
  private state: LoopState = {
    outputs: null,
    positions: [null, null, null],
    error: null,
    busy: null,
  };

  constructor(
    private readonly driver: MotorDriver,
    private profile: Profile,
    /** The inputs held now, with how far each is pressed. */
    private readonly held: () => ReadonlyMap<string, number>,
    private readonly onUpdate: (state: LoopState) => void,
    /** Identifies the brick or simulation, to remember its centres. */
    owner: object,
  ) {
    this.engine = new ControlEngine(profile);
    driver.setProfile?.(profile);
    const known = centres.get(owner);
    this.zero = known ?? [null, null, null];
    if (!known) centres.set(owner, this.zero);
  }

  setProfile(profile: Profile): void {
    this.profile = profile;
    this.engine.setProfile(profile);
    this.driver.setProfile?.(profile);
    this.sent = [null, null, null];
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.run();
  }

  /** Stops the loop and every motor. */
  async stop(): Promise<void> {
    this.running = false;
    await this.stopMotors();
  }

  /** Position (degrees from the centre, in the motor's own direction) from a raw reading. */
  private logical(port: Port, raw: number | null): number | null {
    const zero = this.zero[port];
    if (raw === null || zero === null || zero === undefined) return null;
    const v = raw - zero;
    return this.profile.motors[port].reversed ? -v : v;
  }

  private physical(port: Port, power: number): number {
    return this.profile.motors[port].reversed ? -power : power;
  }

  /** Ports whose position matters every step: limits, targets and car steering. */
  private needed(): Port[] {
    return PORTS.filter((p) => limitsOf(this.profile, p) !== null || this.isSteer(p));
  }

  private isSteer(p: Port): boolean {
    const s = this.profile.steering;
    return s.kind === 'car' && s.steer === p;
  }

  private async run(): Promise<void> {
    while (this.running) {
      const started = performance.now();
      if (!this.paused) {
        try {
          this.current = this.step(started);
          await this.current;
        } catch (e) {
          this.running = false;
          this.update({ error: e instanceof Error ? e.message : String(e) });
          return;
        }
      }
      await sleep(Math.max(0, this.driver.interval - (performance.now() - started)));
    }
  }

  private async step(now: number): Promise<void> {
    this.tick += 1;
    // Positions that matter every step; the others every few steps for the display.
    const ports =
      this.driver.kind === 'simulator' || this.tick % 5 === 1 ? [...PORTS] : this.needed();
    const raw = await this.driver.read(ports);
    for (const p of ports) {
      this.raw[p] = raw[p] ?? null;
      // The first reading of a motor is its centre, until it is set by hand.
      if (this.zero[p] === null && this.raw[p] !== null) this.zero[p] = this.raw[p];
    }
    const positions = PORTS.map((p) => this.logical(p, this.raw[p]!));
    const outputs = this.engine.tick(this.held(), positions, now);
    const targets = outputs.targets;
    for (const p of PORTS) {
      const cmd = outputs.ports[p];
      const power = this.physical(p, cmd.power);
      const key = `${power},${cmd.brake}`;
      if (key === this.sent[p]) continue;
      this.sent[p] = key;
      // Steering and turning to a position work better without speed regulation.
      const regulated = targets[p] === null && limitsOf(this.profile, p) === null;
      await this.driver.send(p, power, cmd.brake, regulated);
    }
    if (outputs.tone !== null && now - this.lastTone > 200) {
      this.lastTone = now;
      await this.driver.tone(outputs.tone, 250);
    }
    this.update({ outputs, positions, error: null });
  }

  private update(patch: Partial<LoopState>): void {
    this.state = { ...this.state, ...patch };
    this.onUpdate(this.state);
  }

  private async stopMotors(): Promise<void> {
    for (const p of PORTS) {
      try {
        await this.driver.send(p, 0, this.profile.motors[p].release === 'brake', true);
      } catch {
        // The brick may be gone already.
      }
    }
    this.sent = [null, null, null];
  }

  /** Sets the driving speed (%) until a speed key changes it. */
  setSpeed(speed: number): void {
    this.engine.speed = Math.max(10, Math.min(100, speed));
  }

  /** Makes a motor's current position its centre. */
  setCentre(port: Port): void {
    this.zero[port] = this.raw[port] ?? null;
  }

  /** Runs a motor briefly by hand (the nudge buttons), ignoring its limits. */
  async nudge(port: Port, power: number, ms = 150): Promise<void> {
    await this.exclusive('Moving…', async () => {
      await this.driver.send(port, this.physical(port, power), true, false);
      await sleep(ms);
      await this.driver.send(port, 0, true, false);
    });
  }

  /**
   * Finds a motor's end stops: turns it slowly one way until it stops moving, then the
   * other way, centres it between them and returns how far it can turn each way
   * (a few degrees short of the ends). Throws when it can't find an end.
   */
  async findEnds(port: Port, power = 25): Promise<number> {
    return this.exclusive('Finding the ends…', async () => {
      const ends: number[] = [];
      for (const direction of [-1, 1]) {
        await this.driver.send(port, direction * power, true, false);
        const begin = performance.now();
        let last = (await this.driver.read([port]))[port] ?? 0;
        let moved = performance.now();
        for (;;) {
          await sleep(50);
          const now = performance.now();
          const at = (await this.driver.read([port]))[port] ?? last;
          if (Math.abs(at - last) >= 2) {
            last = at;
            moved = now;
          }
          if (now - moved > 400 && now - begin > 300) break;
          if (now - begin > 6000) {
            await this.driver.send(port, 0, true, false);
            throw new Error(
              'The motor kept turning and found no end. Is it free to spin? The limits are unchanged.',
            );
          }
        }
        await this.driver.send(port, 0, true, false);
        ends.push(last);
        await sleep(150);
      }
      const [a, b] = ends as [number, number];
      const half = Math.abs(b - a) / 2;
      if (half < 10)
        throw new Error('The motor hardly moved. Is it blocked? The limits are unchanged.');
      this.zero[port] = (a + b) / 2;
      this.raw[port] = b;
      // Back to the middle.
      const begin = performance.now();
      for (;;) {
        const raw = (await this.driver.read([port]))[port];
        const pos = this.logical(port, raw ?? null) ?? 0;
        const power = towards(0, pos, 40);
        await this.driver.send(port, this.physical(port, power), true, false);
        if (power === 0 || performance.now() - begin > 3000) break;
        await sleep(40);
      }
      await this.driver.send(port, 0, true, false);
      return Math.max(5, Math.floor(half - 8));
    });
  }

  private async exclusive<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.paused = true;
    this.update({ busy: label });
    await this.current.catch(() => {});
    try {
      return await fn();
    } finally {
      this.sent = [null, null, null];
      this.paused = false;
      this.update({ busy: null });
    }
  }
}
