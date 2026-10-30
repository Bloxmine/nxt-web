import { describe, expect, it } from 'vitest';
import { checkBrowserSupport } from './browserSupport';

describe('checkBrowserSupport', () => {
  it('reports both APIs on a Chromium-like navigator', () => {
    expect(checkBrowserSupport({ usb: {}, serial: {} })).toEqual({ usb: true, serial: true });
  });

  it('reports nothing on a navigator without WebUSB or Web Serial', () => {
    expect(checkBrowserSupport({ userAgent: 'Firefox' })).toEqual({ usb: false, serial: false });
  });

  it('handles a missing navigator', () => {
    expect(checkBrowserSupport(undefined)).toEqual({ usb: false, serial: false });
  });
});
