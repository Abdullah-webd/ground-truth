import { useQueries, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { exportCaseCard } from "../lib/exportCard";
import { formatLatLon, formatP, formatRate, shortPlace } from "../lib/format";
import { VARIABLE_IDS, type PointTrend } from "../lib/types";
import { useVariables } from "../lib/useVariables";
import { useApp } from "../state/store";
import { Briefing } from "./Briefing";
import { SeriesChart } from "./SeriesChart";

const panel = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] } },
  exit: { opacity: 0, x: 16, transition: { duration: 0.18 } },
} as const;

export function CaseFile() {
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const key = selection ? JSON.stringify(selection) : "none";

  return (
    <AnimatePresence mode="wait">
      {selection && (
        <motion.aside
          key={key}
          {...panel}
          aria-label="Case file"
          className="scroll-thin pointer-events-auto absolute right-4 top-[68px] bottom-4 z-20 flex w-[380px] flex-col overflow-y-auto rounded-xl border border-line bg-panel"
        >
          <button
            type="button"
            onClick={() => select(null)}
            className="btn btn-quiet absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-md text-muted"
            aria-label="Close the case file"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
          {selection.kind === "point" && <PointCase lat={selection.lat} lon={selection.lon} name={selection.name} />}
          {selection.kind === "hotspot" && <HotspotCase id={selection.id} />}
          {selection.kind === "pair" && <PairCase index={selection.index} />}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Header({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  const atlasActive = useApp((s) => s.atlasLabel != null);
  const size = title.length > 26 ? "text-[26px]" : title.length > 16 ? "text-[32px]" : "text-[40px]";
  return (
    <div className="border-b border-line px-5 pb-4 pt-5 pr-12">
      <p className="text-xs text-muted">{eyebrow}</p>
      {atlasActive ? (
        <h2 className={`atlas mt-1 ${size} text-ink opacity-0`}>{title}</h2>
      ) : (
        <motion.h2 layoutId="atlas-label" className={`atlas mt-1 ${size} text-ink`}>
          {title}
        </motion.h2>
      )}
      {sub && <p className="tabular mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line/60 py-1.5 text-sm first:border-t-0">
      <span className="text-muted">{k}</span>
      <span className={`tabular text-right ${accent ? "text-accent" : "text-ink"}`}>{v}</span>
    </div>
  );
}

function Verdict({ t }: { t: PointTrend }) {
  const tone = !t.tested ? "border-line text-muted" : t.significant ? "border-accent/60 text-ink" : "border-line text-muted";
  return (
    <div className={`rounded-lg border px-4 py-3 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {!t.tested ? "No test possible" : t.significant ? `Significant: ${t.meaning}` : "Not proven"}
      </p>
      <p className="mt-1 text-[15px] leading-snug">{t.verdict.replace(/^[^:]+: /, "")}</p>
    </div>
  );
}

function PointCase({ lat, lon, name }: { lat: number; lon: number; name?: string }) {
  const { variable, setVariable } = useApp();
  const meta = useVariables().data?.find((v) => v.id === variable);
  const [exporting, setExporting] = useState<string | null>(null);
  const trend = useQuery({ queryKey: ["point", variable, lat, lon], queryFn: ({ signal }) => api.point(variable, lat, lon, signal) });
  const now = useQuery({ queryKey: ["now", lat.toFixed(2), lon.toFixed(2)], queryFn: ({ signal }) => api.now(lat, lon, signal), retry: 1 });
  const others = useQueries({
    queries: VARIABLE_IDS.map((v) => ({ queryKey: ["point", v, lat, lon], queryFn: () => api.point(v, lat, lon) })),
  });
  const title = name ? shortPlace(name) : formatLatLon(lat, lon);
  const t = trend.data;

  const onExport = async () => {
    if (!t) return;
    setExporting("Preparing the case card…");
    try {
      await exportCaseCard({
        title,
        subtitle: `${t.label}, ${t.period[0]}–${t.period[1]}, ${formatLatLon(lat, lon)}`,
        finding: t.verdict,
        stats: [
          ["Rate", formatRate(t.slope_per_decade, t.units)],
          ["p (map-adjusted)", formatP(t.q)],
          ["Test", "Mann-Kendall, autocorrelation-corrected"],
        ],
        source: `Data: ${t.source}. Method: ${t.method}.`,
      });
      setExporting("Case card saved to your downloads.");
    } catch (err) {
      setExporting(`Export failed: ${(err as Error).message}`);
    }
    window.setTimeout(() => setExporting(null), 3500);
  };

  return (
    <>
      <Header eyebrow={name ? "Place" : "Point"} title={title} sub={name ? formatLatLon(lat, lon) : undefined} />
      <div className="flex flex-col gap-4 px-5 py-4">
        <Briefing trends={others.map((q) => q.data)} now={now.data} />
        <button
          type="button"
          onClick={() =>
            useApp
              .getState()
              .ask(
                `Investigate ${name ? shortPlace(name) : formatLatLon(lat, lon)} (${lat.toFixed(3)}, ${lon.toFixed(3)}): what changed on the ground since 2018, and which long-term NASA trends are statistically significant there? Explain what it means.`,
              )
          }
          className="btn btn-quiet self-start rounded-md border border-accent/60 px-3 py-1.5 text-sm text-accent"
        >
          Investigate with the analyst
        </button>
        <p className="-mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Detail: {t?.label ?? "selected variable"}</p>
        {trend.isPending && <Skeleton />}
        {trend.isError && <ErrorNote message={(trend.error as Error).message} />}
        {t && (
          <>
            <Verdict t={t} />
            <div>
              <p className="mb-1 text-xs text-muted">
                {t.label} each year ({t.units}){t.trend_line ? ", with the Theil-Sen trend line" : ""}
              </p>
              <SeriesChart years={t.years} values={t.values} trendLine={t.trend_line} units={t.units} significant={t.significant} label={t.label} />
            </div>
            <div>
              <Stat k="Rate of change" v={formatRate(t.slope_per_decade, t.units)} accent={t.significant} />
              <Stat k="p-value (single test)" v={formatP(t.p)} />
              <Stat k="p-value (map-adjusted)" v={formatP(t.q)} />
              <Stat k="Period" v={`${t.period[0]}–${t.period[1]}`} />
              <Stat k="Grid cell" v={`${t.cell.size_deg}° at ${formatLatLon(t.cell.lat, t.cell.lon)}`} />
            </div>
          </>
        )}

        <section aria-label="Now versus normal" className="rounded-lg bg-ground/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Last 30 days vs normal</p>
          {now.isPending && <p className="mt-1 text-sm text-muted">Checking NASA POWER…</p>}
          {now.isError && <p className="mt-1 text-sm text-muted">Recent data unavailable: {(now.error as Error).message}</p>}
          {now.data && (
            <>
              <p className="mt-1 text-sm leading-snug">{now.data.summary}</p>
              <p className="mt-1 text-[11px] text-faint">Weather this month, compared with 30 years of normal. The long-term trend is above.</p>
            </>
          )}
        </section>

        <section aria-label="All signals here">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">All four signals here</p>
          <ul className="flex flex-col">
            {others.map((q, i) => {
              const d = q.data;
              const id = VARIABLE_IDS[i];
              const active = id === variable;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setVariable(id)}
                    className={`btn btn-quiet flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm ${active ? "bg-panel-2" : ""}`}
                  >
                    <span className={active ? "text-ink" : "text-muted"}>{d?.label ?? id}</span>
                    <span className="tabular text-right">
                      {!d ? (
                        <span className="text-faint">…</span>
                      ) : !d.tested ? (
                        <span className="text-faint">no data</span>
                      ) : (
                        <span className={d.significant ? "text-ink" : "text-faint"}>
                          {formatRate(d.slope_per_decade, d.units)}
                          {d.significant ? "" : ", not proven"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {t && meta && (
          <p className="text-[11px] leading-relaxed text-faint">
            {meta.source}. {meta.method}.
          </p>
        )}
        {t && (
          <button type="button" onClick={onExport} className="btn btn-quiet rounded-md border border-line px-3 py-2 text-sm text-ink">
            {exporting ?? "Save this as a case card (PNG)"}
          </button>
        )}
      </div>
    </>
  );
}

function HotspotCase({ id }: { id: string }) {
  const change = useApp((s) => s.change);
  const h = change?.hotspots.find((x) => x.id === id);
  const others = useQueries({
    queries: VARIABLE_IDS.map((v) => ({
      queryKey: ["point", v, h?.lat, h?.lon],
      queryFn: () => api.point(v, h!.lat, h!.lon),
      enabled: !!h,
    })),
  });
  if (!change || !h) return <div className="p-5 text-sm text-muted">This hotspot is no longer on the map.</div>;
  return (
    <>
      <Header eyebrow={`Change hotspot, ${change.year_a} → ${change.year_b}`} title={h.transition === "no class change" ? "Changed surface" : h.transition} sub={formatLatLon(h.lat, h.lon)} />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="rounded-lg border border-accent/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">What the satellites saw</p>
          <p className="mt-1 text-[15px] leading-snug">{h.summary}.</p>
        </div>
        <div>
          <Stat k="Area" v={`${h.area_km2.toFixed(2)} km²`} />
          <Stat k="Change score" v={`${h.score.toFixed(2)} (threshold ${change.threshold})`} accent />
          <Stat k={`Land cover ${change.year_a}`} v={h.from} />
          <Stat k={`Land cover ${change.year_b}`} v={h.to} />
        </div>
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Long-term NASA trends at this spot</p>
          <ul>
            {others.map((q, i) => (
              <li key={VARIABLE_IDS[i]} className="flex justify-between gap-3 py-1 text-sm">
                <span className="text-muted">{q.data?.label ?? VARIABLE_IDS[i]}</span>
                <span className="tabular">
                  {!q.data ? "…" : !q.data.tested ? <span className="text-faint">no data</span> : (
                    <span className={q.data.significant ? "text-ink" : "text-faint"}>
                      {formatRate(q.data.slope_per_decade, q.data.units)}
                      {q.data.significant ? "" : ", not proven"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <p className="text-[11px] leading-relaxed text-faint">{change.method}.</p>
      </div>
    </>
  );
}

function PairCase({ index }: { index: number }) {
  const divergence = useApp((s) => s.divergence);
  const meta = useVariables().data?.find((v) => v.id === divergence?.variable);
  const upColor = meta?.palette[meta.palette.length - 1] ?? "#d6604d";
  const downColor = meta?.palette[0] ?? "#4393c3";
  const pair = divergence?.pairs[index];
  if (!divergence || !pair) return <div className="p-5 text-sm text-muted">This pair is no longer on the map.</div>;
  const row = (title: string, c: typeof pair.increasing, color: string) => (
    <div className="rounded-lg bg-ground/60 px-4 py-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
        {title}
      </p>
      <p className="tabular mt-1 text-lg">{formatRate(c.slope_per_decade, divergence.units.replace(" per decade", ""))}</p>
      <p className="tabular text-xs text-muted">
        {(c.area_km2 / 1e6).toFixed(2)} million km² centred near {formatLatLon(c.lat, c.lon)}
      </p>
    </div>
  );
  return (
    <>
      <Header eyebrow={`${divergence.label}, ${divergence.period[0]}–${divergence.period[1]}`} title="Opposite trends" />
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="text-[15px] leading-snug">
          The same variable is moving in opposite directions in two regions {pair.distance_km.toLocaleString()} km apart. Both trends
          are statistically significant after correcting for testing the whole map.
        </p>
        {row(`Significantly ${divergence.increase_means}`, pair.increasing, upColor)}
        {row(`Significantly ${divergence.decrease_means}`, pair.decreasing, downColor)}
        <p className="text-[11px] leading-relaxed text-faint">
          We show where the trends disagree. Explaining why needs physical analysis; we don't claim a cause.
        </p>
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      <div className="h-16 animate-pulse rounded-lg bg-panel-2" />
      <div className="h-36 animate-pulse rounded-lg bg-panel-2" />
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg border border-bad/50 px-3 py-2 text-sm text-bad">
      {message}
    </p>
  );
}
