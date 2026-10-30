import type { SensorKind } from '@nxt/compiler';
import type { Block, Condition, Duration, Program, SensorPort } from './model.js';
import { childSequences, walk } from './tree.js';

/** A problem with one block, shown on the block before the user presses Run. */
export interface Issue {
  blockId: string;
  severity: 'error' | 'warning';
  message: string;
}

/** Sensor kind a condition needs on its port, if it uses one. */
export function sensorKindOf(c: Condition): { port: SensorPort; kind: SensorKind } | null {
  switch (c.source) {
    case 'touch':
      return { port: c.port, kind: 'touch' };
    case 'light':
      return { port: c.port, kind: c.floodlight ? 'lightActive' : 'lightAmbient' };
    case 'sound':
      return { port: c.port, kind: c.dba ? 'soundDba' : 'soundDb' };
    case 'ultrasonic':
      return { port: c.port, kind: 'ultrasonic' };
    default:
      return null;
  }
}

/** The condition a block tests, if any. */
export function conditionOf(block: Block): Condition | null {
  if (block.kind === 'wait' && block.control.type === 'sensor') return block.control.condition;
  if (block.kind === 'loop' && block.control.type === 'sensor') return block.control.condition;
  if (block.kind === 'switch') return block.condition;
  return null;
}

const SENSOR_NAMES: Record<SensorKind, string> = {
  touch: 'touch sensor',
  lightActive: 'light sensor (floodlight on)',
  lightAmbient: 'light sensor (floodlight off)',
  soundDb: 'sound sensor (dB)',
  soundDba: 'sound sensor (dBA)',
  ultrasonic: 'ultrasonic sensor',
};

/** Checks a program for mistakes. Returns an empty list when it is fine to run. */
export function validateProgram(program: Program): Issue[] {
  const issues: Issue[] = [];
  const add = (blockId: string, message: string, severity: Issue['severity'] = 'error') =>
    issues.push({ blockId, severity, message });
  const variables = new Set(program.variables.map((v) => v.name));
  const sensorPorts = new Map<SensorPort, SensorKind>();

  const checkCondition = (block: Block, c: Condition) => {
    const sensor = sensorKindOf(c);
    if (sensor) {
      const existing = sensorPorts.get(sensor.port);
      if (existing && existing !== sensor.kind) {
        add(
          block.id,
          `Port ${sensor.port} is already used as a ${SENSOR_NAMES[existing]}; it can't also be a ${SENSOR_NAMES[sensor.kind]}.`,
        );
      } else {
        sensorPorts.set(sensor.port, sensor.kind);
      }
    }
    if (c.source === 'variable' && !variables.has(c.name)) {
      add(block.id, `Variable "${c.name}" does not exist.`);
    }
    if (c.source === 'ultrasonic' && (c.value < 0 || c.value > (c.unit === 'cm' ? 255 : 100))) {
      add(block.id, 'Distance is out of range (0–255 cm or 0–100 in).');
    }
    if ((c.source === 'light' || c.source === 'sound') && (c.value < 0 || c.value > 100)) {
      add(block.id, 'Level must be between 0 and 100.');
    }
    if (block.kind !== 'wait' && c.source === 'touch' && c.action === 'bumped') {
      add(block.id, '"Bumped" is treated as "pressed" here.', 'warning');
    }
  };

  const checkSequence = (blocks: readonly Block[]) => {
    blocks.forEach((block, i) => {
      if (block.kind === 'loop' && block.control.type === 'forever' && i < blocks.length - 1) {
        add(
          blocks[i + 1]!.id,
          'This block never runs: the loop before it repeats forever.',
          'warning',
        );
      }
      if (block.kind === 'stop' && i < blocks.length - 1) {
        add(blocks[i + 1]!.id, 'This block never runs: the program stops before it.', 'warning');
      }
      for (const child of childSequences(block)) checkSequence(child.blocks);
    });
  };

  const checkBlock = (block: Block) => {
    const condition = conditionOf(block);
    if (condition) checkCondition(block, condition);

    switch (block.kind) {
      case 'move':
        if (block.ports.length === 0) add(block.id, 'Choose at least one motor port.');
        checkPower(block.id, block.power);
        checkDuration(block.id, block.duration);
        break;
      case 'motor':
        checkPower(block.id, block.power);
        checkDuration(block.id, block.duration);
        break;
      case 'sound':
        if (block.action === 'tone' && (block.frequency < 200 || block.frequency > 14000)) {
          add(block.id, 'Tone frequency must be between 200 and 14000 Hz.');
        }
        if (block.action === 'file' && block.file.trim() === '')
          add(block.id, 'Choose a sound file.');
        if (block.action === 'file' && block.file.length > 15) {
          add(block.id, 'Sound file names can be at most 15 characters.');
        }
        if (block.volume < 0 || block.volume > 100) add(block.id, 'Volume must be 0–100.');
        if (block.action === 'tone' && block.seconds <= 0)
          add(block.id, 'Duration must be more than 0.');
        break;
      case 'display':
        if (block.line < 1 || block.line > 8) add(block.id, 'Line must be 1–8.');
        if (block.x < 0 || block.x > 99) add(block.id, 'X must be 0–99.');
        if (block.action === 'text' && block.text.length > 16) {
          add(block.id, 'Only 16 characters fit on one line; the rest will be cut off.', 'warning');
        }
        if (block.action === 'variable' && !variables.has(block.variable)) {
          add(block.id, `Variable "${block.variable}" does not exist.`);
        }
        break;
      case 'wait':
        if (block.control.type === 'time' && block.control.seconds < 0) {
          add(block.id, 'Time cannot be negative.');
        }
        break;
      case 'loop':
        if (
          block.control.type === 'count' &&
          (block.control.count < 0 || !Number.isInteger(block.control.count))
        ) {
          add(block.id, 'Count must be a whole number of 0 or more.');
        }
        if (block.control.type === 'time' && block.control.seconds <= 0) {
          add(block.id, 'Time must be more than 0.');
        }
        break;
      case 'variable':
        if (!variables.has(block.name)) add(block.id, `Variable "${block.name}" does not exist.`);
        break;
      case 'myBlock': {
        const def = program.myBlocks.find((m) => m.id === block.ref);
        if (!def) add(block.id, 'This My Block no longer exists.');
        break;
      }
      default:
        break;
    }
  };

  const checkPower = (id: string, power: number) => {
    if (power < 0 || power > 100) add(id, 'Power must be 0–100.');
  };
  const checkDuration = (id: string, d: Duration) => {
    if (d.unit !== 'unlimited' && d.value <= 0) add(id, 'Duration must be more than 0.');
  };

  walk(program.body, checkBlock);
  checkSequence(program.body);
  for (const def of program.myBlocks) {
    walk(def.body, checkBlock);
    checkSequence(def.body);
  }
  checkRecursion(program, add);
  return issues;
}

function checkRecursion(program: Program, add: (id: string, message: string) => void): void {
  const calls = new Map<string, { callId: string; ref: string }[]>();
  for (const def of program.myBlocks) {
    const list: { callId: string; ref: string }[] = [];
    walk(def.body, (b) => {
      if (b.kind === 'myBlock') list.push({ callId: b.id, ref: b.ref });
    });
    calls.set(def.id, list);
  }
  for (const def of program.myBlocks) {
    const seen = new Set<string>();
    const stack = [...(calls.get(def.id) ?? [])];
    while (stack.length) {
      const call = stack.pop()!;
      if (call.ref === def.id) {
        add(call.callId, `"${def.name}" uses itself, which the brick cannot run.`);
        break;
      }
      if (seen.has(call.ref)) continue;
      seen.add(call.ref);
      stack.push(...(calls.get(call.ref) ?? []));
    }
  }
}
