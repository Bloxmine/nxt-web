import type { SensorKind } from '@nxt/compiler';

/**
 * The world the simulated robot drives in: a mat (coloured shapes the light and color
 * sensors see) plus walls (which stop the robot, press the touch sensor and reflect the
 * ultrasonic sensor). Units are centimetres; x grows to the right, y grows downwards,
 * headings are degrees clockwise from the +x axis (screen convention).
 */

/** Something printed on the mat. Later shapes are drawn on top of earlier ones. */
export type MatShape =
  | { type: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { type: 'circle'; x: number; y: number; r: number; color: string }
  /** A tape line through the points, `width` cm wide. Set `closed` to join the ends. */
  | { type: 'path'; points: [number, number][]; width: number; color: string; closed?: boolean }
  /**
   * A picture (such as a photo of a real mat) covering `w` × `h` cm, as `cols` × `rows`
   * pixels in rows from the top, each 0xRRGGBB.
   */
  | {
      type: 'bitmap';
      x: number;
      y: number;
      w: number;
      h: number;
      cols: number;
      rows: number;
      pixels: number[];
    };

/** A solid obstacle. */
export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A starting position. */
export interface Pose {
  x: number;
  y: number;
  /** Degrees clockwise from the +x axis. */
  heading: number;
}

/** A complete mat: what is printed on it, the walls and where the robot starts. */
export interface Scenario {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  /** Colour of the mat where no shape is printed. */
  background: string;
  shapes: MatShape[];
  walls: Wall[];
  /** True when the mat has a fence around it (walls on all four edges). */
  fenced: boolean;
  start: Pose;
  /** Where a second robot starts (two simulated bricks); beside the first by default. */
  start2?: Pose;
}

/** How the simulated robot is built. Lengths in cm, measured from the wheel axle. */
export interface RobotGeometry {
  wheelRadius: number;
  /** Distance between the wheels. */
  axle: number;
  /** Collision radius around the centre; keep it below `bumperOffset`. */
  radius: number;
  lightOffset: number;
  sonarOffset: number;
  bumperOffset: number;
  /** Motor index (0 = A, 1 = B, 2 = C) driving the left wheel and the right wheel. */
  leftMotor: 0 | 1 | 2;
  rightMotor: 0 | 1 | 2;
}

/** Robot dimensions, matching a typical two-wheeled NXT driving base. */
export const ROBOT: RobotGeometry = {
  /** Wheel radius (cm): the standard NXT tyre is 5.6 cm across. */
  wheelRadius: 2.8,
  /** Distance between the wheels (cm), as on the usual NXT 2.0 driving base. */
  axle: 14,
  /** Collision radius around the centre (cm). */
  radius: 8,
  /** Light/color sensor: how far ahead of the centre it looks at the mat (cm). */
  lightOffset: 7,
  /** Ultrasonic sensor: distance from the centre to the sensor (cm). */
  sonarOffset: 6,
  /** Touch sensor bumper: how far ahead of the centre it reaches (cm). */
  bumperOffset: 9.5,
  /** Motor B drives the left wheel, motor C the right one. */
  leftMotor: 1,
  rightMotor: 2,
};

/** The six colors the NXT 2.0 color sensor reports, in its numbering (1–6). */
export const NXT_COLORS = ['black', 'blue', 'green', 'yellow', 'red', 'white'] as const;
const COLOR_RGB: [number, number, number][] = [
  [20, 20, 20],
  [30, 80, 200],
  [30, 160, 60],
  [245, 210, 30],
  [210, 30, 30],
  [245, 245, 245],
];

/** Mat colours by name; any CSS hex colour (#rgb or #rrggbb) also works. */
export const MAT_COLORS: Record<string, string> = {
  black: '#141414',
  blue: '#1e50c8',
  green: '#1ea03c',
  yellow: '#f5d21e',
  red: '#d21e1e',
  white: '#f5f5f5',
  grey: '#9a9a9a',
};

/** RGB (0–255) of a mat colour name or hex string. */
export function rgbOf(color: string): [number, number, number] {
  const hex = (MAT_COLORS[color] ?? color).replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Closest of the six NXT colors (1 black … 6 white) to an RGB value. */
export function classifyColor([r, g, b]: [number, number, number]): number {
  let best = 0;
  let bestDistance = Infinity;
  COLOR_RGB.forEach(([cr, cg, cb], i) => {
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best + 1;
}

function distanceToSegment(px: number, py: number, a: [number, number], b: [number, number]) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideShape(shape: MatShape, x: number, y: number): boolean {
  switch (shape.type) {
    case 'rect':
    case 'bitmap':
      return x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h;
    case 'circle':
      return Math.hypot(x - shape.x, y - shape.y) <= shape.r;
    case 'path': {
      const pts = shape.points;
      const count = shape.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < count; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        if (distanceToSegment(x, y, a, b) <= shape.width / 2) return true;
      }
      return false;
    }
  }
}

/** Colour of the mat at a point; off the mat is the dark floor. */
export function matColorAt(scenario: Scenario, x: number, y: number): string {
  if (x < 0 || y < 0 || x > scenario.width || y > scenario.height) return '#303030';
  for (let i = scenario.shapes.length - 1; i >= 0; i--) {
    const shape = scenario.shapes[i]!;
    if (!insideShape(shape, x, y)) continue;
    if (shape.type !== 'bitmap') return shape.color;
    const col = Math.min(shape.cols - 1, Math.floor(((x - shape.x) / shape.w) * shape.cols));
    const row = Math.min(shape.rows - 1, Math.floor(((y - shape.y) / shape.h) * shape.rows));
    return `#${(shape.pixels[row * shape.cols + col] ?? 0x808080).toString(16).padStart(6, '0')}`;
  }
  return scenario.background;
}

/** Walls including the fence, if the mat has one. */
export function solidWalls(scenario: Scenario): Wall[] {
  if (!scenario.fenced) return scenario.walls;
  const { width: w, height: h } = scenario;
  const t = 50;
  return [
    ...scenario.walls,
    { x: -t, y: -t, w: w + 2 * t, h: t },
    { x: -t, y: h, w: w + 2 * t, h: t },
    { x: -t, y: 0, w: t, h },
    { x: w, y: 0, w: t, h },
  ];
}

function circleHitsWall(x: number, y: number, r: number, wall: Wall): boolean {
  const nx = Math.max(wall.x, Math.min(x, wall.x + wall.w));
  const ny = Math.max(wall.y, Math.min(y, wall.y + wall.h));
  return Math.hypot(x - nx, y - ny) < r;
}

function pointInWall(x: number, y: number, wall: Wall): boolean {
  return x >= wall.x && x <= wall.x + wall.w && y >= wall.y && y <= wall.y + wall.h;
}

/** Distance along a ray to the nearest wall, or Infinity. */
function rayToWall(x: number, y: number, angle: number, wall: Wall): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let tMin = 0;
  let tMax = Infinity;
  for (const [p, d, lo, hi] of [
    [x, dx, wall.x, wall.x + wall.w],
    [y, dy, wall.y, wall.y + wall.h],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return Infinity;
      continue;
    }
    let t1 = (lo - p) / d;
    let t2 = (hi - p) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }
  return tMin;
}

/** Distance along a ray to a circle, or Infinity. */
function rayToCircle(x: number, y: number, angle: number, cx: number, cy: number, r: number) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const fx = x - cx;
  const fy = y - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : c <= 0 ? 0 : Infinity;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** The robot in its world: pose, collisions and what each sensor sees. */
export class World {
  pose: Pose;
  /** True while the robot is pushing against a wall. */
  blocked = false;
  /** Sound sensor level (0–100), set from the user interface. */
  soundLevel = 0;
  /** Where the robot has been, for drawing its trail. */
  readonly trail: [number, number][] = [];
  /** Other robots on the same mat (two simulated bricks): solid, and seen by the sonar. */
  others: World[] = [];
  private readonly walls: Wall[];

  constructor(
    readonly scenario: Scenario,
    readonly robot: RobotGeometry = ROBOT,
    /** Where this robot starts (the mat's start by default). */
    readonly start: Pose = scenario.start,
  ) {
    this.pose = { ...start };
    this.walls = solidWalls(scenario);
    this.trail.push([this.pose.x, this.pose.y]);
  }

  /** Puts the robot back at the start. */
  reset(): void {
    this.pose = { ...this.start };
    this.blocked = false;
    this.trail.length = 0;
    this.trail.push([this.pose.x, this.pose.y]);
  }

  /** Point `distance` cm ahead of the robot's centre, `side` cm to its right. */
  ahead(distance: number, side = 0): [number, number] {
    const h = rad(this.pose.heading);
    return [
      this.pose.x + distance * Math.cos(h) - side * Math.sin(h),
      this.pose.y + distance * Math.sin(h) + side * Math.cos(h),
    ];
  }

  /**
   * Moves the robot by its wheel rotations (degrees turned by the left and right wheel
   * since the last call). Movement into a wall is cancelled; turning on the spot is not.
   */
  drive(leftDegrees: number, rightDegrees: number): void {
    const { robot } = this;
    const dl = rad(leftDegrees) * robot.wheelRadius;
    const dr = rad(rightDegrees) * robot.wheelRadius;
    const distance = (dl + dr) / 2;
    const turn = ((dl - dr) / robot.axle) * (180 / Math.PI);
    const mid = rad(this.pose.heading + turn / 2);
    const x = this.pose.x + distance * Math.cos(mid);
    const y = this.pose.y + distance * Math.sin(mid);
    const heading = (((this.pose.heading + turn) % 360) + 360) % 360;
    const hits =
      this.walls.some((w) => circleHitsWall(x, y, robot.radius, w)) ||
      this.others.some(
        (o) =>
          Math.hypot(o.pose.x - x, o.pose.y - y) < o.robot.radius + robot.radius &&
          Math.hypot(o.pose.x - x, o.pose.y - y) <
            Math.hypot(o.pose.x - this.pose.x, o.pose.y - this.pose.y),
      );
    this.blocked = hits && Math.abs(distance) > 1e-6;
    this.pose = hits ? { ...this.pose, heading } : { x, y, heading };
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last[0] - this.pose.x, last[1] - this.pose.y) > 1) {
      this.trail.push([this.pose.x, this.pose.y]);
      if (this.trail.length > 4000) this.trail.shift();
    }
  }

  /** True when the front bumper touches a wall. */
  touching(): boolean {
    return [-4, 0, 4].some((side) => {
      const [x, y] = this.ahead(this.robot.bumperOffset, side);
      return (
        this.walls.some((w) => pointInWall(x, y, w)) ||
        this.others.some((o) => Math.hypot(o.pose.x - x, o.pose.y - y) <= o.robot.radius)
      );
    });
  }

  /** Ultrasonic distance in cm (0–255) to the nearest wall in a narrow cone ahead. */
  distance(): number {
    const [x, y] = this.ahead(this.robot.sonarOffset);
    let best = Infinity;
    for (const spread of [-10, -5, 0, 5, 10]) {
      const angle = rad(this.pose.heading + spread);
      for (const wall of this.walls) best = Math.min(best, rayToWall(x, y, angle, wall));
      for (const o of this.others) {
        best = Math.min(best, rayToCircle(x, y, angle, o.pose.x, o.pose.y, o.robot.radius));
      }
    }
    return Math.max(0, Math.min(255, Math.round(best)));
  }

  /** Colour under the light/color sensor. */
  colorUnderSensor(): [number, number, number] {
    const [x, y] = this.ahead(this.robot.lightOffset);
    return rgbOf(matColorAt(this.scenario, x, y));
  }

  /** What a sensor of the given kind reads right now, in NXT-G units. */
  read(kind: SensorKind): number {
    switch (kind) {
      case 'touch':
        return this.touching() ? 1 : 0;
      case 'ultrasonic':
        return this.distance();
      case 'soundDb':
      case 'soundDba':
        return Math.round(this.soundLevel);
      case 'colorFull':
        return classifyColor(this.colorUnderSensor());
      default: {
        const [r, g, b] = this.colorUnderSensor().map((c) => c / 255) as [number, number, number];
        const luminance = 0.3 * r + 0.59 * g + 0.11 * b;
        switch (kind) {
          case 'lightActive':
            return Math.round(22 + 40 * luminance);
          case 'lightAmbient':
            return Math.round(8 + 30 * luminance);
          case 'colorRed':
            return Math.round(8 + 70 * r);
          case 'colorGreen':
            return Math.round(8 + 70 * g);
          case 'colorBlue':
            return Math.round(8 + 70 * b);
          case 'colorNone':
            return Math.round(5 + 25 * luminance);
        }
      }
    }
  }
}
