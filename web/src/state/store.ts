import { create } from "zustand";
import type { BBox, ChangeResult, Divergence, VariableId } from "../lib/types";

export type MapView = "trend" | "year";
export type BaseMap = "night" | "satellite";

export type Selection =
  | { kind: "point"; lat: number; lon: number; name?: string }
  | { kind: "hotspot"; id: string }
  | { kind: "pair"; index: number }
  | null;

interface State {
  variable: VariableId;
  mapView: MapView;
  year: number | null;
  playing: boolean;
  base: BaseMap;
  buildings: boolean;
  pendingAsk: { text: string; key: number } | null;
  showFires: boolean;
  selection: Selection;
  atlasLabel: { text: string; key: number } | null;
  change: ChangeResult | null;
  changeLoading: boolean;
  divergence: Divergence | null;
  checksOpen: boolean;
  setVariable: (v: VariableId) => void;
  setMapView: (v: MapView) => void;
  setYear: (y: number | null) => void;
  setPlaying: (p: boolean) => void;
  setBase: (b: BaseMap) => void;
  setBuildings: (on: boolean) => void;
  ask: (text: string) => void;
  clearAsk: () => void;
  toggleFires: () => void;
  select: (s: Selection) => void;
  announce: (text: string) => void;
  setChange: (c: ChangeResult | null) => void;
  setChangeLoading: (b: boolean) => void;
  setDivergence: (d: State["divergence"]) => void;
  setChecksOpen: (b: boolean) => void;
}

export const useApp = create<State>((set) => ({
  variable: "temperature",
  mapView: "trend",
  year: null,
  playing: false,
  base: "satellite",
  buildings: true,
  pendingAsk: null,
  showFires: false,
  selection: null,
  atlasLabel: null,
  change: null,
  changeLoading: false,
  divergence: null,
  checksOpen: false,
  setVariable: (variable) => set({ variable, year: null, playing: false, mapView: "trend", divergence: null }),
  setMapView: (mapView) => set({ mapView, playing: false }),
  setYear: (year) => set({ year }),
  setPlaying: (playing) => set({ playing }),
  setBase: (base) => set({ base }),
  setBuildings: (buildings) => set({ buildings }),
  ask: (text) => set({ pendingAsk: { text, key: Date.now() } }),
  clearAsk: () => set({ pendingAsk: null }),
  toggleFires: () => set((s) => ({ showFires: !s.showFires })),
  select: (selection) => set({ selection }),
  announce: (text) => set({ atlasLabel: { text, key: Date.now() } }),
  setChange: (change) => set({ change }),
  setChangeLoading: (changeLoading) => set({ changeLoading }),
  setDivergence: (divergence) => set({ divergence }),
  setChecksOpen: (checksOpen) => set({ checksOpen }),
}));

export const bboxCenter = (b: BBox) => ({ lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 });
