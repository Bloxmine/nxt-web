import type { Program } from '@nxt/blocks';
import { loadValue, saveValue } from './storage';

/** A saved copy of a program, kept in the browser (Edit → History). */
export interface SavedVersion {
  at: string;
  reason: string;
  program: Program;
}

const KEY = 'versions';
const LIMIT = 30;

/** Saved versions, newest first. */
export async function listVersions(): Promise<SavedVersion[]> {
  return (await loadValue<SavedVersion[]>(KEY)) ?? [];
}

/** Keeps a copy of `program`, unless the newest copy of it is identical. */
export async function saveVersion(program: Program, reason: string): Promise<void> {
  if (program.body.length === 0 && program.myBlocks.length === 0 && program.parallel.length === 0)
    return;
  const versions = await listVersions();
  const json = JSON.stringify(program);
  const latestSame = versions.find((v) => v.program.name === program.name);
  if (latestSame && JSON.stringify(latestSame.program) === json) return;
  const next = [{ at: new Date().toISOString(), reason, program }, ...versions].slice(0, LIMIT);
  await saveValue(KEY, next);
}

export async function deleteVersion(at: string): Promise<SavedVersion[]> {
  const next = (await listVersions()).filter((v) => v.at !== at);
  await saveValue(KEY, next);
  return next;
}
