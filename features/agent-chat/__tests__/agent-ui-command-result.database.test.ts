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

describeDatabase("agent ui command results against PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const conversationId = randomUUID();
  const commandId = randomUUID();

  const tenant: TenantUser = createMockUser({ companyId, id: userId });
  const asTenant = <T>(fn: () => Promise<T>) => runWithTenant(tenant, fn);

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      `INSERT INTO "User" ("id","email","firstName","lastName","companyId","updatedAt")
       VALUES ($1, $2, 'Ui', 'Command', $3, CURRENT_TIMESTAMP)`,
      [userId, `${userId}@example.com`, companyId],
    );
    await client.query(
      `INSERT INTO "AgentConversation" ("id","companyId","userId","updatedAt")
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [conversationId, companyId, userId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AgentUiCommandResult" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "AgentConversation" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("records a repeated command result, which is what a second navigation in one turn does", async () => {
    const record = (result: string) =>
      asTenant(() =>
        new PrismaAgentChatRepo().recordUiCommandResult({
          conversationId,
          commandId,
          name: "navigate",
          ok: true,
          result,
        }),
      );

    await record("Navigated to /organizations.");
    await expect(record("Navigated to /organizations/abc.")).resolves.not.toThrow();

    const rows = await client.query<{ result: string }>(
      'SELECT "result" FROM "AgentUiCommandResult" WHERE "companyId" = $1 AND "commandId" = $2',
      [companyId, commandId],
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.result).toBe("Navigated to /organizations/abc.");
  });
});
