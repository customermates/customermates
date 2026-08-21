import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createZodError } from "@/core/validation/validation.utils";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { Write } from "../write.decorator";

vi.mock("@/core/validation/zod-error-map-server", () => ({
  getZodParseContext: () => Promise.resolve({}),
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("../tenant-context");
const { getTransactionClient } = await import("../transaction-context");
const { runInTransaction } = await import("../transaction-runner");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const fixtureIds: string[] = [];

class OutputValidatedWriteFixture {
  @Write({
    input: z.object({ companyId: z.uuid() }),
    output: z.object({ id: z.uuid() }),
  })
  async invoke(data: { companyId: string }): Promise<{ ok: true; data: { id: string } }> {
    const tx = getTransactionClient<typeof prisma>();
    await tx?.company.create({ data: { id: data.companyId } });
    return { ok: true, data: { id: "invalid-output-id" } };
  }
}

describeDatabase("structured interactor rollback against PostgreSQL", { timeout: 120_000 }, () => {
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: fixtureIds } } }));
    await prisma.$disconnect();
  });

  it("does not commit a row when the transaction returns a structured failure", async () => {
    const companyId = randomUUID();
    fixtureIds.push(companyId);
    const failure = {
      ok: false as const,
      error: createZodError("Expected business failure"),
    };

    const result = await runWithoutTenant(() =>
      runInTransaction(async () => {
        const tx = getTransactionClient<typeof prisma>();
        await tx?.company.create({ data: { id: companyId } });
        return failure;
      }),
    );

    expect(result).toBe(failure);
    await expect(runWithoutTenant(() => prisma.company.findUnique({ where: { id: companyId } }))).resolves.toBeNull();
  });

  it("rolls back an outer write when a nested transaction returns a structured failure", async () => {
    const companyId = randomUUID();
    fixtureIds.push(companyId);
    const failure = {
      ok: false as const,
      error: createZodError("Nested business failure"),
    };

    const result = await runWithoutTenant(() =>
      runInTransaction(async () => {
        const tx = getTransactionClient<typeof prisma>();
        await tx?.company.create({ data: { id: companyId } });
        return runInTransaction(() => Promise.resolve(failure));
      }),
    );

    expect(result).toBe(failure);
    await expect(runWithoutTenant(() => prisma.company.findUnique({ where: { id: companyId } }))).resolves.toBeNull();
  });

  it("commits a successful control transaction", async () => {
    const companyId = randomUUID();
    fixtureIds.push(companyId);

    const result = await runWithoutTenant(() =>
      runInTransaction(async () => {
        const tx = getTransactionClient<typeof prisma>();
        await tx?.company.create({ data: { id: companyId } });
        return { ok: true as const, data: companyId };
      }),
    );

    expect(result).toEqual({ ok: true, data: companyId });
    await expect(
      runWithoutTenant(() => prisma.company.findUnique({ where: { id: companyId } })),
    ).resolves.toMatchObject({
      id: companyId,
    });
  });

  it("rolls back a write when output validation rejects", async () => {
    const companyId = randomUUID();
    fixtureIds.push(companyId);

    await expect(
      runWithoutTenant(() => new OutputValidatedWriteFixture().invoke({ companyId })),
    ).rejects.toBeInstanceOf(z.ZodError);
    await expect(runWithoutTenant(() => prisma.company.findUnique({ where: { id: companyId } }))).resolves.toBeNull();
  });
});
