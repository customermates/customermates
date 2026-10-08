import type { PermissionService } from "@/core/base/permission.service";
import { detectedWikiLanguage, dominantWikiLanguageFromCounts, WIKI_LANGUAGE_SAMPLE_CHARACTERS } from "./wiki-language";
import type { RepoArgs } from "@/core/utils/types";
import type { CreateWikiPagesRepo } from "@/features/wiki/create-wiki-pages.repo";
import type { DeleteWikiPageRepo } from "@/features/wiki/delete-wiki-page.repo";
import type { GetWikiPageRepo } from "@/features/wiki/get-wiki-page.repo";
import type { GetWikiPagesRepo } from "@/features/wiki/get-wiki-pages.repo";
import type { GetWikiCatalogRepo } from "@/features/wiki/get-wiki-catalog.repo";
import type { MoveWikiPageRepo } from "@/features/wiki/move-wiki-page.repo";
import type { UpdateWikiPageRepo } from "@/features/wiki/update-wiki-page.repo";
import type { StartWikiHomepageSetupRepo } from "@/features/wiki/start-wiki-homepage-setup.repo";
import type { WikiPageDto } from "./wiki.schema";
import type { WikiImportPageRepo, WikiImportProvenance } from "./wiki-import-page.repo";
import type { GetWikiSuggestionSignalRepo } from "./get-wiki-suggestion-signal.repo";

import { Prisma, Resource } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";
import { WIKI_CATALOG_PAGE_SIZE, wikiPageKindFields, wikiPageKindIssue } from "./wiki.schema";
import { promptWikiSummary } from "./wiki-summary";

type WikiCatalogSummaryFields = {
  summary: string | null;
  summaryContentHash: string | null;
  sourceImportedUpdatedAt: Date | null;
};

export class PrismaWikiPageRepo
  extends TenantRepository
  implements
    GetWikiPagesRepo,
    GetWikiCatalogRepo,
    GetWikiPageRepo,
    CreateWikiPagesRepo,
    UpdateWikiPageRepo,
    MoveWikiPageRepo,
    DeleteWikiPageRepo,
    StartWikiHomepageSetupRepo,
    WikiImportPageRepo,
    GetWikiSuggestionSignalRepo
{
  constructor(
    private readonly permissions: PermissionService,
    private readonly scopedCompanyId?: string,
  ) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  async guidesBlockingRestore(ids: string[]) {
    if (!(await this.guideExists())) return [];
    const guides = await this.prisma.wikiPage.findMany({
      where: { id: { in: ids }, companyId: this.companyId, kind: "guide", deletedAt: { not: null } },
      select: { id: true },
    });
    return guides.map((guide) => guide.id);
  }

  async restoreTrashed(ids: string[]) {
    const rows = await this.prisma.wikiPage.findMany({
      where: { id: { in: ids }, companyId: this.companyId, deletedAt: { not: null } },
      select: { id: true },
    });
    const restored = rows.map((row) => row.id);
    await this.prisma.wikiPage.updateMany({
      where: { id: { in: restored }, companyId: this.companyId },
      data: { deletedAt: null },
    });
    return restored;
  }

  async purgeTrashed(ids: string[]) {
    await this.prisma.wikiPage.deleteMany({
      where: { id: { in: ids }, companyId: this.companyId, deletedAt: { not: null } },
    });
  }

  async findSuggestionWikiPage(): Promise<{ id: string } | null> {
    return this.prisma.wikiPage.findFirst({
      where: this.permissions.canRead(Resource.wiki)
        ? { companyId: this.companyId, deletedAt: null }
        : { companyId: this.companyId, id: { in: [] } },
      select: { id: true },
    });
  }

  private get pageSelect() {
    return {
      id: true,
      title: true,
      markdown: true,
      kind: true,
      whenToUse: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private get catalogSelect() {
    return {
      ...this.pageSelect,
      summary: true,
      summaryContentHash: true,
      sourceImportedUpdatedAt: true,
    } as const;
  }

  private catalogPage<Page extends WikiPageDto & WikiCatalogSummaryFields>({
    summary,
    summaryContentHash,
    sourceImportedUpdatedAt,
    ...page
  }: Page) {
    return {
      ...page,
      summary: promptWikiSummary({
        ...page,
        summary,
        summaryContentHash,
        sourceImportedUpdatedAt,
      }),
    };
  }

  private get summarySelect() {
    return {
      id: true,
      title: true,
      kind: true,
      whenToUse: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private async guideExists(exceptId?: string) {
    return (
      (await this.prisma.wikiPage.count({
        where: {
          companyId: this.companyId,
          kind: "guide",
          deletedAt: null,
          ...(exceptId ? { id: { not: exceptId } } : {}),
        },
      })) > 0
    );
  }

  async listPages({ page, pageSize, kind }: RepoArgs<GetWikiPagesRepo, "listPages">) {
    const where = { companyId: this.companyId, deletedAt: null, ...(kind ? { kind } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.wikiPage.findMany({
        where,
        select: this.summarySelect,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.wikiPage.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async movePage({ id, targetId, placement }: RepoArgs<MoveWikiPageRepo, "movePage">) {
    return this.withCompanyTransaction(this.companyId, async () => {
      const pages = await this.prisma.wikiPage.findMany({
        where: { companyId: this.companyId, deletedAt: null },
        select: { id: true, kind: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });
      const source = pages.find((page) => page.id === id);
      const target = pages.find((page) => page.id === targetId);
      if (!source || !target) return "not-found" as const;
      if (source.kind === "guide" || target.kind === "guide") return "pinned" as const;
      if (id === targetId) return "moved" as const;
      const ids = pages.filter((page) => page.kind !== "guide" && page.id !== id).map((page) => page.id);
      ids.splice(ids.indexOf(targetId) + (placement === "after" ? 1 : 0), 0, id);
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "WikiPage" p SET "sortOrder" = ordered.position::integer
        FROM unnest(ARRAY[${Prisma.join(ids)}]::text[]) WITH ORDINALITY AS ordered(id, position)
        WHERE p."id" = ordered.id AND p."companyId" = ${this.companyId} AND p."kind" <> 'guide'
      `);
      return "moved" as const;
    });
  }

  async loadOperatingPages(procedureLimit: number) {
    const procedureWhere = {
      companyId: this.companyId,
      kind: "procedure" as const,
      deletedAt: null,
    };
    const [guide, procedures, proceduresTotal] = await Promise.all([
      this.prisma.wikiPage.findFirst({
        where: { companyId: this.companyId, kind: "guide", deletedAt: null },
        select: this.pageSelect,
      }),
      this.prisma.wikiPage.findMany({
        where: procedureWhere,
        select: this.catalogSelect,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        take: procedureLimit,
      }),
      this.prisma.wikiPage.count({ where: procedureWhere }),
    ]);
    return {
      guide,
      procedures: procedures.map((page) => this.catalogPage(page)),
      proceduresTotal,
    };
  }

  async listCatalogPages({ page }: RepoArgs<GetWikiCatalogRepo, "listCatalogPages">) {
    const where = { companyId: this.companyId, kind: "knowledge" as const, deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.wikiPage.findMany({
        where,
        select: this.catalogSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * WIKI_CATALOG_PAGE_SIZE,
        take: WIKI_CATALOG_PAGE_SIZE,
      }),
      this.prisma.wikiPage.count({ where }),
    ]);
    return { items: items.map((item) => this.catalogPage(item)), total };
  }

  async getPage(id: string) {
    return this.prisma.wikiPage.findFirst({
      where: { id, companyId: this.companyId, deletedAt: null },
      select: this.pageSelect,
    });
  }

  async dominantWikiLanguage() {
    const counts = new Map<string, number>();
    let after = "";
    while (true) {
      const pages = await this.prisma.$queryRaw<Array<{ id: string; sample: string }>>(Prisma.sql`
        SELECT "id", left("markdown", ${WIKI_LANGUAGE_SAMPLE_CHARACTERS}) AS "sample"
        FROM "WikiPage"
        WHERE "companyId" = ${this.companyId} AND "deletedAt" IS NULL AND "id" > ${after}
        ORDER BY "id" ASC LIMIT 100
      `);
      for (const page of pages) {
        const language = detectedWikiLanguage(page.sample);
        if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
      }
      if (pages.length < 100) break;
      after = pages[pages.length - 1].id;
    }
    return dominantWikiLanguageFromCounts(counts);
  }

  async wikiIsEmpty() {
    return (
      (await this.prisma.wikiPage.count({
        where: { companyId: this.companyId, deletedAt: null },
      })) === 0
    );
  }

  async createPages(data: RepoArgs<CreateWikiPagesRepo, "createPages">) {
    if (
      data.requireEmpty &&
      (await this.prisma.wikiPage.count({
        where: { companyId: this.companyId, deletedAt: null },
      })) > 0
    )
      return { status: "wiki-not-empty" as const };

    const guides = data.pages.filter((page) => page.kind === "guide").length;
    if (guides > 1 || (guides === 1 && (await this.guideExists()))) return { status: "guide-exists" as const };

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
            kind: wikiPageKindFields(page).kind,
            whenToUse: wikiPageKindFields(page).whenToUse,
            sortOrder: page.kind === "guide" ? -1 : undefined,
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
    const kind = data.kind ?? previous.kind;
    const whenToUse = kind === "procedure" ? (data.whenToUse ?? previous.whenToUse) : null;
    if (
      title === previous.title &&
      markdown === previous.markdown &&
      kind === previous.kind &&
      whenToUse === previous.whenToUse
    )
      return { status: "unchanged" as const, previous, page: previous };
    const invalid = wikiPageKindIssue({ kind, whenToUse, markdown });
    if (invalid) return { status: "invalid" as const, error: invalid };
    if (kind === "guide" && previous.kind !== "guide" && (await this.guideExists(previous.id)))
      return { status: "guide-exists" as const };

    const updated = await this.prisma.wikiPage.updateMany({
      where: {
        id: data.id,
        companyId: this.companyId,
        deletedAt: null,
        updatedAt: data.expectedUpdatedAt,
      },
      data: {
        title,
        markdown,
        kind,
        whenToUse,
        ...(kind !== previous.kind ? { sortOrder: kind === "guide" ? -1 : 2147483647 } : {}),
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

    const deleted = await this.prisma.wikiPage.updateMany({
      where: {
        id: data.id,
        companyId: this.companyId,
        deletedAt: null,
        updatedAt: data.expectedUpdatedAt,
      },
      data: { deletedAt: new Date() },
    });
    if (deleted.count !== 1) {
      const current = await this.getPage(data.id);
      return {
        status: current ? ("conflict" as const) : ("not-found" as const),
      };
    }
    return { status: "deleted" as const, page };
  }

  async listRefreshTargets(): Promise<Array<{ url: string; category: "help" }>> {
    const rows = await this.prisma.wikiPage.findMany({
      where: { companyId: this.companyId, sourceUrl: { not: null }, deletedAt: null },
      distinct: ["sourceUrl"],
      orderBy: [{ sourceUrl: "asc" }],
      select: { sourceUrl: true },
    });
    return rows.flatMap(({ sourceUrl }) => (sourceUrl ? [{ url: sourceUrl, category: "help" as const }] : []));
  }

  async countImportedPages(since: Date) {
    return this.prisma.wikiPage.count({
      where: {
        companyId: this.companyId,
        sourceUrl: { not: null },
        sourceFetchedAt: { gte: since },
      },
    });
  }

  async findImportedPage(sourceUrl: string) {
    return this.prisma.wikiPage.findFirst({
      where: { companyId: this.companyId, sourceUrl },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        updatedAt: true,
        sourceFetchedAt: true,
        sourceContentHash: true,
        sourceImportedUpdatedAt: true,
      },
    });
  }

  async listPageTitles() {
    const pages = await this.prisma.wikiPage.findMany({
      where: { companyId: this.companyId, deletedAt: null },
      select: { title: true },
    });
    return pages.map(({ title }) => title);
  }

  async markImported(pageId: string, source: WikiImportProvenance) {
    const { count } = await this.prisma.wikiPage.updateMany({
      where: {
        id: pageId,
        companyId: this.companyId,
        deletedAt: null,
        updatedAt: source.importedUpdatedAt,
      },
      data: {
        sourceUrl: source.url,
        sourceFetchedAt: source.fetchedAt,
        sourceContentHash: source.contentHash,
        sourceImportedUpdatedAt: source.importedUpdatedAt,
        updatedAt: source.importedUpdatedAt,
      },
    });
    return count === 1;
  }
}
