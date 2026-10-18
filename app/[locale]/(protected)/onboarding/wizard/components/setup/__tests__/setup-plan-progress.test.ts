import { describe, expect, it } from "vitest";

import { PLAN_EXPECTED_MS, planProgress } from "../setup-plan-progress";
import { PLAN_PROGRESS, setupView } from "./setup-view-fixture";

const queuedAt = "2026-10-18T09:00:00.000Z";
const start = Date.parse(queuedAt);

function planning(parts: Partial<typeof PLAN_PROGRESS.parts>, status: "queued" | "running" = "running") {
  return setupView({
    status: "planning",
    plan: { status, error: null, revision: 1, plan: null, queuedAt, parts: { ...PLAN_PROGRESS.parts, ...parts } },
  });
}

describe("plan progress", () => {
  it("starts with reading the answers while the plan is queued", () => {
    const progress = planProgress(planning({}, "queued"), start + 2_000, start);
    expect(progress.steps.map((step) => step.state)).toEqual(["active", "waiting", "waiting", "waiting"]);
    expect(progress.percent).toBeLessThanOrEqual(10);
  });

  it("moves with the time but never past the part that is still running", () => {
    const early = planProgress(planning({ model: "running", knowledge: "running" }), start + 20_000, start);
    const late = planProgress(planning({ model: "running", knowledge: "done" }), start + 80_000, start);
    expect(early.steps.map((step) => step.state)).toEqual(["done", "active", "active", "waiting"]);
    expect(early.percent).toBeGreaterThan(10);
    expect(late.percent).toBe(55);
    expect(late.remainingMs).toBe(PLAN_EXPECTED_MS - 80_000);
  });

  it("jumps ahead once the record model is planned and reports a late plan as overdue", () => {
    const views = planProgress(
      planning({ model: "done", knowledge: "done", views: "running" }),
      start + PLAN_EXPECTED_MS + 5_000,
      start,
    );
    expect(views.percent).toBe(95);
    expect(views.overdue).toBe(true);
    expect(views.remainingMs).toBe(0);
  });

  it("counts from the first look when the queue time is missing", () => {
    const progress = planProgress(
      setupView({
        status: "planning",
        plan: { status: "running", error: null, revision: 1, plan: null, ...PLAN_PROGRESS },
      }),
      start + 30_000,
      start,
    );
    expect(progress.remainingMs).toBe(PLAN_EXPECTED_MS - 30_000);
  });
});
