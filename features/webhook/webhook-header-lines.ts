export function formatWebhookHeaderLines(headers: Record<string, string> | null | undefined): string {
  if (!headers) return "";

  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}

export function parseWebhookHeaderLines(text: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const separator = trimmed.indexOf(":");
    if (separator <= 0) continue;

    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (name.length === 0) continue;

    headers[name] = value;
  }

  return headers;
}
