import type { RootStore } from "@/core/stores/root.store";
import type { WizardFlowOptions, WizardJobChoice } from "../onboarding-wizard.store";

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
  recordChannelSkippedAction: vi.fn(),
  startOnboardingChannelConnectAction: vi.fn(),
}));

vi.mock("../../actions", () => actions);
vi.mock("../../onboarding-agent-actions", () => agentActions);
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/actions", () => ({ createApiKeyAction: vi.fn() }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));

import { OnboardingWizardStore, WIZARD_STEPS } from "../onboarding-wizard.store";
import { AiConnectionStore } from "@/components/ai-connection/ai-connection.store";
import { readOnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

const TEAM: WizardFlowOptions = { chooseAvailable: true, channelAvailable: true, teamInvite: true };
const SOLO: WizardFlowOptions = { chooseAvailable: true, channelAvailable: true, teamInvite: false };
const AGENT: WizardJobChoice = { selectedJob: "agent", suggestedJob: null };
const WORKSPACE: WizardJobChoice = { selectedJob: "workspace", suggestedJob: null };

function makeStore() {
  const ai = new AiConnectionStore({} as RootStore);
  const store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "de" } } as RootStore);
  return { store, ai };
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.completeOnboardingWizardAction.mockResolvedValue({ ok: true, data: { redirectTo: "/dashboard" } });
  actions.completeOnboardingSetupStepAction.mockResolvedValue({ ok: true, data: { completed: true } });
  agentActions.getOnboardingAgentStatusAction.mockResolvedValue({
    ok: true,
    data: { connected: true, schemaRevision: 7 },
  });
  agentActions.recordChannelSkippedAction.mockResolvedValue({ ok: true, data: {} });
  vi.stubGlobal("location", { assign });
  actions.saveOnboardingWizardProgressAction.mockImplementation(({ progress }) =>
    Promise.resolve({ ok: true, data: progress }),
  );
});

describe("the steps", () => {
  it("knows every step of the wizard", () => {
    expect(WIZARD_STEPS).toEqual([
      "profile",
      "goal",
      "playbook",
      "setup",
      "ai",
      "handoff",
      "invite",
      "channel",
      "finish",
    ]);
  });

  it("gives an invited member only the profile and the finish", () => {
    const { store } = makeStore();
    store.initialize(0, undefined, undefined, false);
    expect(store.steps).toEqual(["profile", "finish"]);
    expect(store.currentStep).toBe("profile");
  });

  it("shows the invitations only to a team", () => {
    const { store } = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);
    expect(store.steps).toEqual(["profile", "goal", "setup", "invite", "channel"]);
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, SOLO);
    expect(store.steps).toEqual(["profile", "goal", "setup", "channel"]);
  });

  it("follows the selected job while the owner is on the goal", () => {
    const { store } = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);
    store.setSelectedJob("agent");
    expect(store.steps).toEqual(["profile", "goal", "ai", "handoff", "invite", "channel"]);
    store.setSelectedJob("crm");
    expect(store.selectedJob).toBe("agent");
    expect(store.currentStep).toBe("goal");
  });
});

describe("returning-user progress", () => {
  it("restores the AI method and invitation tab on the agent path and allows Back to the goal", async () => {
    const { store, ai } = makeStore();
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
    store.initialize(2, "owner-a", progress, true, AGENT, TEAM);
    expect(store.currentStep).toBe("ai");
    expect(store.inviteTab).toBe("email");
    expect(ai.connectorProvider).toBe("claude");
    expect(store.isFirstStep).toBe(false);
    await store.back();
    expect(store.currentStep).toBe("goal");
    expect(store.isFirstStep).toBe(true);
  });

  it("waits for a successful server save before advancing and stays put on failure", async () => {
    const { store } = makeStore();
    store.initialize(2, "owner-a", undefined, true, AGENT, TEAM);
    let resolveSave!: (value: unknown) => void;
    actions.saveOnboardingWizardProgressAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const next = store.next();
    await vi.waitFor(() => expect(resolveSave).toBeTypeOf("function"));
    expect(store.currentStep).toBe("ai");
    expect(store.isSaving).toBe(true);
    resolveSave({ ok: false, failure: { kind: "validation", issues: [] } });
    await next;
    expect(store.currentStep).toBe("ai");
    expect(store.isSaving).toBe(false);
  });

  it("excludes one-time key values from the saved progress", async () => {
    const { store, ai } = makeStore();
    store.initialize(2, "owner-a", undefined, true, AGENT, TEAM);
    ai.selectProvider("cursor");
    ai.credentials.cursor = { id: "synthetic-key-id", key: "synthetic-one-time-value", expiresAt: null };
    await store.persistProgress();
    const saved = actions.saveOnboardingWizardProgressAction.mock.calls.at(-1)?.[0];
    expect(saved.progress.ai.apiKeyIds).toEqual({ cursor: "synthetic-key-id" });
    expect(saved.progress).not.toHaveProperty("template");
    expect(JSON.stringify(saved)).not.toContain("synthetic-one-time-value");
  });

  it("clears the prior account's AI selection for a different user", () => {
    const { store, ai } = makeStore();
    const progress = {
      ...readOnboardingWizardProgress(null),
      step: "ai" as const,
      ai: { ...readOnboardingWizardProgress(null).ai, selectedProvider: "claude" as const },
    };
    store.initialize(2, "owner-a", progress, true, AGENT, TEAM);
    expect(ai.selectedProvider).toBe("claude");
    store.initialize(2, "owner-b", undefined, true, AGENT, TEAM);
    expect(ai.selection.selectedProvider).toBeNull();
  });

  it("does not let an old account's in-flight save advance a new account", async () => {
    const { store } = makeStore();
    store.initialize(2, "owner-a", undefined, true, AGENT, TEAM);
    let resolveSave!: (value: unknown) => void;
    actions.saveOnboardingWizardProgressAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const next = store.next();
    await vi.waitFor(() => expect(resolveSave).toBeTypeOf("function"));
    store.initialize(2, "owner-b", undefined, true, AGENT, TEAM);
    resolveSave({ ok: true, data: { ...readOnboardingWizardProgress(null), step: "handoff" } });
    await next;
    expect(store.currentStep).toBe("ai");
    expect(store.userId).toBe("owner-b");
  });
});

describe("choosing who builds the workspace", () => {
  it("opens the setup for the Mate job and allows Back to the goal", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "workspace", next: "setup" } });
    const { store } = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);

    await store.chooseJob();

    expect(actions.selectOnboardingJobAction).toHaveBeenCalledExactlyOnceWith({ job: "workspace" });
    expect(store.currentStep).toBe("setup");
    expect(store.isFirstStep).toBe(false);
  });

  it("goes to the agent connection for the agent job and saves that step", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "agent", next: "ai" } });
    const { store } = makeStore();
    store.initialize(1, "owner-a", undefined, true, AGENT, TEAM);

    await store.chooseJob();

    expect(store.currentStep).toBe("ai");
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "ai" }) }),
    );
  });

  it("opens the cloud trial instead of choosing Mate on a self-hosted instance", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const { store } = makeStore();
    store.initialize(1, "owner-a", undefined, false, WORKSPACE, { chooseAvailable: true, selfHosted: true });

    expect(store.steps).toEqual(["profile", "goal", "ai", "handoff"]);
    expect(store.isCloudMateUpsell).toBe(true);
    await store.chooseJob();

    expect(actions.selectOnboardingJobAction).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
    expect(store.cloudTrialOpened).toBe(true);
    expect(store.currentStep).toBe("goal");
  });

  it("stays on the goal when the server refuses the choice", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: false, failure: { kind: "validation", issues: [] } });
    const { store } = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);

    await store.chooseJob();

    expect(store.currentStep).toBe("goal");
    expect(store.isSubmitting).toBe(false);
  });
});

describe("starting empty", () => {
  it("closes the setup step and continues with the team", async () => {
    const { store } = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);

    await store.startEmptyWorkspace();

    expect(actions.completeOnboardingSetupStepAction).toHaveBeenCalledOnce();
    expect(store.emptyChosen).toBe(true);
    expect(store.steps).toEqual(["profile", "goal", "invite", "channel"]);
    expect(store.currentStep).toBe("invite");
    expect(actions.completeOnboardingWizardAction).not.toHaveBeenCalled();
  });

  it("opens the workspace right away when nothing follows", async () => {
    const { store } = makeStore();
    store.initialize(1, "owner-a", undefined, false, WORKSPACE, { chooseAvailable: true, selfHosted: true });

    await store.startEmptyWorkspace();

    expect(store.steps).toEqual(["profile", "goal"]);
    expect(actions.completeOnboardingWizardAction).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/de/dashboard");
  });

  it("stays on the goal when the setup step cannot be closed", async () => {
    actions.completeOnboardingSetupStepAction.mockResolvedValue({
      ok: false,
      failure: { kind: "validation", issues: [] },
    });
    const { store } = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);

    await store.startEmptyWorkspace();

    expect(store.emptyChosen).toBe(false);
    expect(store.currentStep).toBe("goal");
    expect(actions.completeOnboardingWizardAction).not.toHaveBeenCalled();
  });
});

describe("the Mate setup", () => {
  it("continues from the build to the invitations without a way back", async () => {
    const { store } = makeStore();
    store.initialize(2, "owner-a", undefined, true, WORKSPACE, TEAM);
    expect(store.currentStep).toBe("setup");

    await store.completeSetupStep();

    expect(actions.completeOnboardingSetupStepAction).toHaveBeenCalledOnce();
    expect(store.currentStep).toBe("invite");
    expect(store.isFirstStep).toBe(true);
  });

  it("goes to the inbox for a solo owner", async () => {
    const { store } = makeStore();
    store.initialize(2, "owner-a", undefined, true, WORKSPACE, SOLO);

    await store.completeSetupStep();

    expect(store.currentStep).toBe("channel");
  });

  it("stays on the setup when the step cannot be closed", async () => {
    actions.completeOnboardingSetupStepAction.mockResolvedValue({
      ok: false,
      failure: { kind: "validation", issues: [] },
    });
    const { store } = makeStore();
    store.initialize(2, "owner-a", undefined, true, WORKSPACE, TEAM);

    await store.completeSetupStep();

    expect(store.currentStep).toBe("setup");
    expect(actions.completeOnboardingWizardAction).not.toHaveBeenCalled();
  });
});

describe("the agent path", () => {
  it("hands over to the agent and takes a fresh baseline of its changes", async () => {
    const { store } = makeStore();
    store.initialize(
      2,
      "owner-a",
      { ...readOnboardingWizardProgress(null), step: "ai", schemaBaseline: 3 },
      true,
      AGENT,
      TEAM,
    );
    expect(store.schemaBaseline).toBe(3);

    await store.continueFromConnect();
    await vi.waitFor(() => expect(store.schemaBaseline).toBe(7));

    expect(store.currentStep).toBe("handoff");
    expect(store.agentConnected).toBe(true);
    expect(store.agentChanged).toBe(false);
  });

  it("notices the agent's first change on the handoff", async () => {
    const { store } = makeStore();
    store.initialize(2, "owner-a", undefined, true, AGENT, TEAM);
    await store.continueFromConnect();
    await vi.waitFor(() => expect(store.schemaBaseline).toBe(7));

    agentActions.getOnboardingAgentStatusAction.mockResolvedValue({
      ok: true,
      data: { connected: true, schemaRevision: 9 },
    });
    await store.refreshAgentStatus();

    expect(store.agentChanged).toBe(true);
  });

  it("continues from the handoff to the invitations and finishes after the inbox", async () => {
    const { store } = makeStore();
    store.initialize(3, "owner-a", undefined, true, AGENT, TEAM);

    await store.advance();
    expect(store.currentStep).toBe("invite");
    await store.advance();
    expect(store.currentStep).toBe("channel");
    await store.leaveChannelStep(true);

    expect(agentActions.recordChannelSkippedAction).toHaveBeenCalledOnce();
    expect(actions.completeOnboardingWizardAction).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/de/dashboard");
  });
});

describe("completing the wizard", () => {
  it("leaves the wizard with a document load in the person's language", async () => {
    const { store } = makeStore();
    store.initialize(1, undefined, undefined, false);

    await store.complete();

    expect(actions.completeOnboardingWizardAction).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/de/dashboard");
    expect(store.isSubmitting).toBe(false);
  });

  it("stays put when completion failed", async () => {
    actions.completeOnboardingWizardAction.mockResolvedValue({
      ok: false,
      failure: { kind: "validation", issues: [] },
    });
    const { store } = makeStore();
    store.initialize(1, undefined, undefined, false);

    await store.complete();

    expect(assign).not.toHaveBeenCalled();
    expect(store.isSubmitting).toBe(false);
  });
});

describe("the follow-up job", () => {
  async function playbookStore(suggestedPlaybook: "consultants" | "agencies" | "freelancers" | "smb" | null) {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "followup", next: "playbook" } });
    const { store } = makeStore();
    store.initialize(
      1,
      "owner-a",
      undefined,
      true,
      { selectedJob: "followup", suggestedJob: "followup", suggestedPlaybook },
      TEAM,
    );
    await store.chooseJob();
    return store;
  }

  it("continues to the playbook with the suggestion preselected", async () => {
    const store = await playbookStore("agencies");

    expect(store.steps).toEqual(["profile", "goal", "playbook"]);
    expect(store.currentStep).toBe("playbook");
    expect(store.selectedPlaybook).toBe("agencies");
    expect(assign).not.toHaveBeenCalled();
  });

  it("writes the chosen playbook and leaves for the channel settings", async () => {
    actions.applyOnboardingPlaybookAction.mockResolvedValue({
      ok: true,
      data: { playbook: "freelancers", pagesWritten: 4, redirectTo: "/w/atlas/settings/channels?from=onboarding" },
    });
    const store = await playbookStore(null);

    await store.applyPlaybook();
    expect(actions.applyOnboardingPlaybookAction).not.toHaveBeenCalled();

    store.setSelectedPlaybook("crm");
    expect(store.selectedPlaybook).toBeNull();
    store.setSelectedPlaybook("freelancers");
    await store.applyPlaybook();

    expect(actions.applyOnboardingPlaybookAction).toHaveBeenCalledExactlyOnceWith({ playbook: "freelancers" });
    expect(assign).toHaveBeenCalledExactlyOnceWith("/de/w/atlas/settings/channels?from=onboarding");
  });

  it("stays on the playbook step when the server refuses it", async () => {
    actions.applyOnboardingPlaybookAction.mockResolvedValue({ ok: false, failure: { kind: "validation", issues: [] } });
    const store = await playbookStore("consultants");

    await store.applyPlaybook();

    expect(store.currentStep).toBe("playbook");
    expect(assign).not.toHaveBeenCalled();
  });
});
