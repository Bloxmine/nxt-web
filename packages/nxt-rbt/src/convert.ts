import {
  createBlock,
  defaultCondition,
  emptyProgram,
  findBlock,
  insertBlock,
  myBlockPlug,
  newId,
  walkProgram,
  type Block,
  type Condition,
  type Duration,
  type MotorPort,
  type Program,
  type SensorPort,
  type Wire,
} from '@nxt/blocks';
import { ByteReader } from './bytes.js';
import type { RbtDiagram, RbtInstance, RbtNode, RbtProgram, RbtTerminal } from './decode.js';
import type { LvValue } from './lvtype.js';
import { steeringRatio, type BlockOrigin } from './export.js';

/** Result of converting an .rbt program. */
/** Editor data type for a LabVIEW type code (logic, text, otherwise number). */
function dataTypeOf(type: number | undefined): 'number' | 'logic' | 'text' {
  return type === 0x21 ? 'logic' : type === 0x30 ? 'text' : 'number';
}

/** Id of the My Block definition imported from `<name>.rbt`. */
export function myBlockId(name: string): string {
  return `mb_${name.replace(/[^A-Za-z0-9]/g, '_')}`;
}

/** Warning for a My Block whose own .rbt file was not loaded. */
export function myBlockMissing(name: string): string {
  return `My Block "${name}" is saved in its own file (${name}.rbt), so it is empty here. Open the Pack and Go (.rbtx) file to bring it along.`;
}

export interface ImportResult {
  program: Program;
  /** Things that could not be carried over exactly. */
  warnings: string[];
  /** Names of the My Blocks the program calls (each is its own `<name>.rbt`). */
  myBlocks: string[];
  /** Which instances in the file each block's settings come from (for export). */
  origins: Record<string, BlockOrigin>;
}

type Cfg = { [field: string]: LvValue };

const SENSOR_TEMPLATES = new Set([
  'Bumper',
  'Distance Sensor',
  'Light Sensor',
  'FP Light Sensor',
  'Sound Sensor',
  'FP Sound Sensor',
  'FP Rotation Sensor',
  'Timer',
  'NXT Buttons',
  'Color Sensor',
  'FP Color Sensor',
  'Color Detector',
]);

const LOOP_CONTROL = /^Loop(Cnt|Term)/;

function cfg(inst: RbtInstance | undefined, tag: string): Cfg | null {
  const v = inst?.tags.get(tag);
  return v && typeof v === 'object' && !(v instanceof Uint8Array) && !Array.isArray(v)
    ? (v as Cfg)
    : null;
}

const num = (v: LvValue | undefined, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const str = (v: LvValue | undefined, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

/** Front-panel defaults ("DFDS"): values start at 0xC0, big-endian. */
class Defaults {
  readonly r: ByteReader;
  constructor(bytes: Uint8Array) {
    this.r = new ByteReader(bytes);
  }
  ok(offset: number, length: number): boolean {
    return offset >= 0 && offset + length <= this.r.length;
  }
  u16(o: number, fallback = 0): number {
    return this.ok(o, 2) ? this.r.u16(o) : fallback;
  }
  u32(o: number, fallback = 0): number {
    return this.ok(o, 4) ? this.r.u32(o) : fallback;
  }
  f32(o: number, fallback = 0): number {
    return this.ok(o, 4) ? this.r.f32(o) : fallback;
  }
  f64(o: number, fallback = 0): number {
    return this.ok(o, 8) ? this.r.f64(o) : fallback;
  }
  /** Index of a byte pattern at or after `from`, or -1. */
  find(pattern: number[], from = 0xc0): number {
    const b = this.r.bytes;
    outer: for (let i = from; i + pattern.length <= b.length; i++) {
      for (let k = 0; k < pattern.length; k++) if (b[i + k] !== pattern[k]) continue outer;
      return i;
    }
    return -1;
  }
}

/** The (-inf, +inf, 0) single-precision range triple stored before numeric values. */
const SGL_RANGE = [0xff, 0x80, 0, 0, 0x7f, 0x80, 0, 0, 0, 0, 0, 0];

const DURATION_UNITS = ['unlimited', 'degrees', 'rotations', 'seconds'] as const;

function duration(type: number, amount: number): Duration {
  const unit = DURATION_UNITS[type] ?? 'unlimited';
  return unit === 'unlimited' ? { unit } : { unit, value: amount };
}

function motorPort(v: LvValue | undefined): MotorPort | null {
  const s = str(v);
  return s === 'A' || s === 'B' || s === 'C' ? s : null;
}

function sensorPort(v: number): SensorPort {
  return (v >= 1 && v <= 4 ? v : 1) as SensorPort;
}

/** Maps original plug names to this editor's plug names, per block kind. */
const PLUG_NAMES: Record<string, Record<string, string>> = {
  move: { Power: 'power', Steering: 'steering', Direction: 'direction', Goal: 'duration' },
  motor: { Power: 'power', Direction: 'direction', Goal: 'duration' },
  sound: { Tone: 'frequency', Volume: 'volume' },
  display: { Text: 'text', X: 'x', Y: 'y', 'End X': 'endX', 'End Y': 'endY', Radius: 'radius' },
  variable: { Value: 'value' },
  sensor: {
    Boolean: 'yes',
    'Raw Value': 'value',
    Distance: 'value',
    'Degrees out': 'value',
    'Timer Value': 'value',
    Intensity: 'value',
    Color: 'value',
    Threshold: 'trigger',
    'Trigger Point': 'trigger',
    'Detected Color Number': 'value',
    'Lamp Color': 'lamp',
    Floodlight: 'light',
  },
  compare: { A: 'a', B: 'b', Boolean: 'result' },
  math: { A: 'a', B: 'b', Value: 'result' },
  logic: { A: 'a', B: 'b', Boolean: 'result' },
  range: { A: 'low', B: 'high', Value: 'value', Boolean: 'result' },
  numberToText: { Number: 'number', Text: 'text' },
  text: { A: 'a', B: 'b', C: 'c', String: 'result' },
  file: {
    Filename: 'filename',
    'Text In': 'text',
    'Text Out': 'text',
    'Number In': 'number',
    'Number Out': 'number',
    Error: 'error',
    'File Size': 'size',
  },
  constant: { Value: 'value' },
  sendMessage: {
    Mailbox: 'mailbox',
    'Number In': 'value',
    'Boolean In': 'value',
    'String In': 'value',
  },
  receiveMessage: {
    Mailbox: 'mailbox',
    'Message Received': 'received',
    'Number Out': 'value',
    'Boolean Out': 'value',
    'String Out': 'value',
  },
};

/** Converts a decoded .rbt program into the editor's Program model. */
export function convertRbt(rbt: RbtProgram): ImportResult {
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (!warnings.includes(msg)) warnings.push(msg);
  };
  const program: Program = {
    ...emptyProgram(rbt.name.replace(/\.rbt$/i, '').slice(0, 15)),
    variables: [],
  };
  const variables = new Map<string, 'number' | 'logic' | 'text'>();
  const myBlockNames = new Set<string>();
  const origins: Record<string, BlockOrigin> = {};

  // ---------- terminals and wiring ----------
  const termsByOwner = new Map<number, RbtTerminal[]>();
  for (const t of rbt.terminals.values()) {
    const list = termsByOwner.get(t.owner);
    if (list) list.push(t);
    else termsByOwner.set(t.owner, [t]);
  }
  const term = (owner: number, name: string) =>
    termsByOwner.get(owner)?.find((t) => t.name === name);

  // Data nets: connect wire ends and pass through tunnels.
  type EndKey = string;
  const key = (terminal: number, inside: boolean): EndKey => `${terminal}:${inside ? 'i' : 'o'}`;
  const adjacency = new Map<EndKey, Set<EndKey>>();
  const link = (a: EndKey, b: EndKey) => {
    adjacency.set(a, (adjacency.get(a) ?? new Set()).add(b));
    adjacency.set(b, (adjacency.get(b) ?? new Set()).add(a));
  };
  for (const w of rbt.wires) {
    if (w.beam) continue;
    const keys = w.ends.map((e) => key(e.terminal, e.inside));
    for (let i = 1; i < keys.length; i++) link(keys[0]!, keys[i]!);
  }
  for (const t of rbt.terminals.values()) {
    if (t.role === 'tunnel') link(key(t.ptr, false), key(t.ptr, true));
  }
  /** Everything a block output reaches through wires and tunnels. */
  const reach = (terminal: number): RbtTerminal[] => {
    const start = key(terminal, false);
    const seen = new Set<EndKey>([start]);
    const queue = [start];
    const found: RbtTerminal[] = [];
    while (queue.length) {
      const k = queue.shift()!;
      for (const n of adjacency.get(k) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        const t = rbt.terminals.get(Number(n.split(':')[0]));
        if (!t) continue;
        if (
          t.ownerKind === 'block' ||
          t.ownerKind === 'param' ||
          t.role === 'selector' ||
          t.role === 'condition'
        )
          found.push(t);
        if (t.role === 'tunnel' || t.ownerKind !== 'block') queue.push(n);
      }
    }
    return found;
  };
  /** Data sources feeding a terminal (a block input, selector or loop condition). */
  const sourcesOf = (target: RbtTerminal): RbtTerminal[] =>
    [...rbt.terminals.values()].filter(
      (t) =>
        t.ownerKind === 'block' &&
        t.output &&
        !t.name?.startsWith('Sequence') &&
        reach(t.ptr).includes(target),
    );

  // ---------- beams ----------
  const beamNext = new Map<number, number[]>(); // node -> next nodes (same diagram)
  const beamPrev = new Map<number, number[]>();
  const entryOf = new Map<number, number[]>(); // diagram -> first nodes
  for (const w of rbt.wires) {
    if (!w.beam) continue;
    const ends = w.ends.map((e) => ({ e, t: rbt.terminals.get(e.terminal)! })).filter((x) => x.t);
    // Source: a block output, else the inner side of a structure (the beam
    // entering its diagram), else — between two structures — the leftmost one,
    // since beams run left to right.
    const outer = ends.filter((x) => x.t.ownerKind !== 'block' && !x.e.inside);
    outer.sort(
      (a, b) =>
        (rbt.nodes.get(a.t.owner)?.rect.left ?? 0) - (rbt.nodes.get(b.t.owner)?.rect.left ?? 0),
    );
    const src =
      ends.find((x) => x.t.ownerKind === 'block' && x.t.output) ??
      ends.find((x) => x.t.ownerKind !== 'block' && x.e.inside) ??
      outer[0];
    if (!src) continue;
    const srcNode = src.t.ownerKind !== 'block' && src.e.inside ? null : src.t.owner;
    for (const x of ends) {
      if (x === src) continue;
      if (x.t.ownerKind !== 'block' && x.e.inside) continue; // exit of the inner diagram
      const dst = x.t.owner;
      if (srcNode === null) entryOf.set(w.diagram, [...(entryOf.get(w.diagram) ?? []), dst]);
      else {
        beamNext.set(srcNode, [...(beamNext.get(srcNode) ?? []), dst]);
        beamPrev.set(dst, [...(beamPrev.get(dst) ?? []), srcNode]);
      }
    }
  }

  // ---------- hidden condition sensors ----------
  // A sensor block whose yes/no output only feeds a switch selector or loop
  // condition is the switch's or loop's own sensor setting, not a visible block.
  const hidden = new Set<number>();
  const conditionSource = new Map<number, RbtNode>(); // structure -> sensor node
  const isSensor = (n: RbtNode | undefined) =>
    !!n?.instance && SENSOR_TEMPLATES.has(n.instance.template);
  for (const node of rbt.nodes.values()) {
    if (node.kind === 'block') continue;
    const target = termsByOwner
      .get(node.ptr)
      ?.find((t) => t.role === (node.kind === 'switch' ? 'selector' : 'condition'));
    if (!target) continue;
    const sources = sourcesOf(target);
    const src = sources[0] ? rbt.nodes.get(sources[0].owner) : undefined;
    if (!src || !isSensor(src)) continue;
    // Stays a visible block (wired into the structure) when it has wired inputs
    // or picks between more than two cases (e.g. a color switch, one case per color).
    const wiredInputs = (termsByOwner.get(src.ptr) ?? []).some(
      (t) => !t.output && !t.name?.startsWith('Sequence') && sourcesOf(t).length > 0,
    );
    if (wiredInputs || (node.kind === 'switch' && node.diagrams.length > 2)) continue;
    const others = (termsByOwner.get(src.ptr) ?? [])
      .filter((t) => t.output && !t.name?.startsWith('Sequence'))
      .flatMap((t) => reach(t.ptr))
      .filter((t) => t !== target);
    if (others.length === 0) {
      hidden.add(src.ptr);
      conditionSource.set(node.ptr, src);
    }
  }

  // ---------- block settings ----------
  const blockFor = new Map<number, Block>(); // node ptr -> created block

  const conditionFromSensor = (n: RbtNode): Condition | null => {
    const inst = n.instance!;
    const d = new Defaults(inst.dfds);
    switch (inst.template) {
      case 'Bumper': {
        const port = sensorPort(d.u32(0xc0));
        const at = d.find([0x00, 0x05, 0x00], 0xc4);
        const a = at >= 0 ? d.r.u8(at + 3) : 1;
        const b = at >= 0 ? d.r.u8(at + 4) : 0;
        const action = a === 1 && b === 0 ? 'pressed' : a === 0 && b === 1 ? 'released' : 'bumped';
        return { source: 'touch', port, action };
      }
      case 'Distance Sensor': {
        const c = cfg(inst, 'DistanceSensorBlockConfig');
        return {
          source: 'ultrasonic',
          port: sensorPort(Number(str(c?.['Plug Selector'], '4'))),
          compare: num(c?.['Polarity'], 1) === 1 ? '<' : '>',
          value: num(c?.['Comparison'], 50),
          unit: num(c?.['Units'], 0) === 1 ? 'in' : 'cm',
        };
      }
      case 'FP Rotation Sensor': {
        const p = d.u32(0xc0, 1);
        const port: MotorPort = p === 2 ? 'B' : p === 3 ? 'C' : 'A';
        return { source: 'rotation', port, compare: '>', value: d.u32(0xc4, 360), unit: 'degrees' };
      }
      case 'Timer': {
        const t = d.r.length > 0x12c ? d.r.u8(0x12c) : 1;
        return {
          source: 'timer',
          timer: (t >= 1 && t <= 3 ? t : 1) as 1 | 2 | 3,
          compare: '>',
          seconds: d.f64(0xd4, 5),
        };
      }
      case 'Color Detector': {
        // NXT 2.0 Color Sensor block: typed settings tag.
        const c = cfg(inst, 'ColorDetectorBlockConfig');
        const names = ['black', 'blue', 'green', 'yellow', 'red', 'white'] as const;
        const lampName = str(c?.[''], 'Red').toLowerCase();
        const lamp =
          c?.['Generate Light?'] === false
            ? 'none'
            : lampName === 'green' || lampName === 'blue'
              ? lampName
              : 'red';
        return {
          source: 'color',
          port: sensorPort(Number(str(c?.['Plug Selector'], '3'))),
          mode: num(c?.['Mode'], 0) === 1 ? 'light' : 'range',
          inside: c?.['Inside Outside Range'] !== false,
          from: names[num(c?.['Color Range A'], 5) - 1] ?? 'red',
          to: names[num(c?.['Color Range B'], 5) - 1] ?? 'red',
          compare: c?.['Polarity'] === false ? '<' : '>',
          value: num(c?.['Trigger Point'], 50),
          lamp,
        };
      }
      case 'NXT Buttons': {
        const b = d.u16(0xc0, 3);
        const m = d.u16(0xc4, 0);
        return {
          source: 'button',
          button: b === 1 ? 'right' : b === 2 ? 'left' : 'enter',
          action: m === 1 ? 'released' : m === 2 ? 'bumped' : 'pressed',
        };
      }
      default: {
        const c = cfg(inst, 'ColorSensorBlockConfig') ?? cfg(inst, 'LightSensorBlockConfig');
        if (/Color/i.test(inst.template)) {
          warn('Color sensor settings were not found in this file; defaults were used.');
          return {
            ...(defaultCondition('color') as Extract<Condition, { source: 'color' }>),
            port: sensorPort(num(c?.['Port'], 3)),
          };
        }
        if (/Light/i.test(inst.template)) return defaultCondition('light');
        if (/Sound/i.test(inst.template)) return defaultCondition('sound');
        warn(`Unknown sensor "${inst.template}"; a touch sensor was used instead.`);
        return defaultCondition('touch');
      }
    }
  };

  const makeBlock = (n: RbtNode): Block | null => {
    const inst = n.instance;
    if (!inst) {
      warn('A block without settings was skipped.');
      return null;
    }
    const d = new Defaults(inst.dfds);
    const t = inst.template;
    switch (t) {
      case 'Start':
        return null;
      case 'Move': {
        const c = cfg(inst, 'MerlotMoveBlockConfig');
        const ports = [
          motorPort(c?.['Left Motor']),
          motorPort(c?.['Right Motor']),
          motorPort(c?.['Other Motor']),
        ].filter((p): p is MotorPort => p !== null);
        const dir = str(c?.['Direction'], 'Forward');
        return {
          ...createBlock('move'),
          ports: [...new Set(ports)].sort(),
          direction: dir === 'Backward' ? 'backward' : dir === 'Stop' ? 'stop' : 'forward',
          steering: steeringRatio(num(c?.['Steering'])),
          power: num(c?.['Power'], 75),
          duration: duration(num(c?.['Goal Type']), num(c?.['Goal'], 1)),
          nextAction: num(c?.['Next']) === 1 ? 'coast' : 'brake',
        } as Block;
      }
      case 'Motor': {
        const c = cfg(inst, 'MerlotMotorBlockConfig');
        const dir = str(c?.['Direction'], 'Forward');
        return {
          ...createBlock('motor'),
          port: motorPort(c?.['Connection']) ?? 'A',
          direction: dir === 'Backward' ? 'backward' : dir === 'Stop' ? 'stop' : 'forward',
          power: num(c?.['Power'], 75),
          regulated: c?.['Regulate'] === true,
          duration: duration(num(c?.['Distance Type']), num(c?.['Distance'], 1)),
          wait: c?.['Wait'] === true,
          nextAction: str(c?.['Next'], 'Stop') === 'Stop' ? 'brake' : 'coast',
        } as Block;
      }
      case 'Sound': {
        const c = cfg(inst, 'MerlotSoundBlockConfig');
        const mode = str(c?.[''], 'Tone');
        const stop = str(c?.['Action'], 'Play') === 'Stop';
        return {
          ...createBlock('sound'),
          action: stop ? 'stop' : mode === 'Tone' ? 'tone' : 'file',
          frequency: num(c?.['Tone'], 440),
          file: str(c?.['Filename'], 'Good Job'),
          seconds: num(c?.['Duration'], 500) / 1000,
          volume: num(c?.['Volume'], 75),
          wait: c?.['Wait'] === true,
          repeat: c?.['Repeat'] === true,
        } as Block;
      }
      case 'Color Lamp': {
        const c = cfg(inst, 'ColorLampBlockConfig');
        const colors = ['red', 'green', 'blue'] as const;
        return {
          ...createBlock('colorLamp'),
          port: sensorPort(Number(str(c?.['Port'], '3'))),
          on: c?.['Floodlight'] !== false,
          color: colors[num(c?.['Lamp Color'])] ?? 'red',
        } as Block;
      }
      case 'Display': {
        // Defaults (sparse: empty/zero values are left out):
        //   [text: u32 length + chars] [clear: 01] I16 range, u16 ?, u16 function,
        //   4 I16 ranges, coordinates (u16 each, non-zero only), file name.
        let p = 0xc0;
        let textValue = '';
        const len = d.u32(p);
        if (len > 0 && len < 120 && d.ok(p + 4, len) && !startsWith(d, p, [0x80, 0, 0x7f, 0xff])) {
          textValue = d.r.text(p + 4, len);
          p += 4 + len;
        }
        let clear = false;
        if (d.ok(p, 1) && d.r.u8(p) === 1) {
          clear = true;
          p += 1;
        }
        const I16_RANGE = [0x80, 0, 0x7f, 0xff, 0, 0];
        if (startsWith(d, p, I16_RANGE)) p += 6;
        p += 2; // u16, purpose unknown (4 or 10)
        // Display function, left out when 0 (image).
        let fn = 0;
        if (!startsWith(d, p, I16_RANGE)) {
          fn = d.u16(p);
          p += 2;
        }
        while (startsWith(d, p, I16_RANGE)) p += 6;
        const values: number[] = [];
        while (d.ok(p, 6) && values.length < 6) {
          const maybeLen = d.u32(p);
          if (
            maybeLen > 0 &&
            maybeLen < 20 &&
            d.ok(p + 4, maybeLen) &&
            /^[\x20-\x7e]+$/.test(d.r.text(p + 4, maybeLen))
          )
            break;
          values.push(d.u16(p));
          p += 2;
        }
        const nameLen = d.u32(p);
        const image =
          nameLen > 0 && nameLen < 20 && d.ok(p + 4, nameLen)
            ? d.r.text(p + 4, nameLen)
            : 'Smile 01';
        // Function: 0 image, 1 text, 2 point, 3 line, 4 circle, 5 clear screen.
        const drawing = fn >= 2 && fn <= 4;
        let x = 0;
        let y = 0;
        let endX = 0;
        let endY = 0;
        let radius = 0;
        const at = (k: number) => values[k] ?? 0;
        if (values.length >= 4) {
          x = at(0);
          y = at(1);
          endX = at(2);
          endY = at(3);
          radius = at(4);
        } else if (values.length === 3) {
          // One of X/Y is zero and left out: text keeps X (checked on CheckoutScan),
          // drawings keep Y (checked on LightMeter's bar graph).
          if (drawing) y = at(0);
          else x = at(0);
          endX = at(1);
          endY = at(2);
        } else if (values.length === 2) {
          endX = at(0);
          endY = at(1);
        } else if (values.length === 1) {
          x = at(0);
        }
        const block = {
          ...createBlock('display'),
          action: fn === 0 ? 'image' : fn === 5 ? 'reset' : drawing ? 'drawing' : 'text',
          text: textValue,
          x,
          line: Math.min(8, Math.max(1, 8 - Math.floor(y / 8))),
          clear,
        } as Extract<Block, { kind: 'display' }>;
        if (fn === 0) block.image = image;
        if (drawing) {
          block.shape = fn === 2 ? 'point' : fn === 4 ? 'circle' : 'line';
          block.y = y;
          block.endX = endX;
          block.endY = endY;
          block.radius = radius;
        }
        return block;
      }
      case 'Variable': {
        const name = str(inst.tags.get('VarName') as LvValue, 'Number 1');
        const valueTerm = term(n.ptr, 'Value');
        const slotType =
          valueTerm?.slot === undefined ? undefined : inst.plugs[valueTerm.slot]?.type;
        const valueType = slotType === 0x21 ? 'logic' : slotType === 0x30 ? 'text' : 'number';
        variables.set(name, valueType);
        return {
          ...createBlock('variable'),
          name,
          action: valueTerm?.output ? 'read' : 'set',
          value: 0,
          ...(valueType === 'number' ? {} : { valueType }),
        } as Block;
      }
      case 'FP Numeric Operations': {
        let p = 0xd8;
        let b = 0;
        if (!startsWith(d, p, SGL_RANGE.slice(0, 4))) {
          b = d.f32(p);
          p += 4;
        }
        const op = startsWith(d, p, [0xff, 0x80]) ? 0 : d.u16(p);
        const ops = ['+', '-', '*', '/'] as const;
        return { ...createBlock('math'), op: ops[op] ?? '+', b, hub: true } as Block;
      }
      case 'FP Numeric Comparison': {
        const b = startsWith(d, 0xd8, [0, 0, 0xff, 0xff]) ? 0 : d.f32(0xd8);
        const anchor = d.find([0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 3], 0xd8);
        const op = anchor > 2 ? d.u16(anchor - 2) : 0;
        const ops = ['<', '>', '='] as const;
        return { ...createBlock('compare'), op: ops[op] ?? '<', b, hub: true } as Block;
      }
      case 'FP Range': {
        const present = !startsWith(d, 0xc0, SGL_RANGE.slice(0, 4));
        return {
          ...createBlock('range'),
          low: present ? d.f32(0xc0) : 0,
          high: present ? d.f32(0xc4) : 100,
          value: present ? d.f32(0xd4, 50) : 50,
          hub: true,
        } as Block;
      }
      case 'Boolean Operation': {
        // Operation is a 16-bit value just before three 32-bit 4s (like Compare).
        const anchor = d.find([0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4], 0xc0);
        const op = anchor > 2 ? d.u16(anchor - 2) : 0;
        const ops = ['and', 'or', 'xor', 'not'] as const;
        return { ...createBlock('logic'), op: ops[op] ?? 'and', hub: true } as Block;
      }
      case 'FP File Access': {
        // Sparse defaults: optional Text In string, Number In range, file name,
        // then the action (u16) just before "0000 ffff 0000 0000 0004".
        let p = 0xc0;
        let textIn = '';
        if (!startsWith(d, p, SGL_RANGE.slice(0, 4))) {
          const len = d.u32(p);
          if (len < 200 && d.ok(p + 4, len)) {
            textIn = d.r.text(p + 4, len);
            p += 4 + len;
          }
        }
        if (startsWith(d, p, SGL_RANGE)) p += 12;
        const nameLen = d.u32(p);
        const file =
          nameLen > 0 && nameLen < 40 && d.ok(p + 4, nameLen) ? d.r.text(p + 4, nameLen) : 'MyFile';
        const anchor = d.find([0, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 4], p);
        const action = anchor > 2 ? d.u16(anchor - 2) : 1;
        const actions = ['read', 'write', 'close', 'delete'] as const;
        const numberWired =
          !!term(n.ptr, 'Number In') && sourcesOf(term(n.ptr, 'Number In')!).length > 0;
        const numberOut = term(n.ptr, 'Number Out');
        const numberRead = !!numberOut && reach(numberOut.ptr).length > 0;
        return {
          ...createBlock('file'),
          action: actions[action] ?? 'write',
          file,
          type: numberWired || numberRead ? 'number' : 'text',
          text: textIn,
          hub: true,
        } as Block;
      }
      case 'FP Message Write':
      case 'FP Message Read': {
        // Sparse defaults: [connection] mailbox (1–10, one byte each), SGL range,
        // [number value], then "00 ff" and the message type (0 text, 1 number, 2 logic).
        const lead: number[] = [];
        let p = 0xc0;
        while (lead.length < 2 && d.ok(p, 1) && !startsWith(d, p, SGL_RANGE.slice(0, 4)))
          lead.push(d.r.u8(p++));
        const mailbox = lead.length ? lead[lead.length - 1]! : 1;
        const connection = lead.length === 2 ? lead[0]! : 0;
        if (startsWith(d, p, SGL_RANGE)) p += 12;
        let number = 0;
        if (!startsWith(d, p, [0, 0xff])) {
          number = d.f32(p);
          p += 4;
        }
        const typeCode = startsWith(d, p, [0, 0xff]) ? d.u16(p + 2) : 1;
        const types = ['text', 'number', 'logic'] as const;
        // Wiring decides when the stored type is ambiguous.
        const wiredType = (['String', 'Number', 'Boolean'] as const).find((k) => {
          const plug = term(n.ptr, `${k} ${t === 'FP Message Write' ? 'In' : 'Out'}`);
          return plug && (plug.output ? reach(plug.ptr).length > 0 : sourcesOf(plug).length > 0);
        });
        const type = wiredType
          ? types[['String', 'Number', 'Boolean'].indexOf(wiredType)]!
          : (types[typeCode] ?? 'number');
        if (t === 'FP Message Read') {
          return {
            ...createBlock('receiveMessage'),
            mailbox: Math.max(1, mailbox),
            type,
            hub: true,
          } as Block;
        }
        return {
          ...createBlock('sendMessage'),
          connection: Math.min(3, connection) as 0 | 1 | 2 | 3,
          mailbox: Math.max(1, mailbox),
          type,
          number,
          hub: true,
        } as Block;
      }
      case 'Constant': {
        // Defaults: a description string (u32 length + text), then the value.
        const len = d.u32(0xc0);
        const p = len < 400 ? 0xc4 + len : 0xc0;
        const valueTerm = term(n.ptr, 'Value');
        const type =
          valueTerm?.slot === undefined ? 0x09 : (inst.plugs[valueTerm.slot]?.type ?? 0x09);
        const block = { ...createBlock('constant'), hub: true } as Extract<
          Block,
          { kind: 'constant' }
        >;
        if (type === 0x21) {
          block.valueType = 'logic';
          block.logic = d.ok(p, 1) && d.r.u8(p) !== 0;
        } else if (type === 0x30) {
          block.valueType = 'text';
          const tl = d.u32(p);
          block.text = tl < 200 && d.ok(p + 4, tl) ? d.r.text(p + 4, tl) : '';
        } else {
          block.number = d.f32(p);
        }
        return block;
      }
      case 'FP Number To Text':
        return { ...createBlock('numberToText'), hub: true } as Block;
      case 'String Construct': {
        const parts: string[] = [];
        let p = 0xc0;
        for (let i = 0; i < 3; i++) {
          const len = d.u32(p, 0);
          if (len > 200 || !d.ok(p + 4, len)) break;
          parts.push(d.r.text(p + 4, len));
          p += 4 + len;
        }
        return {
          ...createBlock('text'),
          a: parts[0] ?? '',
          b: parts[1] ?? '',
          c: parts[2] ?? '',
          hub: true,
        } as Block;
      }
      default: {
        if (SENSOR_TEMPLATES.has(t)) {
          const condition = conditionFromSensor(n);
          if (
            !condition ||
            condition.source === 'variable' ||
            condition.source === 'logic' ||
            condition.source === 'value'
          )
            return null;
          return { ...createBlock('sensor'), condition, hub: true } as Block;
        }
        if (/^Random/i.test(t)) return { ...createBlock('random'), hub: true } as Block;
        if (/Reset/i.test(t) && /Rotation/i.test(t)) return createBlock('resetRotation');
        if (/^Stop/i.test(t)) return createBlock('stop');
        // A My Block: its template is the My Block's own .rbt file.
        if (/\.rbt$/i.test(t)) {
          const name = t.replace(/\.rbt$/i, '');
          myBlockNames.add(name);
          // Its data plugs (the My Block's parameters) come from the connector pane.
          const params = (termsByOwner.get(n.ptr) ?? [])
            .filter((x) => x.name && !x.name.startsWith('Sequence'))
            .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
            .map((x) => ({
              name: x.name!,
              type: dataTypeOf(x.slot === undefined ? undefined : inst.plugs[x.slot]?.type),
              direction: x.output ? ('out' as const) : ('in' as const),
            }));
          return {
            ...createBlock('myBlock'),
            ref: myBlockId(name),
            ...(params.length ? { params } : {}),
          } as Block;
        }
        warn(`Block "${t || inst.title || 'unknown'}" is not supported yet and was left out.`);
        return null;
      }
    }
  };

  // ---------- sequences ----------
  const isControl = (n: RbtNode) => !!n.instance && LOOP_CONTROL.test(n.instance.template);

  /** Orders a diagram's nodes along its beam(s). Returns lanes; lane 0 is the main beam. */
  const lanesOf = (diagram: RbtDiagram): RbtNode[][] => {
    const inDiagram = new Set(diagram.nodes.map((n) => n.ptr));
    const start =
      diagram.owner === null
        ? diagram.nodes.filter((n) => n.instance?.template === 'Start').map((n) => n.ptr)
        : (entryOf.get(diagram.ptr) ?? []).filter((p) => inDiagram.has(p));
    const visited = new Set<number>();
    const lanes: RbtNode[][] = [];
    const walk = (first: number) => {
      const lane: RbtNode[] = [];
      let cur: number | undefined = first;
      while (cur !== undefined && inDiagram.has(cur) && !visited.has(cur)) {
        visited.add(cur);
        lane.push(rbt.nodes.get(cur)!);
        const next: number[] = (beamNext.get(cur) ?? []).filter(
          (p) => inDiagram.has(p) && !visited.has(p),
        );
        const here: RbtNode = rbt.nodes.get(cur)!;
        next.sort(
          (a, b) =>
            Math.abs(rbt.nodes.get(a)!.rect.top - here.rect.top) -
            Math.abs(rbt.nodes.get(b)!.rect.top - here.rect.top),
        );
        // Extra successors start parallel beams, unless another block also
        // leads there (then it is just a join of the same beam).
        for (const extra of next.slice(1)) {
          if ((beamPrev.get(extra) ?? []).filter((q) => inDiagram.has(q)).length <= 1)
            pending.push(extra);
        }
        cur = next[0];
      }
      if (lane.length) lanes.push(lane);
    };
    // A beam may enter a node from several places (e.g. a structure's entry
    // also wired straight to a later block). Only nodes without another
    // predecessor in this diagram start a lane.
    const hasPredecessor = (p: number) => (beamPrev.get(p) ?? []).some((q) => inDiagram.has(q));
    const pending: number[] = start.filter((p) => !hasPredecessor(p) || diagram.owner === null);
    if (pending.length === 0 && start[0] !== undefined) pending.push(start[0]);
    while (pending.length) {
      const next = pending.shift()!;
      if (!visited.has(next)) walk(next);
    }
    // Anything not reached from the start sits off the beam and never runs.
    const offBeam = diagram.nodes.filter(
      (n) => !visited.has(n.ptr) && !hidden.has(n.ptr) && !isControl(n),
    );
    if (offBeam.length) {
      warn(
        `Blocks not connected to a sequence beam were left out (the original never runs them): ${offBeam
          .map((n) => n.instance?.template ?? n.kind)
          .join(', ')}.`,
      );
    }
    return lanes;
  };

  const convertLane = (nodes: RbtNode[]): Block[] => nodes.flatMap((n) => convertNode(n) ?? []);

  const convertNode = (n: RbtNode): Block | null => {
    if (hidden.has(n.ptr) || isControl(n)) return null;
    let block: Block | null;
    if (n.kind === 'block') block = makeBlock(n);
    else if (n.kind === 'loop') block = convertLoop(n);
    else block = convertSwitch(n);
    if (block) {
      blockFor.set(n.ptr, block);
      // Where its settings live in the file, for writing them back (export.ts).
      const sensor = conditionSource.get(n.ptr)?.instance?.number;
      const term = (n.diagrams[0]?.nodes ?? []).find(
        (c) => c.instance && /^LoopTerm/.test(c.instance.template),
      )?.instance?.number;
      origins[block.id] = {
        ...(n.instance ? { instance: n.instance.number } : {}),
        ...(sensor !== undefined ? { sensor } : {}),
        ...(n.kind === 'loop' && term !== undefined ? { term } : {}),
      };
    }
    return block;
  };

  const convertLoop = (n: RbtNode): Block => {
    const body = n.diagrams[0];
    const lanes = body ? lanesOf(body) : [];
    if (lanes.length > 1) warn('A loop contains parallel beams; they were joined into one beam.');
    const inner = lanes.flatMap(convertLane);
    const controls = (body?.nodes ?? []).filter(isControl).map((c) => c.instance!);
    const term = controls.find((c) => /^LoopTerm/.test(c.template));
    const sensor = conditionSource.get(n.ptr);
    const counterNode = (body?.nodes ?? []).find(
      (c) => c.instance && /^LoopCnt/.test(c.instance.template),
    );
    const counter = counterNode
      ? (termsByOwner.get(counterNode.ptr) ?? []).find((t) => t.name === 'Loop Count')
      : undefined;
    const showCounter = !!counter && reach(counter.ptr).some((t) => t.ownerKind === 'block');

    // Wait-for-time blocks are loops with a time terminator and nothing inside.
    if (
      term?.template === 'LoopTermTimeWait' ||
      (term?.template === 'LoopTermTime' && inner.length === 0 && !sensor)
    ) {
      const ms = new Defaults(term.dfds).u32(0xcc, 1000);
      return { id: newId(), kind: 'wait', control: { type: 'time', seconds: ms / 1000 } };
    }
    if (sensor && inner.length === 0) {
      const condition = conditionFromSensor(sensor);
      if (condition) return { id: newId(), kind: 'wait', control: { type: 'sensor', condition } };
    }
    const loop = createBlock('loop') as Extract<Block, { kind: 'loop' }>;
    loop.body = inner;
    if (showCounter) loop.showCounter = true;
    if (term?.template === 'LoopTermTime') {
      loop.control = { type: 'time', seconds: new Defaults(term.dfds).u32(0xcc, 1000) / 1000 };
    } else if (term?.template === 'LoopTermCount') {
      loop.control = { type: 'count', count: new Defaults(term.dfds).u32(0xcc, 1) };
    } else if (sensor) {
      const condition = conditionFromSensor(sensor);
      if (condition) loop.control = { type: 'sensor', condition };
    } else {
      const cond = termsByOwner.get(n.ptr)?.find((t) => t.role === 'condition');
      if (cond && sourcesOf(cond).length > 0)
        loop.control = { type: 'sensor', condition: { source: 'logic' } };
    }
    if (counter) loopCounters.set(counter.ptr, loop.id);
    return loop;
  };

  const convertSwitch = (n: RbtNode): Block => {
    const sw = createBlock('switch') as Extract<Block, { kind: 'switch' }>;
    const cases = n.diagrams.map((d) => {
      const lanes = lanesOf(d);
      if (lanes.length > 1)
        warn('A switch case contains parallel beams; they were joined into one beam.');
      return lanes.flatMap(convertLane);
    });
    const sensor = conditionSource.get(n.ptr);
    const selector = termsByOwner.get(n.ptr)?.find((t) => t.role === 'selector');
    const selectorWire = rbt.wires.find(
      (w) => !w.beam && selector && w.ends.some((e) => e.terminal === selector.ptr),
    );
    const valueType = selectorWire?.dataType;
    if (sensor) {
      const condition = conditionFromSensor(sensor);
      if (condition) sw.condition = condition;
    } else if (valueType !== undefined && valueType !== 0x21 && cases.length >= 2) {
      sw.condition = { source: 'value', valueType: valueType === 0x30 ? 'text' : 'number' };
      // Color switches count colors from 1 (black) to 6 (white).
      const selectorSource = selector ? sourcesOf(selector)[0] : undefined;
      const fromColor = selectorSource?.name === 'Detected Color Number';
      sw.cases = cases.map((blocks, i) => ({ value: fromColor ? i + 1 : i, blocks }));
      sw.defaultCase = 0;
      sw.whenTrue = [];
      sw.whenFalse = [];
      return sw;
    } else {
      sw.condition = { source: 'logic' };
    }
    // Case order is [true, false] in the original's boolean case structure
    // (verified on programs whose behaviour is documented, e.g. Explorer).
    sw.whenTrue = cases[0] ?? [];
    sw.whenFalse = cases[1] ?? [];
    if (cases.length > 2) warn('A switch had more than two cases; only the first two were kept.');
    return sw;
  };

  const loopCounters = new Map<number, string>(); // counter terminal -> loop block id

  const topLanes = lanesOf(rbt.top);
  program.body = topLanes[0] ? convertLane(topLanes[0]) : [];
  program.parallel = topLanes.slice(1).map(convertLane);

  // ---------- My Block parameters ----------
  // In a My Block's own file, each parameter becomes a parameter block: inputs at the
  // start of the beam, outputs at the end.
  const paramBlocks = new Map<number, Block>();
  for (const t of rbt.terminals.values()) {
    if (t.ownerKind !== 'param' || !t.name) continue;
    const wire = rbt.wires.find((w) => w.ends.some((e) => e.terminal === t.ptr));
    paramBlocks.set(t.ptr, {
      ...createBlock('myBlockParam'),
      name: t.name,
      valueType: dataTypeOf(wire?.dataType),
      direction: t.output ? 'in' : 'out',
    } as Block);
  }
  const params = [...paramBlocks.values()] as Extract<Block, { kind: 'myBlockParam' }>[];
  program.body = [
    ...params.filter((b) => b.direction === 'in'),
    ...program.body,
    ...params.filter((b) => b.direction === 'out'),
  ];

  // ---------- data wires ----------
  const kindOf = (b: Block) => b.kind;
  const plugName = (b: Block, name: string) =>
    b.kind === 'myBlock' ? myBlockPlug(name) : PLUG_NAMES[kindOf(b)]?.[name];
  const wires: Wire[] = [];
  for (const t of rbt.terminals.values()) {
    if (!t.output || !t.name || t.name.startsWith('Sequence')) continue;
    if (t.ownerKind !== 'block' && t.ownerKind !== 'param') continue;
    const fromNode = rbt.nodes.get(t.owner);
    if (t.ownerKind === 'block' && (!fromNode || hidden.has(fromNode.ptr))) continue;
    let fromBlock: Block | undefined =
      t.ownerKind === 'param' ? paramBlocks.get(t.ptr) : blockFor.get(fromNode!.ptr);
    let fromPlug: string | undefined = fromBlock
      ? t.ownerKind === 'param'
        ? 'value'
        : plugName(fromBlock, t.name)
      : undefined;
    const counterLoop = loopCounters.get(t.ptr);
    if (counterLoop) {
      fromBlock = [...blockFor.values()].find((b) => b.id === counterLoop);
      fromPlug = 'count';
    }
    if (!fromBlock || !fromPlug) continue;
    for (const target of reach(t.ptr)) {
      let toBlock: Block | undefined;
      let toPlug: string | undefined;
      if (target.ownerKind === 'block') {
        toBlock = blockFor.get(target.owner);
        toPlug = toBlock && target.name ? plugName(toBlock, target.name) : undefined;
      } else if (target.ownerKind === 'param') {
        toBlock = paramBlocks.get(target.ptr);
        toPlug = 'value';
      } else if (target.role === 'selector' || target.role === 'condition') {
        toBlock = blockFor.get(target.owner);
        toPlug = 'condition';
      }
      if (!toBlock || !toPlug) {
        if (
          target.ownerKind === 'block' &&
          !rbt.nodes.get(target.owner)?.instance?.template.startsWith('Loop')
        ) {
          warn(`A data wire into "${target.name ?? 'a plug'}" could not be carried over.`);
        }
        continue;
      }
      wires.push({
        id: newId('w'),
        from: { block: fromBlock.id, plug: fromPlug },
        to: { block: toBlock.id, plug: toPlug },
      });
    }
  }
  program.wires = wires;
  program.variables = [...variables].map(([name, type]) => ({ name, type }));
  if (program.variables.length === 0) program.variables = [{ name: 'Number 1', type: 'number' }];
  // A logic or value Switch whose selector came from outside this diagram (a My Block's
  // input parameter, which the editor does not have yet) gets a Constant instead, so it
  // runs its default case.
  const unwired: Block[] = [];
  walkProgram(program, (b) => {
    if (
      b.kind === 'switch' &&
      (b.condition.source === 'logic' || b.condition.source === 'value') &&
      !program.wires.some((w) => w.to.block === b.id && w.to.plug === 'condition')
    ) {
      unwired.push(b);
    }
  });
  for (const sw of unwired) {
    if (sw.kind !== 'switch') continue;
    const found = findBlock(program, sw.id);
    if (!found) continue;
    const valueType =
      sw.condition.source === 'logic'
        ? 'logic'
        : sw.condition.source === 'value' && sw.condition.valueType === 'text'
          ? 'text'
          : 'number';
    const first = sw.cases?.[sw.defaultCase ?? 0]?.value;
    const constant = {
      ...createBlock('constant'),
      valueType,
      number: typeof first === 'number' ? first : 0,
      text: typeof first === 'string' ? first : '',
    } as Block;
    Object.assign(program, insertBlock(program, found.ref, found.index, constant));
    program.wires.push({
      id: newId('w'),
      from: { block: constant.id, plug: 'value' },
      to: { block: sw.id, plug: 'condition' },
    });
    warn(
      'A Switch got its value from a My Block input, which is not supported yet; it now uses a Constant (its default case).',
    );
  }

  // My Blocks live in their own .rbt files; until those are loaded (importRbtx), keep
  // an empty definition so the call sites survive.
  program.myBlocks = [...myBlockNames].map((name) => ({ id: myBlockId(name), name, body: [] }));
  for (const name of myBlockNames) warn(myBlockMissing(name));
  return { program, warnings, myBlocks: [...myBlockNames], origins };
}

function startsWith(d: Defaults, offset: number, pattern: number[]): boolean {
  if (!d.ok(offset, pattern.length)) return false;
  return pattern.every((b, i) => d.r.bytes[offset + i] === b);
}
