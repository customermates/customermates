import type { WorkspaceSetupPhaseView, WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupPhaseStatus } from "@/ee/workspace-setup/workspace-setup.schema";

type BuildOutcome = "running" | "completed" | "failed";

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

export function canRetryPhase(phase: WorkspaceSetupPhaseView): boolean {
  return (phase.status === "failed" || phase.status === "stopped") && phase.error !== "dependency";
}

export function buildRecordCount(setup: WorkspaceSetupView): number {
  return setup.results.records.reduce((total, entry) => total + entry.count, 0);
}
