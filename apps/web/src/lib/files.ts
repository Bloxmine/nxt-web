import { PROJECT_EXTENSION, parseProject, serializeProject, type Program } from '@nxt/blocks';
import { importRbt } from '@nxt/rbt';

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

const saveTypes = [
  {
    description: 'NXT Web Studio project',
    accept: { 'application/json': [PROJECT_EXTENSION, '.json'] },
  },
];
const openTypes = [
  {
    description: 'NXT programs (.nxtproj.json, .rbt)',
    accept: {
      'application/json': [PROJECT_EXTENSION, '.json'],
      'application/octet-stream': ['.rbt'],
    },
  },
];

/** A file the project was opened from or saved to, so Save can overwrite it. */
export type SavedFile = FileHandle | null;

/** A program read from a file, with any notes from importing it. */
export interface OpenedProgram {
  program: Program;
  handle: SavedFile;
  /** Notes about things that could not be carried over (imported .rbt files). */
  warnings: string[];
  /** True when the file was an original NXT-G program (.rbt). */
  imported: boolean;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Reads a project (.nxtproj.json) or an original NXT-G program (.rbt). */
export async function readProgramFile(file: File): Promise<Omit<OpenedProgram, 'handle'>> {
  if (/\.rbt$/i.test(file.name)) {
    const { program, warnings } = importRbt(new Uint8Array(await file.arrayBuffer()), file.name);
    return { program, warnings, imported: true };
  }
  return { program: parseProject(await file.text()), warnings: [], imported: false };
}

/** Lets the user pick a project or .rbt program. Returns null if they cancel. */
export async function openProjectFile(): Promise<OpenedProgram | null> {
  const w = window as PickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: openTypes });
      if (!handle) return null;
      const opened = await readProgramFile(await handle.getFile());
      // Imported .rbt files are saved as new projects, never overwritten.
      return { ...opened, handle: opened.imported ? null : handle };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${PROJECT_EXTENSION},.json,.rbt`;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
  return file ? { ...(await readProgramFile(file)), handle: null } : null;
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
              types: saveTypes,
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
