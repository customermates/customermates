/**
 * Safe response headers for serving user/sandbox-produced bytes back to the chat.
 *
 * The bytes (and their MIME) are attacker-influenceable — a user uploads files and
 * the model names output artifacts — so serving them inline same-origin with the
 * stored Content-Type is a stored-XSS vector (an uploaded .html/.svg would execute
 * JS in the app origin with the victim's session). Defenses, layered:
 *  - X-Content-Type-Options: nosniff           (no MIME sniffing)
 *  - CSP `default-src 'none'; sandbox`          (no script execution if rendered)
 *  - inline ONLY for an allowlist of safe preview types; everything else is forced
 *    to `attachment` + application/octet-stream so the browser downloads, never renders.
 */
const INLINE_SAFE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

export function safeServeHeaders(mime: string, name: string): Record<string, string> {
  const safe = INLINE_SAFE.has(mime.toLowerCase());
  const filename = name.replace(/[^\w.\-]/g, "_");
  return {
    "content-type": safe ? mime : "application/octet-stream",
    "content-disposition": `${safe ? "inline" : "attachment"}; filename="${filename}"`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "cache-control": "private, max-age=3600",
  };
}
