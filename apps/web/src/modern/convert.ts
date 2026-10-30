import {
  createBlock,
  defaultCondition,
  getSequence,
  labelOf,
  laneRoot,
  type Block,
  type Condition,
  type MotorPort,
  type Program,
  type SeqRef,
} from '@nxt/blocks';
import { blockSummary } from '../lib/summary';

/**
 * Converts between the program model and Blockly's JSON serialization (the "modern"
 * view). Pure data, so it can be tested without a browser.
 *
 * Each beam is a start hat followed by its blocks; loops and switches hold statement
 * inputs. Every Blockly block keeps the program block's id and, in `data`, the block's
 * full settings, so settings Blockly does not show survive editing. Blocks without a
 * Blockly form become an "nxt_classic" block that stores the whole block.
 */

export interface BlocklyBlock {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, string | number | boolean>;
  inputs?: Record<string, { block?: BlocklyBlock }>;
  next?: { block?: BlocklyBlock };
  data?: string;
  /** Classic blocks cannot be edited in Blockly. */
  editable?: boolean;
}

export interface BlocklyState {
  blocks: { languageVersion: 0; blocks: BlocklyBlock[] };
}

/** Condition sources the generic condition fields can express. */
export const CONDITION_SOURCES = [
  'touch',
  'light',
  'sound',
  'ultrasonic',
  'rotation',
  'timer',
  'button',
] as const;
type SimpleSource = (typeof CONDITION_SOURCES)[number];
const isSimple = (c: Condition): c is Extract<Condition, { source: SimpleSource }> =>
  (CONDITION_SOURCES as readonly string[]).includes(c.source);

const PORT_SETS: Record<string, MotorPort[]> = {
  'B+C': ['B', 'C'],
  'A+B': ['A', 'B'],
  'A+C': ['A', 'C'],
  A: ['A'],
  B: ['B'],
  C: ['C'],
};
export const PORT_SET_NAMES = Object.keys(PORT_SETS);

/** Copy of a block without nested blocks, for the `data` field. */
function settings(b: Block): string {
  const copy: Record<string, unknown> = { ...b };
  if (b.kind === 'loop') delete copy['body'];
  if (b.kind === 'switch') {
    delete copy['whenTrue'];
    delete copy['whenFalse'];
  }
  return JSON.stringify(copy);
}

function conditionFields(c: Condition): Record<string, string | number> {
  if (!isSimple(c)) return {};
  const f: Record<string, string | number> = { SOURCE: c.source };
  switch (c.source) {
    case 'touch':
      return { ...f, PORT: String(c.port), ACTION: c.action };
    case 'button':
      return { ...f, BUTTON: c.button, ACTION: c.action };
    case 'timer':
      return { ...f, PORT: String(c.timer ?? 1), COMPARE: c.compare, VALUE: c.seconds };
    default:
      return { ...f, PORT: String(c.port), COMPARE: c.compare, VALUE: c.value };
  }
}

/** Condition from the generic fields, keeping other settings of the old condition. */
function conditionFrom(f: Record<string, unknown>, old: Condition | undefined): Condition {
  const source = String(f['SOURCE'] ?? 'touch') as SimpleSource;
  const base = (old && old.source === source ? old : defaultCondition(source)) as Record<
    string,
    unknown
  >;
  const port = String(f['PORT'] ?? '1');
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  switch (source) {
    case 'touch':
      return { ...base, source, port: num(port, 1), action: f['ACTION'] ?? 'pressed' } as Condition;
    case 'button':
      return {
        ...base,
        source,
        button: f['BUTTON'] ?? 'enter',
        action: f['ACTION'] ?? 'pressed',
      } as Condition;
    case 'timer':
      return {
        ...base,
        source,
        timer: num(port, 1),
        compare: f['COMPARE'] ?? '>',
        seconds: num(f['VALUE'], 5),
      } as Condition;
    case 'rotation':
      return {
        ...base,
        source,
        port: /^[ABC]$/.test(port) ? port : 'A',
        compare: f['COMPARE'] ?? '>',
        value: num(f['VALUE'], 360),
      } as Condition;
    default:
      return {
        ...base,
        source,
        port: num(port, 1),
        compare: f['COMPARE'] ?? '<',
        value: num(f['VALUE'], 50),
      } as Condition;
  }
}

const classic = (b: Block): BlocklyBlock => ({
  type: 'nxt_classic',
  id: b.id,
  fields: { LABEL: `${labelOf(b)}${blockSummary(b) ? `: ${blockSummary(b)}` : ''}` },
  data: JSON.stringify(b),
});

/** One program block as a Blockly block (without `next`). */
function toBlock(b: Block): BlocklyBlock {
  const base = { id: b.id, data: settings(b) };
  switch (b.kind) {
    case 'move':
      return {
        ...base,
        type: 'nxt_move',
        fields: {
          PORTS: PORT_SET_NAMES.find((k) => PORT_SETS[k]!.join() === b.ports.join()) ?? 'B+C',
          DIRECTION: b.direction,
          STEERING: b.steering,
          POWER: b.power,
          UNIT: b.duration.unit,
          VALUE: b.duration.unit === 'unlimited' ? 1 : b.duration.value,
          NEXT: b.nextAction,
        },
      };
    case 'motor':
      return {
        ...base,
        type: 'nxt_motor',
        fields: {
          PORT: b.port,
          DIRECTION: b.direction,
          POWER: b.power,
          UNIT: b.duration.unit,
          VALUE: b.duration.unit === 'unlimited' ? 1 : b.duration.value,
          WAIT: b.wait,
          NEXT: b.nextAction,
        },
      };
    case 'sound':
      return {
        ...base,
        type: 'nxt_sound',
        fields: {
          ACTION: b.action,
          FREQ: b.frequency,
          FILE: b.file,
          SECONDS: b.seconds,
          VOLUME: b.volume,
          WAIT: b.wait,
        },
      };
    case 'display':
      if (b.action !== 'text' && b.action !== 'image' && b.action !== 'reset') return classic(b);
      return {
        ...base,
        type: 'nxt_display',
        fields: { ACTION: b.action, TEXT: b.text, X: b.x, LINE: b.line, CLEAR: b.clear },
      };
    case 'wait':
      if (b.control.type === 'time')
        return { ...base, type: 'nxt_wait_time', fields: { SECONDS: b.control.seconds } };
      if (!isSimple(b.control.condition)) return classic(b);
      return { ...base, type: 'nxt_wait_until', fields: conditionFields(b.control.condition) };
    case 'loop': {
      const c = b.control;
      if (c.type === 'sensor' && !isSimple(c.condition)) return classic(b);
      return {
        ...base,
        type: 'nxt_loop',
        fields: {
          MODE: c.type,
          COUNT: c.type === 'count' ? c.count : 4,
          SECONDS: c.type === 'time' ? c.seconds : 5,
          ...(c.type === 'sensor'
            ? conditionFields(c.condition)
            : {
                SOURCE: 'touch',
                PORT: '1',
                COMPARE: '<',
                VALUE: 50,
                ACTION: 'pressed',
                BUTTON: 'enter',
              }),
        },
        inputs: { DO: { ...chain(b.body) } },
      };
    }
    case 'switch':
      if (b.cases || !isSimple(b.condition)) return classic(b);
      return {
        ...base,
        type: 'nxt_switch',
        fields: conditionFields(b.condition),
        inputs: { YES: { ...chain(b.whenTrue) }, NO: { ...chain(b.whenFalse) } },
      };
    case 'stop':
      return { ...base, type: 'nxt_stop' };
    case 'resetRotation':
      return { ...base, type: 'nxt_reset_rotation', fields: { PORT: b.port } };
    case 'resetTimer':
      return { ...base, type: 'nxt_reset_timer', fields: { TIMER: String(b.timer ?? 1) } };
    case 'colorLamp':
      return {
        ...base,
        type: 'nxt_color_lamp',
        fields: { PORT: String(b.port), ON: b.on, COLOR: b.color },
      };
    case 'variable':
      if (b.action === 'read') return classic(b);
      return {
        ...base,
        type: 'nxt_variable',
        fields: { NAME: b.name, ACTION: b.action, VALUE: b.value },
      };
    default:
      return classic(b);
  }
}

/** A sequence as a chain of Blockly blocks (`{ block }` or `{}` when empty). */
function chain(blocks: readonly Block[]): { block?: BlocklyBlock } {
  let next: { block?: BlocklyBlock } = {};
  for (let i = blocks.length - 1; i >= 0; i--) {
    const bb = toBlock(blocks[i]!);
    if (next.block) bb.next = next;
    next = { block: bb };
  }
  return next;
}

/** The roots shown for a tab: the main beam and its parallel beams, or one My Block. */
function tabRoots(program: Program, tab: string): SeqRef[] {
  if (tab !== 'main') return [{ root: tab, parent: null, branch: 'body' }];
  return [0, ...program.parallel.map((_, i) => i + 1)].map((n) => ({
    root: laneRoot(n),
    parent: null,
    branch: 'body' as const,
  }));
}

/** The tab's beams as Blockly state: one start hat per beam. */
export function toBlockly(program: Program, tab: string): BlocklyState {
  const blocks = tabRoots(program, tab).map((ref, i) => {
    const hat: BlocklyBlock = {
      type: tab === 'main' ? 'nxt_start' : 'nxt_myblock_start',
      id: `start:${ref.root}`,
      x: 20,
      y: 20 + i * 220,
      ...(tab === 'main' ? { fields: { LANE: i === 0 ? 'main beam' : `parallel beam ${i}` } } : {}),
    };
    const body = chain(getSequence(program, ref));
    if (body.block) hat.next = body;
    return hat;
  });
  return { blocks: { languageVersion: 0, blocks } };
}

/** A Blockly block back to a program block. */
function fromBlock(bb: BlocklyBlock): Block {
  const f = bb.fields ?? {};
  if (bb.type === 'nxt_classic' && bb.data) {
    const b = JSON.parse(bb.data) as Block;
    return { ...b, id: bb.id ?? b.id };
  }
  const kindOf: Record<string, Block['kind']> = {
    nxt_move: 'move',
    nxt_motor: 'motor',
    nxt_sound: 'sound',
    nxt_display: 'display',
    nxt_wait_time: 'wait',
    nxt_wait_until: 'wait',
    nxt_loop: 'loop',
    nxt_switch: 'switch',
    nxt_stop: 'stop',
    nxt_reset_rotation: 'resetRotation',
    nxt_reset_timer: 'resetTimer',
    nxt_color_lamp: 'colorLamp',
    nxt_variable: 'variable',
  };
  const kind = kindOf[bb.type];
  if (!kind) throw new Error(`Unknown block type ${bb.type}`);
  const old = (bb.data ? JSON.parse(bb.data) : createBlock(kind)) as Block;
  const id = bb.id ?? old.id;
  const n = (k: string, d = 0) => (Number.isFinite(Number(f[k])) ? Number(f[k]) : d);
  const bool = (k: string) => f[k] === true || f[k] === 'TRUE';
  const duration = () =>
    f['UNIT'] === 'unlimited'
      ? ({ unit: 'unlimited' } as const)
      : ({ unit: f['UNIT'] as 'degrees' | 'rotations' | 'seconds', value: n('VALUE', 1) } as const);
  const sub = (name: string) => sequence(bb.inputs?.[name]?.block);
  switch (old.kind) {
    case 'move':
      return {
        ...old,
        id,
        ports: PORT_SETS[String(f['PORTS'])] ?? old.ports,
        direction: f['DIRECTION'] as typeof old.direction,
        steering: n('STEERING'),
        power: n('POWER', 75),
        duration: duration(),
        nextAction: f['NEXT'] as typeof old.nextAction,
      };
    case 'motor':
      return {
        ...old,
        id,
        port: f['PORT'] as MotorPort,
        direction: f['DIRECTION'] as typeof old.direction,
        power: n('POWER', 75),
        duration: duration(),
        wait: bool('WAIT'),
        nextAction: f['NEXT'] as typeof old.nextAction,
      };
    case 'sound':
      return {
        ...old,
        id,
        action: f['ACTION'] as typeof old.action,
        frequency: n('FREQ', 440),
        file: String(f['FILE'] ?? ''),
        seconds: n('SECONDS', 0.5),
        volume: n('VOLUME', 75),
        wait: bool('WAIT'),
      };
    case 'display':
      return {
        ...old,
        id,
        action: f['ACTION'] as typeof old.action,
        text: String(f['TEXT'] ?? ''),
        x: n('X'),
        line: n('LINE', 4),
        clear: bool('CLEAR'),
      };
    case 'wait':
      return bb.type === 'nxt_wait_time'
        ? { ...old, id, control: { type: 'time', seconds: n('SECONDS', 1) } }
        : {
            ...old,
            id,
            control: {
              type: 'sensor',
              condition: conditionFrom(
                f,
                old.control.type === 'sensor' ? old.control.condition : undefined,
              ),
            },
          };
    case 'loop': {
      const mode = String(f['MODE'] ?? 'forever');
      const oldCondition = old.control.type === 'sensor' ? old.control.condition : undefined;
      const control: typeof old.control =
        mode === 'count'
          ? { type: 'count', count: n('COUNT', 4) }
          : mode === 'time'
            ? { type: 'time', seconds: n('SECONDS', 5) }
            : mode === 'sensor'
              ? { type: 'sensor', condition: conditionFrom(f, oldCondition) }
              : { type: 'forever' };
      return { ...old, id, control, body: sub('DO') };
    }
    case 'switch':
      return {
        ...old,
        id,
        condition: conditionFrom(f, old.condition),
        whenTrue: sub('YES'),
        whenFalse: sub('NO'),
      };
    case 'resetRotation':
      return { ...old, id, port: f['PORT'] as MotorPort };
    case 'resetTimer':
      return { ...old, id, timer: n('TIMER', 1) as 1 | 2 | 3 };
    case 'colorLamp':
      return {
        ...old,
        id,
        port: n('PORT', 3) as 1 | 2 | 3 | 4,
        on: bool('ON'),
        color: f['COLOR'] as typeof old.color,
      };
    case 'variable':
      return {
        ...old,
        id,
        name: String(f['NAME'] ?? old.name),
        action: f['ACTION'] as typeof old.action,
        value: n('VALUE'),
      };
    default:
      return { ...old, id };
  }
}

function sequence(first: BlocklyBlock | undefined): Block[] {
  const out: Block[] = [];
  for (let bb = first; bb; bb = bb.next?.block) out.push(fromBlock(bb));
  return out;
}

/**
 * Applies the Blockly state of a tab to the program: beams in hat order (top to
 * bottom); blocks not attached to a hat are dropped. Wires to blocks that no longer
 * exist are removed by the editor.
 */
export function fromBlockly(state: BlocklyState, program: Program, tab: string): Program {
  const hats = state.blocks.blocks
    .filter((b) => b.type === 'nxt_start' || b.type === 'nxt_myblock_start')
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  const beams = hats.map((h) => sequence(h.next?.block));
  if (tab === 'main') {
    return { ...program, body: beams[0] ?? [], parallel: beams.slice(1) };
  }
  return {
    ...program,
    myBlocks: program.myBlocks.map((m) => (m.id === tab ? { ...m, body: beams[0] ?? [] } : m)),
  };
}
