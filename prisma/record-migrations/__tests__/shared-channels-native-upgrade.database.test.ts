import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { readRecordModelSnapshot } from "@/features/records/record-model-snapshot";
import { CRM_CONTRACTION_MIGRATION } from "@/prisma/record-migrations/expand";
import { createCrmPreset, presetId } from "@/prisma/record-migrations/v2/contract/crm-preset";
import { assertLocalDatabaseEnvironment } from "@/scripts/local-database-safety";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createLegacyMigrationDatabase } from "@/tests/helpers/legacy-migration-database";

const database = getLocalDatabaseTestUrl();
const suite = database ? describe : describe.skip;
const migration = "20261002120000_shared_record_channels";
const createdAt = "2023-01-02T03:04:05.123Z";
const updatedAt = "2024-02-03T04:05:06.456Z";
const sharedRecordId = "00000000-0000-4000-8000-000000000101";
const otherRecordId = "00000000-0000-4000-8000-000000000102";
const protectedRecordId = "00000000-0000-4000-8000-000000000103";
const sharedIdentityId = "00000000-0000-4000-8000-000000000201";
const socialIdentityId = "00000000-0000-4000-8000-000000000202";
const foreignIdentityId = "00000000-0000-4000-8000-000000000203";
const workspaces = [
  {
    companyId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000011",
    accountId: "00000000-0000-4000-8000-000000000021",
    threadId: "00000000-0000-4000-8000-000000000031",
    revision: 7,
    hasIdentityCapability: true,
  },
  {
    companyId: "00000000-0000-4000-8000-000000000002",
    userId: "00000000-0000-4000-8000-000000000012",
    accountId: "00000000-0000-4000-8000-000000000022",
    threadId: "00000000-0000-4000-8000-000000000032",
    revision: 4,
    hasIdentityCapability: true,
  },
  {
    companyId: "00000000-0000-4000-8000-000000000003",
    userId: "00000000-0000-4000-8000-000000000013",
    accountId: "00000000-0000-4000-8000-000000000023",
    threadId: "00000000-0000-4000-8000-000000000033",
    revision: 3,
    hasIdentityCapability: false,
  },
] as const;

async function seedNativeWorkspace(client: Client, workspace: (typeof workspaces)[number]) {
  const { companyId, userId, accountId, threadId, revision, hasIdentityCapability } = workspace;
  const model = createCrmPreset(companyId, "EUR");
  model.revision = revision;
  const contact = model.types.find((type) => type.id === presetId(companyId, "contact"));
  if (!contact) throw new Error("The native fixture contact type is missing");
  contact.label = "Person";
  contact.pluralLabel = "People";
  if (!hasIdentityCapability)
    model.capabilities = model.capabilities.filter((binding) => binding.kind !== "personIdentity");

  await client.query('INSERT INTO "Company" (id,"createdAt","updatedAt") VALUES ($1,$2,$3)', [
    companyId,
    createdAt,
    updatedAt,
  ]);
  await client.query(
    'INSERT INTO "User" (id,"companyId",email,"firstName","lastName",status,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'active\',$6,$7)',
    [userId, companyId, `migration-${companyId}@example.test`, "Synthetic", "Migration", createdAt, updatedAt],
  );
  for (const type of model.types) {
    await client.query(
      'INSERT INTO "RecordTypeDefinition" ("companyId",id,label,"pluralLabel",archived,embedded,position,definition,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        companyId,
        type.id,
        type.label,
        type.pluralLabel,
        type.archived,
        type.embedded,
        type.position,
        JSON.stringify(type),
        createdAt,
        updatedAt,
      ],
    );
  }
  for (const field of model.fields) {
    await client.query(
      'INSERT INTO "RecordFieldDefinition" ("companyId","typeId",id,"valueType",behavior,archived,definition,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        companyId,
        field.typeId,
        field.id,
        field.valueType,
        field.behavior.kind,
        field.archived,
        JSON.stringify(field),
        createdAt,
        updatedAt,
      ],
    );
  }
  for (const relation of model.relationships) {
    await client.query(
      'INSERT INTO "RecordRelationshipDefinition" ("companyId",id,"sourceTypeId","targetTypeId",definition,archived,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        companyId,
        relation.id,
        relation.sourceTypeId,
        relation.targetTypeId,
        JSON.stringify(relation),
        relation.archived,
        createdAt,
        updatedAt,
      ],
    );
  }
  await client.query(
    'INSERT INTO "RecordSchemaState" ("companyId",revision,"storageMode") VALUES ($1,$2,\'generic\')',
    [companyId, revision],
  );
  for (const previousRevision of [revision - 1, revision]) {
    await client.query(
      'INSERT INTO "RecordSchemaRevision" ("companyId",revision,"actorId",snapshot,"createdAt") VALUES ($1,$2,$3,$4,$5)',
      [companyId, previousRevision, userId, JSON.stringify({ ...model, revision: previousRevision }), createdAt],
    );
  }
  for (const [type, id] of [
    ["contact", sharedRecordId],
    ["contact", otherRecordId],
    ["organization", sharedRecordId],
    ["task", protectedRecordId],
  ]) {
    await client.query(
      'INSERT INTO "CrmRecord" ("companyId","typeId",id,"protectedKind","systemData","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        companyId,
        presetId(companyId, type),
        id,
        type === "task" ? "membershipAuthorization" : null,
        type === "task" ? JSON.stringify({ relatedUserId: userId }) : null,
        createdAt,
        updatedAt,
      ],
    );
  }
  await client.query(
    'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","createdAt","updatedAt") VALUES ($1,$2,$3,$4,\'google\',\'ok\',true,$5,$6)',
    [accountId, companyId, userId, `synthetic-account-${companyId}`, createdAt, updatedAt],
  );
  await client.query(
    'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,\'google\',$5,$6)',
    [threadId, companyId, accountId, `synthetic-thread-${companyId}`, createdAt, updatedAt],
  );
  if (hasIdentityCapability) {
    await client.query(
      'INSERT INTO "RecordIdentity" ("companyId",id,"typeId","recordId",provider,"channelClass",value,"messagingId","displayName","profileUrl","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'email\',$6,$7,$8,$9,$10,$11)',
      [
        companyId,
        sharedIdentityId,
        contact.id,
        sharedRecordId,
        companyId === workspaces[0].companyId ? "google" : "outlook",
        "shared@example.test",
        `synthetic-mail-alias-${companyId}`,
        "Original identity label",
        "https://example.test/synthetic-profile",
        createdAt,
        updatedAt,
      ],
    );
  }
  if (hasIdentityCapability) {
    for (const value of ["shared@example.test", "shared-alias@example.test", `synthetic-mail-alias-${companyId}`]) {
      await client.query(
        'INSERT INTO "RecordIdentityKey" ("companyId","channelClass",value,"identityId") VALUES ($1,\'email\',$2,$3)',
        [companyId, value, sharedIdentityId],
      );
    }
  }
  const identityId = companyId === workspaces[0].companyId ? socialIdentityId : foreignIdentityId;
  if (hasIdentityCapability) {
    await client.query(
      'INSERT INTO "RecordIdentity" ("companyId",id,"typeId","recordId",provider,"channelClass",value,"messagingId","displayName","profileUrl","createdAt","updatedAt") VALUES ($1,$2,$3,$4,\'linkedin\',\'linkedin\',$5,$6,$7,$8,$9,$10)',
      [
        companyId,
        identityId,
        contact.id,
        otherRecordId,
        "synthetic-person",
        `urn:li:member:synthetic-${companyId}`,
        "Original social label",
        "https://www.linkedin.com/in/synthetic-person",
        createdAt,
        updatedAt,
      ],
    );
  }
  if (hasIdentityCapability) {
    for (const value of [
      "synthetic-person",
      `urn:li:member:synthetic-${companyId}`,
      "https://www.linkedin.com/in/synthetic-person",
    ]) {
      await client.query(
        'INSERT INTO "RecordIdentityKey" ("companyId","channelClass",value,"identityId") VALUES ($1,\'linkedin\',$2,$3)',
        [companyId, value, identityId],
      );
    }
  }
  const eventId = presetId(companyId, "native-upgrade.event");
  const subscriptionId = presetId(companyId, "native-upgrade.subscription");
  await client.query(
    'INSERT INTO "RecordEvent" ("companyId",id,"typeId","recordId","actorId","causeId",kind,payload,"createdAt","nextAttemptAt") VALUES ($1,$2,$3,$4,$5,$6,\'record.updated\',$7,$8,$8)',
    [
      companyId,
      eventId,
      contact.id,
      sharedRecordId,
      userId,
      "synthetic-existing-event",
      JSON.stringify({ unchanged: true }),
      createdAt,
    ],
  );
  await client.query(
    'INSERT INTO "RecordEventSubscription" ("companyId",id,kind,"ownerUserId","typeId",events,"changedFieldIds") VALUES ($1,$2,\'routine\',$3,$4,$5,$6)',
    [companyId, subscriptionId, userId, contact.id, ["record.updated"], []],
  );
  await client.query(
    'INSERT INTO "RecordEventMatch" ("companyId","eventId","subscriptionId","subscriptionRevision") VALUES ($1,$2,$3,1)',
    [companyId, eventId, subscriptionId],
  );
  await client.query(
    'INSERT INTO "AuditLog" (id,"companyId","userId",event,"eventData","entityId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      presetId(companyId, "native-upgrade.audit"),
      companyId,
      userId,
      "record.updated",
      JSON.stringify({ unchanged: true }),
      sharedRecordId,
      createdAt,
    ],
  );
}

async function createPopulatedNativeFixture() {
  if (!database) throw new Error("Native upgrade verification requires a disposable local database");
  assertLocalDatabaseEnvironment({
    ...process.env,
    DATABASE_URL: database,
    DIRECT_URL: database,
  });
  const fixture = await createLegacyMigrationDatabase(database);
  try {
    assertLocalDatabaseEnvironment({
      ...process.env,
      DATABASE_URL: fixture.url,
      DIRECT_URL: fixture.url,
    });
    const available = (await readdir(resolve("prisma/migrations"))).filter((entry) => /^\d+_/.test(entry)).sort();
    if (!available.includes(migration)) throw new Error("Shared channel native migration is missing");
    for (const entry of available.filter((entry) => entry >= CRM_CONTRACTION_MIGRATION && entry < migration))
      await fixture.client.query(await readFile(resolve("prisma/migrations", entry, "migration.sql"), "utf8"));

    expect(
      (
        await fixture.client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='RecordIdentity' AND column_name IN ('typeId','recordId') ORDER BY column_name",
        )
      ).rows,
    ).toEqual([{ column_name: "recordId" }, { column_name: "typeId" }]);
    for (const workspace of workspaces) await seedNativeWorkspace(fixture.client, workspace);
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
}

async function sourceState(client: Client) {
  const identities = (await client.query('SELECT * FROM "RecordIdentity" ORDER BY "companyId",id')).rows;
  const keys = (await client.query('SELECT * FROM "RecordIdentityKey" ORDER BY "companyId","channelClass",value')).rows;
  const revisions = (await client.query('SELECT * FROM "RecordSchemaRevision" ORDER BY "companyId",revision')).rows;
  const records = (await client.query('SELECT * FROM "CrmRecord" ORDER BY "companyId","typeId",id')).rows;
  const types = (await client.query('SELECT * FROM "RecordTypeDefinition" ORDER BY "companyId",id')).rows;
  const events: Record<string, unknown[]> = {};
  for (const table of [
    "RecordEvent",
    "RecordEventMatch",
    "RecordEventSubscription",
    "RoutineRun",
    "WebhookDelivery",
    "AuditLog",
  ]) {
    events[table] = (
      await client.query(`SELECT to_jsonb(source) AS row FROM "${table}" source ORDER BY to_jsonb(source)::text`)
    ).rows;
  }
  return { identities, keys, revisions, records, types, events };
}

suite("shared channel native upgrade", { timeout: 120000 }, () => {
  it("preserves canonical metadata, aliases, qualified owners and immutable history through the exact native migration", async () => {
    const fixture = await createPopulatedNativeFixture();
    try {
      const before = await sourceState(fixture.client);
      expect(before.identities).toHaveLength(4);
      expect(before.keys).toHaveLength(12);
      await fixture.client.query(await readFile(resolve("prisma/migrations", migration, "migration.sql"), "utf8"));
      const after = await sourceState(fixture.client);
      expect(after.identities).toEqual(
        before.identities.map(({ typeId: _typeId, recordId: _recordId, ...identity }) => identity),
      );
      expect(after.keys).toEqual(before.keys);
      expect(after.records).toEqual(before.records);
      expect(after.types).toEqual(before.types);
      expect(after.events).toEqual(before.events);
      const expectedLinks = before.identities.map((identity) => ({
        companyId: identity.companyId,
        identityId: identity.id,
        typeId: identity.typeId,
        recordId: identity.recordId,
        createdAt: identity.createdAt,
      }));
      expect(
        (await fixture.client.query('SELECT * FROM "RecordIdentityLink" ORDER BY "companyId","identityId"')).rows,
      ).toEqual(expectedLinks);
      expect((await fixture.client.query('SELECT * FROM "MessagingThreadRecordLink"')).rows).toHaveLength(0);
      expect(
        (
          await fixture.client.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='RecordIdentity' AND column_name IN ('typeId','recordId')",
          )
        ).rows,
      ).toHaveLength(0);
      expect(after.revisions).toHaveLength(before.revisions.length + 2);
      for (const original of before.revisions) {
        const preserved = after.revisions.find(
          (row) => row.companyId === original.companyId && row.revision === original.revision,
        );
        expect(preserved).toEqual(original);
        const decoded = readRecordModelSnapshot(original.snapshot);
        const former = original.snapshot.capabilities.find(
          (binding: { kind: string }) => binding.kind === "personIdentity",
        );
        if (former) {
          expect(decoded.capabilities).toContainEqual({
            ...former,
            kind: "channels",
            enabled: true,
            providerAvatar: true,
          });
          expect(original.snapshot.capabilities).toContainEqual(former);
          expect(preserved.snapshot.capabilities).toContainEqual(former);
        }
      }
      for (const workspace of workspaces) {
        const original = before.revisions.find(
          (row) => row.companyId === workspace.companyId && row.revision === workspace.revision,
        );
        if (!original) throw new Error("The native fixture configuration revision is missing");
        const revision = workspace.revision + (workspace.hasIdentityCapability ? 1 : 0);
        expect(
          (
            await fixture.client.query(
              'SELECT revision,"activeOperationId","storageMode" FROM "RecordSchemaState" WHERE "companyId"=$1',
              [workspace.companyId],
            )
          ).rows,
        ).toEqual([{ revision, activeOperationId: null, storageMode: "generic" }]);
        if (!workspace.hasIdentityCapability) continue;
        const published = after.revisions.find(
          (row) => row.companyId === workspace.companyId && row.revision === revision,
        );
        if (!published) throw new Error("The shared channel configuration revision was not published");
        expect(published.actorId).toBe("system:shared-channel-migration");
        expect(published.snapshot).toEqual({
          ...original.snapshot,
          revision,
          capabilities: original.snapshot.capabilities.map((binding: { kind: string }) =>
            binding.kind === "personIdentity"
              ? {
                  ...binding,
                  kind: "channels",
                  enabled: true,
                  providerAvatar: true,
                }
              : binding,
          ),
        });
        expect(
          readRecordModelSnapshot(published.snapshot).types.find(
            (type) => type.id === presetId(workspace.companyId, "contact"),
          ),
        ).toMatchObject({ label: "Person", pluralLabel: "People" });
        expect(
          published.snapshot.capabilities.find(
            (binding: { kind: string }) => binding.kind === "membershipAuthorization",
          ),
        ).toEqual(
          original.snapshot.capabilities.find(
            (binding: { kind: string }) => binding.kind === "membershipAuthorization",
          ),
        );
      }
      const [workspace, foreign] = workspaces;
      const organizationId = presetId(workspace.companyId, "organization");
      const foreignContactId = presetId(foreign.companyId, "contact");
      await fixture.client.query(
        'INSERT INTO "RecordIdentityLink" ("companyId","identityId","typeId","recordId","createdAt") VALUES ($1,$2,$3,$4,$5)',
        [workspace.companyId, sharedIdentityId, organizationId, sharedRecordId, createdAt],
      );
      await expect(
        fixture.client.query(
          'INSERT INTO "RecordIdentityLink" ("companyId","identityId","typeId","recordId") VALUES ($1,$2,$3,$4)',
          [workspace.companyId, foreignIdentityId, organizationId, sharedRecordId],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        fixture.client.query(
          'INSERT INTO "RecordIdentityLink" ("companyId","identityId","typeId","recordId") VALUES ($1,$2,$3,$4)',
          [workspace.companyId, sharedIdentityId, foreignContactId, sharedRecordId],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await fixture.client.query(
        'INSERT INTO "MessagingThreadRecordLink" ("companyId","threadId","typeId","recordId") VALUES ($1,$2,$3,$4)',
        [workspace.companyId, workspace.threadId, organizationId, sharedRecordId],
      );
      await expect(
        fixture.client.query(
          'INSERT INTO "MessagingThreadRecordLink" ("companyId","threadId","typeId","recordId") VALUES ($1,$2,$3,$4)',
          [workspace.companyId, foreign.threadId, organizationId, sharedRecordId],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(
        fixture.client.query(
          'INSERT INTO "MessagingThreadRecordLink" ("companyId","threadId","typeId","recordId") VALUES ($1,$2,$3,$4)',
          [workspace.companyId, workspace.threadId, foreignContactId, sharedRecordId],
        ),
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await fixture.close();
    }
  });

  it("refuses both active-operation guards without changing ownership or history, then permits a clean retry", async () => {
    const fixture = await createPopulatedNativeFixture();
    try {
      const workspace = workspaces[0];
      const operationId = "00000000-0000-4000-8000-000000000301";
      const sql = await readFile(resolve("prisma/migrations", migration, "migration.sql"), "utf8");
      const original = await sourceState(fixture.client);
      for (const guard of ["workspace-write-pause", "pending-operation"]) {
        await fixture.client.query(
          'INSERT INTO "RecordOperation" ("companyId",id,"userId",kind,state,"expectedRevision",request,"createdAt","updatedAt") VALUES ($1,$2,$3,\'configuration\',$4,$5,\'{}\'::jsonb,$6,$7)',
          [
            workspace.companyId,
            operationId,
            workspace.userId,
            guard === "workspace-write-pause" ? "completed" : "pending",
            workspace.revision,
            createdAt,
            updatedAt,
          ],
        );
        if (guard === "workspace-write-pause") {
          await fixture.client.query('UPDATE "RecordSchemaState" SET "activeOperationId"=$2 WHERE "companyId"=$1', [
            workspace.companyId,
            operationId,
          ]);
        }
        const states = (await fixture.client.query('SELECT * FROM "RecordSchemaState" ORDER BY "companyId"')).rows;
        const operations = (await fixture.client.query('SELECT * FROM "RecordOperation" ORDER BY "companyId",id')).rows;
        await expect(fixture.client.query(sql)).rejects.toThrow(
          "Shared channel migration refused: complete or cancel active CRM operations first",
        );
        await fixture.client.query("ROLLBACK");
        expect(await sourceState(fixture.client)).toEqual(original);
        expect((await fixture.client.query('SELECT * FROM "RecordSchemaState" ORDER BY "companyId"')).rows).toEqual(
          states,
        );
        expect((await fixture.client.query('SELECT * FROM "RecordOperation" ORDER BY "companyId",id')).rows).toEqual(
          operations,
        );
        expect(
          (
            await fixture.client.query(
              "SELECT to_regclass('\"RecordIdentityLink\"') AS identity,to_regclass('\"MessagingThreadRecordLink\"') AS thread",
            )
          ).rows,
        ).toEqual([{ identity: null, thread: null }]);
        expect(
          (
            await fixture.client.query(
              "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='RecordIdentity' AND column_name IN ('typeId','recordId') ORDER BY column_name",
            )
          ).rows,
        ).toEqual([{ column_name: "recordId" }, { column_name: "typeId" }]);
        await fixture.client.query('UPDATE "RecordSchemaState" SET "activeOperationId"=NULL WHERE "companyId"=$1', [
          workspace.companyId,
        ]);
        await fixture.client.query('DELETE FROM "RecordOperation" WHERE "companyId"=$1 AND id=$2', [
          workspace.companyId,
          operationId,
        ]);
      }
      await fixture.client.query(sql);
      expect((await fixture.client.query('SELECT count(*)::integer AS count FROM "RecordIdentityLink"')).rows).toEqual([
        { count: original.identities.length },
      ]);
      expect((await sourceState(fixture.client)).keys).toEqual(original.keys);
      expect((await sourceState(fixture.client)).events).toEqual(original.events);
    } finally {
      await fixture.close();
    }
  });
});
