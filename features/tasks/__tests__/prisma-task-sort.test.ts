import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Locale, Resource } from "@/generated/prisma";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";

const { findMany, customColumns } = vi.hoisted(() => ({
  findMany: vi.fn(),
  customColumns: { current: [] as unknown[] },
}));

vi.mock("@/prisma/db", () => ({ prisma: { task: { findMany } } }));
vi.mock("@/core/di", () => ({
  getCustomColumnRepo: () => ({
    findByEntityType: vi.fn(() => Promise.resolve(customColumns.current)),
    getFilterableCustomFields: vi.fn().mockResolvedValue([]),
  }),
}));

import { PrismaTaskRepo } from "../prisma-task.repository";

const reader = {
  ...createMockUserWithPermissions([{ resource: Resource.tasks, action: Action.readAll }]),
  displayLanguage: Locale.de,
  formattingLocale: Locale.de,
};

const STORED = [
  { id: "task-1", name: "CRM Setup & Configuration" },
  { id: "task-2", name: "Change Management Support" },
  { id: "task-3", name: "CI/CD Pipeline Setup" },
  { id: "task-4", name: "Umzug" },
  { id: "task-5", name: "Zahlung" },
  { id: "task-6", name: "Überprüfung" },
  { id: "task-7", name: "SThree" },
  { id: "task-8", name: "Siemens" },
];

const LOCALE_ORDER = [
  "Change Management Support",
  "CI/CD Pipeline Setup",
  "CRM Setup & Configuration",
  "Siemens",
  "SThree",
  "Überprüfung",
  "Umzug",
  "Zahlung",
];

const PRIORITY_COLUMN = "7d0c2f5e-0000-4000-8000-00000000c0de";
const PRIORITY = { high: "f1000000-0000-4000-8000-000000000001", low: "0a000000-0000-4000-8000-000000000003" };
const MEDIUM = "5b000000-0000-4000-8000-000000000002";
const PRIORITY_BY_TASK: Record<string, string | undefined> = {
  "task-1": PRIORITY.low,
  "task-2": PRIORITY.high,
  "task-3": MEDIUM,
  "task-4": PRIORITY.high,
};

type FindManyArgs = { where?: { id?: { in?: string[] } }; select: Record<string, unknown> };

function serveStoredTasks() {
  findMany.mockImplementation(({ where, select }: FindManyArgs) => {
    const ids = where?.id?.in;
    const rows = ids ? STORED.filter((task) => ids.includes(task.id)) : STORED;

    if ("users" in select) {
      return Promise.resolve(
        rows.map((task) => ({ ...task, users: [], contacts: [], organizations: [], deals: [], services: [] })),
      );
    }

    if ("customFieldValues" in select) {
      return Promise.resolve(
        rows.map(({ id }) => ({
          id,
          customFieldValues: PRIORITY_BY_TASK[id] ? [{ value: PRIORITY_BY_TASK[id] }] : [],
        })),
      );
    }

    return Promise.resolve(rows.map(({ id, name }) => ({ id, name })));
  });
}

describe("PrismaTaskRepo sorting", () => {
  beforeEach(() => {
    findMany.mockReset();
    customColumns.current = [];
    serveStoredTasks();
  });

  it("offers name as a sortable field, like the other record lists", () => {
    expect(new PrismaTaskRepo().getSortableFields().map(({ field }) => field)).toEqual([
      "name",
      "createdAt",
      "updatedAt",
    ]);
  });

  it.each([
    ["asc", LOCALE_ORDER],
    ["desc", [...LOCALE_ORDER].reverse()],
  ] as const)(
    "sorts names %s with the user's locale collator, not the database byte order",
    async (direction, order) => {
      const items = await runWithTenant(reader, () =>
        new PrismaTaskRepo().getItems({ sortDescriptor: { field: "name", direction } }),
      );

      expect(items.map((task) => task.name)).toEqual(order);
      expect(findMany.mock.calls[0][0]).toMatchObject({ orderBy: { id: direction }, select: { id: true, name: true } });
    },
  );

  it("pages after sorting, so Change still comes before CRM on the first page", async () => {
    const items = await runWithTenant(reader, () =>
      new PrismaTaskRepo().getItems({ sortDescriptor: { field: "name", direction: "asc" }, skip: 1, take: 2 }),
    );

    expect(items.map((task) => task.name)).toEqual(["CI/CD Pipeline Setup", "CRM Setup & Configuration"]);
    expect(findMany.mock.calls[1][0].where.id.in).toEqual(["task-3", "task-1"]);
  });

  it("keeps date sorts in the database with an id tiebreaker", async () => {
    await runWithTenant(reader, () =>
      new PrismaTaskRepo().getItems({ sortDescriptor: { field: "createdAt", direction: "desc" } }),
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it.each([
    ["asc", ["task-2", "task-4", "task-3", "task-1"]],
    ["desc", ["task-1", "task-3", "task-2", "task-4"]],
  ] as const)("sorts a single select %s by its option order, with empty values last", async (direction, order) => {
    customColumns.current = [
      {
        id: PRIORITY_COLUMN,
        label: "Priority",
        entityType: "task",
        type: "singleSelect",
        options: {
          options: [
            { value: PRIORITY.low, label: "Low", color: "default", isDefault: false, index: 2 },
            { value: PRIORITY.high, label: "High", color: "default", isDefault: false, index: 0 },
            { value: MEDIUM, label: "Medium", color: "default", isDefault: false, index: 1 },
          ],
        },
      },
    ];

    const items = await runWithTenant(reader, () =>
      new PrismaTaskRepo().getItems({ sortDescriptor: { field: PRIORITY_COLUMN, direction } }),
    );
    const ranked = items.map((task) => task.id).filter((id) => PRIORITY_BY_TASK[id]);

    expect(ranked).toEqual(order);
    expect(items.slice(ranked.length).every((task) => !PRIORITY_BY_TASK[task.id])).toBe(true);
  });
});
