import { describe, expect, it, vi } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { QueryParamsPrecheckInteractor } from "../query-params-precheck.interactor";

function makePrecheck() {
  const contactValidator = { invoke: vi.fn().mockResolvedValue(undefined) };
  const unusedValidator = { invoke: vi.fn().mockResolvedValue(undefined) };
  const precheck = new QueryParamsPrecheckInteractor(
    unusedValidator as never,
    contactValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    unusedValidator as never,
    {} as never,
  );

  return { contactValidator, precheck };
}

const fields = {
  filterableFields: [
    {
      field: FilterFieldKey.contactIds,
      operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
    },
  ],
  customColumns: [],
  sortableFields: [],
};
const context = () => ({ addIssue: vi.fn() }) as never;

describe("QueryParamsPrecheckInteractor unavailable entity IDs", () => {
  it("validates new IDs while allowing explicitly retained IDs for the same field", async () => {
    const retainedId = "10000000-0000-4000-8000-000000000001";
    const newId = "10000000-0000-4000-8000-000000000002";
    const { contactValidator, precheck } = makePrecheck();

    await precheck.invoke(
      fields,
      undefined,
      {
        filters: [
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.in,
            value: [retainedId, newId],
          },
        ],
      },
      context(),
      {
        allowedUnavailableEntityIds: new Map([[FilterFieldKey.contactIds, new Set([retainedId])]]),
      },
    );

    expect(contactValidator.invoke).toHaveBeenCalledWith(
      [{ ids: [newId], path: ["filters", 0, "value"] }],
      expect.anything(),
    );
  });

  it("skips entity lookup only for API reads that explicitly allow unavailable IDs", async () => {
    const { contactValidator, precheck } = makePrecheck();

    await precheck.invoke(
      fields,
      undefined,
      {
        filters: [
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.in,
            value: ["10000000-0000-4000-8000-000000000003"],
          },
        ],
      },
      context(),
      { allowedUnavailableEntityIds: "all" },
    );

    expect(contactValidator.invoke).not.toHaveBeenCalled();
  });
});
