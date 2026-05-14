import { describe, it, expect, vi, beforeEach } from "vitest";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));

import { RecalculateCompanyWidgetsInteractor } from "../recalculate-company-widgets.interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";

const COMPANY_ID = "00000000-0000-4000-8000-00000000000a";

describe("RecalculateCompanyWidgetsInteractor", () => {
  let userRepo: { findActiveWidgetOwnersInCompany: ReturnType<typeof vi.fn> };
  let widgetService: { recalculateUserWidgets: ReturnType<typeof vi.fn<() => Promise<void>>> };
  let interactor: RecalculateCompanyWidgetsInteractor;

  beforeEach(() => {
    userRepo = { findActiveWidgetOwnersInCompany: vi.fn() };
    widgetService = { recalculateUserWidgets: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
    interactor = new RecalculateCompanyWidgetsInteractor(userRepo as never, widgetService as never);
  });

  it("returns recalculatedOwners: 0 when no active widget owners exist", async () => {
    userRepo.findActiveWidgetOwnersInCompany.mockResolvedValue([]);

    const result = await interactor.invoke({ companyId: COMPANY_ID });

    expect(result).toEqual({ ok: true, recalculatedOwners: 0 });
    expect(widgetService.recalculateUserWidgets).not.toHaveBeenCalled();
  });

  it("runs recalc once per active widget owner, scoped to that owner's tenant", async () => {
    const owners = [
      createMockUser({ id: "owner-a", companyId: COMPANY_ID }),
      createMockUser({ id: "owner-b", companyId: COMPANY_ID }),
      createMockUser({ id: "owner-c", companyId: COMPANY_ID }),
    ];
    userRepo.findActiveWidgetOwnersInCompany.mockResolvedValue(owners);

    const tenantUsersDuringRecalc: string[] = [];
    widgetService.recalculateUserWidgets.mockImplementation(() => {
      tenantUsersDuringRecalc.push(getTenantUser().id);
      return Promise.resolve();
    });

    const result = await interactor.invoke({ companyId: COMPANY_ID });

    expect(result).toEqual({ ok: true, recalculatedOwners: 3 });
    expect(widgetService.recalculateUserWidgets).toHaveBeenCalledTimes(3);
    expect(tenantUsersDuringRecalc).toEqual(["owner-a", "owner-b", "owner-c"]);
  });

  it("aborts remaining owners when a per-owner recalc throws (sequential for-await)", async () => {
    const owners = [
      createMockUser({ id: "owner-a", companyId: COMPANY_ID }),
      createMockUser({ id: "owner-b", companyId: COMPANY_ID }),
      createMockUser({ id: "owner-c", companyId: COMPANY_ID }),
    ];
    userRepo.findActiveWidgetOwnersInCompany.mockResolvedValue(owners);

    let callCount = 0;
    widgetService.recalculateUserWidgets.mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error("recalc failed for owner-b"));
      return Promise.resolve();
    });

    await expect(interactor.invoke({ companyId: COMPANY_ID })).rejects.toThrow("recalc failed for owner-b");
    expect(widgetService.recalculateUserWidgets).toHaveBeenCalledTimes(2);
  });
});
