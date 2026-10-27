import type { LucideIcon } from "lucide-react";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { classifyAttachment, isMediaKind, type AttachmentKind } from "@/ee/messaging/attachment-kind";
import { FILE_KIND_ICON, fileKind, fileKindAccentClass, fileTypeLabelKey } from "@/components/files/file-kind";
import { cn } from "@/core/utils/cn";
import { workspaceApiUrl } from "@/core/navigation/workspace-api-url";
import { formatBytes, type FormatNumber } from "@/core/utils/format-bytes";

export { classifyAttachment, isMediaKind };
export type { AttachmentKind };

export type AttachmentMeta = MessagingMessageDto["attachmentsMeta"][number];
export type InboxT = (key: string, values?: Record<string, string | number>) => string;

type FileDescriptor = { Icon: LucideIcon; typeLabelKey: string; accent: string };

export function describeFile(input: { mime?: string | null; fileName?: string | null }): FileDescriptor {
  const kind = fileKind(input.mime, input.fileName);
  return { Icon: FILE_KIND_ICON[kind], typeLabelKey: fileTypeLabelKey(kind), accent: fileKindAccentClass(kind) };
}

export function attachmentSubtitle(
  t: InboxT,
  input: { mime?: string | null; fileName?: string | null; size?: number | null },
  formatNumber?: FormatNumber,
): string {
  const { typeLabelKey } = describeFile(input);
  const size = formatBytes(input.size, formatNumber);
  return size ? `${t(typeLabelKey)} · ${size}` : t(typeLabelKey);
}

export function attachmentRowClass(interactive: boolean, extra?: string) {
  return cn(
    "flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm leading-tight",
    "border-primary/20 bg-primary/10 text-foreground",
    interactive && "transition-colors hover:bg-primary/15 hover:border-primary/30 active:bg-primary/20",
    extra,
  );
}

export function attachmentProxyUrl(messageId: string, attachmentId: string, workspaceSlug: string | null): string {
  return workspaceApiUrl(
    `/api/messaging/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}`,
    workspaceSlug,
  );
}

export function downloadLocalFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
