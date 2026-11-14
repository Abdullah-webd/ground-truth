import { motion } from "motion/react";
import { useApp } from "../state/store";
import { CaseContent } from "./CaseFile";
import { FirePanel } from "./FirePanel";
import { InvestigateContent } from "./InvestigatePanel";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";

type Tab = "ask" | "details";

/** Tablets in landscape and small laptops: the globe plus one right-hand panel with Ask | Details tabs. */
export function TabletShell() {
  const { selection, select, panelView, setPanelView } = useApp();
  // Places you tap show their details; the analyst's own selections keep its answer on screen.
  const tab: Tab = selection && panelView === "case" ? "details" : "ask";
  const setTab = (t: Tab) => setPanelView(t === "details" ? "case" : "ask");

  return (
    <>
      <TopBar />
      <FirePanel variant="tablet" />
      <Timeline variant="tablet" />
      <aside
        data-intro="left"
        aria-label="Ask and details"
        className="panel-shadow pointer-events-auto absolute bottom-4 right-4 top-[72px] z-20 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-line bg-panel"
      >
        <div role="tablist" aria-label="Panel" className="m-3 mb-0 grid grid-cols-2 gap-1 rounded-xl border border-line bg-ground p-1">
          {(["ask", "details"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              disabled={t === "details" && !selection}
              onClick={() => setTab(t)}
              className={`btn relative h-10 rounded-lg text-sm font-medium disabled:opacity-40 ${tab === t ? "text-ink" : "text-muted"}`}
            >
              {tab === t && <motion.span layoutId="tablet-tab" className="absolute inset-0 rounded-lg bg-panel-2" transition={{ duration: 0.25 }} />}
              <span className="relative">{t === "ask" ? "Ask the analyst" : "Details"}</span>
            </button>
          ))}
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {/* Both stay mounted, so a conversation survives switching tabs. */}
          <div className={tab === "ask" ? "flex flex-col gap-4 p-4" : "hidden"}>
            <InvestigateContent />
          </div>
          {selection && (
            <div className={tab === "details" ? "" : "hidden"}>
              <CaseContent selection={selection} onClose={() => select(null)} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
