import { checkProgram, findBlock, labelOf, updateBlock } from '@nxt/blocks';
import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { degreesForDistance, degreesForTurn, loadRobot, WHEEL_PRESETS } from '../lib/robot';

/** One entry in the command palette. */
export interface Command {
  label: string;
  section: string;
  icon?: string;
  shortcut?: string;
  run(): void;
}

/** Ctrl+K: every command, block, example and tutorial, searchable. */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose(): void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const hits = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands
      .filter((c) => words.every((w) => `${c.section} ${c.label}`.toLowerCase().includes(w)))
      .slice(0, 60);
  }, [commands, query]);
  const choose = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };
  return (
    <Dialog title="Command palette" icon="application_xp_terminal" width={520} onClose={onClose}>
      <input
        className="text-input"
        style={{ width: '100%' }}
        autoFocus
        aria-label="Type a command"
        placeholder="Type a command, block, example or tutorial…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(hits.length - 1, a + 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
          else if (e.key === 'Enter') choose(hits[active]);
          else return;
          e.preventDefault();
        }}
      />
      <ul className="pick-list" role="listbox" aria-label="Commands">
        {hits.map((c, i) => (
          <li
            key={`${c.section}:${c.label}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : ''}
            onClick={() => choose(c)}
            onMouseEnter={() => setActive(i)}
          >
            <img src={iconUrl(c.icon ?? 'cursor')} alt="" />
            <strong>{c.label}</strong>
            <span>{c.section}</span>
            {c.shortcut && <kbd>{c.shortcut}</kbd>}
          </li>
        ))}
        {hits.length === 0 && <li className="empty">No matching command.</li>}
      </ul>
    </Dialog>
  );
}

/** Tools → Check program: tips about things that are allowed but probably unintended. */
export function CheckerDialog({ onClose }: { onClose(): void }) {
  const { state, dispatch, issues } = useEditor();
  const tips = checkProgram(state.program);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const select = (id: string | null) => {
    if (!id) return;
    const found = findBlock(state.program, id);
    if (found)
      dispatch({
        type: 'openTab',
        tab: found.ref.root.startsWith('main') ? 'main' : found.ref.root,
      });
    dispatch({ type: 'select', id });
    onClose();
  };
  const rows = [
    ...errors.map((i) => ({ icon: 'exclamation', id: i.blockId, message: i.message })),
    ...warnings.map((i) => ({ icon: 'error', id: i.blockId, message: i.message })),
    ...tips.map((t) => ({ icon: 'lightbulb', id: t.blockId, message: t.message })),
  ];
  return (
    <Dialog title="Check program" icon="tick" width={520} onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        {rows.length === 0
          ? 'Nothing to report: the program looks fine.'
          : `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}, ${tips.length} tip${tips.length === 1 ? '' : 's'}. Click one to go to its block.`}
      </p>
      {rows.length > 0 && (
        <ul className="pick-list" aria-label="Findings">
          {rows.map((r, i) => {
            const block = r.id ? findBlock(state.program, r.id)?.block : undefined;
            return (
              <li key={i} onClick={() => select(r.id)}>
                <img src={iconUrl(r.icon)} alt="" />
                <span style={{ whiteSpace: 'normal', color: 'inherit', fontSize: 12 }}>
                  {block && <strong>{labelOf(block)}: </strong>}
                  {r.message}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

/** Tools → Distance and turn calculator, with "apply to the selected Move block". */
export function CalculatorDialog({
  onClose,
  onRobotSetup,
}: {
  onClose(): void;
  onRobotSetup(): void;
}) {
  const { state, dispatch } = useEditor();
  const robot = loadRobot();
  const [wheel, setWheel] = useState(robot.wheelDiameter);
  const [track, setTrack] = useState(robot.track);
  const [distance, setDistance] = useState(30);
  const [angle, setAngle] = useState(90);
  const [kind, setKind] = useState<'spin' | 'pivot'>('spin');
  const setup = { ...robot, wheelDiameter: wheel, track };
  const straight = Math.round(degreesForDistance(distance, setup));
  const turn = Math.round(degreesForTurn(angle, setup, kind));
  const selected = state.selected ? findBlock(state.program, state.selected)?.block : undefined;
  const move = selected?.kind === 'move' ? selected : undefined;
  const apply = (degrees: number, steering: number) => {
    if (!move) return;
    const id = move.id;
    dispatch({
      type: 'edit',
      update: (p) =>
        updateBlock(p, id, (b) =>
          b.kind === 'move' ? { ...b, steering, duration: { unit: 'degrees', value: degrees } } : b,
        ),
    });
  };
  const num = (v: number, set: (n: number) => void, label: string, step = 1) => (
    <input
      className="num-input"
      type="number"
      step={step}
      aria-label={label}
      value={v}
      onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && set(e.target.valueAsNumber)}
    />
  );
  return (
    <Dialog title="Distance and turn calculator" icon="calculator" width={460} onClose={onClose}>
      <fieldset className="groupbox">
        <legend>Robot</legend>
        <div className="log-setup">
          <label>
            Wheel{' '}
            <select
              value={wheel}
              onChange={(e) => setWheel(Number(e.target.value))}
              aria-label="Wheel"
            >
              {WHEEL_PRESETS.map(([name, d]) => (
                <option key={name} value={d}>
                  {name}
                </option>
              ))}
              {!WHEEL_PRESETS.some(([, d]) => d === wheel) && (
                <option value={wheel}>{wheel} cm</option>
              )}
            </select>
          </label>
          <label>Track {num(track, setTrack, 'Track width in cm', 0.5)} cm</label>
          <button type="button" className="btn" style={{ minWidth: 0 }} onClick={onRobotSetup}>
            Robot setup…
          </button>
        </div>
      </fieldset>
      <fieldset className="groupbox">
        <legend>Drive straight</legend>
        <div className="log-setup">
          {num(distance, setDistance, 'Distance in cm')} cm =<strong>{straight}°</strong>(
          {(straight / 360).toFixed(2)} rotations)
          <button type="button" className="btn" disabled={!move} onClick={() => apply(straight, 0)}>
            Use in Move
          </button>
        </div>
      </fieldset>
      <fieldset className="groupbox">
        <legend>Turn</legend>
        <div className="log-setup">
          {num(angle, setAngle, 'Turn angle in degrees')}° as a
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'spin' | 'pivot')}
            aria-label="Kind of turn"
          >
            <option value="spin">spin (steering 100)</option>
            <option value="pivot">pivot (steering 50)</option>
          </select>
          =<strong>{turn}°</strong>
          <button
            type="button"
            className="btn"
            disabled={!move}
            onClick={() => apply(turn, (angle < 0 ? -1 : 1) * (kind === 'spin' ? 100 : 50))}
          >
            Use in Move
          </button>
        </div>
      </fieldset>
      <p className="sim-muted">
        {move
          ? 'Use in Move sets the selected Move block’s steering and degrees.'
          : 'Select a Move block to use these numbers in it.'}{' '}
        Real robots slip a little: try it and adjust.
      </p>
      <p className="sim-muted">
        <img src={iconUrl('information')} alt="" style={{ width: 12, verticalAlign: -2 }} />{' '}
        Negative angles turn the other way.
      </p>
    </Dialog>
  );
}
