import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { activeUsersQuery } from "../get/active-users-query";

describe("active users query", () => {
  it("lists only active members, sorted by name, for a picker search", () => {
    expect(activeUsersQuery({ searchTerm: "an" })).toEqual({
      searchTerm: "an",
      filters: [{ field: "status", operator: "in", value: ["active"] }],
      sortDescriptor: { field: "name", direction: "asc" },
    });
  });

  it("keeps the caller's own filters and sort", () => {
    expect(
      activeUsersQuery({
        filters: [{ field: "createdAt", operator: FilterOperatorKey.gt, value: "2026-01-01" }],
        sortDescriptor: { field: "createdAt", direction: "desc" },
      }),
    ).toEqual({
      filters: [
        { field: "status", operator: "in", value: ["active"] },
        { field: "createdAt", operator: "gt", value: "2026-01-01" },
      ],
      sortDescriptor: { field: "createdAt", direction: "desc" },
    });
  });
});
