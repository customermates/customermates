import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({ listDeals: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/features/search/entity-list-executors", () => ({
  entityListExecutors: { deal: spies.listDeals },
  entityNameExtractors: { deal: (item: { name: string }) => item.name },
}));

import { listRecordsTool } from "../entity-generic.mcp-tools";

const later = "2026-10-01T00:00:00.000Z";
const current = "2026-09-01T00:00:00.000Z";
const oldest = "2025-10-01T00:00:00.000Z";

function dateGroup(key: string, count: number, bucketRole: "window" | "earlier" | "later", bucketStart?: string) {
  return {
    key,
    count,
    labelKind: "value",
    bucketRole,
    ...(bucketStart ? { bucketStart } : {}),
    isNoValue: false,
    materialised: false,
    itemIds: [],
    hasMore: false,
  };
}

function monthLadder(counts: { later: number; current: number; earlier: number }) {
  const windows = Array.from({ length: 12 }, (_unused, offset) => {
    const start = new Date(Date.UTC(2026, 8 - offset, 1)).toISOString();
    return dateGroup(`month:${start}`, start === current ? counts.current : 0, "window", start);
  });
  return [
    dateGroup("later", counts.later, "later", later),
    ...windows,
    dateGroup("earlier", counts.earlier, "earlier"),
  ];
}

function groupedBy(field: string, groups: ReturnType<typeof monthLadder>) {
  spies.listDeals.mockResolvedValue({
    ok: true,
    data: {
      items: [],
      pagination: { total: groups.reduce((sum, group) => sum + group.count, 0) },
      grouping: {
        grouping: { field, bucket: "month" },
        kind: "dateBucket",
        supportsDragWriteBack: false,
        total: groups.reduce((sum, group) => sum + group.count, 0),
        groups,
      },
    },
  });
}

async function list(args: Record<string, unknown>) {
  const result = await listRecordsTool.execute(listRecordsTool.inputSchema.parse({ entity: "deal", ...args }));
  return (result as { structuredContent: Record<string, unknown> }).structuredContent;
}

describe("list_records groupBy on a date", () => {
  it("names the catch-all groups by the window edge and reports the grouping actually used", async () => {
    groupedBy("createdAt", monthLadder({ later: 1, current: 2, earlier: 3 }));

    const grouped = await list({ groupBy: { field: "createdAt" } });

    expect(grouped.groupedBy).toBe("createdAt:month");
    expect(grouped.groups).toEqual([
      { key: "later", label: `from ${later} on`, count: 1 },
      { key: `month:${current}`, label: current, count: 2 },
      { key: "earlier", label: `before ${oldest}`, count: 3 },
    ]);
    expect(grouped.groupNote).toBe(
      `Only the last 12 months, up to and including the current one, have a group each; "from ${later} on" collects every later record and "before ${oldest}" collects every earlier record.`,
    );
  });

  it("notes only the catch-all group that holds records", async () => {
    groupedBy("updatedAt", monthLadder({ later: 0, current: 2, earlier: 1 }));

    const grouped = await list({ groupBy: { field: "updatedAt" } });

    expect(grouped.groupNote).toBe(
      `Only the last 12 months, up to and including the current one, have a group each; "before ${oldest}" collects every earlier record.`,
    );
  });

  it("adds no window note when every record falls inside the window", async () => {
    groupedBy("createdAt", monthLadder({ later: 0, current: 2, earlier: 0 }));

    const grouped = await list({ groupBy: { field: "createdAt", bucket: "month" } });

    expect(grouped.groupNote).toBeUndefined();
  });

  it("echoes the page and the page size asked for, as the list result does", async () => {
    groupedBy("createdAt", monthLadder({ later: 0, current: 2, earlier: 0 }));

    spies.listDeals.mockClear();

    const grouped = await list({ page: 2, pageSize: 60, groupBy: { field: "createdAt" } });

    expect(grouped).toMatchObject({ page: 2, pageSize: 60 });
    expect(grouped).not.toHaveProperty("requestedPageSize");
    expect(spies.listDeals).toHaveBeenCalledTimes(1);
    expect(spies.listDeals).toHaveBeenCalledWith(expect.objectContaining({ grouping: { field: "createdAt" } }));
  });

  it("documents the window sizes in the tool and in the EN and DE docs", () => {
    const groupBy = JSON.stringify(listRecordsTool.inputSchema.shape.groupBy.description);
    for (const phrase of ["last 7 days", "last 7 weeks", "last 12 months", "before <date>", "from <date> on"])
      expect(groupBy).toContain(phrase);

    const docs = (locale: string) =>
      readFileSync(join(process.cwd(), "content", "docs", locale, "mcp.mdx"), "utf8").replace(/\s+/g, " ");
    expect(docs("en")).toContain("covers the last 7 days, the last 7 weeks or the last 12 months");
    expect(docs("de")).toContain("umfasst die letzten 7 Tage, die letzten 7 Wochen oder die letzten 12 Monate");
  });

  it("offers a month breakdown only by the created or updated date", () => {
    expect(listRecordsTool.description).toContain(
      "For a breakdown per status, owner, organization or created/updated month, pass groupBy",
    );
    expect(listRecordsTool.description).not.toContain("organization or month");
  });
});
