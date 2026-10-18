import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env } }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

const { AbandonCheckoutInteractor } = await import("../abandon-checkout.interactor");
const { runWithTenant } = await import("@/core/decorators/tenant-context");

function makeInteractor() {
  const repo = { clearCheckoutStart: vi.fn().mockResolvedValue(undefined) };
  return { repo, interactor: new AbandonCheckoutInteractor(repo as never) };
}

function memberWith(actions: Action[]) {
  return {
    ...createMockUserWithPermissions(actions.map((action) => ({ resource: Resource.company, action }))),
    id: mockUser.id,
    companyId: mockUser.companyId,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("AbandonCheckoutInteractor", () => {
  it("clears the workspace's recorded checkout start for someone who manages billing", async () => {
    const { repo, interactor } = makeInteractor();

    const result = await runWithTenant(memberWith([Action.readOwn, Action.update]), () => interactor.invoke());

    expect(result).toEqual({ ok: true, data: null });
    expect(repo.clearCheckoutStart).toHaveBeenCalledOnce();
  });

  it("refuses a member who may only read the company, at the decorator", async () => {
    const { repo, interactor } = makeInteractor();

    await expect(
      runWithTenant(memberWith([Action.readOwn, Action.readAll]), () => interactor.invoke()),
    ).rejects.toThrow(/update on company/);
    expect(repo.clearCheckoutStart).not.toHaveBeenCalled();
  });
});
