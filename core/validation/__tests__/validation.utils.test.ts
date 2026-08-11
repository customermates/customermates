import type { $ZodRawIssue } from "zod/v4/core";

import { describe, expect, it } from "vitest";

import { createErrorHandler, zx } from "../validation.utils";
import { CustomErrorCode } from "../validation.types";

describe("createErrorHandler", () => {
  it("interpolates every occurrence of a repeated placeholder", () => {
    const handler = createErrorHandler({
      [CustomErrorCode.customColumnTypeMismatch]: "Expected {actualType}; received {actualType}.",
    });

    const message = handler({
      code: "custom",
      input: undefined,
      path: [],
      params: {
        actualType: "text",
        error: CustomErrorCode.customColumnTypeMismatch,
      },
    } as $ZodRawIssue);

    expect(message).toBe("Expected text; received text.");
  });
});

describe("zx.secureUrl", () => {
  describe("by default", () => {
    it.each([
      ["example.com", "https://example.com"],
      ["  example.com  ", "https://example.com"],
      ["https://example.com/a.png", "https://example.com/a.png"],
      ["http://example.com", "http://example.com"],
      ["mailto:a@b.com", "mailto:a@b.com"],
      ["tel:+123", "tel:+123"],
    ])("accepts %j as %j", (input, expected) => {
      const result = zx.secureUrl().safeParse(input);

      expect(result).toMatchObject({ success: true, data: expected });
    });

    it.each([
      ["/demo/avatars/photos/max-bergmann.png"],
      ["/evil"],
      ["//example.com/x.png"],
      [""],
      ["   "],
      ["ftp://example.com"],
    ])("rejects %j", (input) => {
      expect(zx.secureUrl().safeParse(input).success).toBe(false);
    });

    it("reports a rejected path as a url format issue so it resolves to the localized invalidUrl message", () => {
      const result = zx.secureUrl().safeParse("/evil");

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues[0]).toMatchObject({ code: "invalid_format", format: "url" });
    });

    it("never rewrites a relative value into a different host", () => {
      for (const input of ["/evil", "/demo/avatars/photos/max-bergmann.png", "//example.com/x.png"])
        expect(zx.secureUrl().safeParse(input).success).toBe(false);
    });
  });

  describe("with allowRelativePath", () => {
    const schema = () => zx.secureUrl({ allowRelativePath: true });

    it.each([["/demo/avatars/photos/max-bergmann.png"], ["/evil"], ["/a/b/c.png?v=2"], ["//example.com/x.png"]])(
      "preserves the relative reference %j verbatim",
      (input) => {
        expect(schema().safeParse(input)).toMatchObject({ success: true, data: input });
      },
    );

    it.each([
      ["example.com", "https://example.com"],
      ["https://example.com/a.png", "https://example.com/a.png"],
      ["mailto:a@b.com", "mailto:a@b.com"],
      ["tel:+123", "tel:+123"],
    ])("still accepts %j as %j", (input, expected) => {
      expect(schema().safeParse(input)).toMatchObject({ success: true, data: expected });
    });

    it.each([[""], ["   "], ["ftp://example.com"], ["javascript:alert(1)"]])("rejects %j", (input) => {
      expect(schema().safeParse(input).success).toBe(false);
    });

    it("reports a rejection with the localized invalidUrl code", () => {
      const result = schema().safeParse("ftp://example.com");

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues[0]).toMatchObject({
        code: "custom",
        params: { error: CustomErrorCode.invalidUrl },
      });
    });
  });
});
