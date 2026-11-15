import type { VariableId } from "./types";

/** One piece of evidence behind an answer, built on the server from the tool's full result. */
export interface TrendEvidence {
  kind: "trend";
  tier: "proven" | "not_proven" | "no_data";
  variable: VariableId;
  label: string;
  scope: "point" | "region";
  place: { lat?: number; lon?: number; bbox?: [number, number, number, number] } | null;
  source: string;
  source_url: string | null;
  source_detail: string | null;
  method: string | null;
  period: [number, number];
  units: string;
  slope_per_decade: number | null;
  ci_per_decade: [number, number] | null;
  total_change: number | null;
  p: number | null;
  chance_luck: string | null;
  years: number[];
  values: (number | null)[];
  trend_line: [[number, number], [number, number]] | null;
  cell?: { lat: number; lon: number; size_deg: number } | null;
  bbox?: [number, number, number, number] | null;
  share_significant_increase?: number | null;
  share_significant_decrease?: number | null;
}

export interface ObservedEvidence {
  kind: "observed";
  tier: "observed";
  topic: "recent_weather" | "recent_history" | "land_change" | "fires";
  title: string;
  place: { lat?: number; lon?: number; bbox?: [number, number, number, number] } | null;
  source: string;
  source_url: string | null;
  period: (string | number)[];
  normal_period?: [number, number];
  facts: { label: string; value: number | null; units: string; signed?: boolean; note?: string }[];
  summary?: string;
}

export type EvidenceCard = TrendEvidence | ObservedEvidence;

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A self-describing CSV: where the numbers come from, how they were tested, then the yearly values. */
export function evidenceCsv(card: TrendEvidence): string {
  const where =
    card.scope === "region" && card.bbox
      ? `region (west,south,east,north) ${card.bbox.join(", ")}`
      : card.cell
        ? `grid cell ${card.cell.size_deg} deg centred at ${card.cell.lat}, ${card.cell.lon}`
        : `point ${card.place?.lat}, ${card.place?.lon}`;
  const meta: [string, unknown][] = [
    ["dataset", card.source_detail ?? card.source],
    ["source_url", card.source_url],
    ["location", where],
    ["period", `${card.period[0]}-${card.period[1]}`],
    ["units", card.units],
    ["rate_per_decade (Theil-Sen)", card.slope_per_decade],
    ["rate_95pct_range_per_decade", card.ci_per_decade ? card.ci_per_decade.join(" to ") : ""],
    ["p_value (corrected for testing the whole map where applicable)", card.p],
    ["proven_at_95pct", card.tier === "proven"],
    ["method", card.method],
    ["generated_by", "Ground Truth (NASA Space Apps 2026)"],
  ];
  const lines = meta.map(([k, v]) => `# ${k}: ${v ?? ""}`);
  lines.push("year,value");
  card.years.forEach((y, i) => lines.push(`${y},${csvCell(card.values[i])}`));
  return lines.join("\n") + "\n";
}

export function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fmtNum(v: number | null | undefined, digits?: number): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  const d = digits ?? (a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.1 ? 2 : 3);
  return v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

/** The four tiers every claim is labelled with. */
export const TIER: Record<string, { text: string; cls: string; hint: string }> = {
  proven: { text: "Confirmed trend", cls: "bg-mark text-on-mark", hint: "Passed the significance test at 95 % confidence, corrected for testing the whole map." },
  not_proven: { text: "Not confirmed yet", cls: "border border-line text-muted", hint: "The year-to-year ups and downs are bigger than the change, so it could be natural variation." },
  no_data: { text: "No data here", cls: "border border-line text-faint", hint: "This record doesn't cover this spot." },
  observed: { text: "Observed", cls: "bg-panel-2 text-ink", hint: "Really recorded by satellites, but not a tested long-term trend." },
};

const latTag = (v: number) => `${Math.abs(v).toFixed(2)}${v >= 0 ? "N" : "S"}`;
const lonTag = (v: number) => `${Math.abs(v).toFixed(2)}${v >= 0 ? "E" : "W"}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A CSV filename that says what and where, e.g. ground-truth_temperature_abuja_9.07N_7.40E_1980-2025.csv */
export function csvName(
  variable: string,
  where: { name?: string; lat?: number; lon?: number; bbox?: [number, number, number, number] | null } | null,
  period?: [number, number],
) {
  const parts = ["ground-truth", variable];
  if (where?.name) parts.push(slug(where.name));
  if (where?.lat != null && where?.lon != null) parts.push(`${latTag(where.lat)}_${lonTag(where.lon)}`);
  else if (where?.bbox) parts.push(`region_${latTag(where.bbox[1])}-${latTag(where.bbox[3])}_${lonTag(where.bbox[0])}-${lonTag(where.bbox[2])}`);
  if (period) parts.push(period.join("-"));
  return parts.join("_") + ".csv";
}
