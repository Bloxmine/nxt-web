import { createBlock, createSensorBlock, defaultCondition } from './catalog.js';
import { newId } from './ids.js';
import type { Block, Program } from './model.js';
import { emptyProgram } from './project.js';

/** A ready-made program to learn from. */
export interface Example {
  key: string;
  name: string;
  description: string;
  /** How much experience it assumes. */
  level?: 'beginner' | 'intermediate' | 'advanced';
  /** Simulator mat it is made for (see @nxt/sim scenarios). */
  mat?: string;
  /** What it shows, e.g. "loops", "data wires". */
  topics?: string[];
  create(): Program;
}

const wire = (from: Block, fromPlug: string, to: Block, toPlug: string) => ({
  id: newId('w'),
  from: { block: from.id, plug: fromPlug },
  to: { block: to.id, plug: toPlug },
});

function make<K extends Block['kind']>(
  kind: K,
  patch: Partial<Extract<Block, { kind: K }>>,
): Block {
  return { ...createBlock(kind), ...patch } as Block;
}

const BASIC: Example[] = [
  {
    key: 'square',
    level: 'beginner',
    mat: 'square',
    topics: ['moving', 'loops'],
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
    level: 'beginner',
    mat: 'walls',
    topics: ['ultrasonic sensor', 'waits'],
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
    level: 'intermediate',
    mat: 'oval',
    topics: ['light sensor', 'switches'],
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
    level: 'beginner',
    mat: 'walls',
    topics: ['touch sensor', 'waits'],
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
  {
    key: 'distance',
    level: 'intermediate',
    mat: 'walls',
    topics: ['data wires', 'display'],
    name: 'Show distance',
    description:
      'Shows the ultrasonic distance on the screen using data wires. Ultrasonic sensor on port 4.',
    create: () => {
      const sensor = createSensorBlock('ultrasonic');
      const toText = createBlock('numberToText');
      const join = { ...createBlock('text'), a: 'Distance: ', c: ' cm' } as Block;
      const display = { ...createBlock('display'), hub: true } as Block;
      return {
        ...emptyProgram('Distance'),
        body: [
          make('loop', {
            control: { type: 'forever' },
            body: [
              sensor,
              toText,
              join,
              display,
              make('wait', { control: { type: 'time', seconds: 0.2 } }),
            ],
          }),
        ],
        wires: [
          wire(sensor, 'value', toText, 'number'),
          wire(toText, 'text', join, 'b'),
          wire(join, 'result', display, 'text'),
        ],
      };
    },
  },
  {
    key: 'parallel',
    level: 'intermediate',
    mat: 'square',
    topics: ['parallel beams', 'sound'],
    name: 'Drive and sing',
    description: 'Two beams at once: the robot drives a square while a second beam plays a tune.',
    create: () => ({
      ...emptyProgram('DriveSing'),
      body: [
        make('loop', {
          control: { type: 'count', count: 4 },
          body: [
            make('move', { duration: { unit: 'rotations', value: 2 } }),
            make('move', { steering: 100, power: 50, duration: { unit: 'degrees', value: 230 } }),
          ],
        }),
      ],
      parallel: [
        [
          make('loop', {
            control: { type: 'count', count: 4 },
            body: [
              make('sound', { frequency: 523, seconds: 0.3 }),
              make('sound', { frequency: 659, seconds: 0.3 }),
              make('sound', { frequency: 784, seconds: 0.6 }),
            ],
          }),
        ],
      ],
    }),
  },
];

const seq = (...blocks: Block[]) => blocks;
const touch = (port: 1 | 2 | 3 | 4 = 1) => ({ source: 'touch', port, action: 'pressed' }) as const;

/** More examples for the gallery (original programs; none are copied from LEGO). */
const GALLERY: Example[] = [
  {
    key: 'stopwatch',
    name: 'Stopwatch',
    description: 'Shows seconds counting up on the screen. Press Enter to start again from zero.',
    level: 'intermediate',
    topics: ['timer', 'data wires', 'buttons'],
    create: () => {
      const timer = { ...createSensorBlock('timer') } as Block;
      const seconds = make('math', { op: '/', b: 1000, hub: true });
      const toText = createBlock('numberToText');
      const show = make('display', { hub: true, line: 3, x: 30, clear: true });
      const check = make('switch', {
        condition: { source: 'button', button: 'enter', action: 'pressed' },
        whenTrue: [
          make('resetTimer', { timer: 1 }),
          make('sound', { frequency: 880, seconds: 0.1 }),
        ],
        whenFalse: [],
      });
      return {
        ...emptyProgram('Stopwatch'),
        body: [
          make('resetTimer', { timer: 1 }),
          make('loop', {
            control: { type: 'forever' },
            body: seq(
              timer,
              seconds,
              toText,
              show,
              check,
              make('wait', { control: { type: 'time', seconds: 0.1 } }),
            ),
          }),
        ],
        wires: [
          wire(timer, 'value', seconds, 'a'),
          wire(seconds, 'result', toText, 'number'),
          wire(toText, 'text', show, 'text'),
        ],
      };
    },
  },
  {
    key: 'clap',
    name: 'Clap to start',
    description:
      'Waits for a loud sound (sound sensor on port 2), then drives forward. In the simulator, move the microphone slider.',
    level: 'beginner',
    mat: 'empty',
    topics: ['sound sensor', 'waits'],
    create: () => ({
      ...emptyProgram('Clap'),
      body: [
        make('display', { text: 'Clap!', line: 4, x: 33 }),
        make('wait', {
          control: {
            type: 'sensor',
            condition: { source: 'sound', port: 2, compare: '>', value: 60, dba: false },
          },
        } as never),
        make('move', { duration: { unit: 'rotations', value: 3 } }),
        make('sound', { frequency: 660, seconds: 0.2 }),
      ],
    }),
  },
  {
    key: 'color-stop',
    name: 'Stop on red',
    description: 'Drives over the color bands and stops on red. Color sensor on port 3.',
    level: 'beginner',
    mat: 'colors',
    topics: ['color sensor', 'waits'],
    create: () => ({
      ...emptyProgram('StopOnRed'),
      body: [
        make('move', { power: 40, duration: { unit: 'unlimited' } }),
        make('wait', {
          control: {
            type: 'sensor',
            condition: {
              ...defaultCondition('color'),
              port: 3,
              mode: 'range',
              inside: true,
              from: 'red',
              to: 'red',
            },
          },
        } as never),
        make('move', { direction: 'stop' }),
        make('sound', { frequency: 523, seconds: 0.5 }),
      ],
    }),
  },
  {
    key: 'sumo',
    name: 'Sumo',
    description:
      'Stays inside the ring (light sensor on port 3 sees the black edge) and charges at anything the ultrasonic sensor on port 4 sees.',
    level: 'advanced',
    mat: 'sumo',
    topics: ['light sensor', 'ultrasonic sensor', 'nested switches'],
    create: () => ({
      ...emptyProgram('Sumo'),
      body: [
        make('loop', {
          control: { type: 'forever' },
          body: [
            make('switch', {
              condition: { source: 'light', port: 3, compare: '<', value: 35, floodlight: true },
              whenTrue: [
                make('move', { direction: 'backward', duration: { unit: 'rotations', value: 1 } }),
                make('move', {
                  steering: 100,
                  power: 50,
                  duration: { unit: 'degrees', value: 300 },
                }),
              ],
              whenFalse: [
                make('switch', {
                  condition: { source: 'ultrasonic', port: 4, compare: '<', value: 50, unit: 'cm' },
                  whenTrue: [make('move', { power: 100, duration: { unit: 'unlimited' } })],
                  whenFalse: [
                    make('move', { steering: 40, power: 40, duration: { unit: 'unlimited' } }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  },
  {
    key: 'barcode',
    name: 'Barcode counter',
    description:
      'Drives slowly along the cards and counts the black bands with the light sensor on port 3, showing the count.',
    level: 'advanced',
    mat: 'barcode',
    topics: ['variables', 'loops', 'light sensor'],
    create: () => {
      const count = make('variable', { name: 'Bands', action: 'change', value: 1, hub: true });
      const toText = createBlock('numberToText');
      const show = make('display', { hub: true, line: 3, x: 40, clear: true });
      return {
        ...emptyProgram('Barcode'),
        variables: [{ name: 'Bands', type: 'number' }],
        body: [
          make('variable', { name: 'Bands', action: 'set', value: 0 }),
          make('move', { power: 25, duration: { unit: 'unlimited' } }),
          make('loop', {
            control: { type: 'time', seconds: 12 },
            body: [
              make('wait', {
                control: {
                  type: 'sensor',
                  condition: {
                    source: 'light',
                    port: 3,
                    compare: '<',
                    value: 35,
                    floodlight: true,
                  },
                },
              } as never),
              count,
              toText,
              show,
              make('wait', {
                control: {
                  type: 'sensor',
                  condition: {
                    source: 'light',
                    port: 3,
                    compare: '>',
                    value: 45,
                    floodlight: true,
                  },
                },
              } as never),
            ],
          }),
          make('move', { direction: 'stop' }),
        ],
        wires: [wire(count, 'value', toText, 'number'), wire(toText, 'text', show, 'text')],
      };
    },
  },
  {
    key: 'random-explorer',
    name: 'Random explorer',
    description:
      'Drives until it bumps into something, then turns a random amount. Touch sensor on port 1.',
    level: 'intermediate',
    mat: 'walls',
    topics: ['random', 'data wires', 'touch sensor'],
    create: () => {
      const random = make('random', { min: 120, max: 400, hub: true });
      const turn = make('move', {
        steering: 100,
        power: 50,
        duration: { unit: 'degrees', value: 200 },
        hub: true,
      });
      return {
        ...emptyProgram('Explorer'),
        body: [
          make('loop', {
            control: { type: 'forever' },
            body: [
              make('move', { duration: { unit: 'unlimited' } }),
              make('wait', { control: { type: 'sensor', condition: touch() } } as never),
              make('move', { direction: 'backward', duration: { unit: 'rotations', value: 1 } }),
              random,
              turn,
            ],
          }),
        ],
        wires: [wire(random, 'value', turn, 'duration')],
      };
    },
  },
  {
    key: 'menu',
    name: 'Button menu',
    description:
      'Left and right arrows play a low or high note and show which one; Enter ends the program.',
    level: 'beginner',
    topics: ['buttons', 'switches'],
    create: () => ({
      ...emptyProgram('Menu'),
      body: [
        make('display', { text: '< low   high >', line: 4, x: 8 }),
        make('loop', {
          control: {
            type: 'sensor',
            condition: { source: 'button', button: 'enter', action: 'pressed' },
          },
          body: [
            make('switch', {
              condition: { source: 'button', button: 'left', action: 'pressed' },
              whenTrue: [
                make('display', { text: 'Low', line: 6, x: 40 }),
                make('sound', { frequency: 262, seconds: 0.2 }),
              ],
              whenFalse: [
                make('switch', {
                  condition: { source: 'button', button: 'right', action: 'pressed' },
                  whenTrue: [
                    make('display', { text: 'High', line: 6, x: 38 }),
                    make('sound', { frequency: 1047, seconds: 0.2 }),
                  ],
                  whenFalse: [],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  },
  {
    key: 'light-bar',
    name: 'Light meter',
    description:
      'Draws a bar as long as the light reading (light sensor on port 3). Drag the robot over the line to see it change.',
    level: 'intermediate',
    mat: 'oval',
    topics: ['data wires', 'display drawing'],
    create: () => {
      const light = {
        ...createSensorBlock('light'),
        condition: { source: 'light', port: 3, compare: '>', value: 50, floodlight: true },
      } as Block;
      const bar = make('display', {
        hub: true,
        action: 'drawing',
        shape: 'line',
        x: 0,
        y: 32,
        endY: 32,
        endX: 50,
        clear: true,
      });
      return {
        ...emptyProgram('LightBar'),
        body: [
          make('loop', {
            control: { type: 'forever' },
            body: [light, bar, make('wait', { control: { type: 'time', seconds: 0.1 } })],
          }),
        ],
        wires: [wire(light, 'value', bar, 'endX')],
      };
    },
  },
  {
    key: 'countdown',
    name: 'Countdown',
    description: 'Counts down from 10 on the screen, one number a second, then beeps.',
    level: 'beginner',
    topics: ['variables', 'loops'],
    create: () => {
      const read = make('variable', { name: 'Count', action: 'read', hub: true });
      const toText = createBlock('numberToText');
      const show = make('display', { hub: true, line: 4, x: 44, clear: true });
      return {
        ...emptyProgram('Countdown'),
        variables: [{ name: 'Count', type: 'number' }],
        body: [
          make('variable', { name: 'Count', action: 'set', value: 10 }),
          make('loop', {
            control: { type: 'count', count: 10 },
            body: [
              read,
              toText,
              show,
              make('wait', { control: { type: 'time', seconds: 1 } }),
              make('variable', { name: 'Count', action: 'change', value: -1 }),
            ],
          }),
          make('display', { text: 'Go!', line: 4, x: 40 }),
          make('sound', { frequency: 880, seconds: 0.6 }),
        ],
        wires: [wire(read, 'value', toText, 'number'), wire(toText, 'text', show, 'text')],
      };
    },
  },
  {
    key: 'spiral',
    name: 'Spiral',
    description:
      'Each side is a little longer than the last, so the robot drives a growing spiral.',
    level: 'intermediate',
    mat: 'empty',
    topics: ['variables', 'data wires'],
    create: () => {
      const length = make('variable', { name: 'Length', action: 'change', value: 0.3, hub: true });
      const side = make('move', {
        power: 50,
        duration: { unit: 'rotations', value: 1 },
        hub: true,
      });
      return {
        ...emptyProgram('Spiral'),
        variables: [{ name: 'Length', type: 'number' }],
        body: [
          make('variable', { name: 'Length', action: 'set', value: 0.5 }),
          make('loop', {
            control: { type: 'count', count: 12 },
            body: [
              length,
              side,
              make('move', { steering: 100, power: 40, duration: { unit: 'degrees', value: 230 } }),
            ],
          }),
        ],
        wires: [wire(length, 'value', side, 'duration')],
      };
    },
  },
];

/** All examples: the basics first, then the gallery. */
export const EXAMPLES: Example[] = [...BASIC, ...GALLERY];
