import type { TenantUser } from "@/features/user/user.schema";
import type { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";
import type { WikiSummaryService } from "@/ee/wiki-retrieval/wiki-summary.service";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { RankableSection } from "@/core/retrieval/retrieval-context";
import { runWithSectionRanking } from "@/core/retrieval/retrieval-context";
import { docsRankSpec } from "@/ee/agent-chat/docs-rerank";
import { RETRIEVAL_RERANK_BUDGET_CHARS } from "@/core/retrieval/retrieval-pipeline";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { WIKI_EMBEDDING_DIMENSIONS, WIKI_EMBEDDING_VERSION } from "@/ee/wiki-retrieval/wiki-embedding-model";
import { WikiSemanticQueryEmbedder } from "@/ee/wiki-retrieval/wiki-query-embedder";
import {
  WIKI_SEMANTIC_INDEX_BATCH_PAGES,
  WikiSemanticIndexService,
} from "@/ee/wiki-retrieval/wiki-semantic-index.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaWikiKnowledgeGapRepo } from "../prisma-wiki-knowledge-gap.repository";
import { createTestWikiSectionRepo } from "@/tests/helpers/wiki-section-repository";
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

function fakeSummaries(summary = (title: string) => `${title} in one sentence.`) {
  const summarize = vi.fn((_grant: unknown, page: { title: string }) =>
    Promise.resolve({
      status: "generated" as const,
      summary: summary(page.title),
    }),
  );
  return { summarize };
}

describeDatabase("Workspace Wiki semantic retrieval on PostgreSQL with pgvector", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const user: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const foreignUser: TenantUser = createMockUser({
    id: randomUUID(),
    companyId: foreignCompanyId,
  });

  const insert = async (tenant: TenantUser, title: string, markdown: string, index = 0) => {
    const id = randomUUID();
    await client.query(
      'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
      [id, tenant.companyId, title, WikiMarkdownSchema.parse(markdown), new Date(Date.UTC(2026, 0, 1, 0, 0, index))],
    );
    return id;
  };
  const indexAll = (
    tenant: TenantUser,
    service: WikiEmbeddingService,
    summaries: Pick<WikiSummaryService, "summarize"> = fakeSummaries(),
  ) =>
    runWithTenant(tenant, async () => {
      const indexer = new WikiSemanticIndexService(createTestWikiSectionRepo(), service, summaries);
      let indexed = 0;
      for (;;) {
        const result = await indexer.indexStalePages();
        indexed += result.indexed;
        if (!result.remaining) return indexed;
      }
    });
  const search = (query: string, service: WikiEmbeddingService, tenant = user, schedule = vi.fn()) =>
    runWithTenant(tenant, () =>
      new SearchWikiPagesInteractor(createTestWikiSectionRepo(), "stored", {
        embedder: new WikiSemanticQueryEmbedder(service),
        scheduler: { schedule },
        gaps: new PrismaWikiKnowledgeGapRepo(),
      }).invoke({ query, page: 1, pageSize: 5 }),
    );
  const sectionRows = (pageId: string) =>
    client.query(
      `SELECT "ordinal", "headingPath", "anchor", "text", "summary", "embeddingVersion", vector_dims("embedding") AS dims
       FROM "WikiPageSection" WHERE "pageId" = $1 ORDER BY "ordinal"`,
      [pageId],
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
    await client.query('DELETE FROM "WikiKnowledgeGap" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "WikiIndexSchedule" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "AgentUsageEvent" WHERE "companyId" = $1', [companyId]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AgentUsageEvent" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("stores every section with its text, summary and pinned embedding version, re-embedding only changed text", async () => {
    const id = await insert(
      user,
      "Customer Refund Policy",
      "Refunds follow this page.\n\n## Annual plans\n\nMoney back within 30 days.\n\n## Monthly plans\n\nNo refund.",
    );
    const first = fakeEmbeddings();
    expect(await indexAll(user, first.service)).toBe(1);
    const summary = "Customer Refund Policy in one sentence.";
    const expected = (ordinal: number, headingPath: string[], anchor: string, text: string) => ({
      ordinal,
      headingPath,
      anchor,
      text,
      summary,
      embeddingVersion: WIKI_EMBEDDING_VERSION,
      dims: WIKI_EMBEDDING_DIMENSIONS,
    });
    expect((await sectionRows(id)).rows).toEqual([
      expected(0, [], "", "Refunds follow this page."),
      expected(1, ["Annual plans"], "annual-plans", "Money back within 30 days."),
      expected(2, ["Monthly plans"], "monthly-plans", "No refund."),
    ]);
    expect(first.embed.mock.calls.flatMap(([, texts]) => texts)).toEqual([
      `${summary}\n\nCustomer Refund Policy\n\nRefunds follow this page.`,
      `${summary}\n\nCustomer Refund Policy > Annual plans\n\nMoney back within 30 days.`,
      `${summary}\n\nCustomer Refund Policy > Monthly plans\n\nNo refund.`,
    ]);

    await client.query(
      `UPDATE "WikiPage" SET "markdown" = replace("markdown", 'No refund.', 'No refund after renewal.'), "updatedAt" = now() WHERE "id" = $1`,
      [id],
    );
    const second = fakeEmbeddings();
    expect(await indexAll(user, second.service)).toBe(1);
    expect(second.embed.mock.calls.flatMap(([, texts]) => texts)).toEqual([
      `${summary}\n\nCustomer Refund Policy > Monthly plans\n\nNo refund after renewal.`,
    ]);
    expect(await indexAll(user, fakeEmbeddings().service)).toBe(0);
  });

  it("splits a long section on paragraph boundaries into rows of at most 1,800 characters", async () => {
    const paragraphs = Array.from({ length: 6 }, (_, index) => `Paragraph ${index} ${"holiday ".repeat(60).trim()}.`);
    const id = await insert(user, "Long", `## Notes\n\n${paragraphs.join("\n\n")}`);
    await indexAll(user, fakeEmbeddings().service);
    const rows = (await sectionRows(id)).rows as Array<{
      text: string;
      anchor: string;
    }>;
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every(({ text }) => text.length <= 1_800)).toBe(true);
    expect(rows.every(({ anchor }) => anchor === "notes")).toBe(true);
    expect(rows.map(({ text }) => text).join("\n\n")).toBe(paragraphs.join("\n\n"));
    expect(rows.every(({ text }) => text.startsWith("Paragraph "))).toBe(true);
  });

  it("generates a summary only when the page content hash changed, and keeps untouched imports summary-free", async () => {
    const id = await insert(user, "Holiday Calendar", "## Closures\n\nThe office closes for the holiday.");
    const imported = await insert(user, "Imported vacation page", "Vacation rules copied from the website.", 1);
    await client.query(
      'UPDATE "WikiPage" SET "sourceUrl" = $2, "sourceImportedUpdatedAt" = "updatedAt" WHERE "id" = $1',
      [imported, "https://example.com/vacation"],
    );
    const summaries = fakeSummaries();
    await indexAll(user, fakeEmbeddings().service, summaries);
    expect(summaries.summarize.mock.calls.map(([, page]) => page.title)).toEqual(["Holiday Calendar"]);

    await client.query('UPDATE "WikiPageSection" SET "embeddingVersion" = $2 WHERE "pageId" = $1', [id, "old/version"]);
    const requeued = fakeEmbeddings();
    expect(await indexAll(user, requeued.service, summaries)).toBe(1);
    expect(requeued.embed).toHaveBeenCalled();
    expect(summaries.summarize).toHaveBeenCalledTimes(1);

    await client.query(
      `UPDATE "WikiPage" SET "markdown" = "markdown" || E'\n\nAlso on New Year.', "updatedAt" = now() WHERE "id" = $1`,
      [id],
    );
    await indexAll(user, fakeEmbeddings().service, summaries);
    expect(summaries.summarize).toHaveBeenCalledTimes(2);
    const stored = await client.query('SELECT "id", "summary" FROM "WikiPage" WHERE "id" = ANY($1) ORDER BY "title"', [
      [id, imported],
    ]);
    expect(stored.rows).toEqual([
      { id, summary: "Holiday Calendar in one sentence." },
      { id: imported, summary: null },
    ]);
  });

  it("skips a page whose summary fails once per content hash, still indexes it and moves on", async () => {
    const earlier = await insert(user, "Expense Policy", "Receipts within 30 days.", 0);
    const broken = await insert(user, "Broken Page", "## Closures\n\nThe office closes for the holiday.", 2);
    const later = await insert(user, "Incident Runbook", "Page the on-call for an outage.", 1);
    const summarize = vi.fn((_grant: unknown, page: { title: string }) =>
      Promise.resolve(
        page.title === "Broken Page"
          ? { status: "failed" as const }
          : {
              status: "generated" as const,
              summary: `${page.title} in one sentence.`,
            },
      ),
    );
    const summaryCalls = () => summarize.mock.calls.filter(([, page]) => page.title === "Broken Page").length;

    expect(await indexAll(user, fakeEmbeddings().service, { summarize })).toBe(3);
    expect(summaryCalls()).toBe(1);
    expect((await sectionRows(earlier)).rowCount).toBeGreaterThan(0);
    expect((await sectionRows(later)).rowCount).toBeGreaterThan(0);
    const brokenRows = await sectionRows(broken);
    expect(brokenRows.rowCount).toBeGreaterThan(0);
    expect(brokenRows.rows.every((row) => row.summary === null && row.dims === WIKI_EMBEDDING_DIMENSIONS)).toBe(true);

    await client.query('UPDATE "WikiPageSection" SET "embeddingVersion" = $2 WHERE "pageId" = $1', [
      broken,
      "old/version",
    ]);
    expect(await indexAll(user, fakeEmbeddings().service, { summarize })).toBe(1);
    expect(summaryCalls()).toBe(1);

    await client.query(
      `UPDATE "WikiPage" SET "markdown" = "markdown" || E'\n\nAlso on New Year.', "updatedAt" = now() WHERE "id" = $1`,
      [broken],
    );
    await indexAll(user, fakeEmbeddings().service, { summarize });
    expect(summaryCalls()).toBe(2);
  });

  it("stops without marking the page when the summary provider is unavailable", async () => {
    const first = await insert(user, "Expense Policy", "Receipts within 30 days.", 1);
    const second = await insert(user, "Incident Runbook", "Page the on-call for an outage.", 0);
    const summarize = vi.fn(() => Promise.resolve({ status: "unavailable" as const }));

    expect(await indexAll(user, fakeEmbeddings().service, { summarize })).toBe(0);
    expect(summarize).toHaveBeenCalledTimes(1);
    const stored = await client.query('SELECT "summaryContentHash" FROM "WikiPage" WHERE "id" = ANY($1)', [
      [first, second],
    ]);
    expect(stored.rows).toEqual([{ summaryContentHash: null }, { summaryContentHash: null }]);
    expect((await sectionRows(first)).rowCount).toBe(0);
    expect((await sectionRows(second)).rowCount).toBe(0);
  });

  it("gives each concurrent indexer different pages and drops a result when the page changed meanwhile", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) => insert(user, `Page ${index}`, `Holiday note ${index}`, index)),
    );
    const repo = () => createTestWikiSectionRepo();
    const [left, right] = await runWithTenant(user, () =>
      Promise.all([
        repo().claimStaleIndexPages(WIKI_EMBEDDING_VERSION, 6),
        repo().claimStaleIndexPages(WIKI_EMBEDDING_VERSION, 6),
      ]),
    );
    const leftIds = new Set(left.map(({ id }) => id));
    expect(left.length + right.length).toBe(10);
    expect(right.some(({ id }) => leftIds.has(id))).toBe(false);

    const [page] = left;
    await client.query('UPDATE "WikiPage" SET "updatedAt" = now() + interval \'1 second\' WHERE "id" = $1', [page.id]);
    const written = await runWithTenant(user, () =>
      repo().replaceSections({
        pageId: page.id,
        pageUpdatedAt: page.updatedAt,
        pageTitle: page.title,
        summary: null,
        rows: [
          {
            ordinal: 0,
            offset: 0,
            headingPath: [],
            anchor: "",
            text: page.title,
            contentHash: "stale",
            embeddingText: page.title,
          },
        ],
        embeddings: new Map([["stale", `[${conceptVector("holiday").join(",")}]`]]),
        version: WIKI_EMBEDDING_VERSION,
        onlyIfStale: false,
      }),
    );
    expect(written).toBe(false);
    expect((await client.query('SELECT 1 FROM "WikiPageSection" WHERE "pageId" = $1', [page.id])).rowCount).toBe(0);
  });

  it("claims at most the requested number of stale pages, so the backfill reports what remains", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => insert(user, `Page ${index}`, `Holiday note ${index}`, index)),
    );
    const claim = () =>
      runWithTenant(user, () => createTestWikiSectionRepo().claimStaleIndexPages(WIKI_EMBEDDING_VERSION, 8));

    const batches = [await claim(), await claim(), await claim(), await claim()];
    expect(batches.map((batch) => batch.length)).toEqual([8, 8, 4, 0]);
    expect(new Set(batches.flat().map(({ id }) => id)).size).toBe(20);

    await client.query('UPDATE "WikiPage" SET "semanticIndexClaimedAt" = NULL WHERE "companyId" = $1', [companyId]);
    const results = await runWithTenant(user, async () => {
      const indexer = new WikiSemanticIndexService(
        createTestWikiSectionRepo(),
        fakeEmbeddings().service,
        fakeSummaries(),
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
    const plain = fakeSummaries(() => "");
    await indexAll(user, service, plain);
    await indexAll(foreignUser, service, plain);

    const semantic = await search("client wants a refund", service);
    if (!semantic.ok) throw new Error("search failed");
    expect(semantic.data.retrieval).toBe("semantic");
    expect(semantic.data.items[0]).toMatchObject({
      id: refunds,
      section: "Annual plans",
      anchor: "annual-plans",
    });
    expect(semantic.data.items.map(({ title }) => title)).not.toContain("Foreign Refunds");
    expect(semantic.data.items.map(({ id }) => id)).not.toContain(expenses);

    const identifier = await search("E4012 refund", service);
    if (!identifier.ok) throw new Error("search failed");
    expect(identifier.data.items[0]).toMatchObject({
      id: incidents,
      section: "Codes",
    });
  });

  it("fuses full-text and semantic section lists with reciprocal rank fusion", async () => {
    const lexical = await insert(user, "Parking rules", "## Garage\n\nThe parking garage opens at seven.", 0);
    const semanticOnly = await insert(user, "Vacation", "## Leave\n\nAsk for holiday two weeks ahead.", 1);
    const both = await insert(user, "Holiday parking", "## Closures\n\nParking is free on every holiday.", 2);
    const { service } = fakeEmbeddings();
    await indexAll(
      user,
      service,
      fakeSummaries(() => ""),
    );

    const result = await search("parking vacation", service);
    if (!result.ok) throw new Error("search failed");
    const ids = result.data.items.map(({ id }) => id);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining([lexical, semanticOnly, both]));
    expect(ids.indexOf(both)).toBeLessThan(ids.indexOf(lexical));
  });

  it("re-ranks whole sections, rejoining split rows, with the evidence budget spent in rank order", async () => {
    const paragraph = `${"holiday ".repeat(150).trim()}.`;
    const long = Array.from({ length: 4 }, () => paragraph).join("\n\n");
    for (let index = 0; index < 10; index += 1)
      await insert(user, `Holiday page ${index}`, `## Rules ${index}\n\n${long}`, index);
    const { service } = fakeEmbeddings();
    await indexAll(
      user,
      service,
      fakeSummaries(() => ""),
    );
    const seen: RankableSection[][] = [];
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) => {
      seen.push([...candidates]);
      return Promise.resolve(null);
    });

    const result = await runWithSectionRanking(
      () => ranker,
      () => search("holiday rules", service),
    );
    expect(result.ok).toBe(true);
    expect(ranker).toHaveBeenCalledTimes(1);
    const [candidates] = seen;
    expect(candidates).toHaveLength(10);
    expect(candidates.every(({ section }) => section.text === long)).toBe(true);
    const options = docsRankSpec(candidates, "wiki", "holiday rules").questions[0].options;
    const evidence = candidates.map(({ id }) => options[`s${id}`]);
    const whole = evidence.filter((option) => option.includes(`${paragraph} ${paragraph} ${paragraph} ${paragraph}`));
    expect(whole.length).toBeGreaterThan(1);
    expect(whole.length).toBeLessThan(10);
    expect(evidence.slice(0, whole.length)).toEqual(whole);
    expect(evidence.join("").length).toBeLessThanOrEqual(RETRIEVAL_RERANK_BUDGET_CHARS + 10 * 200);
  });

  it("abstains with an explicit result and records one anonymised gap per query shape", async () => {
    await insert(user, "Customer Refund Policy", "## Annual plans\n\nMoney back within 30 days.", 0);
    const { service } = fakeEmbeddings();
    await indexAll(
      user,
      service,
      fakeSummaries(() => ""),
    );

    const first = await search("Incident outage escalation?", service);
    if (!first.ok) throw new Error("search failed");
    expect(first.data).toMatchObject({
      items: [],
      total: 0,
      abstained: true,
    });
    await search("  incident OUTAGE   escalation ", service);
    await search("refund", service);

    const gaps = await client.query(
      'SELECT "companyId", "query", "count", "firstSeenAt" <= "lastSeenAt" AS "ordered" FROM "WikiKnowledgeGap" WHERE "companyId" = ANY($1)',
      [[companyId, foreignCompanyId]],
    );
    expect(gaps.rows).toEqual([
      {
        companyId,
        query: "incident outage escalation",
        count: 2,
        ordered: true,
      },
    ]);
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'WikiKnowledgeGap' ORDER BY column_name`,
    );
    expect(columns.rows.map(({ column_name }: { column_name: string }) => column_name)).not.toContain("userId");
  });

  it("reports a partly rebuilt section index as incomplete, without abstaining or recording a gap", async () => {
    const values = Array.from({ length: 101 }, (_, index) => [
      randomUUID(),
      companyId,
      `Holiday note ${index}`,
      WikiMarkdownSchema.parse(`Office closure ${index}.`),
      new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    ]);
    await client.query(
      `INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "createdAt", "updatedAt")
       SELECT v."id", v."companyId", v."title", v."markdown", v."at", v."at"
       FROM jsonb_to_recordset($1::jsonb) AS v("id" text, "companyId" text, "title" text, "markdown" text, "at" timestamptz)`,
      [
        JSON.stringify(
          values.map(([id, company, title, markdown, at]) => ({ id, companyId: company, title, markdown, at })),
        ),
      ],
    );
    const { service } = fakeEmbeddings();
    const schedule = vi.fn(() => Promise.resolve());

    const partial = await search("Incident outage escalation?", service, user, schedule);
    if (!partial.ok) throw new Error("search failed");
    expect(partial.data).toMatchObject({ items: [], incomplete: true, totalIsExact: false });
    expect(partial.data.abstained).toBeUndefined();
    expect(schedule).toHaveBeenCalled();

    const complete = await search("Incident outage escalation?", service, user, schedule);
    if (!complete.ok) throw new Error("search failed");
    expect(complete.data.incomplete).toBeUndefined();
    expect(complete.data.abstained).toBe(true);
    const gaps = await client.query('SELECT "count" FROM "WikiKnowledgeGap" WHERE "companyId" = $1', [companyId]);
    expect(gaps.rows).toEqual([{ count: 1 }]);
  });

  it("syncs every stale section in batches without any provider call", async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, index) => insert(user, `Page ${index}`, `Holiday note ${index}`, index)),
    );
    const repo = createTestWikiSectionRepo();
    const batches = await runWithTenant(user, async () => [
      await repo.syncStaleSections(2),
      await repo.syncStaleSections(2),
      await repo.syncStaleSections(2),
      await repo.syncStaleSections(2),
    ]);
    expect(batches).toEqual([
      { synced: 2, remaining: true },
      { synced: 2, remaining: true },
      { synced: 1, remaining: false },
      { synced: 0, remaining: false },
    ]);
    const unsynced = await client.query(
      `SELECT count(*)::int AS "count" FROM "WikiPage" p WHERE p."companyId" = $1
       AND NOT EXISTS (SELECT 1 FROM "WikiPageSection" s WHERE s."pageId" = p."id" AND s."pageUpdatedAt" = p."updatedAt")`,
      [companyId],
    );
    expect(unsynced.rows).toEqual([{ count: 0 }]);
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

  it("throttles search-triggered indexing per workspace in the database", async () => {
    const claim = () => runWithTenant(user, () => createTestWikiSectionRepo().claimIndexSchedule(60));
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    await client.query(
      `UPDATE "WikiIndexSchedule" SET "scheduledAt" = now() - interval '2 minutes' WHERE "companyId" = $1`,
      [companyId],
    );
    expect(await claim()).toBe(true);
  });

  it("falls back to keyword search without credits", async () => {
    await insert(user, "Customer Refund Policy", "## Annual plans\n\nRefund within 30 days.", 0);
    const { service, embed } = fakeEmbeddings(false);

    const result = await search("refund", service);
    if (!result.ok) throw new Error("search failed");
    expect(result.data.retrieval).toBe("keyword");
    expect(result.data.items[0]).toMatchObject({
      title: "Customer Refund Policy",
    });
    expect(embed).not.toHaveBeenCalled();
  });
});
