"use client";

import type { ReactNode } from "react";
import type { AgentFileContext } from "@/ee/agent-chat/agent-context";

import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { useRecordFileSize } from "@/components/records/record-file-chips";
import { recordFileContentUrl, recordFileIcon } from "@/components/records/record-file-links";
import { INLINE_RECORD_FILE_TYPES } from "@/features/record-files/record-file-response";

export function AgentComposerFileChip({
  context,
  removeButton,
}: {
  context: AgentFileContext;
  removeButton?: ReactNode;
}) {
  const t = useTranslations();
  const fileSize = useRecordFileSize();
  const Icon = recordFileIcon(context.reference.mimeType);
  const size = fileSize(context.reference.size);
  const chip = (
    <AppChip
      className="me-1.5 my-px h-5 max-w-full px-[5px] py-0 align-middle text-sm leading-5 font-normal"
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
  const inline = INLINE_RECORD_FILE_TYPES.has(context.reference.mimeType);
  return (
    <a
      aria-label={t("RecordModel.fileOpen", { name: context.label, size })}
      className="inline-flex max-w-full min-w-0 align-middle"
      download={inline ? undefined : context.label}
      href={recordFileContentUrl(context.reference.fileId)}
      rel={inline ? "noopener noreferrer" : undefined}
      target={inline ? "_blank" : undefined}
    >
      {chip}
    </a>
  );
}
