import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { ForbiddenError } from "@/core/errors/app-errors";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";

import { GetWikiKnowledgeGapsInteractor } from "../get-wiki-knowledge-gaps.interactor";
import { PrismaWikiKnowledgeGapRepo } from "../prisma-wiki-knowledge-gap.repository";
import { PruneWikiKnowledgeGapsInteractor } from "../prune-wiki-knowledge-gaps.interactor";
import { wikiKnowledgeGapQuery } from "../wiki-knowledge-gaps";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Knowledge Base gaps on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const editor: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const foreign: TenantUser = createMockUser({
    id: randomUUID(),
    companyId: foreignCompanyId,
  });
  const reader: TenantUser = {
    ...createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]),
    companyId,
  };

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "WikiKnowledgeGap" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("normalises a query into one shape of at most 200 characters", () => {
    expect(wikiKnowledgeGapQuery("  Where is the PARKING garage?! ")).toBe("where is the parking garage");
    expect(wikiKnowledgeGapQuery("?!")).toBeNull();
    expect(Array.from(wikiKnowledgeGapQuery("ä".repeat(300)) ?? "")).toHaveLength(200);
  });

  it("lists only the caller's workspace gaps, and only for Knowledge Base editors", async () => {
    await runWithTenant(editor, async () => {
      const repo = new PrismaWikiKnowledgeGapRepo();
      await repo.record("Parking garage?");
      await repo.record("parking   GARAGE");
      await repo.record("Holiday rota");
    });
    await runWithTenant(foreign, () => new PrismaWikiKnowledgeGapRepo().record("foreign question"));

    const listed = await runWithTenant(editor, () =>
      new GetWikiKnowledgeGapsInteractor(new PrismaWikiKnowledgeGapRepo()).invoke(),
    );
    expect(listed).toMatchObject({
      ok: true,
      data: {
        items: [
          { query: "parking garage", count: 2 },
          { query: "holiday rota", count: 1 },
        ],
      },
    });
    await expect(
      runWithTenant(reader, () => new GetWikiKnowledgeGapsInteractor(new PrismaWikiKnowledgeGapRepo()).invoke()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("prunes gaps not seen for 90 days in the daily lifecycle run", async () => {
    await runWithTenant(editor, async () => {
      const repo = new PrismaWikiKnowledgeGapRepo();
      await repo.record("old question");
      await repo.record("recent question");
    });
    await client.query(
      `UPDATE "WikiKnowledgeGap" SET "lastSeenAt" = now() - interval '91 days' WHERE "companyId" = $1 AND "query" = 'old question'`,
      [companyId],
    );

    const result = await new PruneWikiKnowledgeGapsInteractor(new PrismaWikiKnowledgeGapRepo()).invoke();
    expect(result.pruned).toBeGreaterThanOrEqual(1);
    const remaining = await client.query('SELECT "query" FROM "WikiKnowledgeGap" WHERE "companyId" = $1', [companyId]);
    expect(remaining.rows).toEqual([{ query: "recent question" }]);
  });
});
