import type { Filter } from "@/core/base/base-get.schema";
import type { RecordContribution } from "../record-contribution.schema";

import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

import { RECORD_MEASURE_DEFAULT_GROUP_LIMIT } from "../record-measure.schema";
import {
  RECORD_CONTRIBUTION_FILTER,
  recordContributionFilter,
  recordContributionFromFilter,
  recordContributionHref,
} from "../record-contribution-link";

const TYPE_ID = "00000000-0000-4000-8000-000000000001";
const contribution: RecordContribution = {
  measure: {
    source: { typeId: TYPE_ID, filters: [], relationships: [] },
    aggregation: "count",
    valueFieldId: null,
    groupBy: null,
    groupLimit: RECORD_MEASURE_DEFAULT_GROUP_LIMIT,
  },
  group: null,
  title: "Open pipeline",
  groupLabel: null,
};

describe("chart contribution links", () => {
  it("round-trips a contribution through its list filter", () => {
    const filter = recordContributionFilter(contribution);
    expect(filter).toMatchObject({ field: RECORD_CONTRIBUTION_FILTER, operator: FilterOperatorKey.equals });
    expect(recordContributionFromFilter(filter)).toMatchObject({ title: "Open pipeline", group: null });
  });

  it("links to the table of the list and leaves out a link that would exceed request limits", () => {
    const href = recordContributionHref(TYPE_ID, [recordContributionFilter(contribution)]);
    expect(href).toMatch(new RegExp(`^/records/${TYPE_ID}\\?`));
    expect(href).toContain("viewMode=table");
    const long: Filter = { field: "name", operator: FilterOperatorKey.contains, value: "x".repeat(9000) };
    expect(recordContributionHref(TYPE_ID, [long])).toBeNull();
  });
});
