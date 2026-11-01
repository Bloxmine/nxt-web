import { describe, expect, it } from 'vitest';
import { ControlEngine, limitPower, LIMIT_MARGIN, mixDifferential, towards } from './engine';
import { createProfile, type Binding, type Profile } from './profile';

const keys = (...k: string[]) => new Map(k.map((x) => [x, 1]));
const none = new Map<string, number>();
const at = (a: number | null, b: number | null, c: number | null) => [a, b, c];
const powers = (e: ControlEngine, held: Map<string, number>, pos = at(0, 0, 0), now = 0) =>
  e.tick(held, pos, now).ports.map((p) => p.power);

function withBindings(profile: Profile, ...bindings: Omit<Binding, 'id'>[]): Profile {
  return {
    ...profile,
    bindings: bindings.map((b, i) => ({ ...b, id: `t${i}` })),
  };
}

describe('helpers', () => {
  it('mixes forward and turn for two wheels', () => {
    expect(mixDifferential(1, 0, 50)).toEqual([1, 1]);
    expect(mixDifferential(0, 1, 50)).toEqual([1, -1]); // spin in place
    expect(mixDifferential(1, 1, 50)).toEqual([1, 0.5]);
    expect(mixDifferential(1, 1, 100)).toEqual([1, 0]); // pivot on the inner wheel
  });

  it('turns towards a target and stops there', () => {
    expect(towards(90, 0, 40)).toBe(40);
    expect(towards(-90, 0, 40)).toBe(-40);
    expect(towards(2, 0, 40)).toBe(0);
    expect(towards(10, 0, 100)).toBe(15); // never below the lowest useful power
  });

  it('slows down near a limit and stops at it', () => {
    const lim = { min: -60, max: 60 };
    expect(limitPower(80, 0, lim)).toEqual({ power: 80, atLimit: false });
    expect(limitPower(80, 50, lim).power).toBe(20);
    expect(limitPower(80, 60 - LIMIT_MARGIN, lim)).toEqual({ power: 0, atLimit: true });
    // Away from the limit is always fine.
    expect(limitPower(-80, 70, lim)).toEqual({ power: -80, atLimit: false });
    expect(limitPower(80, null, lim).power).toBe(80);
  });
});

describe('two-wheel robot', () => {
  it('drives with the arrow keys at the set speed', () => {
    const e = new ControlEngine(createProfile('two-wheel'));
    expect(powers(e, keys('ArrowUp'))).toEqual([0, 60, 60]);
    expect(powers(e, keys('ArrowLeft'))).toEqual([0, -60, 60]);
    expect(powers(e, keys('ArrowUp', 'ArrowRight'))).toEqual([0, 60, 30]);
    expect(powers(e, none)).toEqual([0, 0, 0]);
  });

  it('changes speed with number keys and boosts while Shift is held', () => {
    const e = new ControlEngine(createProfile('two-wheel'));
    e.tick(keys('Digit1'), at(0, 0, 0), 0);
    expect(powers(e, keys('ArrowUp'))).toEqual([0, 30, 30]);
    expect(powers(e, keys('ArrowUp', 'Shift'))).toEqual([0, 100, 100]);
    expect(powers(e, keys('ArrowUp'))).toEqual([0, 30, 30]);
  });

  it('honours each motor’s top power', () => {
    const p = createProfile('two-wheel');
    p.motors[1].maxPower = 40;
    const e = new ControlEngine(p);
    expect(powers(e, keys('ArrowUp'))).toEqual([0, 40, 60]);
  });

  it('takes analog values from a gamepad stick', () => {
    const p = withBindings(createProfile('two-wheel'), {
      inputs: ['pad:a1-'],
      action: { kind: 'drive', direction: 'forward' },
    });
    const e = new ControlEngine(p);
    expect(powers(e, new Map([['pad:a1-', 0.5]]))).toEqual([0, 30, 30]);
  });
});

describe('tank controls', () => {
  it('runs each track on its own keys', () => {
    const e = new ControlEngine(createProfile('tank'));
    expect(powers(e, keys('KeyW'))).toEqual([0, 60, 0]);
    expect(powers(e, keys('KeyW', 'ArrowDown'))).toEqual([0, 60, -60]);
  });
});

describe('car with a steering motor', () => {
  it('steers to the end of the range and back to the centre', () => {
    const e = new ControlEngine(createProfile('car'));
    // Steering left from the centre: motor A turns negative, at most the steering power.
    expect(powers(e, keys('ArrowLeft'), at(0, 0, 0))[0]).toBe(-40);
    // Almost there: slows down, then holds.
    expect(powers(e, keys('ArrowLeft'), at(-55, 0, 0))[0]).toBe(-15);
    expect(powers(e, keys('ArrowLeft'), at(-59, 0, 0))[0]).toBe(0);
    // Let go: back to the centre.
    expect(powers(e, none, at(-59, 0, 0))[0]).toBe(40);
    expect(powers(e, none, at(0, 0, 0))[0]).toBe(0);
  });

  it('never steers past the range, even when the motor overshoots', () => {
    const e = new ControlEngine(createProfile('car'));
    const out = e.tick(keys('ArrowRight'), at(65, 0, 0), 0);
    expect(out.ports[0].power).toBeLessThan(0); // back inside the range
  });

  it('keeps the wheels where they are without auto-centre', () => {
    const p = createProfile('car');
    if (p.steering.kind === 'car') p.steering.autoCentre = false;
    const e = new ControlEngine(p);
    e.tick(keys('ArrowRight'), at(0, 0, 0), 0);
    expect(powers(e, none, at(60, 0, 0))[0]).toBe(0);
    expect(powers(e, none, at(30, 0, 0))[0]).toBeGreaterThan(0); // still heading for 60
  });

  it('drives both drive motors and holds the steering with the brake', () => {
    const e = new ControlEngine(createProfile('car'));
    const out = e.tick(keys('ArrowUp'), at(0, 0, 0), 0);
    expect(out.ports.map((p) => p.power)).toEqual([0, 75, 75]);
    expect(out.ports[0].brake).toBe(true);
  });

  it('steers while held when the position is unknown', () => {
    const e = new ControlEngine(createProfile('car'));
    expect(powers(e, keys('ArrowRight'), at(null, 0, 0))[0]).toBe(40);
    expect(powers(e, none, at(null, 0, 0))[0]).toBe(0);
  });
});

describe('motor bindings', () => {
  const base = () => createProfile('empty');

  it('runs a motor while held and switches one on and off', () => {
    const e = new ControlEngine(
      withBindings(
        base(),
        { inputs: ['KeyQ'], action: { kind: 'motor', port: 0, power: 50, toggle: false } },
        { inputs: ['KeyE'], action: { kind: 'motor', port: 2, power: -30, toggle: true } },
      ),
    );
    expect(powers(e, keys('KeyQ'))).toEqual([50, 0, 0]);
    expect(powers(e, keys('KeyE'))).toEqual([0, 0, -30]);
    expect(powers(e, none)).toEqual([0, 0, -30]); // still on
    expect(powers(e, keys('KeyE'))).toEqual([0, 0, 0]); // pressed again: off
  });

  it('stops a held motor at its limit', () => {
    const p = withBindings(base(), {
      inputs: ['KeyQ'],
      action: { kind: 'motor', port: 0, power: 50, toggle: false },
    });
    p.motors[0].limit = { enabled: true, min: -10, max: 120 };
    const e = new ControlEngine(p);
    expect(e.tick(keys('KeyQ'), at(119, 0, 0), 0).atLimit[0]).toBe(true);
  });

  it('turns a motor to a position', () => {
    const e = new ControlEngine(
      withBindings(base(), {
        inputs: ['KeyG'],
        action: { kind: 'position', port: 1, degrees: 90 },
      }),
    );
    expect(powers(e, keys('KeyG'), at(0, 0, 0))[1]).toBeGreaterThan(0);
    expect(powers(e, none, at(0, 45, 0))[1]).toBeGreaterThan(0); // keeps going after release
    expect(powers(e, none, at(0, 90, 0))[1]).toBe(0);
  });

  it('lets a key combination do something else than its keys alone', () => {
    const e = new ControlEngine(
      withBindings(
        base(),
        { inputs: ['KeyQ'], action: { kind: 'motor', port: 0, power: 30, toggle: false } },
        {
          inputs: ['Shift', 'KeyQ'],
          action: { kind: 'motor', port: 0, power: -30, toggle: false },
        },
      ),
    );
    expect(powers(e, keys('KeyQ'))).toEqual([30, 0, 0]);
    expect(powers(e, keys('KeyQ', 'Shift'))).toEqual([-30, 0, 0]);
  });

  it('reverses nothing itself: directions are the motor’s own', () => {
    const p = createProfile('two-wheel');
    p.motors[1].reversed = true;
    const e = new ControlEngine(p);
    expect(powers(e, keys('ArrowUp'))).toEqual([0, 60, 60]);
  });

  it('stops everything with the stop key', () => {
    const p = withBindings(
      base(),
      { inputs: ['KeyE'], action: { kind: 'motor', port: 2, power: 50, toggle: true } },
      { inputs: ['Space'], action: { kind: 'stop' } },
    );
    const e = new ControlEngine(p);
    e.tick(keys('KeyE'), at(0, 0, 0), 0);
    e.tick(none, at(0, 0, 0), 0);
    expect(powers(e, keys('Space'))).toEqual([0, 0, 0]);
    expect(powers(e, none)).toEqual([0, 0, 0]);
  });
});

describe('sequences', () => {
  const profile = (): Profile => {
    const p = createProfile('empty');
    p.sequences = [
      {
        id: 's1',
        name: 'Grab',
        steps: [
          {
            kind: 'run',
            ports: [0],
            power: 50,
            amount: { unit: 'seconds', value: 1 },
            then: 'brake',
          },
          { kind: 'tone', frequency: 880, seconds: 0.5 },
          {
            kind: 'run',
            ports: [1, 2],
            power: -40,
            amount: { unit: 'degrees', value: 180 },
            then: 'coast',
          },
        ],
      },
    ];
    p.bindings = [
      {
        id: 'b1',
        inputs: ['KeyG'],
        action: { kind: 'sequence', sequence: 's1', whileHeld: false },
      },
      { id: 'b2', inputs: ['KeyR'], action: { kind: 'sequence', sequence: 's1', whileHeld: true } },
    ];
    return p;
  };

  it('runs its steps one after another', () => {
    const e = new ControlEngine(profile());
    expect(e.tick(keys('KeyG'), at(0, 0, 0), 0).ports[0].power).toBe(50);
    expect(e.tick(none, at(500, 0, 0), 900).ports[0].power).toBe(50);
    // After a second: motor A brakes and the tone sounds.
    const t = e.tick(none, at(850, 0, 0), 1000);
    expect(t.ports[0]).toEqual({ power: 0, brake: true });
    expect(t.tone).toBe(880);
    // Then B and C turn back 180 degrees and coast.
    expect(e.tick(none, at(850, 0, 0), 1500).ports.map((p) => p.power)).toEqual([0, -40, -40]);
    expect(e.tick(none, at(850, -100, -100), 1600).ports[1].power).toBe(-40);
    const done = e.tick(none, at(850, -180, -180), 1700);
    expect(done.ports[1].power).toBe(0);
    expect(e.running).toEqual([]);
  });

  it('repeats while held and stops on release', () => {
    const e = new ControlEngine(profile());
    e.tick(keys('KeyR'), at(0, 0, 0), 0);
    expect(e.running).toEqual(['s1']);
    expect(e.tick(none, at(0, 0, 0), 100).ports[0].power).toBe(0);
    expect(e.running).toEqual([]);
  });

  it('can be started by hand', () => {
    const e = new ControlEngine(profile());
    e.startSequence('s1');
    expect(e.tick(none, at(0, 0, 0), 0).ports[0].power).toBe(50);
  });
});
