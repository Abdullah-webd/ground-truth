import { motion, useReducedMotion } from "motion/react";

export type AishaState = "idle" | "listening" | "thinking" | "speaking";

/**
 * Aisha, Ground Truth's AI analyst: an original round "field-scientist" satellite-bot.
 * The highlighter-yellow visor is the brand's evidence mark; she reacts to what she's doing.
 */
export function Aisha({ state = "idle", size = 56, className = "" }: { state?: AishaState; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const float = reduce ? undefined : { y: [0, -2.5, 0] };
  const visorGlow = state === "listening" ? (reduce ? { opacity: 1 } : { opacity: [0.75, 1, 0.75] }) : { opacity: 1 };
  return (
    <motion.svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Aisha, AI analyst${state !== "idle" ? `, ${state}` : ""}`}
      animate={float}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <defs>
        <radialGradient id="aisha-body" cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#3b4a60" />
          <stop offset="0.6" stopColor="#1c2533" />
          <stop offset="1" stopColor="#0f141c" />
        </radialGradient>
        <linearGradient id="aisha-visor" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff1a1" />
          <stop offset="1" stopColor="#ffd21f" />
        </linearGradient>
      </defs>

      {/* solar-panel ears */}
      <g fill="#2b3a52" stroke="#6aa6e6" strokeWidth="0.8">
        <rect x="2" y="28" width="9" height="12" rx="1.5" />
        <rect x="53" y="28" width="9" height="12" rx="1.5" />
        <path d="M6.5 28v12M2 34h9M57.5 28v12M53 34h9" stroke="#6aa6e6" strokeOpacity="0.6" />
      </g>

      {/* antenna with an orbiting dot (spins while thinking) */}
      <line x1="32" y1="12" x2="32" y2="6" stroke="#9aa6b5" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="32" cy="5" r="2.2" fill="#ffe14d" />
      <motion.g
        style={{ originX: "32px", originY: "5px" }}
        animate={state === "thinking" && !reduce ? { rotate: 360 } : { rotate: 0 }}
        transition={state === "thinking" ? { duration: 1.1, repeat: Infinity, ease: "linear" } : { duration: 0.3 }}
      >
        <ellipse cx="32" cy="5" rx="6.5" ry="2.4" fill="none" stroke="#ffe14d" strokeOpacity="0.55" strokeWidth="0.8" />
        <circle cx="38.5" cy="5" r="1.1" fill="#ffe14d" />
      </motion.g>

      {/* body */}
      <circle cx="32" cy="35" r="22" fill="url(#aisha-body)" stroke="#e8edf2" strokeOpacity="0.18" />
      <ellipse cx="25" cy="24" rx="7" ry="3.5" fill="#fff" opacity="0.08" />

      {/* visor */}
      <motion.g animate={visorGlow} transition={{ duration: 0.9, repeat: state === "listening" ? Infinity : 0, ease: "easeInOut" }}>
        <rect x="15" y="27" width="34" height="15" rx="7.5" fill="url(#aisha-visor)" />
        {state === "listening" && !reduce && (
          <motion.rect
            x="13.5"
            y="25.5"
            width="37"
            height="18"
            rx="9"
            fill="none"
            stroke="#ffe14d"
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 1.18 }}
            style={{ originX: "32px", originY: "34.5px" }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </motion.g>

      {/* eyes: blink when idle */}
      <motion.g
        fill="#11181f"
        animate={state === "idle" && !reduce ? { scaleY: [1, 1, 0.1, 1] } : { scaleY: 1 }}
        style={{ originY: "33px" }}
        transition={{ duration: 4, repeat: Infinity, times: [0, 0.9, 0.95, 1] }}
      >
        <ellipse cx="25" cy="33" rx="2.6" ry="3" />
        <ellipse cx="39" cy="33" rx="2.6" ry="3" />
      </motion.g>

      {/* mouth: wave bars while speaking, a small smile otherwise */}
      {state === "speaking" ? (
        <g fill="#11181f">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.rect
              key={i}
              x={26.5 + i * 2.4}
              y="37.2"
              width="1.4"
              height="3"
              rx="0.7"
              style={{ originY: "38.7px" }}
              animate={reduce ? undefined : { scaleY: [0.4, 1.3, 0.6, 1.1, 0.4] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.09, ease: "easeInOut" }}
            />
          ))}
        </g>
      ) : (
        <path d="M28.5 38.2q3.5 2.6 7 0" fill="none" stroke="#11181f" strokeWidth="1.3" strokeLinecap="round" />
      )}

      {/* a tiny Earth badge on her chest: what she studies */}
      <circle cx="32" cy="50.5" r="3.2" fill="#2f6db5" />
      <path d="M30.3 49.4c.9-.6 1.8-.3 2.2.4.4.7 1.4.6 1.9 1.3-.7 1.2-2.4 1.6-3.4.8-.6-.5-1.1-1.4-.7-2.5z" fill="#57c486" />
    </motion.svg>
  );
}
