/** Favourite and recently used palette blocks (palette keys), kept in this browser. */
export interface BlockUsage {
  favorites: string[];
  /** Most recent first. */
  recent: string[];
}

const KEY = 'nxt-web-studio:palette';
const MAX_RECENT = 8;
/** Fired on `window` when favourites or recent blocks change. */
export const USAGE_CHANGED = 'nxt-palette-changed';

export function loadUsage(): BlockUsage {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<BlockUsage>;
    return { favorites: data.favorites ?? [], recent: data.recent ?? [] };
  } catch {
    return { favorites: [], recent: [] };
  }
}

function store(usage: BlockUsage): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    // A convenience only.
  }
  window.dispatchEvent(new Event(USAGE_CHANGED));
}

/** Notes that a palette block was used (dragged onto the program). */
export function noteUsed(key: string): void {
  const usage = loadUsage();
  store({ ...usage, recent: [key, ...usage.recent.filter((k) => k !== key)].slice(0, MAX_RECENT) });
}

/** Adds the block to the favourites, or takes it off. */
export function toggleFavorite(key: string): void {
  const usage = loadUsage();
  const favorites = usage.favorites.includes(key)
    ? usage.favorites.filter((k) => k !== key)
    : [...usage.favorites, key];
  store({ ...usage, favorites });
}
