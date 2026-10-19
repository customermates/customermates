import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { runWithTenant } from "@/core/decorators/tenant-context";
import { GetWorkspaceLeaveInteractor } from "../get-workspace-leave.interactor";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const admin = createMockUser({ id: "admin-1", companyId: COMPANY_ID, status: Status.active });

describe("GetWorkspaceLeaveInteractor", () => {
  let repo: {
    strandsLastPlatformOperatorCompanyWide: ReturnType<typeof vi.fn>;
    leaveCompanyWide: ReturnType<typeof vi.fn>;
  };
  let roleRepo: { hasAnotherActiveSystemRoleUser: ReturnType<typeof vi.fn> };

  function leave(user = admin) {
    return runWithTenant(user, () => new GetWorkspaceLeaveInteractor(repo as never, roleRepo as never).invoke());
  }

  beforeEach(() => {
    repo = { strandsLastPlatformOperatorCompanyWide: vi.fn().mockResolvedValue(false), leaveCompanyWide: vi.fn() };
    roleRepo = { hasAnotherActiveSystemRoleUser: vi.fn().mockResolvedValue(true) };
  });

  it("lets an admin leave while another active admin stays", async () => {
    expect(await leave()).toEqual({ ok: true, data: { companyId: COMPANY_ID, refusal: null } });
    expect(roleRepo.hasAnotherActiveSystemRoleUser).toHaveBeenCalledWith("admin-1");
  });

  it("names the only active admin before they open the dialog", async () => {
    roleRepo.hasAnotherActiveSystemRoleUser.mockResolvedValue(false);

    expect(await leave()).toEqual({ ok: true, data: { companyId: COMPANY_ID, refusal: "lastAdmin" } });
    expect(repo.leaveCompanyWide).not.toHaveBeenCalled();
  });

  it("names the last platform operator's only active membership, which cannot be left", async () => {
    repo.strandsLastPlatformOperatorCompanyWide.mockResolvedValue(true);

    expect(await leave()).toMatchObject({ ok: true, data: { refusal: "platformOperator" } });
  });

  it("never blocks a member without the admin role", async () => {
    const member = createMockUser({
      id: "member-1",
      companyId: COMPANY_ID,
      status: Status.active,
      role: admin.role ? { ...admin.role, isSystemRole: false } : null,
    });
    roleRepo.hasAnotherActiveSystemRoleUser.mockResolvedValue(false);

    expect(await leave(member)).toMatchObject({ ok: true, data: { refusal: null } });
  });
});
