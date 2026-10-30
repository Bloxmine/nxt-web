import { EXAMPLES, lowerProgram } from '@nxt/blocks';
import type { IrProgram, Stmt } from '@nxt/compiler';
import { describe, expect, it } from 'vitest';
import { CHALLENGES, ChallengeJudge, challengeById, inZone } from './challenges.js';
import { BrickPair, secondStart } from './pair.js';
import { scenarioById } from './scenarios.js';
import { Simulation } from './simulation.js';
import { matColorAt, ROBOT, type Scenario } from './world.js';

const ir = (main: Stmt[], extra: Partial<IrProgram> = {}): IrProgram => ({
  variables: [],
  sensors: {},
  subroutines: [],
  main,
  parallel: [],
  ...extra,
});
const n = (value: number) => ({ kind: 'number', value }) as const;
const forward = (degrees: number): Stmt => ({
  kind: 'motor',
  ports: [1, 2],
  power: n(50),
  turnRatio: n(0),
  degrees: n(degrees),
  then: 'brake',
  regulated: true,
  wait: true,
});

describe('robot setup', () => {
  it('drives further with bigger wheels and uses the chosen motors', () => {
    const drive = (wheelRadius: number) => {
      const sim = new Simulation(ir([forward(360)]), scenarioById('empty'), {
        robot: { ...ROBOT, wheelRadius },
      });
      sim.start();
      sim.advance(5000);
      return sim.world.pose.x - 100;
    };
    expect(drive(2.8)).toBeCloseTo(2 * Math.PI * 2.8, 0);
    expect(drive(4)).toBeCloseTo(2 * Math.PI * 4, 0);

    const onA = new Simulation(
      ir([{ ...forward(360), ports: [0, 2] } as Stmt]),
      scenarioById('empty'),
      {
        robot: { ...ROBOT, leftMotor: 0 },
      },
    );
    onA.start();
    onA.advance(5000);
    expect(onA.world.pose.x - 100).toBeCloseTo(2 * Math.PI * 2.8, 0);
    expect(onA.world.pose.heading).toBeCloseTo(0, 0);
  });

  it('reads colours from a picture on the mat', () => {
    const mat: Scenario = {
      ...scenarioById('empty'),
      shapes: [
        {
          type: 'bitmap',
          x: 0,
          y: 0,
          w: 20,
          h: 10,
          cols: 2,
          rows: 1,
          pixels: [0xff0000, 0x0000ff],
        },
      ],
    };
    expect(matColorAt(mat, 5, 5)).toBe('#ff0000');
    expect(matColorAt(mat, 15, 5)).toBe('#0000ff');
    expect(matColorAt(mat, 25, 5)).toBe(mat.background);
  });
});

describe('two bricks', () => {
  it('passes messages over connection 1 (master → slave) and 0 (slave → master)', () => {
    const scenario = scenarioById('empty');
    const master = new Simulation(
      ir(
        [
          { kind: 'messageWrite', connection: 1, mailbox: n(2), valueType: 'number', value: n(42) },
          { kind: 'waitUntil', condition: { kind: 'var', name: 'got' } },
          { kind: 'messageRead', mailbox: n(3), valueType: 'number', target: 'x', received: 'got' },
        ],
        {
          variables: [
            { name: 'x', type: 'number' },
            { name: 'got', type: 'boolean' },
          ],
        },
      ),
      scenario,
    );
    const slave = new Simulation(
      ir(
        [
          { kind: 'wait', ms: n(20) },
          { kind: 'messageRead', mailbox: n(2), valueType: 'number', target: 'x', received: 'r' },
          {
            kind: 'messageWrite',
            connection: 0,
            mailbox: n(3),
            valueType: 'number',
            value: { kind: 'var', name: 'x' },
          },
        ],
        {
          variables: [
            { name: 'x', type: 'number' },
            { name: 'r', type: 'boolean' },
          ],
        },
      ),
      scenario,
      { start: secondStart(scenario) },
    );
    // The master's own mailbox 3 is filled by the slave; peek before it is read.
    const pair = new BrickPair(master, slave);
    pair.start();
    pair.advance(100);
    expect(slave.variables().get('x')).toBe(42);
    expect(master.status).not.toBe('error');
    pair.dispose();
    expect(master.world.others).toEqual([]);
  });

  it('robots bump into and see each other', () => {
    const scenario = scenarioById('empty');
    const ahead = { x: 140, y: 75, heading: 0 };
    const a = new Simulation(ir([forward(3600)]), scenario);
    const b = new Simulation(ir([]), { ...scenario, start2: ahead }, { start: ahead });
    const pair = new BrickPair(a, b);
    expect(a.world.distance()).toBeLessThan(40);
    pair.start();
    pair.advance(6000);
    expect(a.world.pose.x).toBeLessThan(140 - 15);
    expect(a.world.touching()).toBe(true);
  });

  it('puts the second robot beside the first, on the mat', () => {
    for (const id of ['empty', 'square', 'oval', 'walls', 'colors', 'sumo', 'barcode']) {
      const sc = scenarioById(id);
      const p = secondStart(sc);
      expect(Math.hypot(p.x - sc.start.x, p.y - sc.start.y)).toBeCloseTo(30);
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeGreaterThan(0);
    }
  });
});

describe('challenges', () => {
  const play = (challengeId: string, exampleKey: string, ms: number) => {
    const challenge = challengeById(challengeId)!;
    const ex = EXAMPLES.find((e) => e.key === exampleKey)!;
    const sim = new Simulation(lowerProgram(ex.create()), scenarioById(challenge.mat), { seed: 1 });
    const judge = new ChallengeJudge(challenge);
    sim.start();
    for (let t = 0; t < ms && judge.current.state === 'running'; t += 50) {
      sim.advance(50);
      judge.update(sim.world, sim.time, sim.status === 'finished');
    }
    return judge.current;
  };

  it('every challenge is on a known mat with a reachable goal', () => {
    for (const c of CHALLENGES) {
      const mat = scenarioById(c.mat);
      expect(mat.id).toBe(c.mat);
      expect(c.goal ?? c.stayInside).toBeDefined();
      if (c.stayInside) expect(inZone(c.stayInside, mat.start.x, mat.start.y)).toBe(true);
    }
  });

  it('stopping on red wins; driving on loses', () => {
    const won = play('stop-on-red', 'color-stop', 30_000);
    expect(won.state).toBe('won');
    expect(won.stars).toBeGreaterThanOrEqual(2);
    expect(play('stop-on-red', 'square', 30_000).state).toBe('lost');
  });

  it('the sumo example survives the ring', () => {
    const r = play('sumo-survive', 'sumo', 31_000);
    expect(r.state).toBe('won');
  });

  it('touching the wall loses the no-touching challenge', () => {
    const r = play('wall-stop', 'bumper', 20_000);
    expect(r.state).toBe('lost');
    expect(r.message).toMatch(/wall/);
  });
});
