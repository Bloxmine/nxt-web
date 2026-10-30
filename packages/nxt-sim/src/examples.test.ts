import { EXAMPLES, lowerProgram } from '@nxt/blocks';
import { compileProgram } from '@nxt/compiler';
import { describe, expect, it } from 'vitest';
import { scenarioById } from './scenarios.js';
import { Simulation } from './simulation.js';
import { classifyColor, matColorAt, rgbOf } from './world.js';
import { RxeVm } from './vm.js';

const run = (key: string, ms: number) => {
  const ex = EXAMPLES.find((e) => e.key === key)!;
  const sim = new Simulation(lowerProgram(ex.create()), scenarioById(ex.mat ?? 'empty'), {
    seed: 3,
  });
  sim.start();
  sim.advance(ms);
  return sim;
};

describe('example gallery', () => {
  it.each(EXAMPLES.map((e) => e.key))('%s runs on its mat and compiles', (key) => {
    const ex = EXAMPLES.find((e) => e.key === key)!;
    expect(ex.level).toBeDefined();
    const sim = run(key, 15_000);
    expect(sim.error).toBeNull();
    const ir = lowerProgram(ex.create());
    const vm = new RxeVm(
      compileProgram(ir),
      new Simulation({ ...ir, main: [], parallel: [] }, scenarioById(ex.mat ?? 'empty')),
    );
    vm.advance(3000);
    expect(vm.error).toBeNull();
  });

  it('Stop on red stops on the red band', () => {
    const sim = run('color-stop', 15_000);
    expect(sim.status).toBe('finished');
    const [x, y] = sim.world.ahead(7);
    expect(classifyColor(rgbOf(matColorAt(sim.world.scenario, x, y)))).toBe(5);
  });

  it('Sumo stays inside the ring', () => {
    const ex = EXAMPLES.find((e) => e.key === 'sumo')!;
    const sim = new Simulation(lowerProgram(ex.create()), scenarioById('sumo'));
    sim.start();
    for (let t = 0; t < 30_000; t += 100) {
      sim.advance(100);
      const { x, y } = sim.world.pose;
      expect(Math.hypot(x - 90, y - 90)).toBeLessThan(80);
    }
  });

  it('Barcode counter counts the bands it passed', () => {
    const sim = run('barcode', 13_000);
    // Two cards of three bands each are passed in 12 s at this speed.
    expect(sim.variables().get('Bands')).toBeGreaterThanOrEqual(5);
    expect(sim.variables().get('Bands')).toBeLessThanOrEqual(7);
  });

  it('Countdown reaches Go', () => {
    const sim = run('countdown', 12_000);
    expect(sim.status).toBe('finished');
    expect(sim.variables().get('Count')).toBe(0);
  });
});
