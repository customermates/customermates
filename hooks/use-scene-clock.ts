import { useEffect, useRef, useState } from "react";

// A normalised 0..1 loop clock for marketing product scenes.
//
// The scene components are pure functions of `t`, which is what lets one composition serve
// three jobs: omit `t` and the scene renders its resolved final state as a still image;
// feed it this hook and it animates; drive `t` from outside in fixed steps and it can be
// captured frame-exactly for video (see scripts/capture-scene-video.mjs). No accumulated
// state exists anywhere in a scene, so the same `t` always produces the same DOM.
//
// It fixes the three defects in the older homepage-clip-terminal clock, which this
// replaces the approach of: that one ignores prefers-reduced-motion, never stops when
// scrolled out of view, and never stops in a background tab, so it burns a frame budget
// forever on every visit.
export function useSceneClock(durationMs: number, ref: React.RefObject<HTMLElement | null>) {
  // `null` means "not animating": the scene renders its resolved state instead. That is
  // also the server value, so the first client paint matches the server exactly.
  const [t, setT] = useState<number | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let start: number | null = null;
    let running = false;

    const step = (now: number) => {
      if (start === null) start = now;
      setT(((now - start) % durationMs) / durationMs);
      frameRef.current = requestAnimationFrame(step);
    };

    const play = () => {
      if (running) return;
      running = true;
      start = null;
      frameRef.current = requestAnimationFrame(step);
    };

    const pause = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frameRef.current);
    };

    let onScreen = false;

    const sync = () => {
      if (onScreen && document.visibilityState === "visible") play();
      else pause();
    };

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              onScreen = entries.some((entry) => entry.isIntersecting);
              sync();
            },
            { threshold: 0.15 },
          );

    if (observer) observer.observe(el);
    else onScreen = true;

    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      pause();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [durationMs, ref]);

  return t;
}
