/** Saved control profiles (in this browser), and profile files to share or back up. */
import { loadValue, saveValue } from '../lib/storage';
import { saveFile } from '../tools/convert';
import { createProfile, readProfile, type Profile } from './profile';

const KEY = 'nxt-web-studio:control-profiles';
export const PROFILE_EXTENSION = '.nxtcontrols.json';

export interface SavedProfiles {
  profiles: Profile[];
  activeId: string;
}

/** The saved profiles; a first visit gets the presets. */
export async function loadProfiles(): Promise<SavedProfiles> {
  const data = await loadValue<{ profiles?: unknown; activeId?: unknown }>(KEY);
  const profiles = (Array.isArray(data?.profiles) ? data.profiles : [])
    .map(readProfile)
    .filter((p): p is Profile => p !== null);
  if (profiles.length === 0)
    profiles.push(createProfile('two-wheel'), createProfile('tank'), createProfile('car'));
  const activeId =
    typeof data?.activeId === 'string' && profiles.some((p) => p.id === data.activeId)
      ? data.activeId
      : profiles[0]!.id;
  return { profiles, activeId };
}

export function saveProfiles(saved: SavedProfiles): Promise<void> {
  return saveValue(KEY, saved);
}

/** Downloads a profile as a file. */
export function exportProfile(profile: Profile): void {
  const name = profile.name.replace(/[^\w\- ]+/g, '').trim() || 'controls';
  saveFile(
    `${name}${PROFILE_EXTENSION}`,
    JSON.stringify({ format: 'nxt-web-studio/controls', version: 1, profile }, null, 2),
    'application/json',
  );
}

/** Reads a profile file (or a bare profile); it gets a new id so it never replaces one. */
export async function importProfile(file: File): Promise<Profile> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is not a controls file.`);
  }
  const wrapped = data && typeof data === 'object' && 'profile' in data ? data.profile : data;
  const profile = readProfile(wrapped);
  if (!profile) throw new Error(`${file.name} is not a controls file.`);
  return { ...profile, id: `p-${Date.now().toString(36)}` };
}
