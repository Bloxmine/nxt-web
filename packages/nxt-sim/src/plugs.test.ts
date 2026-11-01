import {
  connect,
  createBlock,
  createSensorBlock,
  emptyProgram,
  lowerProgram,
  type Block,
  type Program,
  type VariableType,
} from '@nxt/blocks';
import { describe, expect, it } from 'vitest';
import { scenarioById } from './scenarios.js';
import { Simulation } from './simulation.js';

const out = (block: Block, plug: string) => ({ block: block.id, plug, side: 'out' as const });
const inp = (block: Block, plug: string) => ({ block: block.id, plug, side: 'in' as const });
const setVar = (name: string, valueType: VariableType = 'number'): Block =>
  ({ ...createBlock('variable'), name, action: 'set', valueType }) as Block;

function run(program: Program, before?: (sim: Simulation) => void): Simulation {
  const sim = new Simulation(lowerProgram(program), scenarioById('empty'), { seed: 1 });
  before?.(sim);
  sim.start();
  sim.advance(200);
  return sim;
}

describe('NXT-G data plugs', () => {
  it('a rotation sensor gives how far (Degrees) and which way (Direction)', () => {
    const sensor = createSensorBlock('rotation');
    const deg = setVar('Deg');
    const fwd = setVar('Fwd', 'logic');
    let p: Program = {
      ...emptyProgram('T'),
      variables: [
        { name: 'Deg', type: 'number' },
        { name: 'Fwd', type: 'logic' },
      ],
      body: [sensor, deg, fwd],
    };
    p = connect(p, out(sensor, 'value'), inp(deg, 'value'));
    p = connect(p, out(sensor, 'direction'), inp(fwd, 'value'));
    const back = run(p, (sim) => (sim.motors[0]!.rotation = -200));
    expect(back.variables().get('Deg')).toBe(200);
    expect(back.variables().get('Fwd')).toBe(false);
    const ahead = run(p, (sim) => (sim.motors[0]!.rotation = 90));
    expect(ahead.variables().get('Deg')).toBe(90);
    expect(ahead.variables().get('Fwd')).toBe(true);
  });

  it('File Access says Error when the file is missing', () => {
    const read = {
      ...createBlock('file'),
      action: 'read',
      file: 'Nothing',
      type: 'number',
    } as Block;
    const err = setVar('Err', 'logic');
    let p: Program = {
      ...emptyProgram('T'),
      variables: [{ name: 'Err', type: 'logic' }],
      body: [read, err],
    };
    p = connect(p, out(read, 'error'), inp(err, 'value'));
    expect(run(p).variables().get('Err')).toBe(true);
    const found = run(p, (sim) => sim.files.set('Nothing.txt', { data: '5\r\n', readPos: 0 }));
    expect(found.variables().get('Err')).toBe(false);
  });

  it('a wired Sound duration is in milliseconds', () => {
    const constant = { ...createBlock('constant'), valueType: 'number', number: 1500 } as Block;
    const sound = { ...createBlock('sound'), seconds: 0.1, wait: true } as Block;
    let p: Program = { ...emptyProgram('T'), body: [constant, sound] };
    p = connect(p, out(constant, 'value'), inp(sound, 'duration'));
    const sim = new Simulation(lowerProgram(p), scenarioById('empty'), { seed: 1 });
    sim.start();
    sim.advance(1000);
    expect(sim.status).toBe('running'); // still playing the 1.5 s tone
    sim.advance(800);
    expect(sim.status).toBe('finished');
  });
});
