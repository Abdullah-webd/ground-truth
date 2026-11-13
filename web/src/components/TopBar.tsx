import { motion } from "motion/react";
import { useVariables } from "../lib/useVariables";
import { useApp } from "../state/store";

const BASES = [
  { id: "night", label: "Night lights", title: "NASA Black Marble: city lights at night" },
  { id: "day", label: "Blue Marble", title: "NASA Blue Marble: shaded relief and bathymetry" },
  { id: "satellite", label: "Sentinel-2", title: "Sentinel-2 cloudless 2023, 10 m: best for close-up change" },
] as const;

export function TopBar() {
  const { variable, setVariable, base, setBase, showFires, toggleFires, setChecksOpen } = useApp();
  const variables = useVariables().data ?? [];

  return (
    <header
      data-reveal
      data-intro="top"
      data-section
      className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex items-center gap-6 border-b border-line bg-ground/95 px-5 py-2.5"
    >
      <div className="flex items-baseline gap-3">
        <span className="atlas text-[26px] text-ink">Ground Truth</span>
        <span className="hidden text-xs text-muted lg:inline">Earth System Trend Detective</span>
      </div>

      <nav aria-label="Variable" className="flex items-center gap-1 rounded-lg border border-line bg-panel p-1">
        {variables.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVariable(v.id)}
            aria-pressed={variable === v.id}
            className={`btn relative rounded-md px-3 py-1.5 text-sm ${variable === v.id ? "text-accent-ink" : "btn-quiet text-muted"}`}
          >
            {variable === v.id && (
              <motion.span
                layoutId="variable-pill"
                className="absolute inset-0 rounded-md bg-accent"
                transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
              />
            )}
            <span className="relative font-medium">{v.label}</span>
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div role="radiogroup" aria-label="Base map" className="flex gap-1 rounded-lg border border-line bg-panel p-1 text-sm">
          {BASES.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={base === b.id}
              onClick={() => setBase(b.id)}
              title={b.title}
              className={`btn relative rounded-md px-2.5 py-1 ${base === b.id ? "text-ink" : "btn-quiet text-muted"}`}
            >
              {base === b.id && <motion.span layoutId="base-pill" className="absolute inset-0 rounded-md bg-panel-2" transition={{ duration: 0.25 }} />}
              <span className="relative">{b.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleFires}
          aria-pressed={showFires}
          className={`btn rounded-md border px-3 py-1.5 text-sm ${
            showFires ? "border-[#ff8c3a] text-[#ffb347]" : "btn-quiet border-line text-muted"
          }`}
          title="NASA FIRMS active fires, last 24 hours"
        >
          Live fires
        </button>
        <button
          type="button"
          onClick={() => setChecksOpen(true)}
          className="btn btn-quiet rounded-md border border-line px-3 py-1.5 text-sm text-ink"
        >
          How we test
        </button>
      </div>
    </header>
  );
}
