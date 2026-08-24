import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PrismaAgentChatRepo } from "../prisma-agent-chat.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("agent turn cancellation against PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const conversationId = randomUUID();

  const tenant: TenantUser = createMockUser({ companyId, id: userId });
  const asTenant = <T>(fn: () => Promise<T>) => runWithTenant(tenant, fn);
  const repo = () => new PrismaAgentChatRepo();

  async function insertTurn(id: string, status: string, owner = userId) {
    await client.query(
      `INSERT INTO "AgentTurnRequest"
         ("id","companyId","userId","conversationId","clientRequestId","text","status","runId","userMessageId","updatedAt")
       VALUES ($1,$2,$3,$4,$5,'audit',$6::"AgentTurnStatus",$7,$8, CURRENT_TIMESTAMP)`,
      [id, companyId, owner, conversationId, randomUUID(), status, randomUUID(), randomUUID()],
    );
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    for (const id of [userId, otherUserId]) {
      await client.query(
        `INSERT INTO "User" ("id","email","firstName","lastName","companyId","updatedAt")
         VALUES ($1, $2, 'Cancel', 'Tester', $3, CURRENT_TIMESTAMP)`,
        [id, `${id}@example.com`, companyId],
      );
    }
    await client.query(
      `INSERT INTO "AgentConversation" ("id","companyId","userId","updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [conversationId, companyId, userId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AgentTurnRequest" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "AgentConversation" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("marks the running turn so the workflow stops at its next boundary", async () => {
    const turnRequestId = randomUUID();
    await insertTurn(turnRequestId, "running");

    expect(await asTenant(() => repo().isAgentTurnCancellationRequestedUnscoped({ turnRequestId, companyId }))).toBe(
      false,
    );
    expect(await asTenant(() => repo().requestAgentTurnCancellation({ conversationId }))).toBe(true);
    expect(await asTenant(() => repo().isAgentTurnCancellationRequestedUnscoped({ turnRequestId, companyId }))).toBe(
      true,
    );
  });

  it("is idempotent, so a second stop does not move the requested time", async () => {
    const turnRequestId = randomUUID();
    await insertTurn(turnRequestId, "running");
    await asTenant(() => repo().requestAgentTurnCancellation({ conversationId }));

    const first = await client.query('SELECT "cancellationRequestedAt" FROM "AgentTurnRequest" WHERE "id" = $1', [
      turnRequestId,
    ]);
    expect(await asTenant(() => repo().requestAgentTurnCancellation({ conversationId }))).toBe(false);
    const second = await client.query('SELECT "cancellationRequestedAt" FROM "AgentTurnRequest" WHERE "id" = $1', [
      turnRequestId,
    ]);

    expect(second.rows[0].cancellationRequestedAt).toEqual(first.rows[0].cancellationRequestedAt);
  });

  it("leaves a turn that already finished alone", async () => {
    const turnRequestId = randomUUID();
    await insertTurn(turnRequestId, "completed");

    expect(await asTenant(() => repo().requestAgentTurnCancellation({ conversationId }))).toBe(false);
    expect(await asTenant(() => repo().isAgentTurnCancellationRequestedUnscoped({ turnRequestId, companyId }))).toBe(
      false,
    );
  });

  it("never cancels another user's turn in the same workspace", async () => {
    const turnRequestId = randomUUID();
    await insertTurn(turnRequestId, "running", otherUserId);

    expect(await asTenant(() => repo().requestAgentTurnCancellation({ conversationId }))).toBe(false);
    expect(await asTenant(() => repo().isAgentTurnCancellationRequestedUnscoped({ turnRequestId, companyId }))).toBe(
      false,
    );
  });
});
