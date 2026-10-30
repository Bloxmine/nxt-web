import {
  COMMON_PALETTE,
  COMPLETE_PALETTE,
  PALETTE,
  WAIT_PRESETS,
  type PaletteEntry,
} from '@nxt/blocks';
import { useEffect, useRef, useState } from 'react';
import { endDrag, startDrag } from '../editor/drag';
import { useEditor } from '../editor/EditorContext';
import { iconUrl } from '../lib/icons';

type Tab = 'common' | 'complete' | 'custom';

interface Flyout {
  title: string;
  top: number;
  entries: PaletteEntry[];
}

/** The block palette on the left, with Common / Complete / Custom tabs. */
export function Palette() {
  const { state } = useEditor();
  const [tab, setTab] = useState<Tab>('common');
  const [flyout, setFlyout] = useState<Flyout | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flyout) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setFlyout(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [flyout]);

  const openFlyout = (title: string, keys: string[], button: HTMLElement) => {
    const top = button.offsetTop - (ref.current?.querySelector('.palette-items')?.scrollTop ?? 0);
    setFlyout({ title, top, entries: keys.map((k) => PALETTE[k]!).filter(Boolean) });
  };

  return (
    <div className="palette" ref={ref}>
      <div className="palette-title">
        {tab === 'common' ? 'Common' : tab === 'complete' ? 'Complete' : 'Custom'}
      </div>
      <div className="palette-items" onScroll={() => setFlyout(null)}>
        {tab === 'common' &&
          COMMON_PALETTE.map((key) => {
            const entry = PALETTE[key]!;
            const isWait = key === 'wait-time';
            return (
              <PaletteButton
                key={key}
                entry={entry}
                label={isWait ? 'Wait (click for more)' : entry.label}
                more={isWait}
                onClick={isWait ? (el) => openFlyout('Wait', WAIT_PRESETS, el) : undefined}
                onDragStart={() => setFlyout(null)}
              />
            );
          })}
        {tab === 'complete' &&
          COMPLETE_PALETTE.map((group) => (
            <button
              key={group.category}
              type="button"
              className={`palette-btn cat-${group.category} ${flyout?.title === group.label ? 'active' : ''}`}
              title={group.label}
              aria-label={`${group.label} blocks`}
              onClick={(e) => openFlyout(group.label, group.entries, e.currentTarget)}
              onMouseEnter={(e) => openFlyout(group.label, group.entries, e.currentTarget)}
            >
              <img src={iconUrl(group.icon, 32)} alt="" />
              <span className="more">▸</span>
            </button>
          ))}
        {tab === 'custom' &&
          (state.program.myBlocks.length === 0 ? (
            <div className="palette-empty">
              No My Blocks yet. Select a block and use Edit → Make a new My Block.
            </div>
          ) : (
            state.program.myBlocks.map((m) => (
              <button
                key={m.id}
                type="button"
                className="palette-btn cat-custom"
                title={m.name}
                aria-label={`My Block ${m.name}`}
                draggable
                onDragStart={(e) => startDrag(e, { type: 'myBlock', ref: m.id })}
                onDragEnd={endDrag}
              >
                <img src={iconUrl('bricks', 32)} alt="" draggable={false} />
              </button>
            ))
          ))}
      </div>
      <div className="palette-tabs" role="tablist">
        {(
          [
            ['common', 'star', 'Common palette'],
            ['complete', 'bricks', 'Complete palette'],
            ['custom', 'user', 'Custom palette (My Blocks)'],
          ] as const
        ).map(([key, icon, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`palette-tab ${tab === key ? 'active' : ''}`}
            title={label}
            aria-label={label}
            onClick={() => {
              setTab(key);
              setFlyout(null);
            }}
          >
            <img src={iconUrl(icon)} alt="" />
          </button>
        ))}
      </div>
      {flyout && (
        <div className="flyout" style={{ top: flyout.top + 24 }}>
          <div className="flyout-title">{flyout.title}</div>
          {flyout.entries.map((entry) => (
            <PaletteButton
              key={entry.key}
              entry={entry}
              label={entry.label}
              onDragStart={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PaletteButton({
  entry,
  label,
  more,
  onClick,
  onDragStart,
}: {
  entry: PaletteEntry;
  label: string;
  more?: boolean;
  onClick?: ((el: HTMLElement) => void) | undefined;
  onDragStart(): void;
}) {
  return (
    <button
      type="button"
      className={`palette-btn cat-${entry.category}`}
      title={`${label}: ${entry.help}`}
      aria-label={label}
      draggable
      onClick={onClick ? (e) => onClick(e.currentTarget) : undefined}
      onMouseEnter={onClick ? (e) => onClick(e.currentTarget) : undefined}
      onDragStart={(e) => {
        onDragStart();
        startDrag(e, { type: 'palette', key: entry.key });
      }}
      onDragEnd={endDrag}
    >
      <img src={iconUrl(entry.icon, 32)} alt="" draggable={false} />
      {more && <span className="more">▸</span>}
    </button>
  );
}
