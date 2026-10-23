"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { TruncatedText } from "@/components/shared/truncated-text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

import { WIDGET_CARD_TITLE_CLASS } from "./widget-card-frame";
import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";

export function WidgetTitle({ name, notes }: { name: string; notes: string[] }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-1.5" data-slot="widget-title">
      <h2 className={cn(WIDGET_CARD_TITLE_CLASS, "w-auto min-w-0")}>
        <TruncatedText>{name}</TruncatedText>
      </h2>

      <WidgetNotes notes={notes} />
    </div>
  );
}

export function WidgetSubtitle({
  text,
  reserve = false,
  tone = "muted",
}: {
  text: string | null;
  reserve?: boolean;
  tone?: "muted" | "destructive";
}) {
  if (!text) return reserve ? <div aria-hidden className="h-4" /> : null;
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 text-xs",
        tone === "destructive" ? "text-destructive" : "text-muted-foreground",
      )}
      data-slot="widget-subtitle"
    >
      <TruncatedText className="min-w-0">{text}</TruncatedText>
    </div>
  );
}

export function WidgetNotes({ notes }: { notes: string[] }) {
  const t = useTranslations();
  if (!notes.length) return null;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={t("RecordWidgets.notes")}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

      <span className="sr-only">{notes.join(" ")}</span>
    </>
  );
}
