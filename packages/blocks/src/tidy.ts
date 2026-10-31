import { conditionOf } from './validate.js';
import type { Program } from './model.js';
import { pruneWires, updateBlock, walkProgram } from './tree.js';

/** What {@link tidyProgram} changed, in words, for a message. */
export interface TidyResult {
  program: Program;
  changes: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Clears up clutter without changing what the program does: empty parallel beams, wires
 * whose block or plug is gone, variables nothing uses (the default "Number 1" stays), and
 * data hubs that are folded out but have no wires.
 */
export function tidyProgram(program: Program): TidyResult {
  const changes: string[] = [];
  let p = program;

  const lanes = p.parallel.filter((lane) => lane.length > 0);
  if (lanes.length !== p.parallel.length) {
    const n = p.parallel.length - lanes.length;
    changes.push(`removed ${plural(n, 'empty parallel beam', 'empty parallel beams')}`);
    p = { ...p, parallel: lanes };
  }

  const pruned = pruneWires(p);
  if (pruned.wires.length !== p.wires.length) {
    const n = p.wires.length - pruned.wires.length;
    changes.push(`removed ${plural(n, 'broken wire', 'broken wires')}`);
    p = pruned;
  }

  const used = new Set<string>(['Number 1']);
  const wired = new Set(p.wires.flatMap((w) => [w.from.block, w.to.block]));
  const openHubs: string[] = [];
  walkProgram(p, (b) => {
    if (b.kind === 'variable') used.add(b.name);
    if (b.kind === 'display' && b.action === 'variable') used.add(b.variable);
    const c = conditionOf(b);
    if (c?.source === 'variable') used.add(c.name);
    if (b.hub === true && !wired.has(b.id)) openHubs.push(b.id);
  });
  const variables = p.variables.filter((v) => used.has(v.name));
  if (variables.length !== p.variables.length) {
    const gone = p.variables.filter((v) => !used.has(v.name)).map((v) => `"${v.name}"`);
    changes.push(
      `removed unused ${gone.length === 1 ? 'variable' : 'variables'} ${gone.join(', ')}`,
    );
    p = { ...p, variables };
  }

  for (const id of openHubs) p = updateBlock(p, id, (b) => ({ ...b, hub: false }));
  if (openHubs.length > 0) {
    changes.push(`folded in ${plural(openHubs.length, 'data hub', 'data hubs')} without wires`);
  }

  return { program: p, changes };
}
