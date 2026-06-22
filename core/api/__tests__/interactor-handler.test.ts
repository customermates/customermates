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

  it("maps Prisma P2025 (record not found) to 404", () => {
    const err = Object.assign(new Error("not found"), { code: "P2025" });
    const result = handleError(err) as any;
    expect(result.status).toBe(404);
    expect(result.body).toBe("The requested record was not found");
  });

  it("maps Prisma P2003 (foreign key) to 400", () => {
    const err = Object.assign(new Error("fk"), { code: "P2003" });
    const result = handleError(err) as any;
    expect(result.status).toBe(400);
  });

  it("maps Prisma P2002 (unique conflict) to 409", () => {
    const err = Object.assign(new Error("dup"), { code: "P2002" });
    const result = handleError(err) as any;
    expect(result.status).toBe(409);
  });

  it("maps Prisma P2023 (malformed id) to 400", () => {
    const err = Object.assign(new Error("bad uuid"), { code: "P2023" });
    const result = handleError(err) as any;
    expect(result.status).toBe(400);
  });

  it("re-throws a regular Error without a known Prisma code", () => {
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
