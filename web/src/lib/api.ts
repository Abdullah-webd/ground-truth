import type {
  BBox,
  ChangeResult,
  Checks,
  Divergence,
  Fires,
  NowVsNormal,
  Place,
  PointTrend,
  RegionTrend,
  VariableId,
  VariableMeta,
} from "./types";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(`${path}${qs.size ? `?${qs}` : ""}`, { signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "offline", "Can't reach the Ground Truth server. Is the backend running?");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    const detail = Array.isArray(body?.detail) ? body.detail[0]?.msg : undefined;
    throw new ApiError(res.status, e.code ?? "error", e.message ?? detail ?? `Request failed (${res.status})`);
  }
  return body as T;
}

const bboxParam = (b?: BBox) => (b ? b.map((v) => v.toFixed(4)).join(",") : undefined);

export const api = {
  config: () => get<{ cesium_ion_token: string | null; photorealistic: boolean }>("/api/config"),
  health: () => get<{ status: string; variables_built: VariableId[]; agent_key: boolean }>("/api/health"),
  variables: () => get<{ variables: VariableMeta[] }>("/api/variables"),
  point: (variable: VariableId, lat: number, lon: number, signal?: AbortSignal) =>
    get<PointTrend>("/api/trend/point", { variable, lat: lat.toFixed(4), lon: lon.toFixed(4) }, signal),
  region: (variable: VariableId, bbox: BBox) => get<RegionTrend>("/api/trend/region", { variable, bbox: bboxParam(bbox) }),
  divergence: (variable: VariableId, bbox?: BBox, limit = 3) =>
    get<Divergence>("/api/divergence", { variable, bbox: bboxParam(bbox), limit }),
  change: (bbox: BBox, year_a: number, year_b: number) =>
    get<ChangeResult>("/api/change", { bbox: bboxParam(bbox), year_a, year_b }),
  now: (lat: number, lon: number, signal?: AbortSignal) =>
    get<NowVsNormal>("/api/now", { lat: lat.toFixed(3), lon: lon.toFixed(3) }, signal),
  fires: (bbox?: BBox) => get<Fires>("/api/fires", { bbox: bboxParam(bbox) }),
  locate: (q: string) => get<Place>("/api/locate", { q }),
  checks: () => get<Checks>("/api/checks"),
};

// `version` (the store's build time) busts the browser cache when the pipeline is re-run.
export const overlayUrl = (variable: VariableId, version = "") =>
  `/static/derived/${variable}/significance.png?v=${encodeURIComponent(version)}`;
export const frameUrl = (variable: VariableId, year: number, version = "") =>
  `/static/derived/${variable}/frames/${year}.png?v=${encodeURIComponent(version)}`;
export const clusterUrl = (variable: VariableId, cluster: string, color?: string) =>
  `/api/divergence/cluster.png?variable=${variable}&cluster=${encodeURIComponent(cluster)}${color ? `&color=${color.replace("#", "")}` : ""}`;
