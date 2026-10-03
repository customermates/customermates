import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/prisma/db";
import { runWithTenant, runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PrismaThreadRecordsRepo } from "../prisma-thread-records.repository";

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("conversation record query tenancy and private account access", () => {
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const colleagueId = randomUUID();
  const foreignId = randomUUID();
  const threads = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const accounts = [randomUUID(), randomUUID(), randomUUID()];
  const repo = new PrismaThreadRecordsRepo();
  const actor = { ...createMockUser(), id: ownerId, companyId };

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.createMany({ data: [{ id: companyId }, { id: otherCompanyId }] });
      await prisma.user.createMany({
        data: [
          { id: ownerId, companyId },
          { id: colleagueId, companyId },
          { id: foreignId, companyId: otherCompanyId },
        ].map((user) => ({ ...user, email: `${user.id}@example.test`, firstName: "Scope", lastName: "Fixture" })),
      });
      await prisma.connectedAccount.createMany({
        data: [ownerId, colleagueId, foreignId].map((userId, index) => ({
          id: accounts[index],
          companyId: index === 2 ? otherCompanyId : companyId,
          userId,
          unipileAccountId: randomUUID(),
          provider: "mail",
          status: "ok",
        })),
      });
      await prisma.messagingThread.createMany({
        data: threads.map((id, index) => ({
          id,
          companyId: index === 3 ? otherCompanyId : companyId,
          connectedAccountId: accounts[index === 3 ? 2 : index === 0 ? 0 : 1],
          unipileThreadId: randomUUID(),
          provider: "mail",
          sharedToCrm: index >= 2,
        })),
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } }));
  });

  it("reads owned and shared conversations, denies another member's private conversation and a foreign shared ID", async () => {
    for (const [index, threadId] of threads.entries())
      expect(await runWithTenant(actor, () => repo.canAccessThread(threadId))).toBe(index === 0 || index === 2);
  });

  it("rechecks account sharing against the live database", async () => {
    await runWithoutTenant(() =>
      prisma.connectedAccount.update({ where: { id: accounts[1] }, data: { shared: true } }),
    );
    expect(await runWithTenant(actor, () => repo.canAccessThread(threads[1]))).toBe(true);
    await runWithoutTenant(() =>
      prisma.connectedAccount.update({ where: { id: accounts[1] }, data: { shared: false } }),
    );
    expect(await runWithTenant(actor, () => repo.canAccessThread(threads[1]))).toBe(false);
  });
});
