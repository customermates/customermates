import { describe, expect, it } from "vitest";
import { recordSurfaceKey, SURFACE } from "@/core/data-view/data-view-keys";
import { readSurfaceParams } from "../read-surface-params";

const surface = recordSurfaceKey("10000000-0000-4000-8000-000000000001");
const query = {
  view: "10000000-0000-4000-8000-000000000002",
  searchTerm: "owned",
  page: "2",
  pageSize: "10",
  sort: "name:asc",
};

describe("surface-owned query overrides", () => {
  it("preserves legacy unqualified and matching qualified queries", async () => {
    const unqualified = await readSurfaceParams(surface, query);
    expect(unqualified).toMatchObject({
      p13nId: surface,
      viewId: query.view,
      searchTerm: "owned",
      page: 2,
      pageSize: 10,
    });
    expect(await readSurfaceParams(surface, Promise.resolve({ ...query, viewSurface: surface }))).toEqual(unqualified);
  });
  it.each([SURFACE.entityTimeline, recordSurfaceKey("10000000-0000-4000-8000-000000000003"), "", [surface, surface]])(
    "ignores foreign or ambiguous scope %j",
    async (viewSurface) => {
      expect(await readSurfaceParams(surface, { ...query, viewSurface })).toEqual({ p13nId: surface });
    },
  );
});
