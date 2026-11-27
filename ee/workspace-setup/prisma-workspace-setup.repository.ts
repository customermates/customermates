import type { GridRect } from "@/features/widget/widget-grid";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupPatch, WorkspaceSetupRecord } from "./workspace-setup.schema";
import type { GetSetupKnowledgeProgressRepo } from "@/features/wiki/get-setup-knowledge-progress.repo";
import type { WikiSynthesisTopicProgress } from "@/features/wiki/wiki-crawl-progress.schema";
import type { OnboardingFunnelRepo } from "@/features/onboarding-funnel/onboarding-funnel.repo";

import { Prisma } from "@/generated/prisma";

import { TenantRepository } from "@/core/base/tenant-repository";

import { storedSetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
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
  answers: true,
  interview: true,
  plan: true,
  planRevision: true,
  phases: true,
  artifacts: true,
  created: true,
  results: true,
  startedAt: true,
  confirmedAt: true,
  finishedAt: true,
} as const;

type SetupRow = Prisma.WorkspaceSetupGetPayload<{ select: typeof SETUP_SELECT }>;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function objectOf(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function record(row: SetupRow): WorkspaceSetupRecord {
  const plan = row.plan === null ? null : SetupPlanSchema.safeParse(row.plan);
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    answers: storedSetupAnswers(row.answers),
    interview: StoredSetupInterviewSchema.parse(objectOf(row.interview)),
    plan: plan?.success ? plan.data : null,
    planRevision: row.planRevision,
    phases: StoredSetupPhasesSchema.parse(objectOf(row.phases)),
    artifacts: objectOf(row.artifacts),
    created: StoredSetupCreatedSchema.parse(objectOf(row.created)),
    results: StoredSetupResultsSchema.parse(objectOf(row.results)),
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
  constructor(private readonly funnel: Pick<OnboardingFunnelRepo, "recordFunnelEvent">) {
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

  async create(data: { answers: SetupAnswers; templateSlug: string | null }) {
    try {
      const row = await this.prisma.workspaceSetup.create({
        data: {
          companyId: this.companyId,
          userId: this.userId,
          answers: json(data.answers),
          interview: json(data.templateSlug ? { templateSlug: data.templateSlug } : {}),
        },
        select: SETUP_SELECT,
      });
      return record(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    }
  }

  async restart(id: string, data: { answers: SetupAnswers; templateSlug: string | null }) {
    const { count } = await this.prisma.workspaceSetup.updateMany({
      where: { id, companyId: this.companyId, status: { in: ["interview", "planned", "failed"] } },
      data: {
        userId: this.userId,
        status: "interview",
        answers: json(data.answers),
        interview: json(data.templateSlug ? { templateSlug: data.templateSlug } : {}),
        plan: Prisma.DbNull,
        planRevision: 0,
        phases: json({}),
        artifacts: json({}),
        created: json({}),
        results: json({}),
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
      if (current.status !== "completed" && next.status === "completed")
        await this.funnel.recordFunnelEvent({ type: "setupCompleted", occurredAt: next.finishedAt ?? new Date() });
      return { setup: next, changed: true };
    });
  }

  async findSetupKnowledgeProgress(): Promise<WikiSynthesisTopicProgress[] | null> {
    const setup = await this.findCurrent();
    if (!setup || !setupPhaseOpen(setup.status, "knowledgeBase")) return null;
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
