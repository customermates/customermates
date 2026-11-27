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

const OPEN_PHASE_STATUSES: ReadonlySet<WorkspaceSetupPhaseStatus> = new Set(["pending", "running"]);
const UNFINISHED_PHASE_STATUSES: ReadonlySet<WorkspaceSetupPhaseStatus> = new Set(["failed", "stopped"]);
const BUILT_STATUSES: ReadonlySet<WorkspaceSetupView["status"]> = new Set(["completed", "failed"]);

export function buildPhaseStillRunning(setup: WorkspaceSetupView): boolean {
  return BUILT_STATUSES.has(setup.status) && setup.phases.some((phase) => OPEN_PHASE_STATUSES.has(phase.status));
}

export function buildOutcome(setup: WorkspaceSetupView): BuildOutcome {
  if (setup.status === "failed") return "failed";
  if (setup.status !== "completed" || buildPhaseStillRunning(setup)) return "running";
  return setup.phases.some((phase) => UNFINISHED_PHASE_STATUSES.has(phase.status)) ? "failed" : "completed";
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
