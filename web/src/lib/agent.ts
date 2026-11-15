import type { BBox, ChangeResult, Divergence, Place, VariableId } from "./types";
import type { EvidenceCard } from "./evidence";

export type UiCommand =
  | { action: "place"; place: Place }
  | { action: "change"; change: ChangeResult }
  | { action: "point"; variable: VariableId; lat: number; lon: number }
  | { action: "region"; variable: VariableId; bbox: BBox }
  | { action: "divergence"; divergence: Divergence }
  | { action: "fires"; bbox: BBox }
  | { action: "view"; variable: VariableId; view: "trend" | "year"; year: number | null };

export type AgentEvent =
  | { type: "status"; id: string; text: string }
  | { type: "tool"; id: string; name: string; ok: boolean; error?: string | null }
  | ({ type: "ui" } & UiCommand)
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "evidence"; id: string; card: EvidenceCard }
  | { type: "done"; unverified_numbers: string[]; numbers_checked?: number; tool_calls: number; seconds: number };

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem("gt-session");
    if (existing) return existing;
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    sessionStorage.setItem("gt-session", id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}

/** Forget this tab's conversation so the next question starts fresh (Aisha keeps no memory of earlier turns). */
export function newConversation() {
  try {
    sessionStorage.removeItem("gt-session");
  } catch {
    /* storage blocked: nothing to forget */
  }
}

/** Send one question and stream the analyst's events. Resolves when the turn ends. */
export async function askAgent(text: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch("/api/agent/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId(), text }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    onEvent({ type: "error", message: "Can't reach the Ground Truth server. Is the backend running?" });
    return;
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    onEvent({ type: "error", message: body?.error?.message ?? body?.detail?.[0]?.msg ?? `The analyst failed (${res.status}).` });
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!data) continue;
      try {
        onEvent(JSON.parse(data.slice(6)) as AgentEvent);
      } catch {
        // ignore a malformed chunk; the stream continues
      }
    }
  }
}
