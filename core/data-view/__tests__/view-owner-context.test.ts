import type { TenantUser } from "@/features/user/user.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const operatorUser = createMockUser({ id: "operator-user", companyId: "operator-company" });
const { getActiveUserByIdOrThrow } = vi.hoisted(() => ({ getActiveUserByIdOrThrow: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/di", () => ({ getUserService: () => ({ getActiveUserByIdOrThrow }) }));

import { runAsViewOwner } from "../view-owner-context";
import { getTenantUser, runWithTenant, tenantStorage } from "@/core/decorators/tenant-context";
import { runWithOperator } from "@/core/decorators/operator-context";

const ambientUser = createMockUser({ id: "tenant-user", companyId: "tenant-company" });

const OPERATOR_ACTOR = {
  authUserId: "auth-operator",
  userId: operatorUser.id,
  companyId: operatorUser.companyId,
  email: "operator@example.invalid",
};

describe("runAsViewOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveUserByIdOrThrow.mockResolvedValue(operatorUser);
  });

  it("runs inside the ambient tenant frame without resolving a user again", async () => {
    const seen = await runWithTenant(ambientUser, () => runAsViewOwner(() => Promise.resolve(getTenantUser())));

    expect(seen.id).toBe(ambientUser.id);
    expect(getActiveUserByIdOrThrow).not.toHaveBeenCalled();
  });

  it("resolves the operator's own user and establishes a tenant frame carrying their companyId", async () => {
    const seen: TenantUser = await runWithOperator(OPERATOR_ACTOR, () =>
      runAsViewOwner(() => Promise.resolve(getTenantUser())),
    );

    expect(getActiveUserByIdOrThrow).toHaveBeenCalledWith(OPERATOR_ACTOR.userId);
    expect(seen.companyId).toBe(operatorUser.companyId);
    expect(seen.id).toBe(operatorUser.id);
  });

  it("throws with neither a tenant frame nor an operator actor", async () => {
    await expect(runAsViewOwner(() => Promise.resolve("unreachable"))).rejects.toThrow("View owner context missing");
  });

  it("never leaves a data-view read unwrapped under an operator request", async () => {
    const reached = await runWithOperator(OPERATOR_ACTOR, async () => {
      const before = tenantStorage.getStore();
      const inside = await runAsViewOwner(() => Promise.resolve(tenantStorage.getStore()));

      return { before, inside };
    });

    expect(reached.before).toBeUndefined();
    expect(reached.inside?.user?.companyId).toBe(operatorUser.companyId);
    expect(reached.inside?.bypass).toBe(false);
  });
});
