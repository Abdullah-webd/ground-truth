import type { NowVsNormal, PointTrend, VariableId } from "./types";

/** Everyday words for each NASA record, so a first-time visitor knows what they are looking at. */
export interface PlainVariable {
  name: string;
  question: string;
  what: string;
  satellite: string;
  up: string;
  down: string;
  /** How to say an amount of this variable to a non-scientist. */
  amount: (abs: number) => string;
  /** Show the change as a percentage of the usual level (only for quantities that can't go negative). */
  relative: boolean;
}

const round = (a: number) => (a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(0) : a >= 1 ? a.toFixed(1) : a >= 0.1 ? a.toFixed(2) : a.toFixed(3));

export const PLAIN: Record<VariableId, PlainVariable> = {
  temperature: {
    name: "Temperature",
    question: "Is it getting hotter?",
    what: "How warm the air near the ground is over a whole year, from thousands of weather stations and ships combined by NASA.",
    satellite: "NASA GISTEMP",
    up: "getting hotter",
    down: "getting cooler",
    amount: (a) => `${round(a)} °C`,
    relative: false,
  },
  vegetation: {
    name: "Plant growth",
    question: "Are plants getting greener?",
    what: "How green and leafy the land looks from space. Bare desert is near 0, thick forest is near 0.9.",
    satellite: "NASA MODIS satellite",
    up: "getting greener",
    down: "getting browner",
    amount: (a) => `${round(a)} on the greenness scale`,
    relative: true,
  },
  rainfall: {
    name: "Rainfall",
    question: "Is it raining more or less?",
    what: "How much rain and snow falls in a year, measured by NASA's GPM rain satellites.",
    satellite: "NASA GPM satellites",
    up: "getting wetter",
    down: "getting drier",
    amount: (a) => `${round(a)} mm of rain a year`,
    relative: true,
  },
  water: {
    name: "Underground water",
    question: "Is water disappearing from the ground?",
    what: "All the water stored in the land: soil, rivers, lakes, ice and deep groundwater. NASA's GRACE satellites weigh it from orbit.",
    satellite: "NASA GRACE satellites",
    up: "gaining water",
    down: "losing water",
    amount: (a) => (a >= 1000 ? `a layer of water ${(a / 1000).toFixed(1)} m deep` : `a layer of water ${round(a)} mm deep`),
    relative: false,
  },
};

/** "1 in 1,000", "about 1 in 77", "about 4 in 10": the chance a pattern this strong is just luck. */
export function chance(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "unknown";
  if (p < 0.001) return "less than 1 in 1,000";
  if (p < 0.1) {
    const n = Math.round(1 / p);
    const nice = n >= 100 ? Math.round(n / 10) * 10 : n;
    return `about 1 in ${nice.toLocaleString()}`;
  }
  const tenths = Math.max(1, Math.min(9, Math.round(p * 10)));
  return `about ${tenths} in 10`;
}

/** Strength of evidence on a 0..1 scale for a little meter (log scale of the p-value). */
export function certainty(p: number | null | undefined): number {
  if (p == null || !Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(1, -Math.log10(Math.max(p, 1e-4)) / 4));
}

function totalChange(t: PointTrend): number {
  const years = t.period[1] - t.period[0];
  return ((t.slope_per_decade ?? 0) / 10) * years;
}

function usualLevel(t: PointTrend): number | null {
  const v = t.values.filter((x): x is number => x != null && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export type Status = "proven" | "unproven" | "nodata";

export interface PlainFinding {
  id: VariableId;
  status: Status;
  /** Short headline, e.g. "Getting hotter". */
  headline: string;
  /** One or two plain sentences with the size of the change. */
  detail: string;
  /** "less than 1 in 1,000" */
  luck: string;
}

export function explain(id: VariableId, t: PointTrend): PlainFinding {
  const v = PLAIN[id];
  if (!t.tested) {
    const missing = t.values.every((x) => x == null);
    return {
      id,
      status: "nodata",
      headline: "No measurement here",
      detail: missing ? `${v.satellite} does not measure ${v.name.toLowerCase()} at this spot (for example over the ocean).` : "Too few years of good data to test.",
      luck: "",
    };
  }
  const slope = t.slope_per_decade ?? 0;
  const rising = slope > 0;
  const dir = rising ? v.up : v.down;
  const total = Math.abs(totalChange(t));
  const usual = usualLevel(t);
  const pct = v.relative && usual && usual > 0 ? Math.round((total / usual) * 100) : null;
  const size = `${rising ? "Up" : "Down"} ${v.amount(total)} since ${t.period[0]}${pct != null && pct > 0 ? ` (about ${pct}% ${rising ? "more" : "less"})` : ""}.`;
  if (t.significant) {
    return {
      id,
      status: "proven",
      headline: dir[0].toUpperCase() + dir.slice(1),
      detail: size,
      luck: chance(t.q),
    };
  }
  return {
    id,
    status: "unproven",
    headline: `Maybe ${dir}, not proven`,
    detail: `${size.replace(/\.$/, "")}, but the ups and downs from year to year are bigger than that, so we can't call it a real trend yet.`,
    luck: chance(t.q),
  };
}

/** The case file's one-line answer. */
export function headline(findings: PlainFinding[]): string {
  const tested = findings.filter((f) => f.status !== "nodata");
  const proven = tested.filter((f) => f.status === "proven");
  if (!tested.length) return "NASA's records don't cover this spot well enough to test.";
  if (!proven.length) return `No lasting change is proven here in any of the ${tested.length} NASA records we checked.`;
  if (proven.length === tested.length) return `All ${tested.length} NASA records we checked show real, lasting change here.`;
  return `${proven.length} of the ${tested.length} NASA records we checked show real, lasting change here.`;
}

/** This month's weather, said simply. */
export function nowSentence(n: NowVsNormal): string {
  const t = n.temperature;
  const a = Math.abs(t.anomaly);
  const warm = t.anomaly >= 0;
  const temp =
    a < 0.3
      ? `The last 30 days were about as warm as usual for this time of year (${t.recent_mean} °C).`
      : `The last 30 days were ${a.toFixed(1)} °C ${warm ? "hotter" : "cooler"} than usual for this time of year (${t.recent_mean} °C on average).`;
  const rank = t.rank_note ? ` That's ${t.rank_note.replace(/^higher than every year/, "hotter than any year").replace(/^lower than every year/, "cooler than any year")}.` : "";
  const r = n.rainfall;
  let rain = "";
  if (r && r.percent_of_normal != null) {
    const p = r.percent_of_normal;
    rain =
      r.normal_total < 2
        ? " It is normally dry at this time of year."
        : p >= 150
          ? ` Rain was ${(p / 100).toFixed(1)} times the usual amount.`
          : p <= 60
            ? ` Rain was well below usual (${p}% of normal).`
            : ` Rain was close to usual (${p}% of normal).`;
  }
  return temp + rank + rain;
}
