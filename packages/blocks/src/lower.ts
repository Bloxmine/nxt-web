import type { Expr, InputPort, IrProgram, OutputPort, SensorKind, Stmt } from '@nxt/compiler';
import type { Block, Condition, Duration, MotorPort, Program } from './model.js';
import { conditionOf, sensorKindOf, validateProgram } from './validate.js';
import { walkProgram } from './tree.js';

/** Thrown when a program has errors; carries every error found. */
export class LoweringError extends Error {
  constructor(readonly issues: { blockId: string; message: string }[]) {
    super(issues.map((i) => i.message).join('\n'));
    this.name = 'LoweringError';
  }
}

const TIMER_VAR = '__timer';
const MOTOR_INDEX: Record<MotorPort, OutputPort> = { A: 0, B: 1, C: 2 };

const num = (value: number): Expr => ({ kind: 'number', value });
const bin = (op: Extract<Expr, { kind: 'binary' }>['op'], left: Expr, right: Expr): Expr => ({
  kind: 'binary',
  op,
  left,
  right,
});
const not = (operand: Expr): Expr => ({ kind: 'not', operand });

/** Name of the subroutine generated for a My Block. */
export function subroutineName(myBlockId: string): string {
  return `my_${myBlockId}`;
}

/**
 * Lowers a classic-editor program to IR. Throws {@link LoweringError} if
 * validation finds errors (warnings are ignored).
 */
export function lowerProgram(program: Program): IrProgram {
  const errors = validateProgram(program).filter((i) => i.severity === 'error');
  if (errors.length) throw new LoweringError(errors);

  let tempCounter = 0;
  const temps: string[] = [];
  const newTemp = () => {
    const name = `__t${tempCounter++}`;
    temps.push(name);
    return name;
  };

  const sensors: Partial<Record<InputPort, SensorKind>> = {};
  let usesTimer = false;
  walkProgram(program, (block) => {
    const c = conditionOf(block);
    if (c) {
      const s = sensorKindOf(c);
      if (s) sensors[(s.port - 1) as InputPort] = s.kind;
      if (c.source === 'timer') usesTimer = true;
    }
    if (block.kind === 'resetTimer') usesTimer = true;
  });

  const conditionExpr = (c: Condition): Expr => {
    const compare = (op: '<' | '>' | '=', left: Expr, right: number): Expr =>
      bin(op === '=' ? '==' : op, left, num(right));
    switch (c.source) {
      case 'touch': {
        const pressed = bin('==', { kind: 'sensor', port: (c.port - 1) as InputPort }, num(1));
        return c.action === 'released' ? not(pressed) : pressed;
      }
      case 'light':
      case 'sound':
        return compare(c.compare, { kind: 'sensor', port: (c.port - 1) as InputPort }, c.value);
      case 'ultrasonic': {
        const cm = c.unit === 'in' ? Math.round(c.value * 2.54) : c.value;
        return compare(c.compare, { kind: 'sensor', port: (c.port - 1) as InputPort }, cm);
      }
      case 'rotation': {
        const degrees = c.unit === 'rotations' ? c.value * 360 : c.value;
        return compare(c.compare, { kind: 'motorDegrees', port: MOTOR_INDEX[c.port] }, degrees);
      }
      case 'timer':
        return compare(
          c.compare,
          bin('-', { kind: 'tick' }, { kind: 'var', name: TIMER_VAR }),
          c.seconds * 1000,
        );
      case 'button': {
        const pressed: Expr = { kind: 'button', button: c.button };
        return c.action === 'released' ? not(pressed) : pressed;
      }
      case 'variable':
        return compare(c.compare, { kind: 'var', name: c.name }, c.value);
    }
  };

  const motorStatements = (
    source: string,
    ports: OutputPort[],
    direction: 'forward' | 'backward' | 'stop',
    power: number,
    turnRatio: number,
    duration: Duration,
    nextAction: 'brake' | 'coast',
    regulated: boolean,
    wait: boolean,
  ): Stmt[] => {
    if (direction === 'stop') return [{ kind: 'motorStop', ports, mode: nextAction, source }];
    const signed = direction === 'backward' ? -power : power;
    const base = {
      kind: 'motor' as const,
      ports,
      power: num(signed),
      turnRatio: num(turnRatio),
      then: nextAction,
      regulated,
      source,
    };
    switch (duration.unit) {
      case 'unlimited':
        return [{ ...base, degrees: null, wait: false }];
      case 'degrees':
      case 'rotations': {
        const degrees = duration.unit === 'rotations' ? duration.value * 360 : duration.value;
        return [{ ...base, degrees: num(Math.round(degrees)), wait }];
      }
      case 'seconds':
        return [
          { ...base, degrees: null, wait: false },
          { kind: 'wait', ms: num(Math.round(duration.value * 1000)), source },
          { kind: 'motorStop', ports, mode: nextAction, source },
        ];
    }
  };

  const lowerBlock = (block: Block): Stmt[] => {
    const source = block.id;
    switch (block.kind) {
      case 'move': {
        const ports = block.ports.map((p) => MOTOR_INDEX[p]);
        const synced = ports.length === 2;
        return motorStatements(
          source,
          ports,
          block.direction,
          block.power,
          synced ? block.steering : 0,
          block.duration,
          block.nextAction,
          true,
          true,
        );
      }
      case 'motor':
        return motorStatements(
          source,
          [MOTOR_INDEX[block.port]],
          block.direction,
          block.power,
          0,
          block.duration,
          block.nextAction,
          block.regulated,
          block.wait,
        );
      case 'sound':
        if (block.action === 'stop') return [{ kind: 'stopSound', source }];
        if (block.action === 'file') {
          const file = block.file.endsWith('.rso') ? block.file : `${block.file}.rso`;
          return [
            {
              kind: 'soundFile',
              file,
              loop: block.repeat,
              volume: block.volume,
              wait: block.wait && !block.repeat,
              source,
            },
          ];
        }
        return [
          {
            kind: 'tone',
            frequency: num(block.frequency),
            durationMs: num(Math.round(block.seconds * 1000)),
            volume: block.volume,
            wait: block.wait,
            source,
          },
        ];
      case 'display': {
        if (block.action === 'reset') return [{ kind: 'clearScreen', source }];
        const out: Stmt[] = block.clear ? [{ kind: 'clearScreen', source }] : [];
        if (block.action === 'text') {
          out.push({
            kind: 'drawText',
            x: num(block.x),
            line: num(block.line),
            text: block.text,
            source,
          });
        } else {
          out.push({
            kind: 'drawNumber',
            x: num(block.x),
            line: num(block.line),
            value: { kind: 'var', name: block.variable },
            source,
          });
        }
        return out;
      }
      case 'wait': {
        if (block.control.type === 'time') {
          return [{ kind: 'wait', ms: num(Math.round(block.control.seconds * 1000)), source }];
        }
        const c = block.control.condition;
        if (c.source === 'touch' && c.action === 'bumped') {
          const pressed = conditionExpr({ ...c, action: 'pressed' });
          return [
            { kind: 'waitUntil', condition: pressed, source },
            { kind: 'waitUntil', condition: not(pressed), source },
          ];
        }
        return [{ kind: 'waitUntil', condition: conditionExpr(c), source }];
      }
      case 'loop': {
        const body = lowerSequence(block.body);
        const control = block.control;
        switch (control.type) {
          case 'forever':
            return [{ kind: 'forever', body, source }];
          case 'count':
            return [{ kind: 'repeat', count: num(control.count), body, source }];
          case 'time': {
            // The classic editor checks the loop condition after each pass.
            const start = newTemp();
            const elapsed = bin('-', { kind: 'tick' }, { kind: 'var', name: start });
            return [
              { kind: 'set', name: start, value: { kind: 'tick' }, source },
              {
                kind: 'forever',
                body: [
                  ...body,
                  {
                    kind: 'if',
                    condition: bin('>=', elapsed, num(Math.round(control.seconds * 1000))),
                    then: [{ kind: 'break' }],
                    else: [],
                  },
                ],
                source,
              },
            ];
          }
          case 'sensor':
            return [
              {
                kind: 'forever',
                body: [
                  ...body,
                  {
                    kind: 'if',
                    condition: conditionExpr(control.condition),
                    then: [{ kind: 'break' }],
                    else: [],
                  },
                ],
                source,
              },
            ];
        }
        break;
      }
      case 'switch':
        return [
          {
            kind: 'if',
            condition: conditionExpr(block.condition),
            then: lowerSequence(block.whenTrue),
            else: lowerSequence(block.whenFalse),
            source,
          },
        ];
      case 'stop':
        return [{ kind: 'stop', source }];
      case 'resetRotation':
        return [{ kind: 'resetMotor', port: MOTOR_INDEX[block.port], source }];
      case 'resetTimer':
        return [{ kind: 'set', name: TIMER_VAR, value: { kind: 'tick' }, source }];
      case 'variable': {
        const value =
          block.action === 'set'
            ? num(block.value)
            : bin('+', { kind: 'var', name: block.name }, num(block.value));
        return [{ kind: 'set', name: block.name, value, source }];
      }
      case 'myBlock':
        return [{ kind: 'call', name: subroutineName(block.ref), source }];
    }
  };

  const lowerSequence = (blocks: readonly Block[]): Stmt[] => blocks.flatMap(lowerBlock);

  const subroutines = program.myBlocks.map((m) => ({
    name: subroutineName(m.id),
    body: lowerSequence(m.body),
  }));
  const main = lowerSequence(program.body);
  if (usesTimer) main.unshift({ kind: 'set', name: TIMER_VAR, value: { kind: 'tick' } });

  return {
    variables: [
      ...program.variables.map((v) => ({ name: v.name, type: v.type })),
      ...(usesTimer ? [{ name: TIMER_VAR, type: 'number' as const }] : []),
      ...temps.map((name) => ({ name, type: 'number' as const })),
    ],
    sensors,
    subroutines,
    main,
  };
}
