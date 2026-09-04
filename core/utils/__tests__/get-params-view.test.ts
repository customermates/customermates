import { describe, expect, it } from "vitest";

import { GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { ViewMode } from "@/core/base/base-query-builder";
import { decodeGetParams, encodeGetParams } from "@/core/utils/get-params";

const A_GROUPING_COLUMN = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";
const A_VIEW_ID = "3a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";

describe("view URL parameters", () => {
  it("round trips view, viewMode and groupBy", () => {
    const encoded = encodeGetParams({
      viewId: A_VIEW_ID,
      viewMode: ViewMode.card,
      groupingColumnId: A_GROUPING_COLUMN,
    });

    expect(encoded.get("view")).toBe(A_VIEW_ID);
    expect(encoded.get("viewMode")).toBe("card");
    expect(encoded.get("groupBy")).toBe(A_GROUPING_COLUMN);

    expect(decodeGetParams(encoded)).toMatchObject({
      viewId: A_VIEW_ID,
      viewMode: ViewMode.card,
      groupingColumnId: A_GROUPING_COLUMN,
    });
  });

  it("emits no view parameter when there is no view id", () => {
    expect(encodeGetParams({ viewId: undefined }).has("view")).toBe(false);
  });

  it("omits viewMode at table and omits groupBy outside card mode", () => {
    expect(encodeGetParams({ viewMode: ViewMode.table }).has("viewMode")).toBe(false);
    expect(encodeGetParams({ viewMode: ViewMode.table, groupingColumnId: A_GROUPING_COLUMN }).has("groupBy")).toBe(
      false,
    );
  });

  it("decodes an absent pageSize to undefined rather than 100", () => {
    const decoded = decodeGetParams(new URLSearchParams(""));

    expect(decoded.pageSize).toBeUndefined();
    expect(decoded).not.toHaveProperty("pagination.pageSize");
  });

  it("decodes page=2 to a page alone, with no page size and no pagination object", () => {
    const decoded = decodeGetParams(new URLSearchParams("page=2"));

    expect(decoded.page).toBe(2);
    expect(decoded.pageSize).toBeUndefined();
    expect(decoded.pagination).toBeUndefined();
  });

  it("keeps a non-default page size and drops an unsupported one", () => {
    expect(decodeGetParams(new URLSearchParams("pageSize=10")).pageSize).toBe(10);
    expect(decodeGetParams(new URLSearchParams("pageSize=7")).pageSize).toBeUndefined();
  });

  it("omits the page and page size defaults on encode from either shape", () => {
    expect(encodeGetParams({ page: 1, pageSize: 25 }).toString()).toBe("");
    expect(encodeGetParams({ pagination: { page: 1, pageSize: 25 } }).toString()).toBe("");
    expect(encodeGetParams({ page: 3, pageSize: 100 }).toString()).toBe("page=3&pageSize=100");
    expect(encodeGetParams({ pagination: { page: 3, pageSize: 100 } }).toString()).toBe("page=3&pageSize=100");
  });

  it("ignores an unknown viewMode token", () => {
    expect(decodeGetParams(new URLSearchParams("viewMode=kanban")).viewMode).toBeUndefined();
  });

  it("ignores a groupBy that is not a column id, the way it ignores an unreadable view", () => {
    expect(decodeGetParams(new URLSearchParams("groupBy=deal%20status")).groupingColumnId).toBeUndefined();
    expect(decodeGetParams(new URLSearchParams("groupBy=")).groupingColumnId).toBeUndefined();
    expect(decodeGetParams(new URLSearchParams(`groupBy=${A_GROUPING_COLUMN}`)).groupingColumnId).toBe(
      A_GROUPING_COLUMN,
    );
  });

  it("decodes every link the address bar can carry into params the read path accepts", () => {
    const links = [
      "groupBy=deal status",
      "groupBy=notauuid&viewMode=card",
      `view=notauuid&groupBy=${A_GROUPING_COLUMN}`,
      "page=0&pageSize=7&viewMode=kanban&groupBy=1",
      `view=${A_VIEW_ID}&viewMode=card&groupBy=${A_GROUPING_COLUMN}&page=2&pageSize=100`,
    ];

    for (const link of links) {
      const parsed = GetQueryParamsSchema.safeParse(decodeGetParams(new URLSearchParams(link)));

      expect([link, parsed.success]).toEqual([link, true]);
    }
  });
});
