import { useId, useState } from 'react';

/** Categorical slots from the reference palette (light mode), in fixed order per port. */
export const SERIES_COLORS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
];

interface Props {
  title: string;
  unit: string;
  color: string;
  /** [time in seconds, value] pairs, in time order. */
  points: readonly [number, number][];
  height?: number;
}

const niceStep = (span: number) => {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
};

/** One series over time: 2 px line, recessive grid, hover crosshair with the value. */
export function LineChart({ title, unit, color, points, height = 120 }: Props) {
  const width = 520;
  const pad = { left: 40, right: 12, top: 8, bottom: 20 };
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const t0 = points[0]?.[0] ?? 0;
  const t1 = Math.max(t0 + 1, points.at(-1)?.[0] ?? 1);
  let lo = Math.min(...points.map((p) => p[1]), 0);
  let hi = Math.max(...points.map((p) => p[1]), 1);
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = (t: number) => pad.left + ((t - t0) / (t1 - t0)) * (width - pad.left - pad.right);
  const y = (v: number) =>
    pad.top + (1 - (v - lo) / (hi - lo || 1)) * (height - pad.top - pad.bottom);
  const path = points
    .map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`)
    .join('');
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  const hp = hover !== null ? points[hover] : undefined;
  const last = points.at(-1);

  return (
    <figure className="chart" aria-labelledby={id}>
      <figcaption id={id}>
        <span className="chart-key" style={{ background: color }} />
        {title}
        {last && (
          <span className="chart-latest">
            {last[1]}
            {unit}
          </span>
        )}
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title}: ${points.length} readings`}
        onPointerMove={(e) => {
          if (!points.length) return;
          const r = e.currentTarget.getBoundingClientRect();
          const t =
            t0 +
            ((((e.clientX - r.left) / r.width) * width - pad.left) /
              (width - pad.left - pad.right)) *
              (t1 - t0);
          let best = 0;
          points.forEach((p, i) => {
            if (Math.abs(p[0] - t) < Math.abs(points[best]![0] - t)) best = i;
          });
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={pad.left - 6} y={y(v) + 3} className="chart-tick" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text x={pad.left} y={height - 4} className="chart-tick">
          {t0.toFixed(1)} s
        </text>
        <text x={width - pad.right} y={height - 4} className="chart-tick" textAnchor="end">
          {t1.toFixed(1)} s
        </text>
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {hp && (
          <g>
            <line
              x1={x(hp[0])}
              x2={x(hp[0])}
              y1={pad.top}
              y2={height - pad.bottom}
              className="chart-cross"
            />
            <circle cx={x(hp[0])} cy={y(hp[1])} r={4} fill={color} stroke="#fff" strokeWidth={2} />
            <g transform={`translate(${Math.min(x(hp[0]) + 8, width - 110)},${pad.top + 2})`}>
              <rect width={100} height={20} rx={3} className="chart-tip" />
              <text x={6} y={14} className="chart-tip-text">
                {hp[0].toFixed(2)} s: {hp[1]}
                {unit}
              </text>
            </g>
          </g>
        )}
      </svg>
    </figure>
  );
}
