import type { RootStore } from "@/core/stores/root.store";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { autorun } from "mobx";
import { CountryCode, Status } from "@/generated/prisma";

import { UserModalStore } from "../user-modal.store";

const actions = vi.hoisted(() => ({
  getUserByIdAction: vi.fn(),
  getRolesAction: vi.fn(),
  adminUpdateUserDetailsAction: vi.fn(),
}));

vi.mock("../../../actions", () => actions);

const SIGNED_IN_USER_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "30000000-0000-4000-8000-000000000002";

const userRecord = (id: string) => ({
  id,
  email: id === SIGNED_IN_USER_ID ? "max@example.com" : "colleague@example.com",
  firstName: "Test",
  lastName: "User",
  roleId: "40000000-0000-4000-8000-000000000001",
  status: Status.active,
  country: CountryCode.de,
  avatarUrl: null,
});

const makeRootStore = ({ signedInUserId, canManage }: { signedInUserId: string | null; canManage: boolean }) =>
  ({
    registerModalStore: vi.fn(),
    userStore: {
      user: signedInUserId ? userRecord(signedInUserId) : null,
      canManage: () => canManage,
    },
    rolesStore: { setItems: vi.fn() },
    usersStore: { customColumns: [], refresh: vi.fn() },
  }) as unknown as RootStore;

const loadUserInto = async (store: UserModalStore, id: string) => {
  actions.getUserByIdAction.mockResolvedValue({ user: userRecord(id) });
  actions.getRolesAction.mockResolvedValue([]);
  await store.loadById(id);
};

beforeEach(() => {
  vi.clearAllMocks();
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
    actions.getUserByIdAction.mockResolvedValue({ user: null });
    await store.loadById(OTHER_USER_ID);

    expect(store.loadedUserId).toBeNull();
    expect(store.isOwnProfile).toBe(false);
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
