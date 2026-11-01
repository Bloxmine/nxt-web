import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lowerProgram } from '@nxt/blocks';
import { compileProgram } from '@nxt/compiler';
import { importRbt } from '@nxt/rbt';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './scenarios.js';
import { Simulation } from './simulation.js';
import { RxeVm } from './vm.js';

// Real NXT-G programs (not committed; see docs/rbt-compat.md). Each must run in every
// scenario for a while without a simulator error.
const external = join(import.meta.dirname, '../../../fixtures/external');
// NXT 2.0 programs, and NXT 1.0 programs (NXT-G 1.x) from their own folder.
const files = ['nxtprograms', 'nxtprograms1'].flatMap((folder) => {
  const dir = join(external, folder);
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.rbt'))
        .map((f) => `${folder}/${f}`)
    : [];
});

describe.skipIf(files.length === 0)('real programs run in the simulator (local only)', () => {
  it.each(files)(
    '%s',
    (name) => {
      const { program } = importRbt(
        new Uint8Array(readFileSync(join(external, name))),
        name.split('/').pop(),
      );
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
      // Compiled, the program runs in the VM without errors too.
      const bytes = compileProgram(ir);
      expect(bytes.length).toBeLessThan(64 * 1024);
      const sim = new Simulation({ ...ir, main: [], parallel: [] }, SCENARIOS[0]!, { seed: 7 });
      const vm = new RxeVm(bytes, sim);
      for (let t = 0; t < 10_000 && vm.running; t += 100) {
        sim.setButton('enter', t % 1000 < 300);
        vm.advance(100);
      }
      expect(vm.error).toBeNull();
    },
    30_000,
  );
});
