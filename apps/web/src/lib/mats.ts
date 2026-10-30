import type { Scenario } from '@nxt/sim';
import { loadValue, saveValue } from './storage';

/** Mats drawn in the mat editor, kept in this browser. */
const KEY = 'mats';

/** Ids of custom mats start with this, so they never clash with built-in ones. */
export const CUSTOM_PREFIX = 'custom:';

export async function listMats(): Promise<Scenario[]> {
  return (await loadValue<Scenario[]>(KEY)) ?? [];
}

/** Adds or replaces a mat (by id); returns the new list. */
export async function saveMat(mat: Scenario): Promise<Scenario[]> {
  const mats = await listMats();
  const next = [...mats.filter((m) => m.id !== mat.id), mat];
  await saveValue(KEY, next);
  return next;
}

export async function deleteMat(id: string): Promise<Scenario[]> {
  const next = (await listMats()).filter((m) => m.id !== id);
  await saveValue(KEY, next);
  return next;
}

export function newMatId(): string {
  return `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A blank mat to start drawing on. */
export function blankMat(): Scenario {
  return {
    id: newMatId(),
    name: 'My mat',
    description: '',
    width: 200,
    height: 150,
    background: 'white',
    shapes: [],
    walls: [],
    fenced: false,
    start: { x: 30, y: 75, heading: 0 },
  };
}

/** Checks a mat read from a file; throws with a readable message when it is not one. */
export function parseMat(text: string): Scenario {
  const data = JSON.parse(text) as Partial<Scenario>;
  if (
    typeof data.width !== 'number' ||
    typeof data.height !== 'number' ||
    !Array.isArray(data.shapes) ||
    !Array.isArray(data.walls) ||
    typeof data.start?.x !== 'number'
  ) {
    throw new Error('This file is not a mat.');
  }
  return {
    description: '',
    background: 'white',
    fenced: false,
    ...data,
    name: data.name ?? 'Imported mat',
    id: newMatId(),
  } as Scenario;
}
