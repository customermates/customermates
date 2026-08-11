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

const BACKSLASH = String.fromCharCode(92);

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

    it.each([[BACKSLASH + "evil.example"], [BACKSLASH + BACKSLASH + "evil.example/hook"]])(
      "rejects the backslash spelling %j, which resolves to the same foreign host as the slash spelling",
      (input) => {
        expect(new URL(`https://${input}`).host).toBe("evil.example");
        expect(zx.secureUrl().safeParse(input).success).toBe(false);
      },
    );
  });

  describe("with allowRelativePath", () => {
    const schema = () => zx.secureUrl({ allowRelativePath: true });

    it.each([["/demo/avatars/photos/max-bergmann.png"], ["/evil"], ["/a/b/c.png?v=2"]])(
      "preserves the same-origin path %j verbatim",
      (input) => {
        expect(schema().safeParse(input)).toMatchObject({ success: true, data: input });
      },
    );

    it("preserves a protocol-relative URL verbatim, which resolves cross-origin exactly as it did before", () => {
      expect(schema().safeParse("//example.com/x.png")).toMatchObject({
        success: true,
        data: "//example.com/x.png",
      });
      expect(new URL("//example.com/x.png", "https://app.example.test/page").href).toBe("https://example.com/x.png");
    });

    it.each([
      ["/with space.png"],
      [`/with${String.fromCharCode(0)}nul.png`],
      [`/with${String.fromCharCode(10)}newline.png`],
    ])("rejects the unstorable path %j rather than persisting it", (input) => {
      expect(schema().safeParse(input).success).toBe(false);
    });

    it("rejects a backslash-leading value instead of prefixing it into a foreign host", () => {
      expect(schema().safeParse(`${BACKSLASH}evil.example`).success).toBe(false);
    });

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
