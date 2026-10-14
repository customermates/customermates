import { PermissionService } from "@/core/base/permission.service";
import type { TenantUser } from "@/features/user/user.schema";
import type { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { WIKI_EMBEDDING_DIMENSIONS, WIKI_EMBEDDING_MODEL } from "@/ee/wiki-retrieval/wiki-embedding-model";
import { WikiSemanticQueryEmbedder } from "@/ee/wiki-retrieval/wiki-query-embedder";
import {
  WIKI_SEMANTIC_INDEX_BATCH_PAGES,
  WikiSemanticIndexService,
} from "@/ee/wiki-retrieval/wiki-semantic-index.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { SearchWikiPagesInteractor } from "../search-wiki-pages.interactor";
import { WikiMarkdownSchema } from "../wiki.schema";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const CONCEPTS = [
  ["refund", "money back", "reimbursed to the customer", "rückerstattung"],
  ["expense", "receipt", "out of pocket"],
  ["holiday", "vacation", "urlaub"],
  ["incident", "outage"],
];

function conceptVector(text: string): number[] {
  const lowered = text.toLowerCase();
  const vector = Array.from({ length: WIKI_EMBEDDING_DIMENSIONS }, () => 0);
  CONCEPTS.forEach((words, index) => {
    if (words.some((word) => lowered.includes(word))) vector[index] += 1;
  });
  vector[CONCEPTS.length] = 0.2;
  return vector;
}

const GRANT_PERIOD = {
  planSnapshot: "pro",
  subscriptionStatusSnapshot: "active",
  allowanceMicrocentsSnapshot: 100_000_000,
  periodStart: new Date(Date.UTC(2026, 8, 1)),
  periodEnd: new Date(Date.UTC(2026, 9, 1)),
} as const;

function fakeEmbeddings(authorized = true) {
  const embedTexts = vi.fn((_grant: unknown, texts: string[]) => Promise.resolve(texts.map(conceptVector)));
  const service = {
    authorizeQuery: vi.fn(() => Promise.resolve(authorized ? GRANT_PERIOD : null)),
    authorizeIndexing: vi.fn(() => Promise.resolve(authorized ? GRANT_PERIOD : null)),
    embedTexts,
  } as unknown as WikiEmbeddingService;
  return { service, embed: embedTexts };
}

describeDatabase("Workspace Wiki semantic retrieval on PostgreSQL with pgvector", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const user: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const foreignUser: TenantUser = createMockUser({ id: randomUUID(), companyId: foreignCompanyId });

  const insert = async (tenant: TenantUser, title: string, markdown: string, index = 0) => {
    const id = randomUUID();
    await client.query(
      'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
      [id, tenant.companyId, title, WikiMarkdownSchema.parse(markdown), new Date(Date.UTC(2026, 0, 1, 0, 0, index))],
    );
    return id;
  };
  const indexAll = (tenant: TenantUser, service: WikiEmbeddingService) =>
    runWithTenant(tenant, async () => {
      const indexer = new WikiSemanticIndexService(new PrismaWikiPageRepo(new PermissionService()), service);
      let indexed = 0;
      for (;;) {
        const result = await indexer.indexStalePages();
        indexed += result.indexed;
        if (!result.remaining) return indexed;
      }
    });
  const search = (query: string, service: WikiEmbeddingService, tenant = user, schedule = vi.fn()) =>
    runWithTenant(tenant, () =>
      new SearchWikiPagesInteractor(new PrismaWikiPageRepo(new PermissionService()), "stored", {
        embedder: new WikiSemanticQueryEmbedder(service),
        scheduler: { schedule },
      }).invoke({ query, page: 1, pageSize: 5 }),
    );

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "AgentUsageEvent" WHERE "companyId" = $1', [companyId]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AgentUsageEvent" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("indexes every section with the pinned model and re-embeds only sections whose text changed", async () => {
    const id = await insert(
      user,
      "Customer Refund Policy",
      "Refunds follow this page.\n\n## Annual plans\n\nMoney back within 30 days.\n\n## Monthly plans\n\nNo refund.",
    );
    const first = fakeEmbeddings();
    expect(await indexAll(user, first.service)).toBe(1);
    const rows = await client.query(
      'SELECT "ordinal", "section", "model", vector_dims("embedding") AS dims FROM "WikiPageChunk" WHERE "pageId" = $1 ORDER BY "ordinal"',
      [id],
    );
    expect(rows.rows).toEqual([
      { ordinal: 0, section: null, model: WIKI_EMBEDDING_MODEL, dims: WIKI_EMBEDDING_DIMENSIONS },
      { ordinal: 1, section: "Annual plans", model: WIKI_EMBEDDING_MODEL, dims: WIKI_EMBEDDING_DIMENSIONS },
      { ordinal: 2, section: "Monthly plans", model: WIKI_EMBEDDING_MODEL, dims: WIKI_EMBEDDING_DIMENSIONS },
    ]);
    expect(first.embed.mock.calls.flatMap(([, texts]) => texts)).toHaveLength(3);

    await client.query(
      `UPDATE "WikiPage" SET "markdown" = replace("markdown", 'No refund.', 'No refund after renewal.'), "updatedAt" = now() WHERE "id" = $1`,
      [id],
    );
    const second = fakeEmbeddings();
    expect(await indexAll(user, second.service)).toBe(1);
    expect(second.embed.mock.calls.flatMap(([, texts]) => texts)).toEqual([
      "Customer Refund Policy > Monthly plans\n\nNo refund after renewal.",
    ]);
    expect(await indexAll(user, fakeEmbeddings().service)).toBe(0);
  });

  it("gives each concurrent indexer different pages and drops a result when the page changed meanwhile", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) => insert(user, `Page ${index}`, `Holiday note ${index}`, index)),
    );
    const repo = () => new PrismaWikiPageRepo(new PermissionService());
    const [left, right] = await runWithTenant(user, () =>
      Promise.all([
        repo().claimStaleSemanticPages(WIKI_EMBEDDING_MODEL, 6),
        repo().claimStaleSemanticPages(WIKI_EMBEDDING_MODEL, 6),
      ]),
    );
    const leftIds = new Set(left.map(({ id }) => id));
    expect(left.length + right.length).toBe(10);
    expect(right.some(({ id }) => leftIds.has(id))).toBe(false);

    const [page] = left;
    await client.query('UPDATE "WikiPage" SET "updatedAt" = now() + interval \'1 second\' WHERE "id" = $1', [page.id]);
    const written = await runWithTenant(user, () =>
      repo().replaceSemanticChunks({
        pageId: page.id,
        pageUpdatedAt: page.updatedAt,
        model: WIKI_EMBEDDING_MODEL,
        chunks: [
          {
            ordinal: 0,
            offset: 0,
            section: null,
            text: page.title,
            contentHash: "stale",
            embedding: `[${conceptVector("holiday").join(",")}]`,
          },
        ],
      }),
    );
    expect(written).toBe(false);
    expect((await client.query('SELECT 1 FROM "WikiPageChunk" WHERE "pageId" = $1', [page.id])).rowCount).toBe(0);
  });

  it("claims at most the requested number of stale pages, so the backfill reports what remains", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => insert(user, `Page ${index}`, `Holiday note ${index}`, index)),
    );
    const claim = () =>
      runWithTenant(user, () =>
        new PrismaWikiPageRepo(new PermissionService()).claimStaleSemanticPages(WIKI_EMBEDDING_MODEL, 8),
      );

    const batches = [await claim(), await claim(), await claim(), await claim()];
    expect(batches.map((batch) => batch.length)).toEqual([8, 8, 4, 0]);
    expect(new Set(batches.flat().map(({ id }) => id)).size).toBe(20);

    await client.query('UPDATE "WikiPage" SET "semanticIndexClaimedAt" = NULL WHERE "companyId" = $1', [companyId]);
    const results = await runWithTenant(user, async () => {
      const indexer = new WikiSemanticIndexService(
        new PrismaWikiPageRepo(new PermissionService()),
        fakeEmbeddings().service,
      );
      return [await indexer.indexStalePages(), await indexer.indexStalePages(), await indexer.indexStalePages()];
    });
    expect(results.map(({ indexed }) => indexed)).toEqual([
      WIKI_SEMANTIC_INDEX_BATCH_PAGES,
      WIKI_SEMANTIC_INDEX_BATCH_PAGES,
      20 - 2 * WIKI_SEMANTIC_INDEX_BATCH_PAGES,
    ]);
    expect(results.map(({ remaining }) => remaining)).toEqual([true, true, false]);
  });

  it("ranks by meaning, returns the matching section, pins identifiers and never crosses tenants", async () => {
    const refunds = await insert(
      user,
      "Customer Refund Policy",
      "How we treat customers.\n\n## Annual plans\n\nCustomers get their money back within 30 days.",
      0,
    );
    const expenses = await insert(user, "Employee Expenses", "## Claims\n\nSubmit every receipt within a month.", 1);
    const incidents = await insert(
      user,
      "Incident Runbook",
      "## Codes\n\nError E-4012 means the sync token expired.",
      2,
    );
    await insert(foreignUser, "Foreign Refunds", "## Refund\n\nForeign money back rules.", 0);
    const { service } = fakeEmbeddings();
    await indexAll(user, service);
    await indexAll(foreignUser, service);

    const semantic = await search("client wants a refund", service);
    if (!semantic.ok) throw new Error("search failed");
    expect(semantic.data.retrieval).toBe("semantic");
    expect(semantic.data.items[0]).toMatchObject({ id: refunds, section: "Annual plans" });
    expect(semantic.data.items.map(({ title }) => title)).not.toContain("Foreign Refunds");
    expect(semantic.data.items.map(({ id }) => id)).not.toContain(expenses);

    const identifier = await search("E4012 refund", service);
    if (!identifier.ok) throw new Error("search failed");
    expect(identifier.data.items[0]).toMatchObject({ id: incidents, section: "Codes" });
  });

  it("lets keyword matches cover pages that are not indexed yet and asks for indexing", async () => {
    await insert(user, "Customer Refund Policy", "## Annual plans\n\nMoney back within 30 days.", 0);
    const { service } = fakeEmbeddings();
    await indexAll(user, service);
    const fresh = await insert(
      user,
      "Holiday Calendar",
      "## Office closures\n\nThe office closes between Christmas and New Year.",
      1,
    );
    const schedule = vi.fn(() => Promise.resolve());

    const result = await search("office closures christmas", service, user, schedule);
    if (!result.ok) throw new Error("search failed");
    expect(result.data.retrieval).toBe("semantic");
    expect(result.data.items.map(({ id }) => id)).toContain(fresh);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("falls back to keyword search without credits", async () => {
    await insert(user, "Customer Refund Policy", "## Annual plans\n\nRefund within 30 days.", 0);
    const { service, embed } = fakeEmbeddings(false);

    const result = await search("refund", service);
    if (!result.ok) throw new Error("search failed");
    expect(result.data.retrieval).toBe("keyword");
    expect(result.data.items[0]).toMatchObject({ title: "Customer Refund Policy" });
    expect(embed).not.toHaveBeenCalled();
  });
});
