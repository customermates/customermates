import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ registerProfileAction: vi.fn() }));

vi.mock("../../actions", () => actions);

import { StepProfileStore } from "../step-profile.store";

const rootStore = {} as RootStore;

describe("StepProfileStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.registerProfileAction.mockResolvedValue({ data: { redirectTo: "/onboarding/wizard" }, ok: true });
  });

  it("keeps onboarding intent in the form submitted for registration", async () => {
    const store = new StepProfileStore(rootStore);
    store.onInitOrRefresh({
      avatarUrl: null,
      email: "owner@example.com",
      firstName: "Owner",
      lastName: "Example",
      onboardingIntent: "signed.create.intent",
    });
    store.onChange("agreeToTerms", true);

    await store.onSubmit();

    expect(store.form.onboardingIntent).toBe("signed.create.intent");
    expect(actions.registerProfileAction).toHaveBeenCalledExactlyOnceWith({
      agreeToTerms: true,
      avatarUrl: null,
      country: "de",
      email: "owner@example.com",
      firstName: "Owner",
      lastName: "Example",
      onboardingIntent: "signed.create.intent",
    });
  });
});
