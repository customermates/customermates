import { describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => sentry);
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

import { ReconcileBillingUsageInteractor } from "../reconcile-billing-usage.interactor";

describe("ReconcileBillingUsageInteractor", () => {
  it("reconciles every workspace and closes vanished ones even when one workspace fails", async () => {
    const reconcileCompanyUnscoped = vi.fn((companyId: string) =>
      companyId === "broken" ? Promise.reject(new Error("boom")) : Promise.resolve(),
    );
    const closeMissingWorkspaceUnscoped = vi.fn(() => Promise.resolve());
    const interactor = new ReconcileBillingUsageInteractor({
      listCompanyIdsUnscoped: () => Promise.resolve(["a", "broken", "c"]),
      listRecordedWorkspacesWithoutCompanyUnscoped: () => Promise.resolve(["gone"]),
      reconcileCompanyUnscoped,
      closeMissingWorkspaceUnscoped,
    });

    await expect(interactor.invoke()).resolves.toEqual({ workspaces: 3, closed: 1, failed: 1 });
    expect(reconcileCompanyUnscoped.mock.calls.map(([companyId]) => companyId)).toEqual(["a", "broken", "c"]);
    expect(closeMissingWorkspaceUnscoped).toHaveBeenCalledWith("gone");
    expect(sentry.captureException).toHaveBeenCalledOnce();
  });
});
