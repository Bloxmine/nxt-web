import { describe, expect, it } from 'vitest';
import { createBlock } from './catalog.js';
import type { Block, Program } from './model.js';
import { emptyProgram } from './project.js';
import { tidyProgram } from './tidy.js';

describe('tidy up', () => {
  it('removes empty beams, broken wires, unused variables and folds unwired hubs', () => {
    const shown = { ...createBlock('display'), hub: true } as Block;
    const counter = { ...createBlock('variable'), name: 'Score' } as Block;
    const program: Program = {
      ...emptyProgram('Messy'),
      variables: [
        { name: 'Number 1', type: 'number' },
        { name: 'Score', type: 'number' },
        { name: 'Old', type: 'number' },
      ],
      body: [shown, counter],
      parallel: [[], [createBlock('sound')], []],
      wires: [
        { id: 'w1', from: { block: 'gone', plug: 'value' }, to: { block: shown.id, plug: 'text' } },
      ],
    };
    const { program: tidy, changes } = tidyProgram(program);
    expect(tidy.parallel).toHaveLength(1);
    expect(tidy.wires).toEqual([]);
    expect(tidy.variables.map((v) => v.name)).toEqual(['Number 1', 'Score']);
    expect(tidy.body[0]).toMatchObject({ hub: false });
    expect(changes).toEqual([
      'removed 2 empty parallel beams',
      'removed 1 broken wire',
      'removed unused variable "Old"',
      'folded in 1 data hub without wires',
    ]);
    expect(tidyProgram(tidy).changes).toEqual([]);
  });
});
