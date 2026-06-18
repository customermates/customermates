import { describe, it, expect, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}));

import { handleError } from "../interactor-handler";

import { AuthError, ForbiddenError, DemoModeError } from "@/core/errors/app-errors";

describe("handleError", () => {
  it("returns 401 for AuthError", () => {
    const result = handleError(new AuthError()) as any;
    expect(result.body).toBe("Not authenticated");
    expect(result.status).toBe(401);
  });

  it("returns 403 for ForbiddenError", () => {
    const result = handleError(new ForbiddenError()) as any;
    expect(result.body).toBe("Not authorized");
    expect(result.status).toBe(403);
  });

  it("returns 403 for DemoModeError", () => {
    const result = handleError(new DemoModeError()) as any;
    expect(result.status).toBe(403);
  });

  it("re-throws a regular Error", () => {
    const err = new Error("unexpected");
    expect(() => handleError(err)).toThrow("unexpected");
  });

  it("wraps a non-Error value in an Error and throws", () => {
    expect(() => handleError("string-error")).toThrow("Unexpected non-Error thrown");
  });

  it("wraps null in an Error and throws", () => {
    expect(() => handleError(null)).toThrow("Unexpected non-Error thrown");
  });

  it("wraps a number in an Error and throws", () => {
    expect(() => handleError(42)).toThrow("Unexpected non-Error thrown");
  });
});
