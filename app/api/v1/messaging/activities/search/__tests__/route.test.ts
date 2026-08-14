import type { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/core/di", () => ({
  getGetActivitiesApiInteractor: () => ({ invoke }),
}));

import { POST } from "../route";

function request(payload: unknown): NextRequest {
  return { json: () => Promise.resolve(payload) } as unknown as NextRequest;
}

describe("activity search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockResolvedValue({
      ok: true,
      data: {
        availableSources: ["audit"],
        items: [],
        pageLimitReached: false,
        scopeTruncated: false,
      },
    });
  });

  it("forwards the request body to the API interactor", async () => {
    const payload = {
      filters: [
        {
          field: FilterFieldKey.contactIds,
          operator: FilterOperatorKey.hasSome,
        },
      ],
      pagination: { page: 1, pageSize: 25 },
    };

    const response = await POST(request(payload));

    expect(response.status).toBe(200);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(payload);
    expect(await response.json()).toMatchObject({
      availableSources: ["audit"],
      items: [],
    });
  });

  it("returns a 400 when the interactor rejects a valid payload", async () => {
    const error = z.object({ allowed: z.boolean() }).safeParse({ allowed: "no" }).error;
    invoke.mockResolvedValueOnce({
      ok: false,
      error,
    });

    const response = await POST(request({}));

    expect(response.status).toBe(400);
    expect(invoke).toHaveBeenCalledExactlyOnceWith({});
  });
});
