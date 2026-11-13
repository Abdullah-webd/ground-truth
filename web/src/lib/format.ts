export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

export function formatP(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "n/a";
  if (p < 0.001) return "< 0.001";
  return `= ${p.toFixed(3)}`;
}

export function formatValue(v: number | null | undefined, units: string): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return `${v.toFixed(digits)} ${units}`;
}

export function formatRate(v: number | null | undefined, units: string): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : abs >= 0.1 ? 2 : 3;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${abs.toFixed(digits)} ${units}/decade`;
}

/** Short place label from a long geocoder display name: "Lagos, Lagos Island, …, Nigeria" -> "Lagos". */
export function shortPlace(name: string): string {
  return name.split(",")[0].trim();
}
