import { newId } from './ids.js';
import type { Block, BlockKind, Condition, ConditionSource } from './model.js';

/** Palette categories, coloured like the classic editor. */
export type Category = 'action' | 'sensor' | 'flow' | 'data' | 'custom';

/** Describes one draggable palette entry. */
export interface PaletteEntry {
  /** Unique key within the palette. */
  key: string;
  label: string;
  category: Category;
  /** Icon name (FatCow icon file name without extension). */
  icon: string;
  help: string;
  create(): Block;
}

/** Default condition for each condition source (classic editor defaults). */
export function defaultCondition(source: ConditionSource): Condition {
  switch (source) {
    case 'touch':
      return { source, port: 1, action: 'pressed' };
    case 'light':
      return { source, port: 3, compare: '>', value: 50, floodlight: true };
    case 'sound':
      return { source, port: 2, compare: '>', value: 50, dba: false };
    case 'ultrasonic':
      return { source, port: 4, compare: '<', value: 50, unit: 'cm' };
    case 'rotation':
      return { source, port: 'A', compare: '>', value: 1, unit: 'rotations' };
    case 'timer':
      return { source, compare: '>', seconds: 5 };
    case 'button':
      return { source, button: 'enter', action: 'pressed' };
    case 'variable':
      return { source, name: 'Number 1', compare: '>', value: 0 };
  }
}

/** Creates a block of the given kind with default settings. */
export function createBlock(kind: BlockKind): Block {
  const id = newId();
  switch (kind) {
    case 'move':
      return {
        id,
        kind,
        ports: ['B', 'C'],
        direction: 'forward',
        steering: 0,
        power: 75,
        duration: { unit: 'rotations', value: 1 },
        nextAction: 'brake',
      };
    case 'motor':
      return {
        id,
        kind,
        port: 'A',
        direction: 'forward',
        power: 75,
        regulated: false,
        duration: { unit: 'unlimited' },
        wait: true,
        nextAction: 'brake',
      };
    case 'sound':
      return {
        id,
        kind,
        action: 'tone',
        frequency: 440,
        file: 'Good Job',
        seconds: 0.5,
        volume: 75,
        wait: true,
        repeat: false,
      };
    case 'display':
      return {
        id,
        kind,
        action: 'text',
        text: 'Hello',
        variable: 'Number 1',
        x: 0,
        line: 4,
        clear: true,
      };
    case 'wait':
      return { id, kind, control: { type: 'time', seconds: 1 } };
    case 'loop':
      return { id, kind, control: { type: 'forever' }, body: [] };
    case 'switch':
      return { id, kind, condition: defaultCondition('touch'), whenTrue: [], whenFalse: [] };
    case 'stop':
      return { id, kind };
    case 'resetRotation':
      return { id, kind, port: 'A' };
    case 'resetTimer':
      return { id, kind };
    case 'variable':
      return { id, kind, name: 'Number 1', action: 'set', value: 0 };
    case 'myBlock':
      return { id, kind, ref: '' };
  }
}

function waitFor(source: ConditionSource): () => Block {
  return () => ({
    id: newId(),
    kind: 'wait',
    control: { type: 'sensor', condition: defaultCondition(source) },
  });
}

const entry = (
  key: string,
  label: string,
  category: Category,
  icon: string,
  help: string,
  create: () => Block,
): PaletteEntry => ({ key, label, category, icon, help, create });

/** Every palette entry, keyed by `key`. */
export const PALETTE: Record<string, PaletteEntry> = Object.fromEntries(
  [
    entry(
      'move',
      'Move',
      'action',
      'car',
      'Drives two motors together so the robot goes straight or turns.',
      () => createBlock('move'),
    ),
    entry('motor', 'Motor', 'action', 'cog', 'Controls a single motor.', () =>
      createBlock('motor'),
    ),
    entry('sound', 'Sound', 'action', 'sound', 'Plays a tone or a sound file on the brick.', () =>
      createBlock('sound'),
    ),
    entry(
      'display',
      'Display',
      'action',
      'monitor',
      'Shows text or a number on the brick screen.',
      () => createBlock('display'),
    ),
    entry('wait-time', 'Wait: time', 'flow', 'hourglass', 'Waits a number of seconds.', () =>
      createBlock('wait'),
    ),
    entry(
      'wait-touch',
      'Wait: touch',
      'flow',
      'hand_point',
      'Waits until the touch sensor is pressed, released or bumped.',
      waitFor('touch'),
    ),
    entry(
      'wait-light',
      'Wait: light',
      'flow',
      'lightbulb',
      'Waits until the light sensor reads above or below a level.',
      waitFor('light'),
    ),
    entry(
      'wait-sound',
      'Wait: sound',
      'flow',
      'microphone',
      'Waits until it is louder or quieter than a level.',
      waitFor('sound'),
    ),
    entry(
      'wait-ultrasonic',
      'Wait: distance',
      'flow',
      'eye',
      'Waits until the ultrasonic sensor sees something nearer or farther than a distance.',
      waitFor('ultrasonic'),
    ),
    entry(
      'wait-rotation',
      'Wait: rotation',
      'flow',
      'arrow_rotate_clockwise',
      'Waits until a motor has turned a number of degrees or rotations.',
      waitFor('rotation'),
    ),
    entry(
      'wait-timer',
      'Wait: timer',
      'flow',
      'stopwatch_start',
      'Waits until the timer passes a number of seconds.',
      waitFor('timer'),
    ),
    entry(
      'wait-button',
      'Wait: NXT button',
      'flow',
      'joystick',
      'Waits until a button on the brick is pressed or released.',
      waitFor('button'),
    ),
    entry(
      'loop',
      'Loop',
      'flow',
      'arrow_refresh',
      'Repeats the blocks inside it forever, a number of times, or until a condition.',
      () => createBlock('loop'),
    ),
    entry(
      'switch',
      'Switch',
      'flow',
      'arrow_switch',
      'Runs the top or bottom branch depending on a condition.',
      () => createBlock('switch'),
    ),
    entry('stop', 'Stop', 'flow', 'stop', 'Ends the program.', () => createBlock('stop')),
    entry(
      'reset-rotation',
      'Reset rotation',
      'sensor',
      'arrow_rotate_clockwise',
      "Resets a motor's rotation counter to zero.",
      () => createBlock('resetRotation'),
    ),
    entry(
      'reset-timer',
      'Reset timer',
      'sensor',
      'stopwatch_start',
      'Resets the timer to zero.',
      () => createBlock('resetTimer'),
    ),
    entry(
      'variable',
      'Variable',
      'data',
      'tag_red',
      'Sets a number variable or changes it by an amount.',
      () => createBlock('variable'),
    ),
  ].map((e) => [e.key, e]),
);

/** The short "Common" palette, as in the classic editor. */
export const COMMON_PALETTE = ['move', 'sound', 'display', 'wait-time', 'loop', 'switch'];

/** Wait presets shown when hovering the Common palette's Wait button. */
export const WAIT_PRESETS = [
  'wait-time',
  'wait-touch',
  'wait-light',
  'wait-sound',
  'wait-ultrasonic',
  'wait-rotation',
  'wait-timer',
  'wait-button',
];

/** The "Complete" palette: categories with their entries. */
export const COMPLETE_PALETTE: {
  category: Category;
  label: string;
  icon: string;
  entries: string[];
}[] = [
  {
    category: 'action',
    label: 'Action',
    icon: 'cog',
    entries: ['move', 'motor', 'sound', 'display'],
  },
  {
    category: 'sensor',
    label: 'Sensor',
    icon: 'hand_point',
    entries: ['reset-rotation', 'reset-timer'],
  },
  {
    category: 'flow',
    label: 'Flow',
    icon: 'arrow_refresh',
    entries: [...WAIT_PRESETS, 'loop', 'switch', 'stop'],
  },
  { category: 'data', label: 'Data', icon: 'tag_red', entries: ['variable'] },
];

/** Category of a placed block, used for its colour. */
export function categoryOf(block: Block): Category {
  switch (block.kind) {
    case 'move':
    case 'motor':
    case 'sound':
    case 'display':
      return 'action';
    case 'resetRotation':
    case 'resetTimer':
      return 'sensor';
    case 'variable':
      return 'data';
    case 'myBlock':
      return 'custom';
    default:
      return 'flow';
  }
}

/** Icon for a condition source. */
export const CONDITION_ICONS: Record<ConditionSource, string> = {
  touch: 'hand_point',
  light: 'lightbulb',
  sound: 'microphone',
  ultrasonic: 'eye',
  rotation: 'arrow_rotate_clockwise',
  timer: 'stopwatch_start',
  button: 'joystick',
  variable: 'tag_red',
};

/** Icon for a placed block. */
export function iconOf(block: Block): string {
  switch (block.kind) {
    case 'move':
      return 'car';
    case 'motor':
      return 'cog';
    case 'sound':
      return 'sound';
    case 'display':
      return 'monitor';
    case 'wait':
      return block.control.type === 'time'
        ? 'hourglass'
        : CONDITION_ICONS[block.control.condition.source];
    case 'loop':
      return 'arrow_refresh';
    case 'switch':
      return 'arrow_switch';
    case 'stop':
      return 'stop';
    case 'resetRotation':
      return 'arrow_rotate_clockwise';
    case 'resetTimer':
      return 'stopwatch_start';
    case 'variable':
      return 'tag_red';
    case 'myBlock':
      return 'bricks';
  }
}

/** Human-readable name for a placed block. */
export function labelOf(block: Block): string {
  switch (block.kind) {
    case 'resetRotation':
      return 'Reset rotation';
    case 'resetTimer':
      return 'Reset timer';
    case 'myBlock':
      return 'My Block';
    default:
      return block.kind.charAt(0).toUpperCase() + block.kind.slice(1);
  }
}
