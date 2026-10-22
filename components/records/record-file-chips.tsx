"use client";

import type { RecordFileSummary } from "@/features/records/record-model.schema";

import { useTranslations } from "next-intl";

import { describeFile } from "@/app/[locale]/(protected)/inbox/components/attachment-classify";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { formatBytes } from "@/core/utils/format-bytes";

import { recordFileContentUrl } from "./record-file-links";
import { useRecordFilePreview } from "./record-file-preview";

export function useRecordFileSize() {
  const intlStore = useHydratedIntlStore();
  const formatNumber = (value: number | undefined, options?: { maximumFractionDigits?: number }) =>
    intlStore.formatNumber(value, options);
  return (bytes: number) => formatBytes(bytes, formatNumber) ?? `${formatNumber(0)} B`;
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
  const { openFile, preview } = useRecordFilePreview();
  const items = fileIds.map((id) => {
    const file = files.find((entry) => entry.id === id);
    const { Icon } = describeFile({ mime: file?.mimeType, fileName: file?.name });
    return {
      id,
      file,
      label: file?.name ?? t("RecordModel.fileUnavailable"),
      startContent: <Icon aria-hidden="true" />,
    };
  });
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
          if (item.file) openFile(item.file, opener);
        }}
      />

      {preview}
    </>
  );
}
