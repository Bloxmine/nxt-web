import {
  COMPLETE_PALETTE,
  connect,
  findBlock,
  plugsOf,
  PALETTE,
  roots,
  walk,
  labelOf,
  type Block,
  type Program,
} from '@nxt/blocks';
import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';
import { searchProgram, type SearchHit } from '../lib/search';
import { deleteVersion, listVersions, saveVersion, type SavedVersion } from '../lib/versions';
import { Dialog } from './Dialog';

/** Opens the hit's tab, selects its block and scrolls it into view. */
function useReveal() {
  const { dispatch } = useEditor();
  return (hit: Pick<SearchHit, 'tab' | 'blockId'>) => {
    dispatch({ type: 'openTab', tab: hit.tab });
    if (hit.blockId) dispatch({ type: 'select', id: hit.blockId });
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-block-id="${CSS.escape(hit.blockId ?? '')}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'center' }),
    );
  };
}

/** Edit → Find (Ctrl+F): blocks, variables and comments. */
export function SearchDialog({ onClose }: { onClose(): void }) {
  const { state } = useEditor();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const hits = useMemo(() => searchProgram(state.program, query), [state.program, query]);
  const reveal = useReveal();
  const choose = (hit: SearchHit | undefined) => {
    if (!hit) return;
    reveal(hit);
    onClose();
  };
  const icon = (h: SearchHit) =>
    h.kind === 'variable' ? 'tag_red' : h.kind === 'comment' ? 'comment' : 'brick';

  return (
    <Dialog title="Find" icon="magnifier_zoom_in" width={460} onClose={onClose}>
      <input
        className="text-input"
        style={{ width: '100%' }}
        autoFocus
        placeholder="Block, setting, variable or comment"
        aria-label="Search the program"
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
      <ul className="pick-list" role="listbox" aria-label="Results">
        {hits.map((h, i) => (
          <li
            key={`${h.kind}${h.blockId ?? ''}${h.title}${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : ''}
            onClick={() => choose(h)}
          >
            <img src={iconUrl(icon(h))} alt="" />
            <strong>{h.title}</strong>
            <span>{h.detail}</span>
          </li>
        ))}
        {query.trim() && hits.length === 0 && <li className="empty">Nothing found.</li>}
      </ul>
    </Dialog>
  );
}

/** Insert a block by name (keyboard alternative to dragging from the palette). */
export function InsertDialog({
  onInsert,
  onClose,
}: {
  onInsert(block: Block): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const keys = [
    ...new Set([...COMPLETE_PALETTE.flatMap((g) => g.entries), ...Object.keys(PALETTE)]),
  ];
  const entries = keys
    .map((k) => PALETTE[k])
    .filter((e): e is NonNullable<typeof e> => !!e)
    .filter((e) =>
      `${e.label} ${e.category} ${e.help}`.toLowerCase().includes(query.trim().toLowerCase()),
    );
  const choose = (i: number) => {
    const entry = entries[i];
    if (!entry) return;
    onInsert(entry.create());
    onClose();
  };
  return (
    <Dialog title="Insert block" icon="brick_add" width={460} onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        The block goes after the selected block (or at the end of the beam).
      </p>
      <input
        className="text-input"
        style={{ width: '100%' }}
        autoFocus
        aria-label="Block name"
        placeholder="Move, Wait, Loop…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(entries.length - 1, a + 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
          else if (e.key === 'Enter') choose(active);
          else return;
          e.preventDefault();
        }}
      />
      <ul className="pick-list" role="listbox" aria-label="Blocks">
        {entries.map((e, i) => (
          <li
            key={e.key}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : ''}
            onClick={() => choose(i)}
          >
            <img src={iconUrl(e.icon)} alt="" />
            <strong>{e.label}</strong>
            <span>{e.help}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Blocks in program order with their plugs, for the wire dialog. */
function plugList(program: Program, side: 'in' | 'out') {
  const list: { value: string; label: string; type: string }[] = [];
  for (const r of roots(program)) {
    walk(r.blocks, (b) => {
      for (const p of plugsOf(b)) {
        if (side === 'out' ? p.output : p.input) {
          list.push({
            value: `${b.id}:${p.name}`,
            label: `${labelOf(b)} › ${p.label}`,
            type: p.type,
          });
        }
      }
    });
  }
  return list;
}

/** Connect a data wire without the mouse: pick an output and an input. */
export function WireDialog({ onClose }: { onClose(): void }) {
  const { state, dispatch } = useEditor();
  const selected = state.selected ? findBlock(state.program, state.selected)?.block : undefined;
  const outputs = plugList(state.program, 'out');
  const inputs = plugList(state.program, 'in');
  const mine = (v: string) => selected !== undefined && v.startsWith(`${selected.id}:`);
  const [from, setFrom] = useState(
    outputs.find((o) => mine(o.value))?.value ?? outputs[0]?.value ?? '',
  );
  const [to, setTo] = useState(inputs.find((i) => !mine(i.value))?.value ?? '');
  const [error, setError] = useState<string | null>(null);
  const split = (v: string) => {
    const i = v.indexOf(':');
    return { block: v.slice(0, i), plug: v.slice(i + 1) };
  };
  return (
    <Dialog
      title="Connect a data wire"
      icon="connect"
      width={480}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn primary"
            disabled={!from || !to}
            onClick={() => {
              try {
                const next = connect(
                  state.program,
                  { ...split(from), side: 'out' },
                  { ...split(to), side: 'in' },
                );
                dispatch({ type: 'edit', update: () => next });
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Connect
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="wire-from">From (output)</label>
        <select id="wire-from" value={from} onChange={(e) => setFrom(e.target.value)}>
          {outputs.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.type})
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="wire-to">To (input)</label>
        <select id="wire-to" value={to} onChange={(e) => setTo(e.target.value)}>
          {inputs.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.type})
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="notice error" role="alert">
          <img src={iconUrl('exclamation')} alt="" />
          <span>{error}</span>
        </div>
      )}
    </Dialog>
  );
}

/** Edit → History: undo steps to jump between, and versions saved in the browser. */
export function HistoryDialog({ onClose }: { onClose(): void }) {
  const { state, dispatch } = useEditor();
  const [tab, setTab] = useState<'undo' | 'versions'>('undo');
  const [versions, setVersions] = useState<SavedVersion[] | null>(null);
  useEffect(() => {
    if (tab === 'versions') void listVersions().then(setVersions);
  }, [tab]);
  const steps = [
    ...['Opened', ...state.pastLabels].map((label, i) => ({
      label,
      offset: i - state.pastLabels.length,
    })),
    ...state.futureLabels.map((label, i) => ({ label, offset: i + 1 })),
  ];
  const count = (p: Program) => {
    let n = 0;
    for (const r of roots(p)) walk(r.blocks, () => n++);
    return n;
  };
  return (
    <Dialog
      title="History"
      icon="clock"
      width={480}
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="dialog-tabs" role="tablist">
        {(
          [
            ['undo', 'Undo history'],
            ['versions', 'Saved versions'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`dialog-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel" role="tabpanel">
        {tab === 'undo' ? (
          <ul className="pick-list history" aria-label="Undo steps, oldest first">
            {steps.map((s, i) => (
              <li
                key={i}
                className={`${s.offset === 0 ? 'active' : ''} ${s.offset > 0 ? 'future' : ''}`}
                aria-current={s.offset === 0 ? 'step' : undefined}
                onClick={() => s.offset !== 0 && dispatch({ type: 'travel', steps: s.offset })}
              >
                <img src={iconUrl(s.offset > 0 ? 'arrow_redo' : 'arrow_undo')} alt="" />
                <strong>{s.label}</strong>
                {s.offset === 0 && <span>current</span>}
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              Copies are kept in this browser when you open or save a program and every few minutes
              while you work (the newest 30).
            </p>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void saveVersion(state.program, 'Saved by hand')
                  .then(listVersions)
                  .then(setVersions)
              }
            >
              <img src={iconUrl('diskette')} alt="" /> Keep a copy now
            </button>
            <ul className="pick-list" aria-label="Saved versions, newest first">
              {versions === null && <li className="empty">Loading…</li>}
              {versions?.length === 0 && <li className="empty">No saved versions yet.</li>}
              {versions?.map((v) => (
                <li key={v.at}>
                  <img src={iconUrl('clock')} alt="" />
                  <strong>{v.program.name}</strong>
                  <span>
                    {new Date(v.at).toLocaleString()} · {v.reason} · {count(v.program)} blocks
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ minWidth: 0 }}
                    onClick={() => {
                      void saveVersion(state.program, 'Before restoring an older version');
                      dispatch({ type: 'edit', update: () => v.program });
                      onClose();
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ minWidth: 0 }}
                    aria-label="Delete this version"
                    onClick={() => void deleteVersion(v.at).then(setVersions)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}
