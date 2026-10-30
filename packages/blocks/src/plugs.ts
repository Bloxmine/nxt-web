import type { Block, DataType } from './model.js';

/** One row on a block's data hub. */
export interface Plug {
  name: string;
  label: string;
  type: DataType;
  /** Has an input socket (left side). */
  input: boolean;
  /** Has an output socket (right side). Inputs pass their value through. */
  output: boolean;
}

const plug = (
  name: string,
  label: string,
  type: DataType,
  input: boolean,
  output = true,
): Plug => ({
  name,
  label,
  type,
  input,
  output,
});

/** The data plugs a block offers, in hub order. */
export function plugsOf(block: Block): Plug[] {
  switch (block.kind) {
    case 'move':
      return [
        plug('direction', 'Direction', 'logic', true),
        plug('steering', 'Steering', 'number', true),
        plug('power', 'Power', 'number', true),
        plug('duration', 'Duration', 'number', true),
      ];
    case 'motor':
      return [
        plug('direction', 'Direction', 'logic', true),
        plug('power', 'Power', 'number', true),
        plug('duration', 'Duration', 'number', true),
      ];
    case 'sound':
      return [plug('frequency', 'Tone', 'number', true), plug('volume', 'Volume', 'number', true)];
    case 'display':
      return [
        plug('text', 'Text', 'text', true),
        plug('number', 'Number', 'number', true),
        plug('x', 'X', 'number', true),
        plug('line', 'Line', 'number', true),
      ];
    case 'loop': {
      const plugs: Plug[] = [];
      if (block.control.type === 'sensor' && block.control.condition.source === 'logic') {
        plugs.push(plug('condition', 'Until', 'logic', true, false));
      }
      if (block.showCounter) plugs.push(plug('count', 'Count', 'number', false));
      return plugs;
    }
    case 'switch':
      if (block.condition.source === 'logic')
        return [plug('condition', 'Value', 'logic', true, false)];
      if (block.condition.source === 'value') {
        const type = block.condition.valueType === 'text' ? 'text' : 'number';
        return [plug('condition', 'Value', type, true, false)];
      }
      return [];
    case 'variable':
      return [plug('value', 'Value', block.valueType ?? 'number', block.action !== 'read')];
    case 'sensor': {
      const c = block.condition;
      if (c.source === 'touch' || c.source === 'button')
        return [plug('yes', 'Yes / No', 'logic', false)];
      if (c.source === 'color' && c.mode === 'range') {
        return [plug('yes', 'Yes / No', 'logic', false), plug('value', 'Color', 'number', false)];
      }
      return [
        plug('trigger', 'Trigger', 'number', true),
        plug('yes', 'Yes / No', 'logic', false),
        plug('value', 'Value', 'number', false),
      ];
    }
    case 'math':
      return [
        plug('a', 'A', 'number', true),
        plug('b', 'B', 'number', true),
        plug('result', 'Result', 'number', false),
      ];
    case 'compare':
      return [
        plug('a', 'A', 'number', true),
        plug('b', 'B', 'number', true),
        plug('result', 'Result', 'logic', false),
      ];
    case 'logic':
      return block.op === 'not'
        ? [plug('a', 'A', 'logic', true), plug('result', 'Result', 'logic', false)]
        : [
            plug('a', 'A', 'logic', true),
            plug('b', 'B', 'logic', true),
            plug('result', 'Result', 'logic', false),
          ];
    case 'range':
      return [
        plug('low', 'Low', 'number', true),
        plug('high', 'High', 'number', true),
        plug('value', 'Test value', 'number', true),
        plug('result', 'Yes / No', 'logic', false),
      ];
    case 'random':
      return [
        plug('min', 'Min', 'number', true),
        plug('max', 'Max', 'number', true),
        plug('value', 'Number', 'number', false),
      ];
    case 'numberToText':
      return [plug('number', 'Number', 'number', true), plug('text', 'Text', 'text', false)];
    case 'text':
      return [
        plug('a', 'A', 'text', true),
        plug('b', 'B', 'text', true),
        plug('c', 'C', 'text', true),
        plug('result', 'Text', 'text', false),
      ];
    default:
      return [];
  }
}

/** Finds a plug by name. */
export function findPlug(block: Block, name: string): Plug | undefined {
  return plugsOf(block).find((p) => p.name === name);
}
