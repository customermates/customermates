import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: { APP_MODE: "cloud", DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));
vi.mock("@/core/di", () => ({
  getDealRepo: () => new PrismaDealRepo(new PrismaCompanyRepo()),
  getCustomColumnRepo: () => new PrismaCustomColumnRepo(new PrismaCompanyRepo()),
}));

const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
const { PrismaDealRepo } = await import("@/features/deals/prisma-deal.repository");
const { PrismaCustomColumnRepo } = await import("@/features/custom-column/prisma-custom-column.repository");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

async function makeWorkspace() {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);
    const optionValue = randomUUID();
    const column = await prisma.customColumn.create({
      data: {
        companyId: company.id,
        label: "Stage",
        type: "singleSelect",
        entityType: "deal",
        options: {
          options: [{ value: optionValue, label: "Qualified", color: "info", isDefault: true, index: 0, weight: 25 }],
        },
      },
    });
    await prisma.company.update({ where: { id: company.id }, data: { dealWeightingColumnId: column.id } });
    const deal = await prisma.deal.create({ data: { companyId: company.id, name: "Weighted deal" } });
    const service = await prisma.service.create({ data: { companyId: company.id, name: "Service", amount: 100 } });
    await prisma.serviceDeal.create({
      data: { companyId: company.id, serviceId: service.id, dealId: deal.id, quantity: 2 },
    });
    await prisma.customFieldValue.create({
      data: {
        companyId: company.id,
        entityType: "deal",
        type: "singleSelect",
        columnId: column.id,
        dealId: deal.id,
        value: optionValue,
      },
    });
    return { company, column, deal, optionValue, user: createMockUser({ id: randomUUID(), companyId: company.id }) };
  });
}

function readDeal(id: string) {
  return runWithoutTenant(() =>
    prisma.deal.findUniqueOrThrow({
      where: { id },
      select: { totalValue: true, totalQuantity: true, weightedValue: true },
    }),
  );
}

describeDatabase("company-owned deal weighting configuration", () => {
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companyIds } } }));
    await prisma.$disconnect();
  });

  it("uses the active tenant's configuration without recalculating another tenant's deal", async () => {
    const first = await makeWorkspace();
    const second = await makeWorkspace();
    const repo = new PrismaDealRepo(new PrismaCompanyRepo());
    await runWithTenant(first.user, () =>
      runInTransaction(() => repo.recalculateTotals([first.deal.id, second.deal.id])),
    );
    expect(await readDeal(first.deal.id)).toEqual({ totalValue: 200, totalQuantity: 2, weightedValue: 50 });
    expect(await readDeal(second.deal.id)).toEqual({ totalValue: 0, totalQuantity: 0, weightedValue: null });
  });

  it("recalculates using selected stage weights written in the same transaction", async () => {
    const fixture = await makeWorkspace();
    await runWithTenant(fixture.user, () =>
      new PrismaCompanyRepo().setDealStageWeights([{ optionValue: fixture.optionValue, weight: 60 }]),
    );
    expect(await readDeal(fixture.deal.id)).toEqual({ totalValue: 200, totalQuantity: 2, weightedValue: 120 });
  });

  it("rolls back stage weights and weighted totals when the outer transaction fails", async () => {
    const fixture = await makeWorkspace();
    const companyRepo = new PrismaCompanyRepo();
    const dealRepo = new PrismaDealRepo(companyRepo);
    await runWithTenant(fixture.user, () => runInTransaction(() => dealRepo.recalculateTotals([fixture.deal.id])));
    await expect(
      runWithTenant(fixture.user, () =>
        runInTransaction(async () => {
          await companyRepo.setDealStageWeights([{ optionValue: fixture.optionValue, weight: 60 }]);
          throw new Error("Forced rollback");
        }),
      ),
    ).rejects.toThrow("Forced rollback");
    expect((await readDeal(fixture.deal.id)).weightedValue).toBe(50);
    const column = await runWithoutTenant(() =>
      prisma.customColumn.findUniqueOrThrow({
        where: { id: fixture.column.id },
        select: { options: true },
      }),
    );
    expect(column.options).toEqual(fixture.column.options);
  });

  it("clears weighted totals after deleting the selected column", async () => {
    const fixture = await makeWorkspace();
    const companyRepo = new PrismaCompanyRepo();
    const dealRepo = new PrismaDealRepo(companyRepo);
    const columnRepo = new PrismaCustomColumnRepo(companyRepo);
    await runWithTenant(fixture.user, () => runInTransaction(() => dealRepo.recalculateTotals([fixture.deal.id])));
    await runWithTenant(fixture.user, () => columnRepo.delete(fixture.column.id));
    expect(await runWithTenant(fixture.user, () => companyRepo.getDealWeightingColumnId())).toBeNull();
    expect(await readDeal(fixture.deal.id)).toEqual({ totalValue: 200, totalQuantity: 2, weightedValue: null });
  });

  it("preserves weighting for an unrelated column's update or deletion", async () => {
    const fixture = await makeWorkspace();
    const companyRepo = new PrismaCompanyRepo();
    const columnRepo = new PrismaCustomColumnRepo(companyRepo);
    const unrelated = await runWithoutTenant(() =>
      prisma.customColumn.create({
        data: {
          companyId: fixture.company.id,
          label: "Unrelated stage",
          type: "singleSelect",
          entityType: "deal",
          options: fixture.column.options ?? [],
        },
      }),
    );
    await runWithTenant(fixture.user, async () => {
      await runInTransaction(() => new PrismaDealRepo(companyRepo).recalculateTotals([fixture.deal.id]));
      await columnRepo.setOptionWeights(unrelated.id, [{ optionValue: fixture.optionValue, weight: 95 }]);
      await columnRepo.delete(unrelated.id);
    });
    expect(await readDeal(fixture.deal.id)).toEqual({ totalValue: 200, totalQuantity: 2, weightedValue: 50 });
    expect(await runWithTenant(fixture.user, () => companyRepo.getDealWeightingColumnId())).toBe(fixture.column.id);
  });

  it("preserves ordinary totals when weighting is disabled", async () => {
    const fixture = await makeWorkspace();
    const companyRepo = new PrismaCompanyRepo();
    await runWithTenant(fixture.user, () => companyRepo.updateDetails({ dealWeightingColumnId: null }));
    expect(await runWithTenant(fixture.user, () => companyRepo.getDealWeightingColumnId())).toBeNull();
    expect(await readDeal(fixture.deal.id)).toEqual({ totalValue: 200, totalQuantity: 2, weightedValue: null });
  });
});
