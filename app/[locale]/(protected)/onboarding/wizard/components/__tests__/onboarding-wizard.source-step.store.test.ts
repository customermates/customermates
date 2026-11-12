import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  applyOnboardingPlaybookAction: vi.fn(),
  completeOnboardingSetupStepAction: vi.fn(),
  completeOnboardingWizardAction: vi.fn(),
  recordDiscoveryAnswerAction: vi.fn(),
  saveOnboardingWizardProgressAction: vi.fn(),
  selectOnboardingJobAction: vi.fn(),
}));
const agentActions = vi.hoisted(() => ({
  getOnboardingAgentStatusAction: vi.fn(),
  getOnboardingTemplatePromptAction: vi.fn(),
}));
const reportApplicationError = vi.hoisted(() => vi.fn());

vi.mock("../../actions", () => actions);
vi.mock("../../onboarding-agent-actions", () => agentActions);
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/actions", () => ({ createApiKeyAction: vi.fn() }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError }));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { AiConnectionStore } from "@/components/ai-connection/ai-connection.store";

function atSource() {
  const store = new OnboardingWizardStore({
    stepAiStore: new AiConnectionStore({} as RootStore),
    localeStore: { locale: "de" },
  } as RootStore);
  store.initialize(
    1,
    "owner-a",
    undefined,
    true,
    { selectedJob: "agent", suggestedJob: null },
    { chooseAvailable: true, templatesAvailable: true, sourceAvailable: true },
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.recordDiscoveryAnswerAction.mockResolvedValue({ ok: true, data: { recorded: true } });
});

describe("the optional source question in the wizard", () => {
  it("opens between the profile and the goal step", () => {
    const store = atSource();

    expect(store.steps.slice(0, 3)).toEqual(["profile", "source", "goal"]);
    expect(store.currentStep).toBe("source");
  });

  it("keeps Continue unavailable until a choice is made", async () => {
    const store = atSource();

    await store.answerSource();

    expect(actions.recordDiscoveryAnswerAction).not.toHaveBeenCalled();
    expect(store.currentStep).toBe("source");
  });

  it("sends the choice and moves on to the goal step without a way back", async () => {
    const store = atSource();
    store.setSelectedDiscovery("aiAssistant");

    await store.answerSource();

    expect(actions.recordDiscoveryAnswerAction).toHaveBeenCalledExactlyOnceWith({
      choice: "aiAssistant",
      detail: "",
    });
    expect(store.currentStep).toBe("goal");
    expect(store.isFirstStep).toBe(true);
  });

  it("sends the free text of the other choice", async () => {
    const store = atSource();
    store.setSelectedDiscovery("other");
    store.setDiscoveryDetail("a podcast");

    await store.answerSource();

    expect(actions.recordDiscoveryAnswerAction).toHaveBeenCalledExactlyOnceWith({
      choice: "other",
      detail: "a podcast",
    });
  });

  it("limits the free text and ignores a choice the question does not offer", () => {
    const store = atSource();

    store.setDiscoveryDetail("x".repeat(500));
    store.setSelectedDiscovery("billboard");

    expect(store.discoveryDetail).toHaveLength(120);
    expect(store.selectedDiscovery).toBeNull();
  });

  it("records a skip as a null choice and moves on", async () => {
    const store = atSource();
    store.setSelectedDiscovery("directory");

    await store.answerSource(true);

    expect(actions.recordDiscoveryAnswerAction).toHaveBeenCalledExactlyOnceWith({ choice: null, detail: "" });
    expect(store.currentStep).toBe("goal");
  });

  it("never blocks the owner when the answer cannot be sent", async () => {
    actions.recordDiscoveryAnswerAction.mockRejectedValue(new Error("offline"));
    const store = atSource();

    await store.answerSource(true);

    expect(reportApplicationError).toHaveBeenCalledOnce();
    expect(store.currentStep).toBe("goal");
    expect(store.isSubmitting).toBe(false);
  });

  it("does nothing outside the question", async () => {
    const store = atSource();
    store.setSelectedDiscovery("directory");
    await store.answerSource();
    expect(store.currentStep).toBe("goal");

    await store.answerSource(true);

    expect(actions.recordDiscoveryAnswerAction).toHaveBeenCalledOnce();
  });
});
