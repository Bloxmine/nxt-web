import { useEffect, useRef, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { formatBytes } from '../lib/format';
import { iconUrl } from '../lib/icons';
import { rememberMedia } from '../lib/media';
import { audioToRso, brickFileName, imageToRic, pickFile, saveFile } from './convert';
import { FilePreview } from './FilePreview';

const ICONS: Record<string, string> = {
  rxe: 'brick',
  rso: 'music',
  ric: 'picture',
  txt: 'page_white_text',
  rpg: 'brick',
  rtm: 'brick',
  sys: 'cog',
  cal: 'ruler',
};
const iconFor = (name: string) =>
  ICONS[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'page_white_text';

/** One file waiting to be deleted, being deleted, or done. */
interface Deletion {
  name: string;
  state: 'waiting' | 'deleting' | 'done' | 'failed';
  error?: string;
}

/**
 * Turns a local file into what the brick needs: audio becomes .rso, images become .ric,
 * brick files are kept as they are.
 */
async function prepare(file: File): Promise<{ name: string; bytes: Uint8Array }> {
  if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a)$/i.test(file.name)) {
    return { name: brickFileName(file.name, 'rso'), bytes: await audioToRso(file) };
  }
  if (file.type.startsWith('image/')) {
    return { name: brickFileName(file.name, 'ric'), bytes: (await imageToRic(file)).bytes };
  }
  const ext = file.name.split('.').pop() ?? 'txt';
  return {
    name: brickFileName(file.name, ext.slice(0, 3)),
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

/**
 * The NXT window's Files tab: list, upload (converting sounds and pictures), download,
 * delete, run programs and preview sounds, pictures and text. Works without a brick for
 * converting and previewing local files.
 */
export function FileManager() {
  const brick = useBrick();
  const client = brick.client;
  const [files, setFiles] = useState<{ name: string; size: number }[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  // Pictures and sounds that pass through here become choices in Display and Sound blocks.
  useEffect(() => {
    if (preview) void rememberMedia(preview.name, preview.bytes);
  }, [preview]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  /** Files ticked for deleting (Ctrl/Shift-click or the boxes). */
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  /** The delete queue: files go one at a time, in order. */
  const [deletions, setDeletions] = useState<Deletion[]>([]);
  const cancelDeletes = useRef(false);
  const deleting = deletions.some((d) => d.state === 'waiting' || d.state === 'deleting');

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    client
      .listFiles('*.*')
      .then((list) => !cancelled && setFiles(list.sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e: unknown) => !cancelled && setError(friendlyError(e)));
    return () => {
      cancelled = true;
    };
  }, [client, reload]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setError(null);
    setStatus(label);
    try {
      await fn();
      setStatus(null);
    } catch (e) {
      setStatus(null);
      setError(friendlyError(e) ?? String(e));
    }
  };

  const upload = () =>
    void pickFile('*/*').then(
      (file) =>
        file &&
        run(`Preparing ${file.name}…`, async () => {
          const { name, bytes } = await prepare(file);
          await client!.uploadFile(name, bytes, (sent, total) =>
            setStatus(`Sending ${name}: ${Math.round((sent / total) * 100)}%`),
          );
          setPreview({ name, bytes });
          setSelected(name);
          setReload((n) => n + 1);
        }),
    );

  const convertOnly = () =>
    void pickFile('audio/*,image/*').then(
      (file) =>
        file &&
        run(`Converting ${file.name}…`, async () => {
          const { name, bytes } = await prepare(file);
          setPreview({ name, bytes });
          saveFile(name, bytes);
        }),
    );

  const openLocal = () =>
    void pickFile('.rso,.ric,.txt').then(
      (file) =>
        file &&
        void file
          .arrayBuffer()
          .then((b) => setPreview({ name: file.name, bytes: new Uint8Array(b) })),
    );

  /** Clicking a row selects it; Ctrl/⌘ toggles it in the ticked set; Shift ticks a range. */
  const clickRow = (name: string, e: React.MouseEvent) => {
    setSelected(name);
    if (e.shiftKey && anchor && files) {
      const names = files.map((f) => f.name);
      const from = Math.min(names.indexOf(anchor), names.indexOf(name));
      const to = Math.max(names.indexOf(anchor), names.indexOf(name));
      setChecked((c) => new Set([...c, ...names.slice(from, to + 1)]));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setChecked((c) => {
        const next = new Set(c);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    }
    setAnchor(name);
  };

  const toggle = (name: string) =>
    setChecked((c) => {
      const next = new Set(c);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  /** Deletes the files one after the other; Stop leaves the rest. */
  const deleteQueued = async (names: string[]) => {
    if (!client || names.length === 0) return;
    const list =
      names.length <= 12
        ? names.join('\n')
        : `${names.slice(0, 12).join('\n')}\n… and ${names.length - 12} more`;
    if (
      !window.confirm(
        `Delete ${names.length === 1 ? 'this file' : `these ${names.length} files`} from the brick?\n\n${list}`,
      )
    )
      return;
    setError(null);
    cancelDeletes.current = false;
    setDeletions(names.map((name) => ({ name, state: 'waiting' })));
    for (const name of names) {
      if (cancelDeletes.current) break;
      setDeletions((q) => q.map((d) => (d.name === name ? { ...d, state: 'deleting' } : d)));
      try {
        await client.deleteFile(name);
        setDeletions((q) => q.map((d) => (d.name === name ? { ...d, state: 'done' } : d)));
      } catch (e) {
        const message = friendlyError(e) ?? String(e);
        setDeletions((q) =>
          q.map((d) => (d.name === name ? { ...d, state: 'failed', error: message } : d)),
        );
      }
    }
    if (cancelDeletes.current) {
      setDeletions((q) => q.filter((d) => d.state !== 'waiting'));
    }
    setChecked(new Set());
    setSelected(null);
    setReload((n) => n + 1);
    void brick.refresh();
  };

  const sel = selected;
  const toDelete = checked.size > 0 ? [...checked] : sel ? [sel] : [];
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          <img src={iconUrl('exclamation')} alt="" />
          <span>{error}</span>
        </div>
      )}
      <div className="file-toolbar">
        <button
          type="button"
          className="btn"
          disabled={!client}
          onClick={upload}
          title="Sounds (WAV, MP3…) become .rso, pictures become .ric"
        >
          <img src={iconUrl('page_white_put')} alt="" /> Upload…
        </button>
        <button
          type="button"
          className="btn"
          disabled={!client || !sel}
          onClick={() =>
            void run(`Downloading ${sel}…`, async () => {
              const bytes = await client!.downloadFile(sel!, (got, total) =>
                setStatus(`Downloading ${sel}: ${Math.round((got / total) * 100)}%`),
              );
              saveFile(sel!, bytes);
              setPreview({ name: sel!, bytes });
            })
          }
        >
          <img src={iconUrl('page_white_get')} alt="" /> Download
        </button>
        <button
          type="button"
          className="btn"
          disabled={!client || !sel}
          onClick={() =>
            void run(`Reading ${sel}…`, async () =>
              setPreview({ name: sel!, bytes: await client!.downloadFile(sel!) }),
            )
          }
        >
          <img src={iconUrl('eye')} alt="" /> Preview
        </button>
        <button
          type="button"
          className="btn"
          disabled={!client || !sel || !sel.toLowerCase().endsWith('.rxe')}
          onClick={() => void run(`Starting ${sel}…`, () => client!.startProgram(sel!))}
        >
          <img src={iconUrl('control_play')} alt="" /> Run
        </button>
        <button
          type="button"
          className="btn"
          disabled={!client || toDelete.length === 0 || deleting}
          title="Deletes the ticked files (or the selected one), one at a time"
          onClick={() => void deleteQueued(toDelete)}
        >
          <img src={iconUrl('bin')} alt="" /> Delete
          {checked.size > 1 ? ` ${checked.size}` : ''}
        </button>
      </div>
      {client ? (
        <div className="list-box" style={{ maxHeight: 220, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th className="check-cell">
                  <input
                    type="checkbox"
                    aria-label="Tick all files"
                    title="Tick all"
                    disabled={!files || files.length === 0 || deleting}
                    checked={!!files && files.length > 0 && checked.size === files.length}
                    ref={(el) => {
                      if (el)
                        el.indeterminate = checked.size > 0 && checked.size < (files?.length ?? 0);
                    }}
                    onChange={(e) =>
                      setChecked(
                        e.target.checked && files ? new Set(files.map((f) => f.name)) : new Set(),
                      )
                    }
                  />
                </th>
                <th>File</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {files === null ? (
                <tr>
                  <td colSpan={3}>Loading…</td>
                </tr>
              ) : files.length === 0 ? (
                <tr>
                  <td colSpan={3}>No files on the brick.</td>
                </tr>
              ) : (
                files.map((f) => (
                  <tr
                    key={f.name}
                    className={`${sel === f.name ? 'selected-row' : ''} ${checked.has(f.name) ? 'checked-row' : ''}`}
                    aria-selected={sel === f.name}
                    tabIndex={0}
                    onClick={(e) => clickRow(f.name, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelected(f.name);
                      if (e.key === ' ') {
                        e.preventDefault();
                        toggle(f.name);
                      }
                    }}
                    onDoubleClick={() =>
                      void run(`Reading ${f.name}…`, async () =>
                        setPreview({ name: f.name, bytes: await client.downloadFile(f.name) }),
                      )
                    }
                  >
                    <td className="check-cell" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Tick ${f.name}`}
                        disabled={deleting}
                        checked={checked.has(f.name)}
                        onChange={() => toggle(f.name)}
                      />
                    </td>
                    <td>
                      <img src={iconUrl(iconFor(f.name))} alt="" className="file-icon" /> {f.name}
                    </td>
                    <td>{formatBytes(f.size)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          Connect a brick to see its files. You can still convert and preview files on this
          computer.
        </p>
      )}
      <div className="file-toolbar">
        {client && (
          <span className="sim-muted">
            Free: {brick.summary ? formatBytes(brick.summary.freeFlashBytes) : '…'}
          </span>
        )}
        <button
          type="button"
          className="btn"
          disabled={!client}
          onClick={() => setReload((n) => n + 1)}
        >
          <img src={iconUrl('arrow_refresh')} alt="" /> Refresh
        </button>
        <button
          type="button"
          className="btn"
          onClick={convertOnly}
          title="Make an .rso or .ric file on this computer"
        >
          <img src={iconUrl('sound_add')} alt="" /> Convert sound/picture…
        </button>
        <button type="button" className="btn" onClick={openLocal}>
          <img src={iconUrl('folder')} alt="" /> Open local .rso/.ric…
        </button>
      </div>
      {client && files && files.length > 0 && (
        <p className="sim-muted" style={{ margin: '2px 0' }}>
          Tick files (or Ctrl-click, Shift-click a range) to delete several at once.
        </p>
      )}
      {deletions.length > 0 && (
        <fieldset className="groupbox delete-queue">
          <legend>
            Deleting {deletions.filter((d) => d.state === 'done').length} of {deletions.length}
          </legend>
          <ul>
            {deletions.map((d) => (
              <li key={d.name} className={d.state}>
                <img
                  src={iconUrl(
                    d.state === 'done'
                      ? 'tick'
                      : d.state === 'failed'
                        ? 'exclamation'
                        : d.state === 'deleting'
                          ? 'hourglass'
                          : 'clock',
                  )}
                  alt=""
                />
                {d.name}
                {d.state === 'failed' && <span className="sim-muted"> — {d.error}</span>}
              </li>
            ))}
          </ul>
          {deleting ? (
            <button type="button" className="btn" onClick={() => (cancelDeletes.current = true)}>
              <img src={iconUrl('control_stop')} alt="" /> Stop after this file
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => setDeletions([])}>
              OK
            </button>
          )}
        </fieldset>
      )}
      {status && <p role="status">{status}</p>}
      {preview && (
        <fieldset className="groupbox">
          <legend>{preview.name}</legend>
          <FilePreview name={preview.name} bytes={preview.bytes} />
        </fieldset>
      )}
    </>
  );
}
