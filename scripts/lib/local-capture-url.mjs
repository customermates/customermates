const LOCAL_CAPTURE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Fail closed before a browser is launched: product proof must only ever read a
 * developer-owned local instance, never a hosted demo or production surface.
 *
 * @param {string} value
 * @returns {string}
 */
export function assertLocalCaptureUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error("capture URL must be a non-empty URL without surrounding whitespace");
  }

  if (value.includes("\\")) {
    throw new Error("capture URL must not contain backslashes");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("capture URL must be a valid absolute URL");
  }

  if (parsed.protocol !== "http:") {
    throw new Error("capture URL must use http:");
  }

  // Reject even an empty userinfo marker (`http://@localhost`) rather than
  // relying only on URL.username/password, which normalize it away.
  const authority = value.match(/^http:\/\/([^/?#]*)/i)?.[1];
  if (!authority || authority.includes("@") || parsed.username || parsed.password) {
    throw new Error("capture URL must not contain credentials");
  }

  const rawHost = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1)
    : authority.split(":", 1)[0];

  // Check the literal host too. WHATWG URL parsing canonicalizes values such
  // as 127.1 and 2130706433 to 127.0.0.1, but the capture contract permits only
  // the three explicit local spellings below.
  if (!LOCAL_CAPTURE_HOSTS.has(rawHost.toLowerCase())) {
    throw new Error("capture URL host must be localhost, 127.0.0.1, or [::1]");
  }

  return value;
}
