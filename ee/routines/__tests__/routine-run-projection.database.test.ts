import type { TenantUser } from "@/features/user/user.schema";

import { presetId } from "@/features/records/crm-preset";
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { createTestRoutineRepo } from "@/tests/helpers/record-delivery";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("routine run projection on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const routineId = randomUUID();
  const contactId = randomUUID();
  const eventRunId = randomUUID();
  const scheduleRunId = randomUUID();

  const viewer: TenantUser = {
    ...createMockUserWithPermissions([
      { resource: Resource.routines, action: Action.readAll },
      { resource: Resource.users, action: Action.readAll },
    ]),
    id: ownerId,
    companyId,
  };

  const typeId = presetId(companyId, "contact");
  const nameFieldId = presetId(companyId, "contact.firstName");
  const triggerPayload = {
    id: randomUUID(),
    companyId,
    event: "record.updated",
    timestamp: "2026-01-01T00:00:00.000Z",
    actorId: ownerId,
    data: {
      causeId: "cause-1",
      cause: { kind: "mutation" },
      record: {
        ref: { typeId, recordId: contactId },
        schemaRevision: 1,
        beforeVersion: 1,
        afterVersion: 2,
        assignments: null,
        identities: null,
        links: [],
        related: [],
        fields: [
          {
            fieldId: nameFieldId,
            before: null,
            after: {
              fieldId: nameFieldId,
              label: "First name",
              valueType: "text",
              options: [],
              value: { state: "value", value: { kind: "text", value: "private@example.com" } },
            },
          },
        ],
      },
    },
  };

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [ownerId, `${ownerId}@example.com`, "Routine", "Owner", companyId],
    );
    await client.query(
      `INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "triggerKind", "updatedAt")
       VALUES ($1, $2, $3, 'Watcher', 'Summarise the change.', 'event'::"RoutineTriggerKind", CURRENT_TIMESTAMP)`,
      [routineId, companyId, ownerId],
    );

    for (const [id, event, payload] of [
      [eventRunId, "record.updated", JSON.stringify(triggerPayload)],
      [scheduleRunId, null, null],
    ] as const) {
      await client.query(
        `INSERT INTO "RoutineRun"
           ("id", "companyId", "routineId", "executedByUserId", "executedByName", "status", "triggerKind",
            "triggerEvent", "triggerEntityId", "triggerPayload", "scheduledFor", "updatedAt")
         VALUES ($1, $2, $3, $4, 'Routine Owner', 'succeeded'::"RoutineRunStatus",
                 'event'::"RoutineTriggerKind", $5, $6, $7::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, companyId, routineId, ownerId, event, event ? contactId : null, payload],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "RoutineRun" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Routine" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  async function runs() {
    return runWithTenant(viewer, () => createTestRoutineRepo().getRoutineRuns(routineId, 10));
  }

  it("never puts the raw event envelope on the wire", async () => {
    const { runs: rows } = await runs();

    expect(rows).toHaveLength(2);
    for (const row of rows) expect(Object.keys(row)).not.toContain("triggerPayload");
    expect(JSON.stringify(rows)).not.toContain("private@example.com");
  });

  it("projects the identifiers the run detail needs", async () => {
    const { runs: rows } = await runs();
    const triggered = rows.find((row) => row.id === eventRunId);

    expect(triggered?.triggerEntityId).toBe(contactId);
    expect(triggered?.triggerContext).toEqual({
      recordRef: { typeId, recordId: contactId },
      threadId: null,
      changedFields: [nameFieldId],
      changedFieldsTruncated: false,
      changedFieldLabels: { [nameFieldId]: "First name" },
    });
  });

  it("leaves a run with no trigger event without a context at all", async () => {
    const { runs: rows } = await runs();

    expect(rows.find((row) => row.id === scheduleRunId)?.triggerContext).toBeNull();
  });
});
