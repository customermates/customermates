import { prismaAgentChatRepoDependencies } from "@/tests/helpers/prisma-agent-chat-repo";
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import type { PrismaAgentChatRepo } from "../prisma-agent-chat.repository";

vi.mock("@/core/validation/zod-error-map-server", () => ({
  getZodParseContext: vi.fn().mockResolvedValue(undefined),
}));

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("agent turn surface against PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const conversationId = randomUUID();
  const routineId = randomUUID();
  let repo: PrismaAgentChatRepo;
  const asTenant = <T>(run: () => Promise<T>) => runWithTenant(createMockUser({ id: userId, companyId }), run);

  async function turn(externalRunId: string) {
    const turnRequestId = randomUUID();
    await client.query(
      `INSERT INTO "AgentTurnRequest"
       ("id","companyId","userId","conversationId","clientRequestId","text","status","runId",
        "externalRunId","userMessageId","updatedAt")
       VALUES ($1,$2,$3,$4,$5,'synthetic surface fixture','completed',$6,$7,$8,CURRENT_TIMESTAMP)`,
      [turnRequestId, companyId, userId, conversationId, randomUUID(), randomUUID(), externalRunId, randomUUID()],
    );
    return turnRequestId;
  }

  beforeAll(async () => {
    const { PrismaAgentChatRepo } = await import("../prisma-agent-chat.repository");
    repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    await client.connect();
    await client.query('INSERT INTO "Company" ("id","updatedAt") VALUES ($1,CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      `INSERT INTO "User" ("id","email","firstName","lastName","companyId","status","updatedAt")
       VALUES ($1,$2,'Surface','Fixture',$3,'active',CURRENT_TIMESTAMP)`,
      [userId, `${userId}@example.invalid`, companyId],
    );
    await client.query(
      `INSERT INTO "AgentConversation" ("id","companyId","userId","origin","updatedAt")
       VALUES ($1,$2,$3,'routine',CURRENT_TIMESTAMP)`,
      [conversationId, companyId, userId],
    );
    await client.query(
      `INSERT INTO "Routine" ("id","companyId","ownerUserId","name","prompt","triggerKind","updatedAt")
       VALUES ($1,$2,$3,'Weekly refresh','Refresh the pricing page','schedule',CURRENT_TIMESTAMP)`,
      [routineId, companyId, userId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("names a routine run's turn routine and a follow-up chat turn in the same conversation chat", async () => {
    const routineRunId = `wrun_fixture_${randomUUID()}`;
    const chatRunId = `wrun_fixture_${randomUUID()}`;
    const routineTurn = await turn(routineRunId);
    await turn(chatRunId);
    await client.query(
      `INSERT INTO "RoutineRun"
       ("id","companyId","routineId","executedByUserId","executedByName","conversationId","turnRequestId",
        "status","triggerKind","scheduledFor","updatedAt")
       VALUES ($1,$2,$3,$4,'Surface Fixture',$5,$6,'succeeded','schedule',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      [randomUUID(), companyId, routineId, userId, conversationId, routineTurn],
    );

    expect(await asTenant(() => repo.findAgentTurnSurface(routineRunId))).toBe("routine");
    expect(await asTenant(() => repo.findAgentTurnSurface(chatRunId))).toBe("chat");
    expect(await asTenant(() => repo.findAgentTurnSurface(`wrun_fixture_${randomUUID()}`))).toBe("chat");
  });

  it("does not read another company's routine run", async () => {
    const routineRunId = `wrun_fixture_${randomUUID()}`;
    await turn(routineRunId);
    const otherUser = createMockUser({ id: randomUUID(), companyId: randomUUID() });

    expect(await runWithTenant(otherUser, () => repo.findAgentTurnSurface(routineRunId))).toBe("chat");
  });
});
