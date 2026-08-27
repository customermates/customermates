import { describe, expect, it } from "vitest";

import { redactUnexpectedError } from "../redact-unexpected-error";

describe("redactUnexpectedError", () => {
  it("keeps diagnostic stack frames without retaining the original message or cause", () => {
    const redacted = redactUnexpectedError(
      new Error("postgres password=do-not-disclose\n    at SYNTHETIC_PRIVATE_INNER_MARKER (/tmp/provider.js:1:1)", {
        cause: new Error("nested-secret"),
      }),
      "The operation could not be completed.",
    );

    expect(redacted.message).toBe("The operation could not be completed.");
    expect(redacted.cause).toBeUndefined();
    expect(redacted.stack).toContain("redact-unexpected-error.test.ts");
    expect(redacted.stack).not.toContain("do-not-disclose");
    expect(redacted.stack).not.toContain("SYNTHETIC_PRIVATE_INNER_MARKER");
    expect(redacted.stack).not.toContain("nested-secret");
  });

  it("returns a stable error for non-Error values", () => {
    const redacted = redactUnexpectedError({ password: "do-not-disclose" }, "Safe failure.");

    expect(redacted.message).toBe("Safe failure.");
    expect(JSON.stringify(redacted)).not.toContain("do-not-disclose");
  });
});
