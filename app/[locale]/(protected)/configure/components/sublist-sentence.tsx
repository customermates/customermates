"use client";

import type { MouseEvent } from "react";

import { useTranslations } from "next-intl";

import { focusHref } from "@/components/focus/focus-href";
import { ConfirmationSentenceView, confirmationSentence } from "@/components/modal/confirmation-sentence";

type Parent = { id: string; label: string; pluralLabel: string; icon: string };

export function SublistSentence({
  parent,
  onNavigate,
}: {
  parent: Parent;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const t = useTranslations();
  const sentence = confirmationSentence((values) => t("RecordModel.sublistSentence", { ...values, parent: parent.label }), {
    list: { label: parent.pluralLabel, icon: { list: parent.icon }, href: focusHref({ kind: "list", id: parent.id }) },
  });
  return <ConfirmationSentenceView sentence={sentence} onNavigate={onNavigate} />;
}
