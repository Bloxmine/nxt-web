import { EXAMPLES, lowerProgram, type Program } from '@nxt/blocks';
import type { IrProgram, Stmt } from '@nxt/compiler';
import { describe, expect, it } from 'vitest';
import { glyph } from './font.js';
import { SCENARIOS, scenarioById } from './scenarios.js';
import { Simulation, type SimEvent } from './simulation.js';
import { classifyColor, matColorAt, rgbOf } from './world.js';

const example = (key: string): Program => EXAMPLES.find((e) => e.key === key)!.create();
const ir = (main: Stmt[], extra: Partial<IrProgram> = {}): IrProgram => ({
  variables: [],
  sensors: {},
  subroutines: [],
  main,
  parallel: [],
  ...extra,
});
const n = (value: number) => ({ kind: 'number', value }) as const;

describe('screen', () => {
  it('has a glyph for every printable character', () => {
    for (let c = 32; c < 127; c++) expect(glyph(String.fromCharCode(c))).toHaveLength(5);
    expect(glyph('A')).toEqual([0x7e, 0x11, 0x11, 0x11, 0x7e]);
  });

  it('draws text on the right line and shapes with y up', () => {
    const sim = new Simulation(
      ir([
        { kind: 'drawText', x: n(0), line: n(1), text: { kind: 'text', value: 'I' } },
        { kind: 'drawLine', x: n(0), y: n(0), endX: n(99), endY: n(0) },
      ]),
      scenarioById('empty'),
    );
    sim.start();
    sim.advance(10);
    // 'I' has its middle column (x = 2) dark on the top rows.
    expect(sim.lcd.get(2, 63)).toBe(true);
    expect(sim.lcd.get(50, 0)).toBe(true);
    expect(sim.lcd.get(50, 1)).toBe(false);
  });
});

describe('robot', () => {
  it('drives a square and comes back to the start', () => {
    const sim = new Simulation(lowerProgram(example('square')), scenarioById('square'), {
      seed: 1,
    });
    const start = { ...sim.world.pose };
    sim.start();
    sim.advance(60_000);
    expect(sim.status).toBe('finished');
    const { x, y, heading } = sim.world.pose;
    // 230° wheel turns give slightly more than 90° per corner; four corners stay close.
    expect(Math.hypot(x - start.x, y - start.y)).toBeLessThan(25);
    const drift = Math.min(heading, 360 - heading);
    expect(drift).toBeLessThan(30);
  });

  it('bumper car reverses after hitting the fence and never leaves the table', () => {
    const sim = new Simulation(lowerProgram(example('bumper')), scenarioById('empty'));
    sim.start();
    let reversed = false;
    for (let t = 0; t < 20_000; t += 50) {
      sim.advance(50);
      if (sim.motors[1]!.power < 0) reversed = true;
      const { x, y } = sim.world.pose;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(200);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(150);
    }
    expect(reversed).toBe(true);
  });

  it('line follower stays on the oval', () => {
    const sim = new Simulation(lowerProgram(example('line')), scenarioById('oval'));
    sim.start();
    let near = 0;
    let samples = 0;
    for (let t = 0; t < 30_000; t += 100) {
      sim.advance(100);
      const [x, y] = sim.world.ahead(7);
      // Distance from the oval's centre line.
      const cx = Math.max(65, Math.min(175, x));
      const d = Math.abs(Math.hypot(x - cx, y - 80) - 50);
      samples++;
      if (d < 8) near++;
    }
    expect(near / samples).toBeGreaterThan(0.9);
    expect(sim.world.trail.length).toBeGreaterThan(100);
  });

  it('obstacle avoider turns away before touching a wall', () => {
    const sim = new Simulation(lowerProgram(example('avoid')), scenarioById('walls'));
    sim.start();
    for (let t = 0; t < 20_000; t += 50) {
      sim.advance(50);
      expect(sim.world.touching()).toBe(false);
    }
  });

  it('reads colours from the mat', () => {
    const colors = scenarioById('colors');
    expect(classifyColor(rgbOf(matColorAt(colors, 55, 50)))).toBe(2);
    expect(classifyColor(rgbOf(matColorAt(colors, 215, 50)))).toBe(1);
    expect(classifyColor(rgbOf(matColorAt(colors, 5, 50)))).toBe(6);
    for (const s of SCENARIOS) expect(s.start.x).toBeLessThan(s.width);
  });
});

describe('program behaviour', () => {
  it('runs parallel beams side by side', () => {
    const sim = new Simulation(lowerProgram(example('parallel')), scenarioById('empty'));
    const tones: number[] = [];
    sim.on((e: SimEvent) => {
      if (e.type === 'tone') tones.push(e.frequency);
    });
    sim.start();
    sim.advance(1000);
    expect(tones.slice(0, 2)).toEqual([523, 659]);
    expect(sim.motors[1]!.speed).toBeGreaterThan(0);
  });

  it('shows the ultrasonic distance through data wires', () => {
    const sim = new Simulation(lowerProgram(example('distance')), scenarioById('walls'));
    sim.start();
    sim.advance(500);
    // Line 4 covers rows 32–39 (y counted from the bottom).
    let dark = 0;
    for (let x = 0; x < 100; x++) for (let y = 32; y < 40; y++) if (sim.lcd.get(x, y)) dark++;
    expect(dark).toBeGreaterThan(60);
  });

  it('evaluates variables, mailboxes and files', () => {
    const v = (name: string) => ({ kind: 'var', name }) as const;
    const sim = new Simulation(
      ir(
        [
          { kind: 'set', name: 'a', value: { kind: 'binary', op: '/', left: n(7), right: n(2) } },
          {
            kind: 'file',
            action: 'write',
            file: { kind: 'text', value: 'log.txt' },
            valueType: 'number',
            value: v('a'),
          },
          {
            kind: 'file',
            action: 'read',
            file: { kind: 'text', value: 'log.txt' },
            valueType: 'number',
            target: 'b',
          },
          { kind: 'waitUntil', condition: { kind: 'button', button: 'enter' } },
          {
            kind: 'messageRead',
            mailbox: n(1),
            valueType: 'text',
            target: 'msg',
            received: 'got',
          },
        ],
        {
          variables: [
            { name: 'a', type: 'number' },
            { name: 'b', type: 'number' },
            { name: 'msg', type: 'text' },
            { name: 'got', type: 'boolean' },
          ],
        },
      ),
      scenarioById('empty'),
    );
    sim.start();
    sim.advance(100);
    expect(sim.status).toBe('running');
    sim.receive(1, 'hello');
    sim.buttons.enter = true;
    sim.advance(100);
    expect(sim.status).toBe('finished');
    const vars = sim.variables();
    expect([vars.get('a'), vars.get('b'), vars.get('msg'), vars.get('got')]).toEqual([
      3.5,
      3.5,
      'hello',
      true,
    ]);
    expect(sim.files.get('log.txt')?.data).toBe('3.5\r\n');
  });
});

describe('debugging', () => {
  it('pauses at a breakpoint and steps block by block', () => {
    const program = example('square');
    const loop = program.body[0] as Extract<Program['body'][number], { kind: 'loop' }>;
    const [drive, turn] = loop.body;
    const sim = new Simulation(lowerProgram(program), scenarioById('square'));
    sim.breakpoints.add(turn!.id);
    sim.start();
    sim.advance(60_000);
    expect(sim.status).toBe('paused');
    expect(sim.activeBlocks()).toEqual([{ task: 'main', block: turn!.id }]);
    const pausedAt = sim.time;
    expect(pausedAt).toBeGreaterThan(1000);

    sim.breakpoints.clear();
    sim.step();
    expect(sim.status).toBe('paused');
    expect(sim.activeBlocks()[0]!.block).toBe(drive!.id);
    expect(sim.time).toBeGreaterThan(pausedAt);

    sim.start();
    sim.advance(60_000);
    expect(sim.status).toBe('finished');
  });

  it('stops with an error instead of throwing', () => {
    const sim = new Simulation(ir([{ kind: 'call', name: 'missing' }]), scenarioById('empty'));
    sim.start();
    sim.advance(10);
    expect(sim.status).toBe('error');
    expect(sim.error).toContain('missing');
  });
});
