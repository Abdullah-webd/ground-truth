import "./cesium-base";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { LayoutGroup } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { AtlasLabel } from "./components/AtlasLabel";
import { CaseFile } from "./components/CaseFile";
import { ChecksView } from "./components/ChecksView";
import { InvestigatePanel } from "./components/InvestigatePanel";
import { FirePanel } from "./components/FirePanel";
import { Timeline } from "./components/Timeline";
import { TopBar } from "./components/TopBar";
import { Globe } from "./globe/Globe";
import { GlobeSync } from "./globe/GlobeSync";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";
import { useVariables } from "./lib/useVariables";
import { useLayout } from "./lib/layout";
import { TabletShell } from "./components/TabletShell";
import { PhoneShell } from "./components/mobile/PhoneShell";

gsap.registerPlugin(useGSAP);

export default function Explore() {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const variables = useVariables();
  const layout = useLayout();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity, retry: 2 });
  const configDone = config.isSuccess || config.isError;
  const uiReady = !!variables.data;

  // Instruments come online as Earth swings in: each panel arrives from its own edge.
  useGSAP(
    () => {
      if (!uiReady) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 0.7 }, delay: 0.5 });
        tl.fromTo('[data-intro="top"]', { autoAlpha: 0, yPercent: -100 }, { autoAlpha: 1, yPercent: 0 })
          .fromTo('[data-intro="left"]', { autoAlpha: 0, x: -28 }, { autoAlpha: 1, x: 0 }, "-=0.45")
          .fromTo('[data-intro="bottom"]', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0 }, "-=0.5");
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set("[data-intro]", { autoAlpha: 1 });
      });
      const safety = window.setTimeout(() => gsap.set("[data-intro]", { autoAlpha: 1 }), 3000);
      return () => {
        window.clearTimeout(safety);
        mm.revert();
      };
    },
    { scope: root, dependencies: [uiReady] },
  );

  return (
    <div ref={root} className="app-screen theme-space">
      {configDone && <Globe onReady={onReady} ionToken={config.data?.cesium_ion_token ?? null} />}
      <GlobeSync ready={ready} />
      {variables.isError && (
        <div role="alert" className="absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-lg border border-bad/50 bg-paper px-4 py-3 text-sm text-bad">
          Can't load the trend data: {(variables.error as Error).message}
        </div>
      )}
      {uiReady && (
        <LayoutGroup>
          <div className="pointer-events-none absolute inset-0">
            {layout === "desktop" && (
              <>
                <TopBar />
                <InvestigatePanel />
                <Timeline />
                <CaseFile />
                <FirePanel />
              </>
            )}
            {layout === "tablet" && <TabletShell />}
            {layout === "phone" && <PhoneShell />}
            <AtlasLabel />
            <ChecksView />
          </div>
        </LayoutGroup>
      )}
    </div>
  );
}
