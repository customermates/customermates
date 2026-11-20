import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaAgentProviderKeyRepo } from "../prisma-agent-provider-key.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PrismaAgentProviderKeyRepo", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const otherOwnerId = randomUUID();
  const repo = () => new PrismaAgentProviderKeyRepo();
  const asOwner = <T>(fn: () => Promise<T>, company = companyId, user = ownerId) =>
    runWithTenant(createMockUser({ id: user, companyId: company }), fn);

  const write = (provider: "anthropic" | "openai" | "google", overrides: Record<string, unknown> = {}) => ({
    provider,
    label: `${provider} key`,
    keyCiphertext: `v1.cipher.${provider}.text`,
    keyLast4: "1234",
    defaultModel: null,
    validatedAt: new Date("2026-11-17T08:00:00.000Z"),
    ...overrides,
  });

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);
    for (const [id, company] of [
      [ownerId, companyId],
      [otherOwnerId, otherCompanyId],
    ] as const) {
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
         VALUES ($1, $2, 'Key', 'Owner', $3, 'active'::"Status", CURRENT_TIMESTAMP)`,
        [id, `key-${id}@example.invalid`, company],
      );
    }
  });

  afterAll(async () => {
    const companies = [companyId, otherCompanyId];
    await client.query('DELETE FROM "AgentProviderKey" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [companies]);
    await client.end();
  });

  it("keeps one key per provider and replaces it when the same provider is saved again", async () => {
    const first = await asOwner(() => repo().upsert(write("anthropic", { label: "First", keyLast4: "1111" })));
    const second = await asOwner(() =>
      repo().upsert(write("anthropic", { label: "Second", keyLast4: "2222", defaultModel: "claude-sonnet-5-5" })),
    );
    await asOwner(() => repo().upsert(write("openai")));

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      label: "Second",
      keyLast4: "2222",
      defaultModel: "claude-sonnet-5-5",
      lastUsedAt: null,
    });
    const listed = await asOwner(() => repo().findAll());
    expect(listed.map((key) => key.provider).sort()).toEqual(["anthropic", "openai"]);
    expect(Object.keys(listed[0])).not.toContain("keyCiphertext");
    const { rows } = await client.query('SELECT "createdById" FROM "AgentProviderKey" WHERE "id" = $1', [first.id]);
    expect(rows[0]).toEqual({ createdById: ownerId });
  });

  it("never shows, tests or removes a key of another workspace", async () => {
    const mine = await asOwner(() => repo().upsert(write("google")));
    const theirs = await asOwner(() => repo().upsert(write("google")), otherCompanyId, otherOwnerId);

    await asOwner(async () => {
      expect((await repo().findAll()).map((key) => key.id)).not.toContain(theirs.id);
      expect(await repo().findSealed(theirs.id)).toBeNull();
      expect(await repo().markValidated(theirs.id, new Date())).toBeNull();
      expect(await repo().delete(theirs.id)).toBe(false);
      expect(await repo().findSealed(mine.id)).toMatchObject({ id: mine.id, keyCiphertext: "v1.cipher.google.text" });
    });
    const { rows } = await client.query('SELECT COUNT(*)::int AS "count" FROM "AgentProviderKey" WHERE "id" = $1', [
      theirs.id,
    ]);
    expect(rows[0]).toEqual({ count: 1 });
  });

  it("stamps a new validation time and deletes by id", async () => {
    const saved = await asOwner(() =>
      repo().upsert(write("openai", { validatedAt: new Date("2026-01-01T00:00:00.000Z") })),
    );
    const later = new Date("2026-11-17T10:00:00.000Z");

    const validated = await asOwner(() => repo().markValidated(saved.id, later));
    expect(validated?.validatedAt).toEqual(later);

    expect(await asOwner(() => repo().delete(saved.id))).toBe(true);
    expect(await asOwner(() => repo().delete(saved.id))).toBe(false);
  });

  it("hands the runtime the sealed key of one workspace's provider and records its use", async () => {
    const saved = await asOwner(() => repo().upsert(write("anthropic")), otherCompanyId, otherOwnerId);
    const usedAt = new Date("2026-11-17T11:00:00.000Z");

    expect(await repo().findSealedUnscoped(companyId, "anthropic")).not.toMatchObject({ id: saved.id });
    const sealed = await repo().findSealedUnscoped(otherCompanyId, "anthropic");
    expect(sealed).toMatchObject({
      id: saved.id,
      companyId: otherCompanyId,
      keyCiphertext: "v1.cipher.anthropic.text",
    });

    await repo().touchLastUsedUnscoped(companyId, saved.id, usedAt);
    expect((await repo().findSealedUnscoped(otherCompanyId, "anthropic"))?.lastUsedAt).toBeNull();
    await repo().touchLastUsedUnscoped(otherCompanyId, saved.id, usedAt);
    expect((await repo().findSealedUnscoped(otherCompanyId, "anthropic"))?.lastUsedAt).toEqual(usedAt);
  });
});
