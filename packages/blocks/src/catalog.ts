import { newId } from './ids.js';
import type { Block, BlockKind, Condition, ConditionSource, SensorBlock } from './model.js';

/** Palette categories, coloured like the classic editor. */
export type Category = 'action' | 'sensor' | 'flow' | 'data' | 'advanced' | 'custom';

/** Describes one draggable palette entry. */
export interface PaletteEntry {
  /** Unique key within the palette. */
  key: string;
  label: string;
  category: Category;
  /** Icon name (FatCow icon file name without extension). Unique per entry. */
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
    case 'color':
      return {
        source,
        port: 3,
        mode: 'range',
        inside: true,
        from: 'red',
        to: 'red',
        compare: '>',
        value: 50,
        lamp: 'red',
      };
    case 'rotation':
      return { source, port: 'A', compare: '>', value: 1, unit: 'rotations' };
    case 'timer':
      return { source, timer: 1, compare: '>', seconds: 5 };
    case 'button':
      return { source, button: 'enter', action: 'pressed' };
    case 'variable':
      return { source, name: 'Number 1', compare: '>', value: 0 };
    case 'logic':
      return { source };
    case 'value':
      return { source, valueType: 'number' };
  }
}

/** Sensor sources usable by a standalone sensor block. */
export type SensorSource = SensorBlock['condition']['source'];

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
      return { id, kind, timer: 1 };
    case 'colorLamp':
      return { id, kind, port: 3, on: true, color: 'red' };
    case 'variable':
      return { id, kind, name: 'Number 1', action: 'set', value: 0 };
    case 'myBlock':
      return { id, kind, ref: '' };
    case 'sensor':
      return { id, kind, hub: true, condition: { source: 'touch', port: 1, action: 'pressed' } };
    case 'math':
      return { id, kind, hub: true, op: '+', a: 0, b: 0 };
    case 'compare':
      return { id, kind, hub: true, op: '<', a: 0, b: 0 };
    case 'logic':
      return { id, kind, hub: true, op: 'and', a: false, b: false };
    case 'range':
      return { id, kind, hub: true, inside: true, low: 0, high: 100, value: 50 };
    case 'random':
      return { id, kind, hub: true, min: 0, max: 100 };
    case 'numberToText':
      return { id, kind, hub: true, value: 0 };
    case 'text':
      return { id, kind, hub: true, a: '', b: '', c: '' };
  }
}

/** Creates a sensor block reading the given sensor. */
export function createSensorBlock(source: SensorSource): Block {
  return { ...createBlock('sensor'), condition: defaultCondition(source) } as Block;
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

/** Icon for each sensor source on sensor blocks, switches and loops. */
export const CONDITION_ICONS: Record<ConditionSource, string> = {
  touch: 'hand_point',
  light: 'lightbulb',
  sound: 'microphone',
  ultrasonic: 'eye',
  color: 'color_wheel',
  rotation: 'arrow_rotate_clockwise',
  timer: 'stopwatch_start',
  button: 'joystick',
  variable: 'tag_red',
  logic: 'arrow_join',
  value: 'chart_bullseye',
};

/** Icon for Wait blocks, distinct from the sensor block icons. */
export const WAIT_ICONS: Record<ConditionSource | 'time', string> = {
  time: 'hourglass',
  touch: 'hand_point_090',
  light: 'lightbulb_off',
  sound: 'sound_wave',
  ultrasonic: 'eye_half',
  color: 'color_picker',
  rotation: 'arrow_rotate_anticlockwise',
  timer: 'clock',
  button: 'button_navigation',
  variable: 'tag_red',
  logic: 'arrow_join',
  value: 'chart_bullseye',
};

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
    entry(
      'color-lamp',
      'Color Lamp',
      'action',
      'color_adjustment',
      'Turns the color sensor lamp on in red, green or blue, or off.',
      () => createBlock('colorLamp'),
    ),
    entry('wait-time', 'Wait: time', 'flow', WAIT_ICONS.time, 'Waits a number of seconds.', () =>
      createBlock('wait'),
    ),
    entry(
      'wait-touch',
      'Wait: touch',
      'flow',
      WAIT_ICONS.touch,
      'Waits until the touch sensor is pressed, released or bumped.',
      waitFor('touch'),
    ),
    entry(
      'wait-light',
      'Wait: light',
      'flow',
      WAIT_ICONS.light,
      'Waits until the light sensor reads above or below a level.',
      waitFor('light'),
    ),
    entry(
      'wait-sound',
      'Wait: sound',
      'flow',
      WAIT_ICONS.sound,
      'Waits until it is louder or quieter than a level.',
      waitFor('sound'),
    ),
    entry(
      'wait-ultrasonic',
      'Wait: distance',
      'flow',
      WAIT_ICONS.ultrasonic,
      'Waits until the ultrasonic sensor sees something nearer or farther than a distance.',
      waitFor('ultrasonic'),
    ),
    entry(
      'wait-color',
      'Wait: color',
      'flow',
      WAIT_ICONS.color,
      'Waits until the color sensor sees a color (or light level).',
      waitFor('color'),
    ),
    entry(
      'wait-rotation',
      'Wait: rotation',
      'flow',
      WAIT_ICONS.rotation,
      'Waits until a motor has turned a number of degrees or rotations.',
      waitFor('rotation'),
    ),
    entry(
      'wait-timer',
      'Wait: timer',
      'flow',
      WAIT_ICONS.timer,
      'Waits until a timer passes a number of seconds.',
      waitFor('timer'),
    ),
    entry(
      'wait-button',
      'Wait: NXT button',
      'flow',
      WAIT_ICONS.button,
      'Waits until a button on the brick is pressed, released or bumped.',
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
      'Runs one branch depending on a condition or a value.',
      () => createBlock('switch'),
    ),
    entry('stop', 'Stop', 'flow', 'stop', 'Ends the program.', () => createBlock('stop')),
    entry(
      'sensor-touch',
      'Touch sensor',
      'sensor',
      CONDITION_ICONS.touch,
      'Outputs whether the touch sensor is pressed.',
      () => createSensorBlock('touch'),
    ),
    entry(
      'sensor-light',
      'Light sensor',
      'sensor',
      CONDITION_ICONS.light,
      'Outputs the light level (0–100) and whether it passes the trigger point.',
      () => createSensorBlock('light'),
    ),
    entry(
      'sensor-sound',
      'Sound sensor',
      'sensor',
      CONDITION_ICONS.sound,
      'Outputs the sound level (0–100) and whether it passes the trigger point.',
      () => createSensorBlock('sound'),
    ),
    entry(
      'sensor-ultrasonic',
      'Ultrasonic sensor',
      'sensor',
      CONDITION_ICONS.ultrasonic,
      'Outputs the distance and whether it passes the trigger point.',
      () => createSensorBlock('ultrasonic'),
    ),
    entry(
      'sensor-color',
      'Color sensor',
      'sensor',
      CONDITION_ICONS.color,
      'NXT 2.0 color sensor: outputs the color seen (1–6) or a light level.',
      () => createSensorBlock('color'),
    ),
    entry(
      'sensor-rotation',
      'Rotation sensor',
      'sensor',
      CONDITION_ICONS.rotation,
      "Outputs a motor's position in degrees.",
      () => createSensorBlock('rotation'),
    ),
    entry(
      'sensor-timer',
      'Timer',
      'sensor',
      CONDITION_ICONS.timer,
      'Outputs the time since the timer was reset, in milliseconds.',
      () => createSensorBlock('timer'),
    ),
    entry(
      'sensor-button',
      'NXT buttons',
      'sensor',
      CONDITION_ICONS.button,
      'Outputs whether a button on the brick is pressed.',
      () => createSensorBlock('button'),
    ),
    entry(
      'reset-rotation',
      'Reset rotation',
      'sensor',
      'compass',
      "Resets a motor's rotation counter to zero.",
      () => createBlock('resetRotation'),
    ),
    entry(
      'reset-timer',
      'Reset timer',
      'sensor',
      'stopwatch_finish',
      'Resets a timer to zero.',
      () => createBlock('resetTimer'),
    ),
    entry(
      'logic',
      'Logic',
      'data',
      'arrow_join',
      'Combines yes/no values with and, or, xor or not.',
      () => createBlock('logic'),
    ),
    entry(
      'math',
      'Math',
      'data',
      'calculator',
      'Adds, subtracts, multiplies or divides two numbers.',
      () => createBlock('math'),
    ),
    entry(
      'compare',
      'Compare',
      'data',
      'arrow_divide',
      'Outputs yes when A is less than, greater than or equal to B.',
      () => createBlock('compare'),
    ),
    entry(
      'range',
      'Range',
      'data',
      'ruler',
      'Outputs yes when a number is inside (or outside) a range.',
      () => createBlock('range'),
    ),
    entry(
      'random',
      'Random',
      'data',
      'dice',
      'Outputs a random whole number between a minimum and maximum.',
      () => createBlock('random'),
    ),
    entry(
      'variable',
      'Variable',
      'data',
      'tag_red',
      'Reads a number variable, sets it, or changes it by an amount.',
      () => createBlock('variable'),
    ),
    entry(
      'number-to-text',
      'Number to text',
      'advanced',
      'textfield',
      'Turns a number into text, for the Display block.',
      () => createBlock('numberToText'),
    ),
    entry('text', 'Text', 'advanced', 'font', 'Joins up to three pieces of text.', () =>
      createBlock('text'),
    ),
  ].map((e) => [e.key, e]),
);

/** The short "Common" palette, as in the classic editor. */
export const COMMON_PALETTE = ['move', 'sound', 'display', 'wait-time', 'loop', 'switch'];

/** Wait presets shown in the Common palette's Wait fly-out. */
export const WAIT_PRESETS = [
  'wait-time',
  'wait-touch',
  'wait-light',
  'wait-sound',
  'wait-ultrasonic',
  'wait-color',
  'wait-rotation',
  'wait-timer',
  'wait-button',
];

/** The "Complete" palette: categories with their entries. Category icons are unique too. */
export const COMPLETE_PALETTE: {
  category: Category;
  label: string;
  icon: string;
  entries: string[];
}[] = [
  {
    category: 'action',
    label: 'Action',
    icon: 'lightning',
    entries: ['move', 'motor', 'sound', 'display', 'color-lamp'],
  },
  {
    category: 'sensor',
    label: 'Sensor',
    icon: 'radar_chart',
    entries: [
      'sensor-touch',
      'sensor-light',
      'sensor-sound',
      'sensor-ultrasonic',
      'sensor-color',
      'sensor-rotation',
      'sensor-timer',
      'sensor-button',
      'reset-rotation',
      'reset-timer',
    ],
  },
  {
    category: 'flow',
    label: 'Flow',
    icon: 'arrow_branch',
    entries: [...WAIT_PRESETS, 'loop', 'switch', 'stop'],
  },
  {
    category: 'data',
    label: 'Data',
    icon: 'database',
    entries: ['logic', 'math', 'compare', 'range', 'random', 'variable'],
  },
  {
    category: 'advanced',
    label: 'Advanced',
    icon: 'application_xp_terminal',
    entries: ['number-to-text', 'text'],
  },
];

/** Category of a placed block, used for its colour. */
export function categoryOf(block: Block): Category {
  switch (block.kind) {
    case 'move':
    case 'motor':
    case 'sound':
    case 'display':
    case 'colorLamp':
      return 'action';
    case 'sensor':
    case 'resetRotation':
    case 'resetTimer':
      return 'sensor';
    case 'variable':
    case 'math':
    case 'compare':
    case 'logic':
    case 'range':
    case 'random':
      return 'data';
    case 'numberToText':
    case 'text':
      return 'advanced';
    case 'myBlock':
      return 'custom';
    default:
      return 'flow';
  }
}

/** Icon for a placed block (matches its palette entry). */
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
    case 'colorLamp':
      return 'color_adjustment';
    case 'wait':
      return block.control.type === 'time'
        ? WAIT_ICONS.time
        : WAIT_ICONS[block.control.condition.source];
    case 'loop':
      return 'arrow_refresh';
    case 'switch':
      return 'arrow_switch';
    case 'stop':
      return 'stop';
    case 'resetRotation':
      return 'compass';
    case 'resetTimer':
      return 'stopwatch_finish';
    case 'variable':
      return 'tag_red';
    case 'myBlock':
      return 'bricks';
    case 'sensor':
      return CONDITION_ICONS[block.condition.source];
    case 'math':
      return 'calculator';
    case 'compare':
      return 'arrow_divide';
    case 'logic':
      return 'arrow_join';
    case 'range':
      return 'ruler';
    case 'random':
      return 'dice';
    case 'numberToText':
      return 'textfield';
    case 'text':
      return 'font';
  }
}

const SENSOR_LABELS: Record<SensorSource, string> = {
  touch: 'Touch sensor',
  light: 'Light sensor',
  sound: 'Sound sensor',
  ultrasonic: 'Ultrasonic sensor',
  color: 'Color sensor',
  rotation: 'Rotation sensor',
  timer: 'Timer',
  button: 'NXT buttons',
};

/** Human-readable name for a placed block. */
export function labelOf(block: Block): string {
  switch (block.kind) {
    case 'resetRotation':
      return 'Reset rotation';
    case 'resetTimer':
      return 'Reset timer';
    case 'colorLamp':
      return 'Color Lamp';
    case 'myBlock':
      return 'My Block';
    case 'sensor':
      return SENSOR_LABELS[block.condition.source];
    case 'numberToText':
      return 'Number to text';
    default:
      return block.kind.charAt(0).toUpperCase() + block.kind.slice(1);
  }
}
