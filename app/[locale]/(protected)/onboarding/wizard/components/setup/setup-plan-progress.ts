import type { WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";

export const PLAN_EXPECTED_MS = 90_000;

const PLAN_STEPS = ["answers", "model", "knowledge", "views"] as const;
export type PlanStep = (typeof PLAN_STEPS)[number];
type PlanStepState = "done" | "active" | "waiting";

type PlanProgress = {
  remainingMs: number;
  overdue: boolean;
  steps: Array<{ key: PlanStep; state: PlanStepState }>;
};

const PART_STATES = { done: "done", running: "active", waiting: "waiting" } as const;

export function planProgress(setup: WorkspaceSetupView, now: number, seenAt: number): PlanProgress {
  const queuedAt = setup.plan.queuedAt ? Date.parse(setup.plan.queuedAt) : Number.NaN;
  const elapsed = Math.max(0, now - (Number.isNaN(queuedAt) ? seenAt : Math.min(queuedAt, seenAt)));
  const parts = setup.plan.parts;
  const reading = setup.interview.followUps === "queued" || setup.interview.followUps === "running";
  const started = setup.plan.status === "running";
  const steps = PLAN_STEPS.map((key) => {
    if (key === "answers") return { key, state: reading || !started ? "active" : "done" } as const;
    return { key, state: PART_STATES[parts[key]] };
  });
  return {
    remainingMs: Math.max(0, PLAN_EXPECTED_MS - elapsed),
    overdue: elapsed > PLAN_EXPECTED_MS,
    steps,
  };
}
