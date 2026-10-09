"use client";

import type { SentenceSegment } from "@/features/records/calculation-sentence";

import { Fragment } from "react";
import { TextCursorInput } from "lucide-react";

import { InlineChip } from "@/components/chip/inline-chip";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";

export function CalculationSentenceText({ segments }: { segments: SentenceSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        typeof segment === "string" ? (
          <Fragment key={index}>{segment}</Fragment>
        ) : (
          <InlineChip
            key={index}
            data-sentence-reference={`${segment.kind}:${segment.id}`}
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
        ),
      )}
    </>
  );
}
