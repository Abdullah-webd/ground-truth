import { animate, motion, useDragControls, useMotionValue, type PanInfo } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SheetSnap } from "../../state/store";

/**
 * The map-app bottom sheet: one panel over a full-screen map, resting at peek, half or full height.
 * No dim overlay, so the map stays touchable above it. Only the handle bar drags the sheet; a quick
 * flick passes straight to the next height. Sits above the on-screen keyboard (--kb, from visualViewport).
 */

const FULL = 0.92;
const HALF = 0.52;

function viewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight;
}

export function BottomSheet({
  snap,
  onSnap,
  peek,
  header,
  children,
  label,
}: {
  snap: SheetSnap;
  onSnap: (s: SheetSnap) => void;
  /** Height in px when peeking (enough to show the essentials). */
  peek: number;
  header?: ReactNode;
  children: ReactNode;
  label: string;
}) {
  const [vh, setVh] = useState(viewportHeight);
  const controls = useDragControls();
  const y = useMotionValue(0);
  const scroller = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(40);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const onResize = () => setVh(viewportHeight());
    window.visualViewport?.addEventListener("resize", onResize);
    window.addEventListener("resize", onResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", onResize);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const full = Math.round(vh * FULL);
  const visible = useCallback(
    (s: SheetSnap) => (s === "full" ? full : s === "half" ? Math.round(vh * HALF) : Math.min(peek, full)),
    [full, vh, peek],
  );
  const offsetFor = useCallback((s: SheetSnap) => full - visible(s), [full, visible]);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    setHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Move to the requested height.
  useLayoutEffect(() => {
    const target = offsetFor(snap);
    if (reduce) y.set(target);
    else animate(y, target, { type: "spring", stiffness: 420, damping: 42, mass: 0.9 });
  }, [snap, offsetFor, y, reduce]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    // Project where a flick would land, then rest at the nearest height.
    const projected = y.get() + info.velocity.y * 0.18;
    const options: SheetSnap[] = ["full", "half", "peek"];
    let best: SheetSnap = snap;
    let bestD = Infinity;
    for (const s of options) {
      const d = Math.abs(offsetFor(s) - projected);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best === snap) {
      const target = offsetFor(snap);
      if (reduce) y.set(target);
      else animate(y, target, { type: "spring", stiffness: 420, damping: 42 });
    }
    onSnap(best);
  };

  // Typing needs room: focusing a text box opens the sheet fully.
  const onFocus = (e: React.FocusEvent) => {
    const t = e.target as HTMLElement;
    if ((t.tagName === "TEXTAREA" || t.tagName === "INPUT") && snap !== "full") onSnap("full");
  };

  const cycle = () => onSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");

  return (
    <motion.section
      aria-label={label}
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ top: 0, bottom: full - Math.min(peek, full) }}
      dragElastic={0.06}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      onFocus={onFocus}
      style={{ y, height: full, bottom: "var(--kb, 0px)" }}
      className="panel-shadow pointer-events-auto fixed inset-x-0 z-30 flex flex-col rounded-t-[22px] border-t border-line bg-panel"
    >
      <div
        ref={headerRef}
        className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2 active:cursor-grabbing"
        onPointerDown={(e) => controls.start(e)}
      >
        <button
          type="button"
          onClick={cycle}
          aria-label={`Drag or tap to resize the panel (now ${snap === "peek" ? "small" : snap === "half" ? "half height" : "full height"})`}
          className="grid h-6 w-16 place-items-center"
        >
          <span className="h-1.5 w-10 rounded-full bg-line" aria-hidden />
        </button>
        {header}
      </div>
      <div
        ref={scroller}
        className="scroll-thin min-h-0 shrink-0 overflow-y-auto overscroll-contain px-4"
        // Exactly the visible part of the sheet, so "scroll to the latest answer" lands on screen.
        style={{ height: Math.max(0, visible(snap) - headerH), paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        {children}
      </div>
    </motion.section>
  );
}
