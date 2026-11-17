import { describe, expect, it } from "vitest";

import type { PermissionService } from "@/core/base/permission.service";
import type { GetRoutinesRepo } from "@/ee/routines/get-routines.repo";
import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { AutomationsListComposer } from "../automations-list.composer";
import { FakeAutomationRuleRepo } from "./fake-automation-rule-repo";

const OWNER = "00000000-0000-4000-8000-000000000010";
const COLLEAGUE = "00000000-0000-4000-8000-000000000012";
const TYPE = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-16T08:00:00.000Z");

const NOTIFY = {
  kind: "notify",
  recipients: { ruleOwner: true, assignees: false, userIds: [] },
  notificationKind: "ruleAlert",
  title: "{{record.name}}",
};
const AGENT = { kind: "agent", runtime: "ownKey", prompt: "Summarise {{record.name}}" };
const CREATED = { kind: "recordCreated", typeId: TYPE };

function routine(id: string, patch: Partial<RoutineDto> = {}): RoutineDto {
  return {
    id,
    ownerUserId: OWNER,
    owner: null,
    name: "Weekly review",
    prompt: "List clients",
    enabled: true,
    triggerKind: "schedule",
    cronExpression: "0 8 * * 1",
    timezone: "Europe/Berlin",
    triggerEvents: [],
    triggerFilters: [],
    debounceSeconds: 0,
    nextRunAt: null,
    lastRunAt: new Date("2026-11-10T08:00:00.000Z"),
    lastRunStatus: "succeeded",
    disabledReason: null,
    createdAt: new Date("2026-11-03T00:00:00.000Z"),
    updatedAt: new Date("2026-11-03T00:00:00.000Z"),
    ...patch,
  };
}

function setup(options: { scope?: "all" | "own"; routines?: RoutineDto[] | null; routineTotal?: number } = {}) {
  const rules = new FakeAutomationRuleRepo();
  const routines = options.routines === null ? null : (options.routines ?? []);
  const routineRuns = new Map<string, number>();
  const source = routines
    ? ({
        getItems: () => Promise.resolve(routines),
        getCount: () => Promise.resolve(options.routineTotal ?? routines.length),
        countRunsSince: () => Promise.resolve(routineRuns),
      } as unknown as Pick<GetRoutinesRepo, "getItems" | "getCount" | "countRunsSince">)
    : null;
  const permissions = {
    readScope: () => options.scope ?? "all",
    userId: OWNER,
    user: { displayLanguage: null, formattingLocale: "system" },
  } as unknown as PermissionService;
  const composer = new AutomationsListComposer(rules, source, permissions, () => NOW);
  return { rules, routineRuns, composer };
}

const equals = (field: string, value: string): Filter => ({ field, operator: "equals", value }) as Filter;

describe("AutomationsListComposer", () => {
  it("lists rules and routines as rows of one read model", async () => {
    const { rules, composer } = setup({ routines: [routine("30000000-0000-4000-8000-000000000001")] });
    rules.addRule({
      id: "20000000-0000-4000-8000-000000000001",
      name: "Follow up",
      trigger: CREATED,
      effects: [NOTIFY],
    });

    const items = await composer.getItems({});

    expect(items.map((item) => [item.kind, item.name])).toEqual(
      expect.arrayContaining([
        ["rule", "Follow up"],
        ["routine", "Weekly review"],
      ]),
    );
    expect(items).toHaveLength(2);
    expect(await composer.getCount({})).toBe(2);
  });

  it("runs exact rules for free and names the runtime of an agent step", async () => {
    const { rules, composer } = setup({ routines: [routine("30000000-0000-4000-8000-000000000001")] });
    rules.addRule({ id: "20000000-0000-4000-8000-000000000001", name: "Exact", trigger: CREATED, effects: [NOTIFY] });
    rules.addRule({
      id: "20000000-0000-4000-8000-000000000002",
      name: "Agent",
      trigger: CREATED,
      effects: [NOTIFY, AGENT],
    });

    const items = await composer.getItems({});
    const runsOn = Object.fromEntries(items.map((item) => [item.name, item.runsOn]));

    expect(runsOn).toEqual({ Exact: "free", Agent: "ownKey", "Weekly review": "mate" });
  });

  it("counts the runs of the last 30 days per row and maps the last status of a rule", async () => {
    const { rules, routineRuns, composer } = setup({ routines: [routine("30000000-0000-4000-8000-000000000001")] });
    const id = "20000000-0000-4000-8000-000000000001";
    rules.addRule({
      id,
      name: "Counted",
      trigger: CREATED,
      effects: [NOTIFY],
      lastRunAt: new Date("2026-11-15T08:00:00.000Z"),
      lastRunStatus: "applied",
    });
    for (const [index, createdAt] of ["2026-11-15", "2026-11-01", "2026-09-01"].entries()) {
      rules.runs.set(`run-${index}`, {
        id: `run-${index}`,
        companyId: rules.companyId,
        ruleId: id,
        occurrenceKey: `k${index}`,
        status: "applied",
        triggerKind: "recordCreated",
        typeId: null,
        recordId: null,
        payload: null,
        outcome: null,
        error: null,
        depth: 0,
        scheduledFor: new Date(createdAt),
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(createdAt),
      });
    }
    routineRuns.set("30000000-0000-4000-8000-000000000001", 5);

    const items = await composer.getItems({});
    const rule = items.find((item) => item.id === id);
    const weekly = items.find((item) => item.kind === "routine");

    expect(rule).toMatchObject({ runs30d: 2, lastRunStatus: "succeeded" });
    expect(weekly?.runs30d).toBe(5);
  });

  it("filters by kind, status and runtime, and searches by name", async () => {
    const { rules, composer } = setup({
      routines: [routine("30000000-0000-4000-8000-000000000001", { enabled: false, disabledReason: "disabledByUser" })],
    });
    rules.addRule({ id: "20000000-0000-4000-8000-000000000001", name: "Alpha", trigger: CREATED, effects: [NOTIFY] });
    rules.addRule({
      id: "20000000-0000-4000-8000-000000000002",
      name: "Beta",
      trigger: CREATED,
      effects: [AGENT],
      enabled: false,
    });

    const names = async (params: Parameters<typeof composer.getItems>[0]) =>
      (await composer.getItems({ ...params, sortDescriptor: { field: "name", direction: "asc" } })).map(
        (item) => item.name,
      );

    expect(await names({ filters: [equals(FilterFieldKey.automationKind, "routine")] })).toEqual(["Weekly review"]);
    expect(await names({ filters: [equals(FilterFieldKey.automationStatus, "paused")] })).toEqual([
      "Beta",
      "Weekly review",
    ]);
    expect(await names({ filters: [equals(FilterFieldKey.automationRunsOn, "ownKey")] })).toEqual(["Beta"]);
    expect(await names({ searchTerm: "alp" })).toEqual(["Alpha"]);
    expect(
      await composer.getCount({
        filters: [{ field: FilterFieldKey.automationKind, operator: FilterOperatorKey.in, value: ["rule"] }],
      }),
    ).toBe(2);
  });

  it("sorts by runs, last run and name and pages the merged rows", async () => {
    const { rules, composer } = setup({ routines: [routine("30000000-0000-4000-8000-000000000001")] });
    rules.addRule({
      id: "20000000-0000-4000-8000-000000000001",
      name: "Never run",
      trigger: CREATED,
      effects: [NOTIFY],
      lastRunAt: null,
    });
    rules.addRule({
      id: "20000000-0000-4000-8000-000000000002",
      name: "Recent",
      trigger: CREATED,
      effects: [NOTIFY],
      lastRunAt: new Date("2026-11-15T00:00:00.000Z"),
    });

    const byLastRun = await composer.getItems({ sortDescriptor: { field: "lastRunAt", direction: "desc" } });
    expect(byLastRun.map((item) => item.name)).toEqual(["Recent", "Weekly review", "Never run"]);

    for (const index of [3, 4, 5, 6]) {
      rules.addRule({
        id: `20000000-0000-4000-8000-00000000000${index}`,
        name: `Extra ${index}`,
        trigger: CREATED,
        effects: [NOTIFY],
      });
    }
    const secondPage = await composer.getItems({
      sortDescriptor: { field: "name", direction: "asc" },
      pagination: { page: 2, pageSize: 5 },
    });
    expect(secondPage.map((item) => item.name)).toEqual(["Recent", "Weekly review"]);
    expect(await composer.getCount({})).toBe(7);
  });

  it("shows a member only the rules they own and no routines on self-hosted", async () => {
    const { rules, composer } = setup({ scope: "own", routines: null });
    rules.addRule({ id: "20000000-0000-4000-8000-000000000001", name: "Mine", trigger: CREATED, effects: [NOTIFY] });
    rules.addRule({
      id: "20000000-0000-4000-8000-000000000002",
      name: "Theirs",
      ownerUserId: COLLEAGUE,
      trigger: CREATED,
      effects: [NOTIFY],
    });

    expect((await composer.getItems({})).map((item) => item.name)).toEqual(["Mine"]);
  });

  it("says how many rules and routines the list leaves out", async () => {
    const within = setup({ routines: [routine("30000000-0000-4000-8000-000000000001")] });
    within.rules.addRule({ id: "20000000-0000-4000-8000-000000000001", trigger: CREATED, effects: [NOTIFY] });
    expect(await within.composer.notShown()).toEqual({ rules: 0, routines: 0 });

    const beyond = setup({ routines: [routine("30000000-0000-4000-8000-000000000001")], routineTotal: 104 });
    for (let index = 0; index < 203; index += 1) {
      beyond.rules.addRule({
        id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ownerUserId: index < 3 ? OWNER : COLLEAGUE,
        trigger: CREATED,
        effects: [NOTIFY],
      });
    }
    expect(await beyond.composer.notShown()).toEqual({ rules: 3, routines: 4 });
    expect(await beyond.composer.getCount({})).toBe(201);

    const own = setup({ scope: "own", routines: null });
    for (const [id, rule] of beyond.rules.rules) own.rules.rules.set(id, rule);
    expect(await own.composer.notShown()).toEqual({ rules: 0, routines: 0 });
  });

  it("declares the sortable and filterable fields the surface offers", async () => {
    const { composer } = setup();

    expect(composer.getSortableFields().map((field) => field.field)).toEqual([
      "name",
      "kind",
      "lastRunAt",
      "runs30d",
      "createdAt",
      "updatedAt",
    ]);
    expect((await composer.getFilterableFields()).map((field) => field.field)).toEqual([
      FilterFieldKey.automationKind,
      FilterFieldKey.automationStatus,
      FilterFieldKey.automationRunsOn,
      FilterFieldKey.ownerUserId,
    ]);
    expect(
      composer.validateSortDescriptor({
        sortDescriptor: { field: "secret", direction: "asc" },
        sortableFields: composer.getSortableFields(),
      }),
    ).toBeUndefined();
  });
});
