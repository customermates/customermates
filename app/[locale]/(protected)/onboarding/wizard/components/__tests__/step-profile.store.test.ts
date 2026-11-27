import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ registerProfileAction: vi.fn() }));

vi.mock("../../actions", () => actions);

import { StepProfileStore } from "../step-profile.store";

const rootStore = {} as RootStore;

function ownerStore() {
  const store = new StepProfileStore(rootStore);
  store.onInitOrRefresh({ email: "owner@example.com", firstName: "Owner", lastName: "Example" });
  return store;
}

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
    expect(actions.registerProfileAction).toHaveBeenCalledExactlyOnceWith(
      {
        agreeToTerms: true,
        avatarUrl: null,
        displayLanguage: "system",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: "Example",
        onboardingIntent: "signed.create.intent",
        teamSize: null,
        workspaceName: "",
      },
      undefined,
    );
  });

  it("asks a new cloud owner for the team size before it registers", async () => {
    const store = ownerStore();
    store.setOwnerQuestions(true);

    await store.onSubmit();

    expect(store.teamSizeMissing).toBe(true);
    expect(actions.registerProfileAction).not.toHaveBeenCalled();

    store.setTeamSize("not-a-size");
    expect(store.form.teamSize).toBeNull();
    store.setTeamSize("small");
    expect(store.teamSizeMissing).toBe(false);
    await store.onSubmit();

    expect(actions.registerProfileAction.mock.calls[0][0]).toMatchObject({ teamSize: "small" });
  });

  it("sends no team size and no discovery answer where the questions are not asked", async () => {
    const store = ownerStore();
    store.setTeamSize("large");
    store.setDiscovery("searchEngine");
    store.setOwnerQuestions(false);

    await store.onSubmit();

    expect(actions.registerProfileAction.mock.calls[0][0]).toMatchObject({ teamSize: null });
    expect(actions.registerProfileAction.mock.calls[0][1]).toBeUndefined();
  });

  it("passes how a cloud owner found us next to the profile", async () => {
    const store = ownerStore();
    store.setOwnerQuestions(true);
    store.setTeamSize("solo");
    store.setDiscovery("not-a-choice");
    expect(store.discovery).toBeNull();
    store.setDiscovery("aiAssistant");

    await store.onSubmit();

    expect(actions.registerProfileAction.mock.calls[0][1]).toEqual({ choice: "aiAssistant" });
  });

  it("records a skipped discovery answer and keeps the detail only for somewhere else", async () => {
    const store = ownerStore();
    store.setOwnerQuestions(true);
    store.setTeamSize("solo");

    await store.onSubmit();
    expect(actions.registerProfileAction.mock.calls[0][1]).toEqual({ choice: null });

    store.setDiscovery("other");
    store.setDiscoveryDetail("A podcast");
    await store.onSubmit();
    expect(actions.registerProfileAction.mock.calls[1][1]).toEqual({ choice: "other", detail: "A podcast" });
  });

  it("opens the display language only on request", () => {
    const store = ownerStore();
    expect(store.languageOpen).toBe(false);
    store.openLanguage();
    expect(store.languageOpen).toBe(true);
  });

  it("submits the name chosen for a new workspace", async () => {
    const store = new StepProfileStore(rootStore);
    store.onInitOrRefresh({
      avatarUrl: null,
      email: "owner@example.com",
      firstName: "Owner",
      lastName: "Example",
      onboardingIntent: "signed.create.intent",
    });
    store.onChange("workspaceName", "Bergmann Steuern");
    store.onChange("agreeToTerms", true);

    await store.onSubmit();

    expect(actions.registerProfileAction.mock.calls[0][0]).toMatchObject({
      onboardingIntent: "signed.create.intent",
      workspaceName: "Bergmann Steuern",
    });
  });

  it("sends the chosen display language and no country to registration", async () => {
    const store = ownerStore();
    store.onChange("displayLanguage", "de");

    await store.onSubmit();

    expect(actions.registerProfileAction.mock.calls[0][0]).toMatchObject({ displayLanguage: "de" });
    expect(actions.registerProfileAction.mock.calls[0][0]).not.toHaveProperty("country");
  });
});
