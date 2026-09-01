import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  status: vi.fn(),
  platformAccess: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetOperatorUserDetailInteractor: () => ({ invoke: mocks.detail }),
  getUpdateOperatorUserStatusInteractor: () => ({ invoke: mocks.status }),
  getUpdateOperatorUserPlatformAccessInteractor: () => ({ invoke: mocks.platformAccess }),
  getCorrectOperatorSubscriptionSnapshotInteractor: () => ({ invoke: vi.fn() }),
  getCreateAgentCreditAdjustmentInteractor: () => ({ invoke: vi.fn() }),
  getResetOperatorUserCreditsInteractor: () => ({ invoke: vi.fn() }),
}));

import {
  getOperatorUserDetailAction,
  updateOperatorUserPlatformAccessAction,
  updateOperatorUserStatusAction,
} from "../actions";

const USER_ID = "22222222-2222-4222-8222-222222222222";

const user = { userId: USER_ID } as OperatorUserDetailDto;

describe("operator user server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the submitted data through and serializes a successful result", async () => {
    mocks.status.mockResolvedValueOnce({ ok: true, data: user });

    const result = await updateOperatorUserStatusAction({
      userId: USER_ID,
      status: "inactive",
    });

    expect(mocks.status).toHaveBeenCalledWith({
      userId: USER_ID,
      status: "inactive",
    });
    expect(result).toEqual({ ok: true, data: user });
  });

  it("serializes an interactor failure into an error tree instead of throwing", async () => {
    mocks.platformAccess.mockResolvedValueOnce({
      ok: false,
      error: createZodError("conflict", [], { error: CustomErrorCode.operatorConflict, kind: "conflict" }),
    });

    const result = await updateOperatorUserPlatformAccessAction({
      userId: USER_ID,
      isPlatformOperator: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(JSON.stringify(result.error)).toContain("conflict");
  });

  it("loads details using only the submitted opaque user ID", async () => {
    mocks.detail.mockResolvedValueOnce({ ok: true, data: user });

    await expect(getOperatorUserDetailAction({ userId: USER_ID })).resolves.toEqual({ ok: true, data: user });
    expect(mocks.detail).toHaveBeenCalledWith({ userId: USER_ID });
  });
});
