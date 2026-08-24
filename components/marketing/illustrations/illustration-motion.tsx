"use client";

import type { ReactNode } from "react";

import { useEffect, useRef, useState } from "react";

type Props = {
  children: ReactNode;
};

export function IllustrationMotion({ children }: Props) {
  const [played, setPlayed] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setPlayed(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.2 },
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="w-full" data-illustration-play={played || undefined}>
      {children}
    </div>
  );
}
