import { beforeEach, describe, expect, it, vi } from "vitest";

import { createZodError } from "@/core/validation/validation.utils";

const invokes = vi.hoisted(() => ({
  activities: vi.fn(),
  activityThreadOptions: vi.fn(),
  connectedAccounts: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));

vi.mock("@/core/di", () => ({
  getGetActivitiesInteractor: () => ({ invoke: invokes.activities }),
  getGetActivityThreadOptionsInteractor: () => ({ invoke: invokes.activityThreadOptions }),
  getGetMyConnectedAccountsInteractor: () => ({ invoke: invokes.connectedAccounts }),
}));

import { getConnectedAccountsAction } from "../actions";

describe("protected filter option actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns connected-account failures as a typed result for the retry state", async () => {
    const error = createZodError("connected accounts unavailable");
    invokes.connectedAccounts.mockResolvedValueOnce({ error, ok: false });

    await expect(getConnectedAccountsAction()).resolves.toMatchObject({
      ok: false,
      failure: { issues: [{ message: "connected accounts unavailable" }] },
    });
  });

  it("returns a typed workspace change instead of throwing when the session's workspace changed", async () => {
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");
    invokes.connectedAccounts.mockRejectedValueOnce(new WorkspaceChangedError());

    await expect(getConnectedAccountsAction()).resolves.toMatchObject({
      ok: false,
      failure: { kind: "conflict", issues: [{ customCode: "workspaceChanged" }] },
    });
  });
});
