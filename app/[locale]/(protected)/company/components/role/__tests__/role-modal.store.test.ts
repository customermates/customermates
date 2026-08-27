import type { RootStore } from "@/core/stores/root.store";
import type { RoleDto } from "@/features/role/get-roles.interactor";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleDtoSchema } from "@/features/role/role.schema";

const companyActions = vi.hoisted(() => ({
  deleteRoleAction: vi.fn(),
  upsertRoleAction: vi.fn(),
}));

vi.mock("../../../actions", () => companyActions);

import { RoleModalStore } from "../role-modal.store";

function makeRole(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Sales Manager",
    description: "Manages the sales pipeline",
    isSystemRole: false,
    hasUsersAssigned: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    permissions: [],
    ...overrides,
  };
}

function makeStore(role: RoleDto, signedInRoleId: string | null = null): RoleModalStore {
  const rolesStore = {
    items: [role],
    removeItem: vi.fn(),
    upsertItem: vi.fn((nextRole: RoleDto) => {
      const index = rolesStore.items.findIndex((item) => item.id === nextRole.id);
      if (index >= 0) rolesStore.items[index] = nextRole;
      else rolesStore.items.push(nextRole);
      return Promise.resolve();
    }),
  };
  const rootStore = {
    registerModalStore: vi.fn(),
    rolesStore,
    userStore: {
      user: signedInRoleId ? { roleId: signedInRoleId } : null,
      canManage: vi.fn().mockReturnValue(true),
    },
  } as unknown as RootStore;
  const store = new RoleModalStore(rootStore);
  store.setRole(role);

  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RoleModalStore delete availability", () => {
  it("hides Delete when the role is still assigned to a user", () => {
    const store = makeStore(makeRole({ hasUsersAssigned: true }));

    expect(store.hasUsersAssigned).toBe(true);
    expect(store.canDeleteRole).toBe(false);
  });

  it("offers Delete for an unassigned custom role", () => {
    const store = makeStore(makeRole());

    expect(store.hasUsersAssigned).toBe(false);
    expect(store.canDeleteRole).toBe(true);
  });

  it("never offers Delete for a system role", () => {
    const store = makeStore(makeRole({ isSystemRole: true }));

    expect(store.isReadOnly).toBe(true);
    expect(store.isDisabledOrSystemRole).toBe(true);
    expect(store.canDeleteRole).toBe(false);
  });

  it("never submits a system role", async () => {
    const store = makeStore(makeRole({ isSystemRole: true }));

    await store.onSubmit();

    expect(companyActions.upsertRoleAction).not.toHaveBeenCalled();
  });

  it("preserves the assignment guard after saving an assigned role", async () => {
    const role = makeRole({ hasUsersAssigned: true });
    const savedRole = RoleDtoSchema.parse(role);
    companyActions.upsertRoleAction.mockResolvedValue({
      ok: true,
      data: savedRole,
    });
    const store = makeStore(role);

    await store.onSubmit();

    expect(store.rootStore.rolesStore.items[0]?.hasUsersAssigned).toBe(true);
    expect(store.canDeleteRole).toBe(false);
  });
});

const UNHELD_ROLE_ID = "20000000-0000-4000-8000-000000000009";

describe("RoleModalStore own-role guard", () => {
  it("makes the role assigned to the signed-in user read-only", () => {
    const role = makeRole({ hasUsersAssigned: true });
    const store = makeStore(role, role.id);

    expect(store.isOwnRole).toBe(true);
    expect(store.isReadOnly).toBe(true);
    expect(store.isDisabledOrSystemRole).toBe(true);
    expect(store.canDeleteRole).toBe(false);
  });

  it("leaves a role the signed-in user does not hold editable", () => {
    const store = makeStore(makeRole(), UNHELD_ROLE_ID);

    expect(store.isOwnRole).toBe(false);
    expect(store.isReadOnly).toBe(false);
    expect(store.isDisabledOrSystemRole).toBe(false);
  });

  it("never submits the role assigned to the signed-in user", async () => {
    const role = makeRole({ hasUsersAssigned: true });
    const store = makeStore(role, role.id);

    await store.onSubmit();

    expect(companyActions.upsertRoleAction).not.toHaveBeenCalled();
  });

  it("still submits a role the signed-in user does not hold", async () => {
    const role = makeRole();
    companyActions.upsertRoleAction.mockResolvedValue({
      ok: true,
      data: RoleDtoSchema.parse(role),
    });
    const store = makeStore(role, UNHELD_ROLE_ID);

    await store.onSubmit();

    expect(companyActions.upsertRoleAction).toHaveBeenCalledOnce();
  });

  it("does not treat a new role as the signed-in user's own", () => {
    const store = makeStore(makeRole(), UNHELD_ROLE_ID);
    store.add();

    expect(store.isOwnRole).toBe(false);
    expect(store.isReadOnly).toBe(false);
  });
});
