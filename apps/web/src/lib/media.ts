import { loadValue, saveValue } from './storage';

/**
 * Pictures (.ric) and sounds (.rso) made or handled in this browser: drawn in the
 * picture editor, recorded, uploaded or downloaded. Block settings offer them by name,
 * and the simulator shows the pictures.
 */
export interface MediaFile {
  /** File name with extension, as on the brick. */
  name: string;
  bytes: Uint8Array;
  savedAt: string;
}

const KEY = 'media';
const MAX_FILES = 100;

/** Fired on `window` when the list changes. */
export const MEDIA_CHANGED = 'nxt-media-changed';

export async function listMedia(): Promise<MediaFile[]> {
  return (await loadValue<MediaFile[]>(KEY)) ?? [];
}

/** Saves run one after the other: each reads the list and writes it back. */
let queue: Promise<void> = Promise.resolve();

/** Remembers a .ric or .rso file (replacing one with the same name); other files are ignored. */
export function rememberMedia(name: string, bytes: Uint8Array): Promise<void> {
  if (!/\.(ric|rso)$/i.test(name)) return Promise.resolve();
  const copy = Uint8Array.from(bytes);
  queue = queue
    .then(async () => {
      const files = (await listMedia()).filter((f) => f.name.toLowerCase() !== name.toLowerCase());
      files.unshift({ name, bytes: copy, savedAt: new Date().toISOString() });
      await saveValue(KEY, files.slice(0, MAX_FILES));
      window.dispatchEvent(new Event(MEDIA_CHANGED));
    })
    .catch(() => {});
  return queue;
}

/** Picture files by lower-case name, for the simulator. */
export function picturesOf(files: MediaFile[]): Map<string, Uint8Array> {
  return new Map(
    files.filter((f) => /\.ric$/i.test(f.name)).map((f) => [f.name.toLowerCase(), f.bytes]),
  );
}
