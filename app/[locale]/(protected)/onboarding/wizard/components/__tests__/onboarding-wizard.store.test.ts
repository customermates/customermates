import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ completeOnboardingWizardAction: vi.fn() }));
const assign = vi.hoisted(() => vi.fn());

vi.mock("../../actions", () => actions);

import { OnboardingWizardStore, WIZARD_STEPS } from "../onboarding-wizard.store";

const rootStore = {} as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  actions.completeOnboardingWizardAction.mockResolvedValue({
    ok: true,
    data: { redirectTo: "/dashboard" },
  });
  vi.stubGlobal("location", { assign });
});

describe("OnboardingWizardStore", () => {
  it("contains exactly Profile, Invite, and AI", () => {
    const store = new OnboardingWizardStore(rootStore);

    expect(WIZARD_STEPS).toEqual(["profile", "invite", "ai"]);
    expect(store.totalSteps).toBe(3);
    expect(store.currentStep).toBe("profile");
    expect("terminology" in store).toBe(false);
  });

  it("starts registered owners at Invite and prevents returning to Profile", () => {
    const store = new OnboardingWizardStore(rootStore);

    store.setInitialStep(1);
    expect(store.currentStep).toBe("invite");
    expect(store.isFirstStep).toBe(true);

    store.back();
    expect(store.currentStep).toBe("invite");
  });

  it("advances Invite to the terminal AI step", () => {
    const store = new OnboardingWizardStore(rootStore);
    store.setInitialStep(1);

    store.next();
    expect(store.currentStep).toBe("ai");

    store.next();
    expect(store.currentStep).toBe("ai");
  });

  it("preserves the existing completion action", async () => {
    const store = new OnboardingWizardStore(rootStore);

    await store.complete();

    expect(actions.completeOnboardingWizardAction).toHaveBeenCalledOnce();
    expect(store.isSubmitting).toBe(false);
  });

  it("leaves the wizard with a document load, so the shell re-reads the account state", async () => {
    const store = new OnboardingWizardStore(rootStore);

    await store.complete();

    expect(assign).toHaveBeenCalledWith("/dashboard");
  });

  it("stays put when completion failed", async () => {
    actions.completeOnboardingWizardAction.mockResolvedValue({ ok: false, error: { issues: [] } });
    const store = new OnboardingWizardStore(rootStore);

    await store.complete();

    expect(assign).not.toHaveBeenCalled();
    expect(store.isSubmitting).toBe(false);
  });
});
