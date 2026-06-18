import DOMPurify from "dompurify";

/**
 * Browser-only HTML sanitiser. There is no DOM on the server, so this returns "" there — which also
 * means importing it never pulls jsdom (and its ESM-only transitive deps) into the server bundle.
 * Call it client-side, after mount, to get sanitized HTML.
 */
export function sanitizeHtml(html: string, config?: Record<string, unknown>): string {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html, (config ?? {}) as never) as unknown as string;
}
