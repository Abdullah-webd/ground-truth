import { useMemo } from "react";
import type { PointTrend } from "../lib/types";

const W = 720;
const H = 420;
const PAD = { l: 64, r: 24, t: 24, b: 44 };

/** The live NASA record for the proof scene. Parts carry classes the landing timeline animates. */
export function ProofChart({ trend }: { trend: PointTrend }) {
  const g = useMemo(() => {
    const pts = trend.years
      .map((yr, i) => ({ yr, v: trend.values[i] }))
      .filter((p): p is { yr: number; v: number } => p.v != null && Number.isFinite(p.v));
    if (pts.length < 3) return null;
    const vals = pts.map((p) => p.v);
    const line = trend.trend_line;
    const lo = Math.min(...vals, ...(line ? line.map((p) => p[1]) : []));
    const hi = Math.max(...vals, ...(line ? line.map((p) => p[1]) : []));
    const pad = (hi - lo) * 0.1 || 1;
    const y0 = lo - pad;
    const y1 = hi + pad;
    const xa = trend.years[0];
    const xb = trend.years[trend.years.length - 1];
    const x = (yr: number) => PAD.l + ((yr - xa) / (xb - xa || 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
    const series = pts.map((p, i) => `${i ? "L" : "M"}${x(p.yr).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const step = Math.pow(10, Math.floor(Math.log10((y1 - y0) / 4)));
    const nice = [1, 2, 5, 10].map((m) => m * step).find((s) => (y1 - y0) / s <= 5) ?? step * 10;
    const ticks: number[] = [];
    for (let v = Math.ceil(y0 / nice) * nice; v <= y1; v += nice) ticks.push(Number(v.toPrecision(8)));
    return { pts, x, y, series, ticks, line, lo: Math.min(...vals), hi: Math.max(...vals) };
  }, [trend]);

  if (!g) return <p className="text-muted">Not enough years to draw.</p>;
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${trend.label} by year at Punjab, ${trend.units}, with trend line`}>
      {g.ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={g.y(t)} y2={g.y(t)} stroke="var(--color-line)" />
          <text x={PAD.l - 10} y={g.y(t) + 4} textAnchor="end" fontSize="13" fill="var(--color-muted)" className="tabular">
            {fmt(t)}
          </text>
        </g>
      ))}
      <text x={PAD.l} y={14} fontSize="13" fill="var(--color-faint)">
        Water stored in the ground, compared with the 2004–2009 average ({trend.units})
      </text>
      {[g.pts[0].yr, g.pts[Math.floor(g.pts.length / 2)].yr, g.pts[g.pts.length - 1].yr].map((yr) => (
        <text key={yr} x={g.x(yr)} y={H - 14} textAnchor="middle" fontSize="13" fill="var(--color-muted)" className="tabular">
          {yr}
        </text>
      ))}
      {/* the year-to-year ups and downs */}
      <rect
        className="proof-band"
        x={PAD.l}
        width={W - PAD.l - PAD.r}
        y={g.y(g.hi)}
        height={g.y(g.lo) - g.y(g.hi)}
        fill="var(--color-ground)"
      />
      <path className="proof-series" d={g.series} pathLength={1} strokeDasharray="1" fill="none" stroke="var(--color-faint)" strokeWidth="2" strokeLinejoin="round" />
      {g.pts.map((p) => (
        <circle key={p.yr} className="proof-dot" cx={g.x(p.yr)} cy={g.y(p.v)} r="4.5" fill="var(--color-muted)" />
      ))}
      {g.line && (
        <>
          <path
            className="proof-trend"
            d={`M${g.x(g.line[0][0])},${g.y(g.line[0][1])}L${g.x(g.line[1][0])},${g.y(g.line[1][1])}`}
            pathLength={1}
            strokeDasharray="1"
            stroke="var(--color-mark)"
            strokeWidth="14"
            strokeLinecap="round"
            fill="none"
          />
          <path
            className="proof-trend"
            d={`M${g.x(g.line[0][0])},${g.y(g.line[0][1])}L${g.x(g.line[1][0])},${g.y(g.line[1][1])}`}
            pathLength={1}
            strokeDasharray="1"
            stroke="var(--color-ink)"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
    </svg>
  );
}
