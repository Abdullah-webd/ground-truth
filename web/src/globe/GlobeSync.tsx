import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, clusterUrl, frameUrl, overlayUrl } from "../lib/api";
import { useVariables } from "../lib/useVariables";
import { useApp } from "../state/store";
import { globe } from "./controller";

const FRAME_MS = 900;

/** Keeps the Cesium scene in step with app state. Renders nothing. */
export function GlobeSync({ ready }: { ready: boolean }) {
  const { variable, mapView, year, base, buildings, selection, change, divergence, showFires, playing } = useApp();
  const meta = useVariables().data?.find((v) => v.id === variable);

  useEffect(() => {
    const g = globe.get();
    if (!ready || !g) return;
    const v = meta?.built ?? "";
    const url = mapView === "year" && year != null ? frameUrl(variable, year, v) : overlayUrl(variable, v);
    void g.setOverlay(url);
  }, [ready, variable, mapView, year, meta?.built]);

  // Preload the next frames so playback never waits on the network.
  useEffect(() => {
    if (mapView !== "year" || year == null || !meta) return;
    for (const y of [year + 1, year + 2]) {
      if (y <= meta.years[1]) new Image().src = frameUrl(variable, y, meta.built);
    }
  }, [mapView, year, variable, meta]);

  useEffect(() => {
    if (!playing || !meta) return;
    const id = window.setInterval(() => {
      const s = useApp.getState();
      const next = (s.year ?? meta.years[0]) + 1;
      s.setYear(next > meta.years[1] ? meta.years[0] : next);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, meta]);

  useEffect(() => {
    if (ready) globe.get()?.setBase(base);
  }, [ready, base]);

  useEffect(() => {
    if (ready) globe.get()?.setBuildings(buildings);
  }, [ready, buildings]);

  useEffect(() => {
    const g = globe.get();
    if (!ready || !g) return;
    if (selection?.kind === "point") g.setMarker(selection.lat, selection.lon);
    else g.setMarker(null);
  }, [ready, selection]);

  const selectedHotspot = selection?.kind === "hotspot" ? selection.id : undefined;
  useEffect(() => {
    const g = globe.get();
    if (!ready || !g) return;
    g.setChangeTiles(change?.tile_url ?? null);
  }, [ready, change]);
  useEffect(() => {
    const g = globe.get();
    if (!ready || !g) return;
    void g.setHotspots(change?.hotspots ?? null, selectedHotspot);
  }, [ready, change, selectedHotspot]);

  const pairIndex = selection?.kind === "pair" ? selection.index : null;
  const divMeta = useVariables().data?.find((v) => v.id === divergence?.variable);
  useEffect(() => {
    const g = globe.get();
    if (!ready || !g) return;
    const pair = pairIndex != null ? divergence?.pairs[pairIndex] : undefined;
    if (!pair || !divergence) {
      void g.setClusters([]);
      return;
    }
    void g.setClusters(
      [
        clusterUrl(divergence.variable, pair.increasing.id, divMeta?.palette[divMeta.palette.length - 1]),
        clusterUrl(divergence.variable, pair.decreasing.id, divMeta?.palette[0]),
      ],
      { from: [pair.increasing.lat, pair.increasing.lon], to: [pair.decreasing.lat, pair.decreasing.lon] },
    );
  }, [ready, divergence, pairIndex, divMeta]);

  const fires = useQuery({ queryKey: ["fires"], queryFn: () => api.fires(), enabled: showFires, refetchInterval: 600_000 });
  useEffect(() => {
    const list = showFires ? (fires.data?.fires ?? null) : null;
    useApp.getState().setFires(list);
    if (ready) globe.get()?.setFires(list);
  }, [ready, showFires, fires.data]);

  return null;
}
