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

import {
  handleError,
  interactorFailureResponse,
  StructuredErrorResponseSchema,
} from "../structured-interactor-handler";

import { AuthError, DemoModeError, ForbiddenError, InvalidJsonBodyError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError, serializeInteractorFailure } from "@/core/validation/validation.utils";

type Result = { body: unknown; status: number };

function structured(result: unknown) {
  const { body, status } = result as Result;
  return { status, error: StructuredErrorResponseSchema.parse(body).error };
}

describe("handleError", () => {
  it.each([
    ["AuthError", new AuthError(), 401, "authentication", CustomErrorCode.notAuthenticated, "Not authenticated"],
    ["ForbiddenError", new ForbiddenError(), 403, "authorization", CustomErrorCode.permissionDenied, "Not authorized"],
    ["DemoModeError", new DemoModeError(), 403, "authorization", CustomErrorCode.demoMode, undefined],
    [
      "InvalidJsonBodyError",
      new InvalidJsonBodyError(),
      400,
      "validation",
      CustomErrorCode.invalidJsonBody,
      "Invalid JSON body",
    ],
  ])("returns %s as a structured %s failure", (_name, source, status, kind, customCode, message) => {
    const result = structured(handleError(source));
    expect(result.status).toBe(status);
    expect(result.error.kind).toBe(kind);
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]).toMatchObject({ path: [], customCode });
    if (message) expect(result.error.issues[0]?.message).toBe(message);
  });

  it.each([
    ["P2025", 404, "not_found", "The requested record was not found"],
    ["P2003", 400, "validation", "A referenced record was not found"],
    ["P2002", 409, "conflict", "That value conflicts with an existing record"],
    ["P2023", 400, "validation", "Invalid identifier"],
    ["P2024", 429, "rate_limit", "The service is busy. Retry the request shortly."],
    ["P2028", 429, "rate_limit", "The service is busy. Retry the request shortly."],
  ])("maps Prisma %s to a structured HTTP %s", (code, status, kind, message) => {
    const result = structured(handleError(Object.assign(new Error("prisma"), { code })));
    expect(result).toEqual({ status, error: { kind, issues: [{ code: "custom", path: [], message }] } });
  });

  it.each([
    [
      "a raw query",
      Object.assign(new Error("raw"), {
        code: "P2010",
        meta: { driverAdapterError: { cause: { originalCode: "55P03" } } },
      }),
    ],
    ["a model query", Object.assign(new Error("adapter"), { cause: { originalCode: "55P03", kind: "postgres" } })],
    ["the database driver", Object.assign(new Error("lock timeout"), { code: "55P03" })],
  ])("maps a lock timeout raised by %s to a structured HTTP 429", (_source, error) => {
    expect(structured(handleError(error))).toEqual({
      status: 429,
      error: {
        kind: "rate_limit",
        issues: [{ code: "custom", path: [], message: "The service is busy. Retry the request shortly." }],
      },
    });
  });

  it("re-throws a regular Error without a known Prisma code", () => {
    expect(() => handleError(new Error("unexpected"))).toThrow("unexpected");
  });

  it.each([["string-error"], [null], [42]])("wraps the non-Error value %s in an Error and throws", (value) => {
    expect(() => handleError(value)).toThrow("Unexpected non-Error thrown");
  });
});

describe("interactorFailureResponse", () => {
  it("returns an unclassified interactor failure as a 400 validation failure with its issues", () => {
    const error = new z.ZodError([
      { code: "invalid_type", expected: "string", path: ["name"], message: "Expected string" },
    ]);
    const result = structured(interactorFailureResponse(error));
    expect(result.status).toBe(400);
    expect(result.error).toEqual(serializeInteractorFailure(error));
    expect(result.error.kind).toBe("validation");
    expect(result.error.issues[0]?.path).toEqual(["name"]);
  });

  it.each([
    [CustomErrorCode.notAuthenticated, 401],
    [CustomErrorCode.permissionDenied, 403],
    [CustomErrorCode.webhookNotFound, 404],
    [CustomErrorCode.channelAlreadyLinked, 409],
    [CustomErrorCode.unipileRateLimit, 429],
    [CustomErrorCode.unipileProviderError, 422],
  ])("maps %s to HTTP %s", (customCode, status) => {
    const error = createZodError("Expected failure", ["id"], { error: customCode });
    const result = structured(interactorFailureResponse(error));
    expect(result.status).toBe(status);
    expect(result.error).toEqual(serializeInteractorFailure(error));
    expect(result.error.issues[0]?.customCode).toBe(customCode);
  });

  it.each([
    ["not_found", 404],
    ["conflict", 409],
    ["rate_limit", 429],
    ["unavailable", 422],
    ["authorization", 403],
  ])("maps a stamped %s kind to HTTP %s", (kind, status) => {
    const error = createZodError("Expected failure", [], { error: CustomErrorCode.salesNavigatorNotAvailable, kind });
    const result = structured(interactorFailureResponse(error));
    expect(result.status).toBe(status);
    expect(result.error.kind).toBe(kind);
  });
});
