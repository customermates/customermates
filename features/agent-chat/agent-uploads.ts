import type { UIMessage } from "ai";

/**
 * Helpers for the user-uploaded-file feature, shared by the agent route. An upload
 * lives in the upload-store and is referenced from a chat message as a `file` part
 * whose `url` points at the tenant-guarded fetch route. These pure helpers turn the
 * message history into the set of available uploads (for the system-prompt manifest
 * and the run_code tool) and decide which uploads the model can "see" directly.
 */

const UPLOAD_URL_RE = /\/api\/v1\/sandbox\/uploads\/([A-Za-z0-9_-]+)/;

/** Extract the upload id from a file part's url, or null if it isn't an upload url. */
export function parseUploadId(url: string | undefined | null): string | null {
  if (!url) return null;
  const match = UPLOAD_URL_RE.exec(url);
  return match ? match[1] : null;
}

export type FileUIPartLike = { type: "file"; url?: string; mediaType?: string; filename?: string };

export function isFilePart(part: unknown): part is FileUIPartLike {
  return Boolean(part) && typeof part === "object" && (part as { type?: unknown }).type === "file";
}

export type UploadRef = { id: string; name: string; mediaType: string };

/**
 * Every distinct upload referenced by a user message in this conversation, in first
 * -seen order. The id comes from the upload url; the model never sets ids itself.
 */
export function extractUploadRefs(messages: UIMessage[]): UploadRef[] {
  const seen = new Set<string>();
  const refs: UploadRef[] = [];
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts ?? []) {
      if (!isFilePart(part)) continue;
      const id = parseUploadId(part.url);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      refs.push({ id, name: part.filename || id, mediaType: part.mediaType || "application/octet-stream" });
    }
  }
  return refs;
}

// MIME types the configured model (Anthropic) can read as native content blocks.
// Everything else is available only to the sandbox, never sent as a model file block
// (the provider rejects unsupported file blocks).
const VISION_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

export function isVisionMime(mime: string | undefined | null): boolean {
  return Boolean(mime) && VISION_MIME.has((mime as string).toLowerCase());
}

/** Reject path separators / traversal / control chars so an upload name can't escape
 * the workspace or break a downstream file write (a NUL throws in fs.writeFile). */
export function safeUploadName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  if (!base || base === "." || base === "..") return null;
  for (let i = 0; i < base.length; i++) if (base.charCodeAt(i) < 0x20) return null;
  return base;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
