import { AnimatePresence, motion } from "motion/react";
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { askAgent, type AgentEvent } from "../lib/agent";
import { applyCommand, newTurnContext, type TurnContext } from "../lib/applyCommand";
import { VoiceSession, type VoiceState } from "../lib/voice";
import { useApp } from "../state/store";
import { CheckedBadge, EvidenceCard } from "./EvidenceCard";
import { TIER } from "../lib/evidence";
import type { EvidenceCard as EvidenceCardT } from "../lib/evidence";
import { Aisha, type AishaState } from "./Aisha";
import { PERSONAS, STARTERS } from "../lib/personas";

interface Step {
  id: string;
  text: string;
  state: "running" | "ok" | "error";
  error?: string | null;
}
interface Turn {
  id: number;
  question: string;
  steps: Step[];
  answer: string;
  error?: string;
  done: boolean;
  unverified?: string[];
  checked?: number;
  evidence?: EvidenceCardT[];
  voice?: boolean;
}

const VOICE_LABEL: Record<VoiceState, string> = {
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Working on it",
  speaking: "Speaking",
  closed: "Talk",
};

const LABELS: Record<string, string> = {
  proven: "proven",
  "not proven yet": "not_proven",
  "not proven": "not_proven",
  observed: "observed",
};

/** Inline **bold**; Aisha's claim labels (**Proven**, **Not proven yet**, **Observed**) become tier tags. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, j): ReactNode => {
        if (!(part.startsWith("**") && part.endsWith("**"))) return <Fragment key={j}>{part}</Fragment>;
        const inner = part.slice(2, -2);
        const key = inner.replace(/[:.]\s*$/, "").trim().toLowerCase();
        const tier = LABELS[key];
        if (tier)
          return (
            <span key={j} className={`mr-0.5 inline-block rounded px-1.5 py-px align-[1px] text-[11px] font-semibold ${TIER[tier].cls}`} title={TIER[tier].hint}>
              {TIER[tier].text}
            </span>
          );
        if (key === "possible explanation" || key === "uncertain") return <strong key={j} className="font-semibold text-muted">{inner}</strong>;
        return (
          <strong key={j} className="font-semibold text-ink">
            {inner}
          </strong>
        );
      })}
    </>
  );
}

/** "Possible explanation" and "Uncertain" lines sit in their own boxes, apart from the evidence. */
function boxFor(line: string): "explanation" | "uncertain" | null {
  const l = line.replace(/^[-•*]\s+/, "").toLowerCase();
  if (l.startsWith("**possible explanation")) return "explanation";
  if (l.startsWith("**uncertain")) return "uncertain";
  return null;
}

/** Minimal formatting for the analyst's prose: paragraphs, "- " bullet lists and **bold**. */
function Prose({ text }: { text: string }) {
  // Bullets sometimes arrive inline (" - a - b"); put each on its own line first.
  const normalized = text.replace(/\s+-\s(?=[A-Z])/g, "\n- ");
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of normalized.split("\n")) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ list: false, lines: [] });
      continue;
    }
    const isItem = /^[-•*]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    if (last && last.list === isItem && last.lines.length) last.lines.push(isItem ? line.replace(/^[-•*]\s+/, "") : line);
    else blocks.push({ list: isItem, lines: [isItem ? line.replace(/^[-•*]\s+/, "") : line] });
  }
  return (
    <>
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          !b.list && boxFor(b.lines[0]) ? (
            <p
              key={i}
              className={`mb-2 rounded-lg border border-dashed px-2.5 py-1.5 text-[13px] last:mb-0 ${
                boxFor(b.lines[0]) === "explanation" ? "border-line text-muted" : "border-line/70 text-faint"
              }`}
            >
              <Inline text={b.lines.join(" ")} />
              {boxFor(b.lines[0]) === "explanation" && <span className="block text-[11px] text-faint">Not tested by Ground Truth's data.</span>}
            </p>
          ) : b.list ? (
            <ul key={i} className="mb-2 flex flex-col gap-1 pl-4 last:mb-0">
              {b.lines.map((l, j) => (
                <li key={j} className="list-disc">
                  <Inline text={l} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={i} className="mb-2 last:mb-0">
              <Inline text={b.lines.join(" ")} />
            </p>
          ),
        )}
    </>
  );
}

export function AskPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const [voiceState, setVoiceState] = useState<VoiceState>("closed");
  const voice = useRef<VoiceSession | null>(null);
  const voiceTurn = useRef<{ id: number; ctx: TurnContext } | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      voice.current?.stop();
    },
    [],
  );
  // A new question scrolls to its start; while the answer streams in, follow its end.
  const lastTurnRef = useRef<HTMLElement>(null);
  const turnCount = turns.length;
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which React must not receive.
    lastTurnRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [turnCount]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns]);

  const update = (id: number, fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    useApp.getState().setPanelView("ask"); // the answer is what you asked for: keep it on screen
    const id = Date.now();
    setTurns((ts) => [...ts, { id, question: q, steps: [], answer: "", done: false }]);
    setText("");
    setBusy(true);
    abort.current = new AbortController();
    const ctx = newTurnContext();
    const onEvent = (e: AgentEvent) => {
      switch (e.type) {
        case "status":
          update(id, (t) => ({ ...t, steps: [...t.steps, { id: e.id, text: e.text, state: "running" }] }));
          break;
        case "tool":
          update(id, (t) => ({
            ...t,
            steps: t.steps.map((s) => (s.id === e.id ? { ...s, state: e.ok ? "ok" : "error", error: e.error } : s)),
          }));
          break;
        case "ui":
          applyCommand(e, ctx);
          break;
        case "text":
          update(id, (t) => ({ ...t, answer: t.answer + e.delta }));
          break;
        case "error":
          update(id, (t) => ({ ...t, error: e.message, done: true }));
          break;
        case "evidence":
          update(id, (t) => ({ ...t, evidence: [...(t.evidence ?? []), e.card] }));
          break;
        case "done":
          update(id, (t) => ({ ...t, done: true, unverified: e.unverified_numbers, checked: e.numbers_checked }));
          break;
      }
    };
    try {
      await askAgent(q, onEvent, abort.current.signal);
    } finally {
      update(id, (t) => ({ ...t, done: true }));
      setBusy(false);
    }
  }

  function currentVoiceTurn() {
    if (!voiceTurn.current) {
      const id = Date.now();
      voiceTurn.current = { id, ctx: newTurnContext() };
      setTurns((ts) => [...ts, { id, question: "…", steps: [], answer: "", done: false, voice: true }]);
    }
    return voiceTurn.current;
  }

  function toggleVoice() {
    useApp.getState().setPanelView("ask");
    if (voice.current) {
      voice.current.stop();
      voice.current = null;
      voiceTurn.current = null;
      return;
    }
    const session = new VoiceSession({
      onState: (st) => {
        setVoiceState(st);
        if (st === "closed") voice.current = null;
      },
      onUserSpeechStart: () => {
        voiceTurn.current = null; // a new spoken question starts a new turn
        currentVoiceTurn();
      },
      onUserText: (q) => {
        const t = currentVoiceTurn();
        update(t.id, (x) => ({ ...x, question: q || "(couldn't make that out)" }));
      },
      onToolStart: (id, label) => {
        const t = currentVoiceTurn();
        update(t.id, (x) => ({ ...x, steps: [...x.steps, { id, text: label, state: "running" }] }));
      },
      onToolDone: (id, ok, error) => {
        const t = currentVoiceTurn();
        update(t.id, (x) => ({ ...x, steps: x.steps.map((st) => (st.id === id ? { ...st, state: ok ? "ok" : "error", error } : st)) }));
      },
      onUi: (cmd) => applyCommand(cmd, currentVoiceTurn().ctx),
      onAssistantDelta: (d) => {
        const t = currentVoiceTurn();
        update(t.id, (x) => ({ ...x, answer: x.answer + d }));
      },
      onAnswerDone: (unverified, checked) => {
        const t = voiceTurn.current;
        if (t) update(t.id, (x) => ({ ...x, done: true, unverified, checked }));
      },
      onEvidence: (_id, card) => {
        const t = currentVoiceTurn();
        update(t.id, (x) => ({ ...x, evidence: [...(x.evidence ?? []), card] }));
      },
      onError: (message) => {
        const t = currentVoiceTurn();
        update(t.id, (x) => ({ ...x, error: message, done: true }));
      },
    });
    voice.current = session;
    void session.start();
  }

  // Questions sent from elsewhere (Go, the case file) run here so their steps show in this panel.
  const pendingAsk = useApp((s) => s.pendingAsk);
  useEffect(() => {
    if (!pendingAsk || busy) return;
    useApp.getState().clearAsk();
    void send(pendingAsk.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk, busy]);

  // The phone's big Aisha button (and anything else) can start or stop a voice conversation.
  const voiceRequest = useApp((st) => st.voiceRequest);
  const firstRequest = useRef(voiceRequest);
  useEffect(() => {
    if (voiceRequest === firstRequest.current) return;
    firstRequest.current = voiceRequest;
    toggleVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRequest]);
  useEffect(() => {
    const st = useApp.getState();
    st.setVoiceActive(voiceState !== "closed");
    st.setAishaState(
      voiceState === "listening" ? "listening" : voiceState === "speaking" ? "speaking" : voiceState === "thinking" || busy ? "thinking" : "idle",
    );
  }, [voiceState, busy]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  const aishaState: AishaState =
    voiceState === "listening" ? "listening" : voiceState === "speaking" ? "speaking" : voiceState === "thinking" || busy ? "thinking" : "idle";

  return (
    <section aria-label="Ask the analyst" className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <Aisha state={aishaState} size={58} className="shrink-0" />
          <label htmlFor="ask" className="flex min-w-0 flex-col">
            <span className="flex items-baseline gap-2">
              <span className="atlas text-[26px] text-ink">Aisha</span>
              <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">AI analyst</span>
            </span>
            <span className="text-xs leading-snug text-muted">Ask me anything about where you live. I answer only from NASA records and show you the evidence.</span>
          </label>
        </div>
        <button
          type="button"
          onClick={toggleVoice}
          aria-pressed={voiceState !== "closed"}
          title="Talk to Aisha out loud. Press again to hang up."
          className={`btn flex h-12 items-center justify-center gap-2.5 rounded-xl text-[15px] font-semibold ${
            voiceState === "closed" ? "btn-accent bg-accent text-accent-ink" : "bg-mark text-on-mark"
          }`}
        >
          <span className="relative grid h-4 w-4 place-items-center" aria-hidden>
            {voiceState !== "closed" && voiceState !== "connecting" && (
              <motion.span
                className="absolute -inset-1 rounded-full bg-on-mark/20"
                animate={{ scale: voiceState === "speaking" ? [1, 1.7, 1] : [1, 1.35, 1] }}
                transition={{ duration: voiceState === "speaking" ? 0.9 : 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            <svg viewBox="0 0 14 14" className="relative h-4 w-4">
              <rect x="4.5" y="1" width="5" height="8" rx="2.5" fill="currentColor" />
              <path d="M2.5 6.5a4.5 4.5 0 0 0 9 0M7 11v2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </span>
          {voiceState === "closed" ? "Talk to Aisha" : `${VOICE_LABEL[voiceState]}, tap to end`}
        </button>
        <div className="flex items-end gap-2">
          <textarea
            id="ask"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder="Or type: Is it getting drier where I farm?"
            className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
          />
          <button type="submit" disabled={busy || !text.trim()} className="btn btn-quiet h-10 shrink-0 rounded-lg border border-line px-3.5 text-sm font-semibold text-ink disabled:opacity-40">
            {busy ? "Working…" : "Ask"}
          </button>
        </div>
        <p className="text-[11px] text-faint">Every answer comes with its evidence, and every number is checked against the NASA data.</p>
      </form>

      {turns.length === 0 && <QuickStarts onAsk={(q) => void send(q)} />}

      <div className="flex flex-col gap-4" aria-live="polite">
        {turns.map((t, i) => (
          <article key={t.id} ref={i === turns.length - 1 ? lastTurnRef : undefined} className="flex scroll-mt-3 flex-col gap-2">
            <p className="self-end rounded-lg bg-panel-2 px-3 py-2 text-sm text-ink">
              {t.voice && <span className="mr-1.5 text-[11px] font-medium text-muted">You said:</span>}
              {t.question}
            </p>
            <ol className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {t.steps.map((s) => (
                  <motion.li
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className="flex items-start gap-2 text-xs"
                  >
                    <StepIcon state={s.state} />
                    <span className={s.state === "error" ? "text-bad" : s.state === "ok" ? "text-muted" : "text-ink"}>
                      {s.text}
                      {s.error ? `: ${s.error}` : ""}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
            {!t.done && t.steps.length === 0 && !t.answer && <p className="text-xs text-muted">Reading your question…</p>}
            {t.answer && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm leading-relaxed text-ink/90">
                <Prose text={t.answer} />
              </motion.div>
            )}
            {t.error && <p role="alert" className="text-sm text-bad">{t.error}</p>}
            {t.evidence && t.evidence.length > 0 && (
              <section aria-label="The evidence" className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-muted">The evidence ({t.evidence.length})</p>
                <ul className="flex flex-col gap-1.5">
                  {dedupe(t.evidence).map((c, k) => (
                    <EvidenceCard key={k} card={c} index={k} />
                  ))}
                </ul>
              </section>
            )}
            {t.done && <CheckedBadge checked={t.checked} unverified={t.unverified} />}
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}

function StepIcon({ state }: { state: Step["state"] }) {
  if (state === "running")
    return (
      <svg className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-ink" viewBox="0 0 12 12" aria-label="Working">
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="18 10" />
      </svg>
    );
  if (state === "ok")
    return (
      <svg className="mt-0.5 h-3 w-3 shrink-0 text-ok" viewBox="0 0 12 12" aria-label="Done">
        <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  return (
    <svg className="mt-0.5 h-3 w-3 shrink-0 text-bad" viewBox="0 0 12 12" aria-label="Failed">
      <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** The same record can be consulted twice in one answer; show it once. */
function dedupe(cards: EvidenceCardT[]): EvidenceCardT[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const key = c.kind === "trend" ? `${c.variable}|${c.scope}|${JSON.stringify(c.place)}` : `${c.topic}|${JSON.stringify(c.place)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "Who are you?" Tailored starter questions for each kind of person (Nigeria and Africa first). */
function QuickStarts({ onAsk }: { onAsk: (q: string) => void }) {
  const [who, setWho] = useState<string | null>(null);
  const persona = PERSONAS.find((p) => p.id === who);
  const questions = persona ? persona.questions : STARTERS;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted">Who are you? I'll suggest questions for you.</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Who are you?">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={who === p.id}
            onClick={() => setWho(who === p.id ? null : p.id)}
            className={`btn h-8 rounded-full border px-3 text-[13px] ${who === p.id ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {persona && <p className="text-[12px] leading-snug text-faint">{persona.why}</p>}
      <ul className="flex flex-col gap-1" aria-label="Suggested questions">
        {questions.map((q) => (
          <li key={q}>
            <button type="button" onClick={() => onAsk(q)} className="btn btn-quiet w-full rounded-lg border border-line/60 px-2.5 py-2 text-left text-[13px] text-ink">
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
