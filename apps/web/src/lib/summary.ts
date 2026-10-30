import type { Block, Condition, Duration } from '@nxt/blocks';

/** Port letters/numbers shown in a block's top-right corner. */
export function portsLabel(block: Block): string {
  switch (block.kind) {
    case 'move':
      return [...block.ports].sort().reverse().join(' ');
    case 'motor':
    case 'resetRotation':
      return block.port;
    case 'wait':
      return block.control.type === 'sensor' ? conditionPort(block.control.condition) : '';
    case 'loop':
      return block.control.type === 'sensor' ? conditionPort(block.control.condition) : '';
    case 'switch':
    case 'sensor':
      return conditionPort(block.condition);
    default:
      return '';
  }
}

function conditionPort(c: Condition): string {
  return 'port' in c ? String(c.port) : '';
}

function durationText(d: Duration): string {
  switch (d.unit) {
    case 'unlimited':
      return '∞';
    case 'degrees':
      return `${d.value}°`;
    case 'rotations':
      return `${d.value} rot`;
    case 'seconds':
      return `${d.value} s`;
  }
}

/** Short description of a condition, e.g. "< 25 cm". */
export function conditionText(c: Condition): string {
  switch (c.source) {
    case 'touch':
      return c.action;
    case 'light':
    case 'sound':
      return `${c.compare} ${c.value}%`;
    case 'ultrasonic':
      return `${c.compare} ${c.value} ${c.unit}`;
    case 'rotation':
      return `${c.compare} ${c.value}${c.unit === 'degrees' ? '°' : ' rot'}`;
    case 'timer':
      return `${c.compare} ${c.seconds} s`;
    case 'button':
      return `${c.button} ${c.action}`;
    case 'variable':
      return `${c.name} ${c.compare} ${c.value}`;
    case 'logic':
      return 'wired';
  }
}

const ARROW = { forward: '▲', backward: '▼', stop: '■' } as const;

/** The little summary along the bottom of a block. */
export function blockSummary(block: Block): string {
  switch (block.kind) {
    case 'move':
      return block.direction === 'stop'
        ? `■ ${block.nextAction}`
        : `${ARROW[block.direction]} ${block.power}  ${durationText(block.duration)}`;
    case 'motor':
      return block.direction === 'stop'
        ? `■ ${block.nextAction}`
        : `${ARROW[block.direction]} ${block.power}  ${durationText(block.duration)}`;
    case 'sound':
      if (block.action === 'stop') return '■ stop';
      return block.action === 'tone' ? `♪ ${block.frequency} Hz` : `♪ ${block.file}`;
    case 'display':
      if (block.action === 'reset') return 'reset';
      return block.action === 'text' ? `"${block.text}"` : `# ${block.variable}`;
    case 'wait':
      return block.control.type === 'time'
        ? `${block.control.seconds} s`
        : conditionText(block.control.condition);
    case 'stop':
      return 'end';
    case 'resetRotation':
    case 'resetTimer':
      return 'reset';
    case 'variable':
      if (block.action === 'read') return block.name;
      return block.action === 'set' ? `= ${block.value}` : `+= ${block.value}`;
    case 'myBlock':
      return '';
    case 'sensor':
      return 'port' in block.condition
        ? `port ${block.condition.port}`
        : conditionText(block.condition);
    case 'math':
    case 'compare':
      return `A ${block.op} B`;
    case 'logic':
      return block.op;
    case 'range':
      return `${block.low}–${block.high}`;
    case 'random':
      return `${block.min}–${block.max}`;
    case 'numberToText':
      return '# → T';
    case 'text':
      return 'A+B+C';
    default:
      return '';
  }
}
