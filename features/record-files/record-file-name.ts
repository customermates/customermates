export const RECORD_FILE_NAME_MAX_LENGTH = 255;
export const DEFAULT_RECORD_FILE_MIME_TYPE = "application/octet-stream";

const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;

function truncateKeepingExtension(name: string): string {
  const characters = [...name];
  if (characters.length <= RECORD_FILE_NAME_MAX_LENGTH) return name;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? [...name.slice(dot)] : [];
  if (!extension.length || extension.length > 16) return characters.slice(0, RECORD_FILE_NAME_MAX_LENGTH).join("");
  return [...characters.slice(0, RECORD_FILE_NAME_MAX_LENGTH - extension.length), ...extension].join("");
}

export function sanitizeRecordFileName(name: string): string | null {
  const base = name.split(/[/\\]/u).at(-1) ?? "";
  const cleaned = base.replace(UNSAFE_CHARACTERS, "").replace(/\s+/gu, " ").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return null;
  return truncateKeepingExtension(cleaned).trim();
}

export function normalizeRecordFileMimeType(mimeType: string): string {
  const bare = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_TYPE.test(bare) ? bare : DEFAULT_RECORD_FILE_MIME_TYPE;
}
