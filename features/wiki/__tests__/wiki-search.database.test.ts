import { PermissionService } from "@/core/base/permission.service";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { decode } from "@toon-format/toon";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { ForbiddenError } from "@/core/errors/app-errors";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(createTranslator({ locale: "en", messages })),
}));

import { MCP_ALWAYS_ON_TOOLS } from "@/features/mcp-tools/tool-registry";
import { fetchTool, searchTool } from "@/features/mcp-tools/deep-research.mcp-tools";
import { mcpToolResultText } from "@/features/mcp-tools/mcp-tool";
import { manageWikiPagesTool } from "@/features/mcp-tools/wiki.mcp-tools";

import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { SearchWikiPagesInteractor } from "../search-wiki-pages.interactor";
import { WikiMarkdownSchema } from "../wiki.schema";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("Workspace Wiki search on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const user: TenantUser = createMockUser({ id: randomUUID(), companyId });
  const foreignUser: TenantUser = createMockUser({ id: randomUUID(), companyId: foreignCompanyId });

  const insert = async (tenant: TenantUser, pages: Array<{ title: string; markdown: string }>) => {
    const ids: string[] = [];
    for (const [index, page] of pages.entries()) {
      const id = randomUUID();
      ids.push(id);
      await client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
        [
          id,
          tenant.companyId,
          page.title,
          WikiMarkdownSchema.parse(page.markdown),
          new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        ],
      );
    }
    return ids;
  };
  const search = (query: string, tenant = user, page = 1) =>
    runWithTenant(tenant, () =>
      new SearchWikiPagesInteractor(new PrismaWikiPageRepo(new PermissionService()), "stored").invoke({
        query,
        page,
        pageSize: 5,
      }),
    );
  const titles = async (query: string) => {
    const result = await search(query);
    if (!result.ok) throw new Error(`Search failed for ${query}`);
    return result.data.items.map((item) => item.title);
  };

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
  });

  beforeEach(async () => {
    vi.unstubAllEnvs();
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("exposes the same search and fetch tools that MCP clients call", () => {
    expect(MCP_ALWAYS_ON_TOOLS.map((tool) => tool.name)).toEqual([searchTool.name, fetchTool.name]);
  });

  it("keeps the stored search document in sync with title and Markdown edits", async () => {
    const [id] = await insert(user, [
      { title: "Returns", markdown: "## Rückerstattungen\n\nWe refund within 5 days." },
    ]);
    const read = () =>
      client.query(
        `SELECT "searchVector" @@ plainto_tsquery('german', 'Rückerstattung') AS "german",
          "searchVector" @@ plainto_tsquery('english', 'refunded') AS "english"
         FROM "WikiPage" WHERE "id" = $1`,
        [id],
      );
    expect((await read()).rows).toEqual([{ german: true, english: true }]);

    await client.query('UPDATE "WikiPage" SET "title" = $1, "markdown" = $2 WHERE "id" = $3', [
      "Shipping",
      "Parcels leave the warehouse daily.",
      id,
    ]);
    expect((await read()).rows).toEqual([{ german: false, english: false }]);
  });

  it("ranks by built-in full-text coverage and finds inflections, phrases and prefixes", async () => {
    const [refund, legacy, travel, approvals] = await insert(user, [
      {
        title: "Refund policy",
        markdown: `${"Customers ask for money back. ".repeat(30)}\n\n## Approval\n\nThe finance lead approves refunds.`,
      },
      { title: "Refund policy (legacy)", markdown: "Old refund rules." },
      { title: "Travel expense policy", markdown: "Book trains early." },
      { title: "Approvals", markdown: "Managers approve discounts." },
    ]);
    await insert(foreignUser, [
      { title: "Refund policy", markdown: "Foreign refunds are approved by the foreign lead." },
    ]);

    const hits = async (query: string) => {
      const result = await search(query);
      if (!result.ok) throw new Error("Wiki search failed.");
      return result.data.items;
    };
    const ids = async (query: string) => (await hits(query)).map((item) => item.id);
    expect((await ids("refund policy"))[0]).toBe(refund);
    const approvesRefunds = await ids("who approves refunds");
    expect(approvesRefunds[0]).toBe(refund);
    expect(new Set(approvesRefunds.slice(1))).toEqual(new Set([approvals, legacy]));
    expect((await hits("who approves refunds"))[0]).toMatchObject({ section: "Approval" });
    expect(await ids('"expense policy"')).toEqual([travel]);
    expect(await ids("policy")).toHaveLength(3);
    expect(await ids("polic")).toHaveLength(3);
    expect(await ids("blockchain")).toEqual([]);
    expect(JSON.stringify(await search("refund policy"))).not.toContain("Foreign");
  });

  it("reports how much of the query's weight the best full-text match covers", async () => {
    await insert(user, [
      { title: "Refund policy", markdown: "The finance lead approves refunds." },
      { title: "Travel expense policy", markdown: "Book trains early." },
    ]);
    const coverage = async (query: string) =>
      (
        await runWithTenant(user, () =>
          new PrismaWikiPageRepo(new PermissionService()).fullTextPageCandidates(query, 10),
        )
      ).coverage;

    expect(await coverage("finance lead refunds")).toBeCloseTo(1, 6);
    const partial = await coverage("finance lead parking garage");
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(0.6);
    expect(await coverage("blockchain")).toBe(0);
  });

  it("returns the matched section offset valid for manage_wiki_pages get and for MCP fetch", async () => {
    const linkedId = randomUUID();
    const [pageId] = await insert(user, [
      {
        title: "Refund handbook",
        markdown: [
          `Start with [Support](/wiki?page=${linkedId}) and [Billing](/wiki?page=${linkedId}).`,
          "## Timelines",
          "Refunds are paid within 5 business days. ".repeat(160),
          "## Approval matrix",
          "Refunds above 500 EUR require approval from the finance lead.",
        ].join("\n\n"),
      },
    ]);

    const result = await search("who approves refunds above 500 EUR");
    if (!result.ok) throw new Error("Wiki search failed.");
    const [hit] = result.data.items;
    expect(hit).toMatchObject({ id: pageId, section: "Approval matrix", anchor: "approval-matrix" });
    expect(hit.snippet).toContain("**approval**");

    const got = await runWithTenant(user, () =>
      manageWikiPagesTool.execute(
        manageWikiPagesTool.inputSchema.parse({ action: "get", id: pageId, offset: hit.offset }),
      ),
    );
    expect((decode(mcpToolResultText(got)) as { markdownChunk: string }).markdownChunk).toMatch(
      /^## Approval matrix\n/,
    );

    const searched = await runWithTenant(user, () =>
      searchTool.execute({ query: "who approves refunds above 500 EUR" }),
    );
    const external = (
      searched.structuredContent.results as Array<{ id: string; offset?: number; section?: string }>
    )[0];
    expect(external).toMatchObject({ id: `wiki:${pageId}`, section: "Approval matrix" });
    expect(external.offset).toBeGreaterThan(hit.offset ?? 0);
    const fetched = await runWithTenant(user, () => fetchTool.execute({ id: external.id, offset: external.offset }));
    if (!("structuredContent" in fetched)) throw new Error("Expected Wiki content.");
    expect(fetched.structuredContent.text).toMatch(/^## Approval matrix\n/);

    const opened = await runWithTenant(user, () => fetchTool.execute({ id: external.id, offset: 0 }));
    if (!("structuredContent" in opened)) throw new Error("Expected Wiki content.");
    expect((opened.structuredContent as { outline?: unknown }).outline).toEqual([
      { level: 2, heading: "Timelines", offset: expect.any(Number) },
      { level: 2, heading: "Approval matrix", offset: external.offset },
    ]);
  });

  it("corrects a misspelled word from the caller's own Wiki words with pg_trgm and returns the corrected query", async () => {
    const [escalation, travel] = await insert(user, [
      { title: "Support escalation process", markdown: "The on-call engineer is paged through PagerDuty." },
      {
        title: "Travel",
        markdown: "## Mileage\n\nReimbursements follow the statutory guidelines: 0.30 EUR per kilometre.",
      },
      { title: "Refund policy", markdown: "Refunds within 30 days." },
    ]);
    await insert(foreignUser, [{ title: "Pagerdutty foreign runbook", markdown: "Foreign quokka cluster." }]);

    const pagerDuty = await search("PagerDutty");
    expect(pagerDuty).toMatchObject({
      ok: true,
      data: { didYouMean: ["pagerduty"], items: [{ id: escalation }] },
    });
    expect(JSON.stringify(pagerDuty)).not.toContain("foreign");
    expect(await search("milage reimbursemnets")).toMatchObject({
      ok: true,
      data: { didYouMean: ["mileage reimbursements"], items: [{ id: travel, section: "Mileage" }] },
    });
    expect(await search("refnud policy")).toMatchObject({
      ok: true,
      data: { didYouMean: ["refund policy"], items: [{ title: "Refund policy" }] },
    });
    expect(await search("guidlines")).toMatchObject({ ok: true, data: { didYouMean: ["guidelines"] } });

    for (const query of ["quokka", "xylophone", "escalation", "where is the escalation"]) {
      const result = await search(query);
      expect(JSON.stringify(result), query).not.toContain("didYouMean");
    }
    expect(await search("quokka")).toMatchObject({ ok: true, data: { total: 0, items: [] } });
  });

  it("finds CJK substrings, reports totals beyond the last page, and never interprets query syntax", async () => {
    await insert(user, [
      { title: "客户支持手册", markdown: "## 退款\n\n退款申请需要在30天内提交。" },
      { title: "Voice", markdown: "Speak clearly." },
      { title: "Support", markdown: "Answer questions." },
    ]);
    await insert(foreignUser, [{ title: "其他租户", markdown: "退款申请由其他租户处理。" }]);

    const cjk = await search("退款申请");
    expect(cjk).toMatchObject({ ok: true, data: { total: 1, items: [{ title: "客户支持手册", section: "退款" }] } });
    expect(JSON.stringify(cjk)).not.toContain("其他租户");
    expect(await search("voice support", user, 2)).toMatchObject({ ok: true, data: { total: 2, items: [] } });
    for (const query of ["_%!:&|", '\'; DROP TABLE "WikiPage";--', "voice:* & !support | (a <-> b)", "\\\\ '' \"\""])
      expect(await search(query)).toMatchObject({ ok: true });
    expect(await titles("voice:* & !support")).toEqual(expect.arrayContaining(["Voice", "Support"]));
  });

  it("requires Wiki Read before running any search SQL", async () => {
    await insert(user, [{ title: "Secret", markdown: "Hidden guidance." }]);
    const noWiki = { ...createMockUserWithPermissions([]), companyId };
    await expect(search("secret", noWiki)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
