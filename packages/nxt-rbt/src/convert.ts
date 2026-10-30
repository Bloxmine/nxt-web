import {
  createBlock,
  defaultCondition,
  emptyProgram,
  newId,
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

/** Result of converting an .rbt program. */
export interface ImportResult {
  program: Program;
  /** Things that could not be carried over exactly. */
  warnings: string[];
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
  display: { Text: 'text', X: 'x', Y: 'line' },
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
  },
  compare: { A: 'a', B: 'b', Boolean: 'result' },
  math: { A: 'a', B: 'b', Value: 'result' },
  logic: { A: 'a', B: 'b', Boolean: 'result' },
  range: { A: 'low', B: 'high', Value: 'value', Boolean: 'result' },
  numberToText: { Number: 'number', Text: 'text' },
  text: { A: 'a', B: 'b', C: 'c', String: 'result' },
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
        if (t.ownerKind === 'block' || t.role === 'selector' || t.role === 'condition')
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
          steering: num(c?.['Steering']),
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
        const textLen = d.u32(0xc0);
        const hasText = textLen > 0 && textLen < 200 && d.ok(0xc4, textLen);
        const textValue = hasText ? d.r.text(0xc4, textLen) : '';
        const fileAt = d.find([0x53], 0xc0); // not used: image name search below
        void fileAt;
        const imageMatch = /([A-Za-z][A-Za-z0-9 _]{1,14} \d\d)/.exec(
          d.r.text(0xc0, Math.min(200, d.r.length - 0xc0)),
        );
        return {
          ...createBlock('display'),
          action: hasText ? 'text' : imageMatch ? 'image' : 'text',
          text: textValue,
          ...(imageMatch && !hasText ? { image: imageMatch[1] } : {}),
          clear: true,
        } as Block;
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
    if (block) blockFor.set(n.ptr, block);
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
      sw.cases = cases.map((blocks, i) => ({ value: i, blocks }));
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

  // ---------- data wires ----------
  const kindOf = (b: Block) => b.kind;
  const wires: Wire[] = [];
  for (const t of rbt.terminals.values()) {
    if (t.ownerKind !== 'block' || !t.output || !t.name || t.name.startsWith('Sequence')) continue;
    const fromNode = rbt.nodes.get(t.owner);
    if (!fromNode || hidden.has(fromNode.ptr)) continue;
    let fromBlock: Block | undefined = blockFor.get(fromNode.ptr);
    let fromPlug: string | undefined = fromBlock
      ? PLUG_NAMES[kindOf(fromBlock)]?.[t.name]
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
        toPlug = toBlock && target.name ? PLUG_NAMES[kindOf(toBlock)]?.[target.name] : undefined;
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
  return { program, warnings };
}

function startsWith(d: Defaults, offset: number, pattern: number[]): boolean {
  if (!d.ok(offset, pattern.length)) return false;
  return pattern.every((b, i) => d.r.bytes[offset + i] === b);
}
