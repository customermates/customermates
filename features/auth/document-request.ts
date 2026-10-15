export function isDocumentRequest(headers: Headers): boolean {
  if (headers.has("next-action") || headers.get("rsc") === "1") return false;

  const mode = headers.get("sec-fetch-mode");
  return mode === null || mode === "navigate";
}
