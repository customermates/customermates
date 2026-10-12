import type { Client } from "pg";

import { randomUUID } from "node:crypto";

import { defaultKeyHasher } from "@better-auth/api-key";

export type ApiKeyMember = { userId: string; apiKey: string };

type MemberSpec = {
  label: string;
  systemRole: boolean;
  permissions?: Array<[resource: string, action: string]>;
};

export async function createApiKeyTenant(
  client: Client,
  members: MemberSpec[],
) {
  const companyId = randomUUID();
  const authUserIds: string[] = [];
  const apiKeyIds: string[] = [];
  const created: ApiKeyMember[] = [];

  await client.query(
    'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)',
    [companyId],
  );

  for (const member of members) {
    const roleId = randomUUID();
    const userId = randomUUID();
    const authUserId = randomUUID();
    const apiKeyId = randomUUID();
    const apiKey = randomUUID().replaceAll("-", "").repeat(2);
    const email = `${member.label}-${userId}@example.invalid`;

    await client.query(
      'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [roleId, `${member.label} ${roleId}`, member.systemRole, companyId],
    );
    for (const [resource, action] of member.permissions ?? []) {
      await client.query(
        'INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action") VALUES ($1, $2, $3, $4::"Resource", $5::"Action")',
        [randomUUID(), roleId, companyId, resource, action],
      );
    }
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, \'active\', CURRENT_TIMESTAMP)',
      [userId, email, member.label, "Fixture", companyId, roleId],
    );
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, $2, $3, TRUE, $4, CURRENT_TIMESTAMP)',
      [authUserId, `${member.label} Fixture`, email, companyId],
    );
    await client.query(
      'INSERT INTO "Apikey" ("id", "name", "key", "referenceId", "configId", "enabled", "rateLimitEnabled", "requestCount", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        apiKeyId,
        `${member.label} fixture`,
        await defaultKeyHasher(apiKey),
        authUserId,
      ],
    );

    authUserIds.push(authUserId);
    apiKeyIds.push(apiKeyId);
    created.push({ userId, apiKey });
  }

  return {
    companyId,
    members: created,
    async remove() {
      await client.query('DELETE FROM "Apikey" WHERE "id" = ANY($1)', [
        apiKeyIds,
      ]);
      await client.query('DELETE FROM "AuthUser" WHERE "id" = ANY($1)', [
        authUserIds,
      ]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    },
  };
}
