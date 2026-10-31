import { describe, expect, it } from 'vitest';
import { animationProgram, frameNames } from './animation.js';
import { lowerProgram } from './lower.js';
import { validateProgram } from './validate.js';

describe('animation programs', () => {
  it('names frames to fit the brick', () => {
    expect(frameNames('cat', 3)).toEqual(['cat01', 'cat02', 'cat03']);
    expect(frameNames('A very long name here!', 1)[0]).toBe('A very long n01');
    expect(frameNames('???', 1)[0]).toBe('Frame01');
    for (const n of frameNames('x'.repeat(40), 12)) expect(n.length + 4).toBeLessThanOrEqual(19);
  });

  it('shows each frame then waits, in a loop, and lowers cleanly', () => {
    const p = animationProgram('Cat', {
      frames: ['cat01', 'cat02'],
      x: 10,
      y: 4,
      secondsPerFrame: 0.2,
      repeat: 0,
    });
    const loop = p.body[0]!;
    expect(loop.kind).toBe('loop');
    if (loop.kind !== 'loop') return;
    expect(loop.control).toEqual({ type: 'forever' });
    expect(loop.body.map((b) => b.kind)).toEqual(['display', 'wait', 'display', 'wait']);
    expect(validateProgram(p).filter((i) => i.severity === 'error')).toEqual([]);
    const ir = lowerProgram(p);
    const draws: unknown[] = [];
    JSON.stringify(ir, (_key, v: unknown) => {
      if (v && typeof v === 'object' && (v as { kind?: string }).kind === 'drawImage')
        draws.push(v);
      return v;
    });
    expect(draws).toMatchObject([
      { file: 'cat01.ric', x: { value: 10 }, y: { value: 4 } },
      { file: 'cat02.ric' },
    ]);
    const counted = animationProgram('Cat', {
      frames: ['a'],
      x: 0,
      y: 0,
      secondsPerFrame: 1,
      repeat: 3,
    });
    expect(counted.body[0]).toMatchObject({ control: { type: 'count', count: 3 } });
  });
});
