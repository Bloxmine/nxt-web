import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Calls `poll` repeatedly while `enabled`, waiting `intervalMs` between calls.
 * Pauses while the tab is hidden and never overlaps calls.
 */
export function usePolling(poll: () => Promise<void>, intervalMs: number, enabled: boolean): void {
  const pollRef = useRef(poll);
  useLayoutEffect(() => {
    pollRef.current = poll;
  });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible') {
        try {
          await pollRef.current();
        } catch {
          // Errors surface through the caller's own state.
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled, intervalMs]);
}
