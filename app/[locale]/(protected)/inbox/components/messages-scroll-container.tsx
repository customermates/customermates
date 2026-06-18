"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  scrollKey: string;
  children: React.ReactNode;
};

export function MessagesScrollContainer({ className, scrollKey, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  return (
    <div ref={ref} className={cn("flex-1 overflow-y-auto py-3", className)}>
      {children}
    </div>
  );
}
