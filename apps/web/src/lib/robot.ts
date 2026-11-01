import type { RobotGeometry } from '@nxt/sim';

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
  /** Motor on the left wheel and on the right wheel (a car's rear wheels). */
  left: 'A' | 'B' | 'C';
  right: 'A' | 'B' | 'C';
  /** Two driven wheels (or tracks) that steer by speed, or a car with steered front wheels. */
  kind: 'wheels' | 'car';
  /** Car: the motor that turns the front wheels. */
  steer: 'A' | 'B' | 'C';
  /** Car: distance from the rear axle to the front axle, in cm. */
  wheelbase: number;
  /** Car: how far the steering motor turns from straight ahead to full lock, in degrees. */
  steerLock: number;
  /** Car: how far the front wheels turn at full lock, in degrees. */
  steerAngle: number;
}

export const DEFAULT_ROBOT: RobotSetup = {
  wheelDiameter: 5.6,
  track: 14,
  lightOffset: 7,
  sonarOffset: 6,
  bumperOffset: 9.5,
  left: 'B',
  right: 'C',
  kind: 'wheels',
  steer: 'A',
  wheelbase: 16,
  steerLock: 75,
  steerAngle: 30,
};

/**
 * A starting point for a car: motor A steers, B and C drive the rear wheels, and the
 * sensors sit at the front. Measure your own car and adjust.
 */
export const CAR_ROBOT: RobotSetup = {
  ...DEFAULT_ROBOT,
  kind: 'car',
  track: 12,
  lightOffset: 20,
  sonarOffset: 20,
  bumperOffset: 23,
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

/** Fired on `window` when the robot setup is saved, so the simulator can rebuild. */
export const ROBOT_CHANGED = 'nxt-robot-changed';

export function saveRobot(robot: RobotSetup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(robot));
  } catch {
    // A preference only.
  }
  window.dispatchEvent(new Event(ROBOT_CHANGED));
}

const MOTOR_INDEX = { A: 0, B: 1, C: 2 } as const;

/** The simulator's robot for a setup. */
export function robotGeometry(robot: RobotSetup): RobotGeometry {
  const car = robot.kind === 'car';
  // A car also has a collision circle on its front axle.
  const front = car ? Math.max(1, robot.wheelbase) : 0;
  const geometry: RobotGeometry = {
    wheelRadius: robot.wheelDiameter / 2,
    axle: robot.track,
    // The bumper has to reach past the collision circle to be pressed.
    radius: Math.max(3, Math.min(robot.track / 2 + 1, robot.bumperOffset - front - 1.5)),
    lightOffset: robot.lightOffset,
    sonarOffset: robot.sonarOffset,
    bumperOffset: robot.bumperOffset,
    leftMotor: MOTOR_INDEX[robot.left],
    rightMotor: MOTOR_INDEX[robot.right],
  };
  if (car)
    geometry.steering = {
      motor: MOTOR_INDEX[robot.steer],
      wheelbase: front,
      lock: Math.max(1, robot.steerLock),
      angle: Math.max(1, Math.min(60, robot.steerAngle)),
    };
  return geometry;
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
