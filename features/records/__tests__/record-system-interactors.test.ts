import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ appMode: "cloud" }));
vi.mock("@/env", () => ({
  env: {
    get APP_MODE() {
      return state.appMode;
    },
  },
}));

import { isTenantGuardBypassed, runWithTenant } from "@/core/decorators/tenant-context";
import { DemoModeError } from "@/core/errors/app-errors";
import { createMockUser } from "@/tests/helpers/mock-user";
import { AdvanceProviderAvatarInteractor } from "../advance-provider-avatar.interactor";
import { FailRecordOperationInteractor } from "../fail-record-operation.interactor";

const companyId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const operationId = "00000000-0000-4000-8000-000000000003";

beforeEach(() => {
  state.appMode = "cloud";
});

describe("FailRecordOperationInteractor", () => {
  it("fails the owner's operation as the system, even from a tenant context", async () => {
    const failOperationUnscoped = vi.fn(() => {
      expect(isTenantGuardBypassed()).toBe(true);
      return Promise.resolve();
    });
    const interactor = new FailRecordOperationInteractor({ failOperationUnscoped });
    await interactor.invoke({ companyId, userId, operationId });
    await runWithTenant(createMockUser(), () => interactor.invoke({ companyId, userId, operationId }));
    expect(failOperationUnscoped).toHaveBeenCalledTimes(2);
    expect(failOperationUnscoped).toHaveBeenCalledWith({ companyId, userId, operationId });
  });

  it.each([
    { companyId: "invalid", userId, operationId },
    { companyId, userId: "invalid", operationId },
    { companyId, userId, operationId: "invalid" },
    { companyId, userId, operationId, extra: true },
  ])("rejects an invalid payload before storage", async (input) => {
    const failOperationUnscoped = vi.fn();
    await expect(async () =>
      new FailRecordOperationInteractor({ failOperationUnscoped }).invoke(input as never),
    ).rejects.toThrow();
    expect(failOperationUnscoped).not.toHaveBeenCalled();
  });

  it("keeps the demo restriction", async () => {
    state.appMode = "demo";
    const failOperationUnscoped = vi.fn();
    await expect(async () =>
      new FailRecordOperationInteractor({ failOperationUnscoped }).invoke({ companyId, userId, operationId }),
    ).rejects.toBeInstanceOf(DemoModeError);
    expect(failOperationUnscoped).not.toHaveBeenCalled();
  });
});

describe("AdvanceProviderAvatarInteractor", () => {
  const service = () => ({
    advance: vi.fn(() => {
      expect(isTenantGuardBypassed()).toBe(true);
      return Promise.resolve({ done: false });
    }),
    fail: vi.fn(() => Promise.resolve()),
  });

  it("advances and fails the company's avatar operation through the system entry", async () => {
    const avatars = service();
    const forCompany = vi.fn(() => avatars as never);
    const interactor = new AdvanceProviderAvatarInteractor(forCompany);
    expect(await interactor.invoke({ companyId, operationId, outcome: "advance" })).toEqual({ done: false });
    expect(await interactor.invoke({ companyId, operationId, outcome: "fail" })).toEqual({ done: true });
    expect(forCompany).toHaveBeenCalledWith(companyId);
    expect(avatars.advance).toHaveBeenCalledExactlyOnceWith(operationId);
    expect(avatars.fail).toHaveBeenCalledExactlyOnceWith(operationId);
  });

  it("rejects an invalid payload before resolving the service", async () => {
    const forCompany = vi.fn();
    await expect(async () =>
      new AdvanceProviderAvatarInteractor(forCompany).invoke({ companyId: "x", operationId, outcome: "advance" }),
    ).rejects.toThrow();
    expect(forCompany).not.toHaveBeenCalled();
  });
});
