"use client";

import type { SentenceReference, SentenceSegment } from "@/features/records/calculation-sentence";

import { Fragment } from "react";
import { TextCursorInput } from "lucide-react";

import { InlineChip } from "@/components/chip/inline-chip";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";

type ReferenceAction = { label: string; onOpen: (trigger: HTMLElement) => void };

export function CalculationSentenceText({
  segments,
  action,
}: {
  segments: SentenceSegment[];
  action?: (reference: SentenceReference) => ReferenceAction | null;
}) {
  return (
    <>
      {segments.map((segment, index) => {
        if (typeof segment === "string") return <Fragment key={index}>{segment}</Fragment>;
        const open = action?.(segment) ?? null;
        const chip = (
          <InlineChip
            data-sentence-reference={`${segment.kind}:${segment.id}`}
            interactive={open !== null}
            startContent={
              segment.kind === "list" ? (
                <RecordTypeGlyph icon={segment.icon} />
              ) : (
                <TextCursorInput aria-hidden className="text-muted-foreground" />
              )
            }
          >
            {segment.label}
          </InlineChip>
        );
        return open ? (
          <button
            key={index}
            aria-label={open.label}
            className="inline-flex max-w-full rounded-sm align-top focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={(event) => open.onOpen(event.currentTarget)}
          >
            {chip}
          </button>
        ) : (
          <Fragment key={index}>{chip}</Fragment>
        );
      })}
    </>
  );
}
