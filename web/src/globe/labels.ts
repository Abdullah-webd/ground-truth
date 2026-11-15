import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Credit,
  Ellipsoid,
  EllipsoidalOccluder,
  HeightReference,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  SceneMode,
  Math as CMath,
  SceneTransforms,
  VerticalOrigin,
  type Label,
  type Viewer,
} from "cesium";

/**
 * Place names the way a map app shows them: countries from space, then cities, towns, neighbourhoods,
 * streets and landmarks as you get closer. Text floats above terrain and the 3D city, stays upright
 * when the view tilts, and never overlaps: higher-priority names win the space.
 * Data: OpenStreetMap via OpenFreeMap vector tiles, decoded and cached by our backend (/api/labels).
 */

export interface LabelItem {
  n: string;
  k: string;
  c: string;
  r: number;
  lat: number;
  lon: number;
}

interface Placed {
  key: string;
  item: LabelItem;
  label: Label;
  pos: Cartesian3;
  priority: number;
  size: number;
  alpha: number;
  target: number;
}

const MAX_TILES = 25;
const MAX_VISIBLE = 140;
const CACHE_TILES = 300;

// Lower = more important (wins the space when names collide).
const BASE_PRIORITY: Record<string, number> = {
  continent: 0,
  country: 1,
  capital: 2,
  state: 3,
  city: 4,
  water: 5,
  town: 6,
  island: 6,
  airport: 7,
  suburb: 8,
  village: 9,
  road: 9,
  neighbourhood: 10,
  peak: 11,
  hamlet: 12,
  street: 12,
  poi: 13,
};

interface Style {
  font: string;
  size: number;
  fill: Color;
  upper?: boolean;
}

const WHITE = Color.WHITE;
const STYLE: Record<string, Style> = {
  continent: { font: "700 15px", size: 15, fill: WHITE, upper: true },
  country: { font: "700 14px", size: 14, fill: WHITE, upper: true },
  capital: { font: "700 16px", size: 16, fill: WHITE },
  state: { font: "600 12px", size: 12, fill: Color.fromCssColorString("#e9ecef"), upper: true },
  city: { font: "700 15px", size: 15, fill: WHITE },
  town: { font: "600 13px", size: 13, fill: WHITE },
  island: { font: "italic 600 12px", size: 12, fill: WHITE },
  village: { font: "600 12px", size: 12, fill: Color.fromCssColorString("#f1f3f5") },
  suburb: { font: "700 11px", size: 11, fill: Color.fromCssColorString("#f1f3f5"), upper: true },
  neighbourhood: { font: "600 11px", size: 11, fill: Color.fromCssColorString("#e9ecef"), upper: true },
  hamlet: { font: "500 11px", size: 11, fill: Color.fromCssColorString("#e9ecef") },
  water: { font: "italic 600 12px", size: 12, fill: Color.fromCssColorString("#cfe6ff") },
  airport: { font: "600 12px", size: 12, fill: Color.fromCssColorString("#dbe9ff") },
  peak: { font: "italic 500 11px", size: 11, fill: Color.fromCssColorString("#f3e7d3") },
  road: { font: "600 12px", size: 12, fill: Color.fromCssColorString("#fff4c2") },
  street: { font: "500 11px", size: 11, fill: WHITE },
  poi: { font: "500 11px", size: 11, fill: Color.fromCssColorString("#ffe2c4") },
};
const OUTLINE = Color.fromCssColorString("#11181f").withAlpha(0.85);
const FAMILY = "'Public Sans Variable', 'Public Sans', system-ui, sans-serif";

const keyOf = (it: LabelItem) => `${it.k}|${it.n}|${it.lat.toFixed(3)}|${it.lon.toFixed(3)}`;

function tileXY(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const la = Math.max(-85, Math.min(85, lat));
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan((la * Math.PI) / 180) + 1 / Math.cos((la * Math.PI) / 180)) / Math.PI) / 2) * n);
  return [((x % n) + n) % n, Math.max(0, Math.min(n - 1, y))];
}

/** Camera height → vector tile zoom: whole Earth ≈ 2, a city ≈ 10, streets = 14. */
export function zoomForHeight(h: number): number {
  return Math.max(2, Math.min(14, Math.round(Math.log2(4.2e7 / Math.max(h, 1)))));
}

export class PlaceLabels {
  private viewer: Viewer;
  private labels: LabelCollection;
  private placed = new Map<string, Placed>();
  private byId = new Map<string, LabelItem>();
  private tiles = new Map<string, LabelItem[] | Promise<LabelItem[] | null>>();
  private tileOrder: string[] = [];
  private wanted: string[] = [];
  private enabled = true;
  /** Fewer names at once on a small screen. */
  maxVisible = MAX_VISIBLE;
  private dirty = true;
  private lastLayout = 0;
  private animating = false;
  private reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private removeListeners: (() => void)[] = [];

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this.labels = viewer.scene.primitives.add(new LabelCollection({ scene: viewer.scene }));
    viewer.creditDisplay.addStaticCredit(
      new Credit(
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>, <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>',
        false,
      ),
    );
    const cam = viewer.camera;
    cam.percentageChanged = 0.05;
    const onChange = () => {
      this.dirty = true;
      this.refreshTiles();
    };
    this.removeListeners.push(cam.changed.addEventListener(onChange), cam.moveEnd.addEventListener(onChange));
    this.removeListeners.push(viewer.scene.preRender.addEventListener(() => this.frame()));
    this.refreshTiles();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.labels.show = on;
    this.dirty = true;
    if (on) this.refreshTiles();
  }

  /** Info for a clicked label (its id is "label:<key>"). */
  itemFor(entityId?: string): LabelItem | undefined {
    return entityId?.startsWith("label:") ? this.byId.get(entityId.slice(6)) : undefined;
  }

  destroy() {
    this.removeListeners.forEach((off) => off());
    if (!this.labels.isDestroyed()) this.viewer.scene.primitives.remove(this.labels);
  }

  // ---------------------------------------------------------------- tiles

  private centerCartographic(): Cartographic | undefined {
    const { scene, camera } = this.viewer;
    const canvas = scene.canvas;
    const center = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight * 0.55);
    const hit = camera.pickEllipsoid(center, Ellipsoid.WGS84);
    if (hit) return Cartographic.fromCartesian(hit);
    return camera.positionCartographic.clone();
  }

  private refreshTiles() {
    if (!this.enabled) return;
    const camera = this.viewer.camera;
    const h = camera.positionCartographic.height;
    const c = this.centerCartographic();
    if (!c) return;
    const z = zoomForHeight(h);
    const lat = CMath.toDegrees(c.latitude);
    const lon = CMath.toDegrees(c.longitude);
    const [cx, cy] = tileXY(lat, lon, z);
    const n = 2 ** z;
    // 5 × 5 tiles around the view centre; 3 × 3 at street level, where a tile is only a few km.
    const r = z >= 12 ? 1 : 2;
    const keys: string[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const y = cy + dy;
        if (y < 0 || y >= n) continue;
        const x = (((cx + dx) % n) + n) % n;
        const k = `${z}/${x}/${y}`;
        if (!keys.includes(k)) keys.push(k);
      }
    }
    // Closest tiles first, so nearby names arrive first.
    this.wanted = keys.slice(0, MAX_TILES);
    for (const k of this.wanted) void this.load(k);
    this.syncLabels();
  }

  private load(key: string): Promise<LabelItem[] | null> | LabelItem[] {
    const hit = this.tiles.get(key);
    if (hit) return hit;
    const p = fetch(`/api/labels/${key}`)
      .then((r) => {
        // A failed tile is retried on the next camera move rather than remembered as "no names here".
        if (!r.ok) throw new Error(`labels ${r.status}`);
        return r.json();
      })
      .then((body: { labels: LabelItem[] }) => {
        const items = body.labels ?? [];
        this.tiles.set(key, items);
        this.tileOrder.push(key);
        if (this.tileOrder.length > CACHE_TILES) this.tiles.delete(this.tileOrder.shift()!);
        if (this.wanted.includes(key)) this.syncLabels();
        return items;
      })
      .catch(() => {
        this.tiles.delete(key); // try again on the next camera move
        return null;
      });
    this.tiles.set(key, p);
    return p;
  }

  /** Make the label set match the tiles in view (labels already on screen are kept, so nothing flickers). */
  private syncLabels() {
    const want = new Map<string, LabelItem>();
    for (const k of this.wanted) {
      const items = this.tiles.get(k);
      if (!Array.isArray(items)) continue;
      for (const it of items) want.set(keyOf(it), it);
    }
    // Keep old labels until the new tiles have arrived, so moving the camera never blanks the map.
    const allLoaded = this.wanted.every((k) => Array.isArray(this.tiles.get(k)));
    if (allLoaded) {
      for (const [key, p] of this.placed) {
        if (!want.has(key)) {
          this.labels.remove(p.label);
          this.placed.delete(key);
          this.byId.delete(key);
        }
      }
    }
    for (const [key, it] of want) {
      if (this.placed.has(key) || it.k === "continent") continue;
      const style = STYLE[it.k] ?? STYLE.poi;
      // Cesium clamps the label to the ground (or a 3D roof) as detail loads; sampling the height once
      // here can return junk from low-detail terrain. Layout uses the sea-level position.
      const pos = Cartesian3.fromDegrees(it.lon, it.lat, 0);
      const label = this.labels.add({
        id: { id: `label:${key}` },
        position: pos,
        text: style.upper ? it.n.toUpperCase() : it.n,
        font: `${style.font} ${FAMILY}`,
        // Colours stay fixed: Cesium caches one glyph image per font + colour, so animating colour would
        // mint new glyphs every frame until the texture atlas overflows. The entrance animates scale instead.
        fillColor: style.fill,
        outlineColor: OUTLINE,
        scale: 0.8,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        show: false,
      });
      const priority = (BASE_PRIORITY[it.k] ?? 13) * 100 + Math.min(99, Math.max(0, Number(it.r) || 0));
      this.placed.set(key, { key, item: it, label, pos, priority, size: style.size, alpha: 0, target: 0 });
      this.byId.set(key, it);
    }
    this.dirty = true;
  }

  // ---------------------------------------------------------------- layout

  private frame() {
    const now = performance.now();
    if (this.enabled && this.dirty && now - this.lastLayout > 90) {
      this.layout();
      this.lastLayout = now;
      this.dirty = false;
    }
    if (this.animating) this.fade();
  }

  /** Greedy decluttering in screen space: most important names first, skip anything that would overlap. */
  private layout() {
    const { scene, camera } = this.viewer;
    // The horizon test only applies to the globe; on the flat map everything on screen is visible.
    const flat = scene.mode === SceneMode.SCENE2D;
    const occluder = new EllipsoidalOccluder(Ellipsoid.WGS84, camera.positionWC);
    const w = scene.canvas.clientWidth;
    const hgt = scene.canvas.clientHeight;
    const cell = 48;
    const grid = new Map<number, [number, number, number, number][]>();
    const out = new Cartesian2();
    const list = [...this.placed.values()].sort((a, b) => a.priority - b.priority);
    let shown = 0;
    const height = camera.positionCartographic.height;
    for (const p of list) {
      let visible = false;
      // Big area names fade out once you're down among the streets.
      const tooClose = (p.item.k === "country" || p.item.k === "continent" || p.item.k === "state") && height < 60_000;
      if (!tooClose && shown < this.maxVisible && (flat || occluder.isPointVisible(p.pos))) {
        const s = SceneTransforms.worldToWindowCoordinates(scene, p.pos, out);
        if (s && s.x > -40 && s.x < w + 40 && s.y > 0 && s.y < hgt) {
          const text = p.label.text;
          // Bold capitals run wider than mixed case; phones get extra breathing room so names never touch.
          const narrow = w < 768;
          const upper = text === text.toUpperCase();
          const bw = text.length * p.size * (upper ? 0.7 : 0.6) + (narrow ? 24 : 12);
          const bh = p.size + (narrow ? 14 : 8);
          const box: [number, number, number, number] = [s.x - bw / 2, s.y - bh / 2, s.x + bw / 2, s.y + bh / 2];
          const x0 = Math.floor(box[0] / cell);
          const x1 = Math.floor(box[2] / cell);
          const y0 = Math.floor(box[1] / cell);
          const y1 = Math.floor(box[3] / cell);
          let hit = false;
          for (let gx = x0; gx <= x1 && !hit; gx++) {
            for (let gy = y0; gy <= y1 && !hit; gy++) {
              for (const o of grid.get(gx * 100003 + gy) ?? []) {
                if (box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]) {
                  hit = true;
                  break;
                }
              }
            }
          }
          if (!hit) {
            for (let gx = x0; gx <= x1; gx++) {
              for (let gy = y0; gy <= y1; gy++) {
                const k = gx * 100003 + gy;
                const arr = grid.get(k);
                if (arr) arr.push(box);
                else grid.set(k, [box]);
              }
            }
            visible = true;
            shown++;
          }
        }
      }
      p.target = visible ? 1 : 0;
      if (visible && !p.label.show) p.label.show = true;
      if (p.alpha !== p.target) this.animating = true;
    }
    if (this.reduce) {
      for (const p of list) this.setAlpha(p, p.target);
      this.animating = false;
    }
  }

  /** `a` is the entrance progress (0 hidden … 1 settled): names grow from 80 % to full size. */
  private setAlpha(p: Placed, a: number) {
    p.alpha = a;
    p.label.scale = 0.8 + 0.2 * a;
    p.label.show = a > 0;
  }

  /** Names settle in over ~220 ms rather than popping; leaving names hide promptly. */
  private fade() {
    let moving = false;
    for (const p of this.placed.values()) {
      if (p.alpha === p.target) continue;
      const step = 0.16;
      const next = p.target > p.alpha ? Math.min(1, p.alpha + step) : 0;
      this.setAlpha(p, next);
      if (next !== p.target) moving = true;
    }
    this.animating = moving;
  }
}
