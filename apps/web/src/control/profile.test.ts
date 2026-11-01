import { describe, expect, it } from 'vitest';
import {
  createProfile,
  describeAction,
  limitsOf,
  PRESETS,
  readProfile,
  steeringRoles,
} from './profile';

describe('control profiles', () => {
  it('builds every preset', () => {
    for (const { key } of PRESETS) {
      const p = createProfile(key);
      expect(readProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
    }
  });

  it('limits a car’s steering motor to its range', () => {
    const p = createProfile('car');
    expect(limitsOf(p, 0)).toEqual({ min: -60, max: 60 });
    expect(limitsOf(p, 1)).toBeNull();
    p.motors[0].limit = { enabled: true, min: -30, max: 90 };
    expect(limitsOf(p, 0)).toEqual({ min: -30, max: 60 });
  });

  it('repairs damaged data and rejects what is not a profile', () => {
    expect(readProfile(null)).toBeNull();
    expect(readProfile({ name: 'x' })).toBeNull();
    const p = readProfile({
      name: '',
      speed: 500,
      steering: { kind: 'car', drive: [1, 1, 0, 7], steer: 0, range: -5 },
      motors: [{ maxPower: 0, limit: { enabled: true, min: 10, max: -10 } }],
      bindings: [
        { inputs: ['KeyW', 3], action: { kind: 'motor', port: 9, power: 50 } },
        { inputs: ['KeyQ'], action: { kind: 'motor', port: 1, power: 250 } },
        { inputs: ['KeyX'], action: { kind: 'fly' } },
      ],
      sequences: [{ id: 's', steps: [{ kind: 'wait', seconds: -1 }, { kind: 'jump' }] }],
    })!;
    expect(p.name).toBe('Controls');
    expect(p.speed).toBe(100);
    expect(p.steering).toMatchObject({ kind: 'car', drive: [1], steer: 0, range: 1 });
    expect(p.motors[0]).toMatchObject({ maxPower: 1, limit: { min: 0, max: 0 } });
    expect(p.bindings).toHaveLength(1);
    expect(p.bindings[0]!.action).toMatchObject({ port: 1, power: 100 });
    expect(p.sequences[0]!.steps).toEqual([{ kind: 'wait', seconds: 0 }]);
  });

  it('describes steering roles and actions', () => {
    const car = createProfile('car');
    expect(steeringRoles(car.steering).get(0)).toBe('steering');
    expect(describeAction({ kind: 'drive', direction: 'left' }, car)).toBe('Steer left');
    expect(describeAction({ kind: 'motor', port: 0, power: 30, toggle: false }, car)).toBe(
      'Run motor A (Steering) at 30%',
    );
  });
});
