import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/core/errors/app-errors";

const mocks = vi.hoisted(() => ({
  authorizeRead: vi.fn(),
  ledgerReads: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));
vi.mock("@/core/di", async () => {
  const { GetOperatorBillingUsageInteractor } = await import("@/ee/operator/get/get-operator-billing-usage.interactor");

  return {
    getOperatorAccessService: () => ({ authorizeRead: mocks.authorizeRead }),
    getGetOperatorBillingUsageInteractor: () =>
      new GetOperatorBillingUsageInteractor({ readBillingUsageLedgerUnscoped: mocks.ledgerReads }),
    getDeleteOperatorWorkspaceInteractor: () => ({ invoke: vi.fn() }),
    getUpdateHostedAiEnterpriseAllowanceInteractor: () => ({ invoke: vi.fn() }),
    getUpdateOperatorSubscriptionTermsInteractor: () => ({ invoke: vi.fn() }),
    getGetOperatorWorkspaceStatsInteractor: () => ({ invoke: vi.fn() }),
    getUpdateOperatorWorkspaceTagsInteractor: () => ({ invoke: vi.fn() }),
  };
});

import { getOperatorBillingUsageAction } from "../actions";

const COMPANY_ID = "00000000-0000-4000-8000-000000000020";

describe("operator workspace server actions", () => {
  beforeEach(() => {
    mocks.authorizeRead.mockReset().mockRejectedValue(new ForbiddenError("Platform operator access required"));
    mocks.ledgerReads.mockReset().mockResolvedValue({ workspaces: [], intervals: [], recordingStartedAt: null });
  });

  it("refuses the workspace usage action for a non-operator with a permission failure", async () => {
    const result = await getOperatorBillingUsageAction({ month: "2026-09", companyId: COMPANY_ID });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain("permissionDenied");
    expect(mocks.ledgerReads).not.toHaveBeenCalled();
  });

  it("serves the usage once the operator guard admits the caller", async () => {
    mocks.authorizeRead.mockResolvedValue({
      authUserId: "auth-id",
      userId: "user-id",
      companyId: "company-id",
      email: "operator@example.invalid",
    });

    const result = await getOperatorBillingUsageAction({ month: "2026-09" });

    expect(result).toMatchObject({ ok: true, data: { month: "2026-09", workspaces: [] } });
    expect(mocks.ledgerReads).toHaveBeenCalledOnce();
  });
});
