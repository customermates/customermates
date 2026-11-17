import { beforeEach, describe, expect, it, vi } from "vitest";

const ruleActions = vi.hoisted(() => ({ setAutomationRuleEnabledAction: vi.fn() }));
const routineActions = vi.hoisted(() => ({ pauseRoutineAction: vi.fn(), upsertRoutineAction: vi.fn() }));

vi.mock("../actions", () => ruleActions);
vi.mock("../../routines/actions", () => routineActions);

import { canDeleteAutomation, canToggleAutomation, toggleAutomation } from "../components/automation-row-actions";

const ME = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ID = "20000000-0000-4000-8000-000000000001";

const member = { userId: ME, isAdmin: false, canUpdate: true, canDelete: true };
const admin = { ...member, isAdmin: true };

function row(kind: "rule" | "routine", ownerUserId: string | null, enabled = true) {
  return { id: ID, kind, enabled, ownerUserId };
}

describe("automation row actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ruleActions.setAutomationRuleEnabledAction.mockResolvedValue({ ok: true });
    routineActions.pauseRoutineAction.mockResolvedValue({ ok: true });
    routineActions.upsertRoutineAction.mockResolvedValue({ ok: true });
  });

  it("pauses another member's routine through the admin pause action, not the owner-only upsert", async () => {
    expect(canToggleAutomation(row("routine", OTHER), admin)).toBe(true);

    await toggleAutomation(row("routine", OTHER), false, admin);

    expect(routineActions.pauseRoutineAction).toHaveBeenCalledWith({ id: ID });
    expect(routineActions.upsertRoutineAction).not.toHaveBeenCalled();
  });

  it("keeps the owner's own switch on the upsert in both directions", async () => {
    await toggleAutomation(row("routine", ME), false, member);
    await toggleAutomation(row("routine", ME, false), true, member);

    expect(routineActions.upsertRoutineAction.mock.calls).toEqual([
      [{ id: ID, enabled: false }],
      [{ id: ID, enabled: true }],
    ]);
    expect(routineActions.pauseRoutineAction).not.toHaveBeenCalled();
  });

  it("switches a rule through its own enable action whoever owns it", async () => {
    await toggleAutomation(row("rule", OTHER), false, admin);

    expect(ruleActions.setAutomationRuleEnabledAction).toHaveBeenCalledWith({ id: ID, enabled: false });
    expect(routineActions.pauseRoutineAction).not.toHaveBeenCalled();
  });

  it("offers the switch to the owner, and to an admin only for pausing", () => {
    expect(canToggleAutomation(row("routine", ME, false), member)).toBe(true);
    expect(canToggleAutomation(row("routine", OTHER), member)).toBe(false);
    expect(canToggleAutomation(row("routine", OTHER, false), admin)).toBe(false);
    expect(canToggleAutomation(row("rule", null), admin)).toBe(true);
    expect(canToggleAutomation(row("routine", ME), { ...member, canUpdate: false })).toBe(false);
  });

  it("offers Delete only where the server accepts it", () => {
    expect(canDeleteAutomation(row("routine", ME), member)).toBe(false);
    expect(canDeleteAutomation(row("routine", OTHER), admin)).toBe(true);
    expect(canDeleteAutomation(row("rule", ME), member)).toBe(true);
    expect(canDeleteAutomation(row("rule", OTHER), member)).toBe(false);
    expect(canDeleteAutomation(row("rule", OTHER), admin)).toBe(true);
    expect(canDeleteAutomation(row("rule", null), member)).toBe(false);
    expect(canDeleteAutomation(row("rule", ME), { ...member, canDelete: false })).toBe(false);
  });
});
