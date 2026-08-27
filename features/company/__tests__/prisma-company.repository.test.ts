import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const transactionClient = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    subscription: { upsert: vi.fn().mockResolvedValue({}) },
  };
  return {
    transactionClient,
    prisma: {
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
      ),
    },
  };
});

vi.mock("@/prisma/db", () => ({ prisma: prismaMock.prisma }));

import { PrismaCompanyRepo } from "../prisma-company.repository";

describe("PrismaCompanyRepo subscription synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes the same company transaction lock used by hosted-AI reservations", async () => {
    const companyId = "00000000-0000-4000-8000-000000000001";
    const agentCreditAnchorAt = new Date("2026-08-06T10:00:00.000Z");

    await new PrismaCompanyRepo().upsertSubscriptionUnscoped({
      companyId,
      lemonSqueezyId: "subscription-1",
      lemonSqueezyVariantId: "variant-1",
      status: "active",
      plan: "pro",
      quantity: 3,
      currentPeriodEnd: new Date("2027-08-06T10:00:00.000Z"),
      agentCreditAnchorAt,
    });

    expect(prismaMock.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.transactionClient.$executeRaw).toHaveBeenCalledWith(expect.any(Array), companyId);
    expect(prismaMock.transactionClient.subscription.upsert).toHaveBeenCalledWith({
      where: { companyId },
      create: expect.objectContaining({ companyId, status: "active", plan: "pro", agentCreditAnchorAt }),
      update: expect.objectContaining({ companyId, status: "active", plan: "pro", agentCreditAnchorAt }),
    });
  });

  it("holds the company lock around the subscription service read/derive/write callback", async () => {
    const companyId = "00000000-0000-4000-8000-000000000001";
    const callback = vi.fn().mockResolvedValue("complete");

    await expect(new PrismaCompanyRepo().withSubscriptionCompanyLockUnscoped(companyId, callback)).resolves.toBe(
      "complete",
    );

    expect(prismaMock.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.transactionClient.$executeRaw).toHaveBeenCalledWith(expect.any(Array), companyId);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(prismaMock.transactionClient.$executeRaw).toHaveBeenCalledBefore(callback);
  });
});
