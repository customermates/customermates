"use client";

import { useTranslations } from "next-intl";

import { confirmationSentence, ConfirmationSentenceView } from "@/components/modal/confirmation-sentence";
import { focusHref } from "@/components/focus/focus-href";
import { cn } from "@/core/utils/cn";

type Parent = { id: string; label: string; pluralLabel: string; icon: string };

export function SublistSentence({ parent, className }: { parent: Parent; className?: string }) {
  const t = useTranslations();
  const sentence = confirmationSentence(
    (values) => t("RecordModel.sublistSentence", { ...values, singular: parent.label }),
    {
      parent: {
        label: parent.pluralLabel,
        href: focusHref({ kind: "list", id: parent.id }),
        icon: { list: parent.icon },
      },
    },
  );
  return (
    <p className={cn("text-muted-foreground", className)} data-configure-sublist-explanation="">
      <ConfirmationSentenceView sentence={sentence} />
    </p>
  );
}
