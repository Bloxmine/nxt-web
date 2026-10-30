import {
  defaultCondition,
  findBlock,
  iconOf,
  labelOf,
  updateBlock,
  type Block,
  type Condition,
  type ConditionSource,
  type Duration,
  type MotorPort,
  type Program,
  type SensorPort,
} from '@nxt/blocks';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { DirectionButtons, Field, NumberInput, Radios, Select, Slider } from './fields';

const SENSOR_PORTS = [
  [1, '1'],
  [2, '2'],
  [3, '3'],
  [4, '4'],
] as const satisfies readonly (readonly [SensorPort, string])[];
const MOTOR_PORTS = [
  ['A', 'A'],
  ['B', 'B'],
  ['C', 'C'],
] as const satisfies readonly (readonly [MotorPort, string])[];

/** Settings for the selected block, shown along the bottom like the classic editor. */
export function ConfigPanel({ onEditVariables }: { onEditVariables(): void }) {
  const { state, dispatch } = useEditor();
  const found = state.selected ? findBlock(state.program, state.selected) : null;

  if (!found) {
    return (
      <section className="config-panel" aria-label="Configuration">
        <div className="config-empty">Select a block to change its settings.</div>
      </section>
    );
  }

  const block = found.block;
  const update = (patch: Partial<Block>, key = Object.keys(patch).join(',')) =>
    dispatch({
      type: 'edit',
      update: (p) => updateBlock(p, block.id, (b) => ({ ...b, ...patch }) as Block),
      coalesce: `${block.id}:${key}`,
    });

  return (
    <section className="config-panel" aria-label={`${labelOf(block)} settings`}>
      <div className="config-side">
        <img src={iconUrl(iconOf(block), 32)} alt="" />
        {block.kind === 'myBlock'
          ? (state.program.myBlocks.find((m) => m.id === block.ref)?.name ?? 'My Block')
          : labelOf(block)}
      </div>
      <div className="config-body">
        <BlockFields
          block={block}
          update={update}
          program={state.program}
          onEditVariables={onEditVariables}
        />
      </div>
    </section>
  );
}

interface FieldsProps {
  block: Block;
  update(patch: Partial<Block>, key?: string): void;
  program: Program;
  onEditVariables(): void;
}

function DurationField({ value, onChange }: { value: Duration; onChange(d: Duration): void }) {
  return (
    <Field label="Duration" icon="hourglass">
      {value.unit !== 'unlimited' && (
        <NumberInput
          label="Duration amount"
          value={value.value}
          min={0}
          step={value.unit === 'degrees' ? 1 : 0.1}
          onChange={(n) => onChange({ unit: value.unit, value: n })}
        />
      )}
      <Select
        label="Duration unit"
        value={value.unit}
        options={[
          ['unlimited', 'Unlimited'],
          ['degrees', 'Degrees'],
          ['rotations', 'Rotations'],
          ['seconds', 'Seconds'],
        ]}
        onChange={(unit) =>
          onChange(
            unit === 'unlimited'
              ? { unit }
              : {
                  unit,
                  value: value.unit === 'unlimited' ? (unit === 'degrees' ? 360 : 1) : value.value,
                },
          )
        }
      />
    </Field>
  );
}

function NextAction({
  value,
  onChange,
  id,
}: {
  value: 'brake' | 'coast';
  onChange(v: 'brake' | 'coast'): void;
  id: string;
}) {
  return (
    <Field label="Next action">
      <Radios
        name={`next-${id}`}
        value={value}
        options={[
          ['brake', 'Brake'],
          ['coast', 'Coast'],
        ]}
        onChange={onChange}
      />
    </Field>
  );
}

function BlockFields({ block, update, program, onEditVariables }: FieldsProps) {
  const variableOptions = program.variables.map((v) => [v.name, v.name] as const);
  switch (block.kind) {
    case 'move':
      return (
        <>
          <Field label="Port" icon="cog">
            {(['A', 'B', 'C'] as const).map((p) => (
              <label key={p} className="check">
                <input
                  type="checkbox"
                  checked={block.ports.includes(p)}
                  onChange={(e) =>
                    update({
                      ports: e.target.checked
                        ? [...block.ports, p].sort()
                        : block.ports.filter((x) => x !== p),
                    })
                  }
                />
                {p}
              </label>
            ))}
          </Field>
          <Field label="Direction">
            <DirectionButtons
              value={block.direction}
              onChange={(direction) => update({ direction })}
            />
          </Field>
          <Field label="Steering">
            <span>{block.ports[0] ?? ''}</span>
            <Slider
              label="Steering"
              min={-100}
              max={100}
              value={block.steering}
              onChange={(steering) => update({ steering })}
            />
            <span>{block.ports[1] ?? ''}</span>
          </Field>
          <Field label="Power">
            <Slider
              label="Power"
              min={0}
              max={100}
              value={block.power}
              onChange={(power) => update({ power })}
            />
          </Field>
          <DurationField value={block.duration} onChange={(duration) => update({ duration })} />
          <NextAction
            id={block.id}
            value={block.nextAction}
            onChange={(nextAction) => update({ nextAction })}
          />
        </>
      );
    case 'motor':
      return (
        <>
          <Field label="Port" icon="cog">
            <Radios
              name={`port-${block.id}`}
              value={block.port}
              options={MOTOR_PORTS}
              onChange={(port) => update({ port })}
            />
          </Field>
          <Field label="Direction">
            <DirectionButtons
              value={block.direction}
              onChange={(direction) => update({ direction })}
            />
          </Field>
          <Field label="Power">
            <Slider
              label="Power"
              min={0}
              max={100}
              value={block.power}
              onChange={(power) => update({ power })}
            />
          </Field>
          <Field label="Control">
            <label className="check">
              <input
                type="checkbox"
                checked={block.regulated}
                onChange={(e) => update({ regulated: e.target.checked })}
              />
              Motor power (keep speed under load)
            </label>
          </Field>
          <DurationField value={block.duration} onChange={(duration) => update({ duration })} />
          <Field label="Wait">
            <label className="check">
              <input
                type="checkbox"
                checked={block.wait}
                onChange={(e) => update({ wait: e.target.checked })}
              />
              Wait for completion
            </label>
          </Field>
          <NextAction
            id={block.id}
            value={block.nextAction}
            onChange={(nextAction) => update({ nextAction })}
          />
        </>
      );
    case 'sound':
      return (
        <>
          <Field label="Action" icon="sound">
            <Radios
              name={`sound-${block.id}`}
              value={block.action}
              options={[
                ['tone', 'Tone'],
                ['file', 'Sound file'],
                ['stop', 'Stop'],
              ]}
              onChange={(action) => update({ action })}
            />
          </Field>
          {block.action === 'tone' && (
            <Field label="Tone">
              <NumberInput
                label="Frequency"
                value={block.frequency}
                min={200}
                max={14000}
                onChange={(frequency) => update({ frequency })}
              />
              Hz
              <Select
                label="Note"
                value={String(block.frequency)}
                options={NOTES}
                onChange={(f) => update({ frequency: Number(f) })}
              />
            </Field>
          )}
          {block.action === 'file' && (
            <Field label="File">
              <input
                className="text-input"
                aria-label="Sound file name"
                value={block.file}
                maxLength={15}
                onChange={(e) => update({ file: e.target.value })}
              />
            </Field>
          )}
          {block.action !== 'stop' && (
            <>
              {block.action === 'tone' && (
                <Field label="Duration">
                  <NumberInput
                    label="Seconds"
                    value={block.seconds}
                    min={0}
                    step={0.1}
                    onChange={(seconds) => update({ seconds })}
                  />
                  seconds
                </Field>
              )}
              <Field label="Volume" icon="sound">
                <Slider
                  label="Volume"
                  min={0}
                  max={100}
                  value={block.volume}
                  onChange={(volume) => update({ volume })}
                />
              </Field>
              <Field label="Wait">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={block.wait}
                    onChange={(e) => update({ wait: e.target.checked })}
                  />
                  Wait for completion
                </label>
                {block.action === 'file' && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={block.repeat}
                      onChange={(e) => update({ repeat: e.target.checked })}
                    />
                    Repeat
                  </label>
                )}
              </Field>
            </>
          )}
        </>
      );
    case 'display':
      return (
        <>
          <Field label="Action" icon="monitor">
            <Select
              label="Display action"
              value={block.action}
              options={[
                ['text', 'Text'],
                ['variable', 'Number variable'],
                ['reset', 'Clear screen'],
              ]}
              onChange={(action) => update({ action })}
            />
          </Field>
          {block.action === 'text' && (
            <Field label="Text" icon="text">
              <input
                className="text-input"
                aria-label="Text"
                value={block.text}
                onChange={(e) => update({ text: e.target.value })}
              />
            </Field>
          )}
          {block.action === 'variable' && (
            <Field label="Variable" icon="tag_red">
              <Select
                label="Variable"
                value={block.variable}
                options={variableOptions}
                onChange={(variable) => update({ variable })}
              />
            </Field>
          )}
          {block.action !== 'reset' && (
            <>
              <Field label="Position">
                X
                <NumberInput
                  label="X position"
                  value={block.x}
                  min={0}
                  max={99}
                  onChange={(x) => update({ x })}
                />
                Line
                <Select
                  label="Line"
                  value={block.line}
                  options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, String(n)] as const)}
                  onChange={(line) => update({ line })}
                />
              </Field>
              <Field label="Display">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={block.clear}
                    onChange={(e) => update({ clear: e.target.checked })}
                  />
                  Clear first
                </label>
              </Field>
            </>
          )}
        </>
      );
    case 'wait':
      return (
        <>
          <Field label="Control" icon="hourglass">
            <Select
              label="Wait for"
              value={block.control.type === 'time' ? 'time' : block.control.condition.source}
              options={[['time', 'Time'], ...CONDITION_OPTIONS]}
              onChange={(v) =>
                update({
                  control:
                    v === 'time'
                      ? { type: 'time', seconds: 1 }
                      : { type: 'sensor', condition: defaultCondition(v as ConditionSource) },
                })
              }
            />
          </Field>
          {block.control.type === 'time' ? (
            <Field label="Until">
              <NumberInput
                label="Seconds"
                value={block.control.seconds}
                min={0}
                step={0.1}
                onChange={(seconds) => update({ control: { type: 'time', seconds } })}
              />
              seconds
            </Field>
          ) : (
            <ConditionFields
              id={block.id}
              condition={block.control.condition}
              variables={variableOptions}
              onChange={(condition) => update({ control: { type: 'sensor', condition } })}
            />
          )}
        </>
      );
    case 'loop': {
      const control = block.control;
      return (
        <>
          <Field label="Control" icon="arrow_refresh">
            <Select
              label="Loop control"
              value={control.type === 'sensor' ? control.condition.source : control.type}
              options={[
                ['forever', 'Forever'],
                ['count', 'Count'],
                ['time', 'Time'],
                ...CONDITION_OPTIONS,
              ]}
              onChange={(v) =>
                update({
                  control:
                    v === 'forever'
                      ? { type: 'forever' }
                      : v === 'count'
                        ? { type: 'count', count: 2 }
                        : v === 'time'
                          ? { type: 'time', seconds: 5 }
                          : { type: 'sensor', condition: defaultCondition(v as ConditionSource) },
                })
              }
            />
          </Field>
          {control.type === 'count' && (
            <Field label="Count">
              <NumberInput
                label="Count"
                value={control.count}
                min={0}
                onChange={(count) => update({ control: { type: 'count', count } })}
              />
              times
            </Field>
          )}
          {control.type === 'time' && (
            <Field label="Until">
              <NumberInput
                label="Seconds"
                value={control.seconds}
                min={0}
                step={0.1}
                onChange={(seconds) => update({ control: { type: 'time', seconds } })}
              />
              seconds
            </Field>
          )}
          {control.type === 'sensor' && (
            <ConditionFields
              id={block.id}
              condition={control.condition}
              variables={variableOptions}
              onChange={(condition) => update({ control: { type: 'sensor', condition } })}
            />
          )}
          {control.type !== 'forever' && (
            <p style={{ margin: 0, color: '#555' }}>Checked after each pass.</p>
          )}
        </>
      );
    }
    case 'switch':
      return (
        <>
          <Field label="Control" icon="arrow_switch">
            <Select
              label="Switch on"
              value={block.condition.source}
              options={CONDITION_OPTIONS}
              onChange={(v) => update({ condition: defaultCondition(v) })}
            />
          </Field>
          <ConditionFields
            id={block.id}
            condition={block.condition}
            variables={variableOptions}
            onChange={(condition) => update({ condition })}
          />
          <p style={{ margin: 0, color: '#555' }}>Top branch runs when true, bottom when false.</p>
        </>
      );
    case 'resetRotation':
      return (
        <Field label="Port" icon="cog">
          <Radios
            name={`port-${block.id}`}
            value={block.port}
            options={MOTOR_PORTS}
            onChange={(port) => update({ port })}
          />
        </Field>
      );
    case 'variable':
      return (
        <>
          <Field label="Variable" icon="tag_red">
            <Select
              label="Variable"
              value={block.name}
              options={variableOptions}
              onChange={(name) => update({ name })}
            />
            <button type="button" className="btn" onClick={onEditVariables}>
              Edit variables…
            </button>
          </Field>
          <Field label="Action">
            <Radios
              name={`var-${block.id}`}
              value={block.action}
              options={[
                ['set', 'Set to'],
                ['change', 'Change by'],
              ]}
              onChange={(action) => update({ action })}
            />
          </Field>
          <Field label="Value">
            <NumberInput
              label="Value"
              value={block.value}
              step={1}
              onChange={(value) => update({ value })}
            />
          </Field>
        </>
      );
    case 'myBlock':
      return <p>Double-click the block to open and edit it.</p>;
    case 'stop':
      return <p>Ends the program when reached.</p>;
    case 'resetTimer':
      return <p>Resets the timer to zero.</p>;
  }
}

const CONDITION_OPTIONS = [
  ['touch', 'Touch sensor'],
  ['light', 'Light sensor'],
  ['sound', 'Sound sensor'],
  ['ultrasonic', 'Ultrasonic sensor'],
  ['rotation', 'Rotation sensor'],
  ['timer', 'Timer'],
  ['button', 'NXT buttons'],
  ['variable', 'Variable'],
] as const satisfies readonly (readonly [ConditionSource, string])[];

const NOTES = [
  ['262', 'C4'],
  ['294', 'D4'],
  ['330', 'E4'],
  ['349', 'F4'],
  ['392', 'G4'],
  ['440', 'A4'],
  ['494', 'B4'],
  ['523', 'C5'],
  ['587', 'D5'],
  ['659', 'E5'],
  ['698', 'F5'],
  ['784', 'G5'],
  ['880', 'A5'],
] as const;

const COMPARE = [
  ['<', '<'],
  ['>', '>'],
] as const;

function ConditionFields({
  id,
  condition: c,
  variables,
  onChange,
}: {
  id: string;
  condition: Condition;
  variables: readonly (readonly [string, string])[];
  onChange(c: Condition): void;
}) {
  const port =
    'port' in c && typeof c.port === 'number' ? (
      <Field label="Port" icon="connect">
        <Radios
          name={`sport-${id}`}
          value={String(c.port)}
          options={SENSOR_PORTS.map(([n, t]) => [String(n), t] as const)}
          onChange={(p) => onChange({ ...c, port: Number(p) as SensorPort } as Condition)}
        />
      </Field>
    ) : null;

  switch (c.source) {
    case 'touch':
      return (
        <>
          {port}
          <Field label="Action" icon="hand_point">
            <Radios
              name={`touch-${id}`}
              value={c.action}
              options={[
                ['pressed', 'Pressed'],
                ['released', 'Released'],
                ['bumped', 'Bumped'],
              ]}
              onChange={(action) => onChange({ ...c, action })}
            />
          </Field>
        </>
      );
    case 'light':
    case 'sound':
      return (
        <>
          {port}
          <Field label="Until" icon={c.source === 'light' ? 'lightbulb' : 'microphone'}>
            <Select
              label="Compare"
              value={c.compare}
              options={COMPARE}
              onChange={(compare) => onChange({ ...c, compare })}
            />
            <Slider
              label="Level"
              min={0}
              max={100}
              value={c.value}
              onChange={(value) => onChange({ ...c, value })}
            />
          </Field>
          <Field label={c.source === 'light' ? 'Function' : 'Mode'}>
            {c.source === 'light' ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={c.floodlight}
                  onChange={(e) => onChange({ ...c, floodlight: e.target.checked })}
                />
                Generate light
              </label>
            ) : (
              <label className="check">
                <input
                  type="checkbox"
                  checked={c.dba}
                  onChange={(e) => onChange({ ...c, dba: e.target.checked })}
                />
                dBA (human hearing)
              </label>
            )}
          </Field>
        </>
      );
    case 'ultrasonic':
      return (
        <>
          {port}
          <Field label="Until" icon="eye">
            <Select
              label="Compare"
              value={c.compare}
              options={COMPARE}
              onChange={(compare) => onChange({ ...c, compare })}
            />
            <NumberInput
              label="Distance"
              value={c.value}
              min={0}
              max={255}
              onChange={(value) => onChange({ ...c, value })}
            />
            <Select
              label="Unit"
              value={c.unit}
              options={[
                ['cm', 'cm'],
                ['in', 'inches'],
              ]}
              onChange={(unit) => onChange({ ...c, unit })}
            />
          </Field>
        </>
      );
    case 'rotation':
      return (
        <>
          <Field label="Port" icon="cog">
            <Radios
              name={`rport-${id}`}
              value={c.port}
              options={MOTOR_PORTS}
              onChange={(p) => onChange({ ...c, port: p })}
            />
          </Field>
          <Field label="Until" icon="arrow_rotate_clockwise">
            <Select
              label="Compare"
              value={c.compare}
              options={COMPARE}
              onChange={(compare) => onChange({ ...c, compare })}
            />
            <NumberInput
              label="Amount"
              value={c.value}
              step={c.unit === 'degrees' ? 1 : 0.1}
              onChange={(value) => onChange({ ...c, value })}
            />
            <Select
              label="Unit"
              value={c.unit}
              options={[
                ['degrees', 'Degrees'],
                ['rotations', 'Rotations'],
              ]}
              onChange={(unit) => onChange({ ...c, unit })}
            />
          </Field>
        </>
      );
    case 'timer':
      return (
        <Field label="Until" icon="stopwatch_start">
          <Select
            label="Compare"
            value={c.compare}
            options={COMPARE}
            onChange={(compare) => onChange({ ...c, compare })}
          />
          <NumberInput
            label="Seconds"
            value={c.seconds}
            min={0}
            step={0.1}
            onChange={(seconds) => onChange({ ...c, seconds })}
          />
          seconds
        </Field>
      );
    case 'button':
      return (
        <>
          <Field label="Button" icon="joystick">
            <Select
              label="Button"
              value={c.button}
              options={[
                ['enter', 'Enter (orange)'],
                ['left', 'Left'],
                ['right', 'Right'],
              ]}
              onChange={(button) => onChange({ ...c, button })}
            />
          </Field>
          <Field label="Action">
            <Radios
              name={`btn-${id}`}
              value={c.action}
              options={[
                ['pressed', 'Pressed'],
                ['released', 'Released'],
              ]}
              onChange={(action) => onChange({ ...c, action })}
            />
          </Field>
        </>
      );
    case 'variable':
      return (
        <Field label="Until" icon="tag_red">
          <Select
            label="Variable"
            value={c.name}
            options={variables}
            onChange={(name) => onChange({ ...c, name })}
          />
          <Select
            label="Compare"
            value={c.compare}
            options={[...COMPARE, ['=', '=']]}
            onChange={(compare) => onChange({ ...c, compare })}
          />
          <NumberInput
            label="Value"
            value={c.value}
            onChange={(value) => onChange({ ...c, value })}
          />
        </Field>
      );
  }
}
