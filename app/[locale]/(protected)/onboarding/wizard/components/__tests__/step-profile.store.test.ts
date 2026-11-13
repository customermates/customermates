import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ registerProfileAction: vi.fn() }));

vi.mock("../../actions", () => actions);
vi.mock("../../onboarding-agent-actions", () => ({
  getOnboardingAgentStatusAction: vi.fn(),
  getOnboardingTemplatePromptAction: vi.fn(),
}));

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
      displayLanguage: "system",
      email: "owner@example.com",
      firstName: "Owner",
      lastName: "Example",
      onboardingIntent: "signed.create.intent",
      teamSize: null,
      workspaceName: "",
    });
  });

  it("asks a new cloud owner for the team size before it registers", async () => {
    const store = new StepProfileStore(rootStore);
    store.onInitOrRefresh({ email: "owner@example.com", firstName: "Owner", lastName: "Example" });
    store.setRequiresTeamSize(true);

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

  it("sends no team size where the question is not asked", async () => {
    const store = new StepProfileStore(rootStore);
    store.onInitOrRefresh({ email: "owner@example.com", firstName: "Owner", lastName: "Example" });
    store.setTeamSize("large");
    store.setRequiresTeamSize(false);

    await store.onSubmit();

    expect(actions.registerProfileAction.mock.calls[0][0]).toMatchObject({ teamSize: null });
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

    expect(actions.registerProfileAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ onboardingIntent: "signed.create.intent", workspaceName: "Bergmann Steuern" }),
    );
  });

  it("sends the chosen display language and no country to registration", async () => {
    const store = new StepProfileStore(rootStore);
    store.onInitOrRefresh({ email: "owner@example.com", firstName: "Owner", lastName: "Example" });
    store.onChange("displayLanguage", "de");

    await store.onSubmit();

    expect(actions.registerProfileAction.mock.calls[0][0]).toMatchObject({ displayLanguage: "de" });
    expect(actions.registerProfileAction.mock.calls[0][0]).not.toHaveProperty("country");
  });
});
