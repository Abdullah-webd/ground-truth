import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { globe } from "../globe/controller";
import { api } from "../lib/api";
import type { Fire } from "../lib/types";
import { useApp } from "../state/store";

export function Flame({ scale }: { scale: number }) {
  return (
    <svg width={22 * scale + 6} height={28 * scale + 6} viewBox="0 0 22 28" aria-hidden className="shrink-0">
      <path d="M11 0C12 6 20 9 20 17A9 9 0 0 1 2 17C2 13 4.5 10.6 6 9.2c.2 2.8 1.7 4.3 3.2 5C8.4 9.3 9.6 4.3 11 0z" fill="#d93a12" />
      <path d="M11 9c.6 3.4 5 5 5 9.3a5 5 0 0 1-10 0c0-2 1.2-3.3 2-4 .2 1.6 1 2.4 1.8 2.8C9.4 14.2 10.2 11.3 11 9z" fill="#ff7a1a" />
      <path d="M11 17c.3 1.7 2.4 2.5 2.4 4.6a2.4 2.4 0 0 1-4.8 0c0-1 .6-1.7 1-2 .1.8.5 1.2.9 1.4-.2-1.4.2-2.8.5-4z" fill="#ffd23f" />
    </svg>
  );
}

/** Explains the live-fire layer while it is on: what each flame is, how many, and where the biggest one is. */
export function FirePanel({ variant = "desktop" }: { variant?: "desktop" | "tablet" | "phone" }) {
  const show = useApp((s) => s.showFires);
  const toggle = useApp((s) => s.toggleFires);
  const q = useQuery({ queryKey: ["fires"], queryFn: () => api.fires(), enabled: show, refetchInterval: 600_000 });
  const biggest: Fire | undefined = q.data?.fires[0];

  return (
    <AnimatePresence>
      {show && (
        <motion.section
          aria-label="Fires burning now"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
          className={
            variant === "phone"
              ? "panel-shadow pointer-events-auto fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+104px)] z-20 rounded-2xl border border-line bg-paper px-3.5 py-2.5"
              : variant === "tablet"
                ? "panel-shadow pointer-events-auto absolute left-4 right-[412px] top-[72px] z-20 rounded-2xl border border-line bg-paper px-4 py-3"
              : "panel-shadow pointer-events-auto absolute left-1/2 top-[72px] z-20 w-[min(520px,calc(100%-820px))] min-w-[340px] -translate-x-1/2 rounded-2xl border border-line bg-paper px-4 py-3"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {q.isPending ? (
                  "Loading fires from NASA…"
                ) : q.isError ? (
                  "Couldn't load fires right now"
                ) : (
                  <>
                    <span className="tabular">{q.data.count.toLocaleString()}</span> fires seen burning in the last 24 hours
                  </>
                )}
              </p>
              <p className={`mt-0.5 text-[13px] leading-snug text-muted ${variant === "phone" ? "hidden" : ""}`}>
                {q.isError
                  ? (q.error as Error).message
                  : "Each flame is one hot spot NASA's VIIRS satellite saw from space, about 375 m across. Zoom in to see the burning patch on the ground. Click a flame for details."}
              </p>
            </div>
            <button type="button" onClick={toggle} className="btn btn-quiet shrink-0 rounded-lg px-2 py-1 text-xs text-muted" aria-label="Hide fires">
              Hide
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
            <ul className="flex items-end gap-4 text-[12px] text-muted" aria-label="Flame sizes">
              {[
                { s: 0.5, t: "small" },
                { s: 0.72, t: "medium" },
                { s: 1, t: "large" },
              ].map((x) => (
                <li key={x.t} className="flex items-end gap-1.5">
                  <Flame scale={x.s} />
                  {x.t}
                </li>
              ))}
            </ul>
            {biggest && (
              <button
                type="button"
                onClick={() => {
                  useApp.getState().select({ kind: "fire", fire: biggest });
                  void globe.get()?.flyToPoint(biggest.lat, biggest.lon, 25_000, 2.4);
                }}
                className="btn btn-fire rounded-lg bg-fire px-3 py-1.5 text-sm font-semibold text-white"
              >
                Fly to the biggest fire
              </button>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

