import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

const { signInWithEmailAction } = vi.hoisted(() => ({
  signInWithEmailAction: vi.fn(),
}));

vi.mock("../../actions", () => ({ signInWithEmailAction }));

import { SignInStore } from "../sign-in.store";

const rootStore = {} as RootStore;

describe("SignInStore", () => {
  beforeEach(() => {
    signInWithEmailAction.mockReset();
  });

  it("does not treat a completed Server Action redirect as an action result", async () => {
    signInWithEmailAction.mockResolvedValue(undefined);
    const store = new SignInStore(rootStore);

    await expect(store.onSubmit()).resolves.toBeUndefined();

    expect(signInWithEmailAction).toHaveBeenCalledOnce();
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeUndefined();
  });
});
