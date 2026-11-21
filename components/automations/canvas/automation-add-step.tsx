"use client";

import type { AutomationCanvasActions } from "./automation-canvas-types";
import type { AutomationPaletteKind } from "@/components/automations/automation-palette";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AUTOMATION_PALETTE_ITEMS,
  AutomationPalette,
  automationPaletteItemText,
} from "@/components/automations/automation-palette";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";

export const AUTOMATION_QUICK_STEP_KINDS: readonly AutomationPaletteKind[] = [
  "agent",
  "condition",
  "setField",
  "createRecord",
  "notify",
];

const QUICK_ITEM_CLASS =
  "nodrag nopan flex min-w-0 items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-start text-xs font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function AutomationAddStep({
  index,
  actions,
  variant,
  quick = false,
}: {
  index: number;
  actions: AutomationCanvasActions;
  variant: "edge" | "node";
  quick?: boolean;
}) {
  const t = useTranslations();
  const { palette } = actions;
  if (!palette || !actions.editable) return null;
  const open = actions.paletteAt === index;
  const toggle = () => actions.onOpenPalette(open ? null : index);

  let anchor;
  if (variant === "edge") {
    anchor = (
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
    );
  } else if (quick) {
    anchor = (
      <div
        className="flex w-96 max-w-full flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm"
        data-automation-quick-steps=""
      >
        <p className="px-0.5 text-xs font-medium text-muted-foreground">{t("Automations.canvas.then")}</p>

        <div className="grid grid-cols-2 gap-1.5">
          {AUTOMATION_QUICK_STEP_KINDS.map((kind) => {
            const Icon = AUTOMATION_PALETTE_ITEMS[kind].icon;
            return (
              <button
                key={kind}
                className={cn(QUICK_ITEM_CLASS, kind === "agent" && "border-info/30 bg-info/5")}
                data-automation-quick-step={kind}
                disabled={palette.disabled.has(kind)}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onPick(index, kind);
                }}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-background">
                  <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                </span>

                <span className="truncate">{automationPaletteItemText(t, kind).title}</span>
              </button>
            );
          })}

          <button
            aria-expanded={open}
            className={QUICK_ITEM_CLASS}
            data-automation-add={index}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-background">
              <Plus aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </span>

            <span className="truncate">{t("Automations.canvas.moreSteps")}</span>
          </button>
        </div>
      </div>
    );
  } else {
    anchor = (
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
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => actions.onOpenPalette(next ? index : null)}>
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>

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
