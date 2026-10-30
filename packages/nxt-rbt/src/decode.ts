import { Heap, HeapClass } from './heap.js';
import { parseConnectorPanes, parseInstanceNodes } from './linker.js';
import type { LvValue, TypeDesc } from './lvtype.js';
import { parseRsrc, resourcesOfType, type RsrcFile } from './rsrc.js';
import { parseViTags } from './vitags.js';

/**
 * A decoded .rbt program as a graph, close to the original's own structure.
 * `convert.ts` turns this into the editor's Program model.
 */
export interface RbtProgram {
  name: string;
  top: RbtDiagram;
  instances: Map<number, RbtInstance>;
  wires: RbtWire[];
  /** Every node by heap pointer. */
  nodes: Map<number, RbtNode>;
  /** Every terminal by heap pointer. */
  terminals: Map<number, RbtTerminal>;
}

/** One placed block's instance VI: its template and settings. */
export interface RbtInstance {
  number: number;
  /** Template file name without ".vi", e.g. "Move", "Bumper", "LoopCntCount". */
  template: string;
  /** The label shown under the block (can be empty). */
  title: string;
  /** VI tags, including any "…BlockConfig" settings cluster. */
  tags: Map<string, LvValue | Uint8Array>;
  /** Front-panel default data (settings for blocks without a config tag). */
  dfds: Uint8Array;
  /** Plugs in connector-pane slot order. */
  plugs: TypeDesc[];
}

export interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface RbtNode {
  ptr: number;
  kind: 'block' | 'loop' | 'switch';
  rect: Rect;
  diagram: number;
  instance?: RbtInstance;
  /** Loop body (1) or switch cases in case order. */
  diagrams: RbtDiagram[];
}

export interface RbtDiagram {
  ptr: number;
  /** Owning loop/switch, or null for the top-level diagram. */
  owner: number | null;
  nodes: RbtNode[];
}

export interface RbtTerminal {
  ptr: number;
  /** Node or structure the terminal belongs to. */
  owner: number;
  ownerKind: 'block' | 'loop' | 'switch';
  /** Block terminals: connector-pane slot and plug name. */
  slot?: number;
  name?: string;
  /** Block terminals: true for outputs. */
  output?: boolean;
  /** Structure terminals: what kind. */
  role?: 'tunnel' | 'condition' | 'iteration' | 'selector';
}

/** One end of a wire. `inside` marks the inner side of a structure terminal. */
export interface RbtWireEnd {
  terminal: number;
  inside: boolean;
}

export interface RbtWire {
  ptr: number;
  /** Sequence beam segment (true) or data wire. */
  beam: boolean;
  /** LabVIEW type code of the value (0x21 boolean, 0x09 number, 0x30 text…). */
  dataType: number;
  diagram: number;
  ends: RbtWireEnd[];
}

/** The file is not an NXT-G program we can read. */
export class RbtFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RbtFormatError';
  }
}

function one(file: RsrcFile, type: string): Uint8Array {
  const r = resourcesOfType(file, type)[0];
  if (!r) throw new RbtFormatError(`The file has no ${type} section; is it an NXT-G program?`);
  return r.data;
}

function readInstance(number: number, bytes: Uint8Array, plugs: TypeDesc[]): RbtInstance {
  const vi = parseRsrc(bytes);
  const vits = resourcesOfType(vi, 'VITS')[0]?.data ?? new Uint8Array();
  const tags = parseViTags(vits);
  const path = tags.get('_OriginalInstancePath');
  const template =
    typeof path === 'string' ? (path.split('/').pop() ?? '').replace(/\.vi$/i, '') : '';
  const titl = resourcesOfType(vi, 'TITL')[0]?.data;
  const title =
    titl && titl.length > 0 ? String.fromCharCode(...titl.subarray(1, 1 + titl[0]!)) : '';
  const dfds = resourcesOfType(vi, 'DFDS')[0]?.data ?? new Uint8Array();
  return { number, template, title, tags, dfds, plugs };
}

/** Decodes an .rbt file into a program graph. */
export function decodeRbt(bytes: Uint8Array, name = 'Program'): RbtProgram {
  const file = parseRsrc(bytes);
  const heap = new Heap(one(file, 'BDHP'));
  const nodeInstance = parseInstanceNodes(one(file, 'LIbd'));
  const panes = parseConnectorPanes(resourcesOfType(file, 'LIvi')[0]?.data ?? new Uint8Array());

  const instances = new Map<number, RbtInstance>();
  const vins = resourcesOfType(file, 'VINS');
  for (const res of vins) {
    if (res.id <= 0 || res.data.length < 6) continue;
    try {
      instances.set(res.id, readInstance(res.id, res.data, panes.get(res.id) ?? []));
    } catch {
      // Damaged instance: its node becomes an unknown block.
    }
  }

  const nodes = new Map<number, RbtNode>();
  const terminals = new Map<number, RbtTerminal>();

  const buildDiagram = (ptr: number, owner: number | null): RbtDiagram => {
    const diagram: RbtDiagram = { ptr, owner, nodes: [] };
    for (const child of heap.children(ptr)) {
      if (child.cls === HeapClass.Node) {
        const n = nodeInstance.get(child.ptr);
        const node: RbtNode = {
          ptr: child.ptr,
          kind: 'block',
          rect: heap.rect(child.ptr, 16),
          diagram: ptr,
          diagrams: [],
        };
        const inst = n === undefined ? undefined : instances.get(n);
        if (inst) node.instance = inst;
        for (const t of heap.children(child.ptr, HeapClass.NodeTerminal)) {
          const slot = heap.field(t.ptr, 36);
          const flags = heap.field(t.ptr, 0);
          const term: RbtTerminal = {
            ptr: t.ptr,
            owner: child.ptr,
            ownerKind: 'block',
            slot,
            output: (flags & 1) === 1,
          };
          const plugName = inst?.plugs[slot]?.label;
          if (plugName) term.name = plugName;
          terminals.set(t.ptr, term);
        }
        nodes.set(child.ptr, node);
        diagram.nodes.push(node);
      } else if (child.cls === HeapClass.Loop || child.cls === HeapClass.Switch) {
        const kind = child.cls === HeapClass.Loop ? 'loop' : 'switch';
        const node: RbtNode = {
          ptr: child.ptr,
          kind,
          rect: heap.rect(child.ptr, 16),
          diagram: ptr,
          diagrams: [],
        };
        nodes.set(child.ptr, node);
        diagram.nodes.push(node);
        // Structure terminals.
        for (const t of heap.children(child.ptr)) {
          const role =
            t.cls === HeapClass.LoopCondition
              ? 'condition'
              : t.cls === HeapClass.LoopIteration
                ? 'iteration'
                : t.cls === HeapClass.SwitchSelector
                  ? 'selector'
                  : t.cls === HeapClass.LoopTunnel || t.cls === HeapClass.SwitchTunnel
                    ? 'tunnel'
                    : null;
          if (role) terminals.set(t.ptr, { ptr: t.ptr, owner: child.ptr, ownerKind: kind, role });
        }
        // Sub-diagrams in case order. Switches keep an ordered case list.
        let order: number[] = [];
        if (kind === 'switch') {
          const list = heap.field(child.ptr, 52);
          const obj = heap.get(list);
          if (obj) {
            const count = heap.field(list, 0);
            for (let i = 0; i < count; i++) order.push(heap.field(list, 4 + 4 * i));
          }
        }
        const subs = heap.children(child.ptr, HeapClass.Diagram).map((d) => d.ptr);
        if (order.length !== subs.length || !order.every((p) => subs.includes(p))) order = subs;
        node.diagrams = order.map((p) => buildDiagram(p, child.ptr));
      }
    }
    return diagram;
  };

  const tops = heap.ofClass(HeapClass.Diagram).filter((d) => !heap.get(heap.owner(d.ptr)));
  const topPtr = tops[0]?.ptr;
  if (topPtr === undefined) throw new RbtFormatError('The program diagram could not be found.');
  const top = buildDiagram(topPtr, null);

  // Wires: class 23 objects; their ends are connection objects pointing at them.
  const endsByWire = new Map<number, RbtWireEnd[]>();
  for (const conn of heap.ofClass(HeapClass.Connection)) {
    const wire = heap.field(conn.ptr, 8);
    const terminal = heap.field(conn.ptr, 12);
    if (heap.cls(wire) !== HeapClass.Wire || !terminals.has(terminal)) continue;
    const ownerCls = heap.cls(heap.owner(conn.ptr));
    const inside = ownerCls === HeapClass.DiagramTerminals;
    const list = endsByWire.get(wire);
    const end = { terminal, inside };
    if (list) list.push(end);
    else endsByWire.set(wire, [end]);
  }
  const wires: RbtWire[] = [];
  for (const w of heap.ofClass(HeapClass.Wire)) {
    const ends = endsByWire.get(w.ptr);
    if (!ends || ends.length < 2) continue;
    const style = heap.r.u8(w.ptr + 20);
    const dataType = heap.r.u8(w.ptr + 21);
    wires.push({ ptr: w.ptr, beam: style === 0x18, dataType, diagram: heap.owner(w.ptr), ends });
  }

  return { name, top, instances, wires, nodes, terminals };
}
