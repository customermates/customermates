import DOMPurify from "dompurify";

export function sanitizeHtml(html: string, config?: Record<string, unknown>): string {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html, (config ?? {}) as never) as unknown as string;
}
