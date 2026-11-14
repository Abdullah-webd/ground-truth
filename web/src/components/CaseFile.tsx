import { useQueries, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { exportCaseCard } from "../lib/exportCard";
import { formatLatLon, formatP, formatRate, shortPlace } from "../lib/format";
import { certainty, chance, explain, nowSentence, PLAIN } from "../lib/plain";
import { VARIABLE_IDS, type Fire, type PointTrend } from "../lib/types";
import { fireSize, hoursAgo } from "../lib/fire";
import { Flame } from "./FirePanel";
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
          className="scroll-thin panel-shadow pointer-events-auto absolute right-4 top-[72px] bottom-4 z-20 flex w-[390px] flex-col overflow-y-auto rounded-2xl border border-line bg-panel"
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
          {selection.kind === "fire" && <FireCase fire={selection.fire} />}
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
      <p className="text-xs font-medium text-muted">{eyebrow}</p>
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

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-1.5 text-[13px] first:border-t-0">
      <span className="text-muted">{k}</span>
      <span className="tabular text-right text-ink">{v}</span>
    </div>
  );
}

/** How sure we are, as a meter a beginner can read: the chance the pattern is just luck. */
function Sureness({ t }: { t: PointTrend }) {
  const level = certainty(t.q);
  return (
    <div className="rounded-lg bg-ground px-4 py-3">
      <p className="text-xs font-semibold text-muted">How sure are we?</p>
      <p className="mt-1 text-[15px] leading-snug text-ink">
        The chance this pattern is just luck: <strong className="font-semibold">{chance(t.q)}</strong>.
        {t.significant ? " That's strong enough to call it a real trend." : " That's too likely to call it a real trend."}
      </p>
      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-faint">
        <span>Could be luck</span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${t.significant ? "bg-ink" : "bg-faint"}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(4, level * 100)}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
          <span className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${certainty(0.05) * 100}%` }} aria-hidden />
        </div>
        <span>Certain</span>
      </div>
      <p className="mt-1 text-[11px] text-faint">The tick marks the 1-in-20 line scientists use to call a trend real.</p>
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
  const plain = PLAIN[variable];
  const finding = t ? explain(variable, t) : null;

  const onExport = async () => {
    if (!t || !finding) return;
    setExporting("Preparing the case card…");
    try {
      await exportCaseCard({
        title,
        subtitle: `${plain.name}, ${t.period[0]}–${t.period[1]}, ${formatLatLon(lat, lon)}`,
        finding: `${finding.headline}. ${finding.detail}`,
        stats: [
          ["Rate", formatRate(t.slope_per_decade, t.units)],
          ["Chance it's luck", chance(t.q)],
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
      <Header eyebrow={name ? "You're looking at" : "You picked a spot"} title={title} sub={name ? formatLatLon(lat, lon) : "Click anywhere else on the globe to compare."} />
      <div className="flex flex-col gap-5 px-5 py-4">
        <Briefing trends={others.map((q) => q.data)} active={variable} onPick={setVariable} />

        <section aria-label="Year by year" className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold text-muted">Year by year: {plain.name.toLowerCase()}</p>
            <p className="mt-0.5 text-sm text-muted">{plain.what}</p>
          </div>
          {trend.isPending && <Skeleton />}
          {trend.isError && <ErrorNote message={(trend.error as Error).message} />}
          {t && (
            <>
              <div className="rounded-lg border border-line px-3 pb-2 pt-3">
                <SeriesChart years={t.years} values={t.values} trendLine={t.trend_line} units={t.units} significant={t.significant} label={plain.name} />
                <p className="mt-1 text-[11px] leading-snug text-faint">
                  Each dot is one year. The {t.significant ? "dark" : "dashed"} line shows the overall direction{t.significant ? "" : ", which isn't proven yet"}.
                </p>
              </div>
              {t.tested && <Sureness t={t} />}
            </>
          )}
        </section>

        <section aria-label="This month" className="rounded-lg border border-line px-4 py-3">
          <p className="text-xs font-semibold text-muted">And this month?</p>
          {now.isPending && <p className="mt-1 text-sm text-muted">Checking the latest NASA weather records…</p>}
          {now.isError && <p className="mt-1 text-sm text-muted">Recent weather isn't available right now: {(now.error as Error).message}</p>}
          {now.data && (
            <>
              <p className="mt-1 text-[15px] leading-snug text-ink">{nowSentence(now.data)}</p>
              <p className="mt-1.5 text-[11px] leading-snug text-faint">
                One month is weather. The years above are climate. Source: NASA POWER, compared with 1991–2020.
              </p>
            </>
          )}
        </section>

        <button
          type="button"
          onClick={() =>
            useApp
              .getState()
              .ask(
                `Investigate ${name ? shortPlace(name) : formatLatLon(lat, lon)} (${lat.toFixed(3)}, ${lon.toFixed(3)}): what changed on the ground since 2018, and which long-term changes are proven by NASA records? What does it mean for people living there?`,
              )
          }
          className="btn btn-accent rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink"
        >
          Ask the analyst to explain this place
        </button>

        {t && meta && (
          <details className="group rounded-lg border border-line px-4 py-2.5 text-sm">
            <summary className="cursor-pointer list-none text-xs font-semibold text-muted marker:hidden">
              <span className="inline-flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="transition-transform duration-200 group-open:rotate-90">
                  <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                For scientists: the exact numbers
              </span>
            </summary>
            <div className="mt-2">
              <Stat k="Rate of change" v={formatRate(t.slope_per_decade, t.units)} />
              <Stat k="p-value (single test)" v={formatP(t.p)} />
              <Stat k="p-value (adjusted for testing the whole map)" v={formatP(t.q)} />
              <Stat k="Years tested" v={`${t.period[0]}–${t.period[1]}`} />
              <Stat k="Grid square" v={`${t.cell.size_deg}° (about ${Math.round(t.cell.size_deg * 111)} km) at ${formatLatLon(t.cell.lat, t.cell.lon)}`} />
              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                {meta.source}. {meta.method}.
              </p>
            </div>
          </details>
        )}
        {t && (
          <button type="button" onClick={onExport} className="btn btn-quiet rounded-lg border border-line px-3 py-2 text-sm text-ink">
            {exporting ?? "Save this finding as an image"}
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
  if (!change || !h) return <div className="p-5 text-sm text-muted">This spot is no longer on the map.</div>;
  const changedType = h.from !== h.to && h.transition !== "no class change";
  const football = Math.round((h.area_km2 * 1e6) / 7140);
  return (
    <>
      <Header
        eyebrow={`Changed between ${change.year_a} and ${change.year_b}`}
        title={changedType ? `${h.from} → ${h.to}` : "The surface changed"}
        sub={formatLatLon(h.lat, h.lon)}
      />
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-[17px] font-medium leading-snug text-ink">
          {changedType ? (
            <>
              In {change.year_a} this was <span className="mark">{h.from.toLowerCase()}</span>. By {change.year_b} it had become{" "}
              <span className="mark">{h.to.toLowerCase()}</span>.
            </>
          ) : (
            <>Satellites saw this patch change a lot, but it's still the same kind of land ({h.to.toLowerCase()}). Think new crops, cleared plots or construction.</>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-ground px-3 py-2.5">
            <p className="text-[11px] text-muted">Size</p>
            <p className="tabular text-lg font-semibold">{h.area_km2.toFixed(2)} km²</p>
            <p className="text-[11px] text-faint">about {football.toLocaleString()} football pitches</p>
          </div>
          <div className="rounded-lg bg-ground px-3 py-2.5">
            <p className="text-[11px] text-muted">How much it changed</p>
            <p className="tabular text-lg font-semibold">{Math.min(100, Math.round((h.score / 1) * 100))}%</p>
            <p className="text-[11px] text-faint">we flag anything over {Math.round(change.threshold * 100)}%</p>
          </div>
        </div>
        <p className="text-sm leading-snug text-muted">
          Google DeepMind's AlphaEarth compares what every 10 m patch looked like in each year. The land type comes from Dynamic World. Zoom in to see the ground itself.
        </p>
        <section>
          <p className="mb-1.5 text-xs font-semibold text-muted">What NASA's long records say about this spot</p>
          <ul className="flex flex-col gap-1">
            {others.map((q, i) => {
              const vid = VARIABLE_IDS[i];
              const f = q.data ? explain(vid, q.data) : null;
              return (
                <li key={vid} className="flex items-baseline justify-between gap-3 border-t border-line py-1.5 text-sm first:border-t-0">
                  <span className="text-muted">{PLAIN[vid].name}</span>
                  <span className="text-right">
                    {!f ? "…" : f.status === "proven" ? <span className="mark font-medium">{f.headline}</span> : <span className="text-faint">{f.status === "nodata" ? "no data" : "no proven change"}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <details className="group rounded-lg border border-line px-4 py-2.5 text-sm">
          <summary className="cursor-pointer list-none text-xs font-semibold text-muted">For scientists: method</summary>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Change score {h.score.toFixed(2)} (cosine distance between annual AlphaEarth embeddings; threshold {change.threshold}). {change.method}.
          </p>
        </details>
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
  const plain = PLAIN[divergence.variable];
  const row = (title: string, c: typeof pair.increasing, color: string) => (
    <div className="rounded-lg bg-ground px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} aria-hidden />
        {title}
      </p>
      <p className="tabular mt-1 text-sm text-muted">
        {formatRate(c.slope_per_decade, divergence.units.replace(" per decade", ""))} across {(c.area_km2 / 1e6).toFixed(2)} million km²
      </p>
    </div>
  );
  return (
    <>
      <Header eyebrow={`${plain.name}, ${divergence.period[0]}–${divergence.period[1]}`} title="Opposite trends" />
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="text-[17px] font-medium leading-snug">
          Two regions {pair.distance_km.toLocaleString()} km apart are moving in <span className="mark">opposite directions</span>: one is{" "}
          {plain.up}, the other {plain.down}. Both are proven, not luck.
        </p>
        {row(`This region is ${plain.up}`, pair.increasing, upColor)}
        {row(`This region is ${plain.down}`, pair.decreasing, downColor)}
        <p className="text-[12px] leading-relaxed text-muted">
          The same weather system can push one place wetter and another drier. We show where it happens; working out why takes more science, so we
          don't guess a cause.
        </p>
      </div>
    </>
  );
}

function FireCase({ fire }: { fire: Fire }) {
  const size = fireSize(fire.frp);
  const near = useQuery({
    queryKey: ["nearest", fire.lat.toFixed(3), fire.lon.toFixed(3)],
    queryFn: () => api.nearestPlace(fire.lat, fire.lon),
    staleTime: Infinity,
    retry: 1,
  });
  const place = near.data?.place;
  const where = place
    ? place.distance_km < 1.5
      ? `In ${place.name}`
      : `About ${place.distance_km < 10 ? place.distance_km.toFixed(1) : Math.round(place.distance_km)} km ${place.direction} of ${place.name}`
    : null;
  const conf = fire.confidence === "h" ? "high" : fire.confidence === "l" ? "low" : "normal";
  return (
    <>
      <Header eyebrow="Fire seen from space" title={size.title} sub={where ? `${where}. ${formatLatLon(fire.lat, fire.lon)}` : formatLatLon(fire.lat, fire.lon)} />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-start gap-3">
          <Flame scale={1.4} />
          <p className="text-[17px] font-medium leading-snug text-ink">
            NASA's VIIRS satellite saw this spot burning <span className="mark">{hoursAgo(fire.time)}</span>. {size.label}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-ground px-3 py-2.5">
            <p className="text-[11px] text-muted">Heat given off</p>
            <p className="tabular text-lg font-semibold">{Math.round(fire.frp)} MW</p>
            <p className="text-[11px] text-faint">megawatts of fire power</p>
          </div>
          <div className="rounded-lg bg-ground px-3 py-2.5">
            <p className="text-[11px] text-muted">How sure NASA is</p>
            <p className="text-lg font-semibold capitalize">{conf}</p>
            <p className="text-[11px] text-faint">that this is a real fire</p>
          </div>
        </div>
        <p className="text-sm leading-snug text-muted">
          The red circle on the ground shows the patch the satellite saw, about 375 m across. Most hot spots are farm, bush or forest fires; a few are gas
          flares, volcanoes or factories.
        </p>
        <button
          type="button"
          onClick={() => useApp.getState().select({ kind: "point", lat: fire.lat, lon: fire.lon })}
          className="btn btn-quiet rounded-lg border border-line px-3 py-2 text-sm text-ink"
        >
          Is this area changing over the years?
        </button>
        <p className="text-[11px] text-faint">NASA FIRMS, VIIRS NOAA-20, detected {fire.time.replace("T", " ").replace("Z", " UTC")}.</p>
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      <div className="h-36 animate-pulse rounded-lg bg-ground" />
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
