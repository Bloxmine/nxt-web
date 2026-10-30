import { walkProgram, type Block, type Condition, type Program } from '@nxt/blocks';
import { DataSpace } from './dataspace.js';
import { parseRsrc, resourcesOfType } from './rsrc.js';
import { rewriteRsrc } from './rsrcWrite.js';
import { writeViTagFields, type TagFieldValue } from './vitags.js';

/** Where an imported block came from: its block instance, plus helper instances. */
export interface BlockOrigin {
  /** The block's own instance (the hidden sensor for waits and loops on a sensor). */
  instance?: number;
  /** Loop/wait terminator instance (time and count settings). */
  term?: number;
  /** Hidden sensor instance of a wait, loop or switch condition. */
  sensor?: number;
}

/** What `exportRbt` needs: the original file and how its blocks map to the program. */
export interface RbtOrigin {
  fileName: string;
  bytes: Uint8Array;
  blocks: Record<string, BlockOrigin>;
  /** The program as imported, to see what changed. */
  snapshot: Program;
}

/** The program cannot be written back; `problems` says why, one item per change. */
export class RbtExportError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'RbtExportError';
  }
}

/**
 * Steering in NXT-G: the Move block's slider position −10…10 (kept in the settings tag)
 * becomes a turn ratio through this table (a constant in NXT-G's SetMoveConfig.vi;
 * matches every Move block in the test corpus).
 */
export const STEERING_TABLE = [0, 2, 3, 5, 6, 7, 9, 12, 17, 33, 100] as const;

/** Turn ratio (−100…100) for a slider position (−10…10). */
export function steeringRatio(slider: number): number {
  const s = Math.max(-10, Math.min(10, Math.round(slider)));
  return Math.sign(s) * STEERING_TABLE[Math.abs(s)]!;
}

/** Nearest slider position for a turn ratio. */
export function steeringSlider(ratio: number): number {
  const r = Math.abs(ratio);
  let best = 0;
  STEERING_TABLE.forEach((v, i) => {
    if (Math.abs(v - r) < Math.abs(STEERING_TABLE[best]! - r)) best = i;
  });
  return Math.sign(ratio) * best;
}

type Settings = Record<string, number | boolean | string>;
interface Edit {
  settings: Settings;
  tags: Record<string, Record<string, TagFieldValue>>;
}

const MOTOR_NUMBER = { A: 1, B: 2, C: 3 } as const;
const SENSOR_COMPARE_GT = new Set(['>', '>=']);

/** The block without its nested blocks, for comparing settings. */
function settingsOf(block: Block): string {
  const copy: Record<string, unknown> = { ...block };
  for (const key of ['body', 'whenTrue', 'whenFalse', 'cases', 'id', 'hub']) delete copy[key];
  if (block.kind === 'switch' && block.cases) copy['caseValues'] = block.cases.map((c) => c.value);
  return stable(copy);
}

/** JSON with object keys sorted at every level, for comparing settings. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Program shape: blocks (kind and nesting), wires, variables and My Blocks. */
function shapeOf(program: Program): string {
  const shape = (blocks: readonly Block[]): unknown =>
    blocks.map((b) => [
      b.id,
      b.kind,
      b.kind === 'loop'
        ? [
            b.control.type,
            b.control.type === 'sensor' ? b.control.condition.source : '',
            shape(b.body),
          ]
        : b.kind === 'switch'
          ? [
              b.condition.source,
              shape(b.whenTrue),
              shape(b.whenFalse),
              (b.cases ?? []).map((c) => shape(c.blocks)),
            ]
          : b.kind === 'wait'
            ? [b.control.type, b.control.type === 'sensor' ? b.control.condition.source : '']
            : b.kind === 'sensor'
              ? [b.condition.source]
              : [],
    ]);
  return JSON.stringify({
    body: shape(program.body),
    parallel: program.parallel.map(shape),
    myBlocks: program.myBlocks.map((m) => [m.id, m.name, shape(m.body)]),
    wires: program.wires
      .map((w) => [w.from, w.to])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    variables: program.variables,
  });
}

function index(program: Program): Map<string, Block> {
  const map = new Map<string, Block>();
  walkProgram(program, (b) => map.set(b.id, b));
  return map;
}

const durationGoal = (d: Extract<Block, { kind: 'move' }>['duration']) =>
  d.unit === 'unlimited'
    ? { tagType: 0, tagGoal: undefined, type: 0, goal: 0 }
    : d.unit === 'degrees'
      ? { tagType: 1, tagGoal: d.value, type: 1, goal: Math.round(d.value) }
      : d.unit === 'rotations'
        ? { tagType: 2, tagGoal: d.value, type: 1, goal: Math.round(d.value * 360) }
        : { tagType: 3, tagGoal: d.value, type: 2, goal: Math.round(d.value * 1000) };

/** Edits for a Move block (both the settings tag and the front-panel defaults). */
function editMove(
  b: Extract<Block, { kind: 'move' }>,
  before: Extract<Block, { kind: 'move' }>,
  e: Edit,
  problems: string[],
) {
  const tag: Record<string, TagFieldValue> = {};
  const s = e.settings;
  const stop = b.direction === 'stop';
  const signed = stop ? 0 : b.direction === 'backward' ? -b.power : b.power;
  if (b.power !== before.power || b.direction !== before.direction) {
    tag['Power'] = b.power;
    tag['Direction'] = stop ? 'Stop' : b.direction === 'backward' ? 'Backward' : 'Forward';
    s['Power'] = signed;
    s['Direction'] = b.direction !== 'backward';
  }
  if (b.steering !== before.steering) {
    const slider = steeringSlider(b.steering);
    if (steeringRatio(slider) !== b.steering) {
      problems.push(
        `Move: NXT-G has no steering ${b.steering}; ${steeringRatio(slider)} was used.`,
      );
    }
    tag['Steering'] = slider;
    s['Steering'] = steeringRatio(slider);
  }
  if (
    JSON.stringify(b.duration) !== JSON.stringify(before.duration) ||
    b.direction !== before.direction
  ) {
    const g = durationGoal(b.duration);
    tag['Goal Type'] = g.tagType;
    if (g.tagGoal !== undefined) tag['Goal'] = g.tagGoal;
    s['Goal Type'] = stop ? 3 : g.type;
    s['Goal'] = stop ? 360 : g.goal;
  }
  if (b.nextAction !== before.nextAction) {
    tag['Next'] = b.nextAction === 'coast' ? 1 : 0;
    s['Stop After'] = b.nextAction === 'brake';
  }
  if (JSON.stringify(b.ports) !== JSON.stringify(before.ports)) {
    const names = ['Left Motor', 'Right Motor', 'Other Motor'];
    names.forEach((n, i) => {
      const port = b.ports[i];
      tag[n] = port ?? '';
      s[n] = port ? MOTOR_NUMBER[port] : 0;
    });
  }
  if (Object.keys(tag).length) e.tags['MerlotMoveBlockConfig'] = tag;
}

function editMotor(
  b: Extract<Block, { kind: 'motor' }>,
  before: Extract<Block, { kind: 'motor' }>,
  e: Edit,
) {
  const tag: Record<string, TagFieldValue> = {};
  const s = e.settings;
  const stop = b.direction === 'stop';
  const limited = b.duration.unit !== 'unlimited';
  if (b.port !== before.port) {
    tag['Connection'] = b.port;
    s['Motor'] = MOTOR_NUMBER[b.port];
  }
  if (b.power !== before.power) {
    tag['Power'] = b.power;
    s['Power'] = b.power;
  }
  const goalChanged =
    JSON.stringify(b.duration) !== JSON.stringify(before.duration) ||
    b.direction !== before.direction ||
    b.nextAction !== before.nextAction ||
    b.wait !== before.wait;
  if (b.direction !== before.direction) {
    tag['Direction'] = stop ? 'Stop' : b.direction === 'backward' ? 'Backward' : 'Forward';
    s['Direction'] = b.direction !== 'backward';
  }
  if (goalChanged) {
    const g = durationGoal(b.duration);
    tag['Distance Type'] = g.tagType;
    if (g.tagGoal !== undefined) tag['Distance'] = g.tagGoal;
    tag['Next'] = b.nextAction === 'coast' ? 'Coast' : 'Stop';
    tag['Wait'] = b.wait;
    s['Goal Type'] = stop ? 3 : g.type;
    s['Goal'] = stop ? 0 : g.goal;
    s['Stop After'] = stop || (limited && b.nextAction === 'brake');
    s['Wait'] = stop || (limited && b.wait);
  }
  if (b.regulated !== before.regulated) {
    tag['Regulate'] = b.regulated;
    s['Speed Regulation'] = b.regulated;
  }
  if (Object.keys(tag).length) e.tags['MerlotMotorBlockConfig'] = tag;
}

function editSound(
  b: Extract<Block, { kind: 'sound' }>,
  before: Extract<Block, { kind: 'sound' }>,
  e: Edit,
  problems: string[],
) {
  const tag: Record<string, TagFieldValue> = {};
  const s = e.settings;
  if (b.action !== before.action) {
    if (
      (b.action === 'file') !== (before.action === 'file') &&
      b.action !== 'stop' &&
      before.action !== 'stop'
    ) {
      tag[''] = b.action === 'file' ? 'Sound' : 'Tone';
      s['Type'] = b.action === 'file' ? 0 : 1;
    }
    tag['Action'] = b.action === 'stop' ? 'Stop' : 'Play';
    s['Sound Mode'] = b.action === 'stop' ? 1 : 0;
  }
  if (b.file !== before.file) {
    problems.push(
      'Sound: changing the sound file cannot be written back yet (the block also lists its required files).',
    );
  }
  if (b.frequency !== before.frequency) {
    tag['Tone'] = b.frequency;
    s['Tone'] = b.frequency;
  }
  if (b.seconds !== before.seconds) {
    tag['Duration'] = Math.round(b.seconds * 1000);
    s['Duration'] = Math.round(b.seconds * 1000);
  }
  if (b.volume !== before.volume) {
    tag['Volume'] = b.volume;
    s['Volume'] = b.volume;
  }
  if (b.wait !== before.wait) {
    tag['Wait'] = b.wait;
    s['Wait'] = b.wait;
  }
  if (b.repeat !== before.repeat) {
    tag['Repeat'] = b.repeat;
    s['Repeat'] = b.repeat;
  }
  if (Object.keys(tag).length) e.tags['MerlotSoundBlockConfig'] = tag;
}

function editDisplay(
  b: Extract<Block, { kind: 'display' }>,
  before: Extract<Block, { kind: 'display' }>,
  e: Edit,
  problems: string[],
) {
  const s = e.settings;
  if (b.action !== before.action || b.shape !== before.shape) {
    const fn =
      b.action === 'image'
        ? 0
        : b.action === 'reset'
          ? 5
          : b.action === 'drawing'
            ? { point: 2, line: 3, circle: 4 }[b.shape ?? 'line']
            : 1;
    if (b.action === 'variable')
      problems.push('Display: showing a variable needs a data wire in NXT-G; set it up there.');
    s['Display Function'] = fn;
  }
  if (b.text !== before.text) s['Text'] = b.text;
  if (b.clear !== before.clear) s['Clear Display'] = b.clear;
  if (b.x !== before.x) s['X'] = b.x;
  if (b.line !== before.line || b.y !== before.y) s['Y'] = b.y ?? (8 - b.line) * 8;
  if (b.endX !== before.endX) s['End X'] = b.endX ?? 0;
  if (b.endY !== before.endY) s['End Y'] = b.endY ?? 0;
  if (b.radius !== before.radius) s['Radius'] = b.radius ?? 0;
  if (b.image !== before.image) s['Filename'] = (b.image ?? '').replace(/\.ric$/i, '');
}

/** Settings of a hidden sensor (or Sensor block) for a condition. */
function editCondition(c: Condition, before: Condition, e: Edit, problems: string[]) {
  const s = e.settings;
  const changed = (k: string) =>
    JSON.stringify((c as Record<string, unknown>)[k]) !==
    JSON.stringify((before as Record<string, unknown>)[k]);
  switch (c.source) {
    case 'touch': {
      const b = before as typeof c;
      if (c.port !== b.port) s['Connection'] = c.port;
      if (c.action !== b.action) s['Mode'] = { pressed: 0, released: 1, bumped: 2 }[c.action];
      return;
    }
    case 'ultrasonic': {
      const b = before as typeof c;
      const tag: Record<string, TagFieldValue> = {};
      if (c.port !== b.port) {
        tag['Plug Selector'] = String(c.port);
        s['Connection'] = c.port;
      }
      if (c.compare !== b.compare) {
        tag['Polarity'] = c.compare === '<' ? 1 : 0;
        s['Polarity'] = c.compare === '<';
      }
      if (c.value !== b.value) {
        tag['Comparison'] = c.value;
        s['Threshold'] = c.value;
      }
      if (c.unit !== b.unit) {
        tag['Units'] = c.unit === 'in' ? 1 : 0;
        s['Inches (F)'] = c.unit === 'in';
      }
      if (Object.keys(tag).length) e.tags['DistanceSensorBlockConfig'] = tag;
      return;
    }
    case 'timer': {
      const b = before as typeof c;
      if (c.timer !== b.timer) s['Timer Selection'] = c.timer ?? 1;
      if (c.seconds !== b.seconds) s['Threshold'] = Math.round(c.seconds * 1000);
      if (c.compare !== b.compare) s['Polarity'] = SENSOR_COMPARE_GT.has(c.compare);
      return;
    }
    case 'rotation': {
      const b = before as typeof c;
      if (c.port !== b.port) s['Connection'] = MOTOR_NUMBER[c.port];
      if (c.value !== b.value || c.unit !== b.unit) {
        s['Threshold'] = Math.round(c.unit === 'rotations' ? c.value * 360 : c.value);
      }
      if (c.compare !== b.compare) s['Polarity'] = SENSOR_COMPARE_GT.has(c.compare);
      return;
    }
    case 'button': {
      const b = before as typeof c;
      if (c.button !== b.button) s['Button'] = { right: 1, left: 2, enter: 3 }[c.button];
      if (c.action !== b.action) s['Mode'] = { pressed: 0, released: 1, bumped: 2 }[c.action];
      return;
    }
    default:
      for (const k of Object.keys(c)) {
        if (changed(k))
          problems.push(`${c.source} sensor: changing "${k}" cannot be written back yet.`);
      }
  }
}

/**
 * Writes an imported program back into its original .rbt file. Only settings can
 * change: blocks keep their place and wires (adding, deleting or moving blocks would
 * mean rewriting the block diagram, which is not supported yet).
 *
 * Both copies NXT-G keeps of a block's settings are updated: the settings tag the
 * configuration panel shows, and the front-panel defaults the program runs with
 * (docs/rbt-compat.md, "Front-panel default data").
 */
export function exportRbt(program: Program, origin: RbtOrigin): Uint8Array {
  const problems: string[] = [];
  if (shapeOf(program) !== shapeOf(origin.snapshot)) {
    throw new RbtExportError([
      'Only settings can be changed when saving back to NXT-G: blocks, beams, wires, variables and My Blocks must stay as they were imported.',
    ]);
  }
  const before = index(origin.snapshot);
  const edits = new Map<number, Edit>();
  const editFor = (instance: number | undefined, what: string): Edit | null => {
    if (instance === undefined) {
      problems.push(`${what}: this block has no counterpart in the original file.`);
      return null;
    }
    const e = edits.get(instance) ?? { settings: {}, tags: {} };
    edits.set(instance, e);
    return e;
  };

  walkProgram(program, (b) => {
    const old = before.get(b.id);
    if (!old || settingsOf(b) === settingsOf(old)) return;
    const o = origin.blocks[b.id] ?? {};
    switch (b.kind) {
      case 'move': {
        const e = editFor(o.instance, 'Move');
        if (e) editMove(b, old as typeof b, e, problems);
        return;
      }
      case 'motor': {
        const e = editFor(o.instance, 'Motor');
        if (e) editMotor(b, old as typeof b, e);
        return;
      }
      case 'sound': {
        const e = editFor(o.instance, 'Sound');
        if (e) editSound(b, old as typeof b, e, problems);
        return;
      }
      case 'display': {
        const e = editFor(o.instance, 'Display');
        if (e) editDisplay(b, old as typeof b, e, problems);
        return;
      }
      case 'wait':
      case 'loop': {
        const prev = old as typeof b;
        if (b.control.type === 'time' && prev.control.type === 'time') {
          const e = editFor(o.term, b.kind === 'wait' ? 'Wait' : 'Loop');
          if (e) e.settings['MilliSeconds'] = Math.round(b.control.seconds * 1000);
        } else if (b.control.type === 'count' && prev.control.type === 'count') {
          const e = editFor(o.term, 'Loop');
          if (e) e.settings['Count'] = b.control.count;
        } else if (b.control.type === 'sensor' && prev.control.type === 'sensor') {
          const e = editFor(o.sensor, b.kind === 'wait' ? 'Wait' : 'Loop');
          if (e) editCondition(b.control.condition, prev.control.condition, e, problems);
        } else if (settingsOf(b) !== settingsOf(prev)) {
          problems.push(
            `${b.kind === 'wait' ? 'Wait' : 'Loop'}: this change cannot be written back yet.`,
          );
        }
        return;
      }
      case 'switch': {
        const e = editFor(o.sensor, 'Switch');
        if (e) editCondition(b.condition, (old as typeof b).condition, e, problems);
        return;
      }
      case 'sensor': {
        const e = editFor(o.instance, 'Sensor');
        if (e) editCondition(b.condition, (old as typeof b).condition, e, problems);
        return;
      }
      case 'math':
      case 'compare': {
        const prev = old as typeof b;
        const e = editFor(o.instance, b.kind === 'math' ? 'Math' : 'Compare');
        if (!e) return;
        if (b.a !== prev.a) e.settings['A'] = b.a;
        if (b.b !== prev.b) e.settings['B'] = b.b;
        if (b.op !== prev.op) {
          const ops: readonly string[] = b.kind === 'math' ? ['+', '-', '*', '/'] : ['<', '>', '='];
          e.settings['Operation'] = ops.indexOf(b.op);
        }
        return;
      }
      case 'range': {
        const prev = old as typeof b;
        const e = editFor(o.instance, 'Range');
        if (!e) return;
        if (b.low !== prev.low) e.settings['A'] = b.low;
        if (b.high !== prev.high) e.settings['B'] = b.high;
        if (b.value !== prev.value) e.settings['Value'] = b.value;
        if (b.inside !== prev.inside)
          problems.push('Range: inside/outside cannot be written back yet.');
        return;
      }
      case 'random': {
        const prev = old as typeof b;
        const e = editFor(o.instance, 'Random');
        if (!e) return;
        if (b.min !== prev.min) e.settings['A'] = b.min;
        if (b.max !== prev.max) e.settings['B'] = b.max;
        return;
      }
      case 'logic': {
        const e = editFor(o.instance, 'Logic');
        if (e) e.settings['Operation'] = ['and', 'or', 'xor', 'not'].indexOf(b.op);
        return;
      }
      case 'text': {
        const prev = old as typeof b;
        const e = editFor(o.instance, 'Text');
        if (!e) return;
        if (b.a !== prev.a) e.settings['A'] = b.a;
        if (b.b !== prev.b) e.settings['B'] = b.b;
        if (b.c !== prev.c) e.settings['C'] = b.c;
        return;
      }
      case 'constant': {
        const prev = old as typeof b;
        const e = editFor(o.instance, 'Constant');
        if (!e) return;
        if (b.valueType !== 'number' || prev.valueType !== 'number') {
          problems.push('Constant: only number constants can be written back yet.');
        } else if (b.number !== prev.number) e.settings['Value'] = b.number;
        return;
      }
      case 'colorLamp': {
        const prev = old as typeof b;
        const e = editFor(o.instance, 'Color Lamp');
        if (!e) return;
        const tag: Record<string, TagFieldValue> = {};
        if (b.port !== prev.port) {
          tag['Port'] = String(b.port);
          e.settings['Connection'] = b.port;
        }
        if (b.on !== prev.on) {
          tag['Floodlight'] = b.on;
          e.settings['Action'] = b.on;
        }
        if (b.color !== prev.color) {
          const n = ['red', 'green', 'blue'].indexOf(b.color);
          tag['Lamp Color'] = n;
          e.settings['Lamp Color'] = n;
        }
        if (Object.keys(tag).length) e.tags['ColorLampBlockConfig'] = tag;
        return;
      }
      default:
        problems.push(`${b.kind}: changing this block's settings cannot be written back yet.`);
    }
  });
  // Rounding notes (e.g. steering) are warnings; anything else stops the export.
  const blocking = problems.filter((p) => !p.includes(' was used.'));
  if (blocking.length) throw new RbtExportError(blocking);

  const file = parseRsrc(origin.bytes);
  const vins = resourcesOfType(file, 'VINS');
  const replace = new Map<string, Uint8Array>();
  for (const [number, edit] of edits) {
    const at = vins.findIndex((v) => v.id === number);
    if (at < 0)
      throw new RbtExportError([`Block instance ${number} is missing from the original file.`]);
    const vi = parseRsrc(vins[at]!.data);
    const inner = new Map<string, Uint8Array>();
    if (Object.keys(edit.settings).length) {
      const space = new DataSpace(
        resourcesOfType(vi, 'DSTM')[0]!.data,
        resourcesOfType(vi, 'DFDS')[0]!.data,
      );
      for (const [label, value] of Object.entries(edit.settings)) {
        if (!space.has(label))
          throw new RbtExportError([`The original block has no "${label}" setting.`]);
        space.set(label, value);
      }
      const { dstm, dfds } = space.encode();
      inner.set('DSTM:0', dstm);
      inner.set('DFDS:0', dfds);
    }
    if (Object.keys(edit.tags).length) {
      let vits = resourcesOfType(vi, 'VITS')[0]!.data;
      for (const [tag, fields] of Object.entries(edit.tags))
        vits = writeViTagFields(vits, tag, fields);
      inner.set('VITS:0', vits);
    }
    replace.set(`VINS:${at}`, rewriteRsrc(vins[at]!.data, inner));
  }
  return rewriteRsrc(origin.bytes, replace);
}

/** Notes about values that were rounded to what NXT-G supports (empty if none). */
export function exportNotes(program: Program, origin: RbtOrigin): string[] {
  const notes: string[] = [];
  const before = index(origin.snapshot);
  walkProgram(program, (b) => {
    const old = before.get(b.id);
    if (b.kind === 'move' && old?.kind === 'move' && b.steering !== old.steering) {
      const r = steeringRatio(steeringSlider(b.steering));
      if (r !== b.steering)
        notes.push(`Move: steering ${b.steering} was saved as ${r} (NXT-G's nearest).`);
    }
  });
  return notes;
}
