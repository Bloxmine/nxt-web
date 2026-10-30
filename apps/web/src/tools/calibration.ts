import { conditionOf, type Block, type Condition } from '@nxt/blocks';

export type Calibratable = Extract<Condition, { value: number }>;

/** Conditions with a threshold the calibration wizard can set. */
export function calibratable(c: Condition | null): c is Calibratable {
  return (
    c !== null &&
    (c.source === 'light' ||
      c.source === 'sound' ||
      c.source === 'ultrasonic' ||
      (c.source === 'color' && c.mode === 'light'))
  );
}

/** True when Tools → Calibrate sensor can set this block's trigger value. */
export function canCalibrate(block: Block | undefined): boolean {
  return block !== undefined && calibratable(conditionOf(block));
}
