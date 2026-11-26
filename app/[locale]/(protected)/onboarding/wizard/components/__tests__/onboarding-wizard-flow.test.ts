import { describe, expect, it } from "vitest";

import {
  buildWizardFlowContext,
  persistedWizardStep,
  resolveWizardResume,
  wizardBackFloor,
  wizardJob,
  wizardOwnerFlow,
  wizardSteps,
} from "../onboarding-wizard-flow";

const CLOUD_TEAM = { setupAvailable: true, ownerFlow: true, channelAvailable: true, teamInvite: true };
const CLOUD_SOLO = { ...CLOUD_TEAM, teamInvite: false };
const SELF_HOSTED = { setupAvailable: false, ownerFlow: true, channelAvailable: false, teamInvite: false };
const INVITED = { setupAvailable: false };

describe("the flow context", () => {
  const owner = {
    appMode: "cloud" as const,
    isInvited: false,
    profileCompleted: false,
    setupOffered: false,
    teamSize: "small" as const,
  };

  it("gives a cloud owner of a team the setup, the channel and team invites", () => {
    expect(buildWizardFlowContext(owner)).toEqual(CLOUD_TEAM);
  });

  it("asks for no team invites from a solo owner or one who did not say", () => {
    expect(buildWizardFlowContext({ ...owner, teamSize: "solo" }).teamInvite).toBe(false);
    expect(buildWizardFlowContext({ ...owner, teamSize: null }).teamInvite).toBe(false);
  });

  it("opens the setup for a registered owner only when the setup is offered", () => {
    expect(buildWizardFlowContext({ ...owner, profileCompleted: true }).setupAvailable).toBe(false);
    expect(buildWizardFlowContext({ ...owner, profileCompleted: true, setupOffered: true }).setupAvailable).toBe(true);
  });

  it("keeps the setup and the channel step away from a self-hosted owner", () => {
    expect(buildWizardFlowContext({ ...owner, appMode: "self-hosted", teamSize: null })).toEqual(SELF_HOSTED);
  });

  it("gives invited members and the demo no owner flow", () => {
    expect(buildWizardFlowContext({ ...owner, isInvited: true })).toEqual({
      setupAvailable: false,
      ownerFlow: false,
      channelAvailable: false,
      teamInvite: false,
    });
    expect(buildWizardFlowContext({ ...owner, appMode: "demo" }).ownerFlow).toBe(false);
    expect(wizardOwnerFlow("demo", false)).toBe(false);
    expect(wizardOwnerFlow("cloud", true)).toBe(false);
    expect(wizardOwnerFlow("self-hosted", false)).toBe(true);
  });
});

describe("the job", () => {
  it("follows up only when the owner picked or signed up for following up", () => {
    expect(wizardJob({ selectedJob: null, signupJob: "followup" })).toBe("followup");
    expect(wizardJob({ selectedJob: "followup", signupJob: null })).toBe("followup");
    expect(wizardJob({ selectedJob: "workspace", signupJob: "followup" })).toBe("workspace");
    expect(wizardJob({ selectedJob: null, signupJob: "agent" })).toBe("workspace");
    expect(wizardJob({ selectedJob: null, signupJob: null })).toBe("workspace");
  });
});

describe("the steps", () => {
  it("leads a cloud team owner through the setup, invitations and the inbox", () => {
    expect(wizardSteps(CLOUD_TEAM)).toEqual(["profile", "setup", "invite", "channel", "finish"]);
  });

  it("skips the invitations for a solo owner", () => {
    expect(wizardSteps(CLOUD_SOLO)).toEqual(["profile", "setup", "channel", "finish"]);
  });

  it("drops the setup once the owner starts empty", () => {
    expect(wizardSteps(CLOUD_TEAM, "empty")).toEqual(["profile", "invite", "channel", "finish"]);
    expect(wizardSteps(CLOUD_SOLO, "empty")).toEqual(["profile", "channel", "finish"]);
  });

  it("writes a playbook for the follow-up job", () => {
    expect(wizardSteps(CLOUD_TEAM, "followup")).toEqual(["profile", "playbook"]);
  });

  it("finishes right after the profile on self-hosted and for invited members", () => {
    expect(wizardSteps(SELF_HOSTED)).toEqual(["profile", "finish"]);
    expect(wizardSteps(SELF_HOSTED, "followup")).toEqual(["profile", "finish"]);
    expect(wizardSteps(INVITED)).toEqual(["profile", "finish"]);
  });

  it("stores only the invite or the channel step", () => {
    expect(persistedWizardStep("channel")).toBe("channel");
    expect(persistedWizardStep("invite")).toBe("invite");
    expect(persistedWizardStep("setup")).toBe("invite");
    expect(persistedWizardStep("finish")).toBe("invite");
  });
});

describe("going back", () => {
  const steps = wizardSteps(CLOUD_TEAM);

  it("never goes back to the profile or into a setup that was built", () => {
    expect(wizardBackFloor(steps, "profile")).toBe(0);
    expect(wizardBackFloor(steps, "setup")).toBe(1);
    expect(wizardBackFloor(steps, "invite")).toBe(2);
    expect(wizardBackFloor(steps, "channel")).toBe(2);
    expect(wizardBackFloor(steps, "finish")).toBe(4);
  });

  it("goes back between the invitations and the inbox after starting empty", () => {
    const empty = wizardSteps(CLOUD_TEAM, "empty");
    expect(wizardBackFloor(empty, "channel")).toBe(1);
    expect(wizardBackFloor(empty, "invite")).toBe(1);
  });
});

describe("resuming", () => {
  const owner = { ...CLOUD_TEAM, isInvited: false, profileCompleted: true, setupStepCompleted: false };

  it("starts with the profile until it is done", () => {
    expect(resolveWizardResume({ ...owner, profileCompleted: false }).resumeStepIndex).toBe(0);
  });

  it("opens the setup while it is not done", () => {
    const resume = resolveWizardResume(owner);
    expect(resume.steps[resume.resumeStepIndex]).toBe("setup");
    expect(resume.flow).toBe("workspace");
  });

  it("opens the playbook for the follow-up job", () => {
    const resume = resolveWizardResume({ ...owner, job: "followup" });
    expect(resume.steps[resume.resumeStepIndex]).toBe("playbook");
  });

  it("continues with the saved step after the setup", () => {
    const resume = resolveWizardResume({ ...owner, setupStepCompleted: true, savedStep: "channel" });
    expect(resume.steps[resume.resumeStepIndex]).toBe("channel");
  });

  it("falls back to the first step after the setup", () => {
    expect(resolveWizardResume({ ...owner, setupStepCompleted: true }).resumeStepIndex).toBe(2);
    const solo = resolveWizardResume({ ...owner, teamInvite: false, setupStepCompleted: true, savedStep: "invite" });
    expect(solo.steps[solo.resumeStepIndex]).toBe("channel");
  });

  it("finishes a self-hosted owner and an invited member after the profile", () => {
    const selfHosted = resolveWizardResume({ ...SELF_HOSTED, isInvited: false, profileCompleted: true, setupStepCompleted: false });
    expect(selfHosted.steps[selfHosted.resumeStepIndex]).toBe("finish");
    const invited = resolveWizardResume({ ...CLOUD_TEAM, isInvited: true, profileCompleted: true, setupStepCompleted: false });
    expect(invited.steps).toEqual(["profile", "finish"]);
    expect(invited.resumeStepIndex).toBe(1);
  });
});
