import { useSyncExternalStore } from "react";

/**
 * Which layout the globe screen uses:
 * - phone: full-screen map + one bottom sheet (also tablets held upright, under 1024 px wide)
 * - tablet: globe + one right-hand panel with Ask | Details tabs
 * - desktop: the three-column layout
 */
export type Layout = "phone" | "tablet" | "desktop";

export function computeLayout(w = window.innerWidth, h = window.innerHeight): Layout {
  if (w < 768 || (w < 1024 && h > w)) return "phone";
  if (w < 1280) return "tablet";
  return "desktop";
}

let current: Layout = computeLayout();
const listeners = new Set<() => void>();
const update = () => {
  const next = computeLayout();
  if (next !== current) {
    current = next;
    listeners.forEach((l) => l());
  }
};
window.addEventListener("resize", update);
window.addEventListener("orientationchange", update);

export function useLayout(): Layout {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export const initialLayout = () => current;

/**
 * Keeps CSS variables in step with the visible viewport, so the bottom sheet and its text box sit above
 * the on-screen keyboard (CSS dvh ignores the keyboard on iOS; visualViewport doesn't).
 */
export function trackVisualViewport(): () => void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const apply = () => {
    const h = vv ? vv.height : window.innerHeight;
    const keyboard = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty("--vvh", `${h}px`);
    root.style.setProperty("--kb", `${keyboard}px`);
  };
  apply();
  vv?.addEventListener("resize", apply);
  vv?.addEventListener("scroll", apply);
  window.addEventListener("resize", apply);
  return () => {
    vv?.removeEventListener("resize", apply);
    vv?.removeEventListener("scroll", apply);
    window.removeEventListener("resize", apply);
  };
}
