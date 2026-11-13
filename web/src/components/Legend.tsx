import type { VariableMeta } from "../lib/types";

function trim(n: number) {
  const a = Math.abs(n);
  return a >= 100 ? n.toFixed(0) : a >= 10 ? n.toFixed(1) : a >= 1 ? n.toFixed(2) : n.toPrecision(2);
}

export function Legend({ meta, mode }: { meta: VariableMeta; mode: "trend" | "year" }) {
  const scale = mode === "trend" ? meta.legend.significance : meta.legend.frames;
  const gradient = `linear-gradient(to right, ${meta.palette.join(", ")})`;
  return (
    <div className="w-[240px]">
      <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
        <span>
          {mode === "trend" ? "Trend" : "Departure from"}{" "}
          <span className="text-ink">{mode === "trend" ? `${meta.units} per decade` : meta.legend.frames.baseline}</span>
        </span>
      </div>
      <div className="h-2.5 rounded-sm" style={{ background: gradient }} aria-hidden />
      <div className="tabular mt-1 flex justify-between text-[11px] text-muted">
        <span>−{trim(scale.limit)}</span>
        <span>0</span>
        <span>+{trim(scale.limit)}</span>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{meta.decrease_means}</span>
        <span>{meta.increase_means}</span>
      </div>
      {mode === "trend" && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: "rgba(124,130,140,.6)" }} aria-hidden />
          Grey: tested, change not statistically proven
        </div>
      )}
    </div>
  );
}
