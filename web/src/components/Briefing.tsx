import type { NowVsNormal, PointTrend } from "../lib/types";
import { formatP } from "../lib/format";

/** Rounded total change over the record, e.g. "about 1.1 °C since 1980". */
function total(t: PointTrend) {
  const years = t.period[1] - t.period[0];
  const v = ((t.slope_per_decade ?? 0) / 10) * years;
  const a = Math.abs(v);
  const s = a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(0) : a >= 1 ? a.toFixed(1) : a >= 0.1 ? a.toFixed(2) : a.toFixed(3);
  return `${s} ${t.units}`;
}

function sentence(t: PointTrend): { text: string; proven: boolean | null } {
  if (!t.tested) {
    const missing = t.values.every((v) => v == null);
    return { text: missing ? `${t.label} is not measured here.` : `${t.label} has too few valid years to test.`, proven: null };
  }
  const rate = Math.abs(t.slope_per_decade ?? 0);
  const r = rate >= 100 ? rate.toFixed(0) : rate >= 1 ? rate.toFixed(1) : rate >= 0.1 ? rate.toFixed(2) : rate.toFixed(3);
  const dir = (t.slope_per_decade ?? 0) > 0 ? "up" : "down";
  if (t.significant) {
    return {
      text: `${t.label}: ${t.meaning}. Since ${t.period[0]} it has gone ${dir} by about ${total(t)} (${r} ${t.units} per decade). The chance this is random variation is tiny (p ${formatP(t.q)}).`,
      proven: true,
    };
  }
  return {
    text: `${t.label} moved ${dir} by ${r} ${t.units} per decade since ${t.period[0]}, but that is not statistically proven (p ${formatP(t.q)}). It could be natural year-to-year variation.`,
    proven: false,
  };
}

/** A plain-English briefing built only from the numbers: no AI involved. */
export function Briefing({ trends, now }: { trends: (PointTrend | undefined)[]; now?: NowVsNormal }) {
  const loaded = trends.filter((t): t is PointTrend => !!t);
  if (loaded.length < trends.length) {
    return <p className="text-sm text-muted">Reading the NASA records for this spot…</p>;
  }
  const lines = loaded.map(sentence);
  const proven = lines.filter((l) => l.proven).length;
  const tested = lines.filter((l) => l.proven !== null).length;
  const n = now?.temperature;
  return (
    <section aria-label="What's happening here" className="rounded-lg border border-line bg-ground/50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">What's happening here</p>
      <p className="mt-1.5 text-[15px] leading-snug text-ink">
        {proven === 0
          ? `None of the ${tested} NASA records tested here shows a statistically proven long-term change.`
          : `${proven} of the ${tested} NASA records tested here ${proven === 1 ? "shows" : "show"} a statistically proven long-term change.`}
        {n ? ` Right now it is running ${Math.abs(n.anomaly)} °C ${n.anomaly >= 0 ? "warmer" : "cooler"} than normal for the time of year.` : ""}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug">
            <span
              aria-hidden
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${l.proven ? "bg-accent" : l.proven === false ? "bg-faint" : "bg-line"}`}
            />
            <span className={l.proven ? "text-ink" : "text-muted"}>{l.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
