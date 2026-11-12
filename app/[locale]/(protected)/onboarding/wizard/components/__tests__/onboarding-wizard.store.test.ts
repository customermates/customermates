import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  applyOnboardingPlaybookAction: vi.fn(),
  completeOnboardingSetupStepAction: vi.fn(),
  completeOnboardingWizardAction: vi.fn(),
  saveOnboardingWizardProgressAction: vi.fn(),
  selectOnboardingJobAction: vi.fn(),
}));
const assign = vi.hoisted(() => vi.fn());

const agentActions = vi.hoisted(() => ({
  getOnboardingAgentStatusAction: vi.fn(),
  getOnboardingTemplatePromptAction: vi.fn(),
}));

vi.mock("../../actions", () => actions);
vi.mock("../../onboarding-agent-actions", () => agentActions);
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/actions", () => ({ createApiKeyAction: vi.fn() }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));

import { OnboardingWizardStore, WIZARD_STEPS } from "../onboarding-wizard.store";
import { AiConnectionStore } from "@/components/ai-connection/ai-connection.store";
import { readOnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

const rootStore = { stepAiStore: { canFinish: true }, localeStore: { locale: "de" } } as RootStore;

beforeEach(() => {
  vi.clearAllMocks();
  actions.completeOnboardingWizardAction.mockResolvedValue({
    ok: true,
    data: { redirectTo: "/dashboard" },
  });
  actions.completeOnboardingSetupStepAction.mockResolvedValue({ ok: true, data: { completed: true } });
  vi.stubGlobal("location", { assign });
  actions.saveOnboardingWizardProgressAction.mockImplementation(({ progress }) =>
    Promise.resolve({ ok: true, data: progress }),
  );
});

describe("returning-user onboarding progress", () => {
  function persistentStore() {
    const root = {} as RootStore;
    const ai = new AiConnectionStore(root);
    const store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "de" } } as RootStore);
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
    store.initialize(3, "owner-a", progress);
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
    store.initialize(3, "owner-a");
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
    resolveSave({ ok: false, failure: { kind: "validation", issues: [] } });
    await next;
    expect(store.currentStep).toBe("invite");
    expect(store.isSaving).toBe(false);
  });

  it("serializes selection saves and excludes one-time key values from progress", async () => {
    const { store, ai } = persistentStore();
    store.initialize(3, "owner-a");
    await store.next();
    ai.selectProvider("cursor");
    ai.credentials.cursor = { id: "synthetic-key-id", key: "synthetic-one-time-value", expiresAt: null };
    await store.persistProgress();
    const saved = actions.saveOnboardingWizardProgressAction.mock.calls.at(-1)?.[0];
    expect(saved.progress.ai.apiKeyIds).toEqual({ cursor: "synthetic-key-id" });
    expect(JSON.stringify(saved)).not.toContain("synthetic-one-time-value");
    const returning = persistentStore();
    returning.store.initialize(3, "owner-a", saved.progress);
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
    store.initialize(3, "owner-a", progress);
    expect(ai.canFinish).toBe(true);
    store.initialize(3, "owner-b");
    expect(store.currentStep).toBe("invite");
    expect(ai.canFinish).toBe(false);
    expect(ai.selection.apiKeyIds).toEqual({});
  });

  it("keeps an owner with a pending setup on the setup step even with saved AI progress", async () => {
    const { store } = persistentStore();
    store.initialize(2, "owner-a", { ...readOnboardingWizardProgress(null), step: "ai" });
    expect(store.currentStep).toBe("setup");
    expect(store.isFirstStep).toBe(true);

    await store.next();

    expect(store.currentStep).toBe("invite");
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "invite" }) }),
    );
  });

  it("finishes from the provider chooser without a selected tool", async () => {
    const { store } = persistentStore();
    store.initialize(3, "owner-a", { ...readOnboardingWizardProgress(null), step: "ai" });

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
    store.initialize(3, "owner-a", progress);
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
    store.initialize(3, "owner-a");
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
    store.initialize(3, "owner-a");
    let resolveSave!: (value: unknown) => void;
    actions.saveOnboardingWizardProgressAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const next = store.next();
    await Promise.resolve();
    store.initialize(3, "owner-b");
    resolveSave({ ok: true, data: { ...readOnboardingWizardProgress(null), step: "ai" } });
    await next;
    expect(store.currentStep).toBe("invite");
    expect(store.userId).toBe("owner-b");
  });
});

describe("OnboardingWizardStore", () => {
  it("contains Profile, the workspace setup, Invite, and AI in order", () => {
    const store = new OnboardingWizardStore(rootStore);

    expect(WIZARD_STEPS).toEqual(["profile", "goal", "playbook", "setup", "invite", "ai", "template", "prompt"]);
    expect(store.totalSteps).toBe(5);
    expect(store.currentStep).toBe("profile");
  });

  it("goes from Profile to Invite where the setup is unavailable", async () => {
    const store = new OnboardingWizardStore({
      stepAiStore: { canFinish: true, reset: vi.fn(), restoreSelection: vi.fn() },
    } as unknown as RootStore);
    store.initialize(0, undefined, undefined, false);

    expect(store.steps).toEqual(["profile", "invite", "ai"]);
    expect(store.totalSteps).toBe(3);
    await store.next();
    expect(store.currentStep).toBe("invite");
  });

  it("starts registered owners at the setup and prevents returning to Profile", async () => {
    const store = new OnboardingWizardStore(rootStore);

    store.setInitialStep(2);
    expect(store.currentStep).toBe("setup");
    expect(store.isFirstStep).toBe(true);

    await store.back();
    expect(store.currentStep).toBe("setup");
  });

  it("advances the setup through Invite to the terminal AI step", async () => {
    const store = new OnboardingWizardStore(rootStore);
    store.setInitialStep(2);

    await store.next();
    expect(store.currentStep).toBe("invite");

    await store.next();
    expect(store.currentStep).toBe("ai");

    await store.next();
    expect(store.currentStep).toBe("ai");
  });

  it("resets progress when a different account starts at an earlier step", async () => {
    const store = new OnboardingWizardStore(rootStore);
    store.setInitialStep(2);
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

  it("leaves the wizard with a document load in the person's language, so the shell re-reads the account state", async () => {
    const store = new OnboardingWizardStore(rootStore);

    await store.complete();

    expect(assign).toHaveBeenCalledExactlyOnceWith("/de/dashboard");
    expect(actions.completeOnboardingWizardAction.mock.invocationCallOrder[0]).toBeLessThan(
      assign.mock.invocationCallOrder[0],
    );
  });

  it("stays put when completion failed", async () => {
    actions.completeOnboardingWizardAction.mockResolvedValue({
      ok: false,
      failure: { kind: "validation", issues: [] },
    });
    const store = new OnboardingWizardStore(rootStore);

    await store.complete();

    expect(assign).not.toHaveBeenCalled();
    expect(store.isSubmitting).toBe(false);
  });

  it("starts an empty workspace by closing only the setup step, then continues to the team step", async () => {
    const ai = new AiConnectionStore({} as RootStore);
    const store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "de" } } as RootStore);
    store.initialize(2, "owner-a");
    expect(store.currentStep).toBe("setup");

    await store.completeSetupStep();

    expect(actions.completeOnboardingSetupStepAction).toHaveBeenCalledOnce();
    expect(actions.completeOnboardingWizardAction).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(store.currentStep).toBe("invite");
    expect(store.isFirstStep).toBe(true);
    expect(store.isSubmitting).toBe(false);
  });

  it("stays in the wizard when the setup step cannot be closed", async () => {
    actions.completeOnboardingSetupStepAction.mockResolvedValue({
      ok: false,
      failure: { kind: "validation", issues: [] },
    });
    const store = new OnboardingWizardStore(rootStore);

    await store.completeSetupStep();

    expect(actions.completeOnboardingWizardAction).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("choosing what to do first", () => {
  function goalStore(jobChoice?: {
    selectedJob: "workspace" | "followup" | "agent";
    suggestedJob: "followup" | null;
    suggestedPlaybook?: "consultants" | "agencies" | "freelancers" | "smb" | null;
  }) {
    const ai = new AiConnectionStore({} as RootStore);
    const store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "de" } } as RootStore);
    store.initialize(1, "owner-a", undefined, true, jobChoice);
    return store;
  }

  it("opens on the goal step with the job from the signup preselected", () => {
    const store = goalStore({ selectedJob: "followup", suggestedJob: "followup" });

    expect(store.currentStep).toBe("goal");
    expect(store.selectedJob).toBe("followup");
    expect(store.suggestedJob).toBe("followup");
    expect(store.isFirstStep).toBe(true);
  });

  it("preselects the workspace setup without a signup job and ignores unknown values", () => {
    const store = goalStore();

    expect(store.selectedJob).toBe("workspace");
    store.setSelectedJob("crm");
    expect(store.selectedJob).toBe("workspace");
    store.setSelectedJob("agent");
    expect(store.selectedJob).toBe("agent");
  });

  it("continues to the setup interview for the workspace job and keeps Back from reopening the goal", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "workspace", next: "setup" } });
    const store = goalStore();

    await store.chooseJob();

    expect(actions.selectOnboardingJobAction).toHaveBeenCalledExactlyOnceWith({ job: "workspace" });
    expect(store.currentStep).toBe("setup");
    expect(store.isFirstStep).toBe(true);
  });

  it("goes straight to the AI connection for the agent job and saves that step", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "agent", next: "ai" } });
    const store = goalStore({ selectedJob: "agent", suggestedJob: null });

    await store.chooseJob();

    expect(store.currentStep).toBe("ai");
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "ai" }) }),
    );
  });

  it("shows three steps for the follow-up job and five for the workspace setup", () => {
    const store = goalStore({ selectedJob: "followup", suggestedJob: "followup" });

    expect(store.steps).toEqual(["profile", "goal", "playbook"]);
    store.setSelectedJob("workspace");
    expect(store.steps).toEqual(["profile", "goal", "setup", "invite", "ai"]);
    expect(store.currentStep).toBe("goal");
  });

  it("continues to the job playbook for the follow-up job and keeps Back from reopening the goal", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "followup", next: "playbook" } });
    const store = goalStore({ selectedJob: "followup", suggestedJob: "followup", suggestedPlaybook: "agencies" });

    await store.chooseJob();

    expect(store.currentStep).toBe("playbook");
    expect(store.isFirstStep).toBe(true);
    expect(store.selectedPlaybook).toBe("agencies");
    expect(store.suggestedPlaybook).toBe("agencies");
    expect(assign).not.toHaveBeenCalled();
  });

  it("writes the chosen playbook and leaves for the channel settings", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "followup", next: "playbook" } });
    actions.applyOnboardingPlaybookAction.mockResolvedValue({
      ok: true,
      data: { playbook: "freelancers", pagesWritten: 4, redirectTo: "/w/atlas/settings/channels?from=onboarding" },
    });
    const store = goalStore({ selectedJob: "followup", suggestedJob: "followup" });
    await store.chooseJob();

    await store.applyPlaybook();
    expect(actions.applyOnboardingPlaybookAction).not.toHaveBeenCalled();

    store.setSelectedPlaybook("crm");
    expect(store.selectedPlaybook).toBeNull();
    store.setSelectedPlaybook("freelancers");
    await store.applyPlaybook();

    expect(actions.applyOnboardingPlaybookAction).toHaveBeenCalledExactlyOnceWith({ playbook: "freelancers" });
    expect(assign).toHaveBeenCalledExactlyOnceWith("/de/w/atlas/settings/channels?from=onboarding");
  });

  it("skips the playbook without writing pages", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "followup", next: "playbook" } });
    actions.applyOnboardingPlaybookAction.mockResolvedValue({
      ok: true,
      data: { playbook: null, pagesWritten: 0, redirectTo: "/w/atlas/settings/channels?from=onboarding" },
    });
    const store = goalStore({ selectedJob: "followup", suggestedJob: null, suggestedPlaybook: "smb" });
    await store.chooseJob();

    await store.applyPlaybook(true);

    expect(actions.applyOnboardingPlaybookAction).toHaveBeenCalledExactlyOnceWith({ playbook: null });
    expect(assign).toHaveBeenCalledOnce();
  });

  it("stays on the playbook step when the server refuses it", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "followup", next: "playbook" } });
    actions.applyOnboardingPlaybookAction.mockResolvedValue({ ok: false, failure: { kind: "validation", issues: [] } });
    const store = goalStore({ selectedJob: "followup", suggestedJob: null, suggestedPlaybook: "consultants" });
    await store.chooseJob();

    await store.applyPlaybook();

    expect(store.currentStep).toBe("playbook");
    expect(store.isSubmitting).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("stays on the goal step when the server refuses the choice", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: false, failure: { kind: "validation", issues: [] } });
    const store = goalStore();

    await store.chooseJob();

    expect(store.currentStep).toBe("goal");
    expect(store.isSubmitting).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
