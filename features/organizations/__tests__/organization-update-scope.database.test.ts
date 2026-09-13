import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { runWithTenant, runWithoutTenant } from "@/core/decorators/tenant-context";
import { DomainEvent } from "@/features/event/domain-events";
import { prisma } from "@/prisma/db";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { PrismaOrganizationRepo } from "../prisma-organization.repository";
import { UpdateOrganizationInteractor } from "../upsert/update-organization.interactor";

vi.mock("@/core/validation/zod-error-map-server", () => ({
  getZodParseContext: vi.fn().mockResolvedValue(undefined),
}));

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("organization update relation scoping on PostgreSQL", { timeout: 120_000 }, () => {
  const companyId = randomUUID();
  const actorId = randomUUID();
  const hiddenUserIds: string[] = [randomUUID(), randomUUID()];
  const organizationId = randomUUID();

  const actor = {
    ...createMockUserWithPermissions([
      { resource: Resource.organizations, action: Action.readAll },
      { resource: Resource.organizations, action: Action.update },
      { resource: Resource.users, action: Action.readOwn },
    ]),
    id: actorId,
    companyId,
  };

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.user.createMany({
        data: [actorId, ...hiddenUserIds].map((id, index) => ({
          id,
          companyId,
          email: `organization-scope-${id}@example.com`,
          firstName: index === 0 ? "Visible" : "Hidden",
          lastName: `User ${index}`,
          status: "active",
        })),
      });
      await prisma.organization.create({ data: { id: organizationId, companyId, name: "Before" } });
      await prisma.organizationUser.createMany({
        data: [actorId, ...hiddenUserIds].map((userId) => ({ companyId, organizationId, userId })),
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  it("preserves hidden assignees and excludes them from a name-only change event", async () => {
    const hiddenJoinsBefore = await runWithoutTenant(() =>
      prisma.organizationUser.findMany({
        where: { organizationId, userId: { in: hiddenUserIds } },
        orderBy: { userId: "asc" },
        select: { id: true, userId: true },
      }),
    );
    const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
    const emptyRelatedRepo = { getManyOrThrowCompanyWide: vi.fn().mockResolvedValue([]) };
    const precheck = { update: vi.fn().mockResolvedValue(undefined) };

    const result = await runWithTenant(actor, () =>
      new UpdateOrganizationInteractor(
        new PrismaOrganizationRepo(),
        emptyRelatedRepo as never,
        emptyRelatedRepo as never,
        emptyRelatedRepo as never,
        eventService as never,
        precheck as never,
      ).invoke({ id: organizationId, name: "After", userIds: [actorId] }),
    );

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: organizationId,
        name: "After",
        users: [expect.objectContaining({ id: actorId })],
      }),
    });

    const joinsAfter = await runWithoutTenant(() =>
      prisma.organizationUser.findMany({
        where: { organizationId },
        orderBy: { userId: "asc" },
        select: { id: true, userId: true },
      }),
    );
    expect(joinsAfter).toHaveLength(3);
    expect(joinsAfter.filter(({ userId }) => hiddenUserIds.includes(userId))).toEqual(hiddenJoinsBefore);

    const organizationEvent = eventService.publish.mock.calls.find(
      ([event]) => event === DomainEvent.ORGANIZATION_UPDATED,
    );
    expect(organizationEvent?.[1]).toEqual(
      expect.objectContaining({
        entityId: organizationId,
        payload: expect.objectContaining({
          organization: expect.objectContaining({ users: [expect.objectContaining({ id: actorId })] }),
          changes: expect.objectContaining({
            name: { previous: "Before", current: "After" },
          }),
        }),
      }),
    );
    expect(organizationEvent?.[1].payload.changes).not.toHaveProperty("users");
  });
});
