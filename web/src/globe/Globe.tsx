import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/store";
import { GlobeController, globe } from "./controller";

export function Globe({ onReady, ionToken }: { onReady?: () => void; ionToken: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let controller: GlobeController;
    try {
      controller = new GlobeController(ref.current, { ionToken });
    } catch (err) {
      setError(`The 3D globe could not start: ${(err as Error).message}. Try a browser with WebGL enabled.`);
      return;
    }
    globe.set(controller);
    const off = controller.onPick(({ lat, lon, entityId }) => {
      const hotspot = controller.hotspotIdFromEntity(entityId) ?? entityId?.replace(/^hotspot:/, "");
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
      off();
      globe.set(null);
      controller.destroy();
    };
  }, [onReady, ionToken]);

  return (
    <div className="absolute inset-0">
      <div ref={ref} className="absolute inset-0" aria-label="Interactive 3D globe. Click anywhere to inspect its trend." />
      {error && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-8 text-center text-muted">
          {error}
        </div>
      )}
    </div>
  );
}
