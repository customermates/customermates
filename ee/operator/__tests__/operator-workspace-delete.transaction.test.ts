import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

const prismaMock = vi.hoisted(() => {
  const transactionClient = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    company: { findUnique: vi.fn().mockResolvedValue(null) },
    auditLog: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    webhookDelivery: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };

  return {
    transactionClient,
    prisma: {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transactionClient) => Promise<unknown>,
          _options?: { timeout?: number; maxWait?: number },
        ) => callback(transactionClient),
      ),
    },
  };
});

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/prisma/db", () => ({ prisma: prismaMock.prisma }));

import { runWithOperator } from "@/core/decorators/operator-context";

import { PrismaOperatorRepo } from "../prisma-operator.repository";

describe("PrismaOperatorRepo workspace deletion transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.transactionClient.company.findUnique.mockResolvedValue(null);
  });

  it("uses the bulk-write budget and locks the target workspace before reading it", async () => {
    const companyId = "00000000-0000-4000-8000-000000000001";

    await expect(
      runWithOperator(
        {
          authUserId: "operator-auth-user",
          userId: "operator-user",
          companyId: "00000000-0000-4000-8000-000000000002",
          email: "operator@example.invalid",
        },
        () =>
          new PrismaOperatorRepo().deleteWorkspaceUnscoped({
            companyId,
            confirmWorkspaceLabel: "workspace.invalid",
            reason: "Local transaction contract test",
          }),
      ),
    ).resolves.toBe("notFound");

    expect(prismaMock.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
      maxWait: 10_000,
    });
    expect(prismaMock.transactionClient.$executeRaw).toHaveBeenCalledWith(expect.any(Array), companyId);
    expect(prismaMock.transactionClient.$executeRaw).toHaveBeenCalledBefore(
      prismaMock.transactionClient.company.findUnique,
    );
  });
});
