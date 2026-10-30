import { describe, expect, it } from 'vitest';
import {
  EXAMPLES,
  LoweringError,
  MAIN,
  ProjectFormatError,
  createBlock,
  emptyProgram,
  findBlock,
  insertBlock,
  lowerProgram,
  moveBlock,
  parseProject,
  removeBlock,
  serializeProject,
  updateBlock,
  validateProgram,
  type Block,
  type Program,
} from './index.js';

function program(...body: Block[]): Program {
  return { ...emptyProgram('Test'), body };
}

describe('tree operations', () => {
  it('inserts, finds, updates and removes nested blocks', () => {
    const loop = createBlock('loop');
    let p = program(loop);
    const move = createBlock('move');
    p = insertBlock(p, { root: 'main', parent: loop.id, branch: 'body' }, 0, move);
    expect(findBlock(p, move.id)?.ref).toEqual({ root: 'main', parent: loop.id, branch: 'body' });

    p = updateBlock(p, move.id, (b) => (b.kind === 'move' ? { ...b, power: 30 } : b));
    const found = findBlock(p, move.id)?.block;
    expect(found?.kind === 'move' && found.power).toBe(30);

    p = removeBlock(p, move.id);
    expect(findBlock(p, move.id)).toBeNull();
  });

  it('moves a block forward within the same sequence', () => {
    const [a, b, c] = [createBlock('move'), createBlock('sound'), createBlock('wait')];
    const p = moveBlock(program(a, b, c), a.id, MAIN, 3);
    expect(p.body.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
  });

  it('refuses to move a container into itself', () => {
    const outer = createBlock('loop');
    const p = program(outer);
    expect(moveBlock(p, outer.id, { root: 'main', parent: outer.id, branch: 'body' }, 0)).toBe(p);
  });
});

describe('validation', () => {
  it('accepts every example', () => {
    for (const example of EXAMPLES) {
      expect(validateProgram(example.create()).filter((i) => i.severity === 'error')).toEqual([]);
    }
  });

  it('flags a Move block with no ports', () => {
    const move = { ...createBlock('move'), ports: [] } as Block;
    expect(validateProgram(program(move))).toEqual([
      { blockId: move.id, severity: 'error', message: 'Choose at least one motor port.' },
    ]);
  });

  it('flags two different sensors on one port', () => {
    const a = createBlock('wait');
    const touch: Block = {
      ...a,
      kind: 'wait',
      control: { type: 'sensor', condition: { source: 'touch', port: 1, action: 'pressed' } },
    };
    const b = createBlock('switch');
    const light: Block = {
      ...b,
      kind: 'switch',
      whenTrue: [],
      whenFalse: [],
      condition: { source: 'light', port: 1, compare: '>', value: 50, floodlight: true },
    };
    const issues = validateProgram(program(touch, light));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.blockId).toBe(light.id);
  });

  it('warns about blocks after a forever loop', () => {
    const after = createBlock('sound');
    const issues = validateProgram(program(createBlock('loop'), after));
    expect(issues).toEqual([expect.objectContaining({ blockId: after.id, severity: 'warning' })]);
  });

  it('flags unknown variables', () => {
    const v = { ...createBlock('variable'), name: 'Nope' } as Block;
    expect(validateProgram(program(v))[0]?.message).toContain('"Nope"');
  });

  it('flags a My Block that uses itself', () => {
    const call = { ...createBlock('myBlock'), ref: 'm1' } as Block;
    const p: Program = { ...program(), myBlocks: [{ id: 'm1', name: 'Loopy', body: [call] }] };
    expect(validateProgram(p)[0]?.message).toContain('uses itself');
  });
});

describe('lowering to IR', () => {
  it('lowers a synced Move for rotations', () => {
    const ir = lowerProgram(program(createBlock('move')));
    expect(ir.main).toEqual([
      expect.objectContaining({
        kind: 'motor',
        ports: [1, 2],
        power: { kind: 'number', value: 75 },
        degrees: { kind: 'number', value: 360 },
        then: 'brake',
        wait: true,
      }),
    ]);
  });

  it('lowers a timed backward Motor into run, wait, stop', () => {
    const motor = {
      ...createBlock('motor'),
      direction: 'backward',
      duration: { unit: 'seconds', value: 1.5 },
      nextAction: 'coast',
    } as Block;
    expect(lowerProgram(program(motor)).main.map((s) => s.kind)).toEqual([
      'motor',
      'wait',
      'motorStop',
    ]);
  });

  it('configures sensors used by conditions', () => {
    const ir = lowerProgram(EXAMPLES.find((e) => e.key === 'avoid')!.create());
    expect(ir.sensors).toEqual({ 3: 'ultrasonic' });
  });

  it('lowers a sensor loop as "run body, then check"', () => {
    const loop = {
      ...createBlock('loop'),
      control: { type: 'sensor', condition: { source: 'touch', port: 1, action: 'pressed' } },
      body: [createBlock('sound')],
    } as Block;
    const [stmt] = lowerProgram(program(loop)).main;
    expect(stmt?.kind).toBe('forever');
    if (stmt?.kind !== 'forever') return;
    expect(stmt.body.map((s) => s.kind)).toEqual(['tone', 'if']);
  });

  it('lowers a switch to an if/else', () => {
    const ir = lowerProgram(EXAMPLES.find((e) => e.key === 'line')!.create());
    const loop = ir.main[0];
    expect(loop?.kind === 'forever' && loop.body[0]?.kind).toBe('if');
  });

  it('turns My Blocks into subroutines', () => {
    const call = { ...createBlock('myBlock'), ref: 'm1' } as Block;
    const p: Program = {
      ...program(call),
      myBlocks: [{ id: 'm1', name: 'Beep', body: [createBlock('sound')] }],
    };
    const ir = lowerProgram(p);
    expect(ir.subroutines).toEqual([
      { name: 'my_m1', body: [expect.objectContaining({ kind: 'tone' })] },
    ]);
    expect(ir.main).toEqual([expect.objectContaining({ kind: 'call', name: 'my_m1' })]);
  });

  it('keeps block ids as sources for error mapping', () => {
    const sound = createBlock('sound');
    expect(lowerProgram(program(sound)).main[0]?.source).toBe(sound.id);
  });

  it('refuses invalid programs', () => {
    const move = { ...createBlock('move'), ports: [] } as Block;
    expect(() => lowerProgram(program(move))).toThrow(LoweringError);
  });
});

describe('project files', () => {
  it('round-trips every example with no loss', () => {
    for (const example of EXAMPLES) {
      const p = example.create();
      expect(parseProject(serializeProject(p))).toEqual(p);
    }
  });

  it('rejects files that are not projects', () => {
    expect(() => parseProject('nope')).toThrow(ProjectFormatError);
    expect(() => parseProject('{"format":"other"}')).toThrow('not an NXT Web Studio project');
    expect(() =>
      parseProject(JSON.stringify({ format: 'nxt-web-studio-project', version: 99, program: {} })),
    ).toThrow('newer version');
  });
});

describe('copy, paste and history labels', async () => {
  const {
    copyBlocks,
    pasteBlocks,
    removeBlocks,
    describeChange,
    EXAMPLES,
    labelOf,
    MAIN,
    walkProgram,
  } = await import('./index.js');
  const program = EXAMPLES.find((e) => e.key === 'distance')!.create();
  const loop = program.body[0] as Extract<Block, { kind: 'loop' }>;

  it('pastes copies with new ids and keeps the wires between them', () => {
    const clip = copyBlocks(program, [loop.id]);
    expect(clip.wires).toHaveLength(3);
    const { program: next, ids } = pasteBlocks(program, clip, MAIN, 1);
    expect(next.body).toHaveLength(2);
    expect(ids[0]).not.toBe(loop.id);
    expect(next.wires).toHaveLength(6);
    const all = new Set<string>();
    walkProgram(next, (b) => {
      expect(all.has(b.id)).toBe(false);
      all.add(b.id);
    });
    for (const w of next.wires) expect(all.has(w.from.block) && all.has(w.to.block)).toBe(true);
  });

  it('copies only the wires inside the selection', () => {
    const [sensor, toText] = loop.body;
    expect(copyBlocks(program, [sensor!.id]).wires).toHaveLength(0);
    expect(copyBlocks(program, [sensor!.id, toText!.id]).wires).toHaveLength(1);
  });

  it('removes several blocks and their wires', () => {
    const [sensor, toText] = loop.body;
    const next = removeBlocks(program, [sensor!.id, toText!.id]);
    expect((next.body[0] as typeof loop).body).toHaveLength(3);
    expect(next.wires).toHaveLength(1);
  });

  it('describes changes', () => {
    const [sensor] = loop.body;
    const removed = removeBlocks(program, [sensor!.id]);
    expect(describeChange(program, removed, labelOf)).toMatch(/^Deleted /);
    expect(describeChange(removed, program, labelOf)).toMatch(/^Added /);
    expect(describeChange(program, { ...program, name: 'X' }, labelOf)).toBe(
      'Renamed program to “X”',
    );
  });
});

describe('My Block parameters', async () => {
  const { createBlock, lowerProgram, syncMyBlockParams, validateProgram, emptyProgram } =
    await import('./index.js');
  it('pass values in and out of a My Block', () => {
    const pin = {
      ...createBlock('myBlockParam'),
      name: 'X',
      direction: 'in',
      valueType: 'number',
    } as Block;
    const math = { ...createBlock('math'), op: '*', b: 2 } as Block;
    const pout = {
      ...createBlock('myBlockParam'),
      name: 'Y',
      direction: 'out',
      valueType: 'number',
    } as Block;
    const constant = { ...createBlock('constant'), number: 21 } as Block;
    const call = { ...createBlock('myBlock'), ref: 'm1' } as Block;
    const show = { ...createBlock('numberToText') } as Block;
    let program = {
      ...emptyProgram('P'),
      myBlocks: [{ id: 'm1', name: 'Double', body: [pin, math, pout] }],
      body: [constant, call, show],
      wires: [
        { id: 'w1', from: { block: pin.id, plug: 'value' }, to: { block: math.id, plug: 'a' } },
        {
          id: 'w2',
          from: { block: math.id, plug: 'result' },
          to: { block: pout.id, plug: 'value' },
        },
        {
          id: 'w3',
          from: { block: constant.id, plug: 'value' },
          to: { block: call.id, plug: 'p:X' },
        },
        { id: 'w4', from: { block: call.id, plug: 'p:Y' }, to: { block: show.id, plug: 'number' } },
      ],
    };
    program = syncMyBlockParams(program);
    expect((program.body[1] as Extract<Block, { kind: 'myBlock' }>).params).toEqual([
      { name: 'X', type: 'number', direction: 'in' },
      { name: 'Y', type: 'number', direction: 'out' },
    ]);
    expect(program.wires).toHaveLength(4);
    expect(validateProgram(program).filter((i) => i.severity === 'error')).toEqual([]);
    const ir = lowerProgram(program);
    const kinds = ir.main.map((s) => (s.kind === 'set' ? `set ${s.name}` : s.kind));
    expect(kinds).toEqual([
      expect.stringMatching(/^set __w_/),
      'set __p_m1_X',
      'call',
      expect.stringMatching(/^set __w_/),
    ]);
    const sub = ir.subroutines[0]!.body.map((s) => (s.kind === 'set' ? s.name : s.kind));
    expect(sub).toContain('__p_m1_Y');
  });
});

describe('program checker', async () => {
  const { checkProgram, createBlock, emptyProgram, EXAMPLES } = await import('./index.js');
  it('finds motors left running and text that does not fit', () => {
    const p = {
      ...emptyProgram(),
      body: [
        { ...createBlock('display'), text: 'A very long message here', x: 10 } as Block,
        { ...createBlock('move'), duration: { unit: 'unlimited' } } as Block,
      ],
    };
    const tips = checkProgram(p).map((t) => t.message);
    expect(tips.some((t) => t.includes('does not fit'))).toBe(true);
    expect(tips.some((t) => t.includes('ends right after'))).toBe(true);
  });
  it('has nothing to say about the examples', () => {
    for (const e of EXAMPLES) expect(checkProgram(e.create()), e.key).toEqual([]);
  });
});
