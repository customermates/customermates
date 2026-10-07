"use client";

import type { ConfigurationPreview } from "@/features/records/configuration.schema";
import type { RecordModel } from "@/features/records/record-model.schema";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";

import { deletionBlockerSentences, issueSentences } from "./use-configuration-deletion";

const INLINE_ISSUES = new Set(["summary_approval_required", "summary_approval_changed"]);

export function usePreviewBlockers(preview: ConfigurationPreview | null, model: RecordModel) {
  const t = useTranslations();
  const { showConfirmation } = useDeleteConfirmation();
  const shown = useRef<ConfigurationPreview | null>(null);
  useEffect(() => {
    if (!preview || preview.valid || shown.current === preview) return;
    shown.current = preview;
    const blocking = preview.issues.filter((issue) => !INLINE_ISSUES.has(issue.code));
    if (!blocking.length && !preview.deletion?.blockers.length) return;
    showConfirmation({
      title: t("RecordModel.changeBlocked"),
      message: t("RecordModel.invalidConfiguration"),
      blockers: [
        ...issueSentences(t, { ...preview, issues: blocking }, model),
        ...(preview.deletion ? deletionBlockerSentences(t, preview.deletion, model) : []),
      ],
      onConfirm: () => Promise.resolve(false),
    });
  }, [model, preview, showConfirmation, t]);
}
