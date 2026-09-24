import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn().mockResolvedValue([]) }));

vi.mock("@/prisma/db", () => ({ prisma: { task: { findMany } } }));
vi.mock("@/core/di", () => ({
  getCustomColumnRepo: () => ({
    findByEntityType: vi.fn().mockResolvedValue([]),
    getFilterableCustomFields: vi.fn().mockResolvedValue([]),
  }),
}));

import { PrismaTaskRepo } from "../prisma-task.repository";

const reader = createMockUserWithPermissions([{ resource: Resource.tasks, action: Action.readAll }]);

describe("PrismaTaskRepo sorting", () => {
  beforeEach(() => {
    findMany.mockClear();
  });

  it("offers name as a sortable field, like the other record lists", () => {
    expect(new PrismaTaskRepo().getSortableFields().map(({ field }) => field)).toEqual([
      "name",
      "createdAt",
      "updatedAt",
    ]);
  });

  it.each(["asc", "desc"] as const)("orders the list by name %s with an id tiebreaker", async (direction) => {
    await runWithTenant(reader, () => new PrismaTaskRepo().getItems({ sortDescriptor: { field: "name", direction } }));

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ name: direction }, { id: direction }]);
  });
});
