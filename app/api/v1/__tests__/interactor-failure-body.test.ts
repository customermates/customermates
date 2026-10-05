import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { AuthError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({ mutate: vi.fn(), read: vi.fn() }));

vi.mock("@/core/di", () => ({
  getMutateRecordInteractor: () => ({ invoke: interactors.mutate }),
  getGetRecordInteractor: () => ({ invoke: interactors.read }),
}));

import { POST as mutate } from "../records/mutate/route";
import { POST as read } from "../records/read/route";

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:4105/api/v1/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "test-transport-only",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("record REST failure bodies", () => {
  it.each([CustomErrorCode.recordVersionChanged, CustomErrorCode.recordSchemaChanged])(
    "returns %s as a structured conflict",
    async (code) => {
      interactors.mutate.mockResolvedValue({
        ok: false,
        error: createZodError("Localized prose", ["mutation", "expectedVersion"], { error: code, kind: "conflict" }),
      });

      const response = await mutate(request("records/mutate", {}));

      expect(response.status).toBe(409);
      const body: unknown = await response.json();
      expect(StructuredErrorResponseSchema.parse(body)).toEqual({
        error: {
          kind: "conflict",
          issues: [
            {
              code: "custom",
              path: ["mutation", "expectedVersion"],
              message: "Localized prose",
              customCode: code,
            },
          ],
        },
      });
    },
  );

  it("returns not found, malformed JSON and authentication failures in the same shape", async () => {
    interactors.read.mockResolvedValue({
      ok: false,
      error: createZodError("Missing", [], {
        error: CustomErrorCode.recordNotFound,
        kind: "not_found",
      }),
    });
    const missing = await read(request("records/read", {}));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: {
        kind: "not_found",
        issues: [{ customCode: CustomErrorCode.recordNotFound }],
      },
    });

    const malformed = await read(request("records/read", "{"));
    expect(malformed.status).toBe(400);
    expect(StructuredErrorResponseSchema.parse(await malformed.json())).toMatchObject({
      error: {
        kind: "validation",
        issues: [{ customCode: CustomErrorCode.invalidJsonBody }],
      },
    });

    interactors.read.mockRejectedValue(new AuthError());
    const unauthenticated = await read(request("records/read", {}));
    expect(unauthenticated.status).toBe(401);
    expect(StructuredErrorResponseSchema.parse(await unauthenticated.json())).toMatchObject({
      error: {
        kind: "authentication",
        issues: [{ customCode: CustomErrorCode.notAuthenticated }],
      },
    });
  });
});
