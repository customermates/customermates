import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import {
  CommandResolutionOutputSchema,
  commandResolveRequest,
  parseCommandResolution,
  ResolveCommandInputSchema,
} from "../command-resolve";

const DEALS = "00000000-0000-4000-8000-000000000001";
const TASKS = "00000000-0000-4000-8000-000000000002";

const request = commandResolveRequest({
  query: "won deals over 10k closing this month",
  today: "2026-10-09",
  lists: [
    {
      typeId: DEALS,
      label: "Deal",
      pluralLabel: "Deals",
      views: [{ id: "view-open", name: "Open pipeline" }],
      fields: [
        {
          key: "stage",
          label: "Stage",
          valueType: "select",
          operators: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.isNull],
          options: [
            { id: "opt-won", label: "Won" },
            { id: "opt-lost", label: "Lost" },
          ],
        },
        {
          key: "value",
          label: "Value",
          valueType: "currency",
          operators: [FilterOperatorKey.gt, FilterOperatorKey.lt],
        },
        { key: "close", label: "Close date", valueType: "date", operators: [FilterOperatorKey.between] },
        { key: "tags", label: "Tags", valueType: "multipleChoice", operators: [FilterOperatorKey.hasUnset] },
      ],
    },
    { typeId: TASKS, label: "Task", pluralLabel: "Tasks", views: [], fields: [] },
  ],
  commands: [{ key: "cmd:setting.profile.theme", label: "Profile & preferences > Theme" }],
});

const output = (overrides: Partial<Parameters<typeof parseCommandResolution>[0]>) =>
  CommandResolutionOutputSchema.parse({
    kind: "list",
    list: "L1",
    view: null,
    command: null,
    filters: [],
    ...overrides,
  });

describe("command resolve request", () => {
  it("lists names, operators and option aliases but no ids", () => {
    expect(request.prompt).toContain('L1 "Deals" (one record: "Deal")');
    expect(request.prompt).toContain('view V1 "Open pipeline"');
    expect(request.prompt).toContain('F1 "Stage" (select) operators: in, notIn, isNull options: F1O1=Won, F1O2=Lost');
    expect(request.prompt).toContain('C1 "Profile & preferences > Theme"');
    expect(request.prompt).toContain("Today: 2026-10-09");
    expect(request.prompt).toContain("Request: won deals over 10k closing this month");
    expect(request.prompt).not.toContain(DEALS);
    expect(request.prompt).not.toContain("opt-won");
    expect(request.prompt).not.toContain("Tags");
  });

  it("validates the request size", () => {
    expect(ResolveCommandInputSchema.safeParse({ query: "ab", locale: "en" }).success).toBe(false);
    expect(ResolveCommandInputSchema.safeParse({ query: "x".repeat(301), locale: "en" }).success).toBe(false);
  });
});

describe("command resolution parsing", () => {
  it("maps aliases back to a filtered list", () => {
    expect(
      parseCommandResolution(
        output({
          view: "V1",
          filters: [
            { field: "F1", operator: FilterOperatorKey.in, values: ["F1O1"] },
            { field: "F2", operator: FilterOperatorKey.gt, values: ["10000"] },
            { field: "F3", operator: FilterOperatorKey.between, values: ["2026-10-01", "2026-10-31"] },
          ],
        }),
        request.aliases,
      ),
    ).toEqual({
      kind: "list",
      typeId: DEALS,
      viewId: "view-open",
      filters: [
        { field: "stage", operator: FilterOperatorKey.in, value: ["opt-won"] },
        { field: "value", operator: FilterOperatorKey.gt, value: "10000" },
        { field: "close", operator: FilterOperatorKey.between, value: ["2026-10-01", "2026-10-31"] },
      ],
    });
  });

  it("maps a command alias to its stable key", () => {
    expect(parseCommandResolution(output({ kind: "command", list: null, command: "C1" }), request.aliases)).toEqual({
      kind: "command",
      key: "cmd:setting.profile.theme",
    });
  });

  it("rejects anything outside the catalog", () => {
    const rejected = [
      output({ list: "L9" }),
      output({ view: "V9" }),
      output({ list: "L2", view: "V1" }),
      output({ filters: [{ field: "F1", operator: FilterOperatorKey.gt, values: ["1"] }] }),
      output({ filters: [{ field: "F1", operator: FilterOperatorKey.in, values: ["F1O9"] }] }),
      output({ filters: [{ field: "F9", operator: FilterOperatorKey.in, values: ["F1O1"] }] }),
      output({ filters: [{ field: "F2", operator: FilterOperatorKey.gt, values: [] }] }),
      output({ filters: [{ field: "F3", operator: FilterOperatorKey.between, values: ["2026-10-01"] }] }),
      output({ kind: "command", list: null, command: "C9" }),
      output({ kind: "none", list: null }),
    ];
    for (const candidate of rejected) expect(parseCommandResolution(candidate, request.aliases)).toBeNull();
  });
});
