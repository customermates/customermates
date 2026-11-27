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

const channelActions = vi.hoisted(() => ({
  recordChannelSkippedAction: vi.fn(),
  startOnboardingChannelConnectAction: vi.fn(),
}));

vi.mock("../../actions", () => actions);
vi.mock("../../onboarding-channel-actions", () => channelActions);
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("@/core/validation/validation.utils", () => ({ serializedFailureErrorTree: vi.fn(() => ({ errors: [] })) }));

import { OnboardingWizardStore, WIZARD_STEPS } from "../onboarding-wizard.store";
import {
  OnboardingWizardProgressSchema,
  readOnboardingWizardProgress,
} from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";

const TEAM: WizardFlowOptions = { ownerFlow: true, channelAvailable: true, teamInvite: true };
const SOLO: WizardFlowOptions = { ownerFlow: true, channelAvailable: true, teamInvite: false };
const WORKSPACE: WizardJobChoice = { job: "workspace", jobRecorded: true };
const FOLLOWUP: WizardJobChoice = { job: "followup", jobRecorded: true, suggestedPlaybook: "consultants" };

function makeStore() {
  return new OnboardingWizardStore({ localeStore: { locale: "de" } } as RootStore);
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.completeOnboardingWizardAction.mockResolvedValue({ ok: true, data: { redirectTo: "/dashboard" } });
  actions.completeOnboardingSetupStepAction.mockResolvedValue({ ok: true, data: { completed: true } });
  actions.selectOnboardingJobAction.mockResolvedValue({ ok: true, data: { job: "workspace", next: "setup" } });
  actions.applyOnboardingPlaybookAction.mockResolvedValue({ ok: true, data: { redirectTo: "/settings/connections" } });
  channelActions.recordChannelSkippedAction.mockResolvedValue({ ok: true, data: {} });
  vi.stubGlobal("location", { assign });
  actions.saveOnboardingWizardProgressAction.mockImplementation(({ progress }) =>
    Promise.resolve({ ok: true, data: progress }),
  );
});

describe("the steps", () => {
  it("knows every step of the wizard", () => {
    expect(WIZARD_STEPS).toEqual(["profile", "playbook", "setup", "invite", "channel", "finish"]);
  });

  it("gives an invited member only the profile and the finish", () => {
    const store = makeStore();
    store.initialize(0, undefined, undefined, false);
    expect(store.steps).toEqual(["profile", "finish"]);
    expect(store.currentStep).toBe("profile");
  });

  it("shows the invitations only to a team", () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);
    expect(store.steps).toEqual(["profile", "setup", "invite", "channel", "finish"]);
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, SOLO);
    expect(store.steps).toEqual(["profile", "setup", "channel", "finish"]);
  });

  it("starts on the setup with no way back to the profile", () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);
    expect(store.currentStep).toBe("setup");
    expect(store.isFirstStep).toBe(true);
  });

  it("finishes a self-hosted owner right after the profile", () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, false, WORKSPACE, { ownerFlow: true });
    expect(store.steps).toEqual(["profile", "finish"]);
    expect(store.currentStep).toBe("finish");
  });
});

describe("returning-user progress", () => {
  it("restores the invitation tab and keeps the built setup behind", async () => {
    const store = makeStore();
    store.initialize(3, "owner-a", { step: "channel", inviteTab: "email" }, true, WORKSPACE, TEAM);
    expect(store.currentStep).toBe("channel");
    expect(store.inviteTab).toBe("email");
    await store.back();
    expect(store.currentStep).toBe("invite");
    expect(store.isFirstStep).toBe(true);
    await store.back();
    expect(store.currentStep).toBe("invite");
  });

  it("reads stored progress leniently but saves it strictly", () => {
    expect(readOnboardingWizardProgress({ step: "channel", inviteTab: "email", ai: { old: true } })).toEqual({
      step: "channel",
      inviteTab: "email",
    });
    expect(readOnboardingWizardProgress({ step: "handoff", inviteTab: "link" })).toEqual({
      step: "invite",
      inviteTab: "link",
    });
    expect(readOnboardingWizardProgress(null)).toEqual({ step: "invite", inviteTab: "link" });
    expect(OnboardingWizardProgressSchema.safeParse({ step: "invite", inviteTab: "link", ai: {} }).success).toBe(false);
    expect(OnboardingWizardProgressSchema.safeParse({ step: "invite", inviteTab: "link" }).success).toBe(true);
  });

  it("saves the invite tab with the owner's account", async () => {
    const store = makeStore();
    store.initialize(2, "owner-a", undefined, true, WORKSPACE, TEAM);
    store.setInviteTab("email");
    await store.persistProgress();
    expect(actions.saveOnboardingWizardProgressAction).toHaveBeenCalledWith({
      userId: "owner-a",
      progress: { step: "invite", inviteTab: "email" },
    });
  });
});

describe("recording the job", () => {
  it("records the job once when it was not recorded yet", async () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, { job: "workspace", jobRecorded: false }, TEAM);
    await store.recordJob();
    await store.recordJob();
    expect(actions.selectOnboardingJobAction).toHaveBeenCalledTimes(1);
    expect(actions.selectOnboardingJobAction).toHaveBeenCalledWith({ job: "workspace" });
  });

  it("does not record a job that was recorded or without an owner", async () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);
    await store.recordJob();
    store.initialize(0, undefined, undefined, true, { job: "workspace", jobRecorded: false }, TEAM);
    await store.recordJob();
    expect(actions.selectOnboardingJobAction).not.toHaveBeenCalled();
  });

  it("tries again later when recording failed", async () => {
    actions.selectOnboardingJobAction.mockResolvedValueOnce({ ok: false, failure: {} });
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, { job: "followup", jobRecorded: false }, TEAM);
    await store.recordJob();
    expect(store.jobRecorded).toBe(false);
    await store.recordJob();
    expect(actions.selectOnboardingJobAction).toHaveBeenCalledTimes(2);
  });
});

describe("starting empty", () => {
  it("completes the setup step and moves on to the invitations", async () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);
    await store.startEmptyWorkspace();
    expect(actions.completeOnboardingSetupStepAction).toHaveBeenCalledTimes(1);
    expect(store.emptyChosen).toBe(true);
    expect(store.steps).toEqual(["profile", "invite", "channel", "finish"]);
    expect(store.currentStep).toBe("invite");
  });

  it("goes straight to the inbox for a solo owner", async () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, SOLO);
    await store.startEmptyWorkspace();
    expect(store.currentStep).toBe("channel");
  });

  it("goes to the finish when nothing follows", async () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, { ownerFlow: true });
    await store.startEmptyWorkspace();
    expect(store.currentStep).toBe("finish");
  });

  it("stays on the setup when completing the step fails", async () => {
    actions.completeOnboardingSetupStepAction.mockResolvedValueOnce({ ok: false, failure: { kind: "validation" } });
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);
    await store.startEmptyWorkspace();
    expect(store.emptyChosen).toBe(false);
    expect(store.currentStep).toBe("setup");
  });
});

describe("after the setup", () => {
  it("moves from the build to the invitations and on to the inbox", async () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, TEAM);
    await store.completeSetupStep();
    expect(store.currentStep).toBe("invite");
    expect(store.isFirstStep).toBe(true);
    await store.next();
    expect(store.currentStep).toBe("channel");
    expect(store.isLastStep).toBe(true);
  });

  it("goes from the build straight to the inbox for a solo owner", async () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, WORKSPACE, SOLO);
    await store.completeSetupStep();
    expect(store.currentStep).toBe("channel");
  });

  it("records a skipped inbox and moves to the finish", async () => {
    const store = makeStore();
    store.initialize(3, "owner-a", { step: "channel", inviteTab: "link" }, true, WORKSPACE, TEAM);
    await store.leaveChannelStep(true);
    expect(channelActions.recordChannelSkippedAction).toHaveBeenCalledTimes(1);
    expect(store.currentStep).toBe("finish");
  });

  it("does not save progress for the finish step", async () => {
    const store = makeStore();
    store.initialize(3, "owner-a", { step: "channel", inviteTab: "link" }, true, WORKSPACE, TEAM);
    await store.leaveChannelStep(false);
    expect(actions.saveOnboardingWizardProgressAction).not.toHaveBeenCalled();
    expect(channelActions.recordChannelSkippedAction).not.toHaveBeenCalled();
  });
});

describe("finishing", () => {
  it("completes the wizard and opens the workspace in the locale", async () => {
    const store = makeStore();
    store.initialize(1, undefined, undefined, false);
    await store.complete();
    expect(actions.completeOnboardingWizardAction).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/de/dashboard");
  });

  it("stays when completing fails", async () => {
    actions.completeOnboardingWizardAction.mockResolvedValueOnce({ ok: false, failure: { kind: "validation" } });
    const store = makeStore();
    store.initialize(1, undefined, undefined, false);
    await store.complete();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("the follow-up playbook", () => {
  it("applies the suggested playbook and leaves the wizard", async () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, FOLLOWUP, TEAM);
    expect(store.currentStep).toBe("playbook");
    await store.applyPlaybook();
    expect(actions.applyOnboardingPlaybookAction).toHaveBeenCalledWith({ playbook: "consultants" });
    expect(assign).toHaveBeenCalledWith("/de/settings/connections");
  });

  it("skips the playbook without writing pages", async () => {
    const store = makeStore();
    store.initialize(1, "owner-a", undefined, true, FOLLOWUP, TEAM);
    await store.applyPlaybook(true);
    expect(actions.applyOnboardingPlaybookAction).toHaveBeenCalledWith({ playbook: null });
  });
});
