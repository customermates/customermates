import { describe, it, expect } from "vitest";

import {
  AuthError,
  ForbiddenError,
  DemoModeError,
  WebhookExternalFailure,
  WebhookNonRetryableFailure,
  isExpectedError,
} from "../app-errors";

describe("AuthError", () => {
  it("defaults to 401 with default message", () => {
    const err = new AuthError();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Not authenticated");
    expect(err.name).toBe("AuthError");
  });

  it("accepts a custom message", () => {
    const err = new AuthError("Token expired");
    expect(err.message).toBe("Token expired");
    expect(err.statusCode).toBe(401);
  });

  it("is an instance of Error", () => {
    expect(new AuthError()).toBeInstanceOf(Error);
  });
});

describe("ForbiddenError", () => {
  it("defaults to 403 with default message", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Not authorized");
    expect(err.name).toBe("ForbiddenError");
  });

  it("accepts a custom message", () => {
    const err = new ForbiddenError("Insufficient permissions");
    expect(err.message).toBe("Insufficient permissions");
    expect(err.statusCode).toBe(403);
  });

  it("is an instance of Error", () => {
    expect(new ForbiddenError()).toBeInstanceOf(Error);
  });
});

describe("DemoModeError", () => {
  it("defaults to 403 with demo mode message", () => {
    const err = new DemoModeError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain("demo mode");
    expect(err.name).toBe("DemoModeError");
  });

  it("is an instance of Error", () => {
    expect(new DemoModeError()).toBeInstanceOf(Error);
  });
});

describe("isExpectedError", () => {
  it("recognizes expected error instances", () => {
    expect(isExpectedError(new AuthError())).toBe(true);
    expect(isExpectedError(new ForbiddenError())).toBe(true);
    expect(isExpectedError(new DemoModeError())).toBe(true);
    expect(isExpectedError(new WebhookExternalFailure(503, "down"))).toBe(true);
    expect(isExpectedError(new WebhookNonRetryableFailure(405, "Method Not Allowed"))).toBe(true);
  });

  it("recognizes webhook failures flattened to FatalError across the workflow boundary, by message", () => {
    expect(
      isExpectedError({
        name: "FatalError",
        message: "Webhook target responded 405 Method Not Allowed (non-retryable)",
      }),
    ).toBe(true);
    expect(isExpectedError({ name: "FatalError", message: "Webhook target responded 503 down" })).toBe(true);
  });

  it("does NOT suppress a genuine bug flattened to FatalError on workflow replay", () => {
    expect(isExpectedError({ name: "FatalError", message: "Test workflow error from background job" })).toBe(false);
    expect(isExpectedError({ name: "FatalError", message: "Cannot read properties of undefined" })).toBe(false);
  });

  it("does not suppress genuinely unexpected errors", () => {
    expect(isExpectedError(new Error("boom"))).toBe(false);
    expect(isExpectedError({ name: "TypeError", message: "x is not a function" })).toBe(false);
    expect(isExpectedError(null)).toBe(false);
    expect(isExpectedError("just a string")).toBe(false);
  });
});
