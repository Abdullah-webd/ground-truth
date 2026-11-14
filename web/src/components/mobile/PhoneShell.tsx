import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { api } from "../../lib/api";
import { trackVisualViewport } from "../../lib/layout";
import { PLAIN } from "../../lib/plain";
import { navigate } from "../../lib/router";
import { useVariables } from "../../lib/useVariables";
import { useApp } from "../../state/store";
import { CaseContent } from "../CaseFile";
import { FirePanel } from "../FirePanel";
import { InvestigateContent } from "../InvestigatePanel";
import { Timeline } from "../Timeline";
import { BottomSheet } from "./BottomSheet";

const PEEK_ASK = 248; // title, the text box and Talk / Ask: the analyst is ready from the first second
const PEEK_CASE = 196; // place name and the one-line answer

/**
 * Phones: the map fills the screen; one bottom sheet holds the analyst (first), or the case file for
 * whatever you tapped. Variables are swipeable chips at the top; everything else is under Layers.
 */
export function PhoneShell() {
  const { selection, select, sheet, setSheet, layersOpen, setLayersOpen, panelView, setPanelView } = useApp();
  const showCase = !!selection && panelView === "case";

  useEffect(() => trackVisualViewport(), []);

  // Something you tapped opens its case file at half height; closing it returns to the analyst.
  useEffect(() => {
    if (showCase && Date.now() - useApp.getState().flightAt > 3000) setSheet("half");
  }, [showCase, selection, setSheet]);
  useEffect(() => {
    if (!selection) setSheet("peek");
  }, [selection, setSheet]);

  const peek = showCase ? PEEK_CASE : PEEK_ASK;
  const placeName =
    selection?.kind === "point" ? (selection.name ? selection.name.split(",")[0] : "this spot") : selection?.kind === "fire" ? "this fire" : "this place";

  return (
    <>
      <PhoneHeader />
      <FirePanel variant="phone" />
      <AnimatePresence>
        {sheet === "peek" && !layersOpen && (
          <motion.div
            key="timeline"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <Timeline variant="phone" bottom={peek + 52} />
          </motion.div>
        )}
      </AnimatePresence>
      <LayersButton
        bottom={sheet === "peek" ? peek : sheet === "half" ? Math.round((window.visualViewport?.height ?? window.innerHeight) * 0.52) : null}
        open={layersOpen}
        onToggle={() => setLayersOpen(!layersOpen)}
      />
      <AnimatePresence>{layersOpen && <LayersSheet onClose={() => setLayersOpen(false)} />}</AnimatePresence>
      <BottomSheet
        snap={sheet}
        onSnap={setSheet}
        peek={peek}
        label={showCase ? "Place details" : "Ask the analyst"}
        header={
          showCase ? (
            <div className="flex w-full items-center px-2">
              <button type="button" onClick={() => setPanelView("ask")} className="btn btn-quiet flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M9 2L4 7l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                Back to the analyst
              </button>
            </div>
          ) : selection ? (
            <div className="flex w-full justify-end px-3">
              <button
                type="button"
                onClick={() => {
                  setPanelView("case");
                  setSheet("half");
                }}
                className="btn btn-quiet flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] text-ink"
              >
                See details for {placeName}
                <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
                  <path d="M5 2l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </button>
            </div>
          ) : null
        }
      >
        {/* The analyst stays mounted under the case file, so a conversation keeps going (and survives) while you look at a place. */}
        {showCase && selection && (
          <div className="-mx-4">
            <CaseContent selection={selection} onClose={() => select(null)} />
          </div>
        )}
        <div className={showCase ? "hidden" : "flex flex-col gap-4 pt-1"}>
          <InvestigateContent />
        </div>
      </BottomSheet>
    </>
  );
}

function PhoneHeader() {
  const { variable, setVariable } = useApp();
  const variables = useVariables().data ?? [];
  return (
    <header
      data-intro="top"
      className="pointer-events-auto fixed inset-x-0 top-0 z-30 flex flex-col gap-2 border-b border-line bg-paper/95 pb-2 pt-[calc(env(safe-area-inset-top,0px)+8px)]"
    >
      <div className="flex items-center justify-between px-4">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/", e.nativeEvent);
          }}
          className="atlas text-[22px] text-ink"
        >
          Ground Truth
        </a>
        <span className="text-xs text-muted">The map shows</span>
      </div>
      <nav aria-label="What the map shows" className="scroll-thin flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {variables.map((v) => {
          const on = v.id === variable;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setVariable(v.id)}
              aria-pressed={on}
              className={`btn relative h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium ${on ? "border-accent text-accent-ink" : "border-line text-muted"}`}
            >
              {on && <motion.span layoutId="chip-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", duration: 0.35, bounce: 0.1 }} />}
              <span className="relative">{PLAIN[v.id].name}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function LayersButton({ bottom, open, onToggle }: { bottom: number | null; open: boolean; onToggle: () => void }) {
  return (
    <AnimatePresence>
      {bottom !== null && (
        <motion.button
          key="layers"
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label="Layers and map options"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          style={{ bottom: `calc(${bottom}px + 12px + var(--kb, 0px))` }}
          className={`btn panel-shadow pointer-events-auto fixed right-3 z-30 flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
            open ? "border-accent bg-accent text-accent-ink" : "border-line bg-paper text-ink"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M8 1.5 1.5 5 8 8.5 14.5 5 8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M1.5 8 8 11.5 14.5 8M1.5 11 8 14.5 14.5 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          Layers
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function Toggle({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`btn flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left ${on ? "border-accent/70 bg-panel-2" : "border-line"}`}
    >
      <span>
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block text-xs leading-snug text-muted">{sub}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`} aria-hidden>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper transition-transform duration-200 ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-ground p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`btn h-10 rounded-lg text-sm font-medium ${value === o.id ? "bg-panel-2 text-ink" : "text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Everything that sits in the desktop top bar, as a sheet of plain toggles. */
function LayersSheet({ onClose }: { onClose: () => void }) {
  const { base, setBase, buildings, setBuildings, showLabels, setShowLabels, showFires, toggleFires, flatMap, setFlatMap, setChecksOpen } = useApp();
  const photorealistic = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity }).data?.photorealistic ?? false;
  return (
    <>
      <motion.div
        key="layers-scrim"
        className="pointer-events-auto fixed inset-0 z-40 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.section
        key="layers-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Layers and map options"
        initial={{ y: "100%" }}
        animate={{ y: 0, transition: { type: "spring", stiffness: 420, damping: 40 } }}
        exit={{ y: "100%", transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-3 overflow-y-auto rounded-t-[22px] border-t border-line bg-panel px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="atlas text-[22px] text-ink">Layers</h2>
          <button type="button" onClick={onClose} className="btn btn-quiet h-10 rounded-lg px-3 text-sm text-muted">
            Done
          </button>
        </div>
        <Segmented
          label="Map or globe"
          value={flatMap ? "map" : "globe"}
          onChange={(v) => setFlatMap(v === "map")}
          options={[
            { id: "map", label: "Map" },
            { id: "globe", label: "Globe" },
          ]}
        />
        <Segmented
          label="Background"
          value={base}
          onChange={(v) => setBase(v)}
          options={[
            { id: "satellite", label: "Satellite" },
            { id: "night", label: "Night lights" },
          ]}
        />
        <Toggle on={showLabels} onClick={() => setShowLabels(!showLabels)} title="Place names" sub="Countries, cities, streets and landmarks. Tap a name for its report." />
        <Toggle on={showFires} onClick={toggleFires} title="Fires now" sub="Every fire NASA's satellites saw in the last 24 hours." />
        {photorealistic && (
          <Toggle
            on={buildings}
            onClick={() => setBuildings(!buildings)}
            title="3D buildings"
            sub="Real 3D cities when you zoom in. Switches to the globe; heavier on older phones."
          />
        )}
        <button
          type="button"
          onClick={() => {
            onClose();
            setChecksOpen(true);
          }}
          className="btn btn-quiet flex min-h-12 items-center justify-between rounded-xl border border-line px-3.5 text-[15px] font-semibold text-ink"
        >
          How we know
          <span className="text-xs font-normal text-muted">tests and checks</span>
        </button>
      </motion.section>
    </>
  );
}
