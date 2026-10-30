import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lowerProgram } from '@nxt/blocks';
import { importRbt } from '@nxt/rbt';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './scenarios.js';
import { Simulation } from './simulation.js';

// Real NXT-G programs (not committed; see docs/rbt-compat.md). Each must run in every
// scenario for a while without a simulator error.
const dir = join(import.meta.dirname, '../../../fixtures/external/nxtprograms');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.rbt')) : [];

describe.skipIf(files.length === 0)('real programs run in the simulator (local only)', () => {
  it.each(files)('%s', (name) => {
    const { program } = importRbt(new Uint8Array(readFileSync(join(dir, name))), name);
    const ir = lowerProgram(program);
    for (const scenario of SCENARIOS) {
      const sim = new Simulation(ir, scenario, { seed: 7 });
      sim.start();
      for (let t = 0; t < 10_000 && sim.status === 'running'; t += 100) {
        sim.buttons.enter = t % 1000 < 300;
        sim.advance(100);
      }
      expect(sim.error).toBeNull();
    }
  });
});
