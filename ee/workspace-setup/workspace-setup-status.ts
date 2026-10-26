import type { SetupAnswerValue, SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { SetupCrawlState } from "./workspace-setup.repo";
import type { SetupPlanPartProgress } from "./workspace-setup-interview.service";
import type { SetupPlanPart } from "./workspace-setup-planner";
import type {
  SetupFollowUpQuestion,
  SetupGenerationState,
  StoredSetupResults,
  WorkspaceSetupFailure,
  WorkspaceSetupPhase,
  WorkspaceSetupPhaseStatus,
  WorkspaceSetupRecord,
  WorkspaceSetupStatus,
} from "./workspace-setup.schema";

import { WIKI_CRAWL_MAX_PAGES } from "@/ee/wiki-crawl/website-discovery";

import { WORKSPACE_SETUP_PHASES, WORKSPACE_SETUP_PHASE_DEPENDENCIES } from "./workspace-setup.schema";
import { emptySetupPhase, settledSetupStatus, setupBuildStalled, setupPhaseStalled } from "./workspace-setup-phases";
import { setupPlanProgress, setupPlanStalled, setupPrefillStalled } from "./workspace-setup-interview.service";
import { SetupAnswerPagesSchema } from "./workspace-setup-answer-pages";

export type WorkspaceSetupPhaseView = {
  key: WorkspaceSetupPhase;
  status: WorkspaceSetupPhaseStatus;
  error: WorkspaceSetupFailure | null;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
};

export type WorkspaceSetupStatusView =
  | { available: false; reason: "selfHosted" | "demo" | "configured"; setup: null }
  | { available: true; setup: WorkspaceSetupView | null };

export type WorkspaceSetupView = {
  id: string;
  status: WorkspaceSetupStatus;
  websiteUrl: string | null;
  startedAt: string;
  confirmedAt: string | null;
  finishedAt: string | null;
  knowledgeBase: {
    crawlStatus: string | null;
    failureReason: string | null;
    pagesPlanned: number;
    pagesWritten: number;
    sourcesFound: number;
    sourcesRead: number;
  };
  interview: {
    answers: SetupAnswers;
    prefill: SetupGenerationState;
    prefillError: WorkspaceSetupFailure | null;
    followUps: SetupGenerationState;
    followUpQuestions: SetupFollowUpQuestion[];
    followUpAnswers: Array<{ id: string; value: SetupAnswerValue }>;
  };
  plan: {
    status: SetupGenerationState;
    error: WorkspaceSetupFailure | null;
    revision: number;
    plan: SetupPlan | null;
    queuedAt: string | null;
    parts: Record<SetupPlanPart, SetupPlanPartProgress>;
  };
  spreadsheet: { fileName: string } | null;
  phases: WorkspaceSetupPhaseView[];
  currentPhase: WorkspaceSetupPhase | null;
  results: StoredSetupResults;
  spend: { usedMicrocents: number; heldMicrocents: number; capMicrocents: number; capReached: boolean };
};

export function workspaceSetupView(
  setup: WorkspaceSetupRecord,
  crawl: SetupCrawlState | null,
  spend: { usedMicrocents: number; heldMicrocents: number },
  capMicrocents: number,
  now = new Date(),
): WorkspaceSetupView {
  const settledBuild = setup.status === "building" ? settledSetupStatus(setup.phases) : null;
  const buildStalled = !settledBuild && setupBuildStalled(setup, now);
  const unsettled = (key: WorkspaceSetupPhase) => {
    const status = setup.phases[key]?.status ?? "pending";
    return status === "pending" || status === "running";
  };
  const phases = WORKSPACE_SETUP_PHASES.map((key) => {
    const phase = setup.phases[key] ?? emptySetupPhase();
    const stalled = setupPhaseStalled(phase, now) || (buildStalled && unsettled(key));
    const error = WORKSPACE_SETUP_PHASE_DEPENDENCIES[key].some(unsettled) ? "dependency" : "error";
    return {
      key,
      status: stalled ? ("failed" as const) : phase.status,
      error: stalled ? error : phase.error,
      attempts: phase.attempts,
      startedAt: phase.startedAt,
      finishedAt: phase.finishedAt,
    };
  });
  const planStalled = setupPlanStalled(setup, now);
  const prefillStalled = setupPrefillStalled(setup, now);
  const storedAnswerPages = SetupAnswerPagesSchema.safeParse(setup.artifacts.answerPages);
  const answerPages = storedAnswerPages.success ? storedAnswerPages.data : null;
  return {
    id: setup.id,
    status: planStalled ? "interview" : buildStalled ? "failed" : (settledBuild ?? setup.status),
    websiteUrl: setup.websiteUrl,
    startedAt: setup.startedAt.toISOString(),
    confirmedAt: setup.confirmedAt?.toISOString() ?? null,
    finishedAt: setup.finishedAt?.toISOString() ?? null,
    knowledgeBase: {
      crawlStatus: crawl?.status ?? null,
      failureReason: crawl?.failureReason ?? null,
      pagesPlanned: crawl ? crawl.topics.length : (answerPages?.planned ?? 0),
      pagesWritten: crawl
        ? crawl.topics.filter((topic) => topic.status === "created").length
        : (answerPages?.pages.filter((page) => page.pageId).length ?? 0),
      sourcesFound: Math.min(crawl?.discovered ?? 0, WIKI_CRAWL_MAX_PAGES),
      sourcesRead: Math.min(crawl?.fetched ?? 0, WIKI_CRAWL_MAX_PAGES),
    },
    interview: {
      answers: setup.answers,
      prefill: prefillStalled ? "failed" : setup.interview.prefill,
      prefillError: prefillStalled ? "error" : setup.interview.prefillError,
      followUps: setup.interview.followUps,
      followUpQuestions: setup.interview.followUpQuestions,
      followUpAnswers: setup.interview.followUpAnswers,
    },
    plan: {
      status: planStalled ? "failed" : setup.interview.plan,
      error: planStalled ? "error" : setup.interview.planError,
      revision: setup.planRevision,
      plan: setup.plan,
      queuedAt: setup.interview.planQueuedAt,
      parts: setupPlanProgress(setup),
    },
    spreadsheet: setup.hasSpreadsheet && setup.spreadsheetName ? { fileName: setup.spreadsheetName } : null,
    phases,
    currentPhase:
      setup.status === "building" && !buildStalled
        ? (phases.find((phase) => phase.status === "running" && phase.key !== "knowledgeBase")?.key ??
          phases.find((phase) => phase.status === "running")?.key ??
          null)
        : null,
    results: setup.results,
    spend: {
      ...spend,
      capMicrocents,
      capReached: spend.usedMicrocents + spend.heldMicrocents >= capMicrocents,
    },
  };
}
