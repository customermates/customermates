import type { TenantUser } from "@/features/user/user.schema";
import type { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";
import type { AgentUsageService } from "@/ee/agent-chat/agent-usage.service";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type * as WikiEmbeddingModel from "@/ee/wiki-retrieval/wiki-embedding-model";

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { PermissionService } from "@/core/base/permission.service";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("@/ee/agent-chat/agent-availability", () => ({ isAgentChatAvailable: () => true }));
vi.mock("@/ee/wiki-retrieval/wiki-embedding-model", async (importOriginal) => {
  const original = await importOriginal<typeof WikiEmbeddingModel>();
  return {
    ...original,
    embedWikiTexts: vi.fn((texts: string[]) =>
      Promise.resolve({
        vectors: texts.map(conceptVector),
        charge: { model: original.WIKI_EMBEDDING_MODEL, inputTokens: 1, costMicrocents: 0, costSource: "estimated" },
      }),
    ),
  };
});

const CONCEPTS = [
  ["dark", "dunk", "night"],
  ["language", "sprache"],
  ["schema", "data model", "datenmodell"],
  ["hot leads", "heiße leads"],
  ["organization", "firma"],
];

function conceptVector(text: string): number[] {
  const lowered = text.toLowerCase();
  const vector = Array.from({ length: 768 }, () => 0);
  CONCEPTS.forEach((words, index) => {
    if (words.some((word) => lowered.includes(word))) vector[index] += 1;
  });
  vector[CONCEPTS.length] = 0.2;
  return vector;
}

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { WIKI_EMBEDDING_MODEL } = await import("@/ee/wiki-retrieval/wiki-embedding-model");
const { PrismaRecordRepo } = await import("@/features/records/prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { SearchRecordsInteractor } = await import("@/features/records/search-records.interactor");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { PrismaDataViewRepo } = await import("@/features/data-view/prisma-data-view.repository");
const { PrismaDocsChunkRepo } = await import("@/features/mcp-tools/prisma-docs-chunk.repository");
const { PrismaSearchCatalogRepo } = await import("../prisma-search-catalog.repository");
const { SearchCommandCatalogInteractor, COMMAND_SEARCH_EMBEDDING_WAIT_MS } = await import(
  "../search-command-catalog.interactor"
);
const { SearchCatalogIndexService } = await import("@/ee/wiki-retrieval/search-catalog-index.service");
const { staticSearchCatalog } = await import("../search-catalog-corpus");
const { STATIC_COMMANDS } = await import("@/components/keyboard/command-registry");
const { APP_LOCALES } = await import("@/i18n/locale-registry");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

const GRANT = {
  purpose: "wikiIndexing",
  userId: null,
  planSnapshot: "pro",
  subscriptionStatusSnapshot: "active",
  allowanceMicrocentsSnapshot: 100_000_000,
  periodStart: new Date(Date.UTC(2026, 9, 1)),
  periodEnd: new Date(Date.UTC(2026, 10, 1)),
} as const;

function fakeEmbeddings() {
  const embedTexts = vi.fn((_grant: unknown, texts: string[]) => Promise.resolve(texts.map(conceptVector)));
  const service = {
    authorizeIndexing: vi.fn(() => Promise.resolve(GRANT)),
    embedTexts,
  } as unknown as WikiEmbeddingService;
  return { service, embedTexts };
}

const usage = {
  admitsPlatformRetrieval: () => Promise.resolve(true),
  reservePlatformRetrieval: () => Promise.resolve("reservation"),
  settlePlatformRetrieval: () => Promise.resolve(),
} as unknown as AgentUsageService;

const repo = new PrismaRecordRepo();
const catalogRepo = new PrismaSearchCatalogRepo();
const views = new PrismaDataViewRepo();

async function workspace(viewName: string) {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const adminRole = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const memberRole = await prisma.userRole.create({
      data: { companyId: company.id, name: "Member", isSystemRole: false },
    });
    const user = (roleId: string, firstName: string) =>
      prisma.user.create({
        data: {
          companyId: company.id,
          roleId,
          firstName,
          lastName: "Search",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      });
    return {
      company,
      adminRole,
      memberRole,
      admin: await user(adminRole.id, "Admin"),
      member: await user(memberRole.id, "Member"),
    };
  });
  const admin: TenantUser = createMockUser({ ...seed.admin, role: { ...seed.adminRole, permissions: [] } });
  const member: TenantUser = createMockUser({ ...seed.member, role: { ...seed.memberRole, permissions: [] } });
  const id = (key: string) => presetId(seed.company.id, key);
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
  );
  const view = await runWithoutTenant(() =>
    prisma.dataView.create({
      data: {
        companyId: seed.company.id,
        userId: admin.id,
        surfaceKey: `records:${id("organization")}`,
        name: viewName,
      },
    }),
  );
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
  );
  const createOrganization = async (name: string) => {
    const mutation: RecordMutation = {
      action: "create",
      typeId: id("organization"),
      fields: [{ fieldId: id("organization.name"), value: { kind: "text", value: name } }],
    };
    const result = await runWithTenant(admin, () =>
      mutate.invoke({ expectedRevision: 1, idempotencyKey: randomUUID(), mutation }),
    );
    if (!result.ok || result.data.status !== "completed" || !result.data.refs[0]) throw new Error("Expected record");
    return result.data.refs[0];
  };
  return { companyId: seed.company.id, admin, member, id, view, policy, createOrganization };
}

function indexer(embeddings: WikiEmbeddingService) {
  return new SearchCatalogIndexService(catalogRepo, repo, views, embeddings, usage);
}

function searcher(
  policy: InstanceType<typeof RecordAccessPolicy>,
  embed: (query: string) => Promise<{ vector: number[]; model: string } | null> = (query) =>
    Promise.resolve({ vector: conceptVector(query), model: WIKI_EMBEDDING_MODEL }),
) {
  const schedule = vi.fn(() => Promise.resolve());
  const interactor = new SearchCommandCatalogInteractor(
    repo,
    policy,
    views,
    catalogRepo,
    new PrismaDocsChunkRepo(),
    embed,
    { schedule },
  );
  return { interactor, schedule };
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    if (companies.length) await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.searchCatalogEntry.deleteMany({ where: { companyId: null } });
  });
});

describeDatabase("command search catalog and semantic search on PostgreSQL with pgvector", () => {
  it("indexes static commands and workspace names per tenant without record content, reusing embeddings", async () => {
    const first = await workspace("Hot leads");
    const second = await workspace("Renewals");
    await first.createOrganization("Secret Customer Holdings");
    const firstEmbeddings = fakeEmbeddings();
    expect(await runWithTenant(first.admin, () => indexer(firstEmbeddings.service).indexPending())).toEqual({
      remaining: false,
    });
    await runWithTenant(second.admin, () => indexer(fakeEmbeddings().service).indexPending());

    const catalog = await staticSearchCatalog();
    const stored = await runWithoutTenant(
      () =>
        prisma.$queryRaw<Array<{ companyId: string | null; targetId: string; text: string; embedded: boolean }>>`
        SELECT "companyId", "targetId", "text", "embedding" IS NOT NULL AS "embedded" FROM "SearchCatalogEntry"
        WHERE "buildHash" = ${catalog.buildHash} OR "companyId" = ANY(${[first.companyId, second.companyId]}::text[])`,
    );
    expect(stored.filter((row) => row.companyId === null)).toHaveLength(STATIC_COMMANDS.length * APP_LOCALES.length);
    expect(stored.every((row) => row.embedded)).toBe(true);
    const own = stored.filter((row) => row.companyId === first.companyId);
    expect(own.map((row) => row.targetId)).toEqual(
      expect.arrayContaining([
        `list:${first.id("organization")}`,
        `view:${first.view.id}`,
        `field:${first.id("organization.name")}`,
      ]),
    );
    expect(own.find((row) => row.targetId === `view:${first.view.id}`)?.text).toBe("Hot leads. Organizations");
    expect(stored.some((row) => row.text.includes("Secret Customer"))).toBe(false);

    await runWithoutTenant(() =>
      prisma.dataView.update({ where: { id: first.view.id }, data: { name: "Hot leads this week" } }),
    );
    const reindex = fakeEmbeddings();
    await runWithTenant(first.admin, () => indexer(reindex.service).indexPending());
    expect(reindex.embedTexts).toHaveBeenCalledTimes(1);
    expect(reindex.embedTexts.mock.calls[0]?.[1]).toEqual(["Hot leads this week. Organizations"]);

    const { interactor } = searcher(second.policy);
    const result = await runWithTenant(second.admin, () =>
      interactor.invoke({ searchTerm: "hot leads", scope: null, locale: "en" }),
    );
    if (!result.ok) throw new Error("Expected search result");
    expect(result.data.semantic.map((hit) => hit.key)).not.toContain(`view:${first.view.id}`);
  }, 180000);

  it("finds targets by meaning across languages, scoped by prefix and by what the user may open", async () => {
    const f = await workspace("Hot leads");
    await runWithTenant(f.admin, () => indexer(fakeEmbeddings().service).indexPending());
    const search = async (user: TenantUser, searchTerm: string, scope: "views" | "settings" | null = null) => {
      const { interactor, schedule } = searcher(f.policy);
      const result = await runWithTenant(user, () => interactor.invoke({ searchTerm, scope, locale: "en" }));
      if (!result.ok) throw new Error("Expected search result");
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(result.data.degraded).toBe(false);
      return result.data.semantic.map((hit) => hit.key);
    };

    expect((await search(f.admin, "dunkler Modus"))[0]).toBe("cmd:action.themeDark");
    expect(await search(f.admin, "Sprache ändern", "settings")).toEqual(["cmd:setting.profile.displayLanguage"]);
    expect(await search(f.admin, "heiße Leads", "views")).toEqual([`view:${f.view.id}`]);
    expect(await search(f.admin, "Datenmodell")).toContain("cmd:page.configure");

    expect(await search(f.member, "Datenmodell")).not.toContain("cmd:page.configure");
    const memberKeys = await search(f.member, "Firma");
    expect(memberKeys.some((key) => key.startsWith("list:") || key.startsWith("field:"))).toBe(false);
    expect(await search(f.member, "dunkler Modus")).toContain("cmd:action.themeDark");
  }, 180000);

  it("returns quickly without semantic results when the query embedding is too slow", async () => {
    const f = await workspace("Hot leads");
    const { interactor } = searcher(f.policy, () => new Promise(() => undefined));
    const started = performance.now();
    const result = await runWithTenant(f.admin, () =>
      interactor.invoke({ searchTerm: "dark mode", scope: null, locale: "en" }),
    );
    expect(performance.now() - started).toBeLessThan(COMMAND_SEARCH_EMBEDDING_WAIT_MS + 1500);
    expect(result).toEqual({ ok: true, data: { semantic: [], docs: [], degraded: true } });

    const records = await runWithTenant(f.admin, () =>
      searcher(f.policy, () => Promise.reject(new Error("never called"))).interactor.invoke({
        searchTerm: "acme",
        scope: "records",
        locale: "en",
      }),
    );
    expect(records).toEqual({ ok: true, data: { semantic: [], docs: [], degraded: false } });
  }, 120000);

  it("matches records by exact id, quoted phrase and similarly spelled titles", async () => {
    const f = await workspace("Hot leads");
    const acme = await f.createOrganization("Acme Corporation");
    const globex = await f.createOrganization("Globex");
    const records = new SearchRecordsInteractor(repo, f.policy);
    const titles = async (searchTerm: string) => {
      const result = await runWithTenant(f.admin, () => records.invoke({ searchTerm, limit: 40, cursor: null }));
      if (!result.ok) throw new Error("Expected record search result");
      return result.data.results.map((hit) =>
        hit.title.state === "value" && hit.title.value.kind === "text" ? hit.title.value.value : null,
      );
    };

    expect(await titles(globex.recordId)).toEqual(["Globex"]);
    expect(await titles('"acme corp"')).toEqual(["Acme Corporation"]);
    expect(await titles("Acme Corportion")).toEqual(["Acme Corporation"]);
    expect(await titles('"Acme Corportion"')).toEqual([]);
    expect(await titles("Zyxwv")).toEqual([]);
    expect(acme.recordId).not.toBe(globex.recordId);
  }, 120000);
});
