import * as Blockly from 'blockly';
import { CONDITION_SOURCES, PORT_SET_NAMES } from './convert';

/**
 * Blockly block definitions and theme for the modern view. Loaded on demand (dynamic
 * import), so the classic editor does not pay for Blockly.
 */

const COLOR = {
  action: '#39a12f',
  sensor: '#c2a800',
  flow: '#e17f12',
  data: '#d8402f',
  custom: '#3b9be0',
  classic: '#8a8f96',
};

const dd = (items: readonly (readonly [string, string])[]) =>
  items.map(([label, value]) => [label, value]);
const DIRECTION = dd([
  ['forward', 'forward'],
  ['backward', 'backward'],
  ['stop', 'stop'],
]);
const UNIT = dd([
  ['unlimited', 'unlimited'],
  ['degrees', 'degrees'],
  ['rotations', 'rotations'],
  ['seconds', 'seconds'],
]);
const NEXT = dd([
  ['brake', 'brake'],
  ['coast', 'coast'],
]);

/** The generic condition fields (source, port, compare, value, action, button). */
const conditionArgs = (first: number) => ({
  text: `%${first} %${first + 1} %${first + 2} %${first + 3} %${first + 4} %${first + 5} %${first + 6}`,
  args: [
    {
      type: 'field_dropdown',
      name: 'SOURCE',
      options: dd(CONDITION_SOURCES.map((s) => [s, s] as const)),
    },
    { type: 'field_label', name: 'L_ON', text: 'on' },
    {
      type: 'field_dropdown',
      name: 'PORT',
      options: dd([
        ['port 1', '1'],
        ['port 2', '2'],
        ['port 3', '3'],
        ['port 4', '4'],
        ['motor A', 'A'],
        ['motor B', 'B'],
        ['motor C', 'C'],
      ]),
    },
    {
      type: 'field_dropdown',
      name: 'COMPARE',
      options: dd([
        ['<', '<'],
        ['>', '>'],
      ]),
    },
    { type: 'field_number', name: 'VALUE', value: 50 },
    {
      type: 'field_dropdown',
      name: 'ACTION',
      options: dd([
        ['pressed', 'pressed'],
        ['released', 'released'],
        ['bumped', 'bumped'],
      ]),
    },
    {
      type: 'field_dropdown',
      name: 'BUTTON',
      options: dd([
        ['enter', 'enter'],
        ['left', 'left'],
        ['right', 'right'],
      ]),
    },
  ],
});

let defined = false;

const CONDITION_FIELDS = ['SOURCE', 'L_ON', 'PORT', 'COMPARE', 'VALUE', 'ACTION', 'BUTTON'];

/** Shows only the fields that apply to the chosen loop mode and sensor. */
function updateVisibility(block: Blockly.Block): void {
  const show = (name: string, visible: boolean) => block.getField(name)?.setVisible(visible);
  const mode = block.getField('MODE') ? block.getFieldValue('MODE') : 'sensor';
  show('COUNT', mode === 'count');
  show('L_TIMES', mode === 'count');
  show('SECONDS', mode === 'time');
  show('L_S', mode === 'time');
  show('L_UNTIL', mode === 'sensor');
  const sensor = mode === 'sensor';
  const source = block.getFieldValue('SOURCE');
  const pressed = source === 'touch' || source === 'button';
  for (const f of CONDITION_FIELDS) show(f, sensor);
  if (sensor) {
    show('L_ON', source !== 'button');
    show('PORT', source !== 'button');
    show('COMPARE', !pressed);
    show('VALUE', !pressed);
    show('ACTION', pressed);
    show('BUTTON', source === 'button');
  }
  if (block instanceof Blockly.BlockSvg && block.rendered) block.queueRender();
}

/** Registers the NXT blocks (once). */
export function defineBlocks(): void {
  if (defined) return;
  defined = true;
  Blockly.Extensions.register('nxt_visibility', function (this: Blockly.Block) {
    updateVisibility(this);
    this.setOnChange(() => updateVisibility(this));
  });
  const cond = (n: number) => conditionArgs(n);
  Blockly.common.defineBlocksWithJsonArray([
    {
      type: 'nxt_start',
      message0: 'start %1',
      args0: [{ type: 'field_label_serializable', name: 'LANE', text: 'main beam' }],
      nextStatement: null,
      colour: COLOR.flow,
      tooltip: 'Program start. Each start block is a beam; extra ones run at the same time.',
      hat: 'cap',
    },
    {
      type: 'nxt_myblock_start',
      message0: 'My Block',
      nextStatement: null,
      colour: COLOR.custom,
      hat: 'cap',
    },
    {
      type: 'nxt_move',
      message0: 'move %1 %2 steering %3 power %4 %5 %6 then %7',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PORTS',
          options: dd(PORT_SET_NAMES.map((p) => [p, p] as const)),
        },
        { type: 'field_dropdown', name: 'DIRECTION', options: DIRECTION },
        { type: 'field_number', name: 'STEERING', value: 0, min: -100, max: 100 },
        { type: 'field_number', name: 'POWER', value: 75, min: 0, max: 100 },
        { type: 'field_number', name: 'VALUE', value: 1, min: 0 },
        { type: 'field_dropdown', name: 'UNIT', options: UNIT },
        { type: 'field_dropdown', name: 'NEXT', options: NEXT },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.action,
      tooltip: 'Drives two motors together.',
    },
    {
      type: 'nxt_motor',
      message0: 'motor %1 %2 power %3 %4 %5 wait %6 then %7',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PORT',
          options: dd([
            ['A', 'A'],
            ['B', 'B'],
            ['C', 'C'],
          ]),
        },
        { type: 'field_dropdown', name: 'DIRECTION', options: DIRECTION },
        { type: 'field_number', name: 'POWER', value: 75, min: 0, max: 100 },
        { type: 'field_number', name: 'VALUE', value: 1, min: 0 },
        { type: 'field_dropdown', name: 'UNIT', options: UNIT },
        { type: 'field_checkbox', name: 'WAIT', checked: true },
        { type: 'field_dropdown', name: 'NEXT', options: NEXT },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.action,
    },
    {
      type: 'nxt_sound',
      message0: 'sound %1 %2 Hz file %3 for %4 s volume %5 wait %6',
      args0: [
        {
          type: 'field_dropdown',
          name: 'ACTION',
          options: dd([
            ['tone', 'tone'],
            ['file', 'file'],
            ['stop', 'stop'],
          ]),
        },
        { type: 'field_number', name: 'FREQ', value: 440, min: 100, max: 14000 },
        { type: 'field_input', name: 'FILE', text: 'Good Job' },
        { type: 'field_number', name: 'SECONDS', value: 0.5, min: 0 },
        { type: 'field_number', name: 'VOLUME', value: 75, min: 0, max: 100 },
        { type: 'field_checkbox', name: 'WAIT', checked: true },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#a3c425',
    },
    {
      type: 'nxt_display',
      message0: 'display %1 %2 at x %3 line %4 clear %5',
      args0: [
        {
          type: 'field_dropdown',
          name: 'ACTION',
          options: dd([
            ['text', 'text'],
            ['image', 'image'],
            ['reset', 'reset'],
          ]),
        },
        { type: 'field_input', name: 'TEXT', text: 'Hello' },
        { type: 'field_number', name: 'X', value: 0, min: 0, max: 99 },
        { type: 'field_number', name: 'LINE', value: 4, min: 1, max: 8 },
        { type: 'field_checkbox', name: 'CLEAR', checked: true },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.action,
    },
    {
      type: 'nxt_wait_time',
      message0: 'wait %1 s',
      args0: [{ type: 'field_number', name: 'SECONDS', value: 1, min: 0 }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.flow,
    },
    {
      type: 'nxt_wait_until',
      message0: `wait until ${cond(1).text}`,
      args0: cond(1).args,
      extensions: ['nxt_visibility'],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.sensor,
      tooltip: 'Touch and buttons use the action; the others compare their value.',
    },
    {
      type: 'nxt_loop',
      message0: `repeat %1 %2 %3 %4 %5 %6 ${cond(7).text}`,
      args0: [
        {
          type: 'field_dropdown',
          name: 'MODE',
          options: dd([
            ['forever', 'forever'],
            ['count', 'count'],
            ['time', 'time'],
            ['until sensor', 'sensor'],
          ]),
        },
        { type: 'field_number', name: 'COUNT', value: 4, min: 0 },
        { type: 'field_label', name: 'L_TIMES', text: 'times' },
        { type: 'field_number', name: 'SECONDS', value: 5, min: 0 },
        { type: 'field_label', name: 'L_S', text: 's' },
        { type: 'field_label', name: 'L_UNTIL', text: 'until' },
        ...cond(7).args,
      ],
      extensions: ['nxt_visibility'],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.flow,
    },
    {
      type: 'nxt_switch',
      message0: `if ${cond(1).text}`,
      args0: cond(1).args,
      extensions: ['nxt_visibility'],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'YES' }],
      message2: 'else %1',
      args2: [{ type: 'input_statement', name: 'NO' }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.flow,
    },
    { type: 'nxt_stop', message0: 'stop program', previousStatement: null, colour: COLOR.flow },
    {
      type: 'nxt_reset_rotation',
      message0: 'reset rotation of motor %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PORT',
          options: dd([
            ['A', 'A'],
            ['B', 'B'],
            ['C', 'C'],
          ]),
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.sensor,
    },
    {
      type: 'nxt_reset_timer',
      message0: 'reset timer %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'TIMER',
          options: dd([
            ['1', '1'],
            ['2', '2'],
            ['3', '3'],
          ]),
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.sensor,
    },
    {
      type: 'nxt_color_lamp',
      message0: 'color lamp on port %1 on %2 %3',
      args0: [
        {
          type: 'field_dropdown',
          name: 'PORT',
          options: dd([
            ['1', '1'],
            ['2', '2'],
            ['3', '3'],
            ['4', '4'],
          ]),
        },
        { type: 'field_checkbox', name: 'ON', checked: true },
        {
          type: 'field_dropdown',
          name: 'COLOR',
          options: dd([
            ['red', 'red'],
            ['green', 'green'],
            ['blue', 'blue'],
          ]),
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.action,
    },
    {
      type: 'nxt_variable',
      message0: 'variable %1 %2 %3',
      args0: [
        { type: 'field_input', name: 'NAME', text: 'Number 1' },
        {
          type: 'field_dropdown',
          name: 'ACTION',
          options: dd([
            ['set to', 'set'],
            ['change by', 'change'],
          ]),
        },
        { type: 'field_number', name: 'VALUE', value: 0 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.data,
    },
    {
      type: 'nxt_classic',
      message0: '%1',
      args0: [{ type: 'field_label_serializable', name: 'LABEL', text: 'block' }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOR.classic,
      tooltip: 'Edit this block’s settings below, or in classic view (its data wires too).',
    },
  ]);
}

/** Toolbox by category. */
export const TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Action',
      colour: COLOR.action,
      contents: ['nxt_move', 'nxt_motor', 'nxt_sound', 'nxt_display', 'nxt_color_lamp'].map(
        (type) => ({ kind: 'block', type }),
      ),
    },
    {
      kind: 'category',
      name: 'Flow',
      colour: COLOR.flow,
      contents: [
        'nxt_start',
        'nxt_wait_time',
        'nxt_wait_until',
        'nxt_loop',
        'nxt_switch',
        'nxt_stop',
      ].map((type) => ({ kind: 'block', type })),
    },
    {
      kind: 'category',
      name: 'Sensor',
      colour: COLOR.sensor,
      contents: ['nxt_reset_rotation', 'nxt_reset_timer'].map((type) => ({ kind: 'block', type })),
    },
    {
      kind: 'category',
      name: 'Data',
      colour: COLOR.data,
      contents: [{ kind: 'block', type: 'nxt_variable' }],
    },
  ],
};

/** Light and dark themes matching the app. */
export function theme(dark: boolean): Blockly.Theme {
  return Blockly.Theme.defineTheme(dark ? 'nxt-dark' : 'nxt-light', {
    name: dark ? 'nxt-dark' : 'nxt-light',
    base: Blockly.Themes.Classic,
    componentStyles: dark
      ? {
          workspaceBackgroundColour: '#1f2125',
          toolboxBackgroundColour: '#2b2d31',
          toolboxForegroundColour: '#e4e6ea',
          flyoutBackgroundColour: '#34373c',
          flyoutForegroundColour: '#e4e6ea',
          flyoutOpacity: 0.95,
          scrollbarColour: '#5a5e66',
          insertionMarkerColour: '#ffffff',
          insertionMarkerOpacity: 0.3,
          cursorColour: '#d0d0d0',
        }
      : {
          workspaceBackgroundColour: '#f8f7f1',
          toolboxBackgroundColour: '#ece9d8',
          flyoutBackgroundColour: '#dcd9cb',
          flyoutOpacity: 0.95,
        },
  });
}

export { Blockly };
