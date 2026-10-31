import { describe, expect, it } from 'vitest';
import { chapterOf, GUIDE, GUIDE_ACTIONS, plainText, searchGuide } from './content';

const sections = GUIDE.flatMap((c) => c.sections);

describe('user guide', () => {
  it('has unique chapter and section ids', () => {
    const ids = [...GUIDE.map((c) => c.id), ...sections.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('links only to sections and actions that exist', () => {
    for (const s of sections) {
      for (const [, target] of s.body.matchAll(/\[\[[^|\]]+\|([^\]]+)\]\]/g)) {
        if (target!.startsWith('#')) expect(chapterOf(target!.slice(1)), target).not.toBeNull();
        else expect(Object.keys(GUIDE_ACTIONS), `${s.id} → ${target}`).toContain(target);
      }
    }
  });

  it('closes every bold and code mark', () => {
    for (const s of sections) {
      expect((s.body.match(/\*\*/g) ?? []).length % 2, s.id).toBe(0);
      expect((s.body.match(/`/g) ?? []).length % 2, s.id).toBe(0);
    }
  });

  it('covers setup, troubleshooting and tips', () => {
    const titles = GUIDE.map((c) => c.title);
    expect(titles).toEqual(
      expect.arrayContaining(['Setting up the brick', 'Troubleshooting', 'Tips and tricks']),
    );
  });

  it('finds sections by every word, title matches first', () => {
    const hits = searchGuide('udev rule');
    expect(hits.map((h) => h.section.id)).toContain('linux');
    expect(searchGuide('permission')[0]!.section.id).toBe('permission');
    expect(searchGuide('zzzz nothing')).toEqual([]);
    expect(searchGuide('  ')).toEqual([]);
  });

  it('strips markup for searching', () => {
    expect(plainText('Press **F5** or [[Simulate|simulate]] and `Ctrl+S`')).toBe(
      'press f5 or simulate and ctrl+s',
    );
  });
});
