import { newId, type Clip, type Program } from '@nxt/blocks';
import { loadValue, saveValue } from './storage';

/** A program kept in the browser's project library (File → Library). */
export interface LibraryEntry {
  id: string;
  name: string;
  savedAt: string;
  program: Program;
}

/** A saved group of blocks (Edit → Snippets). */
export interface Snippet {
  id: string;
  name: string;
  savedAt: string;
  clip: Clip;
}

const LIBRARY = 'library';
const SNIPPETS = 'snippets';

/** Library entries, most recently saved first. */
export async function listLibrary(): Promise<LibraryEntry[]> {
  return ((await loadValue<LibraryEntry[]>(LIBRARY)) ?? []).sort((a, b) =>
    b.savedAt.localeCompare(a.savedAt),
  );
}

/** Saves a program under `id` (creating the entry if needed). */
export async function saveToLibrary(id: string, program: Program): Promise<void> {
  if (
    program.body.length === 0 &&
    program.myBlocks.length === 0 &&
    program.parallel.every((l) => l.length === 0)
  )
    return;
  const all = (await loadValue<LibraryEntry[]>(LIBRARY)) ?? [];
  const entry: LibraryEntry = {
    id,
    name: program.name,
    savedAt: new Date().toISOString(),
    program,
  };
  await saveValue(LIBRARY, [entry, ...all.filter((e) => e.id !== id)].slice(0, 200));
}

export async function removeFromLibrary(id: string): Promise<LibraryEntry[]> {
  const next = ((await loadValue<LibraryEntry[]>(LIBRARY)) ?? []).filter((e) => e.id !== id);
  await saveValue(LIBRARY, next);
  return next;
}

/** A new library id for a program that has none yet. */
export const newLibraryId = () => newId('lib');

export async function listSnippets(): Promise<Snippet[]> {
  return (await loadValue<Snippet[]>(SNIPPETS)) ?? [];
}

export async function saveSnippet(name: string, clip: Clip): Promise<Snippet[]> {
  const next = [
    { id: newId('snip'), name, savedAt: new Date().toISOString(), clip },
    ...(await listSnippets()),
  ];
  await saveValue(SNIPPETS, next);
  return next;
}

export async function updateSnippets(next: Snippet[]): Promise<void> {
  await saveValue(SNIPPETS, next);
}
