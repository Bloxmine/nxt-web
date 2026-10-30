import { describe, expect, it } from 'vitest';
import type { Stmt } from './index.js';
import { visitStatements } from './index.js';

describe('visitStatements', () => {
  it('visits nested statements depth first', () => {
    const body: Stmt[] = [
      {
        kind: 'forever',
        body: [
          {
            kind: 'if',
            condition: { kind: 'boolean', value: true },
            then: [{ kind: 'stopSound' }],
            else: [{ kind: 'break' }],
          },
        ],
      },
      { kind: 'stop' },
    ];
    const kinds: string[] = [];
    visitStatements(body, (s) => kinds.push(s.kind));
    expect(kinds).toEqual(['forever', 'if', 'stopSound', 'break', 'stop']);
  });
});
