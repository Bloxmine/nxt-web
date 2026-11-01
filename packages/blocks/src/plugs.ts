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

/** Plug name of a My Block call for parameter `name`. */
export function myBlockPlug(name: string): string {
  return `p:${name}`;
}

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
      return [
        plug('frequency', 'Tone', 'number', true),
        plug('volume', 'Volume', 'number', true),
        // Milliseconds, as in NXT-G.
        plug('duration', 'Duration (ms)', 'number', true),
      ];
    case 'display':
      return [
        plug('text', 'Text', 'text', true),
        plug('number', 'Number', 'number', true),
        plug('x', 'X', 'number', true),
        plug('y', 'Y', 'number', true),
        plug('endX', 'End X', 'number', true),
        plug('endY', 'End Y', 'number', true),
        plug('radius', 'Radius', 'number', true),
      ];
    case 'loop': {
      const plugs: Plug[] = [];
      if (block.control.type === 'sensor' && block.control.condition.source === 'logic') {
        plugs.push(plug('condition', 'Until', 'logic', true, false));
      }
      if (block.showCounter) plugs.push(plug('count', 'Count', 'number', false));
      return plugs;
    }
    case 'file':
      return [
        plug('filename', 'Filename', 'text', true),
        plug('text', 'Text', 'text', block.action === 'write'),
        plug('number', 'Number', 'number', block.action === 'write'),
        plug('size', 'File size', 'number', true),
        plug('error', 'Error', 'logic', false),
      ];
    case 'sendMessage':
      return [
        plug('mailbox', 'Mailbox', 'number', true),
        plug('value', 'Message', block.type, true),
      ];
    case 'receiveMessage':
      return [
        plug('mailbox', 'Mailbox', 'number', true),
        plug('received', 'Received', 'logic', false),
        plug('value', 'Message', block.type, false),
      ];
    case 'constant':
      return [plug('value', 'Value', block.valueType, false)];
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
    case 'myBlock':
      return (block.params ?? []).map((p) =>
        p.direction === 'in'
          ? plug(myBlockPlug(p.name), p.name, p.type, true, false)
          : plug(myBlockPlug(p.name), p.name, p.type, false),
      );
    case 'myBlockParam':
      return block.direction === 'in'
        ? [plug('value', block.name, block.valueType, false)]
        : [plug('value', block.name, block.valueType, true, false)];
    case 'sensor': {
      const c = block.condition;
      if (c.source === 'touch' || c.source === 'button')
        return [plug('yes', 'Yes / No', 'logic', false)];
      if (c.source === 'color' && c.mode === 'light') {
        return [
          plug('trigger', 'Trigger', 'number', true),
          plug('lamp', 'Lamp color', 'number', true, false),
          plug('light', 'Lamp on', 'logic', true, false),
          plug('yes', 'Yes / No', 'logic', false),
          plug('value', 'Value', 'number', false),
        ];
      }
      if (c.source === 'color' && c.mode === 'range') {
        return [plug('yes', 'Yes / No', 'logic', false), plug('value', 'Color', 'number', false)];
      }
      if (c.source === 'rotation') {
        // As in NXT-G: Degrees is how far the motor turned, Direction which way.
        return [
          plug('trigger', 'Trigger', 'number', true),
          plug('yes', 'Yes / No', 'logic', false),
          plug('value', 'Degrees', 'number', false),
          plug('direction', 'Direction', 'logic', false),
        ];
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
