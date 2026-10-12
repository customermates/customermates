import { randomUUID } from "node:crypto";

import { Client } from "pg";

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

  it("ends a wait on a lock held elsewhere within the transaction timeout", async () => {
    const companyId = randomUUID();
    const holder = new Client({ connectionString: process.env.DATABASE_URL });
    await holder.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
      const startedAt = Date.now();
      await expect(
        runWithoutTenant(() => runInTransaction(() => Promise.resolve("blocked"), { companyId, timeout: 2000 })),
      ).rejects.toThrow();
      expect(Date.now() - startedAt).toBeLessThan(10_000);
    } finally {
      await holder.query("ROLLBACK");
      await holder.end();
    }
    await expect(
      runWithoutTenant(() => runInTransaction(() => Promise.resolve("free"), { companyId, timeout: 2000 })),
    ).resolves.toBe("free");
  });

  it("returns clean connections after a timed-out transaction that issued concurrent queries", async () => {
    const companyId = randomUUID();
    const client = () => {
      const tx = getTransactionClient<typeof prisma>();
      if (!tx) throw new Error("Missing transaction client");
      return tx;
    };
    await expect(
      runWithoutTenant(() =>
        runInTransaction(
          async () => {
            const tx = client();
            await Promise.all([1, 2, 3].map(() => tx.$queryRaw`SELECT pg_sleep(1.5)`));
          },
          { companyId, timeout: 2000 },
        ),
      ),
    ).rejects.toThrow();
    const answers = await Promise.all(
      Array.from({ length: 12 }, () =>
        runWithoutTenant(() =>
          runInTransaction(async () => (await client().$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`)[0]?.ok, {
            companyId,
            timeout: 5000,
            maxWait: 10_000,
          }),
        ),
      ),
    );
    expect(answers).toEqual(Array.from({ length: 12 }, () => 1));
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
