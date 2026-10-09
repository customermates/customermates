"use client";

import type { SentenceSegment } from "@/features/records/calculation-sentence";

import { Fragment } from "react";
import { TextCursorInput } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";

export function CalculationSentenceText({ segments }: { segments: SentenceSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        typeof segment === "string" ? (
          <Fragment key={index}>{segment}</Fragment>
        ) : (
          <AppChip
            key={index}
            className="mx-0.5 align-middle"
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
          </AppChip>
        ),
      )}
    </>
  );
}
