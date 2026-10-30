import type { Block } from '@nxt/blocks';
import { Field, NumberInput, Radios, Select } from './fields';

type DataBlock = Extract<
  Block,
  { kind: 'math' | 'compare' | 'logic' | 'range' | 'random' | 'numberToText' | 'text' }
>;

const TRUE_FALSE = [
  ['true', 'True'],
  ['false', 'False'],
] as const;

/** Settings for the Data and Advanced blocks. Wired inputs override these. */
export function DataFields({
  block,
  update,
}: {
  block: Block;
  update(patch: Partial<Block>): void;
}) {
  const b = block as DataBlock;
  const set = (patch: Partial<DataBlock>) => update(patch as Partial<Block>);
  switch (b.kind) {
    case 'math':
    case 'compare':
      return (
        <>
          <Field label="Operation" icon={b.kind === 'math' ? 'calculator' : 'arrow_divide'}>
            {b.kind === 'math' ? (
              <Select
                label="Operation"
                value={b.op}
                options={[
                  ['+', 'Addition'],
                  ['-', 'Subtraction'],
                  ['*', 'Multiplication'],
                  ['/', 'Division'],
                ]}
                onChange={(op) => set({ op })}
              />
            ) : (
              <Select
                label="Operation"
                value={b.op}
                options={[
                  ['<', 'Less than'],
                  ['>', 'Greater than'],
                  ['=', 'Equals'],
                ]}
                onChange={(op) => set({ op })}
              />
            )}
          </Field>
          <Field label="A">
            <NumberInput label="A" value={b.a} onChange={(a) => set({ a })} />
          </Field>
          <Field label="B">
            <NumberInput label="B" value={b.b} onChange={(v) => set({ b: v })} />
          </Field>
        </>
      );
    case 'logic':
      return (
        <>
          <Field label="Operation" icon="arrow_join">
            <Select
              label="Operation"
              value={b.op}
              options={[
                ['and', 'And'],
                ['or', 'Or'],
                ['xor', 'Xor'],
                ['not', 'Not'],
              ]}
              onChange={(op) => set({ op })}
            />
          </Field>
          <Field label="A">
            <Radios
              name={`la-${b.id}`}
              value={b.a ? 'true' : 'false'}
              options={TRUE_FALSE}
              onChange={(x) => set({ a: x === 'true' })}
            />
          </Field>
          {b.op !== 'not' && (
            <Field label="B">
              <Radios
                name={`lb-${b.id}`}
                value={b.b ? 'true' : 'false'}
                options={TRUE_FALSE}
                onChange={(x) => set({ b: x === 'true' })}
              />
            </Field>
          )}
        </>
      );
    case 'range':
      return (
        <>
          <Field label="Operation" icon="ruler">
            <Radios
              name={`range-${b.id}`}
              value={b.inside ? 'inside' : 'outside'}
              options={[
                ['inside', 'Inside range'],
                ['outside', 'Outside range'],
              ]}
              onChange={(x) => set({ inside: x === 'inside' })}
            />
          </Field>
          <Field label="Range">
            <NumberInput label="Low" value={b.low} onChange={(low) => set({ low })} />
            to
            <NumberInput label="High" value={b.high} onChange={(high) => set({ high })} />
          </Field>
          <Field label="Test value">
            <NumberInput label="Test value" value={b.value} onChange={(value) => set({ value })} />
          </Field>
        </>
      );
    case 'random':
      return (
        <Field label="Range" icon="dice">
          <NumberInput label="Minimum" value={b.min} onChange={(min) => set({ min })} />
          to
          <NumberInput label="Maximum" value={b.max} onChange={(max) => set({ max })} />
        </Field>
      );
    case 'numberToText':
      return (
        <Field label="Number" icon="textfield">
          <NumberInput label="Number" value={b.value} onChange={(value) => set({ value })} />
        </Field>
      );
    case 'text':
      return (
        <>
          {(['a', 'b', 'c'] as const).map((k) => (
            <Field key={k} label={k.toUpperCase()} icon={k === 'a' ? 'font' : undefined}>
              <input
                className="text-input"
                aria-label={`Text ${k.toUpperCase()}`}
                value={b[k]}
                onChange={(e) => set({ [k]: e.target.value })}
              />
            </Field>
          ))}
        </>
      );
    default:
      return null;
  }
}
