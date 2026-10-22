import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  type LucideIcon,
  Presentation,
} from "lucide-react";

import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { classifyAttachment, isMediaKind, type AttachmentKind } from "@/ee/messaging/attachment-kind";
import { cn } from "@/core/utils/cn";
import { formatBytes, type FormatNumber } from "@/core/utils/format-bytes";

export { classifyAttachment, isMediaKind };
export type { AttachmentKind };

export type AttachmentMeta = MessagingMessageDto["attachmentsMeta"][number];
export type InboxT = (key: string, values?: Record<string, string | number>) => string;

type FileDescriptor = { Icon: LucideIcon; typeLabelKey: string; accent: string };

export function describeFile(input: { mime?: string | null; fileName?: string | null }): FileDescriptor {
  const mime = input.mime?.toLowerCase() ?? "";
  const ext = (input.fileName?.split(".").pop() ?? "").toLowerCase();
  const has = (m: string, e: string[]) => mime.includes(m) || e.includes(ext);

  if (mime === "application/pdf" || ext === "pdf")
    return { Icon: FileText, typeLabelKey: "Inbox.fileTypePdf", accent: "text-destructive" };
  if (has("wordprocessingml", ["doc", "docx"]) || mime === "application/msword")
    return { Icon: FileText, typeLabelKey: "Inbox.fileTypeWord", accent: "text-primary" };
  if (has("spreadsheetml", ["xls", "xlsx", "csv"]) || mime === "application/vnd.ms-excel")
    return { Icon: FileSpreadsheet, typeLabelKey: "Inbox.fileTypeExcel", accent: "text-success" };
  if (has("presentationml", ["ppt", "pptx"]) || mime === "application/vnd.ms-powerpoint")
    return { Icon: Presentation, typeLabelKey: "Inbox.fileTypePowerpoint", accent: "text-warning" };
  if (mime.startsWith("image/"))
    return { Icon: FileImage, typeLabelKey: "Inbox.fileTypeImage", accent: "text-muted-foreground" };
  return { Icon: otherFileIcon(mime), typeLabelKey: "Inbox.attachmentFile", accent: "text-muted-foreground" };
}

function otherFileIcon(mime: string): LucideIcon {
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.startsWith("text/") || mime === "application/json") return FileText;
  if (mime === "application/zip" || mime.includes("compressed") || mime.includes("x-tar")) return FileArchive;
  return FileIcon;
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

export function attachmentRowClass(interactive: boolean, extra?: string, tone: "message" | "neutral" = "message") {
  return cn(
    "flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm leading-tight",
    tone === "neutral"
      ? "min-w-0 border-border bg-input-background py-2.5 text-foreground"
      : "border-primary/20 bg-primary/10 text-foreground",
    interactive &&
      (tone === "neutral"
        ? "transition-colors hover:bg-accent"
        : "transition-colors hover:bg-primary/15 hover:border-primary/30 active:bg-primary/20"),
    extra,
  );
}

export function attachmentProxyUrl(messageId: string, attachmentId: string): string {
  return `/api/messaging/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}`;
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
