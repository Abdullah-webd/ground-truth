import { lazy, Suspense, useEffect } from "react";
import { useRoute } from "./lib/router";

const Explore = lazy(() => import("./App"));
const Landing = lazy(() => import("./landing/Landing"));

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
    document.title = route === "/" ? "Ground Truth: which changes on Earth are real?" : "Ground Truth: explore the globe";
  }, [route]);
  return <Suspense fallback={<Loading />}>{route === "/explore" ? <Explore /> : <Landing />}</Suspense>;
}
