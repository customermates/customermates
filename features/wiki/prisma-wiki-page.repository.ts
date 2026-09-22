import { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import type { RepoArgs } from "@/core/utils/types";
import { AGENT_RUN_LEASE_MS } from "@/ee/agent-chat/agent-turn-request";

import type { CreateWikiPagesRepo } from "./create-wiki-pages.interactor";
import type { DeleteWikiPageRepo } from "./delete-wiki-page.interactor";
import type { GetWikiPageRepo } from "./get-wiki-page.interactor";
import type { GetWikiPagesRepo } from "./get-wiki-pages.interactor";
import type { GetWikiCatalogRepo } from "./get-wiki-catalog.interactor";
import type { SearchWikiPagesRepo } from "./search-wiki-pages.interactor";
import type { UpdateWikiPageRepo } from "./update-wiki-page.interactor";
import type { StartWikiHomepageSetupRepo } from "./start-wiki-homepage-setup.interactor";
import type { GetWikiHomepageSetupStateRepo } from "./get-wiki-homepage-setup-state.interactor";
import type { WikiPageDto } from "./wiki.schema";
import { WIKI_CATALOG_PAGE_SIZE, WIKI_CATALOG_RELEVANT_PAGE_LIMIT } from "./wiki.schema";
import { wikiRelevantSearchTerms, wikiSearchSnippet, wikiSearchTerms, wikiSubstringSearchTerms } from "./wiki-content";

export class PrismaWikiPageRepo
  extends BaseRepository<Prisma.WikiPageWhereInput>
  implements
    GetWikiPagesRepo,
    GetWikiCatalogRepo,
    SearchWikiPagesRepo,
    GetWikiPageRepo,
    CreateWikiPagesRepo,
    UpdateWikiPageRepo,
    DeleteWikiPageRepo,
    StartWikiHomepageSetupRepo,
    GetWikiHomepageSetupStateRepo
{
  private get pageSelect() {
    return {
      id: true,
      title: true,
      markdown: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private get summarySelect() {
    return {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  async listPages({ page, pageSize }: RepoArgs<GetWikiPagesRepo, "listPages">) {
    const where = { companyId: this.companyId };
    const [items, total] = await Promise.all([
      this.prisma.wikiPage.findMany({
        where,
        select: this.summarySelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.wikiPage.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async searchPages(data: RepoArgs<SearchWikiPagesRepo, "searchPages">) {
    const { page, pageSize, query } = data;
    const terms = wikiSearchTerms(query);
    if (terms.length === 0) return { items: [], total: 0, page, pageSize };
    const { predicate, rank } = this.wikiSearchSql(terms);
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<WikiPageDto[]>(Prisma.sql`
        SELECT "id", "title", "markdown", "createdAt", "updatedAt"
        FROM "WikiPage"
        WHERE ${predicate}
        ORDER BY ${rank} DESC, "createdAt" ASC, "id" ASC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `),
      this.prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS "total" FROM "WikiPage" WHERE ${predicate}
      `),
    ]);
    return {
      items: rows.map(({ markdown, ...page }) => ({
        ...page,
        snippet: wikiSearchSnippet(markdown, data.query),
      })),
      total: counts[0]?.total ?? 0,
      page,
      pageSize,
    };
  }

  async listCatalogPages({ page }: RepoArgs<GetWikiCatalogRepo, "listCatalogPages">) {
    const where = { companyId: this.companyId };
    const [items, total] = await Promise.all([
      this.prisma.wikiPage.findMany({
        where,
        select: this.pageSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * WIKI_CATALOG_PAGE_SIZE,
        take: WIKI_CATALOG_PAGE_SIZE,
      }),
      this.prisma.wikiPage.count({ where }),
    ]);
    return { items, total };
  }

  async findRelevantCatalogPages({ query }: RepoArgs<GetWikiCatalogRepo, "findRelevantCatalogPages">) {
    const terms = wikiRelevantSearchTerms(query);
    if (terms.length === 0) return [];
    const { predicate, rank } = this.wikiSearchSql(terms);
    return this.prisma.$queryRaw<WikiPageDto[]>(Prisma.sql`
      SELECT "id", "title", "markdown", "createdAt", "updatedAt"
      FROM "WikiPage"
      WHERE ${predicate}
      ORDER BY ${rank} DESC, "createdAt" ASC, "id" ASC
      LIMIT ${WIKI_CATALOG_RELEVANT_PAGE_LIMIT}
    `);
  }

  async getPage(id: string) {
    return this.prisma.wikiPage.findFirst({
      where: { id, companyId: this.companyId },
      select: this.pageSelect,
    });
  }

  async wikiIsEmpty() {
    return (
      (await this.prisma.wikiPage.count({
        where: { companyId: this.companyId },
      })) === 0
    );
  }

  async getHomepageSetupProjection() {
    const setup = await this.prisma.agentTurnRequest.findFirst({
      where: {
        companyId: this.companyId,
        wikiHomepageSetupDomain: { not: null },
        wikiHomepageSetupUrl: { not: null },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        status: true,
        terminalCode: true,
        wikiHomepageSetupUrl: true,
        wikiHomepageSetupDomain: true,
        conversationId: true,
        userId: true,
        affectedResources: true,
        heartbeatAt: true,
        updatedAt: true,
      },
    });
    const pages = await this.prisma.wikiPage.findMany({
      where: { companyId: this.companyId },
      select: this.summarySelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 5,
    });
    return {
      setup: setup
        ? {
            status: setup.status,
            terminalCode: setup.terminalCode,
            homepage: setup.wikiHomepageSetupUrl as string,
            domain: setup.wikiHomepageSetupDomain as string,
            conversationId: setup.userId === this.user.id ? setup.conversationId : null,
            affectedResources: setup.affectedResources,
            activityAt: setup.heartbeatAt ?? setup.updatedAt,
          }
        : null,
      pages,
    };
  }

  async findReusableSetupRequest(data: { clientRequestId: string; prompt: string }) {
    const setupWhere = {
      companyId: this.companyId,
      userId: this.user.id,
      wikiHomepageSetupDomain: { not: null },
      text: data.prompt,
    } as const;
    const exact = await this.prisma.agentTurnRequest.findFirst({
      where: { ...setupWhere, clientRequestId: data.clientRequestId },
      select: { clientRequestId: true },
    });
    if (exact) {
      return {
        disposition: "reuse" as const,
        clientRequestId: exact.clientRequestId,
      };
    }

    const activeAfter = new Date(Date.now() - AGENT_RUN_LEASE_MS);
    const active = await this.prisma.agentTurnRequest.findFirst({
      where: {
        companyId: this.companyId,
        wikiHomepageSetupDomain: { not: null },
        status: {
          in: ["running", "waitingBudget"],
        },
        OR: [{ heartbeatAt: { gt: activeAfter } }, { heartbeatAt: null, updatedAt: { gt: activeAfter } }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { clientRequestId: true, text: true, userId: true },
    });
    if (!active) return null;
    return active.userId === this.user.id && active.text === data.prompt
      ? {
          disposition: "reuse" as const,
          clientRequestId: active.clientRequestId,
        }
      : { disposition: "blocked" as const };
  }

  async createPages(data: RepoArgs<CreateWikiPagesRepo, "createPages">) {
    if (
      data.requireEmpty &&
      (await this.prisma.wikiPage.count({
        where: { companyId: this.companyId },
      })) > 0
    )
      return { status: "wiki-not-empty" as const };

    const pages: WikiPageDto[] = [];
    const createdAt = Date.now();
    for (const [index, page] of data.pages.entries()) {
      pages.push(
        await this.prisma.wikiPage.create({
          data: {
            id: page.id,
            companyId: this.companyId,
            title: page.title,
            markdown: page.markdown,
            createdAt: new Date(createdAt + index),
          },
          select: this.pageSelect,
        }),
      );
    }
    return { status: "created" as const, pages };
  }

  async updatePage(data: RepoArgs<UpdateWikiPageRepo, "updatePage">) {
    const previous = await this.getPage(data.id);
    if (!previous) return { status: "not-found" as const };
    if (previous.updatedAt.getTime() !== data.expectedUpdatedAt.getTime()) return { status: "conflict" as const };

    const title = data.title?.trim() ?? previous.title;
    const markdown = data.markdown ?? previous.markdown;
    if (title === previous.title && markdown === previous.markdown)
      return { status: "unchanged" as const, previous, page: previous };

    const updated = await this.prisma.wikiPage.updateMany({
      where: {
        id: data.id,
        companyId: this.companyId,
        updatedAt: data.expectedUpdatedAt,
      },
      data: {
        title,
        markdown,
        updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)),
      },
    });
    if (updated.count !== 1) {
      const current = await this.getPage(data.id);
      return {
        status: current ? ("conflict" as const) : ("not-found" as const),
      };
    }

    const page = await this.getPage(data.id);
    if (!page) return { status: "not-found" as const };
    return { status: "updated" as const, previous, page };
  }

  async deletePage(data: RepoArgs<DeleteWikiPageRepo, "deletePage">) {
    const page = await this.getPage(data.id);
    if (!page) return { status: "not-found" as const };
    if (page.updatedAt.getTime() !== data.expectedUpdatedAt.getTime()) return { status: "conflict" as const };

    const deleted = await this.prisma.wikiPage.deleteMany({
      where: {
        id: data.id,
        companyId: this.companyId,
        updatedAt: data.expectedUpdatedAt,
      },
    });
    if (deleted.count !== 1) {
      const current = await this.getPage(data.id);
      return {
        status: current ? ("conflict" as const) : ("not-found" as const),
      };
    }
    return { status: "deleted" as const, page };
  }

  private wikiSearchSql(terms: string[]) {
    const searchQuery = terms.map((term) => `${term}:*`).join(" | ");
    const document = Prisma.sql`setweight(to_tsvector('simple', "title"), 'A') || setweight(to_tsvector('simple', "markdown"), 'B')`;
    const fullTextPredicate = Prisma.sql`(${document}) @@ to_tsquery('simple', ${searchQuery})`;
    const substringTerms = wikiSubstringSearchTerms(terms);
    const substringPredicates = substringTerms.map(
      (term) => Prisma.sql`(strpos(lower("title"), ${term}) > 0 OR strpos(lower("markdown"), ${term}) > 0)`,
    );
    const substringRanks = substringTerms.map(
      (term) => Prisma.sql`
        (CASE WHEN strpos(lower("title"), ${term}) > 0 THEN 2 ELSE 0 END) +
        (CASE WHEN strpos(lower("markdown"), ${term}) > 0 THEN 1 ELSE 0 END)
      `,
    );
    const contentPredicate =
      substringPredicates.length > 0
        ? Prisma.sql`(${fullTextPredicate} OR ${Prisma.join(substringPredicates, " OR ")})`
        : fullTextPredicate;
    const rank =
      substringRanks.length > 0
        ? Prisma.sql`ts_rank_cd((${document}), to_tsquery('simple', ${searchQuery})) + (${Prisma.join(substringRanks, " + ")})`
        : Prisma.sql`ts_rank_cd((${document}), to_tsquery('simple', ${searchQuery}))`;
    const predicate = Prisma.sql`"companyId" = ${this.companyId} AND ${contentPredicate}`;
    return { searchQuery, document, predicate, rank };
  }
}
