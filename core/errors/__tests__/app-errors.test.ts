import { describe, it, expect } from "vitest";

import {
  AuthError,
  ForbiddenError,
  DemoModeError,
  DEMO_MODE_MESSAGE,
  WebhookExternalFailure,
  WebhookNonRetryableFailure,
  isExpectedError,
  appErrorResponse,
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

  it("recognizes a DemoModeError that lost its class identity across a serialization boundary, by message", () => {
    expect(isExpectedError({ name: "Error", message: DEMO_MODE_MESSAGE })).toBe(true);
    expect(isExpectedError(new Error(DEMO_MODE_MESSAGE))).toBe(true);
  });

  it("recognizes an AppError from a DIFFERENT bundle copy via the Symbol.for brand (prototype instanceof fails across duplicated chunks)", () => {
    const brand = Symbol.for("customermates.appError");
    const foreignDemo = { [brand]: true, name: "DemoModeError", statusCode: 403, message: DEMO_MODE_MESSAGE };
    const foreignAuth = { [brand]: true, name: "AuthError", statusCode: 401, message: "Not authenticated" };
    expect(foreignDemo instanceof DemoModeError).toBe(true);
    expect(isExpectedError(foreignDemo)).toBe(true);
    expect(isExpectedError(foreignAuth)).toBe(true);
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

describe("appErrorResponse", () => {
  it("maps a real AppError to its message + status", () => {
    expect(appErrorResponse(new DemoModeError())).toEqual({ message: DEMO_MODE_MESSAGE, statusCode: 403 });
    expect(appErrorResponse(new AuthError())).toEqual({ message: "Not authenticated", statusCode: 401 });
  });

  it("maps an AppError from a different bundle copy via the Symbol.for brand (prototype instanceof would fail)", () => {
    const brand = Symbol.for("customermates.appError");
    const foreign = { [brand]: true, name: "ForbiddenError", statusCode: 403, message: "Not authorized" };
    expect(appErrorResponse(foreign)).toEqual({ message: "Not authorized", statusCode: 403 });
  });

  it("returns null for non-AppError values", () => {
    expect(appErrorResponse(new Error("boom"))).toBeNull();
    expect(appErrorResponse(null)).toBeNull();
  });
});
