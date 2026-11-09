"use client";

import { useEffect, useState } from "react";

import { useInViewState } from "@/components/marketing/in-view";

const TYPE_MS = 22;

export function HomepageComposerText({ prompt }: { prompt: string }) {
  const { ref, state } = useInViewState<HTMLParagraphElement>(0.5);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (state === "waiting") setCount(0);
    if (state !== "playing") return;

    let current = 0;
    setCount(0);
    const timer = window.setInterval(() => {
      current += 1;
      setCount(current);
      if (current >= prompt.length) window.clearInterval(timer);
    }, TYPE_MS);

    return () => window.clearInterval(timer);
  }, [prompt, state]);

  const typed = count === null ? prompt : prompt.slice(0, count);
  const done = count === null || count >= prompt.length;

  return (
    <p
      ref={ref}
      className="homepage-spotlight-text grid"
      data-composer-state={done ? "sent" : state === "playing" ? "typing" : "waiting"}
    >
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {prompt}
      </span>

      <span className="col-start-1 row-start-1">
        <span className="sr-only">{prompt}</span>

        <span aria-hidden>{typed}</span>

        <span aria-hidden className="caret" />
      </span>
    </p>
  );
}
