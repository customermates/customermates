import type { RootStore } from "@/core/stores/root.store";
import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";
import type { OperatorWorkspaceFormContext } from "../operator-workspace-forms.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ correct: vi.fn(), allowance: vi.fn() }));

vi.mock("../../users/actions", () => ({ correctOperatorSubscriptionSnapshotAction: mocks.correct }));
vi.mock("../actions", () => ({ updateOperatorEnterpriseAllowanceAction: mocks.allowance }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  OperatorWorkspaceAllowanceFormStore,
  OperatorWorkspaceSubscriptionFormStore,
} from "../operator-workspace-forms.store";

const USER_UPDATED_AT = "2026-08-29T09:00:00.000Z";
const SUBSCRIPTION_UPDATED_AT = "2026-08-28T11:00:00.000Z";

const owner = {
  userId: "a1260000-0000-4000-8000-000000000031",
  companyId: "c1260000-0000-4000-8000-000000000031",
  updatedAt: USER_UPDATED_AT,
  subscription: {
    plan: "enterprise",
    status: "active",
    quantity: 4,
    billingProviderManaged: false,
    updatedAt: SUBSCRIPTION_UPDATED_AT,
    enterpriseCreditsPerUser: 1230,
    agentCreditAnchorAt: null,
    trialEndDate: null,
    currentPeriodEnd: null,
  },
} as unknown as OperatorUserDetailDto;

const workspace = { id: owner.companyId, enterpriseCreditsPerUser: 1230 } as OperatorWorkspaceRowDto;

const rootStore = { localeStore: { getTranslation: (key: string) => key } } as unknown as RootStore;

function context(): OperatorWorkspaceFormContext {
  return {
    getWorkspace: () => workspace,
    getOwner: () => owner,
    applyOwner: vi.fn(),
    refreshWorkspaces: vi.fn(),
    refreshOwner: vi.fn(() => Promise.resolve()),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("operator workspace forms", () => {
  it("guards the subscription correction with the subscription's own timestamp", async () => {
    mocks.correct.mockResolvedValueOnce({ status: "success", data: owner });
    const store = new OperatorWorkspaceSubscriptionFormStore(rootStore, context());
    store.syncFromOwner(owner);
    store.onChange("status", "cancelled");
    store.onChange("reason", "Cancelled after the pilot ended");

    await store.onSubmit?.();

    expect(mocks.correct).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: SUBSCRIPTION_UPDATED_AT, status: "cancelled" }),
    );
  });

  it("reuses one operation ID until a correction succeeds", async () => {
    mocks.correct.mockResolvedValueOnce({ status: "error", errorCode: "unexpected" });
    mocks.correct.mockResolvedValueOnce({ status: "success", data: owner });
    const store = new OperatorWorkspaceSubscriptionFormStore(rootStore, context());
    store.syncFromOwner(owner);
    store.onChange("reason", "Cancelled after the pilot ended");

    await store.onSubmit?.();
    await store.onSubmit?.();

    const [first] = mocks.correct.mock.calls[0] as [{ operationId: string }];
    const [second] = mocks.correct.mock.calls[1] as [{ operationId: string }];
    expect(second.operationId).toBe(first.operationId);
  });

  it("clears the allowance form against the persisted company snapshot", async () => {
    mocks.allowance.mockResolvedValueOnce({
      status: "success",
      data: { companyId: workspace.id, subscription: { enterpriseCreditsPerUser: 1300 } },
    });
    const store = new OperatorWorkspaceAllowanceFormStore(rootStore, context());
    store.syncFromWorkspace(workspace);
    store.onChange("creditsPerUser", 1300);
    store.onChange("reason", "Contract uplift agreed with the customer");

    await store.onSubmit?.();

    expect(store.form).toEqual({ creditsPerUser: 1300, reason: "" });
    expect(store.hasUnsavedChanges).toBe(false);
  });
});
