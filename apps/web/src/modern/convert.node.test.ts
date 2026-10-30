import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES, type Program } from '@nxt/blocks';
import { importRbt } from '@nxt/rbt';
import { describe, expect, it } from 'vitest';
import { fromBlockly, toBlockly } from './convert';

/** Through Blockly's JSON and back, for every tab: the program must not change. */
function roundTrip(program: Program): Program {
  let p = program;
  for (const tab of ['main', ...program.myBlocks.map((m) => m.id)]) {
    // JSON round trip as Blockly would store it.
    p = fromBlockly(JSON.parse(JSON.stringify(toBlockly(p, tab))), p, tab);
  }
  return p;
}

const dir = join(import.meta.dirname, '../../../../fixtures/external/nxtprograms');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.rbt')) : [];

describe('Blockly view conversion', () => {
  it.each(EXAMPLES.map((e) => e.key))('example %s survives a round trip', (key) => {
    const program = EXAMPLES.find((e) => e.key === key)!.create();
    expect(roundTrip(program)).toEqual(program);
  });

  it.skipIf(files.length === 0).each(files)(
    'corpus %s survives a round trip (local only)',
    (name) => {
      const { program } = importRbt(new Uint8Array(readFileSync(join(dir, name))), name);
      expect(roundTrip(program)).toEqual(program);
    },
  );

  it('applies edits made in Blockly', () => {
    const program = EXAMPLES.find((e) => e.key === 'square')!.create();
    const state = toBlockly(program, 'main');
    const loop = state.blocks.blocks[0]!.next!.block!;
    loop.fields!['COUNT'] = 6;
    loop.inputs!['DO']!.block!.fields!['POWER'] = 30;
    const next = fromBlockly(state, program, 'main');
    const l = next.body[0] as Extract<Program['body'][number], { kind: 'loop' }>;
    expect(l.control).toEqual({ type: 'count', count: 6 });
    expect(l.body[0]).toMatchObject({ kind: 'move', power: 30 });
  });
});
