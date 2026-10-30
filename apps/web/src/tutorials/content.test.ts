import { EXAMPLES, emptyProgram, lowerProgram } from '@nxt/blocks';
import { scenarioById, Simulation } from '@nxt/sim';
import { describe, expect, it } from 'vitest';
import { TUTORIALS } from './content';

const example = (key: string) => EXAMPLES.find((e) => e.key === key)!.create();
const tutorial = (key: string) => TUTORIALS.find((t) => t.key === key)!;
const checksOf = (key: string) => tutorial(key).steps.filter((s) => s.check);

describe('tutorials', () => {
  it('have unique keys and steps with text', () => {
    expect(new Set(TUTORIALS.map((t) => t.key)).size).toBe(TUTORIALS.length);
    for (const t of TUTORIALS) for (const s of t.steps) expect(s.text.length).toBeGreaterThan(20);
  });

  it('an empty program passes no checks', () => {
    for (const t of TUTORIALS) {
      for (const s of t.steps) {
        if (s.check)
          expect(s.check({ program: emptyProgram(), sim: null }), `${t.key}: ${s.title}`).toBe(
            false,
          );
      }
    }
  });

  it('the finished square passes the loop tutorial, including the simulator step', () => {
    const program = example('square');
    const sim = new Simulation(lowerProgram(program), scenarioById('square'));
    sim.start();
    sim.advance(60_000);
    for (const s of checksOf('loops')) expect(s.check!({ program, sim }), s.title).toBe(true);
  });

  it('the line follower passes the decisions tutorial', () => {
    const program = example('line');
    const sim = new Simulation(lowerProgram(program), scenarioById('oval'));
    sim.start();
    sim.advance(20_000);
    for (const s of checksOf('line')) expect(s.check!({ program, sim }), s.title).toBe(true);
  });

  it('the distance display passes the data wires tutorial', () => {
    const program = example('distance');
    const sim = new Simulation(lowerProgram(program), scenarioById('walls'));
    sim.start();
    sim.advance(1000);
    for (const s of checksOf('wires')) expect(s.check!({ program, sim }), s.title).toBe(true);
  });
});
