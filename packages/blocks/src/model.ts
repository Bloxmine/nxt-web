/**
 * Program model for the classic sequence-beam editor.
 *
 * A program is a sequence of blocks on a beam, plus optional parallel beams
 * that run at the same time. Loops and switches contain nested sequences.
 * Blocks have data plugs on a fold-out hub; wires carry values from an output
 * plug to an input plug, overriding the block's configured setting.
 */

export type MotorPort = 'A' | 'B' | 'C';
export type SensorPort = 1 | 2 | 3 | 4;
export type Compare = '<' | '>';

/** How long a motor runs. */
export type Duration =
  { unit: 'unlimited' } | { unit: 'degrees' | 'rotations' | 'seconds'; value: number };

/** Something a Wait, Loop or Switch can test. */
export type Condition =
  | { source: 'touch'; port: SensorPort; action: 'pressed' | 'released' | 'bumped' }
  | { source: 'light'; port: SensorPort; compare: Compare; value: number; floodlight: boolean }
  | { source: 'sound'; port: SensorPort; compare: Compare; value: number; dba: boolean }
  | { source: 'ultrasonic'; port: SensorPort; compare: Compare; value: number; unit: 'cm' | 'in' }
  | {
      source: 'rotation';
      port: MotorPort;
      compare: Compare;
      value: number;
      unit: 'degrees' | 'rotations';
    }
  | { source: 'timer'; compare: Compare; seconds: number }
  | { source: 'button'; button: 'left' | 'right' | 'enter'; action: 'pressed' | 'released' }
  | { source: 'variable'; name: string; compare: Compare | '='; value: number }
  /** A logic value wired into the block's "condition" plug (Loop and Switch only). */
  | { source: 'logic' };

export type ConditionSource = Condition['source'];

interface Base {
  id: string;
  /** Whether the data hub is folded out. */
  hub?: boolean;
}

export interface MoveBlock extends Base {
  kind: 'move';
  ports: MotorPort[];
  direction: 'forward' | 'backward' | 'stop';
  /** −100 (left) .. 100 (right); only used with two ports. */
  steering: number;
  /** 0..100 */
  power: number;
  duration: Duration;
  nextAction: 'brake' | 'coast';
}

export interface MotorBlock extends Base {
  kind: 'motor';
  port: MotorPort;
  direction: 'forward' | 'backward' | 'stop';
  power: number;
  /** Speed regulation ("motor power" control). */
  regulated: boolean;
  duration: Duration;
  /** For degree/rotation durations: wait until the motor finishes. */
  wait: boolean;
  nextAction: 'brake' | 'coast';
}

export interface SoundBlock extends Base {
  kind: 'sound';
  action: 'tone' | 'file' | 'stop';
  /** Hz, 200..14000 */
  frequency: number;
  /** Sound file name on the brick, without ".rso". */
  file: string;
  seconds: number;
  /** 0..100 */
  volume: number;
  wait: boolean;
  repeat: boolean;
}

export interface DisplayBlock extends Base {
  kind: 'display';
  action: 'text' | 'variable' | 'reset';
  text: string;
  /** Variable whose value to show when action is "variable". */
  variable: string;
  /** 0..99 pixels from the left. */
  x: number;
  /** Text line 1..8 from the top. */
  line: number;
  /** Clear the screen first. */
  clear: boolean;
}

export interface WaitBlock extends Base {
  kind: 'wait';
  control: { type: 'time'; seconds: number } | { type: 'sensor'; condition: Condition };
}

export interface LoopBlock extends Base {
  kind: 'loop';
  control:
    | { type: 'forever' }
    | { type: 'count'; count: number }
    | { type: 'time'; seconds: number }
    | { type: 'sensor'; condition: Condition };
  /** Show the loop counter output plug. */
  showCounter?: boolean;
  body: Block[];
}

export interface SwitchBlock extends Base {
  kind: 'switch';
  condition: Condition;
  whenTrue: Block[];
  whenFalse: Block[];
}

export interface StopBlock extends Base {
  kind: 'stop';
}

export interface ResetRotationBlock extends Base {
  kind: 'resetRotation';
  port: MotorPort;
}

export interface ResetTimerBlock extends Base {
  kind: 'resetTimer';
}

export interface VariableBlock extends Base {
  kind: 'variable';
  name: string;
  action: 'read' | 'set' | 'change';
  value: number;
}

/** Reads a sensor and outputs its value and a yes/no comparison. */
export interface SensorBlock extends Base {
  kind: 'sensor';
  condition: Exclude<Condition, { source: 'variable' } | { source: 'logic' }>;
}

export interface MathBlock extends Base {
  kind: 'math';
  op: '+' | '-' | '*' | '/';
  a: number;
  b: number;
}

export interface CompareBlock extends Base {
  kind: 'compare';
  op: '<' | '>' | '=';
  a: number;
  b: number;
}

export interface LogicBlock extends Base {
  kind: 'logic';
  op: 'and' | 'or' | 'xor' | 'not';
  a: boolean;
  b: boolean;
}

export interface RangeBlock extends Base {
  kind: 'range';
  /** True: yes when inside the range; false: yes when outside. */
  inside: boolean;
  low: number;
  high: number;
  value: number;
}

export interface RandomBlock extends Base {
  kind: 'random';
  min: number;
  max: number;
}

export interface NumberToTextBlock extends Base {
  kind: 'numberToText';
  value: number;
}

export interface TextBlock extends Base {
  kind: 'text';
  a: string;
  b: string;
  c: string;
}

export interface MyBlockCall extends Base {
  kind: 'myBlock';
  /** Id of a {@link MyBlockDefinition}. */
  ref: string;
}

export type Block =
  | MoveBlock
  | MotorBlock
  | SoundBlock
  | DisplayBlock
  | WaitBlock
  | LoopBlock
  | SwitchBlock
  | StopBlock
  | ResetRotationBlock
  | ResetTimerBlock
  | VariableBlock
  | MyBlockCall
  | SensorBlock
  | MathBlock
  | CompareBlock
  | LogicBlock
  | RangeBlock
  | RandomBlock
  | NumberToTextBlock
  | TextBlock;

export type BlockKind = Block['kind'];

/** A user-made block: a named sequence that can be used like any other block. */
export interface MyBlockDefinition {
  id: string;
  name: string;
  body: Block[];
}

export interface VariableDefinition {
  name: string;
  type: 'number';
}

/** Value types carried by plugs and wires. */
export type DataType = 'number' | 'logic' | 'text';

/** One end of a wire: a plug on a block. */
export interface PlugRef {
  block: string;
  plug: string;
}

/** A data wire from an output plug to an input plug. */
export interface Wire {
  id: string;
  from: PlugRef;
  to: PlugRef;
}

export interface Program {
  name: string;
  variables: VariableDefinition[];
  myBlocks: MyBlockDefinition[];
  /** The main sequence beam. */
  body: Block[];
  /** Extra beams that run at the same time as the main one. */
  parallel: Block[][];
  wires: Wire[];
}
