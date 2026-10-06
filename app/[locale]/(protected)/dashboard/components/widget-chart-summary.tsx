"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";

export function WidgetChartSummary({ notes, overall }: { notes: string[]; overall: string | null }) {
  const t = useTranslations();
  if (!overall && notes.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" data-slot="widget-chart-summary">
      {overall && <p className="min-w-0 truncate">{overall}</p>}

      {notes.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={t("RecordWidgets.notes")}
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                type="button"
                {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}
              >
                <Info aria-hidden className="size-3.5" />
              </button>
            </TooltipTrigger>

            <TooltipContent className="max-w-64 space-y-1 text-left" side="top">
              {notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <span className="sr-only">{notes.join(" ")}</span>
    </div>
  );
}
