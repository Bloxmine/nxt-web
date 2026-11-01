import { useCallback, useEffect, useId, useSyncExternalStore } from 'react';

/**
 * Front-to-back order of the floating windows (the simulator and the modeless dialogs).
 * A window opens on top; clicking or focusing one brings it to the front. Their
 * z-indexes stay below modal dialogs (100).
 */
const order: string[] = [];
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Lowest z-index of a floating window. */
export const FLOATING_Z = 40;

/**
 * The window's z-index and a function that brings it to the front. With `enabled`
 * false (a modal dialog) the window takes no part.
 */
export function useFloatingWindow(enabled = true): { zIndex: number; raise(): void } {
  const id = useId();
  useEffect(() => {
    if (!enabled) return;
    order.push(id);
    emit();
    return () => {
      const i = order.indexOf(id);
      if (i >= 0) order.splice(i, 1);
      emit();
    };
  }, [id, enabled]);
  const index = useSyncExternalStore(subscribe, () => order.indexOf(id));
  const raise = useCallback(() => {
    const i = order.indexOf(id);
    if (i < 0 || i === order.length - 1) return;
    order.splice(i, 1);
    order.push(id);
    emit();
  }, [id]);
  return { zIndex: FLOATING_Z + Math.max(0, index), raise };
}
