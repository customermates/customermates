"use client";

import type { RecordFileSummary, RecordMember } from "@/features/records/record-model.schema";

import { useTranslations } from "next-intl";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { FileTypeBadge } from "@/components/files/file-type-badge";

import { recordFileContentUrl } from "./record-file-links";
import { memberName, useRecordFileSize } from "./record-file-meta";
import { useRecordFilePreview } from "./record-file-preview";

export function RecordFileChips({
  fileIds,
  files,
  group,
  members = [],
  compact = false,
  overflowMenu = true,
}: {
  fileIds: string[];
  files: RecordFileSummary[];
  group?: string;
  members?: RecordMember[];
  compact?: boolean;
  overflowMenu?: boolean;
}) {
  const t = useTranslations();
  const fileSize = useRecordFileSize();
  const { openFiles, preview } = useRecordFilePreview();
  const items = fileIds.map((id) => {
    const file = files.find((entry) => entry.id === id);
    return {
      id,
      file,
      label: file?.name ?? t("RecordModel.fileUnavailable"),
      startContent: <FileTypeBadge mimeType={file?.mimeType} name={file?.name} size="sm" />,
    };
  });
  const known = items.flatMap((item) => (item.file ? [item.file] : []));
  return (
    <>
      <AppChipStack
        chipHref={(item) => (item.file ? recordFileContentUrl(item.file.id) : undefined)}
        chipLabel={(item) =>
          item.file ? t("RecordModel.fileOpen", { name: item.file.name, size: fileSize(item.file.size) }) : item.label
        }
        fill={!compact}
        items={items}
        overflowMenu={overflowMenu}
        onChipClick={(item, opener) => {
          if (item.file) {
            openFiles(
              { files: known, index: known.indexOf(item.file), group, uploaderName: memberName(members) },
              opener,
            );
          }
        }}
      />

      {preview}
    </>
  );
}
