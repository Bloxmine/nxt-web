/**
 * Intermediate representation (IR) between the editor and bytecode.
 *
 * Editors (the classic sequence-beam editor today, Blockly later) lower their
 * programs into this tree. The code generator (Phase 3) turns it into VM
 * instructions. Keep it small: anything an editor can express should lower
 * into these nodes rather than adding new ones.
 */

/** Output ports A, B, C. */
export type OutputPort = 0 | 1 | 2;
/** Input ports 1–4. */
export type InputPort = 0 | 1 | 2 | 3;

/** How a sensor port is configured, decided once at program start. */
export type SensorKind =
  'touch' | 'lightActive' | 'lightAmbient' | 'soundDb' | 'soundDba' | 'ultrasonic';

/** Value types. */
export type ValueType = 'number' | 'boolean' | 'text';

/** Binary operators. Comparisons and logic return booleans. */
export type BinaryOp =
  '+' | '-' | '*' | '/' | '%' | '<' | '>' | '<=' | '>=' | '==' | '!=' | 'and' | 'or';

/** Expressions. */
export type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'text'; value: string }
  | { kind: 'var'; name: string }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { kind: 'not'; operand: Expr }
  | { kind: 'random'; min: Expr; max: Expr }
  /** Scaled value of a configured sensor (touch 0/1, light %, sound %, ultrasonic cm). */
  | { kind: 'sensor'; port: InputPort }
  /** Motor rotation in degrees since the last reset. */
  | { kind: 'motorDegrees'; port: OutputPort }
  /** Milliseconds since the program started. */
  | { kind: 'tick' }
  /** True while a brick button is pressed. */
  | { kind: 'button'; button: 'left' | 'right' | 'enter' }
  /** `then` when the condition is true, otherwise `else`. */
  | { kind: 'choose'; condition: Expr; then: Expr; else: Expr }
  /** A number formatted as text. */
  | { kind: 'numberToText'; value: Expr }
  /** Text pieces joined together. */
  | { kind: 'concat'; parts: Expr[] };

/** Fields every statement may carry. */
export interface StmtBase {
  /** Id of the editor block this came from, for error messages. */
  source?: string;
}

/** Statements. */
export type Stmt = StmtBase &
  (
    | {
        kind: 'motor';
        ports: OutputPort[];
        /** −100..100; negative runs backwards. */
        power: Expr;
        /** −100..100; only used when two ports are synchronised. */
        turnRatio: Expr;
        /** Stop after this many degrees; null runs until changed. */
        degrees: Expr | null;
        /** What to do after `degrees` is reached. */
        then: 'brake' | 'coast';
        /** Speed regulation (keeps speed under load). */
        regulated: boolean;
        /** With `degrees`: wait for the movement to finish before continuing. */
        wait: boolean;
      }
    | { kind: 'motorStop'; ports: OutputPort[]; mode: 'brake' | 'coast' }
    | { kind: 'resetMotor'; port: OutputPort }
    | { kind: 'tone'; frequency: Expr; durationMs: Expr; volume: Expr; wait: boolean }
    | { kind: 'soundFile'; file: string; loop: boolean; volume: Expr; wait: boolean }
    | { kind: 'stopSound' }
    | { kind: 'clearScreen' }
    | { kind: 'drawText'; x: Expr; line: Expr; text: Expr }
    | { kind: 'drawNumber'; x: Expr; line: Expr; value: Expr }
    | { kind: 'wait'; ms: Expr }
    | { kind: 'waitUntil'; condition: Expr }
    | { kind: 'set'; name: string; value: Expr }
    | { kind: 'if'; condition: Expr; then: Stmt[]; else: Stmt[] }
    | { kind: 'while'; condition: Expr; body: Stmt[] }
    | { kind: 'repeat'; count: Expr; body: Stmt[] }
    | { kind: 'forever'; body: Stmt[] }
    | { kind: 'break' }
    | { kind: 'call'; name: string }
    | { kind: 'stop' }
  );

/** A variable declaration. */
export interface Variable {
  name: string;
  type: ValueType;
}

/** A subroutine (a "My Block"). */
export interface Subroutine {
  name: string;
  body: Stmt[];
}

/** A whole program. */
export interface IrProgram {
  variables: Variable[];
  /** Sensor configuration applied before `main` runs. */
  sensors: Partial<Record<InputPort, SensorKind>>;
  subroutines: Subroutine[];
  /** The main task. */
  main: Stmt[];
  /** Tasks started alongside `main` (parallel sequence beams). */
  parallel: Stmt[][];
}
