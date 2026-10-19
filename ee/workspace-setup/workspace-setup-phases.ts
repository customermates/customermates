import type {
  StoredSetupPhase,
  StoredSetupPhases,
  WorkspaceSetupPatch,
  WorkspaceSetupPhase,
  WorkspaceSetupRecord,
} from "./workspace-setup.schema";

import { WORKSPACE_SETUP_PHASES, WORKSPACE_SETUP_PHASE_DEPENDENCIES } from "./workspace-setup.schema";

export const SETUP_PHASE_STALE_MS = 5 * 60 * 1_000;
export const SETUP_BUILD_IDLE_MS = SETUP_PHASE_STALE_MS;
export const SETTLED_SETUP_PHASES: ReadonlySet<StoredSetupPhase["status"]> = new Set([
  "completed",
  "failed",
  "skipped",
  "stopped",
]);
const RETRYABLE_SETUP_PHASES: ReadonlySet<StoredSetupPhase["status"]> = new Set(["failed", "stopped"]);
const BACKGROUND_SETUP_PHASES: ReadonlySet<WorkspaceSetupPhase> = new Set(["knowledgeBase"]);
const FOREGROUND_SETUP_PHASES = WORKSPACE_SETUP_PHASES.filter((phase) => !BACKGROUND_SETUP_PHASES.has(phase));
const BUILT_SETUP_STATUSES: ReadonlySet<WorkspaceSetupRecord["status"]> = new Set(["completed", "failed"]);

export function setupPhaseOpen(status: WorkspaceSetupRecord["status"], phase: WorkspaceSetupPhase): boolean {
  return status === "building" || (BACKGROUND_SETUP_PHASES.has(phase) && BUILT_SETUP_STATUSES.has(status));
}

export function emptySetupPhase(): StoredSetupPhase {
  return {
    status: "pending",
    error: null,
    attempts: 0,
    retryFrom: 0,
    claimedAt: null,
    startedAt: null,
    finishedAt: null,
  };
}

export function setupPhaseStalled(state: StoredSetupPhase, now: Date): boolean {
  return (
    state.status === "running" &&
    (!state.claimedAt || new Date(state.claimedAt).getTime() <= now.getTime() - SETUP_PHASE_STALE_MS)
  );
}

export function withoutClaimToken({ claimToken: _claimToken, ...state }: StoredSetupPhase): StoredSetupPhase {
  return state;
}

function lastSetupActivity(setup: WorkspaceSetupRecord): number {
  const times = FOREGROUND_SETUP_PHASES.flatMap((phase) => {
    const state = setup.phases[phase];
    return state ? [state.claimedAt, state.startedAt, state.finishedAt] : [];
  }).flatMap((value) => (value ? [new Date(value).getTime()] : []));
  return Math.max(setup.confirmedAt?.getTime() ?? setup.startedAt.getTime(), ...times);
}

export function setupBuildStalled(setup: WorkspaceSetupRecord, now: Date): boolean {
  if (setup.status !== "building") return false;
  const states = FOREGROUND_SETUP_PHASES.map((phase) => setup.phases[phase] ?? emptySetupPhase());
  if (states.every((state) => SETTLED_SETUP_PHASES.has(state.status))) return false;
  if (states.some((state) => state.status === "running" && !setupPhaseStalled(state, now))) return false;
  return lastSetupActivity(setup) <= now.getTime() - SETUP_BUILD_IDLE_MS;
}

export function setupPhaseRetryable(setup: WorkspaceSetupRecord, phase: WorkspaceSetupPhase, now: Date): boolean {
  if (setup.status !== "failed" && !setupPhaseOpen(setup.status, phase)) return false;
  const state = setup.phases[phase];
  if (!state) return setupBuildStalled(setup, now);
  if (RETRYABLE_SETUP_PHASES.has(state.status) || setupPhaseStalled(state, now)) return true;
  return !SETTLED_SETUP_PHASES.has(state.status) && setupBuildStalled(setup, now);
}

export function settledSetupStatus(phases: StoredSetupPhases): "completed" | "failed" | null {
  const states = FOREGROUND_SETUP_PHASES.map((phase) => phases[phase]?.status ?? "pending");
  if (!states.every((state) => SETTLED_SETUP_PHASES.has(state))) return null;
  return states.every((state) => state === "completed" || state === "skipped") ? "completed" : "failed";
}

export function abandonedSetupPatch(
  setup: WorkspaceSetupRecord,
  now: Date,
  only: readonly WorkspaceSetupPhase[] = WORKSPACE_SETUP_PHASES,
  runId?: string,
): WorkspaceSetupPatch | null {
  const open = WORKSPACE_SETUP_PHASES.filter(
    (candidate) => only.includes(candidate) && setupPhaseOpen(setup.status, candidate),
  );
  if (open.length === 0) return null;
  const phases: StoredSetupPhases = { ...setup.phases };
  let changed = false;
  for (const phase of open) {
    const state = phases[phase] ?? emptySetupPhase();
    if (SETTLED_SETUP_PHASES.has(state.status)) continue;
    const ours = runId !== undefined && state.claimToken === runId;
    if (state.status === "running" && !ours && !setupPhaseStalled(state, now)) continue;
    const dependencies = WORKSPACE_SETUP_PHASE_DEPENDENCIES[phase].map(
      (dependency) => phases[dependency]?.status ?? "pending",
    );
    if (dependencies.some((status) => !SETTLED_SETUP_PHASES.has(status))) continue;
    phases[phase] = {
      ...withoutClaimToken(state),
      status: "failed",
      error: dependencies.every((status) => status === "completed") ? "error" : "dependency",
      claimedAt: null,
      finishedAt: now.toISOString(),
    };
    changed = true;
  }
  const status = setup.status === "building" ? settledSetupStatus(phases) : null;
  if (!changed && !status) return null;
  return { phases, ...(status ? { status, finishedAt: now } : {}) };
}
