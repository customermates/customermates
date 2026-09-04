import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const authActions = vi.hoisted(() => ({
  signUpWithEmailAction: vi.fn(),
  continueWithGoogleAction: vi.fn(),
  continueWithMicrosoftAction: vi.fn(),
}));
const toastZodErrorTree = vi.hoisted(() => vi.fn());

vi.mock("@/app/[locale]/(public)/auth/actions", () => authActions);
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));

import { SignUpStore } from "../sign-up.store";

const assign = vi.fn();
const rootStore = {} as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { assign } });
});

describe("SignUpStore social continuation", () => {
  it("submits email signup with the active invitation intent", async () => {
    authActions.signUpWithEmailAction.mockResolvedValue({ ok: true, data: null });
    const store = new SignUpStore(rootStore);
    store.setInvitationIntent("signed.intent");

    await store.onSubmit();

    expect(authActions.signUpWithEmailAction).toHaveBeenCalledWith(
      expect.objectContaining({ email: "" }),
      "signed.intent",
    );
  });

  it("keeps the invitation in provider success and error callbacks", async () => {
    authActions.continueWithGoogleAction.mockResolvedValue({
      ok: true,
      data: { url: "https://accounts.google.test/authorize" },
    });
    const store = new SignUpStore(rootStore);
    store.setInvitationIntent("signed.intent");

    await store.continueWithProvider("google");

    expect(authActions.continueWithGoogleAction).toHaveBeenCalledWith(
      "/auth/invitation?intent=signed.intent",
      "/auth/signup?intent=signed.intent",
    );
  });

  it("keeps both providers locked after hard navigation starts", async () => {
    authActions.continueWithGoogleAction.mockResolvedValue({
      ok: true,
      data: { url: "https://accounts.google.test/authorize" },
    });
    const store = new SignUpStore(rootStore);

    await store.continueWithProvider("google");
    await store.continueWithProvider("google");

    expect(authActions.continueWithGoogleAction).toHaveBeenCalledExactlyOnceWith("/onboarding", "/auth/signup");
    expect(assign).toHaveBeenCalledExactlyOnceWith("https://accounts.google.test/authorize");
    expect(store.isLoading).toBe(true);
  });

  it("releases the provider lock after a validation failure", async () => {
    const error = { errors: ["Social sign-up unavailable"] };
    authActions.continueWithMicrosoftAction.mockResolvedValue({ ok: false, error });
    const store = new SignUpStore(rootStore);

    await store.continueWithProvider("microsoft");

    expect(toastZodErrorTree).toHaveBeenCalledExactlyOnceWith(error);
    expect(assign).not.toHaveBeenCalled();
    expect(store.isLoading).toBe(false);
  });
});
