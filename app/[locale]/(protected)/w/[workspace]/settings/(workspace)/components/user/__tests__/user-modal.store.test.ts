import type { RootStore } from "@/core/stores/root.store";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { autorun } from "mobx";
import { Status } from "@/generated/prisma";

import { UserModalStore } from "../user-modal.store";

const actions = vi.hoisted(() => ({
  getUserByIdAction: vi.fn(),
  getRolesAction: vi.fn(),
  adminUpdateUserDetailsAction: vi.fn(),
  getMemberRemovalAction: vi.fn(),
  removeWorkspaceMemberAction: vi.fn(),
}));
const toasts = vi.hoisted(() => ({ toastZodErrorTree: vi.fn() }));

vi.mock("../../../actions", () => actions);
vi.mock("@/core/utils/toast-zod-error-tree", () => toasts);

const SIGNED_IN_USER_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "30000000-0000-4000-8000-000000000002";

const userRecord = (id: string) => ({
  id,
  email: id === SIGNED_IN_USER_ID ? "max@example.com" : "colleague@example.com",
  firstName: "Test",
  lastName: "User",
  roleId: "40000000-0000-4000-8000-000000000001",
  status: Status.active,
  avatarUrl: null,
});

const makeRootStore = ({
  signedInUserId,
  canManage,
  appMode = "cloud",
}: {
  signedInUserId: string | null;
  canManage: boolean;
  appMode?: string;
}) =>
  ({
    appMode,
    registerModalStore: vi.fn(),
    userStore: {
      user: signedInUserId ? userRecord(signedInUserId) : null,
      can: () => canManage,
    },
    rolesStore: { setItems: vi.fn() },
    usersStore: { refresh: vi.fn() },
  }) as unknown as RootStore;

const loadUserInto = async (store: UserModalStore, id: string) => {
  actions.getUserByIdAction.mockResolvedValue({ ok: true, data: { user: userRecord(id) } });
  actions.getRolesAction.mockResolvedValue({ ok: true, data: [] });
  await store.loadById(id);
};

beforeEach(() => {
  vi.clearAllMocks();
  actions.getMemberRemovalAction.mockResolvedValue({ ok: true, data: { userId: OTHER_USER_ID, refusal: null } });
});

describe("UserModalStore own-profile read-only contract", () => {
  it("treats the signed-in user's own record as read-only", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));

    await loadUserInto(store, SIGNED_IN_USER_ID);

    expect(store.isOwnProfile).toBe(true);
    expect(store.isReadOnly).toBe(true);
    expect(store.isDisabled).toBe(true);
  });

  it("leaves another user's record editable for a manager", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));

    await loadUserInto(store, OTHER_USER_ID);

    expect(store.isOwnProfile).toBe(false);
    expect(store.isReadOnly).toBe(false);
    expect(store.isDisabled).toBe(false);
  });

  it("keeps the permission-driven read-only state for a user without manage rights", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: false }));

    await loadUserInto(store, OTHER_USER_ID);

    expect(store.isOwnProfile).toBe(false);
    expect(store.isReadOnly).toBe(true);
  });

  it("does not treat a never-loaded modal as the signed-in user's own record", () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));

    expect(store.loadedUserId).toBeNull();
    expect(store.isOwnProfile).toBe(false);
    expect(store.isReadOnly).toBe(false);
  });

  it("does not treat any record as own profile while no user is signed in", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: null, canManage: true }));

    await loadUserInto(store, SIGNED_IN_USER_ID);

    expect(store.isOwnProfile).toBe(false);
  });

  it("identifies the record by user id rather than by the email in the form", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));

    await loadUserInto(store, SIGNED_IN_USER_ID);
    store.onChange("email", "someone.else@example.com");

    expect(store.isOwnProfile).toBe(true);
    expect(store.isReadOnly).toBe(true);
  });

  it("clears the previously loaded record before resolving the next one", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));

    await loadUserInto(store, SIGNED_IN_USER_ID);
    actions.getUserByIdAction.mockResolvedValue({ ok: true, data: { user: null } });
    await store.loadById(OTHER_USER_ID);

    expect(store.loadedUserId).toBeNull();
    expect(store.isOwnProfile).toBe(false);
  });

  it("remembers that the loaded member left the workspace until another record loads", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));
    const leftAt = new Date("2026-10-01T00:00:00.000Z");
    actions.getUserByIdAction.mockResolvedValue({ ok: true, data: { user: { ...userRecord(OTHER_USER_ID), leftAt } } });
    actions.getRolesAction.mockResolvedValue({ ok: true, data: [] });

    await store.loadById(OTHER_USER_ID);
    expect(store.loadedLeftAt).toEqual(leftAt);

    await loadUserInto(store, SIGNED_IN_USER_ID);
    expect(store.loadedLeftAt).toBeNull();
  });

  it("re-evaluates the read-only state when the modal switches to another record", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));
    const observed: boolean[] = [];
    const stop = autorun(() => observed.push(store.isReadOnly));

    await loadUserInto(store, SIGNED_IN_USER_ID);
    await loadUserInto(store, OTHER_USER_ID);
    stop();

    expect(observed).toContain(true);
    expect(observed.at(-1)).toBe(false);
  });

  it("never invokes the admin update action for the signed-in user's own record", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));

    await loadUserInto(store, SIGNED_IN_USER_ID);
    await store.onSubmit();

    expect(actions.adminUpdateUserDetailsAction).not.toHaveBeenCalled();
  });

  it("still submits another user's record", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));

    await loadUserInto(store, OTHER_USER_ID);
    actions.adminUpdateUserDetailsAction.mockResolvedValue({ ok: true, data: userRecord(OTHER_USER_ID) });
    await store.onSubmit();

    expect(actions.adminUpdateUserDetailsAction).toHaveBeenCalledTimes(1);
  });
});

describe("UserModalStore removal from the workspace", () => {
  const loadOther = async (store: UserModalStore, user: Record<string, unknown> = {}) => {
    actions.getUserByIdAction.mockResolvedValue({
      ok: true,
      data: { user: { ...userRecord(OTHER_USER_ID), leftAt: null, ...user } },
    });
    actions.getRolesAction.mockResolvedValue({ ok: true, data: [] });
    await store.loadById(OTHER_USER_ID);
  };

  it("offers removal for another member, pending ones included, and removes through the remove action", async () => {
    const root = makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true });
    const store = new UserModalStore(root);

    await loadOther(store, { status: Status.pendingAuthorization });

    expect(actions.getMemberRemovalAction).toHaveBeenCalledWith({ userId: OTHER_USER_ID });
    expect(store.loadedStatus).toBe(Status.pendingAuthorization);
    expect(store.showsRemoval).toBe(true);
    expect(store.canRemove).toBe(true);
    expect(store.removalBlockedBy).toBeNull();

    actions.removeWorkspaceMemberAction.mockResolvedValue({ ok: true, data: { userId: OTHER_USER_ID } });
    await expect(store.remove(OTHER_USER_ID)).resolves.toBe(true);

    expect(actions.removeWorkspaceMemberAction).toHaveBeenCalledWith({ userId: OTHER_USER_ID });
    expect(actions.adminUpdateUserDetailsAction).not.toHaveBeenCalled();
    expect(root.usersStore.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a blocked removal with its reason and never sends it", async () => {
    const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));
    actions.getMemberRemovalAction.mockResolvedValue({
      ok: true,
      data: { userId: OTHER_USER_ID, refusal: "lastAdmin" },
    });

    await loadOther(store);

    expect(store.showsRemoval).toBe(true);
    expect(store.removalBlockedBy).toBe("lastAdmin");
    expect(store.canRemove).toBe(false);
    await expect(store.remove(OTHER_USER_ID)).resolves.toBe(false);
    expect(actions.removeWorkspaceMemberAction).not.toHaveBeenCalled();
  });

  it("hides removal for the signed-in user's own row, a member who left, without permission and in the demo", async () => {
    const own = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));
    await loadUserInto(own, SIGNED_IN_USER_ID);
    expect(own.showsRemoval).toBe(false);

    const left = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));
    actions.getMemberRemovalAction.mockResolvedValue({ ok: true, data: { userId: OTHER_USER_ID, refusal: "left" } });
    await loadOther(left, { leftAt: new Date("2026-10-01T00:00:00.000Z") });
    expect(left.showsRemoval).toBe(false);

    vi.clearAllMocks();
    const reader = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: false }));
    await loadOther(reader);
    const demo = new UserModalStore(
      makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true, appMode: "demo" }),
    );
    await loadOther(demo);

    expect(actions.getMemberRemovalAction).not.toHaveBeenCalled();
    expect(reader.showsRemoval).toBe(false);
    expect(demo.showsRemoval).toBe(false);
    expect(demo.offersRemovalFor({ id: OTHER_USER_ID, leftAt: null })).toBe(false);
  });

  it("keeps the dialog open and reports a refused removal", async () => {
    const root = makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true });
    const store = new UserModalStore(root);
    await loadOther(store);
    const error = { errors: ["Common.errors.workspaceMemberLastAdmin"] };
    actions.removeWorkspaceMemberAction.mockResolvedValue({ ok: false, error });

    await expect(store.remove(OTHER_USER_ID)).resolves.toBe(false);

    expect(toasts.toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(root.usersStore.refresh).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(true);
  });

  describe("approving a pending member", () => {
    const ADMIN_ROLE = { id: "40000000-0000-4000-8000-000000000001", name: "Admin", isSystemRole: true };
    const SALES_ROLE = { id: "40000000-0000-4000-8000-000000000002", name: "Sales", isSystemRole: false };

    async function loadPending(roles: { items: unknown[]; pagination?: { total: number } }) {
      const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));
      actions.getUserByIdAction.mockResolvedValue({
        ok: true,
        data: {
          user: { ...userRecord(OTHER_USER_ID), roleId: null, status: Status.pendingAuthorization },
        },
      });
      actions.getRolesAction.mockResolvedValue({ ok: true, data: roles });
      actions.getMemberRemovalAction.mockResolvedValue({ ok: true, data: { refusal: null } });
      await store.loadById(OTHER_USER_ID);
      return store;
    }

    it("preselects the only role of the workspace", async () => {
      const store = await loadPending({ items: [ADMIN_ROLE], pagination: { total: 1 } });

      expect(store.form.roleId).toBe(ADMIN_ROLE.id);
      expect(store.hasUnsavedChanges).toBe(false);
    });

    it("leaves the role empty when there is more than one to choose from", async () => {
      expect((await loadPending({ items: [ADMIN_ROLE, SALES_ROLE], pagination: { total: 2 } })).form.roleId).toBe("");
      expect((await loadPending({ items: [ADMIN_ROLE], pagination: { total: 3 } })).form.roleId).toBe("");
    });

    it("keeps the role an approved member already has", async () => {
      const store = new UserModalStore(makeRootStore({ signedInUserId: SIGNED_IN_USER_ID, canManage: true }));
      actions.getUserByIdAction.mockResolvedValue({
        ok: true,
        data: { user: { ...userRecord(OTHER_USER_ID), roleId: SALES_ROLE.id } },
      });
      actions.getRolesAction.mockResolvedValue({ ok: true, data: { items: [ADMIN_ROLE], pagination: { total: 1 } } });
      actions.getMemberRemovalAction.mockResolvedValue({ ok: true, data: { refusal: null } });

      await store.loadById(OTHER_USER_ID);

      expect(store.form.roleId).toBe(SALES_ROLE.id);
    });
  });
});
