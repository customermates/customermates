import type { WorkspaceSetupPhaseView, WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupPhase, WorkspaceSetupPhaseStatus } from "@/ee/workspace-setup/workspace-setup.schema";
import type { SetupPreviewList } from "./setup-plan-summary";

import { setupRoleList } from "@/features/workspace-setup/setup-anchors";

import { previewLists } from "./setup-plan-summary";

export type BuildOutcome = "running" | "completed" | "failed";

export type BuildPhaseState = "waiting" | "active" | "done" | "failed" | "skipped";

const PHASE_STATES: Record<WorkspaceSetupPhaseStatus, BuildPhaseState> = {
  pending: "waiting",
  running: "active",
  completed: "done",
  failed: "failed",
  stopped: "failed",
  skipped: "skipped",
};

export function buildOutcome(setup: WorkspaceSetupView): BuildOutcome {
  if (setup.status === "completed") return "completed";
  if (setup.status === "failed") return "failed";
  return "running";
}

export function buildPhaseState(phase: WorkspaceSetupPhaseView): BuildPhaseState {
  return phase.status === "pending" && phase.error ? "active" : PHASE_STATES[phase.status];
}

export function phaseOf(setup: WorkspaceSetupView, key: WorkspaceSetupPhase): WorkspaceSetupPhaseView | undefined {
  return setup.phases.find((phase) => phase.key === key);
}

export function phaseDone(setup: WorkspaceSetupView, key: WorkspaceSetupPhase): boolean {
  return phaseOf(setup, key)?.status === "completed";
}

export function phaseActive(setup: WorkspaceSetupView, key: WorkspaceSetupPhase): boolean {
  return phaseOf(setup, key)?.status === "running";
}

export function phaseSettled(setup: WorkspaceSetupView, key: WorkspaceSetupPhase): boolean {
  const status = phaseOf(setup, key)?.status;
  return status === "completed" || status === "skipped";
}

export function canRetryPhase(phase: WorkspaceSetupPhaseView): boolean {
  return (phase.status === "failed" || phase.status === "stopped") && phase.error !== "dependency";
}

export function buildRecordCount(setup: WorkspaceSetupView): number {
  return setup.results.records.reduce((total, entry) => total + entry.count, 0);
}

export function buildLists(setup: WorkspaceSetupView): SetupPreviewList[] {
  return previewLists(setup.plan.plan, setup.results);
}

export function buildBoard(setup: WorkspaceSetupView): { list: SetupPreviewList; records: string[] } | null {
  const lists = buildLists(setup);
  const deals = setup.plan.plan ? setupRoleList(setup.plan.plan, "deals") : null;
  const list =
    lists.find((candidate) => candidate.key === deals && candidate.stages.length) ??
    lists.find((candidate) => candidate.stages.length);
  if (!list) return null;
  const built = setup.results.lists.find((candidate) => candidate.key === list.key);
  const records = built ? (setup.results.records.find((entry) => entry.listId === built.id)?.titles ?? []) : [];
  return { list, records };
}

export function buildTable(
  setup: WorkspaceSetupView,
  exclude: string | null,
): { list: SetupPreviewList; titles: string[]; count: number } | null {
  const lists = buildLists(setup);
  for (const entry of setup.results.records) {
    const built = setup.results.lists.find((candidate) => candidate.id === entry.listId);
    if (!built || built.key === exclude || !entry.titles.length) continue;
    const list = lists.find((candidate) => candidate.key === built.key);
    if (list) return { list, titles: entry.titles, count: entry.count };
  }
  return null;
}

export function currentBuildPhase(setup: WorkspaceSetupView): WorkspaceSetupPhase | null {
  return setup.currentPhase;
}
