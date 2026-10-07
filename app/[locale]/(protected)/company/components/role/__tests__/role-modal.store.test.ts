import type { RootStore } from "@/core/stores/root.store";
import type { RoleDto } from "@/features/role/get-roles.interactor";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleDtoSchema } from "@/features/role/role.schema";
import { Action, Resource } from "@/generated/prisma";

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
      can: vi.fn().mockReturnValue(true),
    },
  } as unknown as RootStore;
  const store = new RoleModalStore(rootStore);
  store.setRole(role);
  store.open();
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
  it("synchronizes an accepted earlier save without replacing a newly opened role draft", async () => {
    const earlier = makeRole();
    const later = makeRole({ id: UNHELD_ROLE_ID, name: "Later role" });
    const store = makeStore(earlier);
    const response = Promise.withResolvers<unknown>();
    companyActions.upsertRoleAction.mockReturnValueOnce(response.promise);
    const save = store.onSubmit();
    store.close();
    companyActions.getRoleEditorAction.mockResolvedValueOnce({
      ok: true,
      data: { role: later, schemaRevision: 2, types: [], canEdit: true, canDelete: true },
    });
    store.editRole(later);
    await vi.waitFor(() => expect(store.isLoading).toBe(false));
    store.onChange("name", "Later unsaved draft");
    response.resolve({ ok: true, data: { role: earlier, schemaRevision: 2 } });
    await save;
    expect(store.rootStore.rolesStore.upsertItem).toHaveBeenCalledWith(expect.objectContaining({ id: earlier.id }), {
      created: false,
    });
    expect(store.form).toMatchObject({ id: later.id, name: "Later unsaved draft" });
    expect(store.isOpen).toBe(true);
    expect(store.isLoading).toBe(false);
  });

  it("removes the captured deleted role without closing another role or ending its pending context read", async () => {
    const earlier = makeRole();
    const later = makeRole({ id: UNHELD_ROLE_ID, name: "Later role" });
    const store = makeStore(earlier);
    const deletion = Promise.withResolvers<unknown>();
    const loading = Promise.withResolvers<unknown>();
    companyActions.deleteRoleAction.mockReturnValueOnce(deletion.promise);
    const remove = store.delete();
    store.close();
    companyActions.getRoleEditorAction.mockReturnValueOnce(loading.promise);
    store.editRole(later);
    expect(store.isLoading).toBe(true);
    deletion.resolve({ ok: true, data: {} });
    expect(await remove).toBe(true);
    expect(store.rootStore.rolesStore.removeItem).toHaveBeenCalledWith(earlier.id);
    expect(store.form).toMatchObject({ id: later.id, name: "Later role" });
    expect(store.isOpen).toBe(true);
    expect(store.isLoading).toBe(true);
    loading.resolve({ ok: true, data: { role: later, schemaRevision: 2, types: [], canEdit: true, canDelete: true } });
    await vi.waitFor(() => expect(store.isLoading).toBe(false));
  });
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
  expect(companyActions.upsertRoleAction).toHaveBeenCalledWith(expect.objectContaining({ permissions: [] }));
});

describe("RoleModalStore Wiki permissions", () => {
  it("defaults a new custom role to Wiki Read without Manage", () => {
    const store = makeStore(makeRole());

    store.add();

    expect(store.form.permissions.wiki).toEqual({ create: false, update: false, delete: false, readAccess: "all" });
  });

  it("makes Wiki Read all when Manage is granted", () => {
    const store = makeStore(makeRole());

    store.onChange("permissions.wiki.readAccess", "none");
    store.onChange("permissions.wiki.update", true);

    expect(store.form.permissions.wiki).toEqual({ create: false, update: true, delete: false, readAccess: "all" });
  });

  it("normalizes a persisted Wiki manager to Read even if the stored grants are inconsistent", () => {
    const store = makeStore(
      makeRole({
        permissions: [
          { id: "wiki-create", resource: Resource.wiki, action: Action.create },
          { id: "wiki-update", resource: Resource.wiki, action: Action.update },
          { id: "wiki-delete", resource: Resource.wiki, action: Action.delete },
        ],
      }),
    );

    expect(store.form.permissions.wiki).toEqual({ create: true, update: true, delete: true, readAccess: "all" });
  });
});

describe("RoleModalStore unified system permissions", () => {
  it("loads each manage action separately and submits only the changed resource in the shared vocabulary", async () => {
    const role = makeRole({
      permissions: [
        { id: "api-create", resource: Resource.api, action: Action.create },
        { id: "api-read", resource: Resource.api, action: Action.readAll },
        { id: "company-update", resource: Resource.company, action: Action.update },
        { id: "company-read", resource: Resource.company, action: Action.readOwn },
      ],
    });
    const store = makeStore(role);
    expect(store.form.permissions.api).toEqual({ create: true, update: false, delete: false, readAccess: "all" });
    expect(store.form.permissions.company).toMatchObject({ create: false, update: true, delete: false });

    store.onChange("permissions.api.delete", true);
    companyActions.upsertRoleAction.mockResolvedValue({ ok: true, data: { role, schemaRevision: 2 } });
    await store.onSubmit();

    expect(companyActions.upsertRoleAction).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: [{ resource: "api", actions: ["create", "delete", "readAll"] }] }),
    );
  });

  it("sends every resource with only its applicable actions for a new role", async () => {
    const store = makeStore(makeRole());
    store.add();
    await vi.waitFor(() => expect(store.isLoading).toBe(false));
    store.onChange("name", "Support");
    store.onChange("description", "Support desk");
    store.onChange("permissions.company.update", true);
    store.onChange("permissions.auditLog.readAccess", "all");
    companyActions.upsertRoleAction.mockResolvedValue({ ok: true, data: { role: makeRole(), schemaRevision: 2 } });
    await store.onSubmit();

    const permissions = companyActions.upsertRoleAction.mock.calls[0]?.[0].permissions;
    expect(permissions).toContainEqual({ resource: "company", actions: ["update"] });
    expect(permissions).toContainEqual({ resource: "auditLog", actions: ["readAll"] });
    expect(permissions).toContainEqual({ resource: "users", actions: ["readOwn"] });
    expect(permissions).toHaveLength(8);
  });
});
