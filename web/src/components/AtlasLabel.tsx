import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useApp } from "../state/store";

const HOLD_MS = 1500;

/** Signature moment: the place name rises as an atlas label over the globe, then settles into the case file. */
export function AtlasLabel() {
  const label = useApp((s) => s.atlasLabel);

  useEffect(() => {
    if (!label) return;
    const id = window.setTimeout(() => useApp.setState({ atlasLabel: null }), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [label]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[18%] z-10 flex justify-center px-8" aria-live="polite">
      <AnimatePresence>{label && <Label key={label.key} text={label.text} />}</AnimatePresence>
    </div>
  );
}

function Label({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".ch", { yPercent: 115, duration: 0.8, ease: "expo.out", stagger: { each: 0.03, from: "center" } });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <motion.h1
      ref={ref}
      layoutId="atlas-label"
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      transition={{ type: "spring", duration: 0.7, bounce: 0 }}
      className="atlas text-center text-[clamp(40px,11vw,168px)] text-ink [text-shadow:0_2px_24px_rgba(5,8,13,.85)]"
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex overflow-hidden pb-[0.06em] pt-[0.12em]">
        {[...text].map((c, i) => (
          <span key={i} className="ch inline-block whitespace-pre">
            {c}
          </span>
        ))}
      </span>
    </motion.h1>
  );
}
