import {
  conditionOf,
  findBlock,
  labelOf,
  sensorKindOf,
  updateBlock,
  type Block,
  type Condition,
} from '@nxt/blocks';
import type { SensorKind } from '@nxt/compiler';
import { SensorMode, type InputPort } from '@nxt/protocol';
import { useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { Dialog } from '../components/Dialog';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { useSimulator } from '../sim/SimulatorContext';
import { calibratable } from './calibration';

function withValue(block: Block, value: number): Block {
  const set = (c: Condition): Condition => ({ ...c, value }) as Condition;
  if ((block.kind === 'wait' || block.kind === 'loop') && block.control.type === 'sensor') {
    return {
      ...block,
      control: { ...block.control, condition: set(block.control.condition) },
    } as Block;
  }
  if (block.kind === 'switch' || block.kind === 'sensor')
    return { ...block, condition: set(block.condition) } as Block;
  return block;
}

// Sensor type and mode per kind for a direct reading (docs/spec/direct-commands.md;
// the color types are the NXT 2.0 values from docs/spec/rxe.md).
const SETUP: Partial<Record<SensorKind, [number, number]>> = {
  lightActive: [0x05, SensorMode.PercentFullScale],
  lightAmbient: [0x06, SensorMode.PercentFullScale],
  soundDb: [0x07, SensorMode.PercentFullScale],
  soundDba: [0x08, SensorMode.PercentFullScale],
  colorRed: [0x0e, SensorMode.PercentFullScale],
  colorGreen: [0x0f, SensorMode.PercentFullScale],
  colorBlue: [0x10, SensorMode.PercentFullScale],
  colorNone: [0x11, SensorMode.PercentFullScale],
};

/**
 * Tools → Calibrate sensor: read the sensor on a dark (or near) and a light (or far)
 * surface, then set the selected block's trigger value halfway between.
 */
export function CalibrateDialog({ onClose }: { onClose(): void }) {
  const { state, dispatch } = useEditor();
  const brick = useBrick();
  const sim = useSimulator();
  const block = state.selected ? findBlock(state.program, state.selected)?.block : undefined;
  const condition = block ? conditionOf(block) : null;
  const [source, setSource] = useState<'brick' | 'simulator'>(brick.client ? 'brick' : 'simulator');
  const [low, setLow] = useState<number | null>(null);
  const [high, setHigh] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!block || !calibratable(condition)) {
    return (
      <Dialog title="Calibrate sensor" icon="color_adjustment" width={420} onClose={onClose}>
        <p style={{ marginTop: 0 }}>
          Select a Wait, Loop, Switch or sensor block that uses a light, color (light level), sound
          or ultrasonic sensor first.
        </p>
      </Dialog>
    );
  }

  const kind = sensorKindOf(condition)!;
  const port = (kind.port - 1) as InputPort;
  const ultrasonic = condition.source === 'ultrasonic';
  const words = ultrasonic
    ? (['Near', 'Far'] as const)
    : condition.source === 'sound'
      ? (['Quiet', 'Loud'] as const)
      : (['Dark', 'Light'] as const);
  const inches = ultrasonic && condition.unit === 'in';

  /** Average of eight readings, in the block's units. */
  const measure = async (): Promise<number> => {
    const values: number[] = [];
    if (source === 'brick') {
      const client = brick.client;
      if (!client) throw new Error('Connect a brick first (NXT window).');
      if (ultrasonic) await client.readUltrasonic(port, true);
      else {
        const setup = SETUP[kind.kind];
        if (setup) await client.setInputMode(port, setup[0], setup[1]);
        await new Promise((r) => setTimeout(r, 150));
      }
      for (let i = 0; i < 8; i++) {
        values.push(
          ultrasonic
            ? await client.readUltrasonic(port)
            : (await client.getInputValues(port)).scaled,
        );
        await new Promise((r) => setTimeout(r, 40));
      }
    } else {
      if (!sim.sim) throw new Error('Open the simulator first, and place the robot.');
      values.push(sim.sim.world.read(kind.kind));
    }
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.round(inches ? avg / 2.54 : avg);
  };

  const take = async (set: (v: number) => void) => {
    setBusy(true);
    setError(null);
    try {
      set(await measure());
    } catch (e) {
      setError(friendlyError(e) ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const suggestion = low !== null && high !== null ? Math.round((low + high) / 2) : null;
  const unit = ultrasonic ? (inches ? ' in' : ' cm') : '';

  return (
    <Dialog
      title="Calibrate sensor"
      icon="color_adjustment"
      width={440}
      modeless
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn primary"
            disabled={suggestion === null}
            onClick={() => {
              const id = block.id;
              dispatch({
                type: 'edit',
                update: (p) => updateBlock(p, id, (b) => withValue(b, suggestion!)),
              });
              onClose();
            }}
          >
            Use {suggestion ?? '…'}
            {unit}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{labelOf(block)}</strong> on port {kind.port}: trigger is now{' '}
        <strong>
          {condition.compare} {condition.value}
          {unit}
        </strong>
        .
      </p>
      <label>
        Read from{' '}
        <select value={source} onChange={(e) => setSource(e.target.value as 'brick' | 'simulator')}>
          <option value="brick">Brick ({brick.client ? 'connected' : 'not connected'})</option>
          <option value="simulator">Simulator (where the robot stands)</option>
        </select>
      </label>
      <ol className="calibrate-steps">
        {[
          { word: words[0], value: low, set: setLow },
          { word: words[1], value: high, set: setHigh },
        ].map((s, i) => (
          <li key={s.word}>
            {ultrasonic
              ? `Put an object ${i === 0 ? 'close to' : 'far from'} the sensor`
              : condition.source === 'sound'
                ? `Make it ${i === 0 ? 'quiet' : 'loud'}`
                : `Hold the sensor over a ${i === 0 ? 'dark' : 'light'} surface`}
            , then{' '}
            <button type="button" className="btn" disabled={busy} onClick={() => void take(s.set)}>
              <img src={iconUrl('eye')} alt="" /> Read {s.word.toLowerCase()}
            </button>{' '}
            <strong aria-live="polite">{s.value === null ? '' : `${s.value}${unit}`}</strong>
          </li>
        ))}
      </ol>
      {suggestion !== null && (
        <p>
          Halfway between is{' '}
          <strong>
            {suggestion}
            {unit}
          </strong>
          .
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          <img src={iconUrl('exclamation')} alt="" />
          <span>{error}</span>
        </div>
      )}
    </Dialog>
  );
}
