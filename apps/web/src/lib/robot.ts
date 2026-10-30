/**
 * The robot's build (Tools → Robot setup): used by the distance and turn calculator and
 * by the simulator. Remembered per browser.
 */
export interface RobotSetup {
  /** Wheel diameter in cm (NXT 1.0 tyre 5.6, NXT 2.0 tyre 4.32). */
  wheelDiameter: number;
  /** Distance between the two wheels' centres, in cm. */
  track: number;
  /** How far ahead of the wheel axle the light/color sensor looks, in cm. */
  lightOffset: number;
  /** How far ahead of the axle the ultrasonic sensor is, in cm. */
  sonarOffset: number;
  /** How far ahead of the axle the touch sensor bumper reaches, in cm. */
  bumperOffset: number;
  /** Motor on the left wheel and on the right wheel. */
  left: 'A' | 'B' | 'C';
  right: 'A' | 'B' | 'C';
}

export const DEFAULT_ROBOT: RobotSetup = {
  wheelDiameter: 5.6,
  track: 14,
  lightOffset: 7,
  sonarOffset: 6,
  bumperOffset: 9.5,
  left: 'B',
  right: 'C',
};

export const WHEEL_PRESETS: [string, number][] = [
  ['NXT 1.0 wheel (56 mm)', 5.6],
  ['NXT 2.0 wheel (43.2 mm)', 4.32],
  ['Large balloon tyre (81.6 mm)', 8.16],
  ['Small wheel (30 mm)', 3],
];

const KEY = 'nxt-web-studio:robot';

export function loadRobot(): RobotSetup {
  try {
    return {
      ...DEFAULT_ROBOT,
      ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<RobotSetup>),
    };
  } catch {
    return DEFAULT_ROBOT;
  }
}

export function saveRobot(robot: RobotSetup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(robot));
  } catch {
    // A preference only.
  }
}

/** Wheel degrees to drive `cm` straight. */
export function degreesForDistance(cm: number, robot: RobotSetup): number {
  return (cm / (Math.PI * robot.wheelDiameter)) * 360;
}

/**
 * Wheel degrees to turn the robot by `angle` degrees: a spin turn (steering 100, wheels
 * turn opposite ways around the centre) or a pivot turn (steering 50, one wheel still).
 */
export function degreesForTurn(angle: number, robot: RobotSetup, kind: 'spin' | 'pivot'): number {
  const radius = kind === 'spin' ? robot.track / 2 : robot.track;
  const arc = (Math.abs(angle) / 360) * 2 * Math.PI * radius;
  return (arc / (Math.PI * robot.wheelDiameter)) * 360;
}
