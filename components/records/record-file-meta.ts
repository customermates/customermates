"use client";

import type { ImageSize } from "@/components/files/file-type-badge";
import type { RecordFileSummary, RecordMember } from "@/features/records/record-model.schema";

import { useTranslations } from "next-intl";

import { fileKind, fileTypeLabelKey } from "@/components/files/file-kind";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { formatBytes } from "@/core/utils/format-bytes";

type MetaFile = Pick<RecordFileSummary, "name" | "mimeType"> &
  Partial<Pick<RecordFileSummary, "size" | "uploadedAt" | "uploadedById" | "pageCount">>;

export function memberName(members: Array<Pick<RecordMember, "id" | "firstName" | "lastName">>) {
  return (userId: string) => {
    const member = members.find((candidate) => candidate.id === userId);
    return member ? `${member.firstName} ${member.lastName}`.trim() || null : null;
  };
}

export function useRecordFileSize() {
  const intlStore = useHydratedIntlStore();
  const formatNumber = (value: number | undefined, options?: { maximumFractionDigits?: number }) =>
    intlStore.formatNumber(value, options);
  return (bytes: number) => formatBytes(bytes, formatNumber) ?? `${formatNumber(0)} B`;
}

export function useRecordFileMeta(
  file: MetaFile | undefined,
  {
    uploaderName,
    imageSize,
    withType = false,
  }: {
    uploaderName?: (userId: string) => string | null;
    imageSize?: ImageSize | null;
    withType?: boolean;
  } = {},
): string | null {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const fileSize = useRecordFileSize();
  if (!file) return null;
  const kind = fileKind(file.mimeType, file.name);
  const uploader = file.uploadedById ? uploaderName?.(file.uploadedById) : null;
  const detail =
    kind === "pdf" && file.pageCount
      ? t("RecordModel.filePages", { count: file.pageCount })
      : imageSize
        ? t("RecordModel.fileDimensions", {
            width: intlStore.formatNumber(imageSize.width, { useGrouping: false }),
            height: intlStore.formatNumber(imageSize.height, { useGrouping: false }),
          })
        : null;
  return [
    withType ? t(fileTypeLabelKey(kind)) : null,
    detail,
    file.size === undefined ? null : fileSize(file.size),
    uploader ? (withType ? t("RecordModel.fileAddedBy", { name: uploader }) : uploader) : null,
    file.uploadedAt ? intlStore.formatRelativeTime(new Date(file.uploadedAt)) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
