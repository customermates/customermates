"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

type CardProps = {
  cardId: string;
  icon: LucideIcon;
  kindLabel: string;
  sentence: string;
  expanded: boolean;
  invalid?: boolean;
  removeLabel?: string;
  openHint?: string;
  onToggle: () => void;
  onRemove?: () => void;
  children: ReactNode;
};

export function AutomationCard({
  cardId,
  icon: Icon,
  kindLabel,
  sentence,
  expanded,
  invalid,
  removeLabel,
  openHint,
  onToggle,
  onRemove,
  children,
}: CardProps) {
  const bodyId = useId();
  return (
    <section
      className={cn(
        "rounded-xl border bg-card shadow-xs transition-colors",
        expanded && "border-ring/60 shadow-sm",
        invalid && "border-destructive/60",
      )}
      data-automation-card={cardId}
    >
      <button
        aria-controls={bodyId}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        title={openHint}
        type="button"
        onClick={onToggle}
      >
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{kindLabel}</span>

          <span className="text-sm leading-snug break-words">{sentence}</span>
        </span>

        <ChevronDown
          aria-hidden="true"
          className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t p-3" id={bodyId}>
          {children}

          {onRemove && removeLabel && (
            <div>
              <Button size="sm" type="button" variant="ghostDestructive" onClick={onRemove}>
                <Trash2 aria-hidden="true" className="size-4" />

                {removeLabel}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function AutomationConnector({ label, active, onAdd }: { label: string; active: boolean; onAdd: () => void }) {
  return (
    <div className="relative flex h-7 items-center justify-center" data-automation-connector="">
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />

      <Button
        aria-expanded={active}
        aria-label={label}
        className="relative z-10 rounded-full bg-background"
        size="icon-xs"
        type="button"
        variant="secondary"
        onClick={onAdd}
      >
        <Plus aria-hidden="true" className="size-3" />
      </Button>
    </div>
  );
}
