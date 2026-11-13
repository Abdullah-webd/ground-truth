import { globe } from "../globe/controller";
import type { UiCommand } from "./agent";
import { shortPlace } from "./format";
import type { BBox } from "./types";
import { useApp } from "../state/store";

const unionBox = (a: BBox, b: BBox): BBox => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** Per-question memory, so later tool calls in the same answer don't override the first finding on screen. */
export interface TurnContext {
  variableChosen: boolean;
}
export const newTurnContext = (): TurnContext => ({ variableChosen: false });

/** Apply one agent UI command to the app state and the globe. */
export function applyCommand(cmd: UiCommand, ctx: TurnContext = newTurnContext()) {
  const app = useApp.getState();
  const g = globe.get();
  switch (cmd.action) {
    case "place": {
      const p = cmd.place;
      app.announce(shortPlace(p.name));
      app.select({ kind: "point", lat: p.lat, lon: p.lon, name: p.name });
      const [w, s, e, n] = p.bbox;
      if (g) void (e - w > 0.05 && e - w < 40 && n - s < 40 ? g.flyToBox(p.bbox) : g.flyToPoint(p.lat, p.lon, 1.2e6));
      break;
    }
    case "change":
      app.setChange(cmd.change);
      app.setBase("satellite");
      void g?.flyToBox(cmd.change.bbox, 1.8);
      break;
    case "point": {
      // The first variable the analyst tests is its lead finding; keep that one on screen.
      if (!ctx.variableChosen && app.variable !== cmd.variable) app.setVariable(cmd.variable);
      ctx.variableChosen = true;
      const sel = app.selection;
      const near = sel?.kind === "point" && Math.abs(sel.lat - cmd.lat) < 0.3 && Math.abs(sel.lon - cmd.lon) < 0.3;
      // Keep a hotspot or a named place on screen; only move the case file for a new spot.
      if (!near && sel?.kind !== "hotspot") app.select({ kind: "point", lat: cmd.lat, lon: cmd.lon });
      break;
    }
    case "region":
      if (app.variable !== cmd.variable) app.setVariable(cmd.variable);
      void g?.flyToBox(cmd.bbox);
      break;
    case "divergence": {
      const d = cmd.divergence;
      if (app.variable !== d.variable) app.setVariable(d.variable);
      app.setDivergence(d);
      if (d.pairs.length) {
        app.select({ kind: "pair", index: 0 });
        void g?.flyToBox(unionBox(d.pairs[0].increasing.bbox, d.pairs[0].decreasing.bbox));
      }
      break;
    }
    case "fires":
      if (!app.showFires) app.toggleFires();
      void g?.flyToBox(cmd.bbox);
      break;
    case "view":
      if (app.variable !== cmd.variable) app.setVariable(cmd.variable);
      app.setMapView(cmd.view);
      if (cmd.view === "year" && cmd.year != null) app.setYear(cmd.year);
      break;
  }
}
