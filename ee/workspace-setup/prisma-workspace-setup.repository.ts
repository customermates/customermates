import type { GridRect } from "@/features/widget/widget-grid";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { WikiWebsiteCrawlControlRepo } from "@/ee/wiki-crawl/wiki-website-crawl-control.repo";
import type { SetupCrawlSource, SetupCrawlState, WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "./workspace-setup.schema";
import type { GetSetupKnowledgeProgressRepo } from "@/features/wiki/get-setup-knowledge-progress.repo";
import type { WikiSynthesisTopicProgress } from "@/features/wiki/wiki-crawl-progress.schema";

import { Prisma } from "@/generated/prisma";

import { WIKI_CRAWL_MAX_PAGES } from "@/ee/wiki-crawl/website-discovery";

import { TenantRepository } from "@/core/base/tenant-repository";
import { isWorkspaceDeleting } from "@/features/workspace/workspace-deletion-marker";

import { SetupAnswersSchema } from "@/features/workspace-setup/setup-answers.schema";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { WidgetPlacementSchema } from "@/features/widget/widget-grid";
import {
  StoredSetupCreatedSchema,
  StoredSetupInterviewSchema,
  StoredSetupPhasesSchema,
  StoredSetupResultsSchema,
} from "./workspace-setup.schema";
import { SetupAnswerPagesSchema } from "./workspace-setup-answer-pages";
import { emptySetupPhase, setupPhaseOpen, setupPhaseStalled } from "./workspace-setup-phases";

const SETUP_SELECT = {
  id: true,
  userId: true,
  status: true,
  websiteUrl: true,
  crawlId: true,
  answers: true,
  interview: true,
  plan: true,
  planRevision: true,
  phases: true,
  artifacts: true,
  created: true,
  results: true,
  spreadsheetName: true,
  startedAt: true,
  confirmedAt: true,
  finishedAt: true,
} as const;

type SetupRow = Prisma.WorkspaceSetupGetPayload<{ select: typeof SETUP_SELECT }>;

const SOURCE_CHARACTERS = 6_000;
const SOURCE_LIMIT = WIKI_CRAWL_MAX_PAGES;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function objectOf(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function record(row: SetupRow): WorkspaceSetupRecord {
  const answers = SetupAnswersSchema.safeParse(row.answers);
  const plan = row.plan === null ? null : SetupPlanSchema.safeParse(row.plan);
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    websiteUrl: row.websiteUrl,
    crawlId: row.crawlId,
    answers: answers.success ? answers.data : {},
    interview: StoredSetupInterviewSchema.parse(objectOf(row.interview)),
    plan: plan?.success ? plan.data : null,
    planRevision: row.planRevision,
    phases: StoredSetupPhasesSchema.parse(objectOf(row.phases)),
    artifacts: objectOf(row.artifacts),
    created: StoredSetupCreatedSchema.parse(objectOf(row.created)),
    results: StoredSetupResultsSchema.parse(objectOf(row.results)),
    spreadsheetName: row.spreadsheetName,
    hasSpreadsheet: row.spreadsheetName !== null,
    startedAt: row.startedAt,
    confirmedAt: row.confirmedAt,
    finishedAt: row.finishedAt,
  };
}

function patchData(patch: WorkspaceSetupPatch): Prisma.WorkspaceSetupUpdateManyMutationInput {
  const { answers, interview, plan, phases, artifacts, created, results, ...rest } = patch;
  return {
    ...rest,
    ...(answers !== undefined ? { answers: json(answers) } : {}),
    ...(interview !== undefined ? { interview: json(interview) } : {}),
    ...(plan !== undefined ? { plan: plan === null ? Prisma.DbNull : json(plan) } : {}),
    ...(phases !== undefined ? { phases: json(phases) } : {}),
    ...(artifacts !== undefined ? { artifacts: json(artifacts) } : {}),
    ...(created !== undefined ? { created: json(created) } : {}),
    ...(results !== undefined ? { results: json(results) } : {}),
  };
}

export class PrismaWorkspaceSetupRepo
  extends TenantRepository
  implements WorkspaceSetupRepo, GetSetupKnowledgeProgressRepo
{
  constructor(private readonly crawls: WikiWebsiteCrawlControlRepo) {
    super();
  }

  private async load(where: Prisma.WorkspaceSetupWhereInput) {
    const row = await this.prisma.workspaceSetup.findFirst({
      where: { ...where, companyId: this.companyId },
      select: SETUP_SELECT,
    });
    return row ? record(row) : null;
  }

  findCurrent() {
    return this.load({});
  }

  get(id: string) {
    return this.load({ id });
  }

  async create(data: { websiteUrl: string | null; answers: SetupAnswers }) {
    try {
      const row = await this.prisma.workspaceSetup.create({
        data: {
          companyId: this.companyId,
          userId: this.userId,
          websiteUrl: data.websiteUrl,
          answers: json(data.answers),
        },
        select: SETUP_SELECT,
      });
      return record(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    }
  }

  async restart(id: string, data: { websiteUrl: string | null; answers: SetupAnswers }) {
    const { count } = await this.prisma.workspaceSetup.updateMany({
      where: { id, companyId: this.companyId, status: { in: ["interview", "planned", "failed"] } },
      data: {
        userId: this.userId,
        status: "interview",
        websiteUrl: data.websiteUrl,
        crawlId: null,
        answers: json(data.answers),
        interview: json({}),
        plan: Prisma.DbNull,
        planRevision: 0,
        phases: json({}),
        artifacts: json({}),
        created: json({}),
        results: json({}),
        spreadsheetName: null,
        spreadsheetBytes: null,
        startedAt: new Date(),
        confirmedAt: null,
        finishedAt: null,
      },
    });
    return count === 1;
  }

  async mutate(id: string, change: (setup: WorkspaceSetupRecord) => WorkspaceSetupPatch | null) {
    return this.withCompanyTransaction(this.companyId, async () => {
      const locked = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "WorkspaceSetup" WHERE "id" = ${id} AND "companyId" = ${this.companyId} FOR UPDATE
      `);
      if (locked.length === 0) return null;
      const current = await this.get(id);
      if (!current) return null;
      const patch = change(current);
      if (!patch) return { setup: current, changed: false };
      await this.prisma.workspaceSetup.updateMany({ where: { id, companyId: this.companyId }, data: patchData(patch) });
      const next = await this.get(id);
      if (!next) throw new Error("Workspace setup disappeared during an update.");
      return { setup: next, changed: true };
    });
  }

  async storeSpreadsheet(id: string, fileName: string, bytes: Uint8Array) {
    const { count } = await this.prisma.workspaceSetup.updateMany({
      where: { id, companyId: this.companyId, status: { in: ["interview", "planned"] } },
      data: { status: "interview", spreadsheetName: fileName, spreadsheetBytes: Buffer.from(bytes) },
    });
    return count === 1;
  }

  async readSpreadsheet(id: string) {
    const row = await this.prisma.workspaceSetup.findFirst({
      where: { id, companyId: this.companyId },
      select: { spreadsheetName: true, spreadsheetBytes: true },
    });
    if (!row?.spreadsheetBytes || !row.spreadsheetName) return null;
    return { fileName: row.spreadsheetName, bytes: new Uint8Array(row.spreadsheetBytes) };
  }

  async crawlState(crawlId: string): Promise<SetupCrawlState | null> {
    const row = await this.prisma.wikiWebsiteCrawl.findFirst({
      where: { id: crawlId, companyId: this.companyId },
      select: {
        status: true,
        failureReason: true,
        homepageUrl: true,
        registrableDomain: true,
        discovered: true,
        fetched: true,
        topics: true,
      },
    });
    if (!row) return null;
    const topics = Array.isArray(row.topics)
      ? row.topics.flatMap((topic) => {
          const entry = objectOf(topic);
          return typeof entry.status === "string"
            ? [{ status: entry.status, ...(typeof entry.pageId === "string" ? { pageId: entry.pageId } : {}) }]
            : [];
        })
      : [];
    return {
      status: row.status,
      failureReason: row.failureReason,
      homepageUrl: row.homepageUrl,
      registrableDomain: row.registrableDomain,
      discovered: row.discovered,
      fetched: row.fetched,
      topics,
    };
  }

  stopCrawl(crawlId: string) {
    return this.crawls.stopCrawl(crawlId);
  }

  async findSetupKnowledgeProgress(): Promise<WikiSynthesisTopicProgress[] | null> {
    const setup = await this.findCurrent();
    if (!setup || setup.crawlId || !setupPhaseOpen(setup.status, "knowledgeBase")) return null;
    const phase = setup.phases.knowledgeBase ?? emptySetupPhase();
    if ((phase.status !== "pending" && phase.status !== "running") || setupPhaseStalled(phase, new Date())) return null;
    const stored = SetupAnswerPagesSchema.safeParse(setup.artifacts.answerPages);
    const written = new Set(
      stored.success ? stored.data.pages.flatMap((page) => (page.pageId ? [page.title] : [])) : [],
    );
    const titles = stored.success ? (stored.data.titles ?? []) : [];
    const writing = phase.status === "running" ? titles.find((title) => !written.has(title)) : undefined;
    return titles.map((title) => ({
      title,
      status: written.has(title) ? "created" : title === writing ? "writing" : "pending",
    }));
  }

  async markWatched(id: string, at: Date) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "WorkspaceSetup" SET "interview" = jsonb_set("interview", '{watchedAt}', to_jsonb(${at.toISOString()}::text))
      WHERE "id" = ${id} AND "companyId" = ${this.companyId}
    `);
  }

  async workspaceDeleting() {
    const company = await this.prisma.company.findFirst({
      where: { id: this.companyId },
      select: { deletingAt: true },
    });
    return !company || isWorkspaceDeleting(company.deletingAt);
  }

  async crawlSources(crawlId: string): Promise<SetupCrawlSource[]> {
    const rows = await this.prisma.wikiSourceDocument.findMany({
      where: { crawlId, companyId: this.companyId },
      orderBy: [{ fetchedAt: "asc" }, { id: "asc" }],
      take: SOURCE_LIMIT,
      select: { url: true, title: true, text: true, category: true },
    });
    return rows.map((row) => ({
      url: row.url,
      title: row.title,
      category: row.category,
      text: row.text.slice(0, SOURCE_CHARACTERS),
    }));
  }

  setCrawlLocale(crawlId: string, locale: string) {
    return this.crawls.setCrawlLocale(crawlId, locale);
  }

  reopenCrawlSynthesis(crawlId: string) {
    return this.crawls.reopenSynthesis(crawlId);
  }

  async knowledgeBasePages(crawlId: string) {
    const crawl = await this.crawlState(crawlId);
    if (!crawl) return [];
    const sources = await this.prisma.wikiSourceDocument.findMany({
      where: { crawlId, companyId: this.companyId },
      select: { url: true },
    });
    const topicPages = crawl.topics.flatMap((topic) => (topic.pageId ? [topic.pageId] : []));
    return this.prisma.wikiPage.findMany({
      where: {
        companyId: this.companyId,
        deletedAt: null,
        OR: [{ id: { in: topicPages } }, { sourceUrl: { in: sources.map((source) => source.url) } }],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, title: true, updatedAt: true },
    });
  }

  async findWikiPageCreatedSince(title: string, since: Date) {
    const row = await this.prisma.wikiPage.findFirst({
      where: { companyId: this.companyId, title, deletedAt: null, createdAt: { gte: since } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findOwnedView(surfaceKey: string, name: string) {
    const row = await this.prisma.dataView.findFirst({
      where: { companyId: this.companyId, userId: this.userId, surfaceKey, name },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async ownedWidgetLayouts(): Promise<GridRect[]> {
    const rows = await this.prisma.widget.findMany({
      where: { companyId: this.companyId, userId: this.userId, deletedAt: null },
      select: { layout: true },
    });
    return rows.flatMap((row) => {
      const layout = WidgetPlacementSchema.safeParse(row.layout);
      return layout.success ? [layout.data] : [];
    });
  }
}
