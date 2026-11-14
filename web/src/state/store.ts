import { create } from "zustand";
import type { BBox, ChangeResult, Divergence, Fire, VariableId } from "../lib/types";
import { initialLayout } from "../lib/layout";

export type SheetSnap = "hidden" | "peek" | "half" | "full";
const phone = initialLayout() === "phone";

export type MapView = "trend" | "year";
export type BaseMap = "night" | "satellite";

export type Selection =
  | { kind: "point"; lat: number; lon: number; name?: string }
  | { kind: "hotspot"; id: string }
  | { kind: "pair"; index: number }
  | { kind: "fire"; fire: Fire }
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
  showLabels: boolean;
  /** Phones start on a flat map; the globe is one tap away. */
  flatMap: boolean;
  setFlatMap: (on: boolean) => void;
  sheet: SheetSnap;
  setSheet: (s: SheetSnap) => void;
  layersOpen: boolean;
  /** Time the analyst last moved the map (phones drop the sheet to peek for a moment). */
  flightAt: number;
  /** What Aisha is doing (voice), for her character anywhere on screen. */
  aishaState: "idle" | "listening" | "thinking" | "speaking";
  setAishaState: (s: "idle" | "listening" | "thinking" | "speaking") => void;
  /** Ask the panel to start or stop a voice conversation (e.g. from the phone's big Aisha button). */
  voiceRequest: number;
  requestVoice: () => void;
  voiceActive: boolean;
  setVoiceActive: (on: boolean) => void;
  peekForFlight: () => void;
  setLayersOpen: (on: boolean) => void;
  setShowLabels: (on: boolean) => void;
  fires: Fire[] | null;
  setFires: (f: Fire[] | null) => void;
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
  /** The analyst's selections keep its answer on screen (phone sheet, tablet tabs); yours open the details. */
  selectByAnalyst: (s: Selection) => void;
  /** Phone sheet / tablet panel: the analyst conversation or the details of the selection. */
  panelView: "ask" | "case";
  setPanelView: (v: "ask" | "case") => void;
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
  buildings: !phone,
  pendingAsk: null,
  showFires: false,
  showLabels: true,
  flatMap: phone,
  // The flat map can't show 3D buildings, so switching to it turns them off.
  setFlatMap: (flatMap) => set(flatMap ? { flatMap, buildings: false } : { flatMap }),
  // Phones start with the map only: Aisha's big button is the way in.
  sheet: phone ? "hidden" : "peek",
  setSheet: (sheet) => set({ sheet }),
  layersOpen: false,
  flightAt: 0,
  aishaState: "idle",
  setAishaState: (aishaState) => set({ aishaState }),
  voiceRequest: 0,
  requestVoice: () => set((s) => ({ voiceRequest: s.voiceRequest + 1 })),
  voiceActive: false,
  setVoiceActive: (voiceActive) => set({ voiceActive }),
  peekForFlight: () => {
    set({ sheet: "peek", flightAt: Date.now() });
    window.setTimeout(() => {
      const s = useApp.getState();
      if (s.sheet === "peek" && Date.now() - s.flightAt >= 2900) s.setSheet("half");
    }, 3000);
  },
  setLayersOpen: (layersOpen) => set({ layersOpen }),
  setShowLabels: (showLabels) => set({ showLabels }),
  fires: null,
  setFires: (fires) => set({ fires }),
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
  // Buildings need the 3D globe, so turning them on leaves the flat map.
  setBuildings: (buildings) => set(buildings ? { buildings, flatMap: false } : { buildings }),
  ask: (text) => set({ pendingAsk: { text, key: Date.now() }, panelView: "ask" }),
  clearAsk: () => set({ pendingAsk: null }),
  toggleFires: () => set((s) => ({ showFires: !s.showFires })),
  select: (selection) => set({ selection, panelView: selection ? "case" : "ask" }),
  selectByAnalyst: (selection) => set({ selection, panelView: "ask" }),
  panelView: "ask",
  setPanelView: (panelView) => set({ panelView }),
  announce: (text) => set({ atlasLabel: { text, key: Date.now() } }),
  setChange: (change) => set({ change }),
  setChangeLoading: (changeLoading) => set({ changeLoading }),
  setDivergence: (divergence) => set({ divergence }),
  setChecksOpen: (checksOpen) => set({ checksOpen }),
}));

export const bboxCenter = (b: BBox) => ({ lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 });
