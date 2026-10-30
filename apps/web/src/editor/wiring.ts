import type { DataType } from '@nxt/blocks';
import { createContext, useContext, type MouseEvent } from 'react';

/** One end of a wire being drawn. */
export interface WireEnd {
  block: string;
  plug: string;
  side: 'in' | 'out';
  type: DataType;
}

export interface WiringContextValue {
  /** Starts drawing a wire from a socket. */
  start(end: WireEnd, event: MouseEvent): void;
}

export const WiringContext = createContext<WiringContextValue>({ start: () => {} });

export function useWiring(): WiringContextValue {
  return useContext(WiringContext);
}

/** Parses a socket's data-plug attribute ("block:plug:side"). */
export function parsePlug(
  value: string | null | undefined,
): { block: string; plug: string; side: 'in' | 'out' } | null {
  if (!value) return null;
  const [block, plug, side] = value.split(':');
  if (!block || !plug || (side !== 'in' && side !== 'out')) return null;
  return { block, plug, side };
}
