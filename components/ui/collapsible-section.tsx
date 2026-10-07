"use client";

import type { ReactNode } from "react";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";

import { cn } from "@/core/utils/cn";

type Props = {
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
};

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  open: openProp,
  id,
  className,
  children,
  onOpenChange,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;

  function setOpen(next: boolean) {
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  return (
    <CollapsiblePrimitive.Root
      className={cn("rounded-lg border", className)}
      data-slot="collapsible-section"
      data-state={open ? "open" : "closed"}
      open={open}
      onOpenChange={setOpen}
    >
      <CollapsiblePrimitive.Trigger
        className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-start text-sm font-semibold outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
        data-slot="collapsible-section-trigger"
        id={id}
        type="button"
      >
        <ChevronRight
          aria-hidden
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />

        <span className="min-w-0 flex-1 truncate">{title}</span>

        {summary !== undefined && summary !== null && !open ? (
          <span className="max-w-[50%] shrink-0 truncate text-xs font-normal text-muted-foreground">{summary}</span>
        ) : null}
      </CollapsiblePrimitive.Trigger>

      <CollapsiblePrimitive.Content className="flex flex-col gap-3 px-3 pb-3" data-slot="collapsible-section-content">
        {children}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}
