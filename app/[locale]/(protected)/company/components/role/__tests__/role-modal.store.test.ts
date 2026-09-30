import type { RootStore } from "@/core/stores/root.store";
import type { RoleDto } from "@/features/role/get-roles.interactor";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleDtoSchema } from "@/features/role/role.schema";

const companyActions = vi.hoisted(() => ({
  deleteRoleAction: vi.fn(),
  getRoleEditorAction: vi.fn(),
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
  store.context = {
    role,
    schemaRevision: 1,
    types: [],
    canEdit: !role.isSystemRole && role.id !== signedInRoleId,
    canDelete: !role.isSystemRole && !role.hasUsersAssigned && role.id !== signedInRoleId,
  };

  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  companyActions.getRoleEditorAction.mockResolvedValue({
    ok: true,
    data: { role: null, schemaRevision: 1, types: [], canEdit: true, canDelete: false },
  });
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
      data: { role: savedRole, schemaRevision: 2 },
    });
    const store = makeStore(role);

    await store.onSubmit();

    expect(store.rootStore.rolesStore.items[0]?.hasUsersAssigned).toBe(true);
    expect(store.canDeleteRole).toBe(false);
  });

  it("counts a created role into the table total and an edited one not", async () => {
    const role = makeRole();
    companyActions.upsertRoleAction.mockResolvedValue({
      ok: true,
      data: { role: RoleDtoSchema.parse(role), schemaRevision: 2 },
    });

    const edited = makeStore(role);
    await edited.onSubmit();
    expect(edited.rootStore.rolesStore.upsertItem).toHaveBeenCalledWith(expect.objectContaining({ id: role.id }), {
      created: false,
    });

    const created = makeStore(role);
    created.onChange("id", undefined);
    await created.onSubmit();
    expect(created.rootStore.rolesStore.upsertItem).toHaveBeenCalledWith(expect.objectContaining({ id: role.id }), {
      created: true,
    });
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
      data: { role: RoleDtoSchema.parse(role), schemaRevision: 2 },
    });
    const store = makeStore(role, UNHELD_ROLE_ID);

    await store.onSubmit();

    expect(companyActions.upsertRoleAction).toHaveBeenCalledOnce();
  });

  it("does not treat a new role as the signed-in user's own", async () => {
    const store = makeStore(makeRole(), UNHELD_ROLE_ID);
    store.add();
    await vi.waitFor(() => expect(store.isLoading).toBe(false));

    expect(store.isOwnRole).toBe(false);
    expect(store.isReadOnly).toBe(false);
  });
});

describe("dynamic role permissions", () => {
  it("loads renamed types and preserves granular rights without granting update or delete", async () => {
    const role = makeRole({
      recordGrants: [{ typeId: "20000000-0000-4000-8000-000000000010", actions: ["create", "readOwn"] }],
    });
    const store = makeStore(role);
    companyActions.getRoleEditorAction.mockResolvedValue({
      ok: true,
      data: {
        role,
        schemaRevision: 3,
        types: [{ id: role.recordGrants?.[0]?.typeId, label: "Customer projects", archived: false }],
        canEdit: true,
        canDelete: true,
      },
    });
    store.editRole(role);
    await vi.waitFor(() => expect(store.isLoading).toBe(false));
    expect(store.form.recordGrants).toEqual([
      { typeId: role.recordGrants?.[0]?.typeId, create: true, update: false, delete: false, readAccess: "own" },
    ]);
    companyActions.upsertRoleAction.mockResolvedValue({ ok: true, data: { role, schemaRevision: 4 } });
    await store.onSubmit();
    expect(companyActions.upsertRoleAction).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 3, recordGrants: role.recordGrants }),
    );
  });

  it("retains a failed draft and reuses its retry key, then changes the key when the draft changes", async () => {
    const store = makeStore(makeRole());
    companyActions.upsertRoleAction.mockRejectedValue(new Error("Connection lost"));
    await expect(store.onSubmit()).rejects.toThrow("Connection lost");
    await expect(store.onSubmit()).rejects.toThrow("Connection lost");
    const first = companyActions.upsertRoleAction.mock.calls[0]?.[0];
    expect(companyActions.upsertRoleAction.mock.calls[1]?.[0]).toEqual(first);
    store.onChange("name", "Updated draft");
    await expect(store.onSubmit()).rejects.toThrow("Connection lost");
    expect(companyActions.upsertRoleAction.mock.calls[2]?.[0].idempotencyKey).not.toBe(first.idempotencyKey);
    expect(store.form.name).toBe("Updated draft");
  });

  it("does not let a late role response replace a newly opened role", async () => {
    const store = makeStore(makeRole());
    let complete: (value: unknown) => void = () => undefined;
    companyActions.getRoleEditorAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    store.editRole(makeRole());
    store.add();
    await vi.waitFor(() => expect(store.isLoading).toBe(false));
    complete({ ok: true, data: { role: makeRole(), schemaRevision: 2, types: [], canEdit: true, canDelete: true } });
    await Promise.resolve();
    expect(store.form.id).toBeUndefined();
    expect(store.form.name).toBe("");
  });
});

it("does not expand partial system permissions when only the role name changes", async () => {
  const role = makeRole({ permissions: [{ id: "partial-user-write", resource: "users", action: "update" }] });
  const store = makeStore(role);
  store.onChange("name", "Renamed role");
  companyActions.upsertRoleAction.mockResolvedValue({ ok: true, data: { role, schemaRevision: 2 } });
  await store.onSubmit();
  expect(companyActions.upsertRoleAction).toHaveBeenCalledWith(expect.objectContaining({ permissions: {} }));
});
