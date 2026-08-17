import type { RoleDto } from "../role.schema";
import type { EventService } from "@/features/event/event.service";
import type { ValidateRoleIdsInteractor } from "@/core/validation/validators/validate-role-ids.interactor";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Resource, Action } from "@/generated/prisma";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const OWN_ROLE_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_ROLE_ID = "20000000-0000-4000-8000-000000000002";
const SYSTEM_ROLE_ID = "20000000-0000-4000-8000-000000000003";

const mockUser = createMockUser({
  roleId: OWN_ROLE_ID,
  role: {
    id: OWN_ROLE_ID,
    name: "Member Admin",
    description: null,
    isSystemRole: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    permissions: [
      { id: "perm-create", resource: Resource.users, action: Action.create },
      { id: "perm-update", resource: Resource.users, action: Action.update },
    ],
  },
});

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));

import { UpsertRoleInteractor, UpsertRoleRepo, type UpsertRoleData } from "../upsert-role.interactor";

const roleDto = (id: string, isSystemRole = false): RoleDto => ({
  id,
  name: "Member Admin",
  description: "Manages members",
  isSystemRole,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  permissions: [],
});

class MockRepo extends UpsertRoleRepo {
  isSystemRoleOrThrow = vi.fn((id: string) => Promise.resolve(id === SYSTEM_ROLE_ID));
  upsertRoleOrThrow = vi.fn((data: UpsertRoleData) => Promise.resolve(roleDto(data.id ?? OTHER_ROLE_ID)));
  getRoleByIdOrThrow = vi.fn((id: string) => Promise.resolve(roleDto(id)));
}

const escalatingPermissions = (): UpsertRoleData["permissions"] => ({
  contacts: { canManage: "yes", readAccess: "all" },
  deals: { canManage: "yes", readAccess: "all" },
  organizations: { canManage: "yes", readAccess: "all" },
  services: { canManage: "yes", readAccess: "all" },
  users: { canManage: "yes", readAccess: "all" },
  company: { canManage: "yes" },
  api: { canManage: "yes", readAccess: "all" },
  tasks: { canManage: "yes", readAccess: "all" },
  inboxMessages: { canManage: "yes", readAccess: "all" },
  auditLog: { readAccess: "all" },
});

const payload = (id?: string): UpsertRoleData => ({
  id,
  name: "Member Admin",
  description: "Manages members",
  permissions: escalatingPermissions(),
});

const invoke = (repo: MockRepo, data: UpsertRoleData) => {
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventService;
  const validator = { invoke: vi.fn() } as unknown as ValidateRoleIdsInteractor;

  return runWithTenant(mockUser, () => new UpsertRoleInteractor(repo, eventService, validator).invoke(data));
};

beforeEach(() => vi.clearAllMocks());

describe("UpsertRoleInteractor self-escalation guard", () => {
  it("refuses to update the role the caller currently holds", async () => {
    const repo = new MockRepo();

    const result = await invoke(repo, payload(OWN_ROLE_ID));

    expect(result.ok).toBe(false);
    expect(repo.upsertRoleOrThrow).not.toHaveBeenCalled();
  });

  it("still updates a different non-system role", async () => {
    const repo = new MockRepo();

    const result = await invoke(repo, payload(OTHER_ROLE_ID));

    expect(result.ok).toBe(true);
    expect(repo.upsertRoleOrThrow).toHaveBeenCalledOnce();
  });

  it("still refuses a system role", async () => {
    const repo = new MockRepo();

    await expect(invoke(repo, payload(SYSTEM_ROLE_ID))).rejects.toThrow("Cannot update system roles");
    expect(repo.upsertRoleOrThrow).not.toHaveBeenCalled();
  });

  it("still creates a new role when no id is supplied", async () => {
    const repo = new MockRepo();

    const result = await invoke(repo, payload(undefined));

    expect(result.ok).toBe(true);
    expect(repo.upsertRoleOrThrow).toHaveBeenCalledOnce();
  });
});
