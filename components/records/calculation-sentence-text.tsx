"use client";

import type { SentenceSegment } from "@/features/records/calculation-sentence";

import { ConfirmationSentenceView } from "@/components/modal/confirmation-sentence";
import { focusHref } from "@/components/focus/focus-href";

export function CalculationSentenceText({ segments }: { segments: SentenceSegment[] }) {
  return (
    <ConfirmationSentenceView
      sentence={segments.map((segment) =>
        typeof segment === "string"
          ? segment
          : segment.kind === "field"
            ? {
                label: segment.label,
                icon: "field" as const,
                href: focusHref({ kind: "field", id: segment.id, typeId: segment.typeId }),
              }
            : { label: segment.label, icon: { list: segment.icon }, href: focusHref({ kind: "list", id: segment.id }) },
      )}
    />
  );
}
