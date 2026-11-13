import { motion } from "motion/react";
import { useVariables } from "../lib/useVariables";
import { useApp } from "../state/store";
import { Legend } from "./Legend";

export function Timeline() {
  const { variable, mapView, setMapView, year, setYear, playing, setPlaying } = useApp();
  const meta = useVariables().data?.find((v) => v.id === variable);
  if (!meta) return null;
  const [y0, y1] = meta.years;
  const current = year ?? y1;
  const missing = meta.years_missing.includes(current);

  const showYears = () => {
    if (year == null) setYear(y0);
    setMapView("year");
  };

  return (
    <div
      data-reveal
      data-intro="bottom"
      data-section
      className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-end gap-6 rounded-xl border border-line bg-panel px-5 py-3.5"
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
                <motion.span layoutId="view-pill" className="absolute inset-0 rounded-md bg-panel-2" transition={{ duration: 0.25 }} />
              )}
              <span className="relative">{v === "trend" ? "Where it's trending" : "Year by year"}</span>
            </button>
          ))}
        </div>
        <p className="max-w-[300px] text-xs text-muted">
          {mapView === "trend"
            ? `${meta.label}, ${y0}–${y1}. Coloured where the trend is statistically significant.`
            : `Each year compared with the ${meta.legend.frames.baseline}.`}
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
            {missing && <span className="text-[11px] text-bad">No data this year (satellite gap)</span>}
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
            className="w-[220px] accent-[var(--color-accent)]"
          />
        </motion.div>
      )}

      <Legend meta={meta} mode={mapView} />
    </div>
  );
}
