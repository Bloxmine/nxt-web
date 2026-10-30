import type { ReactNode } from 'react';
import { iconUrl } from '../lib/icons';

/** A labelled row in the configuration panel. */
export function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="label">
        {icon && <img src={iconUrl(icon)} alt="" />}
        {label}
      </span>
      <div className="controls">{children}</div>
    </div>
  );
}

/** Number box that ignores invalid input. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  width,
}: {
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  width?: number;
}) {
  return (
    <input
      className="num-input"
      type="number"
      aria-label={label}
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      style={width ? { width } : undefined}
      onChange={(e) => {
        const n = e.target.valueAsNumber;
        if (!Number.isNaN(n)) onChange(n);
      }}
    />
  );
}

/** Slider plus number box, like the classic power control. */
export function Slider({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number;
  onChange(value: number): void;
  min: number;
  max: number;
  label: string;
}) {
  return (
    <>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <NumberInput
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        label={`${label} value`}
        width={46}
      />
    </>
  );
}

/** Group of radio buttons. */
export function Radios<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange(value: T): void;
}) {
  return (
    <>
      {options.map(([key, text]) => (
        <label key={key} className="radio">
          <input type="radio" name={name} checked={value === key} onChange={() => onChange(key)} />
          {text}
        </label>
      ))}
    </>
  );
}

/** Drop-down list. */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange(value: T): void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={String(value)}
      onChange={(e) => {
        const match = options.find(([key]) => String(key) === e.target.value);
        if (match) onChange(match[0]);
      }}
    >
      {options.map(([key, text]) => (
        <option key={String(key)} value={String(key)}>
          {text}
        </option>
      ))}
    </select>
  );
}

/** Up / down / stop direction buttons. */
export function DirectionButtons({
  value,
  onChange,
}: {
  value: 'forward' | 'backward' | 'stop';
  onChange(value: 'forward' | 'backward' | 'stop'): void;
}) {
  const options = [
    ['forward', '▲', 'Forward'],
    ['backward', '▼', 'Backward'],
    ['stop', '■', 'Stop'],
  ] as const;
  return (
    <div className="dir-buttons" role="radiogroup" aria-label="Direction">
      {options.map(([key, glyph, text]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={text}
          title={text}
          className={`dir-btn ${value === key ? 'on' : ''}`}
          onClick={() => onChange(key)}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}
