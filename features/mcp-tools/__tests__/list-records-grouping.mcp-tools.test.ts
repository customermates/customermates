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

function docs(locale: string) {
  return readFileSync(join(process.cwd(), "content", "docs", locale, "mcp.mdx"), "utf8").replace(/\s+/g, " ");
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

    expect(docs("en")).toContain("covers the last 7 days, the last 7 weeks or the last 12 months");
    expect(docs("de")).toContain("umfasst die letzten 7 Tage, die letzten 7 Wochen oder die letzten 12 Monate");
  });

  it("takes a groupedBy token as the field, so a result's groupedBy can be sent back", async () => {
    groupedBy("createdAt", monthLadder({ later: 0, current: 2, earlier: 0 }));
    spies.listDeals.mockClear();

    await list({ groupBy: { field: "createdAt:week" } });
    await list({ groupBy: { field: "userIds" } });
    await list({ groupBy: { field: "createdAt", bucket: "day" } });

    expect(spies.listDeals.mock.calls.map(([params]) => params.grouping)).toEqual([
      { field: "createdAt", bucket: "week" },
      { field: "userIds" },
      { field: "createdAt", bucket: "day" },
    ]);
  });

  it("takes a groupedBy token sent with the same bucket, and names the conflict when the buckets differ", async () => {
    groupedBy("createdAt", monthLadder({ later: 0, current: 2, earlier: 0 }));
    spies.listDeals.mockClear();

    await list({ groupBy: { field: "createdAt:week", bucket: "week" } });
    const conflicting = await listRecordsTool.execute(
      listRecordsTool.inputSchema.parse({ entity: "deal", groupBy: { field: "createdAt:week", bucket: "day" } }),
    );

    expect(spies.listDeals.mock.calls.map(([params]) => params.grouping)).toEqual([
      { field: "createdAt", bucket: "week" },
    ]);
    const text = JSON.stringify(conflicting);
    expect(text).toContain(
      "groupBy.field createdAt:week already names the bucket week; drop bucket, or send field createdAt with bucket day.",
    );
    expect(text).not.toContain("Groupable fields");
  });

  it("says how many groups and sums one grouped call returns, in the tool and in the EN and DE docs", () => {
    expect(listRecordsTool.description).toContain(
      "one call returns up to 50 groups plus No value with their counts and, for deals, the totalValue and weightedValue sums of up to 25 of them",
    );
    expect(listRecordsTool.description).not.toContain("of every group");
    expect(docs("en")).toContain(
      "It lists up to 50 groups, plus a `No value` group for records without one, and gives sums for up to 25 of them; when it leaves out a group that holds records, or some sums, `groupsIncomplete` is `true` and `groupNote` says what is missing.",
    );
    expect(docs("de")).toContain(
      "Es listet bis zu 50 Gruppen und dazu eine Gruppe `No value` für Datensätze ohne Wert und liefert Summen für bis zu 25 davon; fehlt eine Gruppe mit Datensätzen oder eine Summe, ist `groupsIncomplete` gleich `true`, und `groupNote` sagt, was fehlt.",
    );
  });

  it("offers a month breakdown only by the created or updated date", () => {
    expect(listRecordsTool.description).toContain(
      "For a breakdown per status, owner, organization or created/updated month, pass groupBy",
    );
    expect(listRecordsTool.description).not.toContain("organization or month");
  });

  it("gives a grouped name search no write-target guidance, as the tool and the EN and DE docs say", async () => {
    groupedBy("createdAt", monthLadder({ later: 0, current: 2, earlier: 1 }));

    for (const nameQuery of [
      { searchTerm: "Nova Expansion" },
      { filters: [{ field: "name", operator: "startsWith", value: "Nova Expansion" }] },
    ]) {
      const grouped = await list({ ...nameQuery, groupBy: { field: "createdAt" } });

      expect(grouped).toMatchObject({ total: 3, items: [] });
      expect(grouped).not.toHaveProperty("writeTargetGuidance");
      expect(listRecordsTool.outputSchema.safeParse(grouped).success).toBe(true);
    }

    expect(listRecordsTool.outputSchema.shape.writeTargetGuidance.description).toBe(
      "Present on a list result, not a grouped one, whose name search or name filter matched several records; selecting only one for a write requires clarification",
    );
    expect(listRecordsTool.description).toContain(
      "When a name search without groupBy matches several records, writeTargetGuidance has status ambiguous",
    );
    expect(docs("en")).toContain(
      "In a list result, not a grouped one, where `searchTerm` or a `name` filter matches several records, `writeTargetGuidance.status` is `ambiguous`",
    );
    expect(docs("de")).toContain(
      "Wenn `searchTerm` oder ein `name`-Filter in einem nicht gruppierten Ergebnis mehrere Datensätze findet, ist `writeTargetGuidance.status` gleich `ambiguous`",
    );
  });
});

describe("list_records groupBy on a relation", () => {
  function organizationGroups(
    count: number,
    sums: number,
    overflow?: { shown: number; withRecords: boolean },
    noValue = 0,
  ) {
    const valueGroups = Array.from({ length: count }, (_unused, index) => ({
      key: `org-${index}`,
      label: `Org ${index}`,
      count: 2,
      labelKind: "value",
      isNoValue: false,
      materialised: false,
      itemIds: [],
      hasMore: false,
      ...(index < sums ? { valueSums: { totalValue: 100 } } : {}),
    }));
    const groups = noValue
      ? [
          ...valueGroups,
          {
            ...valueGroups[0],
            key: "__empty__",
            label: undefined,
            count: noValue,
            labelKind: "noValue",
            isNoValue: true,
          },
        ]
      : valueGroups;
    spies.listDeals.mockResolvedValue({
      ok: true,
      data: {
        items: [],
        pagination: { total: count * 2 + noValue },
        grouping: {
          grouping: { field: "organizationIds" },
          kind: "relation",
          supportsDragWriteBack: false,
          total: count * 2 + noValue,
          groups,
          ...(overflow ? { overflow } : {}),
        },
      },
    });
  }

  it("flags a result that lists only some groups, or the sums of only some groups, and leaves a complete one unflagged", async () => {
    organizationGroups(50, 50, { shown: 50, withRecords: true });
    const overflowing = await list({ groupBy: { field: "organizationIds" } });
    expect(overflowing.groupsIncomplete).toBe(true);
    expect(overflowing.groupNote).toBe("Only 50 groups are listed; filter on organizationIds to count the others.");
    expect(listRecordsTool.outputSchema.safeParse(overflowing).success).toBe(true);

    organizationGroups(30, 25);
    expect((await list({ groupBy: { field: "organizationIds" } })).groupsIncomplete).toBe(true);

    organizationGroups(20, 20);
    expect(await list({ groupBy: { field: "organizationIds" } })).not.toHaveProperty("groupsIncomplete");
  });

  it("leaves a result unflagged when the groups past the cap hold no records", async () => {
    organizationGroups(3, 3, { shown: 50, withRecords: false });

    const grouped = await list({ groupBy: { field: "organizationIds" } });

    expect(grouped).not.toHaveProperty("groupsIncomplete");
    expect(grouped).not.toHaveProperty("groupNote");
    expect(grouped.groups).toHaveLength(3);
  });

  it("counts the no value group in the number of groups the note says are listed", async () => {
    organizationGroups(50, 25, { shown: 50, withRecords: true }, 1);

    const grouped = await list({ groupBy: { field: "organizationIds" } });

    expect(grouped.groups).toHaveLength(51);
    expect(grouped.groupNote).toContain("Only 51 groups are listed; filter on organizationIds to count the others.");
  });
});
