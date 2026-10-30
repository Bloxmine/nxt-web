import { EXAMPLES, iconOf, walk, type Block, type Example } from '@nxt/blocks';
import { SCENARIOS } from '@nxt/sim';
import { useMemo, useState } from 'react';
import { iconUrl } from '../lib/icons';
import { Dialog } from './Dialog';

const LEVELS = [
  ['all', 'All'],
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
] as const;

/** Up to eight block icons, in program order, as a preview of the program. */
function iconStrip(example: Example): string[] {
  const icons: string[] = [];
  walk(example.create().body, (b: Block) => {
    if (icons.length < 8) icons.push(iconOf(b));
  });
  return icons;
}

/** File → Example gallery: example programs as cards, by level. */
export function Gallery({
  onOpen,
  onClose,
}: {
  onOpen(example: Example, simulate: boolean): void;
  onClose(): void;
}) {
  const [level, setLevel] = useState<(typeof LEVELS)[number][0]>('all');
  const strips = useMemo(() => new Map(EXAMPLES.map((e) => [e.key, iconStrip(e)])), []);
  const shown = EXAMPLES.filter((e) => level === 'all' || e.level === level);
  return (
    <Dialog title="Example gallery" icon="star" width={760} onClose={onClose}>
      <div className="dialog-tabs" role="tablist">
        {LEVELS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={level === key}
            className={`dialog-tab ${level === key ? 'active' : ''}`}
            onClick={() => setLevel(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="gallery" role="list">
        {shown.map((e) => {
          const mat = SCENARIOS.find((s) => s.id === e.mat);
          return (
            <article key={e.key} className="gallery-card" role="listitem">
              <header>
                <strong>{e.name}</strong>
                {e.level && <span className={`level ${e.level}`}>{e.level}</span>}
              </header>
              <div className="gallery-strip" aria-hidden="true">
                {strips.get(e.key)!.map((icon, i) => (
                  <img key={i} src={iconUrl(icon)} alt="" />
                ))}
              </div>
              <p>{e.description}</p>
              <p className="gallery-meta">
                {mat && (
                  <span>
                    <img src={iconUrl('map')} alt="" /> {mat.name}
                  </span>
                )}
                {(e.topics ?? []).map((t) => (
                  <span key={t} className="topic">
                    {t}
                  </span>
                ))}
              </p>
              <footer>
                <button type="button" className="btn" onClick={() => onOpen(e, false)}>
                  Open
                </button>
                <button type="button" className="btn primary" onClick={() => onOpen(e, true)}>
                  <img src={iconUrl('car')} alt="" /> Open in simulator
                </button>
              </footer>
            </article>
          );
        })}
      </div>
    </Dialog>
  );
}
