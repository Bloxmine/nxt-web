import { useEffect, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { friendlyError } from '../brick/errors';
import { formatBytes } from '../lib/format';
import { iconUrl } from '../lib/icons';
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

/** Picks one local file. */
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
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

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

  const sel = selected;
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
          disabled={!client || !sel}
          onClick={() =>
            window.confirm(`Delete ${sel} from the brick?`) &&
            void run(`Deleting ${sel}…`, async () => {
              await client!.deleteFile(sel!);
              setSelected(null);
              setReload((n) => n + 1);
            })
          }
        >
          <img src={iconUrl('bin')} alt="" /> Delete
        </button>
      </div>
      {client ? (
        <div className="list-box" style={{ maxHeight: 220, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {files === null ? (
                <tr>
                  <td colSpan={2}>Loading…</td>
                </tr>
              ) : files.length === 0 ? (
                <tr>
                  <td colSpan={2}>No files on the brick.</td>
                </tr>
              ) : (
                files.map((f) => (
                  <tr
                    key={f.name}
                    className={sel === f.name ? 'selected-row' : ''}
                    aria-selected={sel === f.name}
                    tabIndex={0}
                    onClick={() => setSelected(f.name)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelected(f.name)}
                    onDoubleClick={() =>
                      void run(`Reading ${f.name}…`, async () =>
                        setPreview({ name: f.name, bytes: await client.downloadFile(f.name) }),
                      )
                    }
                  >
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
