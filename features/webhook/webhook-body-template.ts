export const WEBHOOK_BODY_TEMPLATE_MAX_CHARS = 8192;
export const WEBHOOK_RENDERED_BODY_MAX_CHARS = 131072;

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

export type RenderedWebhookBody =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; reason: "unrenderable" | "invalidJson" | "notAnObject" | "tooLarge" };

export const WEBHOOK_TEMPLATE_SAMPLE_ENVELOPE = {
  event: "contact.created",
  data: {
    userId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    entityId: "00000000-0000-4000-8000-000000000003",
    payload: { id: "00000000-0000-4000-8000-000000000003", firstName: "Ada", lastName: "Lovelace" },
  },
  timestamp: "2026-01-01T00:00:00.000Z",
} as const;

function resolvePath(source: unknown, path: string): unknown {
  let current = source;

  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function toEscapedReplacement(value: unknown): string {
  if (value === undefined || value === null) return "";

  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (raw === undefined) return "";

  return JSON.stringify(raw).slice(1, -1);
}

export function renderWebhookBody(template: string, envelope: unknown): RenderedWebhookBody {
  let rendered: string;

  try {
    rendered = template.replace(PLACEHOLDER_PATTERN, (_match, path: string) =>
      toEscapedReplacement(resolvePath(envelope, path)),
    );
  } catch {
    return { ok: false, reason: "unrenderable" };
  }

  if (rendered.length > WEBHOOK_RENDERED_BODY_MAX_CHARS) return { ok: false, reason: "tooLarge" };

  let parsed: unknown;

  try {
    parsed = JSON.parse(rendered);
  } catch {
    return { ok: false, reason: "invalidJson" };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    return { ok: false, reason: "notAnObject" };

  return { ok: true, body: parsed as Record<string, unknown> };
}

export function isRenderableWebhookBodyTemplate(template: string): boolean {
  return renderWebhookBody(template, WEBHOOK_TEMPLATE_SAMPLE_ENVELOPE).ok;
}
