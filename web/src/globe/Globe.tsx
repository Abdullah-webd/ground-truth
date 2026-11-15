import { useEffect, useRef, useState } from "react";
import { initialLayout } from "../lib/layout";
import { isLite, setLite } from "../lib/lite";
import { useApp } from "../state/store";
import { GlobeController, globe } from "./controller";

export function Globe({ onReady, ionToken }: { onReady?: () => void; ionToken: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    let controller: GlobeController;
    try {
      controller = new GlobeController(ref.current, { ionToken, flatMap: useApp.getState().flatMap, lite: isLite() });
      if (initialLayout() === "phone") controller.places.maxVisible = 60;
    } catch (err) {
      setError(`The 3D globe could not start: ${(err as Error).message}. Try a browser with WebGL enabled.`);
      return;
    }
    globe.set(controller);
    // Fast first paint: a light message until the first map tiles arrive; after 6 s, offer Lite mode.
    const slowTimer = window.setTimeout(() => setSlow(true), 6000);
    const offTiles = controller.viewer.scene.globe.tileLoadProgressEvent.addEventListener((remaining: number) => {
      if (remaining === 0) {
        setLoading(false);
        window.clearTimeout(slowTimer);
      }
    });
    // Lets the end-to-end tests place the camera precisely (read-only use).
    (window as unknown as { __groundTruthGlobe?: GlobeController }).__groundTruthGlobe = controller;
    const off = controller.onPick(({ lat, lon, entityId }) => {
      const hotspot = controller.hotspotIdFromEntity(entityId) ?? entityId?.replace(/^hotspot:/, "");
      const place = controller.labelItemFromEntity(entityId);
      if (place) {
        useApp.getState().select({ kind: "point", lat: place.lat, lon: place.lon, name: place.n });
        return;
      }
      const fireIndex = controller.fireIndexFromEntity(entityId);
      const fire = fireIndex != null ? useApp.getState().fires?.[fireIndex] : undefined;
      if (fire) {
        useApp.getState().select({ kind: "fire", fire });
        return;
      }
      if (entityId?.startsWith("hotspot:") && hotspot) {
        useApp.getState().select({ kind: "hotspot", id: hotspot });
        return;
      }
      useApp.getState().select({ kind: "point", lat, lon });
    });
    const raf = requestAnimationFrame(() => {
      controller.intro();
      onReady?.();
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(slowTimer);
      offTiles();
      off();
      globe.set(null);
      controller.destroy();
    };
  }, [onReady, ionToken]);

  return (
    <div className="absolute inset-0">
      <div ref={ref} className="absolute inset-0" aria-label="Interactive 3D globe. Click anywhere to inspect its trend." />
      {loading && !error && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 text-center" role="status">
          <p className="text-sm text-muted">Loading the map…</p>
          {slow && !isLite() && (
            <button type="button" onClick={() => setLite(true)} className="btn pointer-events-auto rounded-lg border border-line bg-paper px-3 py-1.5 text-[13px] text-ink">
              Slow connection? Switch to Lite mode
            </button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-8 text-center text-muted">
          {error}
        </div>
      )}
    </div>
  );
}
