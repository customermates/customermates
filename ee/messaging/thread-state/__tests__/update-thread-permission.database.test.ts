import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: () => "This action is not available with your current permissions." }),
}));

import { Resource, Action } from "@/generated/prisma";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { getUpdateThreadInteractor } from "@/core/di";
import { serializeTypedResult } from "@/core/utils/action-result";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Inbox sharing after permission revocation", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const accountId = randomUUID();
  const threadId = randomUUID();

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" (id,"updatedAt") VALUES ($1,NOW())', [companyId]);
    await client.query(
      'INSERT INTO "UserRole" (id,name,"isSystemRole","companyId","updatedAt") VALUES ($1,$2,false,$3,NOW())',
      [roleId, `inbox-${roleId}`, companyId],
    );
    await client.query(
      'INSERT INTO "RolePermission" (id,"roleId","companyId",resource,action) VALUES ($1,$2,$3,$4::"Resource",$5::"Action"),($6,$2,$3,$4::"Resource",$7::"Action")',
      [randomUUID(), roleId, companyId, Resource.inboxMessages, Action.readAll, randomUUID(), Action.update],
    );
    await client.query(
      'INSERT INTO "User" (id,email,"firstName","lastName","companyId","roleId",status,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,\'active\',NOW())',
      [userId, `inbox-${userId}@example.invalid`, "Inbox", "Owner", companyId, roleId],
    );
    await client.query(
      'INSERT INTO "ConnectedAccount" (id,"companyId","userId",provider,"unipileAccountId",status,"updatedAt") VALUES ($1,$2,$3,\'mail\',$4,\'ok\',NOW())',
      [accountId, companyId, userId, `inbox-${accountId}`],
    );
    await client.query(
      'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId",provider,type,"unipileThreadId","sharedToCrm","updatedAt") VALUES ($1,$2,$3,\'mail\',\'single\',$4,false,NOW())',
      [threadId, companyId, accountId, `draft-${threadId}`],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE id=$1', [companyId]);
    await client.end();
  });

  it("returns a typed refusal and leaves an owned private draft private", async () => {
    await client.query(
      'DELETE FROM "RolePermission" WHERE "companyId"=$1 AND "roleId"=$2 AND resource=$3::"Resource"',
      [companyId, roleId, Resource.inboxMessages],
    );

    const result = await runAsBackgroundTenant(userId, () =>
      serializeTypedResult(getUpdateThreadInteractor().invoke({ threadId, sharedToCrm: true })),
    );
    const persisted = await client.query('SELECT "sharedToCrm" FROM "MessagingThread" WHERE id=$1', [threadId]);

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: "authorization", issues: [{ customCode: CustomErrorCode.permissionDenied }] },
    });
    expect(persisted.rows).toEqual([{ sharedToCrm: false }]);
  });
});
