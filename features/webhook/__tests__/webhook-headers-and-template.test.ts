import { describe, expect, it } from "vitest";

import {
  WEBHOOK_HEADER_MAX_COUNT,
  WEBHOOK_HEADER_VALUE_MAX_CHARS,
  WebhookHeadersSchema,
  allowsCredentialedHeaders,
  isReservedWebhookHeader,
  parseStoredWebhookHeaders,
} from "../webhook-headers";
import {
  WEBHOOK_TEMPLATE_SAMPLE_ENVELOPE,
  isRenderableWebhookBodyTemplate,
  renderWebhookBody,
} from "../webhook-body-template";

const ENVELOPE = {
  event: "contact.created",
  data: {
    userId: "user-1",
    companyId: "company-1",
    entityId: "entity-1",
    payload: { firstName: 'Ada "Countess"', tags: ["a", "b"], score: 7 },
  },
  timestamp: "2026-01-01T00:00:00.000Z",
};

describe("WebhookHeadersSchema", () => {
  it("accepts ordinary authentication headers", () => {
    const result = WebhookHeadersSchema.safeParse({
      Authorization: "Bearer sk-ant-oat01-abc",
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
    });

    expect(result.success).toBe(true);
  });

  it.each(["content-type", "Content-Type", "HOST", "x-webhook-signature", "Content-Length"])(
    "rejects the reserved header %s",
    (name) => {
      expect(isReservedWebhookHeader(name)).toBe(true);
      expect(WebhookHeadersSchema.safeParse({ [name]: "anything" }).success).toBe(false);
    },
  );

  it("rejects a header name that is not an HTTP token", () => {
    expect(WebhookHeadersSchema.safeParse({ "Bad Header": "v" }).success).toBe(false);
    expect(WebhookHeadersSchema.safeParse({ "X-Inject\r\nEvil": "v" }).success).toBe(false);
  });

  it("rejects a value carrying a CRLF injection attempt", () => {
    expect(WebhookHeadersSchema.safeParse({ "X-Trace": "ok\r\nX-Evil: 1" }).success).toBe(false);
  });

  it("rejects more headers than the cap allows", () => {
    const many = Object.fromEntries(
      Array.from({ length: WEBHOOK_HEADER_MAX_COUNT + 1 }, (_value, index) => [`X-H${index}`, "v"]),
    );

    expect(WebhookHeadersSchema.safeParse(many).success).toBe(false);
  });

  it("rejects a value that fetch could not put on the wire", () => {
    for (const value of ["\u20ac", "\u0100", "\u2603", "\ud83d\ude00", "\u0080"])
      expect(WebhookHeadersSchema.safeParse({ "X-K": value }).success).toBe(false);
  });

  it("accepts Latin-1 text that fetch can put on the wire", () => {
    for (const value of ["Bearer abc.123-_~", "caf\u00e9", "\u00ff", "\u00a0"])
      expect(WebhookHeadersSchema.safeParse({ "X-K": value }).success).toBe(true);
  });

  it("rejects an oversized value", () => {
    expect(WebhookHeadersSchema.safeParse({ "X-Big": "v".repeat(WEBHOOK_HEADER_VALUE_MAX_CHARS + 1) }).success).toBe(
      false,
    );
  });

  it("reports issues at the field root so the form can mark it invalid", () => {
    const result = WebhookHeadersSchema.safeParse({ "Content-Type": "text/plain", "X-Trace": "ok\r\nevil" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      for (const issue of result.error.issues) expect(issue.path).toEqual([]);
    }
  });

  it("drops unusable entries when reading stored headers", () => {
    const parsed = parseStoredWebhookHeaders({
      "X-Keep": "kept",
      "Content-Type": "text/plain",
      "Bad Name": "dropped",
      "X-Number": 7,
    });

    expect(parsed).toEqual({ "X-Keep": "kept" });
  });

  it("returns an empty map for non-object stored values", () => {
    expect(parseStoredWebhookHeaders(null)).toEqual({});
    expect(parseStoredWebhookHeaders(["a"])).toEqual({});
    expect(parseStoredWebhookHeaders("nope")).toEqual({});
  });
});

describe("allowsCredentialedHeaders", () => {
  it.each(["https://hooks.example.com/x", "http://localhost:3000/x", "http://127.0.0.1:9/x"])("allows %s", (url) => {
    expect(allowsCredentialedHeaders(url)).toBe(true);
  });

  it.each(["http://hooks.example.com/x", "http://10.0.0.5/x", "ftp://example.com", "not a url"])(
    "refuses %s",
    (url) => {
      expect(allowsCredentialedHeaders(url)).toBe(false);
    },
  );
});

describe("renderWebhookBody", () => {
  it("substitutes scalar placeholders", () => {
    const result = renderWebhookBody('{"text": "{{event}} at {{timestamp}}"}', ENVELOPE);

    expect(result).toEqual({ ok: true, body: { text: "contact.created at 2026-01-01T00:00:00.000Z" } });
  });

  it("resolves a nested path", () => {
    const result = renderWebhookBody('{"id": "{{data.entityId}}"}', ENVELOPE);

    expect(result.ok && result.body).toEqual({ id: "entity-1" });
  });

  it("escapes quotes so record content cannot break out of the document", () => {
    const result = renderWebhookBody('{"text": "{{data.payload.firstName}}"}', ENVELOPE);

    expect(result.ok && result.body).toEqual({ text: 'Ada "Countess"' });
  });

  it("cannot be used to inject an extra key", () => {
    const hostile = { ...ENVELOPE, event: '", "injected": "yes' };
    const result = renderWebhookBody('{"text": "{{event}}"}', hostile);

    expect(result.ok && result.body).toEqual({ text: '", "injected": "yes' });
  });

  it("serialises an object placeholder as a JSON string", () => {
    const result = renderWebhookBody('{"text": "{{data.payload}}"}', ENVELOPE);

    expect(result.ok && JSON.parse((result.body as { text: string }).text)).toEqual(ENVELOPE.data.payload);
  });

  it("renders a missing path as an empty string", () => {
    const result = renderWebhookBody('{"text": "{{data.nope.deeper}}"}', ENVELOPE);

    expect(result.ok && result.body).toEqual({ text: "" });
  });

  it("reports a template that renders invalid JSON", () => {
    expect(renderWebhookBody('{"text": {{event}}}', ENVELOPE)).toEqual({ ok: false, reason: "invalidJson" });
  });

  it("reports a template that renders a non-object", () => {
    expect(renderWebhookBody('"{{event}}"', ENVELOPE)).toEqual({ ok: false, reason: "notAnObject" });
    expect(renderWebhookBody('["{{event}}"]', ENVELOPE)).toEqual({ ok: false, reason: "notAnObject" });
  });

  it("validates a template against the sample envelope", () => {
    expect(isRenderableWebhookBodyTemplate('{"text": "{{event}} {{data.payload.firstName}}"}')).toBe(true);
    expect(isRenderableWebhookBodyTemplate('{"text": {{event}}}')).toBe(false);
    expect(isRenderableWebhookBodyTemplate("not json at all")).toBe(false);
  });

  it("exposes a sample envelope shaped like a real delivery", () => {
    expect(Object.keys(WEBHOOK_TEMPLATE_SAMPLE_ENVELOPE)).toEqual(["event", "data", "timestamp"]);
    expect(Object.keys(WEBHOOK_TEMPLATE_SAMPLE_ENVELOPE.data)).toEqual(["userId", "companyId", "entityId", "payload"]);
  });
});
