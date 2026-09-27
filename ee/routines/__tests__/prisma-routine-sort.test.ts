import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";

const prismaMock = vi.hoisted(() => ({ routine: { findMany: vi.fn() } }));

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));

import { runWithTenant } from "@/core/decorators/tenant-context";

import { PrismaRoutineRepo } from "../prisma-routine.repository";

const reader = createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readAll }]);

describe("PrismaRoutineRepo sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.routine.findMany.mockResolvedValue([]);
  });

  it.each(["nextRunAt", "lastRunAt"])("lists routines without a %s last in both directions", async (field) => {
    for (const direction of ["asc", "desc"] as const) {
      prismaMock.routine.findMany.mockClear();
      await runWithTenant(reader, () => new PrismaRoutineRepo().getItems({ sortDescriptor: { field, direction } }));

      expect(prismaMock.routine.findMany.mock.calls[0][0].orderBy).toEqual([
        { [field]: { sort: direction, nulls: "last" } },
        { id: direction },
      ]);
    }
  });

  it("keeps required fields on a plain database sort", async () => {
    await runWithTenant(reader, () =>
      new PrismaRoutineRepo().getItems({ sortDescriptor: { field: "createdAt", direction: "desc" } }),
    );

    expect(prismaMock.routine.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("sorts routine names in memory with the user's collator", async () => {
    prismaMock.routine.findMany.mockResolvedValueOnce([
      { id: "routine-1", name: "CRM digest" },
      { id: "routine-2", name: "Change review" },
    ]);

    await runWithTenant(reader, () =>
      new PrismaRoutineRepo().getItems({ sortDescriptor: { field: "name", direction: "asc" } }),
    );

    expect(prismaMock.routine.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    expect(prismaMock.routine.findMany.mock.calls[1][0].where.id.in).toEqual(["routine-2", "routine-1"]);
  });
});
