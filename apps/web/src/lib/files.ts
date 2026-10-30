import { PROJECT_EXTENSION, parseProject, serializeProject, type Program } from '@nxt/blocks';

// File System Access API types are not in the DOM lib yet.
interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (options: object) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<FileHandle>;
};

const pickerTypes = [
  {
    description: 'NXT Web Studio project',
    accept: { 'application/json': [PROJECT_EXTENSION, '.json'] },
  },
];

/** A file the project was opened from or saved to, so Save can overwrite it. */
export type SavedFile = FileHandle | null;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Lets the user pick a project file. Returns null if they cancel. */
export async function openProjectFile(): Promise<{ program: Program; handle: SavedFile } | null> {
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: pickerTypes });
      if (!handle) return null;
      return { program: parseProject(await (await handle.getFile()).text()), handle };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${PROJECT_EXTENSION},.json`;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
  return file ? { program: parseProject(await file.text()), handle: null } : null;
}

/**
 * Saves a project. Reuses `handle` when given; otherwise asks where to save
 * (or downloads the file when the browser has no save picker).
 */
export async function saveProjectFile(
  program: Program,
  handle: SavedFile,
  saveAs = false,
): Promise<SavedFile> {
  const text = serializeProject(program);
  const w = window as PickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const target =
        handle && !saveAs
          ? handle
          : await w.showSaveFilePicker({
              suggestedName: `${program.name}${PROJECT_EXTENSION}`,
              types: pickerTypes,
            });
      const writable = await target.createWritable();
      await writable.write(text);
      await writable.close();
      return target;
    } catch (error) {
      if (isAbort(error)) return handle;
      throw error;
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${program.name}${PROJECT_EXTENSION}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}
