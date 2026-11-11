import { describe, expect, it } from "vitest";

import { EVENT_VIA_NAME_MAX_LENGTH, EventViaSchema, eventVia, storedEventVia } from "../event-via";

describe("eventVia", () => {
  it("keeps the credential kind and the name it carries", () => {
    expect(eventVia("apiKey", "Zapier")).toEqual({ kind: "apiKey", name: "Zapier" });
    expect(eventVia("oauthApplication", "Claude Desktop")).toEqual({
      kind: "oauthApplication",
      name: "Claude Desktop",
    });
  });

  it("collapses whitespace and strips control and invisible characters from a name an application chose itself", () => {
    expect(eventVia("oauthApplication", "  ChatGPT\n\t ‮ connector\u0000 ")).toEqual({
      kind: "oauthApplication",
      name: "ChatGPT connector",
    });
  });

  it("cuts a long name at the limit without splitting a character", () => {
    const via = eventVia("oauthApplication", `${"a".repeat(EVENT_VIA_NAME_MAX_LENGTH - 3)}😀😀`);

    expect(via?.name).toBe(`${"a".repeat(EVENT_VIA_NAME_MAX_LENGTH - 3)}😀`);
    expect(via?.name.length).toBeLessThanOrEqual(EVENT_VIA_NAME_MAX_LENGTH);
    expect(EventViaSchema.safeParse(via).success).toBe(true);
  });

  it("records nothing for a credential without a usable name", () => {
    expect(eventVia("apiKey", null)).toBeNull();
    expect(eventVia("apiKey", undefined)).toBeNull();
    expect(eventVia("oauthApplication", " \n\u0000 ")).toBeNull();
  });
});

describe("storedEventVia", () => {
  it("reads a stored attribution and ignores anything else", () => {
    expect(storedEventVia({ kind: "apiKey", name: "Zapier" })).toEqual({ kind: "apiKey", name: "Zapier" });
    expect(storedEventVia(null)).toBeNull();
    expect(storedEventVia({ kind: "session", name: "Browser" })).toBeNull();
    expect(storedEventVia({ kind: "apiKey", name: "Zapier", token: "secret" })).toBeNull();
    expect(storedEventVia("Zapier")).toBeNull();
  });
});
