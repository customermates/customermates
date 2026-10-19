import type { RepoArgs } from "@/core/utils/types";
import type { ProposeWikiPageChangesRepo } from "./propose-wiki-page-changes.repo";
import type { GetWikiPageProposalsRepo } from "./get-wiki-page-proposals.repo";
import type { ReviewWikiPageProposalRepo } from "./review-wiki-page-proposal.repo";
import type { PurgeWikiPageProposalsRepo } from "./purge-wiki-page-proposals.repo";
import type { WikiPageDto } from "./wiki.schema";
import type { WikiPageProposalDto } from "./wiki-page-proposal.schema";

import { WikiPageProposalStatus, type Prisma } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";

import { wikiPageKindFields, wikiPageKindIssue } from "./wiki.schema";

const PROPOSAL_SELECT = {
  id: true,
  action: true,
  status: true,
  pageId: true,
  title: true,
  markdown: true,
  kind: true,
  whenToUse: true,
  baseUpdatedAt: true,
  routineId: true,
  routineRunId: true,
  conversationId: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  routine: { select: { name: true } },
} as const satisfies Prisma.WikiPageProposalSelect;

const PAGE_SELECT = {
  id: true,
  title: true,
  markdown: true,
  kind: true,
  whenToUse: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.WikiPageSelect;

type ProposalRow = Prisma.WikiPageProposalGetPayload<{ select: typeof PROPOSAL_SELECT }>;

type ProposalDraft = Pick<
  Prisma.WikiPageProposalUncheckedCreateInput,
  "action" | "pageId" | "title" | "markdown" | "kind" | "whenToUse" | "baseUpdatedAt"
>;

function proposalDto({ routine, ...row }: ProposalRow): WikiPageProposalDto {
  return { ...row, routineName: routine?.name ?? null };
}

function isStale(proposal: WikiPageProposalDto, page: WikiPageDto | null) {
  if (proposal.action === "create") return false;
  return !page || !proposal.baseUpdatedAt || page.updatedAt.getTime() !== proposal.baseUpdatedAt.getTime();
}

export class PrismaWikiPageProposalRepo
  extends TenantRepository
  implements
    ProposeWikiPageChangesRepo,
    GetWikiPageProposalsRepo,
    ReviewWikiPageProposalRepo,
    PurgeWikiPageProposalsRepo
{
  constructor(private readonly scopedCompanyId?: string) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  async deleteProposalsOfPages(pageIds: string[]) {
    if (pageIds.length === 0) return;
    await this.prisma.wikiPageProposal.deleteMany({ where: { companyId: this.companyId, pageId: { in: pageIds } } });
  }

  async proposeChanges(data: RepoArgs<ProposeWikiPageChangesRepo, "proposeChanges">) {
    let drafts: ProposalDraft[];
    if (data.action === "create") {
      const guides = data.pages.filter((page) => page.kind === "guide").length;
      if (guides > 1 || (guides === 1 && (await this.guideExists(null)))) return { status: "guide-exists" as const };
      drafts = data.pages.map((page) => ({
        action: "create" as const,
        pageId: null,
        title: page.title,
        ...wikiPageKindFields(page),
        baseUpdatedAt: null,
      }));
    } else {
      const page = await this.findPage(data.id);
      if (!page) return { status: "not-found" as const };
      if (page.updatedAt.getTime() !== data.expectedUpdatedAt.getTime()) return { status: "conflict" as const };
      if (data.action === "update") {
        const kind = data.kind ?? page.kind;
        const invalid = wikiPageKindIssue({
          kind,
          whenToUse: kind === "procedure" ? (data.whenToUse ?? page.whenToUse) : null,
          markdown: data.markdown ?? page.markdown,
        });
        if (invalid) return { status: "invalid" as const, error: invalid };
        if (kind === "guide" && page.kind !== "guide" && (await this.guideExists(page.id)))
          return { status: "guide-exists" as const };
      }
      drafts = [
        {
          action: data.action,
          pageId: page.id,
          title: data.action === "update" ? (data.title ?? null) : null,
          markdown: data.action === "update" ? (data.markdown ?? null) : null,
          kind: data.action === "update" ? (data.kind ?? null) : null,
          whenToUse: data.action === "update" ? (data.whenToUse ?? null) : null,
          baseUpdatedAt: page.updatedAt,
        },
      ];
      await this.prisma.wikiPageProposal.updateMany({
        where: { companyId: this.companyId, pageId: page.id, status: WikiPageProposalStatus.pending },
        data: { status: WikiPageProposalStatus.superseded },
      });
    }

    const run = await this.prisma.routineRun.findFirst({
      where: { companyId: this.companyId, conversationId: data.conversationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, routineId: true },
    });
    const createdAt = Date.now();
    const proposals: WikiPageProposalDto[] = [];
    for (const [index, draft] of drafts.entries()) {
      const row = await this.prisma.wikiPageProposal.create({
        data: {
          ...draft,
          companyId: this.companyId,
          routineId: run?.routineId ?? null,
          routineRunId: run?.id ?? null,
          conversationId: data.conversationId,
          proposedByUserId: this.userId,
          createdAt: new Date(createdAt + index),
        },
        select: PROPOSAL_SELECT,
      });
      proposals.push(proposalDto(row));
    }
    return { status: "proposed" as const, proposals };
  }

  async listPendingProposals(limit: number) {
    const where = { companyId: this.companyId, status: WikiPageProposalStatus.pending };
    const [rows, total] = await Promise.all([
      this.prisma.wikiPageProposal.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        select: PROPOSAL_SELECT,
      }),
      this.prisma.wikiPageProposal.count({ where }),
    ]);
    const pageIds = [...new Set(rows.flatMap(({ pageId }) => (pageId ? [pageId] : [])))];
    const pages = pageIds.length
      ? await this.prisma.wikiPage.findMany({
          where: { companyId: this.companyId, id: { in: pageIds }, deletedAt: null },
          select: PAGE_SELECT,
        })
      : [];
    const pagesById = new Map(pages.map((page) => [page.id, page]));
    return {
      total,
      items: rows.map((row) => {
        const proposal = proposalDto(row);
        const currentPage = proposal.pageId ? (pagesById.get(proposal.pageId) ?? null) : null;
        return { ...proposal, currentPage, stale: isStale(proposal, currentPage) };
      }),
    };
  }

  async findProposal(id: string) {
    const row = await this.prisma.wikiPageProposal.findFirst({
      where: { companyId: this.companyId, id },
      select: PROPOSAL_SELECT,
    });
    return row ? proposalDto(row) : null;
  }

  async settlePendingProposal(args: RepoArgs<ReviewWikiPageProposalRepo, "settlePendingProposal">) {
    const settled = await this.prisma.wikiPageProposal.updateMany({
      where: { companyId: this.companyId, id: args.id, status: WikiPageProposalStatus.pending },
      data: {
        status: args.status,
        reviewedByUserId: this.userId,
        reviewedAt: new Date(),
        ...(args.pageId ? { pageId: args.pageId } : {}),
      },
    });
    return settled.count === 1 ? this.findProposal(args.id) : null;
  }

  private findPage(id: string) {
    return this.prisma.wikiPage.findFirst({
      where: { companyId: this.companyId, id, deletedAt: null },
      select: PAGE_SELECT,
    });
  }

  private async guideExists(exceptId: string | null) {
    const guide = await this.prisma.wikiPage.findFirst({
      where: {
        companyId: this.companyId,
        kind: "guide",
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    return guide !== null;
  }
}
