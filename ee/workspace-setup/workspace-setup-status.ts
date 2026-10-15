import type { SetupAnswerValue, SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { SetupCrawlState } from "./workspace-setup.repo";
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

import { WORKSPACE_SETUP_PHASES } from "./workspace-setup.schema";
import { emptySetupPhase, setupPhaseStalled } from "./workspace-setup-build.service";
import { setupPlanStalled } from "./workspace-setup-interview.service";

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
  };
  spreadsheet: { fileName: string } | null;
  phases: WorkspaceSetupPhaseView[];
  currentPhase: WorkspaceSetupPhase | null;
  results: StoredSetupResults;
  spend: { usedMicrocents: number; heldMicrocents: number; capMicrocents: number; capReached: boolean };
  canRemoveSampleData: boolean;
};

export function workspaceSetupView(
  setup: WorkspaceSetupRecord,
  crawl: SetupCrawlState | null,
  spend: { usedMicrocents: number; heldMicrocents: number },
  capMicrocents: number,
  now = new Date(),
): WorkspaceSetupView {
  const phases = WORKSPACE_SETUP_PHASES.map((key) => {
    const phase = setup.phases[key] ?? emptySetupPhase();
    const stalled = setupPhaseStalled(phase, now);
    return {
      key,
      status: stalled ? ("failed" as const) : phase.status,
      error: stalled ? ("error" as const) : phase.error,
      attempts: phase.attempts,
      startedAt: phase.startedAt,
      finishedAt: phase.finishedAt,
    };
  });
  const idle = !phases.some((phase) => phase.status === "running");
  const planStalled = setupPlanStalled(setup, now);
  return {
    id: setup.id,
    status: planStalled ? "interview" : setup.status,
    websiteUrl: setup.websiteUrl,
    startedAt: setup.startedAt.toISOString(),
    confirmedAt: setup.confirmedAt?.toISOString() ?? null,
    finishedAt: setup.finishedAt?.toISOString() ?? null,
    knowledgeBase: {
      crawlStatus: crawl?.status ?? null,
      failureReason: crawl?.failureReason ?? null,
      pagesPlanned: crawl?.topics.length ?? 0,
      pagesWritten: crawl?.topics.filter((topic) => topic.status === "created").length ?? 0,
    },
    interview: {
      answers: setup.answers,
      prefill: setup.interview.prefill,
      prefillError: setup.interview.prefillError,
      followUps: setup.interview.followUps,
      followUpQuestions: setup.interview.followUpQuestions,
      followUpAnswers: setup.interview.followUpAnswers,
    },
    plan: {
      status: planStalled ? "failed" : setup.interview.plan,
      error: planStalled ? "error" : setup.interview.planError,
      revision: setup.planRevision,
      plan: setup.plan,
    },
    spreadsheet: setup.hasSpreadsheet && setup.spreadsheetName ? { fileName: setup.spreadsheetName } : null,
    phases,
    currentPhase:
      setup.status === "building"
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
    canRemoveSampleData: setup.created.sampleRecords.length > 0 && idle,
  };
}
