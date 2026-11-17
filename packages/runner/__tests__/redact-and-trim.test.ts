import { describe, expect, it } from "vitest";

import { REDACTED, redactText, redactValue } from "../src/redact.js";
import { EVENT_MAX_BYTES, trimEvent } from "../src/trim-event.js";

const RUNNER_TOKEN = `cmr_${"A1b2".repeat(11)}`.slice(0, 47);

describe("redaction", () => {
  it("removes every given secret from text, wherever it appears", () => {
    const text = `token=${RUNNER_TOKEN} and again ${RUNNER_TOKEN}, job key job-key-123456`;

    const result = redactText(text, [RUNNER_TOKEN, "job-key-123456"]);

    expect(result).toBe(`token=${REDACTED} and again ${REDACTED}, job key ${REDACTED}`);
  });

  it("removes anything shaped like a runner token or a bearer header even when it is not given", () => {
    expect(redactText(`seen ${RUNNER_TOKEN} here`)).toBe(`seen ${REDACTED} here`);
    expect(redactText("Authorization: Bearer abcdefghijklmnop12345")).toBe(`Authorization: ${REDACTED}`);
    expect(redactText("a short bearer word")).toBe("a short bearer word");
  });

  it("ignores secrets too short to be a secret instead of mangling the text", () => {
    expect(redactText("a b c abc", ["a", ""])).toBe("a b c abc");
  });

  it("redacts inside nested objects and arrays and leaves other values alone", () => {
    const event = {
      type: "tool_use",
      input: { headers: { "x-api-key": "job-key-123456" }, list: ["ok", "job-key-123456"], count: 2, flag: true },
      nothing: null,
    };

    expect(redactValue(event, ["job-key-123456"])).toEqual({
      type: "tool_use",
      input: { headers: { "x-api-key": REDACTED }, list: ["ok", REDACTED], count: 2, flag: true },
      nothing: null,
    });
    expect(JSON.stringify(event)).toContain("job-key-123456");
  });
});

describe("event trimming", () => {
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

  it("keeps an event of 4 KB or less exactly as it is", () => {
    const event = { type: "assistant", text: "x".repeat(1000) };

    expect(trimEvent(event)).toBe(event);
  });

  it("shortens long strings until the event fits in 4 KB and says so", () => {
    const event = { type: "assistant", message: { content: [{ type: "text", text: "y".repeat(20_000) }] } };

    const trimmed = trimEvent(event);

    expect(bytes(trimmed)).toBeLessThanOrEqual(EVENT_MAX_BYTES);
    expect(trimmed).toMatchObject({ type: "assistant", truncated: true });
    expect(JSON.stringify(trimmed)).toContain("y".repeat(100));
    expect(JSON.stringify(trimmed)).toContain("...");
  });

  it("counts bytes, not characters, so multi-byte text still ends up under the limit", () => {
    const event = { type: "assistant", text: "ä".repeat(4000) };

    const trimmed = trimEvent(event);

    expect(bytes(event)).toBeGreaterThan(EVENT_MAX_BYTES);
    expect(bytes(trimmed)).toBeLessThanOrEqual(EVENT_MAX_BYTES);
  });

  it("falls back to a marker with the event type when strings are not what makes it large", () => {
    const wide = Object.fromEntries(Array.from({ length: 800 }, (_, index) => [`key${index}`, index]));
    const event = { type: "state", ...wide };

    const trimmed = trimEvent(event);

    expect(trimmed).toEqual({ type: "state", truncated: true });
    expect(bytes(trimmed)).toBeLessThanOrEqual(EVENT_MAX_BYTES);
  });

  it("never lets an event without a type exceed the limit", () => {
    const trimmed = trimEvent({ items: Array.from({ length: 3000 }, (_, index) => index) });

    expect(trimmed).toEqual({ type: "event", truncated: true });
  });

  it("matches the server's measure: whatever it returns is stored as sent", () => {
    for (const size of [100, 3900, 4500, 100_000]) {
      const trimmed = trimEvent({ type: "assistant", text: "z".repeat(size) });
      expect(bytes(trimmed)).toBeLessThanOrEqual(EVENT_MAX_BYTES);
      expect(trimmed.type).toBe("assistant");
    }
  });
});
