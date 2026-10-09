"use client";

import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";

import { LayoutDashboard, Link2, Repeat, Table2, TextCursorInput, Webhook } from "lucide-react";

import { InlineChip } from "@/components/chip/inline-chip";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { IntlLink } from "@/i18n/navigation";

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

const TOKEN = "\u0000";

export function confirmationSentence(
  translate: (values: Record<string, string>) => string,
  chips: Record<string, ConfirmationChip | ConfirmationChip[]>,
): ConfirmationSentence {
  const names = Object.keys(chips);
  const text = translate(Object.fromEntries(names.map((name, index) => [name, `${TOKEN}${index}${TOKEN}`])));
  return text
    .split(TOKEN)
    .flatMap((part, index) => {
      if (index % 2 === 0) return [part];
      const chip = chips[names[Number(part)]];
      return Array.isArray(chip) ? chip.flatMap((item, position) => (position ? [", ", item] : [item])) : [chip];
    })
    .filter((part) => part !== "");
}

export function ChipIcon({ icon }: { icon: ConfirmationChip["icon"] }) {
  const Icon = typeof icon === "string" ? KIND_ICONS[icon] : recordTypeIcon(icon.list);
  return <Icon aria-hidden className="text-muted-foreground" />;
}

export function ConfirmationSentenceView({
  sentence,
  onNavigate,
}: {
  sentence: ConfirmationSentence;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <span>
      {sentence.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          <IntlLink
            key={index}
            className="inline-flex max-w-full align-top"
            data-confirmation-chip=""
            href={part.href}
            onClick={onNavigate}
          >
            <InlineChip interactive startContent={<ChipIcon icon={part.icon} />}>
              {part.label}
            </InlineChip>
          </IntlLink>
        ),
      )}
    </span>
  );
}
