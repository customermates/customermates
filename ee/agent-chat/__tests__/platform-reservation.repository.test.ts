import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  hostedAiPlatformReservation: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  hostedAiPlatformUsage: { upsert: vi.fn() },
}));

vi.mock("@/prisma/db", () => ({ prisma: db }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud", HOSTED_AI_OPERATOR_CONTROLS_ENABLED: false } }));

import { PrismaAgentChatRepo } from "../prisma-agent-chat.repository";
import { prismaAgentChatRepoDependencies } from "@/tests/helpers/prisma-agent-chat-repo";

const repo = () => new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
const now = new Date("2026-10-01T12:00:00Z");
const charge = { model: "embedding", inputTokens: 2, costMicrocents: 3, costSource: "measured" as const };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
  db.$executeRaw.mockResolvedValue(undefined);
  db.hostedAiPlatformReservation.create.mockResolvedValue({ id: "hold" });
  db.hostedAiPlatformReservation.findUnique.mockResolvedValue({ purpose: "docsIndexing", model: charge.model });
  db.hostedAiPlatformReservation.findMany.mockResolvedValue([]);
  db.hostedAiPlatformReservation.deleteMany.mockResolvedValue({ count: 1 });
  db.hostedAiPlatformUsage.upsert.mockResolvedValue({ id: "accrual" });
});

describe("Platform reservation Prisma boundaries", () => {
  it("keeps fractional credit amounts exact when creating a hold", async () => {
    const id = await repo().reservePlatformUsageUnscoped({
      purpose: "docsIndexing",
      model: charge.model,
      reservedMicrocents: 7,
      now,
    });
    expect(db.hostedAiPlatformReservation.create).toHaveBeenCalledExactlyOnceWith({
      data: { id, purpose: "docsIndexing", model: charge.model, reservedMicrocents: 7n, createdAt: now },
      select: { id: true },
    });
  });

  it("takes the global lock before reading and releasing a hold", async () => {
    await repo().settlePlatformUsageUnscoped({ reservationId: "hold", charge, now });
    expect((db.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join("?")).toContain(
      "customermates:hosted-ai-global-admission",
    );
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.hostedAiPlatformReservation.findUnique.mock.invocationCallOrder[0],
    );
    expect(db.hostedAiPlatformReservation.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      db.hostedAiPlatformReservation.deleteMany.mock.invocationCallOrder[0],
    );
    expect(db.hostedAiPlatformReservation.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.hostedAiPlatformUsage.upsert.mock.invocationCallOrder[0],
    );
    expect(db.hostedAiPlatformUsage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          model: charge.model,
          inputTokens: { increment: 2 },
          costMicrocents: { increment: 3n },
          updatedAt: now,
        },
      }),
    );
  });

  it("makes duplicate settlement a no-op after the hold has been removed", async () => {
    db.hostedAiPlatformReservation.findUnique.mockResolvedValueOnce(null);
    await repo().settlePlatformUsageUnscoped({ reservationId: "hold", charge, now });
    expect(db.hostedAiPlatformReservation.deleteMany).not.toHaveBeenCalled();
    expect(db.hostedAiPlatformUsage.upsert).not.toHaveBeenCalled();
  });

  it("releases a never-started hold without inventing provider cost", async () => {
    await repo().settlePlatformUsageUnscoped({ reservationId: "hold", charge: null, now });
    expect(db.hostedAiPlatformReservation.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: "hold" } });
    expect(db.hostedAiPlatformUsage.upsert).not.toHaveBeenCalled();
  });

  it("does not silently settle a hold lost between the locked read and delete", async () => {
    db.hostedAiPlatformReservation.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(repo().settlePlatformUsageUnscoped({ reservationId: "hold", charge, now })).rejects.toThrow(
      "Platform AI reservation changed before settlement.",
    );
    expect(db.hostedAiPlatformUsage.upsert).not.toHaveBeenCalled();
  });

  it("keeps stale estimated spend in the original hold's month", async () => {
    const createdAt = new Date("2026-09-30T23:59:00Z");
    db.hostedAiPlatformReservation.findMany.mockResolvedValueOnce([
      { id: "stale", purpose: "docsIndexing", model: charge.model, reservedMicrocents: 7n, createdAt },
    ]);
    const reservedBefore = new Date("2026-10-01T11:45:00Z");
    await expect(repo().settleStalePlatformReservationsUnscoped({ reservedBefore, now })).resolves.toBe(1);
    expect(db.hostedAiPlatformReservation.findMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: reservedBefore } },
      select: { id: true, purpose: true, model: true, reservedMicrocents: true, createdAt: true },
    });
    expect(db.hostedAiPlatformReservation.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["stale"] }, createdAt: { lt: reservedBefore } },
    });
    expect(db.hostedAiPlatformUsage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          accrualMonth: new Date("2026-09-01T00:00:00Z"),
          costMicrocents: 7n,
          inputTokens: 0,
          createdAt,
        }),
      }),
    );
  });

  it("does not silently accrue stale reservations lost before deletion", async () => {
    db.hostedAiPlatformReservation.findMany.mockResolvedValueOnce([
      { id: "stale", purpose: "docsIndexing", model: charge.model, reservedMicrocents: 7n, createdAt: now },
    ]);
    db.hostedAiPlatformReservation.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(repo().settleStalePlatformReservationsUnscoped({ reservedBefore: now, now })).rejects.toThrow(
      "Platform AI reservations changed before stale settlement.",
    );
    expect(db.hostedAiPlatformUsage.upsert).not.toHaveBeenCalled();
  });
});
