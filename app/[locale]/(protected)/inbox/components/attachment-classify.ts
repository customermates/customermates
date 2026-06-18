import { File as FileIcon, FileImage, FileSpreadsheet, FileText, type LucideIcon, Presentation } from "lucide-react";

import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { cn } from "@/lib/utils";

export type AttachmentMeta = MessagingMessageDto["attachmentsMeta"][number];
export type InboxT = (key: string, values?: Record<string, string | number>) => string;

export type AttachmentKind =
  | "image"
  | "gif"
  | "video"
  | "audio"
  | "voice"
  | "sticker"
  | "unsupported"
  | "post"
  | "file";

export function classifyAttachment(att: AttachmentMeta): AttachmentKind {
  if (att.sticker) return "sticker";
  if (att.voiceNote) return "voice";
  if (att.gif) return "gif";
  const type = att.type?.toLowerCase() ?? "";
  const mime = att.mime?.toLowerCase() ?? "";
  if (type === "unsupported") return "unsupported";
  if (type === "linkedin_post") return "post";
  if (type === "img" || mime.startsWith("image/")) return "image";
  if (type === "video" || mime.startsWith("video/")) return "video";
  if (type === "audio" || mime.startsWith("audio/")) return "audio";
  return "file";
}

export function isMediaKind(kind: AttachmentKind): boolean {
  return (
    kind === "image" || kind === "gif" || kind === "video" || kind === "voice" || kind === "audio" || kind === "sticker"
  );
}

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

export function describeFile(att: AttachmentMeta): FileDescriptor {
  const mime = att.mime?.toLowerCase() ?? "";
  const ext = (att.fileName?.split(".").pop() ?? "").toLowerCase();
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

/** The shared message-bubble shell — single source of truth for color/radius/shadow/direction. */
export function bubbleClass(isOutbound: boolean, extra?: string) {
  return cn(
    "inline-flex max-w-full items-center gap-2 rounded-xl px-3.5 py-2 text-sm leading-relaxed shadow-xs",
    isOutbound ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm",
    extra,
  );
}

export function attachmentProxyUrl(messageId: string, attachmentId: string): string {
  return `/api/messaging/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}`;
}
