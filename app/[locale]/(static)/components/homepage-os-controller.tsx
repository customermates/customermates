"use client";

import type { ReactNode } from "react";

import { useEffect, useState } from "react";

import { useInViewState } from "@/components/marketing/in-view";
import { cn } from "@/core/utils/cn";

const CYCLE_MS = 3200;

type Props = {
  children: ReactNode;
  className?: string;
  ids: readonly string[];
};

export function HomepageOsController({ children, className, ids }: Props) {
  const { ref, state } = useInViewState<HTMLDivElement>(0.3);
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (state !== "playing" || pinned) return;

    const timer = window.setInterval(() => {
      setActive((current) => ids[(ids.indexOf(current ?? "") + 1) % ids.length] ?? null);
    }, CYCLE_MS);

    return () => window.clearInterval(timer);
  }, [ids, pinned, state]);

  function pick(target: EventTarget | null, pin: boolean) {
    const row = (target as HTMLElement | null)?.closest<HTMLElement>("[data-pillar-row]");
    if (!row) return;
    setActive(row.dataset.pillarRow ?? null);
    if (pin) setPinned(true);
  }

  return (
    <div
      ref={ref}
      className={cn(className)}
      data-os-active={active ?? undefined}
      data-os-pinned={pinned || undefined}
      onFocus={(event) => pick(event.target, true)}
      onPointerLeave={() => setPinned(false)}
      onPointerOver={(event) => pick(event.target, true)}
    >
      {children}
    </div>
  );
}
