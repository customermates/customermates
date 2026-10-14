import { describe, expect, it } from "vitest";

import { contactHref } from "../contact-href";

describe("contact targets", () => {
  it("open valid email, phone and web values", () => {
    expect(contactHref("email", " person+tag@example.test ")).toBe("mailto:person+tag@example.test");
    expect(contactHref("phone", "+49 (151) 123-45678")).toBe("tel:+4915112345678");
    expect(contactHref("url", "https://example.test/path?q=1#top")).toBe("https://example.test/path?q=1#top");
    expect(contactHref("url", "example.test")).toBe("https://example.test");
  });

  it("never build a target from an unsafe or malformed value", () => {
    for (const value of [
      "",
      "  ",
      "javascript:alert(1)",
      "data:text/html,hi",
      "mailto:person@example.test",
      "not a url",
    ])
      expect(contactHref("url", value)).toBeNull();
    for (const value of ["person@example.test?bcc=other@example.test", "person", "a@b\nc"])
      expect(contactHref("email", value)).toBeNull();
    for (const value of ["+", "++123", "123;456", "abc"]) expect(contactHref("phone", value)).toBeNull();
  });
});
