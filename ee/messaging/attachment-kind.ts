import { z } from "zod";

export const AttachmentKindSchema = z.enum([
  "image",
  "gif",
  "video",
  "audio",
  "voice",
  "sticker",
  "unsupported",
  "post",
  "file",
]);
export type AttachmentKind = z.infer<typeof AttachmentKindSchema>;

type ClassifiableAttachment = {
  type?: string | null;
  mime?: string | null;
  sticker?: boolean | null;
  voiceNote?: boolean | null;
  gif?: boolean | null;
};

export function classifyAttachment(att: ClassifiableAttachment): AttachmentKind {
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

export const PREVIEW_KIND_LABEL: Record<AttachmentKind, string> = {
  image: "Inbox.previewPhoto",
  gif: "Inbox.previewGif",
  video: "Inbox.previewVideo",
  audio: "Inbox.previewAudio",
  voice: "Inbox.previewVoice",
  sticker: "Inbox.previewSticker",
  unsupported: "Inbox.previewUnsupported",
  post: "Inbox.previewPost",
  file: "Inbox.previewFile",
};
