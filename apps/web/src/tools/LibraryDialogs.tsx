import { iconOf, walk, type Block, type Clip, type Program } from '@nxt/blocks';
import { useEffect, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { iconUrl } from '../lib/icons';
import {
  listLibrary,
  listSnippets,
  newLibraryId,
  removeFromLibrary,
  saveToLibrary,
  updateSnippets,
  type LibraryEntry,
  type Snippet,
} from '../lib/library';

/** A few block icons as a preview. */
function Strip({ blocks }: { blocks: readonly Block[] }) {
  const icons: string[] = [];
  walk(blocks, (b) => {
    if (icons.length < 10) icons.push(iconOf(b));
  });
  return (
    <span className="gallery-strip mini" aria-hidden="true">
      {icons.map((i, k) => (
        <img key={k} src={iconUrl(i)} alt="" />
      ))}
    </span>
  );
}

function count(blocks: readonly Block[]): number {
  let n = 0;
  walk(blocks, () => n++);
  return n;
}

/** File → Library: every program worked on in this browser. */
export function LibraryDialog({
  currentId,
  onOpen,
  onClose,
}: {
  currentId: string;
  onOpen(entry: LibraryEntry): void;
  onClose(): void;
}) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    void listLibrary().then(setEntries);
  }, []);
  const shown = (entries ?? []).filter((e) =>
    e.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <Dialog title="Program library" icon="folder" width={620} onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        Every program you work on is kept here automatically, in this browser. Save to a file to
        keep a copy elsewhere.
      </p>
      <input
        className="text-input"
        style={{ width: '100%' }}
        placeholder="Search by name"
        aria-label="Search programs"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="pick-list library" aria-label="Programs">
        {entries === null && <li className="empty">Loading…</li>}
        {entries?.length === 0 && (
          <li className="empty">The library is empty: start a program and it appears here.</li>
        )}
        {shown.map((e) => (
          <li
            key={e.id}
            className={e.id === currentId ? 'active' : ''}
            onDoubleClick={() => onOpen(e)}
          >
            <img src={iconUrl('brick')} alt="" />
            <strong>{e.name}</strong>
            <Strip blocks={e.program.body} />
            <span>
              {new Date(e.savedAt).toLocaleString()} · {count(e.program.body)} blocks
              {e.id === currentId ? ' · open now' : ''}
            </span>
            <button type="button" className="btn" style={{ minWidth: 0 }} onClick={() => onOpen(e)}>
              Open
            </button>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              title="Duplicate"
              onClick={() =>
                void saveToLibrary(newLibraryId(), {
                  ...e.program,
                  name: `${e.program.name.slice(0, 11)} (2)`,
                })
                  .then(listLibrary)
                  .then(setEntries)
              }
            >
              <img src={iconUrl('page_copy')} alt="Duplicate" />
            </button>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              title="Rename"
              onClick={() => {
                const name = window.prompt('New name:', e.name)?.trim().slice(0, 15);
                if (name)
                  void saveToLibrary(e.id, { ...e.program, name })
                    .then(listLibrary)
                    .then(setEntries);
              }}
            >
              <img src={iconUrl('textfield')} alt="Rename" />
            </button>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              title="Delete"
              disabled={e.id === currentId}
              onClick={() =>
                window.confirm(`Delete "${e.name}" from the library?`) &&
                void removeFromLibrary(e.id).then(setEntries)
              }
            >
              <img src={iconUrl('bin')} alt="Delete" />
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Edit → Snippets: saved groups of blocks to insert again. */
export function SnippetsDialog({
  onInsert,
  onClose,
}: {
  onInsert(clip: Clip): void;
  onClose(): void;
}) {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  useEffect(() => {
    void listSnippets().then(setSnippets);
  }, []);
  const change = (next: Snippet[]) => {
    setSnippets(next);
    void updateSnippets(next);
  };
  return (
    <Dialog title="Snippets" icon="page_white_text" width={520} onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        Select blocks and choose Edit → Save selection as snippet to add one. Insert puts a copy
        after the selected block.
      </p>
      <ul className="pick-list" aria-label="Snippets">
        {snippets?.length === 0 && <li className="empty">No snippets yet.</li>}
        {snippets?.map((s) => (
          <li key={s.id}>
            <img src={iconUrl('page_white_text')} alt="" />
            <strong>{s.name}</strong>
            <Strip blocks={s.clip.blocks} />
            <span>{count(s.clip.blocks)} blocks</span>
            <button
              type="button"
              className="btn primary"
              style={{ minWidth: 0 }}
              onClick={() => {
                onInsert(s.clip);
                onClose();
              }}
            >
              Insert
            </button>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              title="Rename"
              onClick={() => {
                const name = window.prompt('Snippet name:', s.name)?.trim();
                if (name) change((snippets ?? []).map((x) => (x.id === s.id ? { ...x, name } : x)));
              }}
            >
              <img src={iconUrl('textfield')} alt="Rename" />
            </button>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 0 }}
              title="Delete"
              onClick={() => change((snippets ?? []).filter((x) => x.id !== s.id))}
            >
              <img src={iconUrl('bin')} alt="Delete" />
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export type { Program };
