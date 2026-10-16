import { describe, expect, it, vi } from "vitest";

import type { BillingUsageLedger } from "../get/get-operator-billing-usage.repo";

vi.mock("@/core/decorators/operator-interactor.decorator", () => ({ OperatorReadInteractor: () => undefined }));
vi.mock("@/core/decorators/validate-output.decorator", () => ({ ValidateOutput: () => undefined }));
vi.mock("@/core/validation/zod-error-map-server", () => ({ getZodParseContext: () => Promise.resolve(undefined) }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { GetOperatorBillingUsageInteractor } from "../get/get-operator-billing-usage.interactor";

const LIVE = "00000000-0000-4000-8000-000000000031";
const DELETED_IN_MONTH = "00000000-0000-4000-8000-000000000032";
const DELETED_BEFORE = "00000000-0000-4000-8000-000000000033";
const CREATED_LATER = "00000000-0000-4000-8000-000000000034";

function workspace(companyId: string, createdAt: string, deletedAt: string | null, workspaceLabel: string) {
  return {
    companyId,
    workspaceLabel,
    createdAt: new Date(createdAt),
    deletedAt: deletedAt ? new Date(deletedAt) : null,
    seatsRecordedFrom: null,
    channelsRecordedFrom: null,
    activeSeats: 1,
    connectedChannels: 0,
  };
}

const ledger: BillingUsageLedger = {
  workspaces: [
    workspace(LIVE, "2026-01-01T00:00:00.000Z", null, "b.example.invalid"),
    workspace(DELETED_IN_MONTH, "2026-01-01T00:00:00.000Z", "2026-09-10T00:00:00.000Z", "a.example.invalid"),
    workspace(DELETED_BEFORE, "2026-01-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z", "c.example.invalid"),
    workspace(CREATED_LATER, "2026-10-02T00:00:00.000Z", null, "d.example.invalid"),
  ],
  intervals: [
    {
      companyId: DELETED_IN_MONTH,
      kind: "seat",
      subjectId: "user-1",
      startedAt: new Date("2026-02-01T00:00:00.000Z"),
      endedAt: new Date("2026-09-10T00:00:00.000Z"),
      startExact: true,
      endExact: true,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@a.example.invalid",
      roleName: "Admin",
      provider: null,
      identifier: null,
    },
  ],
};

function interactor(readBillingUsageLedgerUnscoped = vi.fn(() => Promise.resolve(ledger))) {
  return {
    read: readBillingUsageLedgerUnscoped,
    interactor: new GetOperatorBillingUsageInteractor({ readBillingUsageLedgerUnscoped }),
  };
}

describe("GetOperatorBillingUsageInteractor", () => {
  it("summarizes every workspace that existed in the month, including one deleted during it", async () => {
    const { interactor: subject, read } = interactor();

    const result = await subject.invoke({ month: "2026-09" });

    expect(read).toHaveBeenCalledWith({ companyId: undefined, before: new Date("2026-10-01T00:00:00.000Z") });
    if (!result.ok) throw new Error("expected usage");
    expect(result.data.workspaces.map((entry) => entry.companyId)).toEqual([DELETED_IN_MONTH, LIVE]);
    expect(result.data.workspaces[0]).toMatchObject({ seats: { count: 1 }, current: { activeSeats: 0 } });
    expect(result.data.workspaces[0].seats.users).toBeUndefined();
    expect(result.data.monthComplete).toBe(true);
  });

  it("returns per-user detail for one workspace, even a deleted one", async () => {
    const { interactor: subject } = interactor();

    const result = await subject.invoke({ month: "2026-09", companyId: DELETED_IN_MONTH });

    if (!result.ok) throw new Error("expected usage");
    expect(result.data.workspaces).toHaveLength(1);
    expect(result.data.workspaces[0].seats.users?.[0]).toMatchObject({
      email: "ada@a.example.invalid",
      roleName: "Admin",
    });
  });

  it("fails with not found for an unknown workspace", async () => {
    const { interactor: subject } = interactor(vi.fn(() => Promise.resolve({ workspaces: [], intervals: [] })));

    const result = await subject.invoke({ month: "2026-09", companyId: "00000000-0000-4000-8000-000000000099" });

    expect(result.ok).toBe(false);
  });

  it("returns a validation failure for a malformed month without reading the ledger", async () => {
    const { interactor: subject, read } = interactor();

    const result = await subject.invoke({ month: "2026-9" });

    expect(result.ok).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
