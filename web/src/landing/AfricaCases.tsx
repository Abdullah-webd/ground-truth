import { useQueries } from "@tanstack/react-query";
import { api } from "../lib/api";
import { chance, explain, PLAIN } from "../lib/plain";
import { navigate } from "../lib/router";
import type { BBox, PointTrend, VariableId } from "../lib/types";
import { useApp } from "../state/store";

/**
 * Africa, case by case. Every verdict here is computed live from the NASA records by the same test the app
 * uses; nothing is typed in. Each card hands its question to Aisha.
 */
interface Case {
  id: string;
  place: string;
  country: string;
  variable: VariableId;
  point?: [number, number];
  bbox?: BBox;
  angle: string;
  question: string;
}

const CASES: Case[] = [
  { id: "lagos", place: "Lagos", country: "Nigeria", variable: "vegetation", point: [6.55, 3.38], angle: "Is the city losing its green?", question: "Is Lagos really losing its green spaces?" },
  { id: "sahel", place: "The Sahel", country: "Senegal to Chad", variable: "rainfall", bbox: [-17, 12, 20, 18], angle: "Are the rains coming back?", question: "Is the Sahel getting more rain than before?" },
  { id: "chad", place: "Lake Chad basin", country: "Nigeria, Niger, Chad, Cameroon", variable: "vegetation", bbox: [12, 11, 17, 16], angle: "Is the basin dying, as the headlines say?", question: "Is the Lake Chad basin getting greener or browner?" },
  { id: "kano", place: "Kano", country: "Nigeria", variable: "water", point: [12.0, 8.52], angle: "Is the land drying out?", question: "Is the land around Kano losing or gaining water?" },
  { id: "accra", place: "Accra", country: "Ghana", variable: "vegetation", point: [5.6, -0.19], angle: "Is Accra getting browner?", question: "Is Accra losing its green?" },
  { id: "kinshasa", place: "Kinshasa", country: "DR Congo", variable: "temperature", point: [-4.32, 15.31], angle: "How fast is it warming?", question: "How fast is Kinshasa warming?" },
];

function asTrend(r: Record<string, unknown>): PointTrend {
  // Regional answers use p (not q) and have no "tested" flag; give them the point shape.
  return { ...(r as unknown as PointTrend), tested: r.slope_per_decade != null, q: (r.q as number | null) ?? (r.p as number | null) ?? null };
}

function Spark({ t, proven }: { t: PointTrend; proven: boolean }) {
  const pts = t.years.map((y, i) => [y, t.values[i]] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 3) return null;
  const W = 260;
  const H = 70;
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const x = (v: number) => 4 + ((v - pts[0][0]) / (pts[pts.length - 1][0] - pts[0][0] || 1)) * (W - 8);
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);
  // Theil-Sen line from the reported rate, anchored at the median, so regional cards get one too.
  const slope = (t.slope_per_decade ?? 0) / 10;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = [...ys].sort((a, b) => a - b)[Math.floor(ys.length / 2)];
  const lineY = (yr: number) => my + slope * (yr - mx);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[70px] w-full" aria-hidden>
      <path d={pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("")} fill="none" stroke="var(--color-faint)" strokeWidth="1.5" />
      <line
        x1={x(pts[0][0])}
        y1={y(lineY(pts[0][0]))}
        x2={x(pts[pts.length - 1][0])}
        y2={y(lineY(pts[pts.length - 1][0]))}
        stroke={proven ? "var(--color-mark)" : "var(--color-muted)"}
        strokeWidth={proven ? 5 : 2}
        strokeDasharray={proven ? undefined : "4 4"}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AfricaCases() {
  const results = useQueries({
    queries: CASES.map((c) => ({
      queryKey: ["case", c.id],
      staleTime: Infinity,
      queryFn: async () =>
        asTrend((c.point ? await api.point(c.variable, c.point[0], c.point[1]) : await api.region(c.variable, c.bbox!)) as unknown as Record<string, unknown>),
    })),
  });

  const ask = (c: Case, e: React.MouseEvent) => {
    useApp.getState().ask(c.question);
    navigate("/explore", e.nativeEvent);
  };

  return (
    <ul className="case-track scroll-thin -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 md:-mx-10 md:px-10">
      {CASES.map((c, i) => {
        const t = results[i].data;
        const f = t ? explain(c.variable, t) : null;
        const proven = f?.status === "proven";
        return (
          <li key={c.id} className="case-card flex w-[300px] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-line bg-paper p-5 md:w-[340px]">
            <div>
              <p className="atlas text-[30px] leading-none">{c.place}</p>
              <p className="mt-1 text-[13px] text-muted">{c.country}</p>
            </div>
            <p className="text-[15px] font-medium text-ink">{c.angle}</p>
            {!t ? (
              <div className="h-[150px] animate-pulse rounded-xl bg-ground" aria-busy="true" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${proven ? "bg-mark text-on-mark" : "border border-line text-muted"}`}>
                    {proven ? "Proven" : f?.status === "nodata" ? "No data" : "Not proven yet"}
                  </span>
                  <span className="text-[13px] text-muted">
                    {PLAIN[c.variable].satellite}, {t.period[0]}–{t.period[1]}
                  </span>
                </div>
                <p className="text-[17px] font-semibold leading-snug text-ink">
                  {proven ? <span className="mark">{f!.headline}</span> : f?.headline}
                </p>
                <p className="text-[14px] leading-snug text-muted">
                  {f?.detail} {t.q != null ? `Chance it's just luck: ${chance(t.q)}.` : ""}
                </p>
                <Spark t={t} proven={proven} />
              </>
            )}
            <button
              type="button"
              onClick={(e) => ask(c, e)}
              className="btn btn-quiet mt-auto flex h-10 items-center justify-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium text-ink"
            >
              Ask Aisha about this
            </button>
          </li>
        );
      })}
    </ul>
  );
}
