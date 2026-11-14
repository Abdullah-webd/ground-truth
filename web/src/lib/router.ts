import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

/** Two routes: the story ("/") and the globe ("/explore"). History API plus View Transitions. */
export type Route = "/" | "/explore" | "/methods";

const listeners = new Set<() => void>();
const read = (): Route =>
  window.location.pathname.startsWith("/explore") ? "/explore" : window.location.pathname.startsWith("/methods") ? "/methods" : "/";
let current: Route = read();

function emit() {
  current = read();
  listeners.forEach((l) => l());
}

window.addEventListener("popstate", () => withTransition(emit));

function withTransition(update: () => void, origin?: { x: number; y: number }) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (origin) {
    document.documentElement.style.setProperty("--vt-x", `${origin.x}px`);
    document.documentElement.style.setProperty("--vt-y", `${origin.y}px`);
  }
  if (!doc.startViewTransition || reduce) {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}

export function navigate(to: Route, from?: MouseEvent) {
  if (to === current) return;
  const origin = from && from.clientX ? { x: from.clientX, y: from.clientY } : undefined;
  withTransition(() => {
    window.history.pushState(null, "", to);
    emit();
    window.scrollTo(0, 0);
  }, origin);
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
