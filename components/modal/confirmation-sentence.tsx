"use client";

import type { LucideIcon } from "lucide-react";

import { LayoutDashboard, Link2, Repeat, Table2, TextCursorInput, Webhook } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { IntlLink } from "@/i18n/navigation";
import { sentenceTemplate } from "@/core/utils/sentence-template";

export type ConfirmationChip = {
  label: string;
  href: string;
  icon: "field" | "relationship" | "routine" | "webhook" | "widget" | "view" | { list: string };
};

export type ConfirmationSentence = ReadonlyArray<string | ConfirmationChip>;

const KIND_ICONS: Record<Exclude<ConfirmationChip["icon"], { list: string }>, LucideIcon> = {
  field: TextCursorInput,
  relationship: Link2,
  routine: Repeat,
  webhook: Webhook,
  widget: LayoutDashboard,
  view: Table2,
};

export function confirmationSentence(
  translate: (values: Record<string, string>) => string,
  chips: Record<string, ConfirmationChip | ConfirmationChip[]>,
): ConfirmationSentence {
  return sentenceTemplate<ConfirmationChip>(
    translate,
    Object.fromEntries(
      Object.entries(chips).map(([name, chip]) => [
        name,
        Array.isArray(chip) ? chip.flatMap((item, position) => (position ? [", ", item] : [item])) : [chip],
      ]),
    ),
  );
}

function ChipIcon({ icon }: { icon: ConfirmationChip["icon"] }) {
  const Icon = typeof icon === "string" ? KIND_ICONS[icon] : recordTypeIcon(icon.list);
  return <Icon aria-hidden className="text-muted-foreground" />;
}

export function ConfirmationSentenceView({
  sentence,
  onNavigate,
}: {
  sentence: ConfirmationSentence;
  onNavigate?: () => void;
}) {
  return (
    <span className="leading-7">
      {sentence.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          <IntlLink
            key={index}
            className="mx-0.5 inline-flex max-w-full align-middle"
            data-confirmation-chip=""
            href={part.href}
            onClick={onNavigate}
          >
            <AppChip interactive startContent={<ChipIcon icon={part.icon} />}>
              {part.label}
            </AppChip>
          </IntlLink>
        ),
      )}
    </span>
  );
}
