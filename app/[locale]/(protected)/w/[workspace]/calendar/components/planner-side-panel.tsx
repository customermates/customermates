"use client";

import type { ReactNode } from "react";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { OVERLAY_SCROLL_REGION } from "@/components/ui/overlay-contract";
import { cn } from "@/core/utils/cn";

type Props = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
} & Record<`data-${string}`, string>;

export function PlannerSidePanel({
  title,
  closeLabel,
  onClose,
  actions,
  children,
  className,
  bodyClassName,
  ...data
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.stopPropagation();
      closeRef.current();
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <aside
      {...data}
      ref={panelRef}
      aria-label={title}
      className={cn(
        "absolute inset-y-2 right-2 z-20 flex w-[calc(100%-1rem)] max-w-[440px] flex-col overflow-hidden rounded-lg border border-border-strong bg-card shadow-lg",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-5 pt-4 pb-3">
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>

        {actions}

        <IconButton icon={X} label={closeLabel} onClick={onClose} />
      </header>

      <div className={cn(OVERLAY_SCROLL_REGION, "flex flex-col", bodyClassName)}>{children}</div>
    </aside>
  );
}
