import type { Client } from "pg";

import { randomBytes, randomUUID } from "node:crypto";

import { defaultKeyHasher } from "@better-auth/api-key";

export async function mintApiKey(
  database: Client,
  owner: { authUserId: string; companyId: string },
  name: string,
) {
  const id = randomUUID();
  const key = randomBytes(32).toString("hex");
  await database.query(
    'INSERT INTO "Apikey" (id,name,key,"referenceId","companyId","configId",enabled,"rateLimitEnabled","requestCount","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'default\',true,false,0,NOW()+interval \'1 day\',NOW(),NOW())',
    [id, name, await defaultKeyHasher(key), owner.authUserId, owner.companyId],
  );
  return { id, key };
}
