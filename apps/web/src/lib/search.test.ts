import { EXAMPLES } from '@nxt/blocks';
import { describe, expect, it } from 'vitest';
import { searchProgram } from './search';

describe('searchProgram', () => {
  const program = {
    ...EXAMPLES.find((e) => e.key === 'distance')!.create(),
    comments: [{ id: 'c1', tab: 'main', x: 0, y: 0, text: 'Shows the distance' }],
  };

  it('finds blocks by name, settings and text', () => {
    expect(searchProgram(program, 'ultrasonic').map((h) => h.kind)).toContain('block');
    expect(searchProgram(program, 'Distance: ').some((h) => h.title === 'Text')).toBe(true);
  });

  it('finds variables and comments', () => {
    expect(searchProgram(program, 'number 1')[0]).toMatchObject({
      kind: 'variable',
      title: 'Number 1',
    });
    expect(searchProgram(program, 'shows the').some((h) => h.kind === 'comment')).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(searchProgram(program, '  ')).toEqual([]);
  });
});
