import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  completeOnboardingWizardAction: vi.fn(),
  saveOnboardingWizardProgressAction: vi.fn(),
}));
const assign = vi.hoisted(() => vi.fn());

vi.mock("../../actions", () => actions);
vi.mock("@/app/[locale]/(protected)/profile/actions", () => ({ createApiKeyAction: vi.fn() }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));

import { OnboardingWizardStore, WIZARD_STEPS } from "../onboarding-wizard.store";
import { AiConnectionStore } from "@/components/ai-connection/ai-connection.store";
import { readOnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

const rootStore = { stepAiStore: { canFinish: true } } as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  actions.completeOnboardingWizardAction.mockResolvedValue({
    ok: true,
    data: { redirectTo: "/dashboard" },
  });
  vi.stubGlobal("location", { assign });
  actions.saveOnboardingWizardProgressAction.mockImplementation(({ progress }) =>
    Promise.resolve({ ok: true, data: progress }),
  );
});

describe("returning-user onboarding progress", () => {
  function persistentStore() {
    const root = {} as RootStore;
    const ai = new AiConnectionStore(root);
    const store = new OnboardingWizardStore({ stepAiStore: ai } as RootStore);
    return { store, ai };
  }

  it("restores the exact AI method and invitation tab while allowing Back to Invite", async () => {
    const { store, ai } = persistentStore();
    const progress = {
      ...readOnboardingWizardProgress(null),
      step: "ai" as const,
      inviteTab: "email" as const,
      ai: {
        ...readOnboardingWizardProgress(null).ai,
        route: { screen: "claude" as const },
        selectedProvider: "claude" as const,
        claudeMethod: "account" as const,
      },
    };
    store.initialize(2, "owner-a", progress);
    expect(store.currentStep).toBe("ai");
    expect(store.inviteTab).toBe("email");
    expect(ai.connectorProvider).toBe("claude");
    expect(store.isFirstStep).toBe(false);
    await store.back();
    expect(store.currentStep).toBe("invite");
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenCalledWith({
      userId: "owner-a",
      progress: { ...progress, step: "invite" },
    });
  });

  it("waits for a successful server save before advancing and stays put on failure", async () => {
    const { store } = persistentStore();
    store.initialize(2, "owner-a");
    let resolveSave!: (value: unknown) => void;
    actions.saveOnboardingWizardProgressAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const next = store.next();
    await Promise.resolve();
    expect(store.currentStep).toBe("invite");
    expect(store.isSaving).toBe(true);
    resolveSave({ ok: false, error: { formErrors: [], properties: {} } });
    await next;
    expect(store.currentStep).toBe("invite");
    expect(store.isSaving).toBe(false);
  });

  it("serializes selection saves and excludes one-time key values from progress", async () => {
    const { store, ai } = persistentStore();
    store.initialize(2, "owner-a");
    await store.next();
    ai.selectProvider("cursor");
    ai.credentials.cursor = { id: "synthetic-key-id", key: "synthetic-one-time-value", expiresAt: null };
    await store.persistProgress();
    const saved = actions.saveOnboardingWizardProgressAction.mock.calls.at(-1)?.[0];
    expect(saved.progress.ai.apiKeyIds).toEqual({ cursor: "synthetic-key-id" });
    expect(JSON.stringify(saved)).not.toContain("synthetic-one-time-value");
    const returning = persistentStore();
    returning.store.initialize(2, "owner-a", saved.progress);
    expect(returning.ai.canFinish).toBe(true);
    expect(returning.ai.apiKey).toBeNull();
    expect(returning.ai.hasSavedApiKey).toBe(true);
  });

  it("restores a connector choice and clears the prior account's selection for a different user", () => {
    const { store, ai } = persistentStore();
    const progress = {
      ...readOnboardingWizardProgress(null),
      step: "ai" as const,
      ai: {
        ...readOnboardingWizardProgress(null).ai,
        route: { screen: "claude" as const },
        selectedProvider: "claude" as const,
        claudeMethod: "account" as const,
      },
    };
    store.initialize(2, "owner-a", progress);
    expect(ai.canFinish).toBe(true);
    store.initialize(2, "owner-b");
    expect(store.currentStep).toBe("invite");
    expect(ai.canFinish).toBe(false);
    expect(ai.selection.apiKeyIds).toEqual({});
  });

  it("keeps an owner with a pending Wiki step on Wiki even with saved AI progress", async () => {
    const { store } = persistentStore();
    store.initialize(1, "owner-a", { ...readOnboardingWizardProgress(null), step: "ai" });
    expect(store.currentStep).toBe("wiki");
    expect(store.isFirstStep).toBe(true);

    await store.next();

    expect(store.currentStep).toBe("invite");
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "invite" }) }),
    );
  });

  it("finishes from the provider chooser without a selected tool", async () => {
    const { store } = persistentStore();
    store.initialize(2, "owner-a", { ...readOnboardingWizardProgress(null), step: "ai" });

    await store.complete();

    expect(actions.completeOnboardingWizardAction).toHaveBeenCalledOnce();
  });

  it("recovers when the server drops a stale saved key instead of blocking navigation", async () => {
    const { store, ai } = persistentStore();
    const progress = {
      ...readOnboardingWizardProgress(null),
      step: "ai" as const,
      ai: {
        ...readOnboardingWizardProgress(null).ai,
        route: { screen: "setup" as const, provider: "cursor" as const },
        selectedProvider: "cursor" as const,
        apiKeyIds: { cursor: "deleted-key-id" },
      },
    };
    store.initialize(2, "owner-a", progress);
    expect(ai.canFinish).toBe(true);
    actions.saveOnboardingWizardProgressAction.mockImplementation(({ progress: sent }) =>
      Promise.resolve({ ok: true, data: { ...sent, ai: { ...sent.ai, apiKeyIds: {} } } }),
    );

    await store.back();

    expect(store.currentStep).toBe("invite");
    expect(store.savedProgress?.ai.apiKeyIds).toEqual({});
    expect(ai.hasSavedApiKey).toBe(false);
    expect(ai.canFinish).toBe(false);
  });

  it("keeps a key created while an older save was in flight", async () => {
    const { store, ai } = persistentStore();
    store.initialize(2, "owner-a");
    await store.next();
    ai.selectProvider("cursor");
    let resolveSave!: (value: unknown) => void;
    actions.saveOnboardingWizardProgressAction.mockImplementationOnce(
      ({ progress: sent }) =>
        new Promise((resolve) => {
          resolveSave = () => resolve({ ok: true, data: sent });
        }),
    );
    const pending = store.persistProgress();
    await Promise.resolve();
    ai.credentials.cursor = { id: "fresh-key-id", key: "synthetic-one-time-value", expiresAt: null };
    resolveSave(undefined);
    await pending;

    expect(ai.credential?.id).toBe("fresh-key-id");
    expect(ai.canFinish).toBe(true);
  });

  it("does not let an old account's in-flight save advance a new account", async () => {
    const { store } = persistentStore();
    store.initialize(2, "owner-a");
    let resolveSave!: (value: unknown) => void;
    actions.saveOnboardingWizardProgressAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const next = store.next();
    await Promise.resolve();
    store.initialize(2, "owner-b");
    resolveSave({ ok: true, data: { ...readOnboardingWizardProgress(null), step: "ai" } });
    await next;
    expect(store.currentStep).toBe("invite");
    expect(store.userId).toBe("owner-b");
  });
});

describe("OnboardingWizardStore", () => {
  it("contains Profile, Wiki, Invite, and AI in order", () => {
    const store = new OnboardingWizardStore(rootStore);

    expect(WIZARD_STEPS).toEqual(["profile", "wiki", "invite", "ai"]);
    expect(store.totalSteps).toBe(4);
    expect(store.currentStep).toBe("profile");
  });

  it("starts registered owners at Wiki and prevents returning to Profile", async () => {
    const store = new OnboardingWizardStore(rootStore);

    store.setInitialStep(1);
    expect(store.currentStep).toBe("wiki");
    expect(store.isFirstStep).toBe(true);

    await store.back();
    expect(store.currentStep).toBe("wiki");
  });

  it("advances Wiki through Invite to the terminal AI step", async () => {
    const store = new OnboardingWizardStore(rootStore);
    store.setInitialStep(1);

    await store.next();
    expect(store.currentStep).toBe("invite");

    await store.next();
    expect(store.currentStep).toBe("ai");

    await store.next();
    expect(store.currentStep).toBe("ai");
  });

  it("resets progress when a different account starts at an earlier step", async () => {
    const store = new OnboardingWizardStore(rootStore);
    store.setInitialStep(1);
    await store.next();

    store.setInitialStep(0);

    expect(store.currentStep).toBe("profile");
    expect(store.isFirstStep).toBe(true);
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

    expect(assign).toHaveBeenCalledExactlyOnceWith("/dashboard");
    expect(actions.completeOnboardingWizardAction.mock.invocationCallOrder[0]).toBeLessThan(
      assign.mock.invocationCallOrder[0],
    );
  });

  it("stays put when completion failed", async () => {
    actions.completeOnboardingWizardAction.mockResolvedValue({ ok: false, error: { issues: [] } });
    const store = new OnboardingWizardStore(rootStore);

    await store.complete();

    expect(assign).not.toHaveBeenCalled();
    expect(store.isSubmitting).toBe(false);
  });
});
