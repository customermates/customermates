import type { WorkflowTenant } from "./workflow-tenant";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { SetupPlanPart } from "@/ee/workspace-setup/workspace-setup-planner";

import { sleep } from "workflow";

import { getWorkspaceSetupBuildService, getWorkspaceSetupInterviewService } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { SETUP_PLAN_ATTEMPTS } from "@/ee/workspace-setup/workspace-setup-attempts";

import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

export type WorkspaceSetupWorkflowPayload = {
  setupId: string;
  userId: string;
  tenant?: WorkflowTenant;
};

const PREFILL_WAIT_ROUNDS = 18;
const KNOWLEDGE_BASE_WAIT_ROUNDS = 180;
const PLAN_BUSY_ROUNDS = 100;
const PHASE_BUSY_ROUNDS = 130;
const PLAN_PART_ROUNDS = 3;
const WAIT = "10s";
const PLAN_RETRY_WAIT = "30s";

async function prefillWorkspaceSetupStep(
  payload: WorkspaceSetupWorkflowPayload,
  force: boolean,
): Promise<{ result: "done" | "wait"; warnings: string[] }> {
  "use step";
  const service = getWorkspaceSetupInterviewService();
  const result = await runAsBackgroundTenant(payload.userId, () => service.prefill(payload.setupId, force));
  return { result, warnings: service.drainWarnings() };
}

async function followUpWorkspaceSetupStep(
  payload: WorkspaceSetupWorkflowPayload,
): Promise<{ result: "asked" | "none" | "skip"; warnings: string[] }> {
  "use step";
  const service = getWorkspaceSetupInterviewService();
  const result = await runAsBackgroundTenant(payload.userId, () => service.followUps(payload.setupId));
  return { result, warnings: service.drainWarnings() };
}

async function claimWorkspaceSetupPlanStep(
  payload: WorkspaceSetupWorkflowPayload,
): Promise<{ status: "claimed"; revision: number } | { status: "busy" | "skip" }> {
  "use step";
  return runAsBackgroundTenant(payload.userId, () => getWorkspaceSetupInterviewService().claimPlan(payload.setupId));
}

async function planWorkspaceSetupPartStep(
  payload: WorkspaceSetupWorkflowPayload,
  revision: number,
  part: SetupPlanPart,
): Promise<{ result: "done" | "retry" | "failed" | "skip"; warnings: string[] }> {
  "use step";
  const service = getWorkspaceSetupInterviewService();
  const result = await runAsBackgroundTenant(payload.userId, () => service.planPart(payload.setupId, revision, part));
  return { result, warnings: service.drainWarnings() };
}

async function finishWorkspaceSetupPlanStep(
  payload: WorkspaceSetupWorkflowPayload,
  revision: number,
  final: boolean,
): Promise<"planned" | "retry" | "failed" | "skip"> {
  "use step";
  return runAsBackgroundTenant(payload.userId, () =>
    getWorkspaceSetupInterviewService().finishPlan(payload.setupId, revision, final),
  );
}

async function buildWorkspaceSetupPhaseStep(
  payload: WorkspaceSetupWorkflowPayload,
  phase: WorkspaceSetupPhase,
  giveUp: boolean,
): Promise<{ result: "settled" | "wait" | "busy" | "skip"; warnings: string[] }> {
  "use step";
  const service = getWorkspaceSetupBuildService();
  const result = await runAsBackgroundTenant(payload.userId, () => service.runPhase(payload.setupId, phase, giveUp));
  return { result, warnings: service.drainWarnings() };
}

async function finishWorkspaceSetupStep(payload: WorkspaceSetupWorkflowPayload): Promise<void> {
  "use step";
  await runAsBackgroundTenant(payload.userId, () => getWorkspaceSetupBuildService().finish(payload.setupId));
}

async function abandonWorkspaceSetupStep(payload: WorkspaceSetupWorkflowPayload): Promise<void> {
  "use step";
  await runAsBackgroundTenant(payload.userId, () => getWorkspaceSetupBuildService().abandon(payload.setupId), {
    allowInactive: true,
  });
}

async function abandonWorkspaceSetupPlanStep(
  payload: WorkspaceSetupWorkflowPayload,
  revision: number | null,
): Promise<void> {
  "use step";
  await runAsBackgroundTenant(
    payload.userId,
    () => getWorkspaceSetupInterviewService().abandonPlan(payload.setupId, revision),
    { allowInactive: true },
  );
}

followUpWorkspaceSetupStep.maxRetries = 1;
claimWorkspaceSetupPlanStep.maxRetries = 1;
planWorkspaceSetupPartStep.maxRetries = 1;
finishWorkspaceSetupPlanStep.maxRetries = 1;
buildWorkspaceSetupPhaseStep.maxRetries = 1;

async function warn(name: string, warnings: string[], tenant?: WorkflowTenant) {
  for (const warning of warnings) await reportWarning(name, warning, tenant);
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
  for (let round = 0; round < PLAN_PART_ROUNDS; round += 1) {
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
      if ((await draftPlan(payload, attempt === SETUP_PLAN_ATTEMPTS, claimed)) !== "retry") return;
      await sleep(PLAN_RETRY_WAIT);
    }
  } catch (error) {
    try {
      await abandonWorkspaceSetupPlanStep(payload, claimed.revision);
    } finally {
      await reportFailure("plan-workspace-setup", toWorkflowFailure(error), payload.tenant);
    }
    throw error;
  }
}

async function runUntilSettled(payload: WorkspaceSetupWorkflowPayload, phase: WorkspaceSetupPhase, rounds: number) {
  for (let round = 0; round <= rounds; round += 1) {
    const step = await buildWorkspaceSetupPhaseStep(payload, phase, round === rounds);
    await warn("build-workspace-setup", step.warnings, payload.tenant);
    if (step.result !== "wait" && step.result !== "busy") return step.result;
    await sleep(WAIT);
  }
  return "busy" as const;
}

export async function buildWorkspaceSetup(payload: WorkspaceSetupWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    await Promise.all([
      runUntilSettled(payload, "knowledgeBase", KNOWLEDGE_BASE_WAIT_ROUNDS),
      (async () => {
        await runUntilSettled(payload, "dataModel", PHASE_BUSY_ROUNDS);
        await Promise.all([
          runUntilSettled(payload, "views", PHASE_BUSY_ROUNDS),
          runUntilSettled(payload, "records", PHASE_BUSY_ROUNDS),
          runUntilSettled(payload, "dashboard", PHASE_BUSY_ROUNDS),
        ]);
      })(),
    ]);
    await finishWorkspaceSetupStep(payload);
  } catch (error) {
    try {
      await abandonWorkspaceSetupStep(payload);
    } finally {
      await reportFailure("build-workspace-setup", toWorkflowFailure(error), payload.tenant);
    }
    throw error;
  }
}
