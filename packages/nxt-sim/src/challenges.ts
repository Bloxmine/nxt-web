import type { World } from './world.js';

/** An area on the mat: a rectangle or a circle (cm). */
export type Zone =
  { x: number; y: number; w: number; h: number } | { x: number; y: number; r: number };

/** A task to solve on a mat, judged while the simulation runs. */
export interface Challenge {
  id: string;
  name: string;
  /** What to do, for the player. */
  description: string;
  /** Mat (scenario id) the challenge is played on. */
  mat: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  /** Seconds allowed. */
  timeLimit: number;
  /** Areas the robot's centre has to pass through, in order. */
  checkpoints?: Zone[];
  /** Where to finish; with `stop`, the robot has to stand still there. */
  goal?: { zone: Zone; stop?: boolean };
  /** Touching a wall loses the challenge (otherwise it only costs points). */
  noTouching?: boolean;
  /** The robot must stay inside this area until the time is up (it wins when it does). */
  stayInside?: Zone;
}

/** Where a challenge run stands. */
export interface ChallengeResult {
  state: 'running' | 'won' | 'lost';
  /** Points so far. */
  score: number;
  /** 1–3 when won, else 0. */
  stars: number;
  /** Checkpoints reached. */
  reached: number;
  /** Times the robot bumped into a wall. */
  bumps: number;
  message: string;
}

/** True when the point is inside the zone. */
export function inZone(zone: Zone, x: number, y: number): boolean {
  return 'r' in zone
    ? Math.hypot(x - zone.x, y - zone.y) <= zone.r
    : x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
}

/** How long the robot has to stand still to count as stopped (ms). */
const STILL_MS = 500;

/**
 * Judges one run of a challenge. Call {@link update} after every bit of simulated time
 * with the robot's world and the simulation clock; it settles on won or lost once.
 */
export class ChallengeJudge {
  private reached = 0;
  private bumps = 0;
  private wasBlocked = false;
  private stillSince = 0;
  private last: { x: number; y: number } | null = null;
  private result: ChallengeResult;

  constructor(readonly challenge: Challenge) {
    this.result = this.make('running', 'Go!');
  }

  /** The verdict so far. */
  get current(): ChallengeResult {
    return this.result;
  }

  /** Looks at the robot at simulated time `timeMs`; `finished` = the program has ended. */
  update(world: World, timeMs: number, finished: boolean): ChallengeResult {
    if (this.result.state !== 'running') return this.result;
    const c = this.challenge;
    const { x, y } = world.pose;
    const checkpoints = c.checkpoints ?? [];

    const blocked = world.blocked || world.touching();
    if (blocked && !this.wasBlocked) this.bumps++;
    this.wasBlocked = blocked;
    if (c.noTouching && this.bumps > 0) return this.end('lost', 'You touched a wall.');

    if (c.stayInside && !inZone(c.stayInside, x, y)) {
      return this.end('lost', 'The robot left the area.');
    }

    const next = checkpoints[this.reached];
    if (next && inZone(next, x, y)) this.reached++;

    if (!this.last || Math.hypot(x - this.last.x, y - this.last.y) > 0.2) {
      this.last = { x, y };
      this.stillSince = timeMs;
    }
    const still = finished || timeMs - this.stillSince >= STILL_MS;

    if (this.reached === checkpoints.length && c.goal && inZone(c.goal.zone, x, y)) {
      if (!c.goal.stop || still) return this.end('won', 'Goal reached!', timeMs);
    }

    if (timeMs >= c.timeLimit * 1000) {
      if (c.stayInside) return this.end('won', 'Still in the ring when the time ran out!', timeMs);
      return this.end('lost', 'Time is up.');
    }
    if (finished && !c.stayInside) return this.end('lost', 'The program ended before the goal.');

    const progress =
      checkpoints.length > 0
        ? `${this.reached}/${checkpoints.length} checkpoints`
        : c.stayInside
          ? 'Stay inside the ring'
          : 'Get to the yellow area';
    this.result = this.make('running', progress);
    return this.result;
  }

  private end(state: 'won' | 'lost', message: string, timeMs = 0): ChallengeResult {
    this.result = this.make(state, message, timeMs);
    return this.result;
  }

  private make(state: ChallengeResult['state'], message: string, timeMs = 0): ChallengeResult {
    const c = this.challenge;
    const left = Math.max(0, c.timeLimit - timeMs / 1000);
    const won = state === 'won';
    const score = Math.max(
      0,
      this.reached * 100 +
        (won ? 300 + (c.stayInside ? 0 : Math.round(left * 5)) : 0) -
        this.bumps * 25,
    );
    // Stars: finishing earns one; a quick or clean run earns more.
    const fraction = c.stayInside ? 1 : left / c.timeLimit;
    const stars = !won ? 0 : 1 + (fraction >= 0.33 ? 1 : 0) + (this.bumps === 0 ? 1 : 0);
    return { state, score, stars, reached: this.reached, bumps: this.bumps, message };
  }
}

/** Challenges on the built-in mats. */
export const CHALLENGES: Challenge[] = [
  {
    id: 'park',
    name: 'Park it',
    description: 'Drive forward and stop with the robot inside the yellow box.',
    mat: 'empty',
    level: 'beginner',
    timeLimit: 15,
    goal: { zone: { x: 150, y: 60, w: 25, h: 30 }, stop: true },
  },
  {
    id: 'wall-stop',
    name: 'Close, but don’t touch',
    description:
      'Drive towards the wall and stop in the box in front of it. Touching the wall loses.',
    mat: 'empty',
    level: 'beginner',
    timeLimit: 20,
    goal: { zone: { x: 172, y: 40, w: 14, h: 70 }, stop: true },
    noTouching: true,
  },
  {
    id: 'square-dance',
    name: 'Square dance',
    description: 'Visit the corners of the square in order and stop back at the start.',
    mat: 'square',
    level: 'intermediate',
    timeLimit: 60,
    checkpoints: [
      { x: 150, y: 30, r: 10 },
      { x: 150, y: 130, r: 10 },
      { x: 50, y: 130, r: 10 },
    ],
    goal: { zone: { x: 50, y: 30, r: 10 }, stop: true },
  },
  {
    id: 'stop-on-red',
    name: 'Stop on red',
    description: 'Drive across the colors and stop with the color sensor on the red band.',
    mat: 'colors',
    level: 'beginner',
    timeLimit: 30,
    // The robot's centre is behind the sensor, so the box starts before the band.
    goal: { zone: { x: 148, y: 0, w: 38, h: 100 }, stop: true },
  },
  {
    id: 'oval-lap',
    name: 'One lap',
    description: 'Follow the line once around the oval, back to where you started.',
    mat: 'oval',
    level: 'intermediate',
    timeLimit: 90,
    checkpoints: [
      { x: 225, y: 80, r: 22 },
      { x: 120, y: 130, r: 22 },
      { x: 15, y: 80, r: 22 },
    ],
    goal: { zone: { x: 110, y: 30, r: 18 } },
  },
  {
    id: 'escape',
    name: 'Escape room',
    description: 'Find the green corner. Every bump into a wall costs points.',
    mat: 'walls',
    level: 'advanced',
    timeLimit: 120,
    goal: { zone: { x: 200, y: 140, w: 40, h: 40 } },
  },
  {
    id: 'sumo-survive',
    name: 'Sumo survivor',
    description: 'Keep moving for 30 seconds without leaving the ring.',
    mat: 'sumo',
    level: 'intermediate',
    timeLimit: 30,
    stayInside: { x: 90, y: 90, r: 80 },
  },
];

/** A challenge by id. */
export function challengeById(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
