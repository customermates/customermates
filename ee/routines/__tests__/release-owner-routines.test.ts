import { describe, expect, it, vi } from "vitest";

import { ReleaseOwnerRoutinesInteractor } from "../release-owner-routines.interactor";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const OWNER = "00000000-0000-4000-8000-000000000010";
const NOW = new Date("2026-11-16T08:00:00.000Z");

function setup() {
  const calls: string[] = [];
  const reconcile = {
    invoke: vi.fn(() => {
      calls.push("reconcile");
      return Promise.resolve(undefined);
    }),
  };
  const repo = {
    blockPendingRoutineRunsForOwnerUnscoped: vi.fn(() => {
      calls.push("block");
      return Promise.resolve(2);
    }),
    disableRoutinesForOwnerUnscoped: vi.fn(() => {
      calls.push("routines");
      return Promise.resolve(3);
    }),
  };
  const rules = {
    disableOwnerRulesUnscoped: vi.fn(() => {
      calls.push("rules");
      return Promise.resolve(4);
    }),
  };
  const interactor = new ReleaseOwnerRoutinesInteractor(repo, reconcile as never, rules);
  return { calls, repo, rules, interactor };
}

describe("releasing everything an unavailable owner runs", () => {
  it("blocks the owner's runs and switches off their routines and automation rules", async () => {
    const { calls, repo, rules, interactor } = setup();

    expect(await interactor.invoke({ companyId: COMPANY, ownerUserId: OWNER, now: NOW })).toEqual({
      blocked: 2,
      disabled: 3,
      rulesDisabled: 4,
    });
    expect(calls).toEqual(["reconcile", "block", "routines", "rules"]);
    expect(repo.disableRoutinesForOwnerUnscoped).toHaveBeenCalledWith({
      companyId: COMPANY,
      ownerUserId: OWNER,
      now: NOW,
    });
    expect(rules.disableOwnerRulesUnscoped).toHaveBeenCalledExactlyOnceWith(COMPANY, OWNER, "ownerInactive");
  });
});
