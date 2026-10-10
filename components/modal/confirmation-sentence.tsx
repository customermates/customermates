"use client";

import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";
import type { SentenceReference, SentenceSegment } from "@/features/records/calculation-sentence";

import { LayoutDashboard, Link2, Repeat, Table2, TextCursorInput, Webhook } from "lucide-react";

import { InlineChip } from "@/components/chip/inline-chip";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { IntlLink } from "@/i18n/navigation";
import { sentenceTemplate } from "@/core/utils/sentence-template";

export type ConfirmationChipAction = { label: string; onOpen: (trigger: HTMLElement) => void };

export type ConfirmationChip = {
  label: string;
  icon: "field" | "relationship" | "routine" | "webhook" | "widget" | "view" | { list: string };
  href?: string;
  action?: ConfirmationChipAction;
  reference?: string;
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

export function referenceSentence(
  segments: ReadonlyArray<SentenceSegment>,
  action?: (reference: SentenceReference) => ConfirmationChipAction | null,
): ConfirmationSentence {
  return segments.map((segment) =>
    typeof segment === "string"
      ? segment
      : {
          label: segment.label,
          icon: segment.kind === "list" ? { list: segment.icon } : "field",
          reference: `${segment.kind}:${segment.id}`,
          action: action?.(segment) ?? undefined,
        },
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
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <span>
      {sentence.map((part, index) => {
        if (typeof part === "string") return <span key={index}>{part}</span>;
        const interactive = Boolean(part.action ?? part.href);
        const chip = (
          <InlineChip
            data-sentence-reference={part.reference}
            interactive={interactive}
            startContent={<ChipIcon icon={part.icon} />}
          >
            {part.label}
          </InlineChip>
        );
        const { action, href } = part;
        if (action) {
          return (
            <button
              key={index}
              aria-label={action.label}
              className="inline-flex max-w-full rounded-sm align-top focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-confirmation-chip=""
              type="button"
              onClick={(event) => action.onOpen(event.currentTarget)}
            >
              {chip}
            </button>
          );
        }
        if (href) {
          return (
            <IntlLink
              key={index}
              className="inline-flex max-w-full align-top"
              data-confirmation-chip=""
              href={href}
              onClick={onNavigate}
            >
              {chip}
            </IntlLink>
          );
        }
        return (
          <span key={index} className="inline-flex max-w-full align-top">
            {chip}
          </span>
        );
      })}
    </span>
  );
}
