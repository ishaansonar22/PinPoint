"use client";

import { useEffect, useState } from "react";

/**
 * Like framer-motion's useReducedMotion, but always returns `false` during
 * server rendering and the first client render, then updates after mount.
 * This keeps server and client markup identical (no hydration mismatch) while
 * still honouring `prefers-reduced-motion` for every animation we drive.
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}
