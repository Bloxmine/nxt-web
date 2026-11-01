import { EXAMPLES, lowerProgram, type Program } from '@nxt/blocks';
import {
  compileProgram,
  compileWithSymbols,
  type Expr,
  type IrProgram,
  type Stmt,
} from '@nxt/compiler';
import { describe, expect, it } from 'vitest';
import { scenarioById } from './scenarios.js';
import { Simulation, type SimEvent } from './simulation.js';
import { RxeVm } from './vm.js';

// The compiler is checked by running its output in RxeVm on a simulated brick and
// comparing with the IR interpreter running the same program.

const example = (key: string): IrProgram =>
  lowerProgram(EXAMPLES.find((e) => e.key === key)!.create() as Program);
const empty: IrProgram = { variables: [], sensors: {}, subroutines: [], main: [], parallel: [] };

function compiled(ir: IrProgram, mat: string) {
  const sim = new Simulation(empty, scenarioById(mat), { seed: 1 });
  const vm = new RxeVm(compileProgram(ir), sim);
  return { sim, vm };
}

const n = (value: number): Expr => ({ kind: 'number', value });
const v = (name: string): Expr => ({ kind: 'var', name });
const t = (value: string): Expr => ({ kind: 'text', value });

describe('compiled programs behave like the simulator', () => {
  it('square: same path, same end position', () => {
    const ir = example('square');
    const interpreted = new Simulation(ir, scenarioById('square'));
    interpreted.start();
    interpreted.advance(60_000);
    const { sim, vm } = compiled(ir, 'square');
    vm.advance(60_000);
    expect(vm.error).toBeNull();
    expect(vm.running).toBe(false);
    const a = interpreted.world.pose;
    const b = sim.world.pose;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(3);
    expect(Math.abs(a.heading - b.heading) % 360).toBeLessThan(3);
  });

  it('line follower stays on the line', () => {
    const { sim, vm } = compiled(example('line'), 'oval');
    let near = 0;
    for (let i = 0; i < 200; i++) {
      vm.advance(100);
      const [x, y] = sim.world.ahead(7);
      const cx = Math.max(65, Math.min(175, x));
      if (Math.abs(Math.hypot(x - cx, y - 80) - 50) < 8) near++;
    }
    expect(vm.error).toBeNull();
    expect(near / 200).toBeGreaterThan(0.9);
  }, 20_000); // Runs 20 s of compiled code; slow on a busy machine.

  it('obstacle avoider (ultrasonic over I2C) never touches a wall', () => {
    const { sim, vm } = compiled(example('avoid'), 'walls');
    for (let i = 0; i < 200; i++) {
      vm.advance(100);
      expect(sim.world.touching()).toBe(false);
    }
    expect(vm.error).toBeNull();
    expect(sim.world.trail.length).toBeGreaterThan(50);
  });

  it('bumper car backs up after touching the fence', () => {
    const { sim, vm } = compiled(example('bumper'), 'empty');
    let reversed = false;
    for (let i = 0; i < 200; i++) {
      vm.advance(100);
      if (sim.motors[1]!.power < 0) reversed = true;
    }
    expect(vm.error).toBeNull();
    expect(reversed).toBe(true);
  });

  it('distance display draws the same pixels', () => {
    const ir = example('distance');
    const interpreted = new Simulation(ir, scenarioById('walls'));
    interpreted.start();
    interpreted.advance(500);
    const { sim, vm } = compiled(ir, 'walls');
    vm.advance(500);
    expect(vm.error).toBeNull();
    expect([...sim.lcd.pixels]).toEqual([...interpreted.lcd.pixels]);
  });

  it('parallel beams: the tune plays while driving', () => {
    const { sim, vm } = compiled(example('parallel'), 'square');
    const tones: number[] = [];
    sim.on((e: SimEvent) => {
      if (e.type === 'tone') tones.push(e.frequency);
    });
    vm.advance(2000);
    expect(tones.slice(0, 3)).toEqual([523, 659, 784]);
    expect(sim.motors[1]!.rotation).toBeGreaterThan(100);
  });
});

describe('compiled data handling', () => {
  const program: IrProgram = {
    variables: [
      { name: 'a', type: 'number' },
      { name: 'b', type: 'number' },
      { name: 'c', type: 'number' },
      { name: 'sum', type: 'number' },
      { name: 'flag', type: 'boolean' },
      { name: 'text', type: 'text' },
      { name: 'back', type: 'number' },
      { name: 'got', type: 'boolean' },
      { name: 'msg', type: 'text' },
    ],
    sensors: {},
    subroutines: [
      {
        name: 'addTen',
        body: [
          {
            kind: 'set',
            name: 'sum',
            value: { kind: 'binary', op: '+', left: v('sum'), right: n(10) },
          },
        ],
      },
    ],
    main: [
      {
        kind: 'set',
        name: 'a',
        value: {
          kind: 'binary',
          op: '-',
          left: { kind: 'binary', op: '*', left: n(7), right: n(6) },
          right: n(2),
        },
      },
      { kind: 'set', name: 'b', value: { kind: 'binary', op: '/', left: v('a'), right: n(-3) } },
      { kind: 'set', name: 'c', value: { kind: 'binary', op: '%', left: v('a'), right: n(7) } },
      { kind: 'repeat', count: n(3), body: [{ kind: 'call', name: 'addTen' }] },
      {
        kind: 'while',
        condition: { kind: 'binary', op: '<', left: v('sum'), right: n(1000) },
        body: [
          {
            kind: 'set',
            name: 'sum',
            value: { kind: 'binary', op: '*', left: v('sum'), right: n(2) },
          },
          {
            kind: 'if',
            condition: { kind: 'binary', op: '>', left: v('sum'), right: n(200) },
            then: [{ kind: 'break' }],
            else: [],
          },
        ],
      },
      {
        kind: 'set',
        name: 'flag',
        value: {
          kind: 'binary',
          op: 'and',
          left: { kind: 'binary', op: '==', left: v('c'), right: n(5) },
          right: { kind: 'not', operand: { kind: 'boolean', value: false } },
        },
      },
      {
        kind: 'set',
        name: 'text',
        value: {
          kind: 'concat',
          parts: [t('a='), { kind: 'numberToText', value: v('a') }, t('!')],
        },
      },
      {
        kind: 'file',
        action: 'write',
        file: t('log.txt'),
        valueType: 'number',
        value: v('b'),
        size: n(0),
      },
      { kind: 'file', action: 'write', file: t('log.txt'), valueType: 'text', value: v('text') },
      { kind: 'file', action: 'close', file: t('log.txt'), valueType: 'text' },
      { kind: 'file', action: 'read', file: t('log.txt'), valueType: 'number', target: 'back' },
      { kind: 'messageRead', mailbox: n(2), valueType: 'text', target: 'msg', received: 'got' },
      { kind: 'drawText', x: n(0), line: n(2), text: v('text') },
    ],
    parallel: [],
  };

  it('computes the same values as the interpreter (integers)', () => {
    const { bytes, variables } = compileWithSymbols(program);
    const sim = new Simulation(empty, scenarioById('empty'));
    sim.receive(2, 'hi');
    const vm = new RxeVm(bytes, sim);
    vm.advance(500);
    expect(vm.error).toBeNull();
    expect(vm.running).toBe(false);
    const get = (name: string) => vm.value(variables.get(name)!);
    const text = (name: string) => String.fromCharCode(...(get(name) as number[]).slice(0, -1));
    expect([get('a'), get('b'), get('c'), get('sum'), get('flag')]).toEqual([40, -13, 5, 240, 1]);
    expect(text('text')).toBe('a=40!');
    expect(get('back')).toBe(-13);
    expect([get('got'), text('msg')]).toEqual([1, 'hi']);
    expect(sim.files.get('log.txt')?.data).toBe('-13\r\na=40!\r\n');

    // The interpreter agrees on everything that does not involve fractions.
    const interpreted = new Simulation(program, scenarioById('empty'));
    interpreted.receive(2, 'hi');
    interpreted.start();
    interpreted.advance(500);
    const vars = interpreted.variables();
    expect([
      vars.get('a'),
      vars.get('c'),
      vars.get('sum'),
      vars.get('text'),
      vars.get('msg'),
    ]).toEqual([40, 5, 240, 'a=40!', 'hi']);
    expect([...sim.lcd.pixels]).toEqual([...interpreted.lcd.pixels]);
  });

  it('stops the whole program with a Stop block', () => {
    const stmts: Stmt[] = [
      { kind: 'stop' },
      { kind: 'drawText', x: n(0), line: n(1), text: t('never') },
    ];
    const { sim, vm } = compiled({ ...empty, main: stmts }, 'empty');
    vm.advance(100);
    expect(vm.stopped).toBe(true);
    expect(sim.lcd.pixels.some((p) => p === 1)).toBe(false);
  });
});
