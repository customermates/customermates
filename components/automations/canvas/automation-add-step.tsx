"use client";

import type { AutomationCanvasActions } from "./automation-canvas-types";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { AutomationPalette } from "@/components/automations/automation-palette";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";

export function AutomationAddStep({
  index,
  actions,
  variant,
}: {
  index: number;
  actions: AutomationCanvasActions;
  variant: "edge" | "node";
}) {
  const t = useTranslations();
  const { palette } = actions;
  if (!palette || !actions.editable) return null;
  const open = actions.paletteAt === index;
  const toggle = () => actions.onOpenPalette(open ? null : index);

  return (
    <Popover open={open} onOpenChange={(next) => actions.onOpenPalette(next ? index : null)}>
      <PopoverAnchor asChild>
        {variant === "edge" ? (
          <Button
            aria-expanded={open}
            aria-label={t("Automations.canvas.addHere")}
            className={cn(
              "nodrag nopan rounded-full bg-background shadow-xs",
              !open && "opacity-80 hover:opacity-100",
              open && "border-ring/60",
            )}
            data-automation-add={index}
            size="icon-xs"
            type="button"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
          >
            <Plus aria-hidden="true" className="size-3" />
          </Button>
        ) : (
          <button
            aria-expanded={open}
            className={cn(
              "nodrag nopan flex h-10 w-72 max-w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-card/60 text-sm text-muted-foreground outline-none hover:bg-card hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
              open && "border-ring/60 bg-card text-foreground",
            )}
            data-automation-add={index}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
          >
            <Plus aria-hidden="true" className="size-4" />

            {t("Automations.canvas.addStep")}
          </button>
        )}
      </PopoverAnchor>

      <PopoverContent
        align="center"
        className="w-[34rem] max-w-[calc(100vw-2rem)] border-0 bg-transparent p-0 shadow-none"
        side="right"
        sideOffset={14}
        onClick={(event) => event.stopPropagation()}
      >
        <AutomationPalette
          disabled={palette.disabled}
          reasons={palette.reasons}
          onClose={() => actions.onOpenPalette(null)}
          onPick={(kind) => actions.onPick(index, kind)}
        />
      </PopoverContent>
    </Popover>
  );
}
