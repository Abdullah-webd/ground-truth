import { motion } from "motion/react";
import { useVariables } from "../lib/useVariables";
import { useApp } from "../state/store";
import { Legend } from "./Legend";
import { PLAIN } from "../lib/plain";

export function Timeline({ variant = "desktop", bottom }: { variant?: "desktop" | "tablet" | "phone"; bottom?: string }) {
  const { variable, mapView, setMapView, year, setYear, playing, setPlaying } = useApp();
  const caseOpen = useApp((s) => s.selection != null);
  const meta = useVariables().data?.find((v) => v.id === variable);
  if (!meta) return null;
  const [y0, y1] = meta.years;
  const current = year ?? y1;
  const missing = meta.years_missing.includes(current);

  const showYears = () => {
    if (year == null) setYear(y0);
    setMapView("year");
  };

  // Sit in the gap between the left panel (360px) and the case file (380px) so nothing overlaps on laptops.
  return (
    <div
      className={
        variant === "phone"
          ? "pointer-events-none fixed inset-x-3 z-20 flex justify-center"
          : variant === "tablet"
            ? "pointer-events-none absolute bottom-4 left-4 right-[412px] z-20 flex justify-center"
            : `pointer-events-none absolute bottom-4 left-[392px] z-20 flex justify-center transition-[right] duration-300 ${caseOpen ? "right-[412px]" : "right-4"}`
      }
      style={variant === "phone" ? { bottom: `calc(${bottom ?? "0px"} + 10px + var(--kb, 0px))` } : undefined}
    >
    <div
      data-reveal
      data-intro="bottom"
      data-section
      className={`panel-shadow pointer-events-auto flex max-w-full flex-wrap items-end justify-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-panel ${
        variant === "phone" ? "w-full px-3 py-2.5 [&_.legend-detail]:hidden" : "px-5 py-3.5"
      }`}
    >
      <div className="flex flex-col gap-2">
        <div role="tablist" aria-label="Map view" className="flex gap-1 rounded-lg border border-line bg-ground p-1 text-sm">
          {(["trend", "year"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={mapView === v}
              type="button"
              onClick={() => (v === "trend" ? setMapView("trend") : showYears())}
              className={`btn relative rounded-md px-3 py-1 ${mapView === v ? "text-ink" : "btn-quiet text-muted"}`}
            >
              {mapView === v && (
                <motion.span layoutId="view-pill" className="absolute inset-0 rounded-md bg-paper shadow-sm" transition={{ duration: 0.25 }} />
              )}
              <span className="relative">{v === "trend" ? "Proven trends" : "Play the years"}</span>
            </button>
          ))}
        </div>
        <p className={`max-w-[300px] text-xs text-muted ${variant === "phone" ? "hidden" : ""}`}>
          {mapView === "trend"
            ? `Where ${PLAIN[variable].name.toLowerCase()} has really changed since ${y0}. Grey means no clear change.`
            : `Each year compared with the average for ${meta.legend.frames.baseline}. Press play to watch it change.`}
        </p>
      </div>

      {mapView === "year" && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-center gap-3"
        >
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="btn btn-accent grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-ink"
            aria-label={playing ? "Pause the time-lapse" : "Play the time-lapse"}
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1" width="3" height="10" fill="currentColor" /><rect x="7" y="1" width="3" height="10" fill="currentColor" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1l8 5-8 5z" fill="currentColor" /></svg>
            )}
          </button>
          <div className="flex flex-col">
            <span className="atlas tabular text-[34px] text-ink">{current}</span>
            {missing && <span className="text-[11px] text-bad">No data this year (gap between satellites)</span>}
          </div>
          <input
            id="year-scrubber"
            type="range"
            min={y0}
            max={y1}
            step={1}
            value={current}
            onChange={(e) => {
              setPlaying(false);
              setYear(Number(e.target.value));
            }}
            aria-label="Year"
            className={`${variant === "phone" ? "w-[150px]" : "w-[220px]"} accent-[var(--color-ink)]`}
          />
        </motion.div>
      )}

      <Legend meta={meta} mode={mapView} />
    </div>
    </div>
  );
}
