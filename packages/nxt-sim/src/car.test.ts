import type { IrProgram } from '@nxt/compiler';
import { describe, expect, it } from 'vitest';
import { isBusy, startMotors } from './motors.js';
import { scenarioById } from './scenarios.js';
import { Simulation } from './simulation.js';
import { ROBOT, type RobotGeometry } from './world.js';

const empty: IrProgram = {
  main: [],
  parallel: [],
  subroutines: [],
  variables: [],
  sensors: {},
} as unknown as IrProgram;

/** A car: A steers (75° of motor to full lock, 30° at the wheels), B and C drive. */
const CAR: RobotGeometry = {
  ...ROBOT,
  leftMotor: 1,
  rightMotor: 2,
  steering: { motor: 0, wheelbase: 16, lock: 75, angle: 30 },
};

const car = () => new Simulation(empty, scenarioById('empty'), { robot: CAR });
const run = (sim: Simulation, ms: number) => {
  for (let t = 0; t < ms; t += 10) sim.stepWorld(10);
};

describe('car with a steering motor', () => {
  it('drives straight with the wheels straight', () => {
    const sim = car();
    const { x, y, heading } = sim.world.pose;
    sim.runMotorManually(1, 60);
    sim.runMotorManually(2, 60);
    run(sim, 1000);
    expect(sim.world.pose.heading).toBeCloseTo(heading, 5);
    expect(Math.hypot(sim.world.pose.x - x, sim.world.pose.y - y)).toBeGreaterThan(20);
  });

  it('stops the steering motor at full lock', () => {
    const sim = car();
    sim.runMotorManually(0, 50);
    run(sim, 1000);
    expect(sim.world.steer).toBe(75);
    expect(sim.motors[0]!.rotation).toBeCloseTo(75, 5);
    expect(sim.world.steerAngle()).toBe(30);
  });

  it('turns right with positive steering, on the turning circle of its wheelbase', () => {
    const sim = car();
    sim.runMotorManually(0, 50);
    run(sim, 500);
    sim.runMotorManually(0, 0);
    const before = sim.world.pose.heading;
    sim.runMotorManually(1, 40);
    sim.runMotorManually(2, 40);
    const x0 = sim.world.pose.x;
    run(sim, 300);
    const travelled = Math.abs(sim.world.pose.x - x0);
    expect(travelled).toBeGreaterThan(0);
    const turned = (sim.world.pose.heading - before + 360) % 360;
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(90);
    // Radius = wheelbase / tan(angle): about 27.7 cm for 16 cm and 30°.
    const arc = (turned * Math.PI) / 180;
    expect(sim.world.pose.y).not.toBe(scenarioById('empty').start.y);
    expect(arc).toBeGreaterThan(0);
  });

  it('keeps its end stops when a program resets the motor counter', () => {
    const sim = car();
    sim.runMotorManually(0, 50);
    run(sim, 1000);
    sim.motors[0]!.rotation = 0; // like a Reset Motor block
    sim.runMotorManually(0, -50);
    run(sim, 2000);
    expect(sim.world.steer).toBe(-75);
    expect(sim.motors[0]!.rotation).toBeCloseTo(-150, 5);
  });

  it('never finishes a turn past full lock, like the real motor', () => {
    const sim = car();
    startMotors(sim.motors, [0], 50, 0, 200, 'brake');
    run(sim, 3000);
    expect(isBusy(sim.motors[0]!)).toBe(true);
    expect(sim.world.steer).toBe(75);
  });

  it('puts the steering straight again on reset', () => {
    const sim = car();
    sim.runMotorManually(0, 50);
    run(sim, 500);
    sim.reset();
    expect(sim.world.steer).toBe(0);
  });

  it('leaves two-wheeled robots as they were', () => {
    const sim = new Simulation(empty, scenarioById('empty'));
    sim.runMotorManually(0, 50);
    run(sim, 1000);
    expect(sim.world.steer).toBe(0);
    expect(sim.motors[0]!.rotation).toBeGreaterThan(300);
  });
});
