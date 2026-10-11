import type { WorkflowTenant } from "./workflow-tenant";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";

import { sleep } from "workflow";

import { getWorkspaceSetupBuildService, getWorkspaceSetupInterviewService } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";

import { reportFailure, reportWarning, toWorkflowFailure } from "./capture-failure";

export type WorkspaceSetupWorkflowPayload = {
  setupId: string;
  userId: string;
  tenant?: WorkflowTenant;
};

const PREFILL_WAIT_ROUNDS = 18;
const KNOWLEDGE_BASE_WAIT_ROUNDS = 180;
const WAIT = "10s";

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

async function planWorkspaceSetupStep(payload: WorkspaceSetupWorkflowPayload): Promise<string[]> {
  "use step";
  const service = getWorkspaceSetupInterviewService();
  await runAsBackgroundTenant(payload.userId, () => service.plan(payload.setupId));
  return service.drainWarnings();
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

followUpWorkspaceSetupStep.maxRetries = 1;
planWorkspaceSetupStep.maxRetries = 1;
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

export async function planWorkspaceSetup(payload: WorkspaceSetupWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    const followUps = await followUpWorkspaceSetupStep(payload);
    await warn("plan-workspace-setup", followUps.warnings, payload.tenant);
    if (followUps.result !== "none") return;
    await warn("plan-workspace-setup", await planWorkspaceSetupStep(payload), payload.tenant);
  } catch (error) {
    await reportFailure("plan-workspace-setup", toWorkflowFailure(error), payload.tenant);
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
        await runUntilSettled(payload, "dataModel", PREFILL_WAIT_ROUNDS);
        await Promise.all([
          runUntilSettled(payload, "views", PREFILL_WAIT_ROUNDS),
          runUntilSettled(payload, "records", PREFILL_WAIT_ROUNDS),
          runUntilSettled(payload, "dashboard", PREFILL_WAIT_ROUNDS),
        ]);
      })(),
    ]);
    await finishWorkspaceSetupStep(payload);
  } catch (error) {
    await reportFailure("build-workspace-setup", toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
