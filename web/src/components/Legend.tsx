import type { VariableMeta } from "../lib/types";
import { PLAIN } from "../lib/plain";

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
        <span className="text-ink">{mode === "trend" ? `Change every 10 years (${meta.units})` : `Compared with ${meta.legend.frames.baseline} (${meta.units})`}</span>
      </div>
      <div className="h-2.5 rounded-sm" style={{ background: gradient }} aria-hidden />
      <div className="tabular mt-1 flex justify-between text-[11px] text-muted">
        <span>−{trim(scale.limit)}</span>
        <span>0</span>
        <span>+{trim(scale.limit)}</span>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{PLAIN[meta.id].down}</span>
        <span>{PLAIN[meta.id].up}</span>
      </div>
      {mode === "trend" && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: "rgba(124,130,140,.6)" }} aria-hidden />
          Grey: no proven change
        </div>
      )}
    </div>
  );
}
