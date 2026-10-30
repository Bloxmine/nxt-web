import { describe, expect, it } from 'vitest';
import {
  EXAMPLES,
  MAIN,
  addLane,
  connect,
  createBlock,
  createSensorBlock,
  disconnect,
  emptyProgram,
  findBlock,
  insertBlock,
  laneRoot,
  lowerProgram,
  moveBlock,
  parseProject,
  removeBlock,
  removeLane,
  updateBlock,
  validateProgram,
  wireVariable,
  type Block,
  type Program,
} from './index.js';

function program(...body: Block[]): Program {
  return { ...emptyProgram('T'), body };
}

const out = (block: Block, plug: string) => ({ block: block.id, plug, side: 'out' as const });
const inp = (block: Block, plug: string) => ({ block: block.id, plug, side: 'in' as const });

describe('wires', () => {
  it('connects an output to a later input of the same type', () => {
    const random = createBlock('random');
    const move = createBlock('move');
    const p = connect(program(random, move), out(random, 'value'), inp(move, 'power'));
    expect(p.wires).toEqual([
      expect.objectContaining({
        from: { block: random.id, plug: 'value' },
        to: { block: move.id, plug: 'power' },
      }),
    ]);
  });

  it('accepts the ends in either order', () => {
    const random = createBlock('random');
    const move = createBlock('move');
    const p = connect(program(random, move), inp(move, 'power'), out(random, 'value'));
    expect(p.wires[0]?.from.block).toBe(random.id);
  });

  it('refuses mismatched types, backwards wires and in-to-in', () => {
    const touch = createSensorBlock('touch');
    const move = createBlock('move');
    const p = program(touch, move);
    expect(() => connect(p, out(touch, 'yes'), inp(move, 'power'))).toThrow(
      "yes/no plug can't connect",
    );
    expect(() =>
      connect(program(move, touch), out(move, 'direction'), inp(touch, 'yes')),
    ).toThrow();
    const r = createBlock('random');
    expect(() => connect(program(move, r), out(move, 'power'), inp(r, 'min'))).not.toThrow();
    expect(() => connect(program(r, move), out(move, 'power'), inp(r, 'min'))).toThrow(
      'left to right',
    );
    expect(() => connect(p, inp(move, 'power'), inp(move, 'steering'))).toThrow();
  });

  it('replaces an existing wire into the same input', () => {
    const a = createBlock('random');
    const b = createBlock('random');
    const move = createBlock('move');
    let p = connect(program(a, b, move), out(a, 'value'), inp(move, 'power'));
    p = connect(p, out(b, 'value'), inp(move, 'power'));
    expect(p.wires).toHaveLength(1);
    expect(p.wires[0]?.from.block).toBe(b.id);
  });

  it('lets a loop condition be fed from inside the loop', () => {
    const touch = createSensorBlock('touch');
    const loop = {
      ...createBlock('loop'),
      control: { type: 'sensor', condition: { source: 'logic' } },
      body: [touch],
    } as Block;
    const p = connect(program(loop), out(touch, 'yes'), inp(loop, 'condition'));
    expect(validateProgram(p).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('flags a logic loop without a wire', () => {
    const loop = {
      ...createBlock('loop'),
      control: { type: 'sensor', condition: { source: 'logic' } },
    } as Block;
    expect(validateProgram(program(loop))[0]?.message).toContain('Wire a yes/no value');
  });

  it('removes wires when a block is deleted, but keeps them when it moves', () => {
    const r = createBlock('random');
    const s = createBlock('sound');
    const m = createBlock('move');
    let p = connect(program(r, s, m), out(r, 'value'), inp(m, 'power'));
    p = moveBlock(p, s.id, MAIN, 0);
    expect(p.wires).toHaveLength(1);
    expect(removeBlock(p, r.id).wires).toEqual([]);
  });

  it('drops wires to plugs that disappear after a settings change', () => {
    const logic = createBlock('logic');
    const compare = createBlock('compare');
    let p = connect(program(compare, logic), out(compare, 'result'), inp(logic, 'b'));
    p = updateBlock(p, logic.id, (b) => ({ ...b, op: 'not' }) as Block);
    expect(p.wires).toEqual([]);
  });

  it('disconnects by id', () => {
    const r = createBlock('random');
    const m = createBlock('move');
    const p = connect(program(r, m), out(r, 'value'), inp(m, 'power'));
    expect(disconnect(p, p.wires[0]!.id).wires).toEqual([]);
  });
});

describe('lowering data wires', () => {
  it('stores outputs in hidden variables and reads them in inputs', () => {
    const r = createBlock('random');
    const m = createBlock('move');
    const p = connect(program(r, m), out(r, 'value'), inp(m, 'power'));
    const ir = lowerProgram(p);
    const name = wireVariable(r.id, 'value');
    expect(ir.variables).toContainEqual({ name, type: 'number' });
    expect(ir.main[0]).toMatchObject({ kind: 'set', name, value: { kind: 'random' } });
    expect(ir.main[1]).toMatchObject({ kind: 'motor', power: { kind: 'var', name } });
  });

  it('lowers the distance example into sensor, text and display steps', () => {
    const ir = lowerProgram(EXAMPLES.find((e) => e.key === 'distance')!.create());
    const loop = ir.main[0];
    expect(loop?.kind).toBe('forever');
    if (loop?.kind !== 'forever') return;
    expect(loop.body.map((s) => s.kind)).toEqual([
      'set',
      'set',
      'set',
      'clearScreen',
      'drawText',
      'wait',
    ]);
    expect(ir.variables.filter((v) => v.type === 'text')).toHaveLength(2);
  });

  it('only stores outputs that are wired', () => {
    const ir = lowerProgram(program(createBlock('math')));
    expect(ir.main).toEqual([]);
  });

  it('counts loop passes when the counter is wired', () => {
    const display = { ...createBlock('display'), action: 'variable' } as Block;
    const loop = {
      ...createBlock('loop'),
      control: { type: 'count', count: 3 },
      showCounter: true,
      body: [display],
    } as Block;
    const p = connect(program(loop), out(loop, 'count'), inp(display, 'number'));
    const ir = lowerProgram(p);
    expect(ir.main.map((s) => s.kind)).toEqual(['set', 'while']);
  });
});

describe('parallel beams', () => {
  it('adds, fills, lowers and removes a lane', () => {
    let p = addLane(program(createBlock('move')));
    const sound = createBlock('sound');
    p = insertBlock(p, { root: laneRoot(1), parent: null, branch: 'body' }, 0, sound);
    expect(findBlock(p, sound.id)?.ref.root).toBe('main#1');
    const ir = lowerProgram(p);
    expect(ir.parallel).toEqual([[expect.objectContaining({ kind: 'tone' })]]);
    expect(removeLane(p, 1).parallel).toEqual([]);
  });

  it('refuses wires between lanes', () => {
    let p = addLane(program());
    const r = createBlock('random');
    const m = createBlock('move');
    p = insertBlock(p, MAIN, 0, r);
    p = insertBlock(p, { root: laneRoot(1), parent: null, branch: 'body' }, 0, m);
    expect(() => connect(p, out(r, 'value'), inp(m, 'power'))).toThrow('separate beams');
  });

  it('lowers the drive-and-sing example to two tasks', () => {
    const ir = lowerProgram(EXAMPLES.find((e) => e.key === 'parallel')!.create());
    expect(ir.main).toHaveLength(1);
    expect(ir.parallel).toHaveLength(1);
  });
});

describe('older project files', () => {
  it('fills in missing lanes and wires', () => {
    const old = JSON.stringify({
      format: 'nxt-web-studio-project',
      version: 1,
      savedAt: '',
      program: { name: 'Old', variables: [], myBlocks: [], body: [] },
    });
    expect(parseProject(old)).toMatchObject({ parallel: [], wires: [] });
  });
});
