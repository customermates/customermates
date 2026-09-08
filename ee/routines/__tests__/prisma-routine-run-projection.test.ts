import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";

const prismaMock = vi.hoisted(() => ({
  routineRun: { findMany: vi.fn() },
  agentTurnRequest: { findMany: vi.fn() },
}));

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));

import { runWithTenant } from "@/core/decorators/tenant-context";

import { PrismaRoutineRepo } from "../prisma-routine.repository";

const user = createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readAll }]);
const createdAt = new Date("2026-09-08T16:00:00.000Z");

function storedRun(args: { id: string; conversationId: string | null; turnRequestId: string | null }) {
  return {
    ...args,
    routineId: "routine-1",
    executedByUserId: user.id,
    executedByName: "Routine Owner",
    status: "partial",
    triggerKind: "schedule",
    triggerEvent: null,
    triggerEntityId: null,
    triggerPayload: null,
    scheduledFor: createdAt,
    startedAt: createdAt,
    finishedAt: createdAt,
    terminalCode: "partial",
    chargedCredits: 1,
    summary: "The initial run stopped early.",
    error: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("PrismaRoutineRepo run projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bulk-loads only the visible runs' linked turn requests", async () => {
    prismaMock.routineRun.findMany.mockResolvedValue([
      storedRun({
        id: "run-1",
        conversationId: "conversation-1",
        turnRequestId: "turn-original",
      }),
      storedRun({ id: "run-2", conversationId: null, turnRequestId: null }),
      storedRun({
        id: "run-lookahead",
        conversationId: "conversation-2",
        turnRequestId: "turn-lookahead",
      }),
    ]);
    prismaMock.agentTurnRequest.findMany.mockResolvedValue([
      {
        id: "turn-original",
        conversationId: "conversation-1",
        userId: user.id,
        stopReason: "provider_error",
      },
    ]);

    const result = await runWithTenant(user, () => new PrismaRoutineRepo().getRoutineRuns("routine-1", 2));

    const routineRunQuery = prismaMock.routineRun.findMany.mock.calls[0]?.[0];
    expect(routineRunQuery?.select).not.toHaveProperty("conversation");
    expect(prismaMock.agentTurnRequest.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["turn-original"] }, companyId: user.companyId },
      select: {
        id: true,
        conversationId: true,
        userId: true,
        stopReason: true,
      },
    });
    expect(result.runs.map(({ id, stopReason }) => ({ id, stopReason }))).toEqual([
      { id: "run-1", stopReason: "provider_error" },
      { id: "run-2", stopReason: null },
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it("ignores a linked turn whose owner or conversation does not match the run", async () => {
    prismaMock.routineRun.findMany.mockResolvedValue([
      storedRun({
        id: "run-1",
        conversationId: "conversation-1",
        turnRequestId: "turn-original",
      }),
    ]);
    prismaMock.agentTurnRequest.findMany.mockResolvedValue([
      {
        id: "turn-original",
        conversationId: "conversation-other",
        userId: user.id,
        stopReason: "cancelled",
      },
    ]);

    const result = await runWithTenant(user, () => new PrismaRoutineRepo().getRoutineRuns("routine-1", 10));

    expect(result.runs[0]?.stopReason).toBeNull();
  });
});
