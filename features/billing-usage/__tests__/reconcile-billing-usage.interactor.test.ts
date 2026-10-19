import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

import { ReconcileBillingUsageInteractor } from "../reconcile-billing-usage.interactor";
import { ReconcileWorkspaceBillingUsageInteractor } from "../reconcile-workspace-billing-usage.interactor";

const first = "1b0f8f0e-41a4-4a8f-9c1e-7d3c56f4e001";
const second = "1b0f8f0e-41a4-4a8f-9c1e-7d3c56f4e002";

describe("billing usage reconciliation", () => {
  it("pages through every recorded workspace and starts one reconciliation per workspace", async () => {
    const companies = Array.from({ length: 200 }, (_, index) => `${index}`.padStart(3, "0"));
    const findWorkspacesToReconcileUnscoped = vi
      .fn()
      .mockResolvedValueOnce(companies)
      .mockResolvedValueOnce([first, second]);
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const sweep = new ReconcileBillingUsageInteractor(
      { findWorkspacesToReconcileUnscoped, reconcileWorkspaceUnscoped: vi.fn() },
      { dispatch },
    );

    await expect(sweep.invoke()).resolves.toEqual({ dispatched: 202 });
    expect(findWorkspacesToReconcileUnscoped.mock.calls).toEqual([
      [null, 200],
      ["199", 200],
    ]);
    expect(dispatch).toHaveBeenLastCalledWith("reconcile-billing-usage", { companyId: second });
  });

  it("reconciles one workspace and rejects an invalid workspace id", async () => {
    const reconcileWorkspaceUnscoped = vi.fn().mockResolvedValue(undefined);
    const reconcile = new ReconcileWorkspaceBillingUsageInteractor({
      findWorkspacesToReconcileUnscoped: vi.fn(),
      reconcileWorkspaceUnscoped,
    });

    await reconcile.invoke({ companyId: first });
    await expect(async () => reconcile.invoke({ companyId: "not-a-workspace" })).rejects.toThrow();
    expect(reconcileWorkspaceUnscoped.mock.calls).toEqual([[first]]);
  });
});
