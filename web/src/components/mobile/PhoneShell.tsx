import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isLite, setLite, slowConnection } from "../../lib/lite";
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
import { Aisha } from "../Aisha";

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
    if (!selection && useApp.getState().sheet === "peek" && !useApp.getState().voiceActive) setSheet("hidden");
  }, [selection, setSheet]);
  // Starting a voice conversation brings the sheet up so you can see the transcript and the evidence.
  const voiceActive = useApp((st) => st.voiceActive);
  useEffect(() => {
    if (voiceActive && useApp.getState().sheet === "hidden") setSheet("half");
  }, [voiceActive, setSheet]);

  const peek = showCase ? PEEK_CASE : PEEK_ASK;
  const placeName =
    selection?.kind === "point" ? (selection.name ? selection.name.split(",")[0] : "this spot") : selection?.kind === "fire" ? "this fire" : "this place";

  return (
    <>
      <PhoneHeader />
      <FirePanel variant="phone" />
      <AnimatePresence>
        {(sheet === "peek" || sheet === "hidden") && !layersOpen && (
          <motion.div
            key="timeline"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <Timeline variant="phone" bottom={sheet === "hidden" ? "var(--dock-h, 96px) + 52px" : `${peek + 52}px`} />
          </motion.div>
        )}
      </AnimatePresence>
      <LayersButton
        bottom={
          sheet === "hidden"
            ? "var(--dock-h, 96px)"
            : sheet === "peek"
              ? `${peek}px`
              : sheet === "half"
                ? `${Math.round((window.visualViewport?.height ?? window.innerHeight) * 0.52)}px`
                : null
        }
        open={layersOpen}
        onToggle={() => setLayersOpen(!layersOpen)}
      />
      <AnimatePresence>{layersOpen && <LayersSheet onClose={() => setLayersOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{sheet === "hidden" && !layersOpen && <AishaDock />}</AnimatePresence>
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

function LayersButton({ bottom, open, onToggle }: { bottom: string | null; open: boolean; onToggle: () => void }) {
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
          style={{ bottom: `calc(${bottom} + 12px + var(--kb, 0px))` }}
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
  const { base, setBase, buildings, setBuildings, showLabels, setShowLabels, showFires, toggleFires, flatMap, setFlatMap } = useApp();
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
        <Toggle
          on={isLite()}
          onClick={() => setLite(!isLite())}
          title="Lite mode"
          sub={`For slow or costly data: a smooth Earth, lighter maps, no 3D. ${slowConnection() ? "Your connection looks slow, so it's suggested." : "Reloads the map."}`}
        />
        <button
          type="button"
          onClick={(e) => {
            onClose();
            navigate("/methods", e.nativeEvent);
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

/** The way in on a phone: one big "Ask Aisha" button (tap to talk), with typing one tap away. */
function AishaDock() {
  const { requestVoice, setSheet, aishaState } = useApp();
  // Publish this area's height so the legend and Layers button always sit above it (bubble included).
  const dockRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--dock-h", `${el.offsetHeight + 18}px`);
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => {
      ro.disconnect();
      root.style.removeProperty("--dock-h");
    };
  }, []);
  const [hello, setHello] = useState(() => {
    try {
      return !localStorage.getItem("gt-aisha-hello");
    } catch {
      return true;
    }
  });
  const dismissHello = () => {
    setHello(false);
    try {
      localStorage.setItem("gt-aisha-hello", "1");
    } catch {
      /* private mode: fine, the bubble just shows again next time */
    }
  };
  // The hello bubble covers part of the map: let it go by itself after a few seconds.
  useEffect(() => {
    if (!hello) return;
    const id = window.setTimeout(dismissHello, 7000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hello]);
  const type = () => {
    dismissHello();
    setSheet("full");
    window.setTimeout(() => document.getElementById("ask")?.focus(), 350);
  };
  return (
    <motion.div
      ref={dockRef}
      key="aisha-dock"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 32 } }}
      exit={{ opacity: 0, y: 16, transition: { duration: 0.15 } }}
      className="pointer-events-none fixed inset-x-0 z-30 flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px + var(--kb, 0px))" }}
    >
      <AnimatePresence>
        {hello && (
          <motion.button
            type="button"
            onClick={dismissHello}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.6, duration: 0.3, ease: [0.23, 1, 0.32, 1] } }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.15 } }}
            className="panel-shadow pointer-events-auto relative max-w-[300px] rounded-2xl border border-line bg-paper px-3.5 py-2.5 text-left text-[13px] leading-snug text-ink"
          >
            Hi, I'm <strong>Aisha</strong>. Ask me anything about where you live, out loud or by typing. I'll show you the NASA evidence.
            <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-line bg-paper" aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            dismissHello();
            requestVoice();
          }}
          className="btn panel-shadow flex h-16 items-center gap-3 rounded-full bg-accent pl-2 pr-6 text-[17px] font-semibold text-accent-ink"
          aria-label="Ask Aisha: tap to talk"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[#0b0f15]">
            <Aisha state={aishaState} size={44} />
          </span>
          Ask Aisha
          <svg viewBox="0 0 14 14" className="h-5 w-5" aria-hidden>
            <rect x="4.5" y="1" width="5" height="8" rx="2.5" fill="currentColor" />
            <path d="M2.5 6.5a4.5 4.5 0 0 0 9 0M7 11v2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={type}
          aria-label="Type a question to Aisha"
          className="btn panel-shadow grid h-14 w-14 place-items-center rounded-full border border-line bg-paper text-ink"
        >
          <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden>
            <rect x="1" y="1" width="20" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 5h1M9 5h1M13 5h1M17 5h0M5 8.5h1M9 8.5h1M13 8.5h1M7 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
