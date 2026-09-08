import type { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import type { RepoArgs } from "@/core/utils/types";

import type { CreateWikiPagesRepo } from "./create-wiki-pages.interactor";
import type { DeleteWikiPageRepo } from "./delete-wiki-page.interactor";
import type { GetWikiPageRepo } from "./get-wiki-page.interactor";
import type { GetWikiPagesRepo } from "./get-wiki-pages.interactor";
import type { SearchWikiPagesRepo } from "./search-wiki-pages.interactor";
import type { UpdateWikiPageRepo } from "./update-wiki-page.interactor";
import type { StartWikiHomepageSetupRepo } from "./start-wiki-homepage-setup.interactor";
import type { WikiPageDto, WikiPageSearchData } from "./wiki.schema";

export class PrismaWikiPageRepo
  extends BaseRepository<Prisma.WikiPageWhereInput>
  implements
    GetWikiPagesRepo,
    SearchWikiPagesRepo,
    GetWikiPageRepo,
    CreateWikiPagesRepo,
    UpdateWikiPageRepo,
    DeleteWikiPageRepo,
    StartWikiHomepageSetupRepo
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
    const where: Prisma.WikiPageWhereInput = {
      companyId: this.companyId,
      OR: [{ title: { contains: query, mode: "insensitive" } }, { markdown: { contains: query, mode: "insensitive" } }],
    };
    const [rows, total] = await Promise.all([
      this.prisma.wikiPage.findMany({
        where,
        select: this.pageSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.wikiPage.count({ where }),
    ]);
    return {
      items: rows.map(({ markdown, ...page }) => ({
        ...page,
        snippet: this.searchSnippet(markdown, data),
      })),
      total,
      page,
      pageSize,
    };
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

  async findReusableSetupRequestClientId(data: { clientRequestId: string; prompt: string }): Promise<string | null> {
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
    if (exact) return exact.clientRequestId;

    const recoverable = await this.prisma.agentTurnRequest.findFirst({
      where: {
        ...setupWhere,
        status: { in: ["running", "failed", "uncertain"] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { clientRequestId: true },
    });
    return recoverable?.clientRequestId ?? null;
  }

  async createPages(data: RepoArgs<CreateWikiPagesRepo, "createPages">) {
    if (
      data.requireEmpty &&
      (await this.prisma.wikiPage.count({
        where: { companyId: this.companyId },
      })) > 0
    )
      return null;

    const pages: WikiPageDto[] = [];
    const createdAt = Date.now();
    for (const [index, page] of data.pages.entries()) {
      pages.push(
        await this.prisma.wikiPage.create({
          data: {
            companyId: this.companyId,
            title: page.title.trim(),
            markdown: page.markdown,
            createdAt: new Date(createdAt + index),
          },
          select: this.pageSelect,
        }),
      );
    }
    return pages;
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
        // PostgreSQL stores this field at millisecond precision. Keep the
        // concurrency token monotonic even for two very fast explicit saves.
        updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)),
      },
    });
    if (updated.count !== 1) {
      const current = await this.getPage(data.id);
      return { status: current ? ("conflict" as const) : ("not-found" as const) };
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
      return { status: current ? ("conflict" as const) : ("not-found" as const) };
    }
    return { status: "deleted" as const, page };
  }

  private searchSnippet(markdown: string, data: WikiPageSearchData): string {
    const compact = markdown.replaceAll(/\s+/g, " ").trim();
    const match = compact.toLocaleLowerCase().indexOf(data.query.toLocaleLowerCase());
    const start = match < 0 ? 0 : Math.max(0, match - 80);
    const prefix = start > 0 ? "…" : "";
    const suffix = start + 240 < compact.length ? "…" : "";
    return `${prefix}${compact.slice(start, start + 240)}${suffix}`;
  }
}
