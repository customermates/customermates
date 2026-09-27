import type { z } from "zod";

import { describe, expect, it } from "vitest";

import { FilterSchema, GetQueryParamsApiSchema, GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { DataViewStateWireSchema } from "@/core/data-view/data-view-state.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureStatus } from "@/core/validation/validation.utils";
import { ExportRequestSchema } from "@/features/data-transfer/data-transfer.schema";
import { AgentDataViewStateSchema } from "@/features/data-view/manage-data-views.schema";

const NUL = "\u0000";

function nulIssuePaths(result: z.ZodSafeParseResult<unknown>) {
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.code === "custom" && issue.params?.error === CustomErrorCode.mustNotContainNullChars)
    .map((issue) => issue.path);
}

describe("search input that Postgres cannot store", () => {
  it("rejects a NUL character in the search term as a 400 validation failure", () => {
    const result = GetQueryParamsApiSchema.safeParse({ searchTerm: `a${NUL}b` });

    expect(nulIssuePaths(result)).toEqual([["searchTerm"]]);
    if (result.success) throw new Error("the search term was accepted");
    expect(interactorFailureStatus(result.error)).toBe(400);
  });

  it("rejects a NUL character in a single value filter", () => {
    const result = GetQueryParamsSchema.safeParse({
      filters: [{ field: "firstName", operator: FilterOperatorKey.contains, value: `a${NUL}` }],
    });

    expect(nulIssuePaths(result)).toEqual([["filters", 0, "value"]]);
  });

  it("rejects a NUL character in one entry of a multi value filter", () => {
    const result = FilterSchema.safeParse({ field: "status", operator: FilterOperatorKey.in, value: ["open", NUL] });

    expect(nulIssuePaths(result)).toEqual([["value", 1]]);
  });

  it("keeps accepting an empty search term and ordinary text", () => {
    expect(GetQueryParamsApiSchema.safeParse({ searchTerm: "" }).success).toBe(true);
    expect(
      GetQueryParamsApiSchema.safeParse({
        searchTerm: "Müller & Söhne",
        filters: [{ field: "firstName", operator: FilterOperatorKey.contains, value: "a b" }],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["an export request", ExportRequestSchema, { columns: [{ key: "name", header: "Name" }], searchTerm: NUL }],
    ["a saved view state", DataViewStateWireSchema, { searchTerm: NUL }],
    ["a view state written by the assistant", AgentDataViewStateSchema, { searchTerm: NUL }],
  ] as const)("rejects the same NUL character in the search term of %s", (_label, schema, input) => {
    expect(nulIssuePaths(schema.safeParse(input))).toEqual([["searchTerm"]]);
  });
});
