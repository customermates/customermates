import { describe, expect, it } from "vitest";
import { FilterSchema, type FilterableField } from "../base-get.schema";
import { defaultValidateFilters, FilterOperatorKey as Op } from "../base-query-builder";
import { QueryRepository } from "../query-repository";
import { decodeGetParams, encodeGetParams } from "@/core/utils/get-params";

const fields: FilterableField[] = [{ field: "name", operators: [Op.equals, Op.notEquals] }];
class TextQuery extends QueryRepository {
  override getFilterableFields() {
    return Promise.resolve(fields);
  }
}

describe("shared not-equal filter boundary", () => {
  it("round-trips one scalar through request and URL schemas without converting it to a selection", () => {
    const filter = FilterSchema.parse({ field: "name", operator: Op.notEquals, value: "Excluded" });
    expect(FilterSchema.parse(decodeGetParams(encodeGetParams({ filters: [filter] })).filters?.[0])).toEqual(filter);
    expect(FilterSchema.safeParse({ ...filter, value: ["Excluded"] }).success).toBe(false);
    expect(FilterSchema.safeParse({ ...filter, value: null }).success).toBe(false);
  });

  it("requires the field to advertise not-equal before accepting it", () => {
    const filter = FilterSchema.parse({ field: "name", operator: Op.notEquals, value: "Excluded" });
    expect(defaultValidateFilters({ filters: [filter], filterableFields: fields })).toEqual([filter]);
    expect(
      defaultValidateFilters({ filters: [filter], filterableFields: [{ field: "name", operators: [Op.equals] }] }),
    ).toEqual([]);
  });

  it("AND-combines multiple scalar exclusions in the repository query", async () => {
    const filters = ["First", "Second"].map((value) =>
      FilterSchema.parse({ field: "name", operator: Op.notEquals, value }),
    );
    expect((await new TextQuery().buildQueryArgs({ filters })).where).toEqual({
      AND: [{ name: { not: "First" } }, { name: { not: "Second" } }],
    });
  });
});
