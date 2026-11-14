import { lazy, Suspense, useEffect } from "react";
import { useRoute } from "./lib/router";

const Explore = lazy(() => import("./App"));
const Landing = lazy(() => import("./landing/Landing"));
const Methods = lazy(() => import("./methods/Methods"));

function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-paper">
      <span className="atlas text-[28px] text-ink">Ground Truth</span>
    </div>
  );
}

export default function Root() {
  const route = useRoute();
  useEffect(() => {
    document.title =
      route === "/" ? "Ground Truth: which changes on Earth are real?" : route === "/methods" ? "Ground Truth: methods and data" : "Ground Truth: explore the globe";
  }, [route]);
  return <Suspense fallback={<Loading />}>{route === "/explore" ? <Explore /> : route === "/methods" ? <Methods /> : <Landing />}</Suspense>;
}
