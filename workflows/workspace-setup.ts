import type { WorkflowTenant } from "./workflow-tenant";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { SetupPlanPart } from "@/ee/workspace-setup/workspace-setup-planner";
import type { SetupNoticeStage } from "@/ee/workspace-setup/workspace-setup-notifier";

import { getWorkflowMetadata, sleep } from "workflow";

import {
  getWorkspaceSetupBuildService,
  getWorkspaceSetupInterviewService,
  getWorkspaceSetupNotifier,
  getWorkspaceSetupRepo,
} from "@/core/di";
import { SETUP_PLAN_ATTEMPTS, SETUP_PLAN_PART_ATTEMPTS } from "@/ee/workspace-setup/workspace-setup-attempts";
import { notifyWorkspaceSetupOnce } from "@/ee/workspace-setup/workspace-setup-notice-marker";

import { asBackgroundOwner } from "./background-owner";
import { GONE, present } from "./owner-gone";
import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

export type WorkspaceSetupWorkflowPayload = {
  setupId: string;
  userId: string;
  tenant?: WorkflowTenant;
};

const PREFILL_WAIT_ROUNDS = 18;
const KNOWLEDGE_BASE_WAIT_ROUNDS = 180;
const PLAN_BUSY_ROUNDS = 100;
const PHASE_BUSY_ROUNDS = 60;
const FINISH_WAIT_ROUNDS = 30;
const WAIT = "10s";
const PLAN_RETRY_WAIT = "30s";
async function prefillWorkspaceSetupStep(
  payload: WorkspaceSetupWorkflowPayload,
  force: boolean,
): Promise<{ result: "done" | "wait"; warnings: string[] }> {
  "use step";
  const service = getWorkspaceSetupInterviewService();
  const result = await asBackgroundOwner(payload.userId, () => service.prefill(payload.setupId, force));
  return { result: present(result, "done" as const), warnings: service.drainWarnings() };
}

async function followUpWorkspaceSetupStep(
  payload: WorkspaceSetupWorkflowPayload,
): Promise<{ result: "asked" | "none" | "skip"; warnings: string[] }> {
  "use step";
  const service = getWorkspaceSetupInterviewService();
  const result = await asBackgroundOwner(payload.userId, () => service.followUps(payload.setupId));
  return { result: present(result, "skip" as const), warnings: service.drainWarnings() };
}

async function claimWorkspaceSetupPlanStep(
  payload: WorkspaceSetupWorkflowPayload,
): Promise<{ status: "claimed"; revision: number } | { status: "busy" | "skip" }> {
  "use step";
  const claim = await asBackgroundOwner(payload.userId, () =>
    getWorkspaceSetupInterviewService().claimPlan(payload.setupId),
  );
  return present(claim, { status: "skip" as const });
}

async function planWorkspaceSetupPartStep(
  payload: WorkspaceSetupWorkflowPayload,
  revision: number,
  part: SetupPlanPart,
): Promise<{ result: "done" | "retry" | "failed" | "skip"; warnings: string[] }> {
  "use step";
  const service = getWorkspaceSetupInterviewService();
  const result = await asBackgroundOwner(payload.userId, () => service.planPart(payload.setupId, revision, part));
  return { result: present(result, "skip" as const), warnings: service.drainWarnings() };
}

async function finishWorkspaceSetupPlanStep(
  payload: WorkspaceSetupWorkflowPayload,
  revision: number,
  final: boolean,
): Promise<"planned" | "retry" | "failed" | "skip"> {
  "use step";
  const result = await asBackgroundOwner(payload.userId, () =>
    getWorkspaceSetupInterviewService().finishPlan(payload.setupId, revision, final),
  );
  return present(result, "skip" as const);
}

async function buildWorkspaceSetupPhaseStep(
  payload: WorkspaceSetupWorkflowPayload,
  phase: WorkspaceSetupPhase,
  giveUp: boolean,
  runId: string,
): Promise<{ result: "settled" | "wait" | "busy" | "skip" | typeof GONE; warnings: string[] }> {
  "use step";
  const service = getWorkspaceSetupBuildService();
  const result = await asBackgroundOwner(payload.userId, () => service.runPhase(payload.setupId, phase, giveUp, runId));
  return { result, warnings: service.drainWarnings() };
}

async function finishWorkspaceSetupStep(payload: WorkspaceSetupWorkflowPayload): Promise<boolean> {
  "use step";
  const finished = await asBackgroundOwner(payload.userId, () =>
    getWorkspaceSetupBuildService().finish(payload.setupId),
  );
  return finished !== false;
}

async function abandonWorkspaceSetupStep(payload: WorkspaceSetupWorkflowPayload, runId: string): Promise<void> {
  "use step";
  await asBackgroundOwner(payload.userId, () => getWorkspaceSetupBuildService().abandon(payload.setupId, runId), {
    allowInactive: true,
  });
}

async function abandonWorkspaceSetupPlanStep(
  payload: WorkspaceSetupWorkflowPayload,
  revision: number | null,
): Promise<void> {
  "use step";
  await asBackgroundOwner(
    payload.userId,
    () => getWorkspaceSetupInterviewService().abandonPlan(payload.setupId, revision),
    {
      allowInactive: true,
    },
  );
}

async function notifyWorkspaceSetupStep(
  payload: WorkspaceSetupWorkflowPayload,
  stage: SetupNoticeStage,
): Promise<void> {
  "use step";
  await asBackgroundOwner(payload.userId, () =>
    notifyWorkspaceSetupOnce(getWorkspaceSetupRepo(), getWorkspaceSetupNotifier(), payload.setupId, stage),
  );
}

followUpWorkspaceSetupStep.maxRetries = 1;
notifyWorkspaceSetupStep.maxRetries = 2;
claimWorkspaceSetupPlanStep.maxRetries = 1;
planWorkspaceSetupPartStep.maxRetries = 1;
finishWorkspaceSetupPlanStep.maxRetries = 1;
buildWorkspaceSetupPhaseStep.maxRetries = 1;

async function warn(name: string, warnings: string[], tenant?: WorkflowTenant) {
  for (const warning of warnings) await reportWarning(name, warning, tenant);
}

async function notify(name: string, payload: WorkspaceSetupWorkflowPayload, stage: SetupNoticeStage) {
  try {
    await notifyWorkspaceSetupStep(payload, stage);
  } catch (error) {
    await warn(
      name,
      [`Workspace setup notice failed: ${error instanceof Error ? error.name : typeof error}.`],
      payload.tenant,
    );
  }
}

export async function prepareWorkspaceSetup(payload: WorkspaceSetupWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    for (let round = 0; round <= PREFILL_WAIT_ROUNDS; round += 1) {
      const step = await prefillWorkspaceSetupStep(payload, round === PREFILL_WAIT_ROUNDS);
      await warn("prepare-workspace-setup", step.warnings, payload.tenant);
      if (step.result === "done") return;
      await sleep(WAIT);
    }
  } catch (error) {
    await reportFailure("prepare-workspace-setup", toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}

async function draftPlanPart(payload: WorkspaceSetupWorkflowPayload, revision: number, part: SetupPlanPart) {
  for (let round = 0; round < SETUP_PLAN_PART_ATTEMPTS; round += 1) {
    const step = await planWorkspaceSetupPartStep(payload, revision, part);
    await warn("plan-workspace-setup", step.warnings, payload.tenant);
    if (step.result !== "retry") return step.result;
  }
  return "failed" as const;
}

async function claimPlan(payload: WorkspaceSetupWorkflowPayload) {
  for (let round = 0; round <= PLAN_BUSY_ROUNDS; round += 1) {
    const claim = await claimWorkspaceSetupPlanStep(payload);
    if (claim.status !== "busy") return claim.status === "claimed" ? claim.revision : null;
    await sleep(WAIT);
  }
  return null;
}

async function draftPlan(payload: WorkspaceSetupWorkflowPayload, final: boolean, claimed: { revision: number | null }) {
  const revision = await claimPlan(payload);
  if (revision === null) return "skip" as const;
  claimed.revision = revision;
  const [model] = await Promise.all([
    draftPlanPart(payload, revision, "model"),
    draftPlanPart(payload, revision, "knowledge"),
  ]);
  if (model === "done") await draftPlanPart(payload, revision, "views");
  return finishWorkspaceSetupPlanStep(payload, revision, final);
}

export async function planWorkspaceSetup(payload: WorkspaceSetupWorkflowPayload): Promise<void> {
  "use workflow";
  const claimed: { revision: number | null } = { revision: null };
  try {
    const followUps = await followUpWorkspaceSetupStep(payload);
    await warn("plan-workspace-setup", followUps.warnings, payload.tenant);
    if (followUps.result !== "none") return;
    for (let attempt = 1; attempt <= SETUP_PLAN_ATTEMPTS; attempt += 1) {
      const result = await draftPlan(payload, attempt === SETUP_PLAN_ATTEMPTS, claimed);
      if (result === "planned" || result === "failed") await notify("plan-workspace-setup", payload, "plan");
      if (result !== "retry") return;
      await sleep(PLAN_RETRY_WAIT);
    }
  } catch (error) {
    try {
      await abandonWorkspaceSetupPlanStep(payload, claimed.revision);
      await notify("plan-workspace-setup", payload, "plan");
    } finally {
      await reportFailure("plan-workspace-setup", toWorkflowFailure(error), payload.tenant);
    }
    throw error;
  }
}

async function runUntilSettled(
  payload: WorkspaceSetupWorkflowPayload,
  phase: WorkspaceSetupPhase,
  rounds: number,
  runId: string,
) {
  for (let round = 0; round <= rounds; round += 1) {
    const step = await buildWorkspaceSetupPhaseStep(payload, phase, round === rounds, runId);
    await warn("build-workspace-setup", step.warnings, payload.tenant);
    if (step.result !== "wait" && step.result !== "busy") return step.result;
    await sleep(WAIT);
  }
  return "busy" as const;
}

async function buildPhases(payload: WorkspaceSetupWorkflowPayload, runId: string) {
  const model = await runUntilSettled(payload, "dataModel", PHASE_BUSY_ROUNDS, runId);
  if (model === GONE) return [model];
  return Promise.all([
    runUntilSettled(payload, "views", PHASE_BUSY_ROUNDS, runId),
    runUntilSettled(payload, "records", PHASE_BUSY_ROUNDS, runId),
    runUntilSettled(payload, "dashboard", PHASE_BUSY_ROUNDS, runId),
  ]);
}

export async function buildWorkspaceSetup(payload: WorkspaceSetupWorkflowPayload): Promise<void> {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  try {
    const knowledgeBase = runUntilSettled(payload, "knowledgeBase", KNOWLEDGE_BASE_WAIT_ROUNDS, workflowRunId).then(
      (result) => ({ result }),
      (error: unknown) => ({ result: null, error }),
    );
    const phases = await buildPhases(payload, workflowRunId);
    if (!phases.includes(GONE)) {
      for (let round = 0; !(await finishWorkspaceSetupStep(payload)) && round < FINISH_WAIT_ROUNDS; round += 1)
        await sleep(WAIT);
      await notify("build-workspace-setup", payload, "build");
    }
    const settled = await knowledgeBase;
    if ("error" in settled) throw settled.error;
    if (settled.result === GONE || phases.includes(GONE)) await abandonWorkspaceSetupStep(payload, workflowRunId);
  } catch (error) {
    try {
      await abandonWorkspaceSetupStep(payload, workflowRunId);
      await notify("build-workspace-setup", payload, "build");
    } finally {
      await reportFailure("build-workspace-setup", toWorkflowFailure(error), payload.tenant);
    }
    throw error;
  }
}
