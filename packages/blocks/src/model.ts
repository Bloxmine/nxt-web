/**
 * Program model for the classic sequence-beam editor.
 *
 * A program is a sequence of blocks on a beam. Loops and switches contain
 * nested sequences. Sensors are not standalone blocks yet (that needs data
 * wires); instead Wait, Loop and Switch blocks carry a sensor condition, the
 * way the classic editor configures them.
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
  | { source: 'variable'; name: string; compare: Compare | '='; value: number };

export type ConditionSource = Condition['source'];

interface Base {
  id: string;
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
  action: 'set' | 'change';
  value: number;
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
  | MyBlockCall;

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

export interface Program {
  name: string;
  variables: VariableDefinition[];
  myBlocks: MyBlockDefinition[];
  body: Block[];
}
