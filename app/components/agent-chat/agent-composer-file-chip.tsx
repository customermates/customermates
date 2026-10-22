"use client";

import type { ReactNode } from "react";
import type { AgentFileContext } from "@/ee/agent-chat/agent-context";

import { useTranslations } from "next-intl";

import { describeFile } from "@/app/[locale]/(protected)/inbox/components/attachment-classify";
import { AppChip } from "@/components/chip/app-chip";
import { useRecordFileSize } from "@/components/records/record-file-chips";
import { recordFileContentUrl } from "@/components/records/record-file-links";
import { useRecordFilePreview } from "@/components/records/record-file-preview";
import { OVERLAY_TOPMOST_LAYER_CLASS } from "@/components/ui/overlay-contract";

import { AGENT_COMPOSER_CHIP_CLASS } from "./agent-composer-chip";

export function AgentComposerFileChip({
  context,
  removeButton,
}: {
  context: AgentFileContext;
  removeButton?: ReactNode;
}) {
  const t = useTranslations();
  const fileSize = useRecordFileSize();
  const { openFile, preview } = useRecordFilePreview({ layerClassName: OVERLAY_TOPMOST_LAYER_CLASS });
  const { Icon } = describeFile({ mime: context.reference.mimeType, fileName: context.label });
  const size = fileSize(context.reference.size);
  const chip = (
    <AppChip
      className={AGENT_COMPOSER_CHIP_CLASS}
      data-agent-file-context={context.reference.fileId}
      endContent={
        <>
          <span className="shrink-0 text-current/60">{size}</span>

          {removeButton}
        </>
      }
      interactive={!removeButton}
      size="sm"
      startContent={<Icon aria-hidden className="size-3 shrink-0" />}
      variant="default"
    >
      {context.label}
    </AppChip>
  );
  if (removeButton) return chip;
  return (
    <>
      <a
        aria-label={t("RecordModel.fileOpen", { name: context.label, size })}
        className="inline-flex max-w-full min-w-0 align-middle"
        href={recordFileContentUrl(context.reference.fileId)}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          openFile(
            { id: context.reference.fileId, name: context.label, mimeType: context.reference.mimeType },
            event.currentTarget,
          );
        }}
      >
        {chip}
      </a>

      {preview}
    </>
  );
}
