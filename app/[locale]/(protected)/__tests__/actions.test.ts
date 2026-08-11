import { beforeEach, describe, expect, it, vi } from "vitest";

import { createZodError } from "@/core/validation/validation.utils";

const invokes = vi.hoisted(() => ({
  activities: vi.fn(),
  activityThreadOptions: vi.fn(),
  connectedAccounts: vi.fn(),
  resolveFilterOptions: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetActivitiesInteractor: () => ({ invoke: invokes.activities }),
  getGetActivityThreadOptionsInteractor: () => ({ invoke: invokes.activityThreadOptions }),
  getGetMyConnectedAccountsInteractor: () => ({ invoke: invokes.connectedAccounts }),
  getResolveFilterOptionsInteractor: () => ({ invoke: invokes.resolveFilterOptions }),
}));

import { getActivityThreadOptionsAction, getConnectedAccountsAction } from "../actions";

describe("protected filter option actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("propagates activity-thread option failures to the retry state", async () => {
    const error = createZodError("activity options unavailable");
    invokes.activityThreadOptions.mockResolvedValueOnce({ error, ok: false });

    await expect(getActivityThreadOptionsAction({})).rejects.toBe(error);
  });

  it("propagates connected-account failures to the retry state", async () => {
    const error = createZodError("connected accounts unavailable");
    invokes.connectedAccounts.mockResolvedValueOnce({ error, ok: false });

    await expect(getConnectedAccountsAction()).rejects.toBe(error);
  });
});
