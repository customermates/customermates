import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { createCrmPreset, presetId } from "../../features/records/crm-preset";

export async function createBrowserWorkspace(database: Client) {
  const companyId = randomUUID();
  const userId = randomUUID();
  const authUserId = randomUUID();
  const roleId = randomUUID();
  const email = `browser-${userId}@example.test`;
  const model = createCrmPreset(companyId);
  await database.query("BEGIN");
  try {
    await database.query('INSERT INTO "Company" (id,"updatedAt") VALUES ($1,NOW())', [companyId]);
    await database.query(
      'INSERT INTO "UserRole" (id,"companyId",name,"isSystemRole","updatedAt") VALUES ($1,$2,\'Administrator\',true,NOW())',
      [roleId, companyId],
    );
    await database.query(
      'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","agentCreditActivatedAt","updatedAt") VALUES ($1,$2,$3,$4,\'Browser\',\'Administrator\',\'active\',true,NOW(),\'en\',\'en\',NOW(),NOW())',
      [userId, companyId, roleId, email],
    );
    await database.query(
      'INSERT INTO "AuthUser" (id,"companyId",email,name,"emailVerified","updatedAt") VALUES ($1,$2,$3,\'Browser Administrator\',true,NOW())',
      [authUserId, companyId, email],
    );
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
    await database.query("COMMIT");
    return { companyId, userId, authUserId };
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
}

export async function removeBrowserWorkspace(
  database: Client,
  workspace: Awaited<ReturnType<typeof createBrowserWorkspace>>,
) {
  await database.query("BEGIN");
  try {
    await database.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [workspace.companyId]);
    await database.query('DELETE FROM "AuthUser" WHERE id=$1 AND "companyId"=$2', [
      workspace.authUserId,
      workspace.companyId,
    ]);
    await database.query('DELETE FROM "Company" WHERE id=$1', [workspace.companyId]);
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
}
