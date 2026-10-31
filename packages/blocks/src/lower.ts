import type {
  BinaryOp,
  Expr,
  InputPort,
  IrProgram,
  OutputPort,
  SensorKind,
  Stmt,
  ValueType,
} from '@nxt/compiler';
import {
  COLOR_NAMES,
  type Block,
  type Condition,
  type DataType,
  type Duration,
  type MotorPort,
  type Program,
} from './model.js';
import { findPlug, myBlockPlug, plugsOf } from './plugs.js';
import { walk, walkProgram } from './tree.js';
import { conditionOf, sensorKindOf, validateProgram } from './validate.js';

/** Thrown when a program has errors; carries every error found. */
export class LoweringError extends Error {
  constructor(readonly issues: { blockId: string; message: string }[]) {
    super(issues.map((i) => i.message).join('\n'));
    this.name = 'LoweringError';
  }
}

/** Hidden variable holding the tick count when timer `n` (1–3) was last reset. */
const timerVar = (n: number) => `__timer${n}`;
const MOTOR_INDEX: Record<MotorPort, OutputPort> = { A: 0, B: 1, C: 2 };
const VALUE_TYPE: Record<DataType, ValueType> = {
  number: 'number',
  logic: 'boolean',
  text: 'text',
};

const num = (value: number): Expr => ({ kind: 'number', value });
const bool = (value: boolean): Expr => ({ kind: 'boolean', value });
const text = (value: string): Expr => ({ kind: 'text', value });
const v = (name: string): Expr => ({ kind: 'var', name });
const bin = (op: BinaryOp, left: Expr, right: Expr): Expr => ({ kind: 'binary', op, left, right });
const not = (operand: Expr): Expr => ({ kind: 'not', operand });

/** Name of the subroutine generated for a My Block. */
export function subroutineName(myBlockId: string): string {
  return `my_${myBlockId}`;
}

/** Name of the hidden variable that passes My Block parameter `name` in or out. */
export function paramVariable(myBlockId: string, name: string): string {
  return `__p_${myBlockId}_${name}`;
}

/** Name of the hidden variable that carries a block's output plug value. */
export function wireVariable(blockId: string, plug: string): string {
  return `__w_${blockId}_${plug}`;
}

/**
 * Lowers a classic-editor program to IR. Throws {@link LoweringError} if
 * validation finds errors (warnings are ignored).
 *
 * Data wires become hidden variables: a block with a wired output stores the
 * value in `__w_<block>_<plug>` when it runs, and a block with a wired input
 * reads that variable instead of its configured setting.
 */
export function lowerProgram(program: Program): IrProgram {
  const errors = validateProgram(program).filter((i) => i.severity === 'error');
  if (errors.length) throw new LoweringError(errors);

  let tempCounter = 0;
  const hidden = new Map<string, ValueType>();
  const newTemp = () => {
    const name = `__t${tempCounter++}`;
    hidden.set(name, 'number');
    return name;
  };

  // Which outputs feed a wire, and where each input comes from.
  const usedOutputs = new Set<string>();
  const inputSource = new Map<string, string>();
  for (const w of program.wires) {
    const name = wireVariable(w.from.block, w.from.plug);
    usedOutputs.add(`${w.from.block}:${w.from.plug}`);
    inputSource.set(`${w.to.block}:${w.to.plug}`, name);
  }

  // My Block parameters: one hidden variable each, and which My Block a block is in.
  const myBlockOf = new Map<string, string>();
  for (const def of program.myBlocks) {
    walk(def.body, (b) => {
      myBlockOf.set(b.id, def.id);
      if (b.kind === 'myBlockParam')
        hidden.set(paramVariable(def.id, b.name), VALUE_TYPE[b.valueType]);
    });
  }
  const zeroOf = (t: DataType): Expr =>
    t === 'logic' ? bool(false) : t === 'text' ? text('') : num(0);

  const sensors: Partial<Record<InputPort, SensorKind>> = {};
  const timers = new Set<number>();
  // Ports where the color sensor is used in more than one mode: the mode is
  // switched right before each reading.
  const colorKinds = new Map<InputPort, Set<SensorKind>>();
  walkProgram(program, (block) => {
    const c = conditionOf(block);
    if (c) {
      const s = sensorKindOf(c);
      if (s) {
        const port = (s.port - 1) as InputPort;
        sensors[port] ??= s.kind;
        if (s.kind.startsWith('color')) {
          const set = colorKinds.get(port) ?? new Set<SensorKind>();
          set.add(s.kind);
          colorKinds.set(port, set);
        }
      }
      if (c.source === 'timer') timers.add(c.timer ?? 1);
    }
    if (block.kind === 'resetTimer') timers.add(block.timer ?? 1);
    if (block.kind === 'colorLamp') {
      const port = (block.port - 1) as InputPort;
      sensors[port] ??= 'colorNone';
      const set = colorKinds.get(port) ?? new Set<SensorKind>();
      set.add('colorNone');
      colorKinds.set(port, set);
    }
    for (const plug of plugsOf(block)) {
      if (plug.output && usedOutputs.has(`${block.id}:${plug.name}`)) {
        hidden.set(wireVariable(block.id, plug.name), VALUE_TYPE[plug.type]);
      }
    }
  });

  /** The value of an input plug: the wire if connected, else the setting. */
  const input = (block: Block, plug: string, fallback: Expr): Expr => {
    const source = inputSource.get(`${block.id}:${plug}`);
    return source ? v(source) : fallback;
  };

  /** Statements storing output values that feed wires. */
  const outputs = (block: Block, values: Record<string, Expr>): Stmt[] =>
    Object.entries(values)
      .filter(([plug]) => usedOutputs.has(`${block.id}:${plug}`) && findPlug(block, plug)?.output)
      .map(([plug, value]) => ({
        kind: 'set',
        name: wireVariable(block.id, plug),
        value,
        source: block.id,
      }));

  /** Current reading of the sensor a condition uses. */
  const reading = (c: Condition): Expr => {
    switch (c.source) {
      case 'touch':
      case 'light':
      case 'sound':
      case 'ultrasonic':
      case 'color':
        return { kind: 'sensor', port: (c.port - 1) as InputPort };
      case 'rotation':
        return { kind: 'motorDegrees', port: MOTOR_INDEX[c.port] };
      case 'timer':
        return bin('-', { kind: 'tick' }, v(timerVar(c.timer ?? 1)));
      case 'button':
        return { kind: 'button', button: c.button };
      case 'variable':
        return v(c.name);
      case 'logic':
      case 'value':
        return bool(false);
    }
  };

  /** Statements to put before reading a condition (color sensor mode switch). */
  const prepare = (c: Condition, source: string): Stmt[] => {
    const s = sensorKindOf(c);
    if (!s || !s.kind.startsWith('color')) return [];
    const port = (s.port - 1) as InputPort;
    if ((colorKinds.get(port)?.size ?? 0) < 2) return [];
    return [{ kind: 'setSensor', port, sensor: s.kind, source }];
  };

  /** The configured threshold of a condition, in the units `reading` returns. */
  const threshold = (c: Condition): number => {
    switch (c.source) {
      case 'ultrasonic':
        return c.unit === 'in' ? Math.round(c.value * 2.54) : c.value;
      case 'rotation':
        return c.unit === 'rotations' ? c.value * 360 : c.value;
      case 'timer':
        return c.seconds * 1000;
      case 'light':
      case 'sound':
      case 'variable':
        return c.value;
      case 'color':
        return c.mode === 'light' ? c.value : 0;
      default:
        return 0;
    }
  };

  /** True when the condition holds. `limit` overrides the configured threshold. */
  const conditionExpr = (c: Condition, block: Block, limit?: Expr): Expr => {
    switch (c.source) {
      case 'touch': {
        const pressed = bin('==', reading(c), num(1));
        return c.action === 'released' ? not(pressed) : pressed;
      }
      case 'button':
        return c.action === 'released' ? not(reading(c)) : reading(c);
      case 'logic':
        return input(block, 'condition', bool(false));
      case 'value':
        return bool(false);
      case 'color': {
        if (c.mode === 'light') return bin(c.compare, reading(c), limit ?? num(c.value));
        const from = COLOR_NAMES.indexOf(c.from) + 1;
        const to = COLOR_NAMES.indexOf(c.to) + 1;
        const r = reading(c);
        const inRange = bin(
          'and',
          bin('>=', r, num(Math.min(from, to))),
          bin('<=', r, num(Math.max(from, to))),
        );
        return c.inside ? inRange : not(inRange);
      }
      default: {
        const op = c.compare === '=' ? '==' : c.compare;
        return bin(op, reading(c), limit ?? num(threshold(c)));
      }
    }
  };

  const motorStatements = (
    block: Block,
    ports: OutputPort[],
    direction: 'forward' | 'backward' | 'stop',
    power: Expr,
    turnRatio: Expr,
    duration: Duration,
    nextAction: 'brake' | 'coast',
    regulated: boolean,
    wait: boolean,
  ): Stmt[] => {
    const source = block.id;
    const wiredDirection = inputSource.get(`${block.id}:direction`);
    if (direction === 'stop' && !wiredDirection) {
      return [{ kind: 'motorStop', ports, mode: nextAction, source }];
    }
    // A wired direction is yes = forward, no = backward.
    const signed: Expr = wiredDirection
      ? { kind: 'choose', condition: v(wiredDirection), then: power, else: bin('-', num(0), power) }
      : direction === 'backward'
        ? bin('-', num(0), power)
        : power;
    const base = {
      kind: 'motor' as const,
      ports,
      power: signed,
      turnRatio,
      then: nextAction,
      regulated,
      source,
    };
    // A wired duration replaces the configured amount (same unit).
    const wiredAmount = inputSource.get(`${block.id}:duration`);
    const amount = (configured: number, scale: number): Expr =>
      wiredAmount ? bin('*', v(wiredAmount), num(scale)) : num(Math.round(configured * scale));
    switch (duration.unit) {
      case 'unlimited':
        return [{ ...base, degrees: null, wait: false }];
      case 'degrees':
      case 'rotations': {
        const scale = duration.unit === 'rotations' ? 360 : 1;
        return [{ ...base, degrees: amount(duration.value, scale), wait }];
      }
      case 'seconds':
        return [
          { ...base, degrees: null, wait: false },
          { kind: 'wait', ms: amount(duration.value, 1000), source },
          { kind: 'motorStop', ports, mode: nextAction, source },
        ];
    }
  };

  const loopStatements = (block: Extract<Block, { kind: 'loop' }>): Stmt[] => {
    const source = block.id;
    const body = lowerSequence(block.body);
    const control = block.control;
    const counter = usedOutputs.has(`${block.id}:count`) ? wireVariable(block.id, 'count') : null;
    const before: Stmt[] = counter ? [{ kind: 'set', name: counter, value: num(0), source }] : [];
    const step: Stmt[] = counter
      ? [{ kind: 'set', name: counter, value: bin('+', v(counter), num(1)) }]
      : [];
    // The classic editor checks the loop condition after each pass.
    const breakIf = (condition: Expr): Stmt => ({
      kind: 'if',
      condition,
      then: [{ kind: 'break' }],
      else: [],
    });

    switch (control.type) {
      case 'forever':
        return [...before, { kind: 'forever', body: [...body, ...step], source }];
      case 'count':
        if (!counter) return [{ kind: 'repeat', count: num(control.count), body, source }];
        return [
          ...before,
          {
            kind: 'while',
            condition: bin('<', v(counter), num(control.count)),
            body: [...body, ...step],
            source,
          },
        ];
      case 'time': {
        const start = newTemp();
        const elapsed = bin('-', { kind: 'tick' }, v(start));
        return [
          ...before,
          { kind: 'set', name: start, value: { kind: 'tick' }, source },
          {
            kind: 'forever',
            body: [
              ...body,
              ...step,
              breakIf(bin('>=', elapsed, num(Math.round(control.seconds * 1000)))),
            ],
            source,
          },
        ];
      }
      case 'sensor':
        return [
          ...before,
          {
            kind: 'forever',
            body: [...body, ...step, breakIf(conditionExpr(control.condition, block))],
            source,
          },
        ];
    }
  };

  const lowerBlock = (block: Block): Stmt[] => {
    const source = block.id;
    switch (block.kind) {
      case 'move': {
        const ports = block.ports.map((p) => MOTOR_INDEX[p]);
        const power = input(block, 'power', num(block.power));
        const steering = input(block, 'steering', num(block.steering));
        const direction = input(block, 'direction', bool(block.direction !== 'backward'));
        return [
          ...outputs(block, { power, steering, direction }),
          ...motorStatements(
            block,
            ports,
            block.direction,
            power,
            ports.length === 2 ? steering : num(0),
            block.duration,
            block.nextAction,
            true,
            true,
          ),
        ];
      }
      case 'motor': {
        const power = input(block, 'power', num(block.power));
        const direction = input(block, 'direction', bool(block.direction !== 'backward'));
        return [
          ...outputs(block, { power, direction }),
          ...motorStatements(
            block,
            [MOTOR_INDEX[block.port]],
            block.direction,
            power,
            num(0),
            block.duration,
            block.nextAction,
            block.regulated,
            block.wait,
          ),
        ];
      }
      case 'sound': {
        const frequency = input(block, 'frequency', num(block.frequency));
        const volume = input(block, 'volume', num(block.volume));
        const out = outputs(block, { frequency, volume });
        if (block.action === 'stop') return [...out, { kind: 'stopSound', source }];
        if (block.action === 'file') {
          const file = block.file.endsWith('.rso') ? block.file : `${block.file}.rso`;
          return [
            ...out,
            {
              kind: 'soundFile',
              file,
              loop: block.repeat,
              volume,
              wait: block.wait && !block.repeat,
              source,
            },
          ];
        }
        return [
          ...out,
          {
            kind: 'tone',
            frequency,
            durationMs: num(Math.round(block.seconds * 1000)),
            volume,
            wait: block.wait,
            source,
          },
        ];
      }
      case 'display': {
        const x = input(block, 'x', num(block.x));
        // Text lines 1–8 sit at y = 56, 48 … 0 pixels (y = 0 is the bottom row).
        const yPixels = block.y ?? (8 - block.line) * 8;
        const y = input(block, 'y', num(yPixels));
        const wiredY = inputSource.get(`${block.id}:y`);
        const line = wiredY ? bin('-', num(8), bin('/', v(wiredY), num(8))) : num(block.line);
        const textValue = input(block, 'text', text(block.text));
        const numberValue = input(block, 'number', v(block.variable));
        const endX = input(block, 'endX', num(block.endX ?? 0));
        const endY = input(block, 'endY', num(block.endY ?? 0));
        const radius = input(block, 'radius', num(block.radius ?? 0));
        const out = outputs(block, {
          x,
          y,
          endX,
          endY,
          radius,
          text: textValue,
          number: numberValue,
        });
        if (block.action === 'reset') return [...out, { kind: 'clearScreen', source }];
        const clear: Stmt[] = block.clear ? [{ kind: 'clearScreen', source }] : [];
        if (block.action === 'drawing') {
          const shape = block.shape ?? 'line';
          const draw: Stmt =
            shape === 'point'
              ? { kind: 'drawPoint', x, y, source }
              : shape === 'circle'
                ? { kind: 'drawCircle', x, y, radius, source }
                : { kind: 'drawLine', x, y, endX, endY, source };
          return [...out, ...clear, draw];
        }
        if (block.action === 'image') {
          const file = (block.image ?? 'Smile 01').replace(/\.ric$/i, '') + '.ric';
          return [...out, ...clear, { kind: 'drawImage', x, y, file, source }];
        }
        const draw: Stmt =
          block.action === 'text'
            ? { kind: 'drawText', x, line, text: textValue, source }
            : { kind: 'drawNumber', x, line, value: numberValue, source };
        return [...out, ...clear, draw];
      }
      case 'wait': {
        if (block.control.type === 'time') {
          return [{ kind: 'wait', ms: num(Math.round(block.control.seconds * 1000)), source }];
        }
        const c = block.control.condition;
        if ((c.source === 'touch' || c.source === 'button') && c.action === 'bumped') {
          const pressed = conditionExpr({ ...c, action: 'pressed' } as Condition, block);
          return [
            { kind: 'waitUntil', condition: pressed, source },
            { kind: 'waitUntil', condition: not(pressed), source },
          ];
        }
        return [
          ...prepare(c, source),
          { kind: 'waitUntil', condition: conditionExpr(c, block), source },
        ];
      }
      case 'loop':
        return loopStatements(block);
      case 'switch': {
        if (block.cases && block.condition.source === 'value') {
          // Value switch: compare the wired value with each case in turn.
          const selector = newTemp();
          hidden.set(selector, block.condition.valueType === 'text' ? 'text' : 'number');
          const fallback = block.condition.valueType === 'text' ? text('') : num(0);
          const def = block.defaultCase ?? block.cases.length - 1;
          let chain: Stmt[] = lowerSequence(block.cases[def]?.blocks ?? []);
          for (let i = block.cases.length - 1; i >= 0; i--) {
            if (i === def) continue;
            const c = block.cases[i]!;
            const value = typeof c.value === 'number' ? num(c.value) : text(c.value);
            chain = [
              {
                kind: 'if',
                condition: bin('==', v(selector), value),
                then: lowerSequence(c.blocks),
                else: chain,
              },
            ];
          }
          return [
            { kind: 'set', name: selector, value: input(block, 'condition', fallback), source },
            ...chain,
          ];
        }
        return [
          ...prepare(block.condition, source),
          {
            kind: 'if',
            condition: conditionExpr(block.condition, block),
            then: lowerSequence(block.whenTrue),
            else: lowerSequence(block.whenFalse),
            source,
          },
        ];
      }
      case 'file': {
        const name = block.file.toLowerCase().endsWith('.txt') ? block.file : `${block.file}.txt`;
        const file = input(block, 'filename', text(name));
        if (block.action === 'read') {
          const target = newTemp();
          hidden.set(target, block.type === 'text' ? 'text' : 'number');
          return [
            { kind: 'file', action: 'read', file, valueType: block.type, target, source },
            ...outputs(block, {
              filename: file,
              text: block.type === 'text' ? v(target) : text(''),
              number: block.type === 'number' ? v(target) : num(0),
              error: bool(false),
            }),
          ];
        }
        if (block.action === 'write') {
          const value =
            block.type === 'text'
              ? input(block, 'text', text(block.text))
              : input(block, 'number', num(block.number));
          return [
            ...outputs(block, { filename: file, error: bool(false) }),
            {
              kind: 'file',
              action: 'write',
              file,
              valueType: block.type,
              value,
              size: input(block, 'size', num(block.size ?? 0)),
              source,
            },
          ];
        }
        return [
          ...outputs(block, { filename: file, error: bool(false) }),
          { kind: 'file', action: block.action, file, valueType: block.type, source },
        ];
      }
      case 'sendMessage': {
        const type: ValueType = block.type === 'logic' ? 'boolean' : block.type;
        const fallback =
          block.type === 'logic'
            ? bool(block.logic)
            : block.type === 'text'
              ? text(block.text)
              : num(block.number);
        const mailbox = input(block, 'mailbox', num(block.mailbox));
        const value = input(block, 'value', fallback);
        return [
          ...outputs(block, { mailbox, value }),
          {
            kind: 'messageWrite',
            connection: block.connection,
            mailbox,
            valueType: type,
            value,
            source,
          },
        ];
      }
      case 'receiveMessage': {
        const type: ValueType = block.type === 'logic' ? 'boolean' : block.type;
        const target = newTemp();
        hidden.set(target, type);
        const received = newTemp();
        hidden.set(received, 'boolean');
        const mailbox = input(block, 'mailbox', num(block.mailbox));
        return [
          { kind: 'messageRead', mailbox, valueType: type, target, received, source },
          ...outputs(block, { mailbox, received: v(received), value: v(target) }),
        ];
      }
      case 'constant':
        return outputs(block, {
          value:
            block.valueType === 'logic'
              ? bool(block.logic)
              : block.valueType === 'text'
                ? text(block.text)
                : num(block.number),
        });
      case 'colorLamp': {
        const port = (block.port - 1) as InputPort;
        const sensor: SensorKind = !block.on
          ? 'colorNone'
          : block.color === 'red'
            ? 'colorRed'
            : block.color === 'green'
              ? 'colorGreen'
              : 'colorBlue';
        return [{ kind: 'setSensor', port, sensor, source }];
      }
      case 'stop':
        return [{ kind: 'stop', source }];
      case 'resetRotation':
        return [{ kind: 'resetMotor', port: MOTOR_INDEX[block.port], source }];
      case 'resetTimer':
        return [{ kind: 'set', name: timerVar(block.timer ?? 1), value: { kind: 'tick' }, source }];
      case 'variable': {
        const value = input(block, 'value', num(block.value));
        const write: Stmt[] =
          block.action === 'read'
            ? []
            : [
                {
                  kind: 'set',
                  name: block.name,
                  value: block.action === 'set' ? value : bin('+', v(block.name), value),
                  source,
                },
              ];
        return [...write, ...outputs(block, { value: v(block.name) })];
      }
      case 'myBlock': {
        const params = block.params ?? [];
        const before: Stmt[] = params
          .filter((p) => p.direction === 'in')
          .map((p) => ({
            kind: 'set',
            name: paramVariable(block.ref, p.name),
            value: input(block, myBlockPlug(p.name), zeroOf(p.type)),
            source,
          }));
        const after = outputs(
          block,
          Object.fromEntries(
            params
              .filter((p) => p.direction === 'out')
              .map((p) => [myBlockPlug(p.name), v(paramVariable(block.ref, p.name))]),
          ),
        );
        return [...before, { kind: 'call', name: subroutineName(block.ref), source }, ...after];
      }
      case 'myBlockParam': {
        const def = myBlockOf.get(block.id);
        if (!def) return [];
        const variable = paramVariable(def, block.name);
        return block.direction === 'in'
          ? outputs(block, { value: v(variable) })
          : [
              {
                kind: 'set',
                name: variable,
                value: input(block, 'value', zeroOf(block.valueType)),
                source,
              },
            ];
      }
      case 'sensor': {
        const c = block.condition;
        const trigger = input(block, 'trigger', num(threshold(c)));
        // Color sensor with a wired lamp colour / lamp on: pick the mode at run time.
        const lampWire = inputSource.get(`${block.id}:lamp`);
        const lightWire = inputSource.get(`${block.id}:light`);
        const lamp: Stmt[] = [];
        if (c.source === 'color' && c.mode === 'light' && (lampWire || lightWire)) {
          const port = (c.port - 1) as InputPort;
          const set = (sensor: SensorKind): Stmt => ({ kind: 'setSensor', port, sensor, source });
          const colour = lampWire ? v(lampWire) : num(['red', 'green', 'blue'].indexOf(c.lamp));
          const byColour: Stmt = {
            kind: 'if',
            condition: bin('==', colour, num(0)),
            then: [set('colorRed')],
            else: [
              {
                kind: 'if',
                condition: bin('==', colour, num(1)),
                then: [set('colorGreen')],
                else: [set('colorBlue')],
              },
            ],
          };
          lamp.push(
            lightWire
              ? { kind: 'if', condition: v(lightWire), then: [byColour], else: [set('colorNone')] }
              : byColour,
          );
          const set2 = colorKinds.get(port) ?? new Set<SensorKind>();
          ['colorRed', 'colorGreen', 'colorBlue', 'colorNone'].forEach((k) =>
            set2.add(k as SensorKind),
          );
          colorKinds.set(port, set2);
        }
        return [
          ...lamp,
          ...(lamp.length ? [] : prepare(c, source)),
          ...outputs(block, {
            trigger,
            yes: conditionExpr(c, block, trigger),
            value: reading(c),
          }),
        ];
      }
      case 'math': {
        const a = input(block, 'a', num(block.a));
        const b = input(block, 'b', num(block.b));
        return outputs(block, { a, b, result: bin(block.op, a, b) });
      }
      case 'compare': {
        const a = input(block, 'a', num(block.a));
        const b = input(block, 'b', num(block.b));
        return outputs(block, { a, b, result: bin(block.op === '=' ? '==' : block.op, a, b) });
      }
      case 'logic': {
        const a = input(block, 'a', bool(block.a));
        const b = input(block, 'b', bool(block.b));
        const result =
          block.op === 'not' ? not(a) : block.op === 'xor' ? bin('!=', a, b) : bin(block.op, a, b);
        return outputs(block, { a, b, result });
      }
      case 'range': {
        const low = input(block, 'low', num(block.low));
        const high = input(block, 'high', num(block.high));
        const value = input(block, 'value', num(block.value));
        const inside = bin('and', bin('>=', value, low), bin('<=', value, high));
        return outputs(block, { low, high, value, result: block.inside ? inside : not(inside) });
      }
      case 'random': {
        const min = input(block, 'min', num(block.min));
        const max = input(block, 'max', num(block.max));
        return outputs(block, { min, max, value: { kind: 'random', min, max } });
      }
      case 'numberToText': {
        const value = input(block, 'number', num(block.value));
        return outputs(block, { number: value, text: { kind: 'numberToText', value } });
      }
      case 'text': {
        const a = input(block, 'a', text(block.a));
        const b = input(block, 'b', text(block.b));
        const c = input(block, 'c', text(block.c));
        return outputs(block, { a, b, c, result: { kind: 'concat', parts: [a, b, c] } });
      }
    }
  };

  const lowerSequence = (blocks: readonly Block[]): Stmt[] => blocks.flatMap(lowerBlock);

  const subroutines = program.myBlocks.map((m) => ({
    name: subroutineName(m.id),
    body: lowerSequence(m.body),
  }));
  const main = lowerSequence(program.body);
  const parallel = program.parallel.filter((lane) => lane.length > 0).map(lowerSequence);
  for (const n of [...timers].sort().reverse()) {
    main.unshift({ kind: 'set', name: timerVar(n), value: { kind: 'tick' } });
    hidden.set(timerVar(n), 'number');
  }

  return {
    variables: [
      ...program.variables.map((x) => ({
        name: x.name,
        type: (x.type === 'logic' ? 'boolean' : x.type) as ValueType,
      })),
      ...[...hidden].map(([name, type]) => ({ name, type })),
    ],
    sensors,
    subroutines,
    main,
    parallel,
  };
}
