import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { globe } from "../globe/controller";
import { api, ApiError } from "../lib/api";
import { formatRate, shortPlace } from "../lib/format";
import type { BBox } from "../lib/types";
import { useVariables } from "../lib/useVariables";
import { useApp } from "../state/store";
import { AskPanel } from "./AskPanel";
import { ErrorNote } from "./CaseFile";

const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const CHANGE_RADIUS_KM = 22;

/** A square box of `km` half-width around a point, in degrees. */
function boxAround(lat: number, lon: number, km: number): BBox {
  const dLat = km / 110.57;
  const dLon = km / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

const listItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -10 },
};

export function InvestigatePanel() {
  const { variable, selection, select, announce, change, setChange, changeLoading, setChangeLoading, divergence, setDivergence } =
    useApp();
  const meta = useVariables().data?.find((v) => v.id === variable);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yearA, setYearA] = useState(2018);
  const [yearB, setYearB] = useState(2024);
  const [divLoading, setDivLoading] = useState(false);

  const point = selection?.kind === "point" ? selection : null;

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const place = await api.locate(q);
      announce(shortPlace(place.name));
      select({ kind: "point", lat: place.lat, lon: place.lon, name: place.name });
      const [w, s, e2, n] = place.bbox;
      const g = globe.get();
      if (g) {
        if (e2 - w > 0.05 && e2 - w < 40 && n - s < 40) void g.flyToBox(place.bbox);
        else void g.flyToPoint(place.lat, place.lon, 1.2e6);
      }
      // Hand the place to the analyst so the full investigation appears in this panel.
      useApp
        .getState()
        .ask(`Brief me on ${shortPlace(place.name)}: what changed on the ground since 2018, and which long-term NASA trends are statistically significant there? Explain what it means for people there.`);
      setQuery("");
    } catch (err) {
      setError(err instanceof ApiError && err.code === "place_not_found" ? `No place called "${q}" was found. Try adding the country.` : (err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function onDetectChange() {
    if (!point) return;
    setChangeLoading(true);
    setError(null);
    try {
      const bbox = boxAround(point.lat, point.lon, CHANGE_RADIUS_KM);
      const result = await api.change(bbox, yearA, yearB);
      setChange(result);
      useApp.getState().setBase("satellite"); // see the real ground under the change layer
      await globe.get()?.flyToBox(bbox, 1.8);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChangeLoading(false);
    }
  }

  async function onDivergence() {
    setDivLoading(true);
    setError(null);
    try {
      const d = await api.divergence(variable, undefined, 3);
      setDivergence(d);
      if (d.pairs.length) {
        select({ kind: "pair", index: 0 });
        const p = d.pairs[0];
        const box: BBox = [
          Math.min(p.increasing.bbox[0], p.decreasing.bbox[0]),
          Math.min(p.increasing.bbox[1], p.decreasing.bbox[1]),
          Math.max(p.increasing.bbox[2], p.decreasing.bbox[2]),
          Math.max(p.increasing.bbox[3], p.decreasing.bbox[3]),
        ];
        await globe.get()?.flyToBox(box);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDivLoading(false);
    }
  }

  return (
    <aside
      data-reveal
      data-intro="left"
      data-section
      aria-label="Investigate"
      className="scroll-thin pointer-events-auto absolute left-4 top-[68px] z-20 flex max-h-[calc(100%-84px)] w-[360px] flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-panel p-4"
    >
      <AskPanel />

      <form onSubmit={onSearch} className="flex flex-col gap-2 border-t border-line pt-3">
        <label htmlFor="place-search" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Or go to a place
        </label>
        <div className="flex gap-2">
          <input
            id="place-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lagos, Greenland, Punjab…"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-md border border-line bg-ground px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button type="submit" disabled={searching} className="btn btn-accent rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-60">
            {searching ? "Finding…" : "Go"}
          </button>
        </div>
        <p className="text-xs text-faint">Or click anywhere on the globe.</p>
      </form>

      {error && <ErrorNote message={error} />}

      {meta && (
        <section className="border-t border-line pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">This map</p>
          <p className="mt-1 text-sm leading-snug">
            <span className="tabular text-ink">{(meta.summary.share_area_significant_increase * 100).toFixed(1)}%</span>{" "}
            <span className="text-muted">of tested area is significantly {meta.increase_means},</span>{" "}
            <span className="tabular text-ink">{(meta.summary.share_area_significant_decrease * 100).toFixed(1)}%</span>{" "}
            <span className="text-muted">{meta.decrease_means}, {meta.years[0]}–{meta.years[1]}.</span>
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">What changed on the ground?</p>
        <p className="text-sm text-muted">
          {point
            ? "Compares satellite embeddings of every 10 m patch within about 22 km of the selected point. No variable needs choosing."
            : "Select a place first, then look for land-surface change around it."}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="year-a" className="sr-only">From year</label>
          <select id="year-a" value={yearA} onChange={(e) => setYearA(Number(e.target.value))} className="rounded-md border border-line bg-ground px-2 py-1.5">
            {YEARS.filter((y) => y < yearB).map((y) => <option key={y}>{y}</option>)}
          </select>
          <span className="text-muted">to</span>
          <label htmlFor="year-b" className="sr-only">To year</label>
          <select id="year-b" value={yearB} onChange={(e) => setYearB(Number(e.target.value))} className="rounded-md border border-line bg-ground px-2 py-1.5">
            {YEARS.filter((y) => y > yearA).map((y) => <option key={y}>{y}</option>)}
          </select>
          <button
            type="button"
            onClick={onDetectChange}
            disabled={!point || changeLoading}
            className="btn btn-quiet ml-auto rounded-md border border-line px-3 py-1.5 text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {changeLoading ? "Scanning…" : "Detect change"}
          </button>
        </div>
        <AnimatePresence initial={false}>
          {change && (
            <motion.div {...listItem} transition={{ duration: 0.2 }} className="flex flex-col gap-1">
              <p className="tabular text-xs text-muted">
                {change.hotspots.length} hotspots; {(change.share_strong_change * 100).toFixed(2)}% of the area changed strongly
              </p>
              <ul className="flex flex-col">
                {change.hotspots.slice(0, 8).map((h, i) => (
                  <motion.li key={h.id} {...listItem} transition={{ duration: 0.2, delay: i * 0.04, ease: [0.23, 1, 0.32, 1] }}>
                    <button
                      type="button"
                      onClick={() => {
                        select({ kind: "hotspot", id: h.id });
                        void globe.get()?.flyToPoint(h.lat, h.lon, 9000, 1.6);
                      }}
                      className="btn btn-quiet flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left text-sm"
                    >
                      <span className="truncate">{h.transition}</span>
                      <span className="tabular shrink-0 text-xs text-muted">{h.area_km2.toFixed(2)} km²</span>
                    </button>
                  </motion.li>
                ))}
              </ul>
              <button type="button" onClick={() => setChange(null)} className="link self-start text-xs text-muted">
                Clear change layer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Opposite trends</p>
        <p className="text-sm text-muted">Find regions where {meta?.label.toLowerCase() ?? "this variable"} is significantly rising in one place and falling in another.</p>
        <button type="button" onClick={onDivergence} disabled={divLoading} className="btn btn-quiet self-start rounded-md border border-line px-3 py-1.5 text-sm text-ink">
          {divLoading ? "Searching…" : "Find divergence"}
        </button>
        {divergence?.variable === variable && (
          <ul className="flex flex-col">
            {divergence.pairs.map((p, i) => (
              <li key={`${p.increasing.id}-${p.decreasing.id}`}>
                <button
                  type="button"
                  onClick={() => select({ kind: "pair", index: i })}
                  className="btn btn-quiet flex w-full justify-between gap-2 rounded-md px-2 py-1 text-left text-sm"
                >
                  <span className="tabular text-up">{formatRate(p.increasing.slope_per_decade, meta?.units ?? "")}</span>
                  <span className="text-faint">vs</span>
                  <span className="tabular text-down">{formatRate(p.decreasing.slope_per_decade, meta?.units ?? "")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
