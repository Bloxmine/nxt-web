import { describe, expect, it } from 'vitest';
import { isLinux, UDEV_FILE_NAME, UDEV_RULE } from './udev';

describe('udev rule', () => {
  it('bundles the rule from docs/udev', () => {
    expect(UDEV_RULE).toContain('ATTRS{idVendor}=="0694"');
    expect(UDEV_RULE).toContain('TAG+="uaccess"');
  });

  it('keeps the number below 73 so uaccess applies', () => {
    expect(Number(/^(\d+)-/.exec(UDEV_FILE_NAME)?.[1])).toBeLessThan(73);
  });

  it('tells desktop Linux from Android and ChromeOS', () => {
    expect(isLinux('Mozilla/5.0 (X11; Linux x86_64) Chrome/130')).toBe(true);
    expect(isLinux('Mozilla/5.0 (Linux; Android 14) Chrome/130')).toBe(false);
    expect(isLinux('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/130')).toBe(false);
    expect(isLinux('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
  });
});
