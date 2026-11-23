"use client";

import type { ReactNode } from "react";

import { X } from "lucide-react";

import { keepOpenForAssistantSurface } from "@/components/modal/assistant-surface";
import { IconButton } from "@/components/ui/icon-button";
import { OVERLAY_SCROLL_REGION, OVERLAY_SIDE_SHEET_CLASS } from "@/components/ui/overlay-contract";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        {...data}
        aria-describedby={undefined}
        className={cn(OVERLAY_SIDE_SHEET_CLASS, "bg-card sm:max-w-[440px]", className)}
        showCloseButton={false}
        side="right"
        onEscapeKeyDown={keepOpenForAssistantSurface}
        onInteractOutside={keepOpenForAssistantSurface}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus({ preventScroll: true });
        }}
      >
        <header className="flex shrink-0 items-center gap-2 border-b px-5 pt-[calc(1rem+var(--safe-top))] pr-[calc(1.25rem+var(--safe-right))] pb-3">
          <SheetTitle className="min-w-0 flex-1 truncate">{title}</SheetTitle>

          {actions}

          <IconButton icon={X} label={closeLabel} onClick={onClose} />
        </header>

        <div
          className={cn(
            OVERLAY_SCROLL_REGION,
            "flex flex-col pr-[var(--safe-right)] pb-[var(--safe-bottom)]",
            bodyClassName,
          )}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
