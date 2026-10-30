import { describe, expect, it } from 'vitest';
import { DEFAULT_ROBOT, degreesForDistance, degreesForTurn } from './robot';

describe('distance and turn calculator', () => {
  it('one wheel turn drives one circumference', () => {
    expect(degreesForDistance(Math.PI * 5.6, DEFAULT_ROBOT)).toBeCloseTo(360);
  });
  it('turns: a pivot needs twice the wheel travel of a spin', () => {
    const spin = degreesForTurn(90, DEFAULT_ROBOT, 'spin');
    expect(degreesForTurn(90, DEFAULT_ROBOT, 'pivot')).toBeCloseTo(spin * 2);
    // Track 14 cm, wheel 5.6 cm: a 90° spin is (π·7/2)/(π·5.6)·360 = 225°.
    expect(spin).toBeCloseTo(225);
  });
});
