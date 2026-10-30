import { describe, expect, it } from 'vitest';
import { COMPLETE_PALETTE, PALETTE } from './index.js';

describe('icons', () => {
  it('every palette entry and category has its own icon', () => {
    const icons = [
      ...Object.values(PALETTE).map((e) => `${e.icon} (${e.key})`),
      ...COMPLETE_PALETTE.map((c) => `${c.icon} (category ${c.label})`),
    ];
    const byIcon = new Map<string, string[]>();
    for (const entry of icons) {
      const icon = entry.split(' ')[0]!;
      byIcon.set(icon, [...(byIcon.get(icon) ?? []), entry]);
    }
    const duplicates = [...byIcon.values()].filter((list) => list.length > 1);
    expect(duplicates).toEqual([]);
  });
});
