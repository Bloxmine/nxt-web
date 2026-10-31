import { useEffect, useState } from 'react';
import { useBrick } from '../brick/BrickContext';
import { iconUrl } from '../lib/icons';
import { listMedia, MEDIA_CHANGED } from '../lib/media';

const OTHER = '\u0000other';
const strip = (name: string, ext: string) => name.replace(new RegExp(`\\.${ext}$`, 'i'), '');

/**
 * Picks a picture (.ric) or sound (.rso) file by name: the files on the connected brick
 * and the ones made in this browser, or any other name typed in.
 */
export function FileChoice({
  value,
  extension,
  label,
  onChange,
}: {
  /** File name without the extension. */
  value: string;
  extension: 'ric' | 'rso';
  label: string;
  onChange(name: string): void;
}) {
  const brick = useBrick();
  const client = brick.client;
  const [onBrick, setOnBrick] = useState<string[] | null>(null);
  const [local, setLocal] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    const load = () =>
      void listMedia().then(
        (files) =>
          live &&
          setLocal(
            files
              .filter((f) => f.name.toLowerCase().endsWith(`.${extension}`))
              .map((f) => strip(f.name, extension)),
          ),
      );
    load();
    window.addEventListener(MEDIA_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(MEDIA_CHANGED, load);
    };
  }, [extension]);

  useEffect(() => {
    if (!client) return;
    let live = true;
    client
      .listFiles(`*.${extension}`)
      .then((files) => live && setOnBrick(files.map((f) => strip(f.name, extension))))
      .catch(() => live && setOnBrick(null));
    return () => {
      live = false;
    };
  }, [client, extension, reload]);

  const brickNames = client ? (onBrick ?? []) : [];
  const brickSet = new Set(brickNames.map((n) => n.toLowerCase()));
  const localOnly = local.filter((n) => !brickSet.has(n.toLowerCase()));
  const known = new Set([...brickNames, ...local].map((n) => n.toLowerCase()));
  const kind = extension === 'ric' ? 'pictures' : 'sounds';

  if (typing) {
    return (
      <>
        <input
          className="text-input"
          aria-label={label}
          value={value}
          maxLength={15}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="tool-btn"
          title={`Choose from the list of ${kind}`}
          aria-label={`Choose from the list of ${kind}`}
          onClick={() => setTyping(false)}
        >
          <img src={iconUrl('application_view_tile')} alt="" />
        </button>
      </>
    );
  }

  return (
    <>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => {
          if (e.target.value === OTHER) setTyping(true);
          else onChange(e.target.value);
        }}
      >
        {client && (
          <optgroup label={onBrick ? 'On the brick' : 'On the brick (reading…)'}>
            {brickNames.map((n) => (
              <option key={`b:${n}`} value={n}>
                {n}
              </option>
            ))}
          </optgroup>
        )}
        {localOnly.length > 0 && (
          <optgroup label={client ? 'Made here, not on the brick yet' : 'Made in this browser'}>
            {localOnly.map((n) => (
              <option key={`l:${n}`} value={n}>
                {n}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Other">
          {value && !known.has(value.toLowerCase()) && <option value={value}>{value}</option>}
          <option value={OTHER}>Type a name…</option>
        </optgroup>
      </select>
      {client && (
        <button
          type="button"
          className="tool-btn"
          title={`Read the list of ${kind} from the brick again`}
          aria-label={`Refresh the list of ${kind}`}
          onClick={() => setReload((r) => r + 1)}
        >
          <img src={iconUrl('arrow_refresh')} alt="" />
        </button>
      )}
    </>
  );
}
