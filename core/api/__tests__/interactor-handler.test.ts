import { describe, it, expect, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}));

import { z } from "zod";

import { handleError, interactorFailureResponse } from "../interactor-handler";

import { AuthError, DemoModeError, ForbiddenError, InvalidJsonBodyError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

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

  it("returns 400 for InvalidJsonBodyError", () => {
    const result = handleError(new InvalidJsonBodyError()) as any;
    expect(result.body).toBe("Invalid JSON body");
    expect(result.status).toBe(400);
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

describe("interactorFailureResponse", () => {
  it("returns an unclassified interactor failure as 400 with the prettified issues", () => {
    const error = new z.ZodError([
      { code: "invalid_type", expected: "string", path: ["name"], message: "Expected string" },
    ]);
    const result = interactorFailureResponse(error) as any;
    expect(result.status).toBe(400);
    expect(result.body).toBe(z.prettifyError(error));
  });

  it.each([
    [CustomErrorCode.notAuthenticated, 401],
    [CustomErrorCode.permissionDenied, 403],
    [CustomErrorCode.contactNotFound, 404],
    [CustomErrorCode.channelAlreadyLinked, 409],
    [CustomErrorCode.unipileRateLimit, 429],
    [CustomErrorCode.unipileProviderError, 422],
  ])("maps %s to HTTP %s", (customCode, status) => {
    const error = createZodError("Expected failure", ["id"], { error: customCode });
    const result = interactorFailureResponse(error) as any;
    expect(result.status).toBe(status);
    expect(result.body).toBe(z.prettifyError(error));
  });

  it.each([
    ["not_found", 404],
    ["conflict", 409],
    ["rate_limit", 429],
    ["unavailable", 422],
    ["authorization", 403],
  ])("maps a stamped %s kind to HTTP %s", (kind, status) => {
    const error = createZodError("Expected failure", [], { error: CustomErrorCode.salesNavigatorNotAvailable, kind });
    expect((interactorFailureResponse(error) as any).status).toBe(status);
  });
});
