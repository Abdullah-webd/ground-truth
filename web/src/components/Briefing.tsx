import { motion } from "motion/react";
import { explain, headline, PLAIN, type PlainFinding } from "../lib/plain";
import { VARIABLE_IDS, type PointTrend, type VariableId } from "../lib/types";

const BADGE: Record<PlainFinding["status"], { text: string; cls: string }> = {
  proven: { text: "Proven", cls: "bg-mark text-on-mark" },
  unproven: { text: "Not proven", cls: "bg-panel-2 text-muted" },
  nodata: { text: "No data", cls: "bg-panel-2 text-faint" },
};

/**
 * The answer in everyday words, built only from the NASA numbers (no AI involved).
 * Each row is one NASA record; click it to see its year-by-year chart below.
 */
export function Briefing({
  trends,
  active,
  onPick,
}: {
  trends: (PointTrend | undefined)[];
  active: VariableId;
  onPick: (id: VariableId) => void;
}) {
  if (trends.some((t) => !t)) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <p className="text-sm text-muted">Reading four NASA records for this spot…</p>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-ground" />
        ))}
      </div>
    );
  }
  const findings = (trends as PointTrend[]).map((t, i) => explain(VARIABLE_IDS[i], t));
  return (
    <section aria-label="The short answer" className="flex flex-col gap-3">
      <p className="text-[19px] font-medium leading-snug text-ink">{headline(findings)}</p>
      <ul className="flex flex-col gap-1.5">
        {findings.map((f, i) => {
          const isActive = f.id === active;
          return (
            <motion.li
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06, ease: [0.23, 1, 0.32, 1] }}
            >
              <button
                type="button"
                onClick={() => onPick(f.id)}
                aria-pressed={isActive}
                className={`btn group relative flex w-full flex-col gap-0.5 rounded-lg border px-3.5 py-2.5 text-left ${
                  isActive ? "border-ink/80 bg-paper" : "border-line bg-ground/60 hover:border-ink/30"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted">{PLAIN[f.id].question}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${BADGE[f.status].cls}`}>{BADGE[f.status].text}</span>
                </span>
                <span className={`text-[15px] font-semibold leading-snug ${f.status === "proven" ? "text-ink" : "text-muted"}`}>
                  {f.status === "proven" ? <span className="mark">{f.headline}</span> : f.headline}
                </span>
                <span className="text-sm leading-snug text-muted">{f.detail}</span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
