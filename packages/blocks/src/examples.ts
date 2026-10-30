import { createBlock, defaultCondition } from './catalog.js';
import type { Block, Program } from './model.js';
import { emptyProgram } from './project.js';

/** A ready-made program to learn from. */
export interface Example {
  key: string;
  name: string;
  description: string;
  create(): Program;
}

function make<K extends Block['kind']>(
  kind: K,
  patch: Partial<Extract<Block, { kind: K }>>,
): Block {
  return { ...createBlock(kind), ...patch } as Block;
}

export const EXAMPLES: Example[] = [
  {
    key: 'square',
    name: 'Drive in a square',
    description: 'Drives forward and turns, four times. Motors on B and C.',
    create: () => ({
      ...emptyProgram('Square'),
      body: [
        make('loop', {
          control: { type: 'count', count: 4 },
          body: [
            make('move', { duration: { unit: 'rotations', value: 2 } }),
            make('move', { steering: 100, power: 50, duration: { unit: 'degrees', value: 230 } }),
          ],
        }),
        make('sound', { frequency: 880, seconds: 0.3 }),
      ],
    }),
  },
  {
    key: 'avoid',
    name: 'Avoid obstacles',
    description:
      'Drives until something is closer than 25 cm, then backs up and turns. Ultrasonic sensor on port 4.',
    create: () => ({
      ...emptyProgram('Avoid'),
      body: [
        make('loop', {
          control: { type: 'forever' },
          body: [
            make('move', { duration: { unit: 'unlimited' } }),
            make('wait', {
              control: {
                type: 'sensor',
                condition: { ...defaultCondition('ultrasonic'), value: 25 },
              },
            } as never),
            make('sound', { frequency: 660, seconds: 0.2, wait: false }),
            make('move', { direction: 'backward', duration: { unit: 'rotations', value: 1 } }),
            make('move', { steering: -100, power: 50, duration: { unit: 'degrees', value: 200 } }),
          ],
        }),
      ],
    }),
  },
  {
    key: 'line',
    name: 'Line follower',
    description: 'Follows the edge of a dark line. Light sensor on port 3, motors on B and C.',
    create: () => ({
      ...emptyProgram('LineFollow'),
      body: [
        make('loop', {
          control: { type: 'forever' },
          body: [
            make('switch', {
              condition: { source: 'light', port: 3, compare: '<', value: 45, floodlight: true },
              whenTrue: [
                make('move', { steering: -40, power: 40, duration: { unit: 'unlimited' } }),
              ],
              whenFalse: [
                make('move', { steering: 40, power: 40, duration: { unit: 'unlimited' } }),
              ],
            }),
          ],
        }),
      ],
    }),
  },
  {
    key: 'bumper',
    name: 'Bumper car',
    description: 'Drives until the touch sensor on port 1 is pressed, then reverses and turns.',
    create: () => ({
      ...emptyProgram('Bumper'),
      body: [
        make('loop', {
          control: { type: 'forever' },
          body: [
            make('move', { duration: { unit: 'unlimited' } }),
            make('wait', {
              control: { type: 'sensor', condition: defaultCondition('touch') },
            } as never),
            make('move', { direction: 'backward', duration: { unit: 'rotations', value: 1 } }),
            make('move', { steering: 100, power: 50, duration: { unit: 'degrees', value: 180 } }),
          ],
        }),
      ],
    }),
  },
];
