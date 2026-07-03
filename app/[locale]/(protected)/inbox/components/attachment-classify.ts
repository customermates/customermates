import { File as FileIcon, FileImage, FileSpreadsheet, FileText, type LucideIcon, Presentation } from "lucide-react";

import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { classifyAttachment, isMediaKind, type AttachmentKind } from "@/ee/messaging/attachment-kind";
import { cn } from "@/lib/utils";

export { classifyAttachment, isMediaKind };
export type { AttachmentKind };

export type AttachmentMeta = MessagingMessageDto["attachmentsMeta"][number];
export type InboxT = (key: string, values?: Record<string, string | number>) => string;

export function formatDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(size: number | null | undefined): string | null {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return null;
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

type FileDescriptor = { Icon: LucideIcon; typeLabelKey: string; accent: string };

export function describeFile(input: { mime?: string | null; fileName?: string | null }): FileDescriptor {
  const mime = input.mime?.toLowerCase() ?? "";
  const ext = (input.fileName?.split(".").pop() ?? "").toLowerCase();
  const has = (m: string, e: string[]) => mime.includes(m) || e.includes(ext);

  if (mime === "application/pdf" || ext === "pdf")
    return { Icon: FileText, typeLabelKey: "Inbox.fileTypePdf", accent: "text-red-500" };
  if (has("wordprocessingml", ["doc", "docx"]) || mime === "application/msword")
    return { Icon: FileText, typeLabelKey: "Inbox.fileTypeWord", accent: "text-blue-500" };
  if (has("spreadsheetml", ["xls", "xlsx", "csv"]) || mime === "application/vnd.ms-excel")
    return { Icon: FileSpreadsheet, typeLabelKey: "Inbox.fileTypeExcel", accent: "text-emerald-600" };
  if (has("presentationml", ["ppt", "pptx"]) || mime === "application/vnd.ms-powerpoint")
    return { Icon: Presentation, typeLabelKey: "Inbox.fileTypePowerpoint", accent: "text-orange-500" };
  if (mime.startsWith("image/"))
    return { Icon: FileImage, typeLabelKey: "Inbox.fileTypeImage", accent: "text-muted-foreground" };
  return { Icon: FileIcon, typeLabelKey: "Inbox.attachmentFile", accent: "text-muted-foreground" };
}

export function attachmentSubtitle(
  t: InboxT,
  input: { mime?: string | null; fileName?: string | null; size?: number | null },
): string {
  const { typeLabelKey } = describeFile(input);
  const size = formatBytes(input.size);
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
