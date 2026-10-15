"use client";

import type { RecordFileSummary } from "@/features/records/record-model.schema";

import { useTranslations } from "next-intl";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { storageSizeLabel } from "@/features/record-files/storage-size";

import { openRecordFile, recordFileContentUrl, recordFileIcon } from "./record-file-links";

export function useRecordFileSize() {
  const intlStore = useHydratedIntlStore();
  return (bytes: number) => storageSizeLabel(bytes, intlStore.formattingLocale);
}

export function RecordFileChips({
  fileIds,
  files,
  compact = false,
  overflowMenu = true,
}: {
  fileIds: string[];
  files: RecordFileSummary[];
  compact?: boolean;
  overflowMenu?: boolean;
}) {
  const t = useTranslations();
  const fileSize = useRecordFileSize();
  const items = fileIds.map((id) => {
    const file = files.find((entry) => entry.id === id);
    const Icon = recordFileIcon(file?.mimeType);
    return {
      id,
      file,
      label: file?.name ?? t("RecordModel.fileUnavailable"),
      startContent: <Icon aria-hidden="true" />,
    };
  });
  return (
    <AppChipStack
      chipHref={(item) => (item.file ? recordFileContentUrl(item.file.id) : undefined)}
      chipLabel={(item) =>
        item.file ? t("RecordModel.fileOpen", { name: item.file.name, size: fileSize(item.file.size) }) : item.label
      }
      fill={!compact}
      items={items}
      overflowMenu={overflowMenu}
      onChipClick={(item) => {
        if (item.file) openRecordFile(item.file);
      }}
    />
  );
}
