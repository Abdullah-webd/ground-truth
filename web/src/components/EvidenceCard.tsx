import { motion } from "motion/react";
import { globe } from "../globe/controller";
import { downloadText, evidenceCsv, fmtNum, type EvidenceCard as Card, type TrendEvidence } from "../lib/evidence";
import { PLAIN } from "../lib/plain";
import { useApp } from "../state/store";
import { TIER } from "../lib/evidence";


function Spark({ card }: { card: TrendEvidence }) {
  const pts = card.years.map((y, i) => [y, card.values[i]] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 3) return null;
  const W = 120;
  const H = 34;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const line = card.trend_line;
  const lo = Math.min(...ys, ...(line ? line.map((p) => p[1]) : []));
  const hi = Math.max(...ys, ...(line ? line.map((p) => p[1]) : []));
  const x = (v: number) => 2 + ((v - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - 4);
  const y = (v: number) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[34px] w-[120px] shrink-0" aria-hidden>
      <path d={pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("")} fill="none" stroke="var(--color-faint)" strokeWidth="1.2" />
      {line && (
        <line
          x1={x(line[0][0])}
          y1={y(line[0][1])}
          x2={x(line[1][0])}
          y2={y(line[1][1])}
          stroke={card.tier === "proven" ? "var(--color-mark)" : "var(--color-muted)"}
          strokeWidth="2"
          strokeDasharray={card.tier === "proven" ? undefined : "3 3"}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function plainFinding(card: TrendEvidence): string {
  const p = PLAIN[card.variable];
  if (card.tier === "no_data" || card.slope_per_decade == null) return `${p?.name ?? card.label}: not measured here.`;
  const up = card.slope_per_decade > 0;
  const total = card.total_change != null ? Math.abs(card.total_change) : null;
  const size = total != null ? `${up ? "up" : "down"} ${fmtNum(total)} ${card.units} since ${card.period[0]}` : "";
  return `${p?.name ?? card.label}: ${card.tier === "proven" ? (up ? p.up : p.down) : `maybe ${up ? p.up : p.down}`}, ${size}.`;
}

/** The evidence behind one claim, shown right under the answer (not hidden behind a link). */
export function EvidenceCard({ card, index }: { card: Card; index: number }) {
  const tier = TIER[card.tier];
  const showOnMap = () => {
    const app = useApp.getState();
    const g = globe.get();
    if (card.kind === "trend") {
      app.setVariable(card.variable);
      app.setMapView("trend");
    }
    const pl = card.place;
    if (pl?.bbox) void g?.flyToBox(pl.bbox);
    else if (pl?.lat != null && pl.lon != null) {
      app.select({ kind: "point", lat: pl.lat, lon: pl.lon });
      void g?.flyToPoint(pl.lat, pl.lon, card.kind === "trend" ? 2.4e6 : 9e4);
    }
    if (card.kind === "observed" && card.topic === "fires" && !app.showFires) app.toggleFires();
  };

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.06, ease: [0.23, 1, 0.32, 1] }}
      className="rounded-xl border border-line bg-ground/60 px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${tier.cls}`} title={tier.hint}>
          {tier.text}
        </span>
        <span className="truncate text-[11px] text-muted" title={card.source}>
          {card.source}
          {card.period && card.period.length >= 2 ? `, ${card.period[0]}–${card.period[1]}` : card.period?.[0] ? `, ${card.period[0]}` : ""}
        </span>
      </div>

      {card.kind === "trend" ? (
        <div className="mt-1.5 flex items-start justify-between gap-3">
          <div className="min-w-0 text-[13px] leading-snug">
            <p className="font-medium text-ink">{plainFinding(card)}</p>
            {card.slope_per_decade != null && (
              <p className="tabular mt-0.5 text-muted">
                {fmtNum(card.slope_per_decade)} {card.units} per decade
                {card.ci_per_decade ? `, likely ${fmtNum(card.ci_per_decade[0])} to ${fmtNum(card.ci_per_decade[1])}` : ""}
              </p>
            )}
            {card.chance_luck && <p className="text-muted">Chance it's just luck: {card.chance_luck}</p>}
            {card.scope === "region" && card.share_significant_decrease != null && (
              <p className="tabular text-muted">
                Proven {PLAIN[card.variable]?.down ?? "falling"} across {Math.round((card.share_significant_decrease ?? 0) * 100)}% of the area,{" "}
                {PLAIN[card.variable]?.up ?? "rising"} across {Math.round((card.share_significant_increase ?? 0) * 100)}%
              </p>
            )}
          </div>
          <Spark card={card} />
        </div>
      ) : (
        <div className="mt-1.5 text-[13px] leading-snug">
          <p className="font-medium text-ink">{card.title}</p>
          <ul className="tabular mt-0.5 flex flex-col text-muted">
            {card.facts.slice(0, 4).map((f) => (
              <li key={f.label}>
                {f.label}: {f.signed && f.value != null && f.value > 0 ? "+" : ""}
                {fmtNum(f.value)}
                {f.units ? ` ${f.units}` : ""}
                {f.note ? ` (${f.note})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={showOnMap} className="btn btn-quiet h-8 rounded-lg border border-line px-2.5 text-[12px] text-ink">
          Show on the map
        </button>
        {card.kind === "trend" && card.tier !== "no_data" && (
          <button
            type="button"
            onClick={() => downloadText(`ground-truth-${card.variable}-${card.period.join("-")}.csv`, evidenceCsv(card))}
            className="btn btn-quiet h-8 rounded-lg border border-line px-2.5 text-[12px] text-ink"
          >
            Download the data
          </button>
        )}
        {card.source_url && (
          <a href={card.source_url} target="_blank" rel="noopener" className="btn btn-quiet inline-flex h-8 items-center rounded-lg px-2 text-[12px] text-muted underline-offset-2 hover:underline">
            Source
          </a>
        )}
      </div>
    </motion.li>
  );
}

/** "✓ 9 numbers checked against NASA data" (or a warning if any couldn't be matched). */
export function CheckedBadge({ checked, unverified }: { checked?: number; unverified?: string[] }) {
  if (checked == null && !unverified?.length) return null;
  if (unverified && unverified.length > 0)
    return (
      <p className="rounded-lg border border-bad/50 px-2.5 py-1.5 text-[12px] text-bad">
        {unverified.join(", ")} could not be matched to the data. Treat with caution.
      </p>
    );
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-muted">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <path d="M2 6.3l2.4 2.4L10 3.2" fill="none" stroke="var(--color-ok)" strokeWidth="1.8" />
      </svg>
      {checked === 0 ? "No figures to check in this answer" : `${checked} number${checked === 1 ? "" : "s"} checked against the data`}
    </p>
  );
}
