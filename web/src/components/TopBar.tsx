import { isLite, setLite } from "../lib/lite";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { PLAIN } from "../lib/plain";
import { navigate } from "../lib/router";
import { useVariables } from "../lib/useVariables";
import { useApp } from "../state/store";

const BASES = [
  { id: "satellite", label: "Satellite", tip: "Real satellite photos of the ground. Zoom in all the way to see streets and houses." },
  { id: "night", label: "Night lights", tip: "NASA's Black Marble: Earth at night. Bright areas are cities and roads." },
] as const;

/** A small explanation card that appears under a control on hover or keyboard focus. */
function Tip({ title, body, children, align = "center" }: { title: string; body: string; children: ReactNode; align?: "center" | "right" }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className={`panel-shadow pointer-events-none absolute top-[calc(100%+10px)] z-40 w-[260px] rounded-xl border border-line bg-paper px-3.5 py-3 text-left ${
              align === "right" ? "right-0 origin-top-right" : "left-1/2 -translate-x-1/2 origin-top"
            }`}
          >
            <p className="text-sm font-semibold text-ink">{title}</p>
            <p className="mt-1 text-[13px] leading-snug text-muted">{body}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TopBar() {
  const { variable, setVariable, base, setBase, buildings, setBuildings, showFires, toggleFires, showLabels, setShowLabels } = useApp();
  const photorealistic = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity }).data?.photorealistic ?? false;
  const variables = useVariables().data ?? [];

  return (
    <header
      data-reveal
      data-intro="top"
      data-section
      className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/95 px-4 py-2.5 min-[1280px]:gap-5 min-[1280px]:px-5"
    >
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigate("/", e.nativeEvent);
        }}
        className="flex items-baseline gap-3"
        title="Back to the story"
      >
        <span className="atlas whitespace-nowrap text-[22px] text-ink min-[1280px]:text-[26px]">Ground Truth</span>
      </a>

      <div className="flex items-center gap-2">
        <span className="hidden whitespace-nowrap text-xs font-medium text-muted min-[1536px]:inline">The globe shows</span>
        <nav aria-label="What the globe shows" className="flex items-center gap-1 rounded-xl border border-line bg-ground p-1">
          {variables.map((v) => {
            const plain = PLAIN[v.id];
            const on = variable === v.id;
            return (
              <Tip key={v.id} title={plain.question} body={`${plain.what} Coloured where the change is confirmed.`}>
                <button
                  type="button"
                  onClick={() => setVariable(v.id)}
                  aria-pressed={on}
                  className={`btn relative rounded-lg whitespace-nowrap px-2.5 py-1.5 text-[13px] min-[1280px]:px-3 min-[1280px]:text-sm ${on ? "text-accent-ink" : "btn-quiet text-muted"}`}
                >
                  {on && (
                    <motion.span
                      layoutId="variable-pill"
                      className="absolute inset-0 rounded-lg bg-accent"
                      transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
                    />
                  )}
                  <span className="relative font-medium">{plain.name}</span>
                </button>
              </Tip>
            );
          })}
        </nav>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div role="radiogroup" aria-label="Background map" className="flex gap-1 rounded-xl border border-line bg-ground p-1 text-sm">
          {BASES.map((b) => (
            <Tip key={b.id} title={b.label} body={b.tip}>
              <button
                type="button"
                role="radio"
                aria-checked={base === b.id}
                onClick={() => setBase(b.id)}
                className={`btn relative rounded-lg px-2.5 py-1 ${base === b.id ? "text-ink" : "btn-quiet text-muted"}`}
              >
                {base === b.id && (
                  <motion.span layoutId="base-pill" className="absolute inset-0 rounded-lg bg-paper shadow-sm" transition={{ duration: 0.25 }} />
                )}
                <span className="relative whitespace-nowrap">{b.label}</span>
              </button>
            </Tip>
          ))}
        </div>
        <Tip
          title="3D buildings"
          body={
            isLite()
              ? "Off in Lite mode, to save data. Turn Lite off to see 3D cities."
              : photorealistic
              ? "When you zoom close to a city, real 3D buildings appear. To tilt the view, hold Ctrl and drag, or drag with the right mouse button."
              : "Needs a Cesium ion token in .env."
          }
        >
          <button
            type="button"
            onClick={() => setBuildings(!buildings)}
            disabled={!photorealistic || isLite()}
            aria-pressed={photorealistic && !isLite() && buildings}
            className={`btn whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[13px] min-[1280px]:px-3 min-[1280px]:text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
              photorealistic && !isLite() && buildings ? "border-ink bg-ink text-paper" : "btn-quiet border-line text-muted"
            }`}
          >
            3D buildings
          </button>
        </Tip>
        <Tip
          title="Place names"
          body="Countries, cities, neighbourhoods, streets and landmarks, more as you zoom in. Click a name to get its report. From OpenStreetMap."
        >
          <button
            type="button"
            onClick={() => setShowLabels(!showLabels)}
            aria-pressed={showLabels}
            className={`btn whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[13px] min-[1280px]:px-3 min-[1280px]:text-sm ${showLabels ? "border-ink bg-ink text-paper" : "btn-quiet border-line text-muted"}`}
          >
            Names
          </button>
        </Tip>
        <Tip title="Fires burning now" body="Every hot spot NASA's VIIRS satellite has seen burning in the last 24 hours, worldwide. Updated every 10 minutes.">
          <button
            type="button"
            onClick={toggleFires}
            aria-pressed={showFires}
            className={`btn flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[13px] min-[1280px]:px-3 min-[1280px]:text-sm ${
              showFires ? "border-fire bg-fire text-white" : "btn-quiet border-line text-ink"
            }`}
          >
            <svg width="11" height="13" viewBox="0 0 11 13" aria-hidden>
              <path d="M5.5 0C6 3 9.5 4.5 9.5 8.2A4 4 0 0 1 1.5 8.2C1.5 6.4 2.6 5.3 3.3 4.6c.1 1.3.8 2 1.5 2.3C4.4 4.6 4.8 2 5.5 0z" fill="currentColor" />
            </svg>
            Fires now
          </button>
        </Tip>
        <Tip title="Lite mode" body="For slow or costly connections: a smooth Earth, lighter maps and no 3D buildings. Turns on by itself when your connection looks slow. Reloads the map." align="right">
          <button
            type="button"
            onClick={() => setLite(!isLite())}
            aria-pressed={isLite()}
            className={`btn whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[13px] min-[1280px]:px-3 min-[1280px]:text-sm ${isLite() ? "border-ink bg-ink text-paper" : "btn-quiet border-line text-ink"}`}
          >
            Lite
          </button>
        </Tip>
        <Tip title="How do we know?" body="Every dataset and its source, how we test each trend, the checks against published science, how Aisha stays honest, and what we can't tell." align="right">
          <button type="button" onClick={(e) => navigate("/methods", e.nativeEvent)} className="btn btn-quiet whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-[13px] min-[1280px]:px-3 min-[1280px]:text-sm text-ink">
            How we know
          </button>
        </Tip>
      </div>
    </header>
  );
}
