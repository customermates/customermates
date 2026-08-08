import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const TURN_LEDGER_MIGRATION = "20260812090000_agent_assistant_turn_ledger";
const migrationsRoot = join(process.cwd(), "prisma/migrations");

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `cus125_migration_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: databaseUrl });
  let database: Client | undefined;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    database = new Client({ connectionString: isolatedUrl.toString() });
    await database.connect();

    return await fn(database);
  } finally {
    await database?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
}

function migrationsBefore() {
  const names = migrationNames();
  return names.slice(0, names.indexOf(TURN_LEDGER_MIGRATION));
}

function migrationsFrom() {
  const names = migrationNames();
  return names.slice(names.indexOf(TURN_LEDGER_MIGRATION));
}

async function seedLegacyWorkspace(client: Client) {
  await client.query(`INSERT INTO "Company" ("id","updatedAt") VALUES ('co1', NOW())`);
  await client.query(
    `INSERT INTO "User" ("id","email","firstName","lastName","companyId","updatedAt")
     VALUES ('u1','a@example.com','Ada','One','co1',NOW()), ('u2','b@example.com','Bo','Two','co1',NOW())`,
  );
  await client.query(
    `INSERT INTO "Subscription" ("id","companyId","status","plan","updatedAt")
     VALUES ('sub1','co1','active','business',NOW())`,
  );
  await client.query(
    `INSERT INTO "AgentConversation" ("id","companyId","userId","title","userLastReadAt","createdAt","updatedAt")
     VALUES ('c1','co1','u1','First chat', TIMESTAMP '2026-08-01 10:00:30', TIMESTAMP '2026-08-01 09:00:00', TIMESTAMP '2026-08-01 12:00:00'),
            ('c2','co1','u2','Second chat', NULL, TIMESTAMP '2026-08-02 09:00:00', TIMESTAMP '2026-08-02 12:00:00')`,
  );
  await client.query(
    `INSERT INTO "AgentUsageEvent" ("id","companyId","userId","model","inputTokens","outputTokens","costMicrocents","createdAt")
     VALUES ('e1','co1','u1','openai:gpt-5.6-luna',100,200,2500000, TIMESTAMP '2026-08-01 10:00:00'),
            ('e2','co1','u1','openai:gpt-5.6-luna',10,20,1000000,  TIMESTAMP '2026-08-01 10:05:00'),
            ('e3','co1','u1','openai:gpt-5.6-luna',0,0,0,          TIMESTAMP '2026-08-01 10:06:00')`,
  );
  await client.query(
    `INSERT INTO "SupportTicket" ("id","companyId","userId","subject","body","source")
     VALUES ('st1','co1','u1','chat ticket','body','chat'), ('st2','co1','u1','mcp ticket','body','mcp')`,
  );
}

const TIED_MESSAGES = [
  `('t1','c1','co1','user','[{"type":"text","text":"tie echo"}]'::jsonb, TIMESTAMP '2026-08-01 10:30:00')`,
  `('t2','c1','co1','user','[{"type":"text","text":"tie foxtrot"}]'::jsonb, TIMESTAMP '2026-08-01 10:30:00')`,
];

async function seedLegacyMessages(client: Client, tiedOrder: string[]) {
  await client.query(
    `INSERT INTO "AgentMessage" ("id","conversationId","companyId","role","parts","createdAt") VALUES
      ('m1','c1','co1','user','[{"type":"text","text":"hello there alpha"}]'::jsonb, TIMESTAMP '2026-08-01 10:00:00'),
      ('m2','c1','co1','assistant','[{"type":"text","text":"reply bravo"}]'::jsonb, TIMESTAMP '2026-08-01 10:00:10'),
      ('m3','c1','co1','support','[{"type":"text","text":"read support charlie"}]'::jsonb, TIMESTAMP '2026-08-01 10:00:20'),
      ('m4','c1','co1','support','[{"type":"text","text":"unread support delta"}]'::jsonb, TIMESTAMP '2026-08-01 11:00:00'),
      ${tiedOrder.join(",\n      ")},
      ('m5','c2','co1','assistant','[{"type":"text","text":"<page_context route=\\"/deals\\"></page_context> golf"}]'::jsonb, TIMESTAMP '2026-08-02 10:00:00'),
      ('m6','c2','co1','assistant','[{"type":"text","text":"id 3f2504e0-4f89-11d3-9a0c-0305e82c3301 and key sk-abcdefgh12345678 hotel"}]'::jsonb, TIMESTAMP '2026-08-02 10:01:00'),
      ('m7','c2','co1','assistant','[{"type":"tool-call","toolName":"x"}]'::jsonb, TIMESTAMP '2026-08-02 10:02:00')`,
  );
}

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

describeDatabase("agent assistant turn-ledger migration", { timeout: 120_000 }, () => {
  it("orders legacy messages deterministically regardless of physical insert order", async () => {
    const read = async (tiedOrder: string[]) =>
      withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
        await applyMigrations(client, migrationsBefore());
        await seedLegacyWorkspace(client);
        await seedLegacyMessages(client, tiedOrder);
        await applyMigrations(client, migrationsFrom());

        const rows = await client.query<{ id: string; sequence: string }>(
          `SELECT "id", "sequence"::text FROM "AgentMessage" ORDER BY "sequence"`,
        );
        return rows.rows.map((row) => `${row.id}:${row.sequence}`);
      });

    const forward = await read(TIED_MESSAGES);
    const reversed = await read([...TIED_MESSAGES].reverse());

    expect(forward).toEqual(reversed);
    expect(forward).toEqual(["m1:1", "m2:2", "m3:3", "t1:4", "t2:5", "m4:6", "m5:7", "m6:8", "m7:9"]);
  });

  it("derives searchable text without leaking sanitized content", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationsBefore());
      await seedLegacyWorkspace(client);
      await seedLegacyMessages(client, TIED_MESSAGES);
      await applyMigrations(client, migrationsFrom());

      const leaks = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "AgentMessage"
          WHERE "searchText" ~* '(3f2504e0-4f89-11d3-9a0c-0305e82c3301|sk-abcdefgh12345678|page_context)'`,
      );
      expect(leaks.rows[0]?.count).toBe("0");

      const rows = await client.query<{ id: string; searchText: string }>(
        `SELECT "id", "searchText" FROM "AgentMessage" WHERE "id" IN ('m1','m5','m6','m7')`,
      );
      const byId = new Map(rows.rows.map((row) => [row.id, row.searchText]));

      expect(byId.get("m1")).toBe("hello there alpha");
      expect(byId.get("m5")).toBe("");
      expect(byId.get("m7")).toBe("");
      expect(byId.get("m6")).toContain("hotel");
      expect(byId.get("m6")).not.toContain("sk-abcdefgh12345678");
    });
  });

  it("derives the unread support boundary from the legacy read timestamp", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationsBefore());
      await seedLegacyWorkspace(client);
      await seedLegacyMessages(client, TIED_MESSAGES);
      await applyMigrations(client, migrationsFrom());

      const conversations = await client.query<{
        id: string;
        userLastReadSequence: string | null;
        selectedAt: Date | null;
      }>(`SELECT "id", "userLastReadSequence"::text, "selectedAt" FROM "AgentConversation" ORDER BY "id"`);

      expect(conversations.rows[0]).toMatchObject({ id: "c1", userLastReadSequence: "3" });
      expect(conversations.rows[1]).toMatchObject({ id: "c2", userLastReadSequence: null });
      expect(conversations.rows.every((row) => row.selectedAt !== null)).toBe(true);

      const unread = await client.query<{ id: string; unread: string }>(
        `SELECT c."id", count(m."id")::text AS unread
           FROM "AgentConversation" c
           LEFT JOIN "AgentMessage" m
             ON m."conversationId" = c."id" AND m."role" = 'support'
            AND (c."userLastReadSequence" IS NULL OR m."sequence" > c."userLastReadSequence")
          GROUP BY c."id" ORDER BY c."id"`,
      );
      expect(unread.rows).toEqual([
        { id: "c1", unread: "1" },
        { id: "c2", unread: "0" },
      ]);
    });
  });

  it("settles legacy usage without charging it against a live allowance", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationsBefore());
      await seedLegacyWorkspace(client);
      await seedLegacyMessages(client, TIED_MESSAGES);
      await applyMigrations(client, migrationsFrom());

      const rows = await client.query<{
        id: string;
        state: string;
        reservedCredits: number;
        chargedCredits: number;
        planSnapshot: string;
        subscriptionStatusSnapshot: string;
        epochPeriod: boolean;
        settled: boolean;
      }>(
        `SELECT "id","state","reservedCredits","chargedCredits","planSnapshot","subscriptionStatusSnapshot",
                "periodStart" = TIMESTAMP '1970-01-01 00:00:00' AS "epochPeriod",
                "settledAt" IS NOT NULL AS settled
           FROM "AgentUsageEvent" ORDER BY "id"`,
      );

      expect(rows.rows).toEqual([
        expect.objectContaining({ id: "e1", state: "settled", reservedCredits: 3, chargedCredits: 3 }),
        expect.objectContaining({ id: "e2", state: "settled", reservedCredits: 1, chargedCredits: 1 }),
        expect.objectContaining({ id: "e3", state: "settled", reservedCredits: 0, chargedCredits: 0 }),
      ]);
      expect(rows.rows.every((row) => row.epochPeriod && row.settled)).toBe(true);
      expect(rows.rows.every((row) => row.planSnapshot === "business")).toBe(true);
      expect(rows.rows.every((row) => row.subscriptionStatusSnapshot === "active")).toBe(true);
    });
  });

  it("allows many conversations per user and retains billing and support records on deletion", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationsBefore());
      await seedLegacyWorkspace(client);
      await seedLegacyMessages(client, TIED_MESSAGES);
      await applyMigrations(client, migrationsFrom());

      const legacyUnique = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_indexes WHERE indexname = 'AgentConversation_companyId_userId_key'`,
      );
      expect(legacyUnique.rows[0]?.count).toBe("0");

      await client.query(
        `INSERT INTO "AgentConversation" ("id","companyId","userId","createdAt","updatedAt")
         VALUES ('c3','co1','u1',NOW(),NOW())`,
      );
      const owned = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "AgentConversation" WHERE "userId" = 'u1'`,
      );
      expect(owned.rows[0]?.count).toBe("2");

      await client.query(`UPDATE "SupportTicket" SET "agentConversationId" = 'c1' WHERE "id" = 'st1'`);
      await client.query(`DELETE FROM "AgentConversation" WHERE "id" = 'c1'`);

      const tickets = await client.query<{ id: string; agentConversationId: string | null }>(
        `SELECT "id","agentConversationId" FROM "SupportTicket" ORDER BY "id"`,
      );
      expect(tickets.rows).toEqual([
        { id: "st1", agentConversationId: null },
        { id: "st2", agentConversationId: null },
      ]);

      const usage = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM "AgentUsageEvent"`);
      expect(usage.rows[0]?.count).toBe("3");
    });
  });

  it("converges on the same schema as a database built from scratch", async () => {
    const introspect = async (client: Client) => {
      const columns = await client.query<{ signature: string }>(
        `SELECT table_name || '|' || column_name || '|' || data_type || '|' || is_nullable
                || '|' || coalesce(column_default,'-') AS signature
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
          ORDER BY 1`,
      );
      const indexes = await client.query<{ signature: string }>(
        `SELECT indexname || '|' || indexdef AS signature
           FROM pg_indexes
          WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
          ORDER BY 1`,
      );
      const checks = await client.query<{ signature: string }>(
        `SELECT conname || '|' || pg_get_constraintdef(oid) AS signature
           FROM pg_constraint WHERE contype = 'c' ORDER BY 1`,
      );
      return {
        columns: columns.rows.map((row) => row.signature),
        indexes: indexes.rows.map((row) => row.signature),
        checks: checks.rows.map((row) => row.signature),
      };
    };

    const upgraded = await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationsBefore());
      await seedLegacyWorkspace(client);
      await seedLegacyMessages(client, TIED_MESSAGES);
      await applyMigrations(client, migrationsFrom());
      return introspect(client);
    });

    const fresh = await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());
      return introspect(client);
    });

    expect(upgraded).toEqual(fresh);
  });

  it("rejects ledger rows that break the money invariants", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const insert = (values: string) =>
        client.query(
          `INSERT INTO "AgentUsageEvent"
             ("id","companyId","userId","reservedCredits","chargedCredits","allowanceCreditsSnapshot",
              "planSnapshot","subscriptionStatusSnapshot","periodStart","periodEnd","state","settledAt")
           VALUES (${values})`,
        );

      await expect(insert(`'bad1','co','u',1,5,0,'pro','active',NOW(),NOW(),'settled',NOW()`)).rejects.toThrow(
        /AgentUsageEvent_charge_within_reservation/,
      );

      await expect(insert(`'bad2','co','u',5,0,0,'pro','active',NOW(),NOW(),'reserved',NOW()`)).rejects.toThrow(
        /AgentUsageEvent_reserved_state_unsettled/,
      );

      await expect(insert(`'bad3','co','u',5,2,0,'pro','active',NOW(),NOW(),'released',NULL`)).rejects.toThrow(
        /AgentUsageEvent_released_state_uncharged/,
      );

      await expect(insert(`'bad4','co','u',-1,0,0,'pro','active',NOW(),NOW(),'reserved',NULL`)).rejects.toThrow(
        /AgentUsageEvent_amounts_nonnegative/,
      );
    });
  });
});
