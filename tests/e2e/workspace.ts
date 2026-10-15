import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { createCrmPreset, presetId } from "../../features/records/crm-preset";

export type BrowserWorkspace = Awaited<ReturnType<typeof createBrowserWorkspace>>;

async function insertWorkspace(
  database: Client,
  workspace: { companyId: string; name: string; authUserId: string; userId: string },
  insertMember: (roleId: string) => Promise<unknown>,
) {
  const { companyId, userId } = workspace;
  const roleId = randomUUID();
  const model = createCrmPreset(companyId);
  await database.query('INSERT INTO "Company" (id,name,"createdByAuthUserId","updatedAt") VALUES ($1,$2,$3,NOW())', [
    companyId,
    workspace.name,
    workspace.authUserId,
  ]);
  await database.query(
    'INSERT INTO "UserRole" (id,"companyId",name,"isSystemRole","updatedAt") VALUES ($1,$2,\'Administrator\',true,NOW())',
    [roleId, companyId],
  );
  await insertMember(roleId);
  await database.query(
    'INSERT INTO "Subscription" (id,"companyId",status,"updatedAt") VALUES ($1,$2,\'active\',NOW())',
    [randomUUID(), companyId],
  );
  for (const type of model.types) {
    await database.query(
      'INSERT INTO "RecordTypeDefinition" ("companyId",id,label,"pluralLabel",embedded,position,definition,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())',
      [companyId, type.id, type.label, type.pluralLabel, type.embedded, type.position, JSON.stringify(type)],
    );
  }
  for (const field of model.fields) {
    await database.query(
      'INSERT INTO "RecordFieldDefinition" ("companyId","typeId",id,"valueType",behavior,definition,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      [companyId, field.typeId, field.id, field.valueType, field.behavior.kind, JSON.stringify(field)],
    );
  }
  for (const relation of model.relationships) {
    await database.query(
      'INSERT INTO "RecordRelationshipDefinition" ("companyId",id,"sourceTypeId","targetTypeId",definition,"updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [companyId, relation.id, relation.sourceTypeId, relation.targetTypeId, JSON.stringify(relation)],
    );
  }
  await database.query('INSERT INTO "RecordSchemaState" ("companyId",revision) VALUES ($1,$2)', [
    companyId,
    model.revision,
  ]);
  await database.query(
    'INSERT INTO "RecordSchemaRevision" ("companyId",revision,"actorId",snapshot) VALUES ($1,$2,$3,$4)',
    [companyId, model.revision, userId, JSON.stringify(model)],
  );
  const organizationId = randomUUID();
  const organizationTypeId = presetId(companyId, "organization");
  await database.query('INSERT INTO "CrmRecord" ("companyId","typeId",id,"updatedAt") VALUES ($1,$2,$3,NOW())', [
    companyId,
    organizationTypeId,
    organizationId,
  ]);
  await database.query(
    'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"textValue","schemaRevision","updatedAt") VALUES ($1,$2,$3,$4,\'value\',\'Example organization\',$5,NOW())',
    [companyId, organizationTypeId, organizationId, presetId(companyId, "organization.name"), model.revision],
  );
}

async function inTransaction<T>(database: Client, work: () => Promise<T>) {
  await database.query("BEGIN");
  try {
    const result = await work();
    await database.query("COMMIT");
    return result;
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
}

export async function createBrowserWorkspace(database: Client, name = "Browser workspace") {
  const companyId = randomUUID();
  const userId = randomUUID();
  const authUserId = randomUUID();
  const email = `browser-${userId}@example.test`;
  return inTransaction(database, async () => {
    await insertWorkspace(database, { companyId, name, authUserId, userId }, (roleId) =>
      database.query(
        'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","agentCreditActivatedAt","updatedAt") VALUES ($1,$2,$3,$4,\'Browser\',\'Administrator\',\'active\',true,NOW(),\'en\',\'en\',NOW(),NOW())',
        [userId, companyId, roleId, email],
      ),
    );
    await database.query(
      'INSERT INTO "AuthUser" (id,"companyId",email,name,"emailVerified","updatedAt") VALUES ($1,$2,$3,\'Browser Administrator\',true,NOW())',
      [authUserId, companyId, email],
    );
    return { companyId, userId, authUserId };
  });
}

export async function addBrowserWorkspace(database: Client, workspace: BrowserWorkspace, name = "Second workspace") {
  const companyId = randomUUID();
  const userId = randomUUID();
  await inTransaction(database, () =>
    insertWorkspace(database, { companyId, name, authUserId: workspace.authUserId, userId }, async (roleId) => {
      const inserted = await database.query(
        'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",country,"avatarUrl",theme,"displayLanguage","formattingLocale",status,"agreeToTerms","onboardingWizardCompletedAt","agentCreditActivatedAt","updatedAt") SELECT $1,$2,$3,email,"firstName","lastName",country,"avatarUrl",theme,"displayLanguage","formattingLocale",\'active\',true,NOW(),NOW(),NOW() FROM "User" WHERE id=$4 AND "companyId"=$5',
        [userId, companyId, roleId, workspace.userId, workspace.companyId],
      );
      if (inserted.rowCount !== 1) throw new Error("The browser login to add a workspace to is missing");
    }),
  );
  return { companyId, userId };
}

export async function removeBrowserWorkspace(database: Client, workspace: BrowserWorkspace) {
  await inTransaction(database, async () => {
    const { rows } = await database.query<{ id: string }>(
      'SELECT id FROM "Company" WHERE id=$1 OR "createdByAuthUserId"=$2 ORDER BY id',
      [workspace.companyId, workspace.authUserId],
    );
    const companyIds = rows.map((row) => row.id);
    for (const companyId of companyIds)
      await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    await database.query('DELETE FROM "AuthUser" WHERE id=$1', [workspace.authUserId]);
    await database.query('DELETE FROM "Company" WHERE id=ANY($1::text[])', [companyIds]);
  });
}
