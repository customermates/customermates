"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";
import { useEffect, useRef } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  className?: string;
};

export function NavLinkPendingIndicator({ className }: Props) {
  const { pending } = useLinkStatus();
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const link = indicatorRef.current?.closest("a");
    if (!link) return;

    if (pending) link.setAttribute("aria-busy", "true");
    else link.removeAttribute("aria-busy");

    return () => link.removeAttribute("aria-busy");
  }, [pending]);

  return (
    <span
      ref={indicatorRef}
      aria-hidden="true"
      className={cn("ml-auto inline-flex size-3 shrink-0 items-center justify-center", className)}
      data-navigation-pending={pending ? "true" : "false"}
    >
      <LoaderCircle
        aria-hidden="true"
        className={cn("size-3 opacity-0", pending && "animate-spin opacity-70 motion-reduce:animate-none")}
      />
    </span>
  );
}
