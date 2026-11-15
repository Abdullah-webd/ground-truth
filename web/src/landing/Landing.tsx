import { useGSAP } from "@gsap/react";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect, useRef, useState } from "react";
import { api, overlayUrl } from "../lib/api";
import { chance, PLAIN } from "../lib/plain";
import { navigate } from "../lib/router";
import { Aisha } from "../components/Aisha";
import { PERSONAS } from "../lib/personas";
import { useVariables } from "../lib/useVariables";
import { VARIABLE_IDS, type VariableId } from "../lib/types";
import { ProofChart } from "./ProofChart";
import { AfricaCases } from "./AfricaCases";
import { SpinningEarth, type EarthHandle } from "./SpinningEarth";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// Lagos, Nigeria: the case we tell on this page (NASA MODIS plant greenness, a proven decline).
const LAGOS = { lat: 6.55, lon: 3.38 };

function OpenGlobe({ children = "Open the globe", className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <a
      href="/explore"
      onClick={(e) => {
        e.preventDefault();
        navigate("/explore", e.nativeEvent);
      }}
      className={`btn btn-accent group inline-flex items-center gap-3 rounded-full bg-accent px-6 py-3.5 text-[15px] font-semibold text-accent-ink ${className}`}
    >
      {children}
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M1.5 8h13M8 1.5c2.2 2 2.2 11 0 13M8 1.5c-2.2 2-2.2 11 0 13" fill="none" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    </a>
  );
}

function useSmoothScroll() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const lenis = new Lenis({ lerp: 0.09, anchors: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);
}

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const spin = useRef<EarthHandle>({ spin: 0 });
  const [question, setQuestion] = useState<VariableId>("temperature");
  useSmoothScroll();

  // Same hook (and cache entry) as the globe screen, so moving between pages never mixes data shapes.
  const vars = useVariables();
  const green = useQuery({ queryKey: ["point", "vegetation", LAGOS.lat, LAGOS.lon], queryFn: () => api.point("vegetation", LAGOS.lat, LAGOS.lon) });
  const checks = useQuery({ queryKey: ["checks"], queryFn: api.checks, staleTime: Infinity });
  const meta = (id: VariableId) => vars.data?.find((v) => v.id === id);
  const built = meta("temperature")?.built ?? "";
  const example =
    checks.data?.agent_eval?.cases?.find((c) => /Abuja/.test(c.question)) ??
    checks.data?.agent_eval?.cases?.find((c) => /Lagos/.test(c.question)) ??
    checks.data?.agent_eval?.cases?.[0];

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 900px)", reduce: "(prefers-reduced-motion: reduce)" },
        (ctx) => {
          const { desktop, reduce } = ctx.conditions as { desktop: boolean; reduce: boolean };
          if (reduce) {
            gsap.set("[data-reveal]", { autoAlpha: 1 });
            document.querySelectorAll(".mark-draw").forEach((el) => el.classList.add("is-on"));
            return;
          }

          // 1. Hero: the headline is written in, line by line; Earth settles in; the highlighter marks "real".
          const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
          intro
            .from(".hero-line > span", { yPercent: 112, duration: 1.05, stagger: 0.09 })
            .from(".hero-earth", { scale: 0.9, autoAlpha: 0, rotate: -8, duration: 1.4 }, 0.1)
            .fromTo(".hero-meta > *", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.06 }, 0.55)
            .add(() => document.querySelector(".hero-mark")?.classList.add("is-on"), 0.95)
            .fromTo(".site-nav", { yPercent: -100 }, { yPercent: 0, duration: 0.8 }, 0.2);
          // Earth keeps turning as you scroll down the page.
          gsap.to(spin.current, {
            spin: Math.PI * 1.6,
            ease: "none",
            scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.6 },
          });
          gsap.to(".hero-earth", {
            yPercent: 18,
            scale: 0.92,
            ease: "none",
            scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
          });

          // 2. Statement: words go from faint to ink as you read down.
          SplitText.create(".manifesto", {
            type: "words",
            autoSplit: true,
            onSplit(self) {
              return gsap.fromTo(
                self.words,
                { opacity: 0.14 },
                { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: ".manifesto", start: "top 78%", end: "bottom 45%", scrub: true } },
              );
            },
          });

          // 3. Proof scene: pinned on desktop; the record draws, the trend line lands, the verdict is highlighted.
          const steps = gsap.utils.toArray<HTMLElement>(".proof-step");
          const proof = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: desktop
              ? { trigger: ".proof", start: "top top", end: () => `+=${window.innerHeight * 2.4}`, scrub: 0.8, pin: true, anticipatePin: 1, invalidateOnRefresh: true }
              : { trigger: ".proof", start: "top 70%", end: "bottom 60%", scrub: 0.8 },
          });
          proof
            .fromTo(".proof-series", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1 })
            .fromTo(".proof-dot", { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, stagger: 0.02, duration: 0.3, transformOrigin: "50% 50%" }, 0.1)
            .to(steps[0], { autoAlpha: 0.25, duration: 0.2 }, 1)
            .fromTo(steps[1], { autoAlpha: 0.25 }, { autoAlpha: 1, duration: 0.2 }, 1)
            .fromTo(".proof-band", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 1)
            .fromTo(".proof-trend", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6 }, 1.5)
            .to(steps[1], { autoAlpha: 0.25, duration: 0.2 }, 2.1)
            .fromTo(steps[2], { autoAlpha: 0.25 }, { autoAlpha: 1, duration: 0.2 }, 2.1)
            .fromTo(".proof-verdict", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 2.2)
            .add(() => document.querySelector(".proof-mark")?.classList.toggle("is-on", proof.progress() > 0.85), 2.6);
          proof.eventCallback("onUpdate", () => document.querySelector(".proof-mark")?.classList.toggle("is-on", proof.progress() > 0.85));

          // 4. How a case is solved: sticky cards; the one underneath steps back as the next arrives.
          const cards = gsap.utils.toArray<HTMLElement>(".stack-card");
          cards.forEach((card, i) => {
            gsap.from(card.querySelector(".stack-shot"), {
              clipPath: "inset(14% 10% 14% 10% round 18px)",
              scale: 1.12,
              ease: "expo.out",
              duration: 1.2,
              scrollTrigger: { trigger: card, start: "top 75%", once: true },
            });
            if (i < cards.length - 1)
              gsap.to(card, {
                scale: 0.93,
                autoAlpha: 0.55,
                ease: "none",
                scrollTrigger: { trigger: cards[i + 1], start: "top bottom", end: "top 20%", scrub: true },
              });
          });

          // 5. Five questions: each question takes over the globe as it reaches the middle of the screen.
          gsap.utils.toArray<HTMLElement>(".q-row").forEach((row) => {
            const id = row.dataset.var as VariableId;
            ScrollTrigger.create({
              trigger: row,
              start: "top 55%",
              end: "bottom 55%",
              onToggle: (self) => {
                if (!self.isActive) return;
                setQuestion(id);
                document.querySelectorAll(".q-row").forEach((r) => r.classList.toggle("is-active", r === row));
              },
            });
            SplitText.create(row.querySelector(".q-title"), {
              type: "words",
              mask: "words",
              autoSplit: true,
              onSplit(self) {
                return gsap.from(self.words, {
                  yPercent: 100,
                  rotate: 4,
                  transformOrigin: "0% 100%",
                  stagger: 0.05,
                  duration: 0.9,
                  ease: "expo.out",
                  scrollTrigger: { trigger: row, start: "top 80%", once: true },
                });
              },
            });
          });

          // 6. The analyst: the question slides in, then the answer arrives word by word.
          gsap.from(".chat-q", { x: 60, autoAlpha: 0, duration: 0.8, ease: "expo.out", scrollTrigger: { trigger: ".chat", start: "top 70%", once: true } });
          SplitText.create(".chat-a", {
            type: "words",
            autoSplit: true,
            onSplit(self) {
              return gsap.from(self.words, {
                autoAlpha: 0,
                duration: 0.01,
                stagger: 0.022,
                delay: 0.6,
                scrollTrigger: { trigger: ".chat", start: "top 70%", once: true },
              });
            },
          });
          gsap.from(".chat-tools > li", {
            x: -16,
            autoAlpha: 0,
            stagger: 0.12,
            duration: 0.5,
            ease: "expo.out",
            scrollTrigger: { trigger: ".chat", start: "top 70%", once: true },
          });

          // Africa cases: each card wipes open from the left, one after another.
          gsap.fromTo(
            ".case-card",
            { clipPath: "inset(0% 100% 0% 0% round 16px)" },
            {
              clipPath: "inset(0% 0% 0% 0% round 16px)",
              duration: 1,
              stagger: 0.09,
              ease: "expo.out",
              scrollTrigger: { trigger: ".case-track", start: "top 85%", once: true },
            },
          );
          gsap.from(".hero-meta-eyebrow", { autoAlpha: 0, y: 10, duration: 0.7, delay: 0.3, ease: "expo.out" });

          // Who it's for: cards rise in sequence, left to right.
          gsap.from(".who-item", {
            yPercent: 18,
            autoAlpha: 0,
            stagger: 0.08,
            duration: 0.8,
            ease: "expo.out",
            scrollTrigger: { trigger: ".who-list", start: "top 82%", once: true },
          });

          // 7. Finale: Earth opens from a small window to fill the screen.
          gsap.fromTo(
            ".finale-media",
            { clipPath: "circle(16% at 50% 50%)" },
            {
              clipPath: "circle(75% at 50% 50%)",
              ease: "none",
              // The section is a tall track with a sticky screen inside (no GSAP pin, so no layout shift).
              scrollTrigger: desktop
                ? { trigger: ".finale", start: "top top", end: "bottom bottom", scrub: 0.6 }
                : { trigger: ".finale", start: "top 80%", end: "center center", scrub: 0.6 },
            },
          );
          gsap.from(".finale-line > span", {
            yPercent: 110,
            stagger: 0.1,
            duration: 1,
            ease: "expo.out",
            scrollTrigger: { trigger: ".finale", start: "top 40%", once: true },
          });

          // Section headings in the plain sections rise from a mask.
          gsap.utils.toArray<HTMLElement>("[data-split]").forEach((el) => {
            SplitText.create(el, {
              type: "lines",
              mask: "lines",
              autoSplit: true,
              onSplit(self) {
                return gsap.from(self.lines, { yPercent: 110, stagger: 0.1, duration: 1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 85%", once: true } });
              },
            });
          });
          gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
            gsap.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 96%", once: true } });
          });
          ScrollTrigger.batch(".mark-draw:not(.hero-mark):not(.proof-mark)", {
            start: "top 80%",
            once: true,
            onEnter: (els) => els.forEach((el, i) => window.setTimeout(() => el.classList.add("is-on"), i * 120)),
          });
          const safety = window.setTimeout(() => gsap.set(".hero [data-reveal]", { autoAlpha: 1 }), 3000);
          return () => window.clearTimeout(safety);
        },
      );
    },
    { scope: root },
  );

  const t = meta("temperature");
  const w = green.data;
  const vals = w ? w.values.filter((v): v is number => v != null) : [];
  const total = w && w.slope_per_decade != null ? (w.slope_per_decade / 10) * (w.period[1] - w.period[0]) : null;
  const lostPct = total != null && vals.length ? Math.round((Math.abs(total) / (vals.reduce((a, b) => a + b, 0) / vals.length)) * 100) : null;

  return (
    <div ref={root} className="bg-paper text-ink">
      <nav className="site-nav fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-line/70 bg-paper/90 px-5 py-3 md:px-10">
        <span className="atlas text-[26px]">Ground Truth</span>
        <div className="flex items-center gap-6 text-sm">
          <a href="#how" className="link hidden text-muted sm:inline">How it works</a>
          <a href="#proof" className="link hidden text-muted sm:inline">The proof</a>
          <a
            href="/methods"
            onClick={(e) => {
              e.preventDefault();
              navigate("/methods", e.nativeEvent);
            }}
            className="link hidden text-muted sm:inline"
          >
            Methods & data
          </a>
          <OpenGlobe className="!px-4 !py-2 !text-sm">Open the globe</OpenGlobe>
        </div>
      </nav>

      <main>
        {/* 1. Hero */}
        <section data-section className="hero relative flex min-h-[100svh] items-center overflow-hidden px-5 pb-16 pt-28 md:px-10">
          <div className="relative z-10 max-w-[880px]">
            <p className="hero-meta-eyebrow mb-5 flex items-center gap-2 text-[15px] font-medium text-muted">
              <span className="inline-block h-2 w-2 rounded-full bg-[#2e8a57]" aria-hidden />
              Built for Africa. Open to the whole planet.
            </p>
            <h1 className="atlas text-[clamp(64px,10.2vw,184px)] leading-[0.86]">
              <span className="hero-line block overflow-hidden pb-[0.04em]"><span className="block">Earth is changing.</span></span>
              <span className="hero-line block overflow-hidden pb-[0.04em]"><span className="block text-muted">Which changes</span></span>
              <span className="hero-line block overflow-hidden pb-[0.06em]">
                <span className="block">
                  are <span className="hero-mark mark mark-draw">real?</span>
                </span>
              </span>
            </h1>
            <div className="hero-meta mt-8 flex max-w-[540px] flex-col gap-6">
              <p className="text-[19px] leading-relaxed text-muted">
                An evidence-based Earth observation platform, <strong className="font-semibold text-ink">built for Africa</strong> and open to the whole planet.
                Ask Aisha, our AI analyst, about any place. She checks up to 45 years of NASA records and shows you the evidence: what's confirmed,
                what's only observed, and what's still uncertain.
              </p>
              <div className="flex flex-wrap items-center gap-5">
                <OpenGlobe />
                <a href="#proof" className="link text-[15px] font-medium text-ink">
                  See how we prove it
                </a>
              </div>
            </div>
          </div>
          <div className="hero-earth pointer-events-auto absolute right-[-14vw] top-1/2 w-[min(66vw,980px)] -translate-y-1/2 max-md:right-[-30vw] max-md:top-[64%] max-md:w-[110vw] max-md:opacity-40">
            <SpinningEarth
              overlay={t ? overlayUrl("temperature", built) : null}
              spinRef={spin}
              label="NASA Blue Marble Earth with places of confirmed warming since 1980 in red"
              className="aspect-square w-full drop-shadow-[0_40px_60px_rgba(47,109,181,0.18)]"
            />
            <p className="atlas absolute bottom-[12%] left-[6%] text-[15px] tracking-[0.06em] text-muted max-md:hidden">
              Red = confirmed warming since 1980. Drag to turn.
            </p>
          </div>
        </section>

        {/* 2. The problem */}
        <section data-section className="px-5 py-[18vh] md:px-10">
          <p className="manifesto mx-auto max-w-[1100px] text-[clamp(30px,4.2vw,64px)] font-medium leading-[1.12] tracking-[-0.01em]">
            Every record from space wiggles. A hot year here, a dry year there. Most wiggles mean nothing. A few are the start of something that will change how
            people live. Telling them apart is the whole job.
          </p>
        </section>

        {/* 3. Proof scene */}
        <section id="proof" data-section className="proof relative flex min-h-[100svh] items-center bg-ground px-5 py-20 md:px-10">
          <div className="mx-auto grid w-full max-w-[1280px] items-center gap-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="flex flex-col gap-8">
              <h2 className="atlas text-[clamp(44px,5.6vw,92px)] leading-[0.9]">
                Case one:
                <br />
                Lagos is losing its green
              </h2>
              <ol className="flex flex-col gap-6 text-[18px] leading-snug">
                <li className="proof-step">
                  <span className="mb-1 block text-sm font-semibold text-muted">The record</span>
                  NASA's MODIS satellite has measured how green Lagos looks from space every 16 days since 2001. Each dot is one year.
                </li>
                <li className="proof-step">
                  <span className="mb-1 block text-sm font-semibold text-muted">The question</span>
                  It bounces around with the rains. Is the city really getting browner, or could a few dry years fool us?
                </li>
                <li className="proof-step">
                  <span className="mb-1 block text-sm font-semibold text-muted">The test</span>
                  The Mann-Kendall test asks how often pure luck would make a pattern this strong. Here it's{" "}
                  <strong className="font-semibold">{w ? chance(w.q) : "…"}</strong>. That's rare enough to call it{" "}
                  <span className="proof-mark mark mark-draw font-semibold">confirmed</span>.
                </li>
              </ol>
            </div>
            <div className="rounded-3xl border border-line bg-paper p-5 md:p-8">
              {w ? (
                <ProofChart trend={w} title="How green Lagos looks from space (NASA MODIS greenness, 0 = bare, 1 = dense forest)" place="Lagos" />
              ) : green.isError ? (
                <p className="text-muted">The live NASA record couldn't load. Start the backend and refresh.</p>
              ) : (
                <div className="aspect-[16/10] animate-pulse rounded-xl bg-ground" />
              )}
              <p className="proof-verdict mt-5 text-[22px] font-medium leading-snug">
                {lostPct != null && w ? (
                  <>
                    Since {w.period[0]}, Lagos has become <span className="mark">about {lostPct}% less green</span>
                    {w.slope_ci_per_decade ? ` (likely ${Math.abs(w.slope_ci_per_decade[1]).toFixed(3)} to ${Math.abs(w.slope_ci_per_decade[0]).toFixed(3)} on the greenness scale per decade)` : ""}.
                    Satellites also observed patches of trees and wetland turning into buildings: an observation, not a tested cause.
                  </>
                ) : (
                  "Loading the live NASA record…"
                )}
              </p>
            </div>
          </div>
        </section>

        {/* Africa, case by case */}
        <section data-section className="africa px-5 pb-[8vh] pt-[14vh] md:px-10">
          <div className="mx-auto max-w-[1280px]">
            <h2 data-split className="atlas max-w-[1000px] text-[clamp(44px,6vw,104px)] leading-[0.9]">
              Africa, case by case
            </h2>
            <p data-reveal className="mt-5 max-w-[700px] text-[19px] leading-relaxed text-muted">
              Real questions people ask about their part of Africa, checked against decades of NASA records with the same test the app uses. Some changes
              are confirmed. Some popular stories aren't, yet. Swipe through, then ask Aisha about any of them.
            </p>
            <div className="mt-10">
              <AfricaCases />
            </div>
          </div>
        </section>

        {/* 4. How a case is solved */}
        <section id="how" data-section className="px-5 pb-[12vh] pt-[16vh] md:px-10">
          <div className="mx-auto max-w-[1280px]">
            <h2 data-split className="atlas max-w-[900px] text-[clamp(44px,6vw,104px)] leading-[0.9]">
              How a case gets solved
            </h2>
            <p data-reveal className="mt-5 max-w-[620px] text-[19px] leading-relaxed text-muted">
              You don't need to know what to look for. Ground Truth spots the change first, names it, and only then asks NASA's records whether it's real.
            </p>
            <div className="mt-14 flex flex-col gap-10">
              {[
                {
                  step: "Spot it",
                  title: "Find where the land changed",
                  body: "Google DeepMind's AlphaEarth compares every 10 m patch of the planet year by year. Every patch that changed gets a numbered yellow pin, with no need to choose what to look for first.",
                  img: "/landing/step-spot.webp",
                  alt: "Numbered yellow pins over satellite imagery of Lagos marking 20 places where land changed since 2018",
                },
                {
                  step: "Name it",
                  title: "Say what it became",
                  body: "Each changed patch gets a plain name from Dynamic World land cover: crops that became buildings, forest that became bare ground, water that became land.",
                  img: "/landing/step-name.webp",
                  alt: "A case file card reading that farmland became built area",
                },
                {
                  step: "Prove it",
                  title: "Test it against decades of NASA records",
                  body: "Temperature, plant growth, rainfall and water in the land get a statistical test. You see a chart, the size of the change with its 95 % range, and the chance it's just luck.",
                  img: "/landing/step-prove.webp",
                  alt: "The case file showing confirmed warming with a year-by-year chart",
                },
              ].map((c, i) => (
                <article
                  key={c.step}
                  className="stack-card sticky grid items-center gap-8 rounded-[28px] border border-line bg-paper p-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:p-10"
                  style={{ top: `calc(88px + ${i * 22}px)` }}
                >
                  <div>
                    <p className="atlas text-[20px] text-muted">
                      {i + 1} / 3 &nbsp;{c.step}
                    </p>
                    <h3 className="mt-3 text-[clamp(26px,2.6vw,40px)] font-semibold leading-[1.1] tracking-[-0.01em]">{c.title}</h3>
                    <p className="mt-4 text-[17px] leading-relaxed text-muted">{c.body}</p>
                  </div>
                  <figure className="stack-shot overflow-hidden rounded-2xl border border-line bg-ground">
                    <img src={c.img} alt={c.alt} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                  </figure>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Five questions, one planet */}
        <section data-section className="px-5 py-[14vh] md:px-10">
          <div className="mx-auto grid max-w-[1280px] gap-10 md:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
            <div>
              <h2 data-split className="atlas text-[clamp(44px,6vw,104px)] leading-[0.9]">
                Five questions anyone can ask
              </h2>
              <ul className="mt-12 flex flex-col">
                {VARIABLE_IDS.map((id) => {
                  const m = meta(id);
                  const p = PLAIN[id];
                  return (
                    <li key={id} data-var={id} className={`q-row group border-t border-line py-10 transition-opacity duration-500 ${question === id ? "is-active" : "opacity-45"}`}>
                      <h3 className="q-title text-[clamp(30px,3.4vw,52px)] font-semibold leading-[1.05] tracking-[-0.015em]">{p.question}</h3>
                      <p className="mt-3 max-w-[520px] text-[17px] leading-relaxed text-muted">{p.what}</p>
                      {m && (
                        <p className="mt-4 text-[17px]">
                          <span className="mark mark-draw font-semibold">
                            {Math.round(m.summary.share_area_significant_increase * 100)}% of {m.land_only ? "land" : "the planet"} is confirmed {p.up}
                          </span>{" "}
                          <span className="text-muted">
                            and {Math.round(m.summary.share_area_significant_decrease * 100)}% {p.down}, since {m.years[0]}.
                          </span>
                        </p>
                      )}
                      <p className="atlas mt-4 text-[14px] tracking-[0.06em] text-faint">{p.satellite}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="relative max-md:hidden">
              <div className="sticky top-[14vh] flex flex-col items-center gap-4">
                <SpinningEarth
                  overlay={meta(question) ? overlayUrl(question, meta(question)!.built) : null}
                  spinRef={spin}
                  startLon={20}
                  label={`Globe showing where ${PLAIN[question].name.toLowerCase()} has a confirmed trend`}
                  className="aspect-square w-full max-w-[560px] drop-shadow-[0_30px_50px_rgba(17,24,31,0.14)]"
                />
                <p className="text-center text-sm text-muted">
                  Showing: <strong className="font-semibold text-ink">{PLAIN[question].name}</strong>. Coloured only where the change is confirmed.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. The analyst */}
        <section data-section className="chat bg-ground px-5 py-[14vh] md:px-10">
          <div className="mx-auto grid max-w-[1280px] items-start gap-12 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <div data-reveal className="mb-6 flex items-center gap-4">
                <Aisha size={84} state="speaking" />
                <p className="text-sm text-muted">
                  <strong className="block text-[17px] font-semibold text-ink">Meet Aisha</strong>
                  Ground Truth's AI analyst
                </p>
              </div>
              <h2 data-split className="atlas text-[clamp(44px,5.6vw,92px)] leading-[0.9]">
                Ask her anything, out loud
              </h2>
              <p data-reveal className="mt-5 text-[19px] leading-relaxed text-muted">
                Talk or type in your own words. Aisha looks things up in NASA's records, flies the map to the place, and answers with the evidence: every
                claim labelled as confirmed, not confirmed yet, or observed, with the source, the years and the data you can download. Every number is checked, so she
                can't make figures up.
              </p>
              {example && (
                <ul className="chat-tools mt-8 flex flex-col gap-2 text-[15px]" aria-label="What the analyst did">
                  {example.tools.map((tool, i) => (
                    <li key={`${tool}-${i}`} className="flex items-center gap-3">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-paper" aria-hidden>
                        <svg width="10" height="10" viewBox="0 0 10 10">
                          <path d="M2 5.2l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                      </span>
                      <span className="text-muted">{TOOL_WORDS[tool] ?? tool}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-4">
              {example ? (
                <>
                  <p className="chat-q self-end rounded-2xl rounded-br-md bg-ink px-5 py-3.5 text-[17px] text-paper">{example.question}</p>
                  <div className="rounded-2xl rounded-bl-md border border-line bg-paper px-6 py-5">
                    <p className="atlas mb-2 text-[16px] text-muted">Aisha, AI analyst</p>
                    <p className="chat-a whitespace-pre-line text-[17px] leading-relaxed">{example.answer.replace(/\*\*/g, "")}</p>
                  </div>
                  <p className="text-[13px] text-faint">A real answer from our test run, word for word.</p>
                </>
              ) : (
                <div className="h-64 animate-pulse rounded-2xl bg-paper" />
              )}
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section data-section className="px-5 py-[14vh] md:px-10">
          <div className="mx-auto max-w-[1280px]">
            <h2 data-split className="atlas max-w-[900px] text-[clamp(44px,6vw,104px)] leading-[0.9]">
              For the people living with the change
            </h2>
            <p data-reveal className="mt-5 max-w-[680px] text-[19px] leading-relaxed text-muted">
              Built first for Nigeria and Africa, where the changes are felt most and the data is hardest to reach. Open to everyone, everywhere.
            </p>
            <ul className="who-list mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-5">
              {PERSONAS.map((p) => (
                <li key={p.id} className="who-item flex flex-col gap-3 bg-paper p-5">
                  <p className="atlas text-[26px]">{p.label}</p>
                  <p className="text-[15px] leading-snug text-muted">{p.why}</p>
                  <p className="mt-auto rounded-lg bg-ground px-3 py-2 text-[14px] leading-snug text-ink">"{p.questions[0]}"</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 7. Finale */}
        <section data-section className="finale relative md:h-[210vh]">
          <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden md:sticky md:top-0 md:h-[100svh]">
          <div className="finale-media absolute inset-0 bg-[#0d1b2a]">
            <img src="/landing/blue-marble.jpg" alt="" width={2048} height={1024} className="h-full w-full object-cover opacity-90" />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-8 px-5 text-center">
            <h2 className="atlas text-[clamp(56px,9vw,168px)] leading-[0.86] text-white [text-shadow:0_4px_40px_rgba(0,0,0,.45)]">
              <span className="finale-line block overflow-hidden"><span className="block">Pick a place.</span></span>
              <span className="finale-line block overflow-hidden"><span className="block">Find the truth.</span></span>
            </h2>
            <OpenGlobe className="!bg-white !text-ink" />
          </div>
          </div>
        </section>
      </main>

      <footer data-section className="border-t border-line px-5 py-12 text-sm text-muted md:px-10">
        <div className="mx-auto flex max-w-[1280px] flex-col justify-between gap-8 md:flex-row">
          <div data-reveal>
            <p className="atlas text-[24px] text-ink">Ground Truth</p>
            <p className="mt-2 max-w-[360px]">
              Built for the NASA Space Apps Challenge 2026: Be an Earth System Trend Detective.{" "}
              <a
                href="/methods"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/methods", e.nativeEvent);
                }}
                className="link text-ink"
              >
                Methods & data
              </a>
              {" "}
              <a href="/ground-truth-technical-report.pdf" download className="link text-ink">
                Technical Report (PDF)
              </a>
            </p>
          </div>
          <div data-reveal className="max-w-[640px] leading-relaxed">
            <p className="font-semibold text-ink">Data</p>
            <p className="mt-1">
              NASA GISTEMP v4 (temperature), MODIS Terra MOD13C1 (plant greenness), GPM IMERG V07 (rainfall), GRACE and GRACE-FO JPL mascons (water
              storage), NASA POWER (daily weather), NASA FIRMS VIIRS (fires), NASA GIBS (Blue Marble, Black Marble). Google DeepMind AlphaEarth and Dynamic
              World (land change). Globe by Cesium.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const TOOL_WORDS: Record<string, string> = {
  locate_place: "Found the place on the map",
  detect_change: "Scanned satellite views for land change",
  trend_at_point: "Tested a NASA record at that spot",
  trend_in_region: "Tested a NASA record across the region",
  find_divergence: "Looked for opposite trends",
  now_vs_normal: "Compared the last 30 days with normal",
  recent_history: "Read the daily NASA weather records",
  live_events: "Checked live fires",
  set_view: "Switched the map",
};
