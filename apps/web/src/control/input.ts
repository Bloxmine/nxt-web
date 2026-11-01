/**
 * Keyboard and gamepad input for the remote control. Keys are named by their position
 * on the keyboard (KeyboardEvent.code), so W A S D work on any keyboard layout; left and
 * right Shift, Ctrl, Alt and Meta count as the same key.
 */
import type { Binding } from './profile';

const MERGED: Record<string, string> = {
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Control',
  ControlRight: 'Control',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  MetaLeft: 'Meta',
  MetaRight: 'Meta',
};

export const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/** The input name for a key event's physical key. */
export function keyName(code: string): string {
  return MERGED[code] ?? code;
}

const LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Control: 'Ctrl',
  Meta: 'Meta',
  Space: 'Space',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Escape: 'Esc',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadEnter: 'Num Enter',
  NumpadDecimal: 'Num .',
};

/** A readable name for an input: "W", "↑", "Ctrl", "Pad button 1", "Pad stick 0 →". */
export function inputLabel(input: string): string {
  if (input.startsWith('pad:b')) return `Pad button ${Number(input.slice(5)) + 1}`;
  const axis = /^pad:a(\d+)([+-])$/.exec(input);
  if (axis) {
    const n = Number(axis[1]);
    const positive = axis[2] === '+';
    // Standard mapping: even axes are left/right, odd axes up/down.
    const arrow = n % 2 === 0 ? (positive ? '→' : '←') : positive ? '↓' : '↑';
    return `Pad stick ${Math.floor(n / 2) + 1} ${arrow}`;
  }
  if (LABELS[input]) return LABELS[input];
  if (/^Key[A-Z]$/.test(input)) return input.slice(3);
  if (/^Digit\d$/.test(input)) return input.slice(5);
  if (/^Numpad\d$/.test(input)) return `Num ${input.slice(6)}`;
  return input;
}

/** "Shift + W": modifiers first, then the other keys, then gamepad controls. */
export function chordLabel(inputs: readonly string[]): string {
  if (inputs.length === 0) return '(nothing)';
  return sortChord(inputs).map(inputLabel).join(' + ');
}

export function sortChord(inputs: readonly string[]): string[] {
  const rank = (i: string) => (MODIFIERS.has(i) ? 0 : i.startsWith('pad:') ? 2 : 1);
  return [...inputs].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Same inputs, in any order. */
export function sameChord(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((i) => b.includes(i));
}

/** Combinations the browser keeps for itself, so a page never sees them. */
export function browserReserved(inputs: readonly string[]): boolean {
  const ctrl = inputs.includes('Control') || inputs.includes('Meta');
  return (
    (ctrl && ['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'Tab'].some((k) => inputs.includes(k))) ||
    inputs.includes('F5') ||
    inputs.includes('F11')
  );
}

/** How far a gamepad axis has to move before it counts. */
export const DEAD_ZONE = 0.15;

/** The pressed controls of a gamepad, with how far each is pressed (0–1). */
export function readGamepad(pad: Pick<Gamepad, 'buttons' | 'axes'>): Map<string, number> {
  const values = new Map<string, number>();
  pad.buttons.forEach((b, i) => {
    const v = b.pressed ? Math.max(b.value, 0.5) : b.value;
    if (v > 0.1) values.set(`pad:b${i}`, Math.min(1, v));
  });
  pad.axes.forEach((a, i) => {
    if (Math.abs(a) < DEAD_ZONE) return;
    const v = Math.min(1, (Math.abs(a) - DEAD_ZONE) / (1 - DEAD_ZONE));
    values.set(`pad:a${i}${a > 0 ? '+' : '-'}`, v);
  });
  return values;
}

/**
 * Which bindings are active for the inputs held now, and how strongly (0–1; a gamepad
 * stick gives values in between). A binding needs all of its inputs. When one active
 * binding's inputs include another's (Shift + W and W), only the larger one counts, so
 * a combination can do something different from its keys on their own.
 */
export function activeBindings(
  bindings: readonly Binding[],
  held: ReadonlyMap<string, number>,
): Map<Binding, number> {
  const candidates = bindings.filter(
    (b) => b.inputs.length > 0 && b.inputs.every((i) => (held.get(i) ?? 0) > 0),
  );
  const active = new Map<Binding, number>();
  for (const b of candidates) {
    const covered = candidates.some(
      (other) =>
        other.inputs.length > b.inputs.length && b.inputs.every((i) => other.inputs.includes(i)),
    );
    if (!covered) active.set(b, Math.min(...b.inputs.map((i) => held.get(i) ?? 0)));
  }
  return active;
}

/** True when the keyboard event is typing into a form field (so keys must not drive). */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return (
    target instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file'].includes(
      target.type,
    )
  );
}
