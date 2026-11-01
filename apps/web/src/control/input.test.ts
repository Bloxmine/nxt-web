import { describe, expect, it } from 'vitest';
import {
  activeBindings,
  browserReserved,
  chordLabel,
  inputLabel,
  keyName,
  readGamepad,
} from './input';
import type { Binding } from './profile';

const b = (id: string, ...inputs: string[]): Binding => ({
  id,
  inputs,
  action: { kind: 'stop' },
});

describe('input names', () => {
  it('merges left and right modifiers', () => {
    expect(keyName('ShiftRight')).toBe('Shift');
    expect(keyName('ControlLeft')).toBe('Control');
    expect(keyName('KeyW')).toBe('KeyW');
  });

  it('labels keys and gamepad controls', () => {
    expect(inputLabel('KeyW')).toBe('W');
    expect(inputLabel('Digit3')).toBe('3');
    expect(inputLabel('ArrowLeft')).toBe('←');
    expect(inputLabel('pad:b0')).toBe('Pad button 1');
    expect(inputLabel('pad:a0+')).toBe('Pad stick 1 →');
    expect(inputLabel('pad:a3-')).toBe('Pad stick 2 ↑');
    expect(chordLabel(['KeyW', 'Shift'])).toBe('Shift + W');
  });

  it('knows combinations the browser keeps', () => {
    expect(browserReserved(['Control', 'KeyW'])).toBe(true);
    expect(browserReserved(['Shift', 'KeyW'])).toBe(false);
  });
});

describe('active bindings', () => {
  it('needs every input of a combination', () => {
    const list = [b('w', 'KeyW'), b('sw', 'Shift', 'KeyW')];
    const ids = (held: string[]) =>
      [...activeBindings(list, new Map(held.map((h) => [h, 1]))).keys()].map((x) => x.id);
    expect(ids(['KeyW'])).toEqual(['w']);
    expect(ids(['Shift'])).toEqual([]);
    // The combination wins over W on its own.
    expect(ids(['Shift', 'KeyW'])).toEqual(['sw']);
  });

  it('keeps unrelated bindings active together', () => {
    const list = [b('w', 'KeyW'), b('d', 'KeyD')];
    const active = activeBindings(
      list,
      new Map([
        ['KeyW', 1],
        ['KeyD', 1],
      ]),
    );
    expect(active.size).toBe(2);
  });

  it('uses the weakest input of a combination as its strength', () => {
    const active = activeBindings(
      [b('x', 'pad:b0', 'pad:a1+')],
      new Map([
        ['pad:b0', 1],
        ['pad:a1+', 0.4],
      ]),
    );
    expect([...active.values()]).toEqual([0.4]);
  });
});

describe('gamepad', () => {
  it('reads buttons and both directions of each stick, with a dead zone', () => {
    const pad = {
      buttons: [
        { pressed: true, value: 1, touched: true },
        { pressed: false, value: 0, touched: false },
      ],
      axes: [0.05, -1],
    } as unknown as Gamepad;
    const v = readGamepad(pad);
    expect(v.get('pad:b0')).toBe(1);
    expect(v.has('pad:b1')).toBe(false);
    expect(v.has('pad:a0+')).toBe(false);
    expect(v.get('pad:a1-')).toBe(1);
  });
});
