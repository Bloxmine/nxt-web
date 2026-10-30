import { wireWarning, type DataType, type Program } from '@nxt/blocks';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { WireEnd } from '../editor/wiring';
import { useWireValues } from '../sim/SimulatorContext';

const COLORS: Record<DataType, string> = { number: '#e3b800', logic: '#2f9a2a', text: '#e8711a' };

interface Props {
  program: Program;
  content: RefObject<HTMLDivElement | null>;
  zoom: number;
  selectedWire: string | null;
  pending: (WireEnd & { x: number; y: number }) | null;
  onSelectWire(id: string): void;
  /** Wire types by id, so each wire gets its data colour. */
  types: Map<string, DataType>;
  /**
   * Which layer this is. Classic wires draw the visible wires behind the blocks
   * ('visual') and an invisible layer on top to click them ('hit').
   */
  part?: 'all' | 'visual' | 'hit';
  /** Classic look: tube-style wires, each in its own vertical lane. */
  classic?: boolean;
}

/** Orthogonal route from an output (left) to an input (right), like the classic editor. */
function route(x1: number, y1: number, x2: number, y2: number, lane = 0): string {
  if (x2 > x1 + 16) {
    // `lane` spreads wires sharing a stretch of beam into separate vertical channels.
    const span = x2 - x1;
    const mid = Math.round(
      x1 + span / 2 + Math.max(-span / 2 + 6, Math.min(span / 2 - 6, lane * 6)),
    );
    return `M${x1},${y1} H${mid} V${y2} H${x2}`;
  }
  const below = Math.max(y1, y2) + 26;
  return `M${x1},${y1} H${x1 + 8} V${below} H${x2 - 8} V${y2} H${x2}`;
}

/**
 * Draws data wires and the parallel-beam rail over the canvas. Paths are
 * measured from the DOM after each render, so they follow blocks wherever the
 * layout puts them.
 */
export function WireLayer({
  program,
  content,
  zoom,
  selectedWire,
  pending,
  onSelectWire,
  types,
  part = 'all',
  classic = false,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  // While simulating, each wire shows the value it carries next to its output end.
  const values = useWireValues();

  useLayoutEffect(() => {
    // The svg sits directly inside the canvas content; use that rather than the
    // parent's ref, which is attached after this child's layout effect on mount.
    const layer = svg.current;
    const root = (layer?.parentElement as HTMLDivElement | null | undefined) ?? content.current;
    if (!root || !layer) return;
    const origin = root.getBoundingClientRect();
    const center = (selector: string) => {
      const el = root.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: (r.left + r.width / 2 - origin.left) / zoom,
        y: (r.top + r.height / 2 - origin.top) / zoom,
      };
    };
    const socket = (block: string, plug: string, side: string) =>
      center(`[data-plug="${CSS.escape(`${block}:${plug}:${side}`)}"]`);

    for (const path of layer.querySelectorAll<SVGPathElement>('path[data-wire]')) {
      const index = program.wires.findIndex((w) => w.id === path.dataset['wire']);
      const wire = program.wires[index];
      const a = wire && socket(wire.from.block, wire.from.plug, 'out');
      const b = wire && socket(wire.to.block, wire.to.plug, 'in');
      const lane = classic ? (index % 5) - 2 : 0;
      path.setAttribute('d', a && b ? route(a.x, a.y, b.x, b.y, lane) : '');
      const label = layer.querySelector<SVGGElement>(
        `g[data-wire-label="${CSS.escape(path.dataset['wire'] ?? '')}"]`,
      );
      if (label && a) label.setAttribute('transform', `translate(${a.x + 5},${a.y - 4})`);
    }

    const pendingPath = layer.querySelector<SVGPathElement>('path[data-pending]');
    if (pendingPath && pending) {
      const a = socket(pending.block, pending.plug, pending.side);
      if (a) {
        pendingPath.setAttribute(
          'd',
          pending.side === 'out'
            ? route(a.x, a.y, pending.x, pending.y)
            : route(pending.x, pending.y, a.x, a.y),
        );
      }
    }

    const rail = layer.querySelector<SVGLineElement>('line[data-rail]');
    const nodes = root.querySelectorAll('[data-lane-node]');
    if (rail) {
      const first = nodes[0]?.getBoundingClientRect();
      const last = nodes[nodes.length - 1]?.getBoundingClientRect();
      if (first && last && nodes.length > 1) {
        const x = (first.left + first.width / 2 - origin.left) / zoom;
        rail.setAttribute('x1', String(x));
        rail.setAttribute('x2', String(x));
        rail.setAttribute('y1', String((first.top + first.height / 2 - origin.top) / zoom));
        rail.setAttribute('y2', String((last.top + last.height / 2 - origin.top) / zoom));
        rail.style.display = '';
      } else {
        // A zero-length line with round caps would still paint a dot.
        rail.style.display = 'none';
      }
    }
  });

  return (
    <svg ref={svg} className={`wire-layer ${part}`} aria-hidden="false">
      {part !== 'hit' && (
        <line
          data-rail=""
          className="lane-rail"
          x1="0"
          y1="0"
          x2="0"
          y2="0"
          style={{ display: 'none' }}
        />
      )}
      {program.wires.map((wire) => {
        const broken = wireWarning(program, wire) !== null;
        const color = broken ? '#8a8a8a' : COLORS[types.get(wire.id) ?? 'number'];
        return (
          <g key={wire.id}>
            {part !== 'visual' && (
              <path
                data-wire={wire.id}
                className="wire-hit"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectWire(wire.id);
                }}
              >
                <title>
                  {broken
                    ? `Broken wire: ${wireWarning(program, wire)}`
                    : 'Data wire (click to select, Delete to remove)'}
                </title>
              </path>
            )}
            {part !== 'hit' && classic && (
              <path data-wire={wire.id} className="wire-tube" stroke={color} />
            )}
            {part !== 'hit' && (
              <path
                data-wire={wire.id}
                className={`wire ${classic ? 'classic' : ''} ${broken ? 'broken' : ''} ${selectedWire === wire.id ? 'selected' : ''}`}
                stroke={classic ? '#ffffffaa' : color}
              />
            )}
          </g>
        );
      })}
      {values &&
        part !== 'visual' &&
        program.wires.map((wire) => {
          const text = values.get(wire.id) ?? '';
          return (
            <g key={`v${wire.id}`} data-wire-label={wire.id} className="wire-value">
              <rect x={-2} y={-9} width={text.length * 6 + 4} height={11} rx={2} />
              <text x={0} y={0}>
                {text}
              </text>
            </g>
          );
        })}
      {pending && part !== 'visual' && (
        <path data-pending="" className="wire pending" stroke={COLORS[pending.type]} />
      )}
    </svg>
  );
}
