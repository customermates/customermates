import { describe, expect, it } from "vitest";

import {
  buildWizardFlowContext,
  persistedWizardStep,
  resolveWizardResume,
  wizardBackFloor,
  wizardChoiceAvailable,
  wizardSteps,
} from "../onboarding-wizard-flow";

const CLOUD_TEAM = { setupAvailable: true, chooseAvailable: true, channelAvailable: true, teamInvite: true };
const CLOUD_SOLO = { ...CLOUD_TEAM, teamInvite: false };
const SELF_HOSTED = { setupAvailable: false, chooseAvailable: true, channelAvailable: false, teamInvite: false };
const INVITED = { setupAvailable: false };

describe("the flow context", () => {
  const owner = {
    appMode: "cloud" as const,
    isInvited: false,
    profileCompleted: false,
    setupOffered: false,
    teamSize: "small" as const,
  };

  it("offers the choice, the channel and team invites to a cloud owner of a team", () => {
    expect(buildWizardFlowContext(owner)).toEqual({
      setupAvailable: true,
      chooseAvailable: true,
      channelAvailable: true,
      teamInvite: true,
    });
  });

  it("asks for no team invites from a solo owner or one who did not say", () => {
    expect(buildWizardFlowContext({ ...owner, teamSize: "solo" }).teamInvite).toBe(false);
    expect(buildWizardFlowContext({ ...owner, teamSize: null }).teamInvite).toBe(false);
  });

  it("opens the setup for a registered owner only when the setup is offered", () => {
    expect(buildWizardFlowContext({ ...owner, profileCompleted: true }).setupAvailable).toBe(false);
    expect(buildWizardFlowContext({ ...owner, profileCompleted: true, setupOffered: true }).setupAvailable).toBe(true);
  });

  it("keeps the channel step away from a self-hosted owner", () => {
    expect(buildWizardFlowContext({ ...owner, appMode: "self-hosted", teamSize: null })).toEqual(SELF_HOSTED);
  });

  it("offers nothing to an invited member and nothing to choose in the demo", () => {
    const invited = buildWizardFlowContext({ ...owner, isInvited: true });
    expect(invited).toEqual({
      setupAvailable: false,
      chooseAvailable: false,
      channelAvailable: false,
      teamInvite: false,
    });
    expect(buildWizardFlowContext({ ...owner, appMode: "demo" }).chooseAvailable).toBe(false);
    expect(wizardChoiceAvailable("demo", false)).toBe(false);
    expect(wizardChoiceAvailable("cloud", true)).toBe(false);
    expect(wizardChoiceAvailable("self-hosted", false)).toBe(true);
  });
});

describe("the steps of each path", () => {
  it("runs the Mate path through the setup, then the team and the inbox", () => {
    expect(wizardSteps(CLOUD_TEAM, "workspace")).toEqual(["profile", "goal", "setup", "invite", "channel"]);
  });

  it("skips the invitations for a solo owner on every path", () => {
    expect(wizardSteps(CLOUD_SOLO, "workspace")).toEqual(["profile", "goal", "setup", "channel"]);
    expect(wizardSteps(CLOUD_SOLO, "agent")).toEqual(["profile", "goal", "ai", "handoff", "channel"]);
    expect(wizardSteps(CLOUD_SOLO, "empty")).toEqual(["profile", "goal", "channel"]);
  });

  it("connects the agent, hands over to it, then asks for the team and the inbox", () => {
    expect(wizardSteps(CLOUD_TEAM, "agent")).toEqual(["profile", "goal", "ai", "handoff", "invite", "channel"]);
  });

  it("starts empty straight with the team and the inbox", () => {
    expect(wizardSteps(CLOUD_TEAM, "empty")).toEqual(["profile", "goal", "invite", "channel"]);
  });

  it("keeps the playbook path for the follow-up job", () => {
    expect(wizardSteps(CLOUD_TEAM, "followup")).toEqual(["profile", "goal", "playbook"]);
  });

  it("falls back to the agent path when the setup is not available", () => {
    expect(wizardSteps(SELF_HOSTED, "workspace")).toEqual(["profile", "goal", "ai", "handoff"]);
    expect(wizardSteps(SELF_HOSTED, "followup")).toEqual(["profile", "goal", "ai", "handoff"]);
    expect(wizardSteps(SELF_HOSTED, "empty")).toEqual(["profile", "goal"]);
  });

  it("gives an invited member only the profile before the workspace opens", () => {
    expect(wizardSteps(INVITED, "workspace")).toEqual(["profile", "finish"]);
    expect(wizardSteps(INVITED, "agent")).toEqual(["profile", "finish"]);
  });
});

describe("the saved step", () => {
  it("keeps the agent steps, the channel and a pinned goal, and parks everything else on the invitations", () => {
    expect(persistedWizardStep("ai")).toBe("ai");
    expect(persistedWizardStep("handoff")).toBe("handoff");
    expect(persistedWizardStep("channel")).toBe("channel");
    expect(persistedWizardStep("goal")).toBe("goal");
    expect(persistedWizardStep("goal", false)).toBe("invite");
    expect(persistedWizardStep("setup")).toBe("invite");
    expect(persistedWizardStep("profile")).toBe("invite");
  });
});

describe("how far back the owner can go", () => {
  it("stops at the goal once the profile is registered", () => {
    const steps = wizardSteps(CLOUD_TEAM, "agent");
    expect(wizardBackFloor(steps, "profile")).toBe(0);
    expect(wizardBackFloor(steps, "goal")).toBe(1);
    expect(wizardBackFloor(steps, "ai")).toBe(1);
    expect(wizardBackFloor(steps, "handoff")).toBe(1);
    expect(wizardBackFloor(steps, "channel")).toBe(1);
  });

  it("never returns to a setup that was already built", () => {
    const steps = wizardSteps(CLOUD_TEAM, "workspace");
    expect(wizardBackFloor(steps, "setup")).toBe(1);
    expect(wizardBackFloor(steps, "invite")).toBe(3);
    expect(wizardBackFloor(steps, "channel")).toBe(3);
  });

  it("keeps the finish step where it is", () => {
    expect(wizardBackFloor(["profile", "finish"], "finish")).toBe(1);
  });
});

describe("resuming the wizard", () => {
  const owner = { ...CLOUD_TEAM, profileCompleted: true, isInvited: false, setupStepCompleted: false };

  it("starts at the profile before it is registered", () => {
    expect(resolveWizardResume({ ...owner, profileCompleted: false, job: "agent" })).toEqual({
      steps: ["profile", "goal", "ai", "handoff", "invite", "channel"],
      resumeStepIndex: 0,
      flow: "agent",
    });
  });

  it("asks for the goal while no job is chosen", () => {
    const resume = resolveWizardResume({ ...owner, jobSelected: false, job: "agent" });
    expect(resume.steps[resume.resumeStepIndex]).toBe("goal");
  });

  it("returns to a pinned goal", () => {
    const resume = resolveWizardResume({ ...owner, job: "workspace", savedStep: "goal" });
    expect(resume.steps[resume.resumeStepIndex]).toBe("goal");
  });

  it("returns to the setup while Mate's setup is open", () => {
    const resume = resolveWizardResume({ ...owner, job: "workspace" });
    expect(resume.flow).toBe("workspace");
    expect(resume.steps[resume.resumeStepIndex]).toBe("setup");
  });

  it("returns to the playbook of the follow-up job", () => {
    const resume = resolveWizardResume({ ...owner, job: "followup" });
    expect(resume.steps[resume.resumeStepIndex]).toBe("playbook");
  });

  it("returns to the saved agent step once the agent path is chosen", () => {
    const handoff = resolveWizardResume({ ...owner, job: "agent", setupStepCompleted: true, savedStep: "handoff" });
    expect(handoff.flow).toBe("agent");
    expect(handoff.steps[handoff.resumeStepIndex]).toBe("handoff");
    const fresh = resolveWizardResume({ ...owner, job: "agent", setupStepCompleted: true });
    expect(fresh.steps[fresh.resumeStepIndex]).toBe("invite");
  });

  it("continues with the team after Mate built the workspace", () => {
    const resume = resolveWizardResume({ ...owner, job: "workspace", setupStepCompleted: true });
    expect(resume.flow).toBe("workspace");
    expect(resume.steps[resume.resumeStepIndex]).toBe("invite");
    const solo = resolveWizardResume({ ...owner, teamInvite: false, job: "workspace", setupStepCompleted: true });
    expect(solo.steps[solo.resumeStepIndex]).toBe("channel");
  });

  it("treats a completed setup without a chosen job as an empty start", () => {
    const resume = resolveWizardResume({ ...owner, jobSelected: false, job: "agent", setupStepCompleted: true });
    expect(resume.flow).toBe("empty");
    expect(resume.steps).toEqual(["profile", "goal", "invite", "channel"]);
    expect(resume.steps[resume.resumeStepIndex]).toBe("invite");
  });

  it("finishes right away for an invited member with a profile", () => {
    const resume = resolveWizardResume({
      ...INVITED,
      profileCompleted: true,
      isInvited: true,
      setupStepCompleted: true,
    });
    expect(resume.steps).toEqual(["profile", "finish"]);
    expect(resume.resumeStepIndex).toBe(1);
  });

  it("falls back to the goal when a self-hosted owner has nothing left", () => {
    const resume = resolveWizardResume({
      ...SELF_HOSTED,
      profileCompleted: true,
      isInvited: false,
      setupStepCompleted: true,
      jobSelected: false,
    });
    expect(resume.steps).toEqual(["profile", "goal"]);
    expect(resume.resumeStepIndex).toBe(1);
  });
});
