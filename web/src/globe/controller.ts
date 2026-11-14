import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  ClassificationType,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Credit,
  EasingFunction,
  GeoJsonDataSource,
  HeightReference,
  ImageryLayer,
  Ion,
  IonWorldImageryStyle,
  Math as CMath,
  PolylineDashMaterialProperty,
  BillboardCollection,
  DistanceDisplayCondition,
  NearFarScalar,
  VerticalOrigin,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  EllipsoidTerrainProvider,
  Terrain,
  UrlTemplateImageryProvider,
  Viewer,
  WebMercatorTilingScheme,
  createGooglePhotorealistic3DTileset,
  createWorldImageryAsync,
  type Cesium3DTileset,
  type Entity,
} from "cesium";
import gsap from "gsap";
import type { BBox, Fire, Hotspot } from "../lib/types";
import { PlaceLabels, type LabelItem } from "./labels";

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const gibsCredit = new Credit("Imagery: NASA GIBS / EOSDIS", false);
// On the globe the highlighter marks evidence too: change hotspots, the selected spot, divergence arcs.
const ACCENT = Color.fromCssColorString("#ffe14d");
const FIRE_FOOTPRINT_BELOW = 500_000; // m: show each fire's real ~375 m footprint on the ground below this height
const WORLD = Rectangle.fromDegrees(-180, -90, 180, 90);
const OVERLAY_ALPHA = 0.82;
const OVERLAY_FADE_LOW = 300_000; // m: overlay nearly gone below this camera height
const OVERLAY_FADE_HIGH = 1_500_000; // m: overlay fully shown above this
const BUILDINGS_BELOW = 80_000; // m: Google 3D city appears below this camera height

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function gibs(layer: string, time: string, matrix: string, ext: string, maximumLevel: number) {
  return new UrlTemplateImageryProvider({
    url: `${GIBS}/${layer}/default/${time}/${matrix}/{z}/{y}/{x}.${ext}`,
    tilingScheme: new WebMercatorTilingScheme(),
    maximumLevel,
    credit: gibsCredit,
  });
}

export type BaseMap = "night" | "satellite";
export type PickHandler = (pick: { lat: number; lon: number; entityId?: string }) => void;

export interface GlobeOptions {
  /** Cesium ion token: enables Bing aerial imagery, world terrain and Google Photorealistic 3D Tiles. */
  ionToken?: string | null;
}

export class GlobeController {
  readonly viewer: Viewer;
  readonly photorealistic: boolean;
  private night: ImageryLayer;
  private satellite: ImageryLayer;
  readonly places: PlaceLabels;
  private reference: ImageryLayer[] = [];
  private base: BaseMap = "satellite";
  private buildingsWanted = true;
  private tileset: Cesium3DTileset | null = null;
  private tilesetLoading = false;
  private overlay: { layer: ImageryLayer; fade: { v: number } } | null = null;
  private overlays = new Set<{ layer: ImageryLayer; fade: { v: number } }>();
  private overlayToken = 0;
  private changeLayer: ImageryLayer | null = null;
  private clusterLayers: ImageryLayer[] = [];
  private hotspots: GeoJsonDataSource | null = null;
  private fires: BillboardCollection;
  private fireFootprints: BillboardCollection;
  private fireGrow = { v: 1 };
  private marker: Entity | null = null;
  private arc: Entity | null = null;
  private pickHandlers = new Set<PickHandler>();

  constructor(container: HTMLElement, options: GlobeOptions = {}) {
    this.photorealistic = !!options.ionToken;
    Ion.defaultAccessToken = options.ionToken ?? "";
    // Cesium World Terrain via ion. If it can't be downloaded (venue Wi-Fi, DNS), fall back to a smooth
    // Earth so the globe still shows: without this the whole globe disappears.
    const terrain = this.photorealistic ? Terrain.fromWorldTerrain() : undefined;
    terrain?.errorEvent.addEventListener((err: unknown) => {
      console.warn("3D terrain unavailable, using a smooth Earth:", err);
      this.viewer.scene.terrainProvider = new EllipsoidTerrainProvider();
      this.viewer.scene.globe.depthTestAgainstTerrain = false;
    });
    this.viewer = new Viewer(container, {
      baseLayer: false,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      contextOptions: { webgl: { preserveDrawingBuffer: true, alpha: false } },
      orderIndependentTranslucency: false,
      ...(terrain ? { terrain } : {}),
    });
    const { scene } = this.viewer;
    // The platform is white paper: Earth floats on the page, no starfield.
    scene.backgroundColor = Color.WHITE;
    if (scene.skyBox) scene.skyBox.show = false;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    scene.globe.baseColor = Color.fromCssColorString("#dfe3e6");
    if (scene.skyAtmosphere) scene.skyAtmosphere.brightnessShift = 0.25;
    scene.globe.showGroundAtmosphere = true;
    scene.globe.enableLighting = false;
    scene.globe.depthTestAgainstTerrain = this.photorealistic;
    scene.fog.enabled = this.photorealistic;
    scene.screenSpaceCameraController.minimumZoomDistance = this.photorealistic ? 40 : 400;
    scene.screenSpaceCameraController.maximumZoomDistance = 4.5e7;

    const layers = this.viewer.imageryLayers;
    this.night = layers.addImageryProvider(gibs("VIIRS_Black_Marble", "2016-01-01", "GoogleMapsCompatible_Level8", "png", 8));
    this.night.brightness = 1.15;
    this.night.show = false;
    const sentinel = () =>
      new UrlTemplateImageryProvider({
        url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg",
        tilingScheme: new WebMercatorTilingScheme(),
        maximumLevel: 15,
        credit: new Credit("Sentinel-2 cloudless 2023 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2023), CC BY-NC-SA 4.0", false),
      });
    if (this.photorealistic) {
      // Bing Maps aerial imagery via Cesium ion: sub-metre detail in most cities, kept free of baked-in
      // text. Names come from our own crisp label layer (PlaceLabels), which also floats over the 3D city.
      // (Raster label overlays were tested and rejected: text breaks up when draped over terrain and buildings.)
      this.satellite = ImageryLayer.fromProviderAsync(createWorldImageryAsync({ style: IonWorldImageryStyle.AERIAL }));
      layers.add(this.satellite);
      // If Cesium ion can't be reached (bad venue Wi-Fi, DNS), fall back to Sentinel-2 so the globe still shows Earth.
      this.satellite.errorEvent.addEventListener(() => {
        const idx = layers.indexOf(this.satellite);
        const fallback = new ImageryLayer(sentinel());
        layers.add(fallback, Math.max(0, idx));
        layers.remove(this.satellite, true);
        this.satellite = fallback;
        this.applyBase();
      });
    } else {
      this.satellite = layers.addImageryProvider(sentinel());
    }

    const coast = layers.addImageryProvider(gibs("Coastlines_15m", "2020-01-01", "GoogleMapsCompatible_Level13", "png", 9));
    coast.alpha = 0.35;
    this.reference = [coast];
    this.applyBase();
    this.places = new PlaceLabels(this.viewer);

    this.fireFootprints = scene.primitives.add(new BillboardCollection({ scene }));
    this.fires = scene.primitives.add(new BillboardCollection({ scene }));

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((e: { position: Cartesian2 }) => this.handleClick(e.position), ScreenSpaceEventType.LEFT_CLICK);

    this.viewer.camera.setView({ destination: Cartesian3.fromDegrees(8, 14, 6.0e7) });

    scene.preRender.addEventListener(() => {
      const h = this.viewer.camera.positionCartographic.height;
      // Variable overlays are 0.5–2° grids: meaningful from orbit, misleading at street level.
      const altitude = Math.min(1, Math.max(0, (h - OVERLAY_FADE_LOW) / (OVERLAY_FADE_HIGH - OVERLAY_FADE_LOW)));
      for (const o of this.overlays) o.layer.alpha = o.fade.v * OVERLAY_ALPHA * (0.08 + 0.92 * altitude);
      // The photorealistic city takes over close to the ground.
      const wantCity = this.photorealistic && this.buildingsWanted && this.base === "satellite" && h < BUILDINGS_BELOW;
      if (wantCity && !this.tileset && !this.tilesetLoading) void this.loadTileset();
      if (this.tileset) this.tileset.show = wantCity;
    });
  }

  private async loadTileset() {
    this.tilesetLoading = true;
    try {
      // Google requires its own geocoder alongside these tiles; our place search uses Google via ion.
      const tileset = await createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
      this.viewer.scene.primitives.add(tileset);
      this.tileset = tileset;
    } catch (err) {
      console.warn("Photorealistic 3D tiles unavailable:", err);
    } finally {
      this.tilesetLoading = false;
    }
  }

  /** Show or hide all place names. */
  setLabels(on: boolean) {
    this.places.setEnabled(on);
  }

  labelItemFromEntity(entityId?: string): LabelItem | undefined {
    return this.places.itemFor(entityId);
  }

  /** Opening shot: Earth swings in from deep space. */
  intro() {
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(10, 12, 2.15e7),
      duration: reduceMotion() ? 0 : 1.8,
      easingFunction: EasingFunction.QUINTIC_OUT,
    });
  }

  onPick(fn: PickHandler) {
    this.pickHandlers.add(fn);
    return () => this.pickHandlers.delete(fn);
  }

  private handleClick(position: Cartesian2) {
    const { scene, camera } = this.viewer;
    const picked = scene.pick(position);
    const entityId: string | undefined = picked?.id?.id && typeof picked.id.id === "string" ? picked.id.id : undefined;
    let cartesian: Cartesian3 | undefined;
    if (this.tileset?.show && scene.pickPositionSupported) cartesian = scene.pickPosition(position);
    if (!cartesian) {
      const ray = camera.getPickRay(position);
      cartesian = ray ? scene.globe.pick(ray, scene) : undefined;
    }
    if (!cartesian) return;
    const c = Cartographic.fromCartesian(cartesian);
    const pick = { lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude), entityId };
    this.pickHandlers.forEach((fn) => fn(pick));
  }

  private applyBase() {
    this.night.show = this.base === "night";
    this.satellite.show = this.base === "satellite";
    // Coastlines help on the night map and on Sentinel-2.
    const coastNeeded = this.base === "night" || !this.photorealistic;
    for (const r of this.reference) r.show = coastNeeded;
  }

  setBase(base: BaseMap) {
    this.base = base;
    this.applyBase();
  }

  setBuildings(on: boolean) {
    this.buildingsWanted = on;
  }

  /** Swap the data overlay with a crossfade. Later calls win over slower earlier loads. */
  async setOverlay(url: string | null) {
    const token = ++this.overlayToken;
    const layers = this.viewer.imageryLayers;
    const previous = this.overlay;
    const retire = (o: NonNullable<typeof previous>, duration: number) =>
      gsap.to(o.fade, {
        v: 0,
        duration: reduceMotion() ? 0 : duration,
        ease: "power1.in",
        onComplete: () => {
          this.overlays.delete(o);
          if (layers.contains(o.layer)) layers.remove(o.layer, true);
        },
      });
    if (!url) {
      this.overlay = null;
      if (previous) retire(previous, 0.3);
      return;
    }
    const provider = await SingleTileImageryProvider.fromUrl(url, { rectangle: WORLD });
    if (token !== this.overlayToken) return;
    const layer = new ImageryLayer(provider, { alpha: 0 });
    layers.add(layer, layers.indexOf(this.satellite) + 1);
    const entry = { layer, fade: { v: 0 } };
    this.overlays.add(entry);
    this.overlay = entry;
    gsap.to(entry.fade, { v: 1, duration: reduceMotion() ? 0 : 0.45, ease: "power2.out" });
    if (previous) retire(previous, 0.45);
  }

  private fadeOut(layer: ImageryLayer, duration = 0.3) {
    gsap.to(layer, {
      alpha: 0,
      duration: reduceMotion() ? 0 : duration,
      ease: "power1.in",
      onComplete: () => {
        if (this.viewer.imageryLayers.contains(layer)) this.viewer.imageryLayers.remove(layer, true);
      },
    });
  }

  flyToPoint(lat: number, lon: number, height = 2.6e6, duration = 2.2) {
    return new Promise<void>((resolve) =>
      this.viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon, lat, height),
        duration: reduceMotion() ? 0 : duration,
        easingFunction: EasingFunction.QUINTIC_IN_OUT,
        complete: resolve,
        cancel: resolve,
      }),
    );
  }

  flyToBox(b: BBox, duration = 2.2) {
    const pad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.25;
    return new Promise<void>((resolve) =>
      this.viewer.camera.flyTo({
        destination: Rectangle.fromDegrees(
          Math.max(-180, b[0] - pad),
          Math.max(-90, b[1] - pad),
          Math.min(180, b[2] + pad),
          Math.min(90, b[3] + pad),
        ),
        duration: reduceMotion() ? 0 : duration,
        easingFunction: EasingFunction.QUINTIC_IN_OUT,
        complete: resolve,
        cancel: resolve,
      }),
    );
  }

  setMarker(lat: number | null, lon?: number) {
    if (this.marker) {
      this.viewer.entities.remove(this.marker);
      this.marker = null;
    }
    if (lat == null || lon == null) return;
    this.marker = this.viewer.entities.add({
      id: "selection-marker",
      position: Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 11,
        color: ACCENT,
        outlineColor: Color.fromCssColorString("#0a0f16"),
        outlineWidth: 3,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  /** Earth Engine change tiles. Replaces any previous change layer. */
  setChangeTiles(url: string | null) {
    if (this.changeLayer) {
      this.fadeOut(this.changeLayer);
      this.changeLayer = null;
    }
    if (!url) return;
    const provider = new UrlTemplateImageryProvider({
      url,
      tilingScheme: new WebMercatorTilingScheme(),
      maximumLevel: 17,
      credit: new Credit("Change: AlphaEarth embeddings (Google DeepMind) via Earth Engine", false),
    });
    const layer = this.viewer.imageryLayers.addImageryProvider(provider, this.viewer.imageryLayers.indexOf(this.reference[0]));
    layer.alpha = 0;
    gsap.to(layer, { alpha: 0.9, duration: reduceMotion() ? 0 : 0.6, ease: "power2.out" });
    this.changeLayer = layer;
  }

  async setHotspots(hotspots: Hotspot[] | null, selectedId?: string) {
    if (this.hotspots) {
      await this.viewer.dataSources.remove(this.hotspots, true);
      this.hotspots = null;
    }
    if (!hotspots?.length) return;
    const collection = {
      type: "FeatureCollection",
      features: hotspots.map((h) => ({ type: "Feature", id: `hotspot:${h.id}`, properties: { id: h.id }, geometry: h.geometry })),
    };
    // Clamped to the ground so the outlines drape over terrain and the 3D city.
    const ds = await GeoJsonDataSource.load(collection, {
      stroke: ACCENT,
      fill: ACCENT.withAlpha(0.12),
      strokeWidth: 2,
      clampToGround: true,
    });
    for (const entity of ds.entities.values) {
      const hid = entity.properties?.id?.getValue() as string | undefined;
      const selected = hid === selectedId;
      if (entity.polygon) {
        entity.polygon.material = new ColorMaterialProperty(ACCENT.withAlpha(selected ? 0.5 : 0.22));
        entity.polygon.outlineColor = new ConstantProperty(ACCENT);
        entity.polygon.classificationType = new ConstantProperty(ClassificationType.BOTH);
      }
      if (hid) entity.name = `hotspot:${hid}`;
    }
    // Patches are often under 1 km²: invisible from a city-wide view. A numbered pin on each one
    // (matching the list in the side panel) makes them findable; pins hide once you're close.
    hotspots.forEach((h, i) => {
      ds.entities.add({
        id: `hotspot:${h.id}#pin`,
        position: Cartesian3.fromDegrees(h.lon, h.lat),
        properties: { id: h.id },
        billboard: {
          image: pinSprite(i + 1, h.id === selectedId).toDataURL(),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale: 0.5,
          distanceDisplayCondition: new DistanceDisplayCondition(2500, 2.5e6),
        },
      });
    });
    await this.viewer.dataSources.add(ds);
    this.hotspots = ds;
  }

  hotspotIdFromEntity(entityId?: string) {
    if (!entityId || !this.hotspots) return undefined;
    const e = this.hotspots.entities.getById(entityId);
    return (e?.properties?.id?.getValue() as string | undefined) ?? undefined;
  }

  async setClusters(urls: string[], arc?: { from: [number, number]; to: [number, number] }) {
    for (const l of this.clusterLayers) this.fadeOut(l);
    this.clusterLayers = [];
    if (this.arc) {
      this.viewer.entities.remove(this.arc);
      this.arc = null;
    }
    for (const url of urls) {
      const provider = await SingleTileImageryProvider.fromUrl(url, { rectangle: WORLD });
      const layer = new ImageryLayer(provider, { alpha: 0 });
      this.viewer.imageryLayers.add(layer, this.viewer.imageryLayers.indexOf(this.reference[0]));
      gsap.to(layer, { alpha: 0.95, duration: reduceMotion() ? 0 : 0.5 });
      this.clusterLayers.push(layer);
    }
    if (arc) {
      this.arc = this.viewer.entities.add({
        id: "divergence-arc",
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights([arc.from[1], arc.from[0], 2e5, arc.to[1], arc.to[0], 2e5]),
          width: 2,
          arcType: ArcType.GEODESIC,
          material: new PolylineDashMaterialProperty({ color: ACCENT, dashLength: 18 }),
        },
      });
    }
  }

  /**
   * NASA FIRMS hot spots as flames: bigger and redder for more intense fires (fire radiative power),
   * growing as you zoom in. Close to the ground each fire also shows its real footprint (one VIIRS
   * pixel, about 375 m across). Click a flame for details.
   */
  setFires(fires: Fire[] | null) {
    this.fires.removeAll();
    this.fireFootprints.removeAll();
    if (!fires) return;
    // Data-URL strings act as shared image ids, so 10,000 flames use one texture (a canvas would be
    // copied into the texture atlas once per billboard and overflow it).
    const flame = flameSprite().toDataURL();
    const ring = footprintSprite().toDataURL();
    fires.forEach((f, i) => {
      const position = Cartesian3.fromDegrees(f.lon, f.lat);
      const strength = f.frp >= 100 ? 1 : f.frp >= 20 ? 0.72 : 0.5;
      this.fires.add({
        id: { id: `fire:${i}` },
        position,
        image: flame,
        scale: 0.42 * strength,
        verticalOrigin: VerticalOrigin.BOTTOM,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: new NearFarScalar(2e4, 1.6, 2.2e7, 0.42),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      this.fireFootprints.add({
        id: { id: `fire:${i}` },
        position,
        image: ring,
        width: 375,
        height: 375,
        sizeInMeters: true,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        distanceDisplayCondition: new DistanceDisplayCondition(0, FIRE_FOOTPRINT_BELOW),
      });
    });
    // The flames rise into view rather than popping in.
    if (!reduceMotion()) {
      this.fireGrow.v = 0;
      gsap.to(this.fireGrow, {
        v: 1,
        duration: 0.7,
        ease: "expo.out",
        onUpdate: () => {
          for (let i = 0; i < this.fires.length; i++) this.fires.get(i).color = Color.WHITE.withAlpha(this.fireGrow.v);
        },
      });
    }
  }

  fireIndexFromEntity(entityId?: string): number | null {
    return entityId?.startsWith("fire:") ? Number(entityId.slice(5)) : null;
  }

  snapshot(): string {
    this.viewer.render();
    return this.viewer.scene.canvas.toDataURL("image/png");
  }

  destroy() {
    this.pickHandlers.clear();
    this.places.destroy();
    if (!this.viewer.isDestroyed()) this.viewer.destroy();
  }
}

let current: GlobeController | null = null;
export const globe = {
  set(c: GlobeController | null) {
    current = c;
  },
  get() {
    return current;
  },
};

let flameCache: HTMLCanvasElement | null = null;
/** A flame glyph with a soft glow, drawn once on a canvas (no image files, no emoji). */
function flameSprite(): HTMLCanvasElement {
  if (flameCache) return flameCache;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 80;
  const g = c.getContext("2d")!;
  const glow = g.createRadialGradient(32, 58, 2, 32, 58, 30);
  glow.addColorStop(0, "rgba(255,120,40,0.55)");
  glow.addColorStop(1, "rgba(255,120,40,0)");
  g.fillStyle = glow;
  g.fillRect(0, 20, 64, 60);
  const flame = (scale: number, color: string) => {
    g.save();
    g.translate(32, 74);
    g.scale(scale, scale);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-20, 0, -24, -22, -12, -36);
    g.bezierCurveTo(-8, -26, -2, -24, -2, -24);
    g.bezierCurveTo(-6, -40, 2, -54, 6, -62);
    g.bezierCurveTo(8, -46, 24, -38, 22, -18);
    g.bezierCurveTo(21, -6, 12, 0, 0, 0);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.restore();
  };
  flame(1, "#d93a12");
  flame(0.68, "#ff7a1a");
  flame(0.36, "#ffd23f");
  g.strokeStyle = "rgba(255,255,255,0.9)";
  flameCache = c;
  return c;
}

let ringCache: HTMLCanvasElement | null = null;
function footprintSprite(): HTMLCanvasElement {
  if (ringCache) return ringCache;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(229,72,31,0.28)";
  g.strokeStyle = "rgba(229,72,31,0.95)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(32, 32, 29, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  ringCache = c;
  return c;
}

const pinCache = new Map<string, HTMLCanvasElement>();
/** A numbered highlighter pin for a change hotspot (cached, so re-selecting never adds new textures). */
function pinSprite(n: number, selected: boolean): HTMLCanvasElement {
  const key = `${n}:${selected}`;
  const hit = pinCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  pinCache.set(key, c);
  c.width = 64;
  c.height = 84;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.moveTo(32, 82);
  g.bezierCurveTo(26, 66, 6, 54, 6, 32);
  g.arc(32, 32, 26, Math.PI, 0);
  g.bezierCurveTo(58, 54, 38, 66, 32, 82);
  g.closePath();
  g.fillStyle = selected ? "#11181f" : "#ffe14d";
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = selected ? "#ffe14d" : "#11181f";
  g.stroke();
  g.fillStyle = selected ? "#ffe14d" : "#11181f";
  g.font = "700 28px 'Public Sans Variable', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 32, 33);
  return c;
}
