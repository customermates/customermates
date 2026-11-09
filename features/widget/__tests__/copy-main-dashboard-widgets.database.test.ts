import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { runWithTenant, runWithoutTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("duplicating the main dashboard on PostgreSQL", () => {
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const teammateId = randomUUID();
  const owner = createMockUser({ id: ownerId, companyId, email: `${ownerId}@example.invalid` });

  async function db() {
    const { prisma } = await import("@/prisma/db");
    return prisma;
  }

  beforeAll(async () => {
    await import("@/core/di");
    const prisma = await db();
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      for (const id of [ownerId, teammateId]) {
        await prisma.user.create({
          data: {
            id,
            companyId,
            email: `${id}@example.invalid`,
            firstName: "Dash",
            lastName: "Board",
            status: "active",
          },
        });
      }
      const saved = await prisma.dataView.create({
        data: { companyId, userId: ownerId, surfaceKey: "dashboard", name: "Saved", position: 0 },
      });
      const widget = (userId: string, name: string, viewId: string | null, deletedAt: Date | null = null) => ({
        companyId,
        userId,
        name,
        viewId,
        deletedAt,
        layout: { x: 0, y: 0, w: 4, h: 3 },
      });
      await prisma.widget.createMany({
        data: [
          widget(ownerId, "Revenue", null),
          widget(ownerId, "Pipeline", null),
          widget(ownerId, "Trashed", null, new Date()),
          widget(ownerId, "On saved view", saved.id),
          widget(teammateId, "Teammate main", null),
        ],
      });
    });
  }, 60000);

  afterAll(async () => {
    const prisma = await db();
    await runWithoutTenant(async () => {
      await prisma.widget.deleteMany({ where: { companyId } });
      await prisma.dataView.deleteMany({ where: { companyId } });
      await prisma.p13n.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    });
  });

  it("copies only the caller's live main-dashboard widgets, with their layout, into the new view", async () => {
    const { getUpsertDataViewInteractor } = await import("@/core/di");

    const result = await runWithTenant(owner, () =>
      getUpsertDataViewInteractor().invoke({
        surfaceKey: "dashboard",
        name: "Main copy",
        state: {},
        copyOf: "__all__",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const prisma = await db();
    const copied = await runWithoutTenant(() =>
      prisma.widget.findMany({
        where: { companyId, viewId: result.data.id },
        select: { name: true, userId: true, layout: true },
        orderBy: { name: "asc" },
      }),
    );
    expect(copied).toEqual([
      { name: "Pipeline", userId: ownerId, layout: { x: 0, y: 0, w: 4, h: 3 } },
      { name: "Revenue", userId: ownerId, layout: { x: 0, y: 0, w: 4, h: 3 } },
    ]);
    expect(await runWithoutTenant(() => prisma.widget.count({ where: { companyId, viewId: null } }))).toBe(4);
  });
});
