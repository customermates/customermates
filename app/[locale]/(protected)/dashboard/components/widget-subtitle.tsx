"use client";

import { useTranslations } from "next-intl";

import { TruncatedText } from "@/components/shared/truncated-text";

export function WidgetSubtitle({ text, reserve = false }: { text: string | null; reserve?: boolean }) {
  if (!text) return reserve ? <div aria-hidden className="h-4" /> : null;
  return (
    <div className="flex w-full min-w-0 items-center gap-1.5 text-xs text-muted-foreground" data-slot="widget-subtitle">
      <TruncatedText className="min-w-0">{text}</TruncatedText>
    </div>
  );
}

export function WidgetNotes({ notes }: { notes: string[] }) {
  const t = useTranslations();
  if (!notes.length) return null;
  return (
    <div aria-label={t("RecordWidgets.notes")} className="w-full min-w-0 text-xs text-muted-foreground" role="note">
      <TruncatedText>{notes.join(" ")}</TruncatedText>
    </div>
  );
}
