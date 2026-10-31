import { EXAMPLES } from '@nxt/blocks';
import { describe, expect, it } from 'vitest';
import { readShared, shareLink } from './share';

describe('share links', () => {
  it('round-trips a program through the link, compactly', async () => {
    const program = EXAMPLES.find((e) => e.key === 'distance')!.create();
    const link = await shareLink(program, 'https://example.org/studio/#old');
    expect(link.startsWith('https://example.org/studio/#p=')).toBe(true);
    expect(new URL(link).hash.slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(link.length).toBeLessThan(JSON.stringify(program).length);
    const back = await readShared(new URL(link).hash);
    expect(back).toEqual(program);
  });

  it('ignores other fragments and rejects damaged links', async () => {
    expect(await readShared('#section')).toBeNull();
    await expect(readShared('#p=AAAA')).rejects.toThrow();
  });
});
