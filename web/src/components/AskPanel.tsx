import { AnimatePresence, motion } from "motion/react";
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { askAgent, type AgentEvent } from "../lib/agent";
import { applyCommand, newTurnContext, type TurnContext } from "../lib/applyCommand";
import { VoiceSession, type VoiceState } from "../lib/voice";
import { useApp } from "../state/store";

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
  voice?: boolean;
}

const VOICE_LABEL: Record<VoiceState, string> = {
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Working on it",
  speaking: "Speaking",
  closed: "Talk",
};

const SUGGESTIONS = [
  "What changed around Lagos since 2018, and is it real?",
  "Is groundwater really disappearing in northern India?",
  "Is Greenland losing ice?",
  "How unusual is this month in Nairobi?",
];

/** Inline **bold**. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, j): ReactNode =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={j} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={j}>{part}</Fragment>
        ),
      )}
    </>
  );
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
          b.list ? (
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
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which React must not receive.
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns]);

  const update = (id: number, fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
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
        case "done":
          update(id, (t) => ({ ...t, done: true, unverified: e.unverified_numbers }));
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
      onAnswerDone: (unverified) => {
        const t = voiceTurn.current;
        if (t) update(t.id, (x) => ({ ...x, done: true, unverified }));
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  return (
    <section aria-label="Ask the analyst" className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor="ask" className="flex flex-col">
          <span className="atlas text-[24px] text-ink">Ask the analyst</span>
          <span className="mt-1 text-xs text-muted">Type or talk, in your own words. It checks NASA's records, moves the globe and explains what it finds.</span>
        </label>
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
          placeholder="Is it getting hotter where I live?"
          className="resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleVoice}
            aria-pressed={voiceState !== "closed"}
            title="Talk to the analyst (OpenAI gpt-realtime-2.1). Press again to hang up."
            className={`btn flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
              voiceState === "closed" ? "btn-quiet border-line text-ink" : "border-ink bg-mark text-ink"
            }`}
          >
            <span className="relative grid h-3.5 w-3.5 place-items-center" aria-hidden>
              {voiceState !== "closed" && voiceState !== "connecting" && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-ink/25"
                  animate={{ scale: voiceState === "speaking" ? [1, 1.7, 1] : [1, 1.35, 1] }}
                  transition={{ duration: voiceState === "speaking" ? 0.9 : 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              <svg viewBox="0 0 14 14" className="relative h-3.5 w-3.5">
                <rect x="4.5" y="1" width="5" height="8" rx="2.5" fill="currentColor" />
                <path d="M2.5 6.5a4.5 4.5 0 0 0 9 0M7 11v2" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </span>
            {voiceState === "closed" ? "Talk" : VOICE_LABEL[voiceState]}
          </button>
          <button type="submit" disabled={busy || !text.trim()} className="btn btn-accent rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-40">
            {busy ? "Investigating…" : "Ask"}
          </button>
        </div>
        <p className="text-[11px] text-faint">Every number it says is checked against the NASA data, so it can't make figures up.</p>
      </form>

      {turns.length === 0 && (
        <ul className="flex flex-col gap-1" aria-label="Example questions">
          <li className="px-2 text-xs font-medium text-muted">Not sure what to ask? Try one:</li>
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => void send(s)} className="btn btn-quiet w-full rounded-md px-2 py-1.5 text-left text-sm text-muted">
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-4" aria-live="polite">
        {turns.map((t) => (
          <article key={t.id} className="flex flex-col gap-2">
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
            {t.done && t.unverified && t.unverified.length > 0 && (
              <p className="text-[11px] text-bad">
                Check: {t.unverified.join(", ")} did not come from a data tool. Treat with caution.
              </p>
            )}
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
