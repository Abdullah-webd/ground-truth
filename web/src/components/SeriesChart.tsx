import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useMemo, useRef } from "react";

interface Props {
  years: number[];
  values: (number | null)[];
  trendLine?: [[number, number], [number, number]] | null;
  units: string;
  significant: boolean;
  label: string;
}

const W = 340;
const H = 150;
const PAD = { l: 40, r: 18, t: 12, b: 24 };

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const step = 10 ** Math.floor(Math.log10(span / count));
  const err = (count * step) / span;
  const mult = err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1;
  const s = step * mult;
  const ticks = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) ticks.push(Number(v.toPrecision(10)));
  return ticks;
}

export function SeriesChart({ years, values, trendLine, units, significant, label }: Props) {
  const root = useRef<SVGSVGElement>(null);
  const geo = useMemo(() => {
    const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
    if (finite.length < 2) return null;
    const lo = Math.min(...finite, ...(trendLine ? trendLine.map((p) => p[1]) : []));
    const hi = Math.max(...finite, ...(trendLine ? trendLine.map((p) => p[1]) : []));
    const pad = (hi - lo || 1) * 0.08;
    const y0 = lo - pad;
    const y1 = hi + pad;
    const x = (yr: number) => PAD.l + ((yr - years[0]) / (years[years.length - 1] - years[0] || 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
    // Break the line where a year is missing.
    const segments: string[] = [];
    let cur = "";
    years.forEach((yr, i) => {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) {
        if (cur) segments.push(cur);
        cur = "";
        return;
      }
      cur += `${cur ? "L" : "M"}${x(yr).toFixed(1)},${y(v).toFixed(1)}`;
    });
    if (cur) segments.push(cur);
    const ticks = niceTicks(y0, y1);
    const xTicks = [years[0], Math.round((years[0] + years[years.length - 1]) / 2), years[years.length - 1]];
    return { x, y, segments, ticks, xTicks };
  }, [years, values, trendLine]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ".series",
          { strokeDashoffset: (_: number, el: SVGPathElement) => el.getTotalLength(), strokeDasharray: (_: number, el: SVGPathElement) => el.getTotalLength() },
          { strokeDashoffset: 0, duration: 1.1, ease: "power2.out", stagger: 0.05 },
        );
        gsap.fromTo(".trend", { opacity: 0 }, { opacity: 1, duration: 0.4, delay: 0.8 });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [geo], revertOnUpdate: true },
  );

  if (!geo) return <p className="text-sm text-muted">Not enough data to draw a chart here.</p>;
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));

  return (
    <svg ref={root} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} by year, ${units}`}>
      {geo.ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={PAD.l - 6} y={geo.y(t) + 3.5} textAnchor="end" className="tabular" fontSize="10" fill="var(--color-muted)">
            {fmt(t)}
          </text>
        </g>
      ))}
      {geo.xTicks.map((t) => (
        <text key={t} x={geo.x(t)} y={H - 6} textAnchor="middle" className="tabular" fontSize="10" fill="var(--color-muted)">
          {t}
        </text>
      ))}
      {geo.segments.map((d, i) => (
        <path key={i} className="series" d={d} fill="none" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinejoin="round" />
      ))}
      {years.map((yr, i) => {
        const v = values[i];
        if (v == null || !Number.isFinite(v)) return null;
        return <circle key={yr} cx={geo.x(yr)} cy={geo.y(v)} r="1.8" fill="var(--color-ink)" />;
      })}
      {trendLine && (
        <line
          className="trend"
          x1={geo.x(trendLine[0][0])}
          y1={geo.y(trendLine[0][1])}
          x2={geo.x(trendLine[1][0])}
          y2={geo.y(trendLine[1][1])}
          stroke={significant ? "var(--color-accent)" : "var(--color-faint)"}
          strokeWidth="2"
          strokeDasharray={significant ? undefined : "4 4"}
        />
      )}
    </svg>
  );
}
