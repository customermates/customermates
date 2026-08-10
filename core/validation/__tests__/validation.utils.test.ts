import type { $ZodRawIssue } from "zod/v4/core";

import { describe, expect, it } from "vitest";

import { createErrorHandler } from "../validation.utils";
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
