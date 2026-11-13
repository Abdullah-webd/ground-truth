import { AnimatePresence, motion } from "motion/react";
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { askAgent, type AgentEvent } from "../lib/agent";
import { applyCommand, newTurnContext } from "../lib/applyCommand";

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
}

const SUGGESTIONS = [
  "What changed around Lagos since 2018, and is it significant?",
  "Is groundwater really declining in northern India?",
  "Where is rainfall trending in opposite directions?",
  "How unusual is this month in Nairobi?",
];

/** Minimal formatting for the analyst's prose: **bold** and paragraphs. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="mb-2 last:mb-0">
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j): ReactNode =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j} className="font-semibold text-ink">
                {part.slice(2, -2)}
              </strong>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </>
  );
}

export function AskPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abort.current?.abort(), []);
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  return (
    <section aria-label="Ask the analyst" className="flex flex-col gap-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor="ask" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Ask the analyst
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
          placeholder="What changed around Lagos since 2018?"
          className="resize-none rounded-md border border-line bg-ground px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-faint">Answers use only numbers from the data tools.</span>
          <button type="submit" disabled={busy || !text.trim()} className="btn btn-accent rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50">
            {busy ? "Investigating…" : "Ask"}
          </button>
        </div>
      </form>

      {turns.length === 0 && (
        <ul className="flex flex-col gap-1" aria-label="Example questions">
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
            <p className="self-end rounded-lg bg-panel-2 px-3 py-2 text-sm text-ink">{t.question}</p>
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
      <svg className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-accent" viewBox="0 0 12 12" aria-label="Working">
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
