import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { api } from "../lib/api";
import { useApp } from "../state/store";

export function ChecksView() {
  const open = useApp((s) => s.checksOpen);
  const setOpen = useApp((s) => s.setChecksOpen);
  const checks = useQuery({ queryKey: ["checks"], queryFn: api.checks, enabled: open, staleTime: 60_000 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const d = checks.data;
  const tt = d?.trend_tests;
  const methods = tt ? Object.keys(tt.false_alarm) : [];
  const range = (o: Record<string, number>) => {
    const v = Object.values(o);
    return `${(Math.min(...v) * 100).toFixed(1)}–${(Math.max(...v) * 100).toFixed(1)}%`;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto absolute inset-0 z-[60] grid place-items-center bg-ground/80 p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checks-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
            className="scroll-thin panel-shadow max-h-full w-full max-w-[880px] overflow-y-auto rounded-2xl border border-line bg-panel p-5 sm:p-8"
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 id="checks-title" className="atlas text-[48px] text-ink">How we know</h2>
                <p className="mt-2 max-w-[60ch] text-muted">
                  A trend is called significant only when it is very unlikely to be natural variability, after correcting for
                  year-to-year persistence and for testing thousands of map cells. Here is the evidence that the method works.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet rounded-md border border-line px-3 py-1.5 text-sm" autoFocus>
                Close
              </button>
            </div>

            {checks.isPending && <p className="mt-6 text-muted">Loading checks…</p>}
            {checks.isError && <p className="mt-6 text-bad">{(checks.error as Error).message}</p>}

            {d && (
              <>
                <h3 className="mt-8 text-base font-semibold text-ink">Do we reproduce published science?</h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {d.global_temperature && (
                    <CheckRow
                      passed={d.global_temperature.passed}
                      title={d.global_temperature.title}
                      detail={`Ours ${d.global_temperature.ours.toFixed(3)} vs NASA GISS ${d.global_temperature.reference.toFixed(3)} ${d.global_temperature.units} (difference ${d.global_temperature.difference.toFixed(3)}).`}
                      reference={d.global_temperature.detail}
                    />
                  )}
                  {d.regional.map((c) => (
                    <CheckRow key={c.id} passed={c.passed} title={c.title} detail={c.detail} reference={`${c.finding} ${c.reference}`} />
                  ))}
                </ul>

                {tt && (
                  <>
                    <h3 className="mt-8 text-base font-semibold text-ink">Why this test, not the usual one</h3>
                    <p className="mt-2 max-w-[70ch] text-sm text-muted">
                      {tt.replicates.toLocaleString()} simulated series per case. False alarms: how often a method flags a trend in
                      data that has none (should be about 5%). Power: how often it finds a trend that is really there.
                    </p>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted">
                            <th className="py-2 pr-4 font-medium">Method</th>
                            <th className="py-2 pr-4 font-medium">False alarms</th>
                            <th className="py-2 font-medium">Power</th>
                          </tr>
                        </thead>
                        <tbody className="tabular">
                          {methods.map((m) => {
                            const ours = m.startsWith("Ours");
                            return (
                              <tr key={m} className={`border-t border-line ${ours ? "bg-mark-soft font-semibold text-ink" : ""}`}>
                                <td className="py-2 pr-4">{m}</td>
                                <td className="py-2 pr-4">{range(tt.false_alarm[m])}</td>
                                <td className="py-2">{range(tt.power[m])}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {d.agent_eval && (
                  <>
                    <h3 className="mt-8 text-base font-semibold text-ink">Is the analyst honest?</h3>
                    <p className="mt-2 max-w-[70ch] text-sm text-muted">
                      {d.agent_eval.passed} of {d.agent_eval.total} test questions passed every check: right tools, every number
                      traceable to the data, "significant" only when the test says so, no errors. Median answer time{" "}
                      {d.agent_eval.median_seconds} s.
                    </p>
                    <ul className="mt-3 grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
                      {d.agent_eval.cases.map((c) => (
                        <li key={c.question} className="flex items-start gap-2">
                          <span className={`mt-0.5 text-xs font-semibold ${c.passed ? "text-ok" : "text-bad"}`}>{c.passed ? "PASS" : "FAIL"}</span>
                          <span className="text-muted">{c.question}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="mt-6 text-xs text-faint">
                  Full method and references: docs/methods.md in the project repository.
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CheckRow({ passed, title, detail, reference }: { passed: boolean | null; title: string; detail: string; reference: string }) {
  return (
    <li className="grid grid-cols-[64px_1fr] gap-4 rounded-lg border border-line px-4 py-3">
      <span className={`self-start rounded px-2 py-0.5 text-center text-xs font-semibold ${passed ? "bg-ok/15 text-ok" : passed === false ? "bg-bad/15 text-bad" : "text-muted"}`}>
        {passed ? "PASS" : passed === false ? "FAIL" : "n/a"}
      </span>
      <div>
        <p className="text-ink">{title}</p>
        <p className="tabular text-sm text-muted">{detail}</p>
        <p className="mt-1 text-xs text-faint">{reference}</p>
      </div>
    </li>
  );
}
