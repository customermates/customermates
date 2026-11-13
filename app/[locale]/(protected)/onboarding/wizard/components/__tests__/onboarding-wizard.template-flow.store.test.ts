import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  applyOnboardingPlaybookAction: vi.fn(),
  completeOnboardingSetupStepAction: vi.fn(),
  completeOnboardingWizardAction: vi.fn(),
  saveOnboardingWizardProgressAction: vi.fn(),
  selectOnboardingJobAction: vi.fn(),
}));
const agentActions = vi.hoisted(() => ({
  getOnboardingAgentStatusAction: vi.fn(),
  getOnboardingTemplatePromptAction: vi.fn(),
}));
const assign = vi.hoisted(() => vi.fn());
const open = vi.hoisted(() => vi.fn());

vi.mock("../../actions", () => actions);
vi.mock("../../onboarding-agent-actions", () => agentActions);
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/actions", () => ({ createApiKeyAction: vi.fn() }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));

import { OnboardingWizardStore, type WizardFlowOptions } from "../onboarding-wizard.store";
import { resolveWizardResume } from "../onboarding-wizard-flow";
import { AiConnectionStore } from "@/components/ai-connection/ai-connection.store";
import { readOnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

const CLOUD_FLOW: WizardFlowOptions = { chooseAvailable: true, templatesAvailable: true, template: "sales-pipeline" };

function newStore() {
  const ai = new AiConnectionStore({} as RootStore);
  const store = new OnboardingWizardStore({ stepAiStore: ai, localeStore: { locale: "de" } } as RootStore);
  return { store, ai };
}

function atGoal(job: "agent" | "workspace" | "followup", flow: WizardFlowOptions = CLOUD_FLOW, setupAvailable = true) {
  const { store, ai } = newStore();
  store.initialize(1, "owner-a", undefined, setupAvailable, { selectedJob: job, suggestedJob: null }, flow);
  return { store, ai };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("location", { assign });
  vi.stubGlobal("open", open);
  actions.completeOnboardingWizardAction.mockResolvedValue({ ok: true, data: { redirectTo: "/dashboard" } });
  actions.completeOnboardingSetupStepAction.mockResolvedValue({ ok: true, data: { completed: true } });
  actions.saveOnboardingWizardProgressAction.mockImplementation(({ progress }) =>
    Promise.resolve({ ok: true, data: progress }),
  );
  agentActions.getOnboardingAgentStatusAction.mockResolvedValue({
    ok: true,
    data: { connected: false, schemaRevision: 3 },
  });
});

describe("the user's own agent", () => {
  it("opens the connect step and lets Back return to the goal step", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "agent", next: "ai" } });
    const { store } = atGoal("agent");

    await store.chooseJob();

    expect(store.currentStep).toBe("ai");
    expect(store.connectsAgent).toBe(true);
    expect(store.isFirstStep).toBe(false);
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "ai" }) }),
    );

    await store.back();
    expect(store.currentStep).toBe("goal");
    expect(store.isFirstStep).toBe(true);
  });

  it("saves the goal step with the chosen path when Back returns to it", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "agent", next: "ai" } });
    const { store } = atGoal("agent");
    await store.chooseJob();

    await store.back();

    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "goal", job: "agent" }) }),
    );
  });

  it("resumes on the goal step after Back when the page reloads or refreshes on refocus", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "agent", next: "ai" } });
    const { store } = atGoal("agent");
    await store.chooseJob();
    await store.back();
    const saved = readOnboardingWizardProgress(actions.saveOnboardingWizardProgressAction.mock.lastCall?.[0].progress);

    const resume = resolveWizardResume({
      setupAvailable: true,
      chooseAvailable: true,
      templatesAvailable: true,
      profileCompleted: true,
      isInvited: false,
      setupStepCompleted: true,
      jobSelected: true,
      job: saved.job ?? "agent",
      savedStep: saved.step,
    });
    const { store: reloaded } = newStore();
    reloaded.initialize(
      resume.resumeStepIndex,
      "owner-a",
      saved,
      true,
      { selectedJob: saved.job ?? "agent", suggestedJob: null },
      CLOUD_FLOW,
    );

    expect(reloaded.currentStep).toBe("goal");
    expect(reloaded.selectedJob).toBe("agent");
    expect(reloaded.isFirstStep).toBe(true);
  });

  it("saves the path picked on the goal step and keeps it only while the step is open", async () => {
    const { store } = atGoal("agent");

    store.setSelectedJob("workspace");
    await store.persistProgress();
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "goal", job: "workspace" }) }),
    );

    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "workspace", next: "setup" } });
    await store.chooseJob();
    await store.persistProgress();
    expect(store.currentStep).toBe("template");
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "template", job: null }) }),
    );
  });

  it("restores the saved goal step and its path when the page opens again", () => {
    const { store } = newStore();
    const saved = { ...readOnboardingWizardProgress(null), step: "goal" as const, job: "workspace" as const };

    store.initialize(1, "owner-a", saved, true, { selectedJob: "workspace", suggestedJob: null }, CLOUD_FLOW);

    expect(store.currentStep).toBe("goal");
    expect(store.selectedJob).toBe("workspace");
    expect(store.steps).toEqual(["profile", "goal", "template", "setup", "invite", "ai"]);
  });

  it("moves from the connect step to the template step and saves it", async () => {
    const { store } = atGoal("agent");
    store.initialize(2, "owner-a", undefined, true, { selectedJob: "agent", suggestedJob: null }, CLOUD_FLOW);
    expect(store.currentStep).toBe("ai");

    await store.continueFromConnect();

    expect(store.currentStep).toBe("template");
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "template", template: "sales-pipeline" }) }),
    );
  });

  it("finishes the wizard from the connect step when no template is offered", async () => {
    const { store } = atGoal("agent", { chooseAvailable: true, templatesAvailable: false });
    store.initialize(
      2,
      "owner-a",
      undefined,
      true,
      { selectedJob: "agent", suggestedJob: null },
      {
        chooseAvailable: true,
        templatesAvailable: false,
      },
    );

    await store.continueFromConnect();

    expect(actions.completeOnboardingWizardAction).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/de/dashboard");
  });

  it("finishes even with a half-configured tool, because the connection is verified instead", async () => {
    const { store, ai } = atGoal("agent");
    store.initialize(2, "owner-a", undefined, true, { selectedJob: "agent", suggestedJob: null }, CLOUD_FLOW);
    ai.selectProvider("cursor");

    await store.complete();

    expect(actions.completeOnboardingWizardAction).toHaveBeenCalledOnce();
  });

  it("takes the chosen template to the prompt step and starts watching from the model revision at that moment", async () => {
    const { store } = atGoal("agent");
    store.initialize(3, "owner-a", undefined, true, { selectedJob: "agent", suggestedJob: null }, CLOUD_FLOW);
    expect(store.currentStep).toBe("template");

    await store.confirmTemplate();
    await vi.waitFor(() => expect(store.schemaBaseline).toBe(3));

    expect(store.currentStep).toBe("prompt");
    expect(store.agentChanged).toBe(false);
    agentActions.getOnboardingAgentStatusAction.mockResolvedValue({
      ok: true,
      data: { connected: true, schemaRevision: 4 },
    });
    await store.refreshAgentStatus();

    expect(store.agentChanged).toBe(true);
    expect(store.agentConnected).toBe(true);
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenCalledWith(
      expect.objectContaining({ progress: expect.objectContaining({ step: "prompt", template: "sales-pipeline" }) }),
    );
  });

  it("keeps the baseline of an earlier visit so a reload does not hide the agent's change", () => {
    const { store } = newStore();
    store.initialize(
      4,
      "owner-a",
      {
        step: "prompt",
        inviteTab: "link",
        ai: store.savedProgress?.ai ?? initialAi(),
        template: "client-tracker",
        schemaBaseline: 7,
      },
      true,
      { selectedJob: "agent", suggestedJob: null },
      { ...CLOUD_FLOW, template: "sales-pipeline" },
    );

    expect(store.currentStep).toBe("prompt");
    expect(store.schemaBaseline).toBe(7);
    expect(store.selectedTemplate).toBe("client-tracker");
  });

  it("finishes without a template from the template step", async () => {
    const { store } = atGoal("agent");
    store.initialize(3, "owner-a", undefined, true, { selectedJob: "agent", suggestedJob: null }, CLOUD_FLOW);

    await store.skipTemplate();

    expect(actions.completeOnboardingWizardAction).toHaveBeenCalledOnce();
  });

  it("goes back from the prompt to the template and from there to the connect step", async () => {
    const { store } = atGoal("agent");
    store.initialize(4, "owner-a", undefined, true, { selectedJob: "agent", suggestedJob: null }, CLOUD_FLOW);

    await store.back();
    expect(store.currentStep).toBe("template");
    await store.back();
    expect(store.currentStep).toBe("ai");
  });
});

describe("Mate with a template", () => {
  it("opens the template step before the setup and keeps the goal step reachable", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "workspace", next: "setup" } });
    const { store } = atGoal("workspace");

    await store.chooseJob();

    expect(store.currentStep).toBe("template");
    expect(store.isFirstStep).toBe(false);
    expect(store.connectsAgent).toBe(false);
  });

  it("goes to the setup with the picked template and closes the way back", async () => {
    const { store } = atGoal("workspace");
    store.initialize(2, "owner-a", undefined, true, { selectedJob: "workspace", suggestedJob: null }, CLOUD_FLOW);
    store.setSelectedTemplate("client-tracker");

    await store.confirmTemplate();

    expect(store.currentStep).toBe("setup");
    expect(store.selectedTemplate).toBe("client-tracker");
    expect(store.isFirstStep).toBe(true);
  });

  it("goes to the setup without a template when the owner chooses none", async () => {
    const { store } = atGoal("workspace");
    store.initialize(2, "owner-a", undefined, true, { selectedJob: "workspace", suggestedJob: null }, CLOUD_FLOW);

    await store.skipTemplate();

    expect(store.currentStep).toBe("setup");
    expect(store.selectedTemplate).toBeNull();
    expect(actions.completeOnboardingWizardAction).not.toHaveBeenCalled();
  });

  it("goes straight to the setup when no template is offered", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "workspace", next: "setup" } });
    const { store } = atGoal("workspace", { chooseAvailable: true, templatesAvailable: false, template: null });

    await store.chooseJob();

    expect(store.currentStep).toBe("setup");
    expect(store.isFirstStep).toBe(true);
  });

  it("refuses a template slug the library does not know", () => {
    const { store } = atGoal("workspace");

    store.setSelectedTemplate("../../etc");

    expect(store.selectedTemplate).toBe("sales-pipeline");
  });
});

describe("the empty workspace", () => {
  it("closes the setup step, continues to the team step and keeps it there", async () => {
    const { store } = atGoal("agent");

    await store.startEmptyWorkspace();

    expect(actions.completeOnboardingSetupStepAction).toHaveBeenCalledOnce();
    expect(actions.selectOnboardingJobAction).not.toHaveBeenCalled();
    expect(store.steps).toEqual(["profile", "goal", "invite", "ai"]);
    expect(store.currentStep).toBe("invite");
    expect(store.isFirstStep).toBe(true);
    expect(store.connectsAgent).toBe(false);
  });

  it("keeps the plain AI step after a reload even though the own agent is still preselected", () => {
    const { store } = newStore();

    store.initialize(
      2,
      "owner-a",
      undefined,
      true,
      { selectedJob: "agent", suggestedJob: null },
      { ...CLOUD_FLOW, emptyChosen: true },
    );

    expect(store.steps).toEqual(["profile", "goal", "invite", "ai"]);
    expect(store.currentStep).toBe("invite");
    expect(store.connectsAgent).toBe(false);
  });

  it("stays on the goal step when the server refuses", async () => {
    actions.completeOnboardingSetupStepAction.mockResolvedValue({
      ok: false,
      failure: { kind: "validation", issues: [] },
    });
    const { store } = atGoal("agent");

    await store.startEmptyWorkspace();

    expect(store.currentStep).toBe("goal");
    expect(store.emptyChosen).toBe(false);
  });
});

describe("a self-hosted instance", () => {
  const hosted: WizardFlowOptions = { chooseAvailable: true, templatesAvailable: true, selfHosted: true };

  it("opens the cloud trial for Mate in a new tab without recording a choice or leaving the instance", async () => {
    const { store } = atGoal("workspace", hosted, false);

    await store.chooseJob();

    expect(store.isCloudMateUpsell).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "https://customermates.com/de/auth/signup?job=workspace",
      "_blank",
      "noopener,noreferrer",
    );
    expect(store.cloudTrialOpened).toBe(true);
    expect(actions.selectOnboardingJobAction).not.toHaveBeenCalled();
    expect(store.currentStep).toBe("goal");
  });

  it("connects the own agent like on the cloud", async () => {
    actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "agent", next: "ai" } });
    const { store } = atGoal("agent", hosted, false);

    await store.chooseJob();

    expect(store.currentStep).toBe("ai");
    expect(store.steps).toEqual(["profile", "goal", "ai", "template", "prompt"]);
  });
});

describe("the agent status", () => {
  it("never un-connects an agent and flags a failed read", async () => {
    const { store } = atGoal("agent");
    agentActions.getOnboardingAgentStatusAction.mockResolvedValueOnce({
      ok: true,
      data: { connected: true, schemaRevision: 1 },
    });
    await store.refreshAgentStatus();
    agentActions.getOnboardingAgentStatusAction.mockResolvedValueOnce({
      ok: true,
      data: { connected: false, schemaRevision: 1 },
    });
    await store.refreshAgentStatus();
    expect(store.agentConnected).toBe(true);

    agentActions.getOnboardingAgentStatusAction.mockResolvedValueOnce({
      ok: false,
      failure: { kind: "validation", issues: [] },
    });
    await store.refreshAgentStatus();
    expect(store.agentStatusFailed).toBe(true);
    expect(store.agentConnected).toBe(true);

    await store.refreshAgentStatus();
    expect(store.agentStatusFailed).toBe(false);
  });
});

describe("the template prompt", () => {
  it("loads the prompt of the selected template once and reloads it for another template", async () => {
    agentActions.getOnboardingTemplatePromptAction.mockResolvedValue({ ok: true, data: { prompt: "# Sales" } });
    const { store } = atGoal("agent");

    await store.loadPrompt();
    await store.loadPrompt();

    expect(agentActions.getOnboardingTemplatePromptAction).toHaveBeenCalledExactlyOnceWith({ slug: "sales-pipeline" });
    expect(store.promptState).toBe("ready");
    expect(store.promptText).toBe("# Sales");

    agentActions.getOnboardingTemplatePromptAction.mockResolvedValue({ ok: true, data: { prompt: "# Tracker" } });
    store.setSelectedTemplate("client-tracker");
    expect(store.promptState).toBe("idle");
    await store.loadPrompt();

    expect(store.promptText).toBe("# Tracker");
  });

  it("reports a prompt that cannot be rendered and lets the user retry", async () => {
    agentActions.getOnboardingTemplatePromptAction.mockResolvedValueOnce({ ok: true, data: { prompt: null } });
    const { store } = atGoal("agent");

    await store.loadPrompt();
    expect(store.promptState).toBe("failed");

    agentActions.getOnboardingTemplatePromptAction.mockResolvedValueOnce({ ok: true, data: { prompt: "# Sales" } });
    store.retryPrompt();
    await store.loadPrompt();
    expect(store.promptState).toBe("ready");
  });

  it("fails when the server action fails and ignores an answer for a template picked since", async () => {
    agentActions.getOnboardingTemplatePromptAction.mockRejectedValueOnce(new Error("offline"));
    const { store } = atGoal("agent");
    await store.loadPrompt();
    expect(store.promptState).toBe("failed");

    store.retryPrompt();
    let resolveLate!: (value: unknown) => void;
    agentActions.getOnboardingTemplatePromptAction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLate = resolve;
      }),
    );
    const late = store.loadPrompt();
    store.setSelectedTemplate("client-tracker");
    resolveLate({ ok: true, data: { prompt: "# stale" } });
    await late;

    expect(store.promptText).toBeNull();
    expect(store.promptState).toBe("idle");
  });
});

function initialAi() {
  const { ai } = newStore();
  return ai.selection;
}
