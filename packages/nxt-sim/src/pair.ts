import { STEP_MS, type Simulation } from './simulation.js';
import type { Pose, Scenario } from './world.js';

/**
 * Two simulated bricks on one mat, connected over Bluetooth: `master` sends to the slave
 * on connection 1, and `slave` sends to the master on connection 0, as on real bricks.
 * Each robot is solid to the other and seen by its ultrasonic sensor.
 */
export class BrickPair {
  private readonly unlink: (() => void)[];

  constructor(
    readonly master: Simulation,
    readonly slave: Simulation,
  ) {
    master.world.others = [slave.world];
    slave.world.others = [master.world];
    this.unlink = [
      master.on((e) => {
        if (e.type === 'message' && e.connection === 1) slave.receive(e.mailbox, e.value);
      }),
      slave.on((e) => {
        if (e.type === 'message' && e.connection === 0) master.receive(e.mailbox, e.value);
      }),
    ];
  }

  /** Starts both programs. */
  start(): void {
    this.master.start();
    this.slave.start();
  }

  /**
   * Runs both bricks side by side in small slices, so their robots and messages stay in
   * step. Stops when the master pauses (breakpoint or single step); the slave keeps going
   * after the master's program has finished.
   */
  advance(ms: number): void {
    for (let left = ms; left > 0; left -= STEP_MS) {
      const slice = Math.min(STEP_MS, left);
      if (this.master.status === 'paused' || this.master.status === 'ready') return;
      if (this.master.status === 'running') this.master.advance(slice);
      else this.master.stepWorld(slice);
      if (this.slave.status === 'running') this.slave.advance(slice);
      else this.slave.stepWorld(slice);
      if (this.master.status !== 'running' && this.slave.status !== 'running') return;
    }
  }

  /** Disconnects the bricks. */
  dispose(): void {
    for (const off of this.unlink) off();
    this.master.world.others = [];
    this.slave.world.others = [];
  }
}

/**
 * Where the second robot starts: the mat's `start2`, or 30 cm beside the first robot
 * (on whichever side has more room), facing the same way.
 */
export function secondStart(scenario: Scenario): Pose {
  if (scenario.start2) return scenario.start2;
  const { x, y, heading } = scenario.start;
  const h = (heading * Math.PI) / 180;
  const side = (d: number): Pose => ({
    x: x - d * Math.sin(h),
    y: y + d * Math.cos(h),
    heading,
  });
  const inside = (p: Pose) => Math.min(p.x, p.y, scenario.width - p.x, scenario.height - p.y);
  const right = side(30);
  const left = side(-30);
  return inside(right) >= inside(left) ? right : left;
}
