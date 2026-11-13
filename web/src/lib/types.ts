export type VariableId = "temperature" | "vegetation" | "rainfall" | "water";
export const VARIABLE_IDS: VariableId[] = ["temperature", "vegetation", "rainfall", "water"];

export type BBox = [number, number, number, number]; // west, south, east, north

export interface VariableMeta {
  id: VariableId;
  label: string;
  units: string;
  long_name: string;
  source: string;
  citation: string;
  url: string;
  years: [number, number];
  increase_means: string;
  decrease_means: string;
  land_only: boolean;
  palette: string[];
  years_missing: number[];
  method: string;
  built: string;
  legend: {
    significance: { limit: number; units: string };
    frames: { limit: number; units: string; baseline: string };
  };
  summary: {
    cells_tested: number;
    cells_significant: number;
    share_area_significant_increase: number;
    share_area_significant_decrease: number;
  };
}

export interface PointTrend {
  variable: VariableId;
  label: string;
  units: string;
  cell: { lat: number; lon: number; size_deg: number };
  years: number[];
  values: (number | null)[];
  period: [number, number];
  tested: boolean;
  slope_per_decade: number | null;
  p: number | null;
  q: number | null;
  significant: boolean;
  direction: "increasing" | "decreasing" | null;
  meaning: string | null;
  verdict: string;
  source: string;
  method: string;
  trend_line: [[number, number], [number, number]] | null;
}

export interface RegionTrend {
  variable: VariableId;
  label: string;
  units: string;
  bbox: BBox;
  years: number[];
  values: (number | null)[];
  period: [number, number];
  slope_per_decade: number | null;
  p: number | null;
  significant: boolean;
  verdict: string;
  cells_tested: number;
  share_significant_increase: number | null;
  share_significant_decrease: number | null;
}

export interface Cluster {
  id: string;
  sign: 1 | -1;
  area_km2: number;
  slope_per_decade: number;
  lat: number;
  lon: number;
  bbox: BBox;
  cells: number;
}

export interface DivergencePair {
  increasing: Cluster;
  decreasing: Cluster;
  distance_km: number;
}

export interface Divergence {
  variable: VariableId;
  label: string;
  units: string;
  increase_means: string;
  decrease_means: string;
  period: [number, number];
  pairs: DivergencePair[];
}

export interface Hotspot {
  id: string;
  lat: number;
  lon: number;
  area_km2: number;
  score: number;
  from: string;
  to: string;
  transition: string;
  summary: string;
  geometry: { type: string; coordinates: unknown };
}

export interface ChangeResult {
  bbox: BBox;
  year_a: number;
  year_b: number;
  threshold: number;
  median_change: number;
  p99_change: number;
  share_strong_change: number;
  hotspots: Hotspot[];
  method: string;
  tile_url: string;
  cached: boolean;
}

export interface NowVsNormal {
  lat: number;
  lon: number;
  window: [string, string];
  normal_period: [number, number];
  temperature: {
    units: string;
    recent_mean: number;
    normal_mean: number;
    anomaly: number;
    standardized: number | null;
    rank_note: string | null;
  };
  rainfall?: {
    units: string;
    recent_total: number;
    normal_total: number;
    percent_of_normal: number | null;
    rank_note: string | null;
  };
  summary: string;
  source: string;
}

export interface Fire {
  lat: number;
  lon: number;
  frp: number;
  confidence: string;
  time: string;
}

export interface Fires {
  count: number;
  fires: Fire[];
  source: string;
  note: string;
  fetched_at: string;
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
  bbox: BBox;
  type?: string;
}

export interface RegionalCheck {
  id: string;
  title: string;
  finding: string;
  reference: string;
  variable: VariableId;
  detail: string;
  passed: boolean | null;
  status: string;
}

export interface Checks {
  regional: RegionalCheck[];
  global_temperature: {
    title: string;
    detail: string;
    ours: number;
    reference: number;
    units: string;
    difference: number;
    passed: boolean;
    source: string;
  } | null;
  trend_tests: {
    replicates: number;
    false_alarm: Record<string, Record<string, number>>;
    power: Record<string, Record<string, number>>;
  } | null;
}
