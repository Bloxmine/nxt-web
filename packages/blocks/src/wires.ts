import { newId } from './ids.js';
import type { Block, PlugRef, Program, Wire } from './model.js';
import { findPlug, type Plug } from './plugs.js';
import { childSequences, findBlock, roots } from './tree.js';

/** Why a wire cannot be made, or null if it can. */
export function wireProblem(program: Program, from: PlugRef, to: PlugRef): string | null {
  const source = findBlock(program, from.block);
  const target = findBlock(program, to.block);
  if (!source || !target) return 'That block no longer exists.';
  if (from.block === to.block) return 'A block cannot be wired to itself.';
  const out = findPlug(source.block, from.plug);
  const inp = findPlug(target.block, to.plug);
  if (!out?.output) return 'Wires must start at an output plug (right side).';
  if (!inp?.input) return 'Wires must end at an input plug (left side).';
  if (out.type !== inp.type)
    return `A ${typeName(out)} plug can't connect to a ${typeName(inp)} plug.`;
  return orderProblem(program, from, to);
}

function typeName(plug: Plug): string {
  return plug.type === 'logic' ? 'yes/no' : plug.type;
}

interface Position {
  root: string;
  index: number;
  ancestors: Block[];
}

/** Pre-order position of every block in each root sequence. */
export function positions(program: Program): Map<string, Position> {
  const map = new Map<string, Position>();
  for (const r of roots(program)) {
    let index = 0;
    const visit = (blocks: readonly Block[], ancestors: Block[]) => {
      for (const block of blocks) {
        map.set(block.id, { root: r.root, index: index++, ancestors });
        for (const child of childSequences(block)) visit(child.blocks, [...ancestors, block]);
      }
    };
    visit(r.blocks, []);
  }
  return map;
}

/**
 * Data flows along the beam: the source must run before the target, on the
 * same beam. A loop's "Until" plug may be fed from inside the loop, because it
 * is checked at the end of each pass.
 */
function orderProblem(program: Program, from: PlugRef, to: PlugRef): string | null {
  const pos = positions(program);
  const src = pos.get(from.block);
  const dst = pos.get(to.block);
  if (!src || !dst) return 'That block no longer exists.';
  if (src.root !== dst.root) return 'Wires cannot cross between separate beams.';
  const feedsOwnLoop = to.plug === 'condition' && src.ancestors.some((a) => a.id === to.block);
  if (!feedsOwnLoop && src.index >= dst.index) {
    return 'Data flows left to right: the wire must come from a block that runs earlier.';
  }
  return null;
}

/** A warning for wires that may carry no value (out of one switch branch). */
export function wireWarning(program: Program, wire: Wire): string | null {
  const pos = positions(program);
  const src = pos.get(wire.from.block);
  const dst = pos.get(wire.to.block);
  if (!src || !dst) return null;
  const leftSwitch = src.ancestors.find((a) => a.kind === 'switch' && !dst.ancestors.includes(a));
  return leftSwitch
    ? 'This wire comes out of one switch branch, so its value may not be set.'
    : null;
}

/**
 * Connects two plugs. Either end may be given first; the wire always runs from
 * the output to the input. An input can only have one wire, so an existing
 * wire into the same input is replaced. Throws if the wire is not allowed.
 */
export function connect(
  program: Program,
  a: PlugRef & { side: 'in' | 'out' },
  b: PlugRef & { side: 'in' | 'out' },
): Program {
  if (a.side === b.side) throw new Error('Connect an output (right side) to an input (left side).');
  const from = a.side === 'out' ? a : b;
  const to = a.side === 'out' ? b : a;
  const problem = wireProblem(program, from, to);
  if (problem) throw new Error(problem);
  const wire: Wire = {
    id: newId('w'),
    from: { block: from.block, plug: from.plug },
    to: { block: to.block, plug: to.plug },
  };
  const others = program.wires.filter((w) => !(w.to.block === to.block && w.to.plug === to.plug));
  return { ...program, wires: [...others, wire] };
}

/** Removes a wire by id. */
export function disconnect(program: Program, wireId: string): Program {
  const wires = program.wires.filter((w) => w.id !== wireId);
  return wires.length === program.wires.length ? program : { ...program, wires };
}

/** The wire feeding an input plug, if any. */
export function wireInto(program: Program, block: string, plug: string): Wire | undefined {
  return program.wires.find((w) => w.to.block === block && w.to.plug === plug);
}
