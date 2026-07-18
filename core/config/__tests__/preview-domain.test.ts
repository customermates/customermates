import { describe, expect, it } from "vitest";

import { normalizePreviewDomain, resolvePreviewDomain } from "../preview-domain";

describe("Preview domains", () => {
  it("uses concise sandbox names and collision-free engineering names", () => {
    expect(resolvePreviewDomain("sandbox/rewe", "customermates.com")?.hostname).toBe("rewe.customermates.com");
    expect(resolvePreviewDomain("feat/add-inbox", "customermates.com")?.hostname).toBe(
      "feat-add-inbox.customermates.com",
    );
    expect(resolvePreviewDomain("fix/add-inbox", "customermates.com")?.hostname).toBe(
      "fix-add-inbox.customermates.com",
    );
    expect(resolvePreviewDomain("test/login-flow", "customermates.com")?.hostname).toBe(
      "test-login-flow.customermates.com",
    );
  });

  it("rejects reserved, nested, ambiguous, malformed, and oversized names", () => {
    for (const branch of [
      "main",
      "sandbox/demo",
      "sandbox/feat-rewe",
      "feat/add/inbox",
      "feat/Add-Inbox",
      "feat/add_inbox",
      "feat/xn--preview",
      `feature/${"a".repeat(60)}`,
    ])
      expect(resolvePreviewDomain(branch, "customermates.com")).toBeNull();
  });

  it("accepts only plain lowercase DNS root domains", () => {
    expect(normalizePreviewDomain("customermates.com")).toBe("customermates.com");
    for (const domain of ["CUSTOMERMATES.com", "*.customermates.com", "customermates.com.", "localhost", "xn--x.com"])
      expect(() => normalizePreviewDomain(domain)).toThrow("PREVIEW_DOMAIN");
  });
});
