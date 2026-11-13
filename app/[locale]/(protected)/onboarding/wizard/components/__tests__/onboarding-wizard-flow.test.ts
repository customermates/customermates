import { describe, expect, it } from "vitest";

import {
  connectsAgentWithVerification,
  persistedWizardStep,
  resolveWizardResume,
  wizardSteps,
} from "../onboarding-wizard-flow";

const CLOUD = { setupAvailable: true, chooseAvailable: true, templatesAvailable: true };
const CLOUD_NO_TEMPLATES = { ...CLOUD, templatesAvailable: false };
const SELF_HOSTED = { setupAvailable: false, chooseAvailable: true, templatesAvailable: true };

describe("wizard steps", () => {
  it("keeps the connect, template and prompt steps for the user's own agent", () => {
    expect(wizardSteps(CLOUD, "agent")).toEqual(["profile", "goal", "ai", "template", "prompt"]);
    expect(wizardSteps(SELF_HOSTED, "agent")).toEqual(["profile", "goal", "ai", "template", "prompt"]);
  });

  it("puts the template step before Mate's setup", () => {
    expect(wizardSteps(CLOUD, "workspace")).toEqual(["profile", "goal", "template", "setup", "invite", "ai"]);
  });

  it("skips the template and prompt steps while no template is offered", () => {
    expect(wizardSteps(CLOUD_NO_TEMPLATES, "agent")).toEqual(["profile", "goal", "ai"]);
    expect(wizardSteps(CLOUD_NO_TEMPLATES, "workspace")).toEqual(["profile", "goal", "setup", "invite", "ai"]);
  });

  it("keeps the follow-up playbook path and the empty workspace path short", () => {
    expect(wizardSteps(CLOUD, "followup")).toEqual(["profile", "goal", "playbook"]);
    expect(wizardSteps(CLOUD, "empty")).toEqual(["profile", "goal", "invite", "ai"]);
    expect(wizardSteps(SELF_HOSTED, "empty")).toEqual(["profile", "goal", "invite", "ai"]);
  });

  it("shows a self-hosted owner the agent steps whatever the highlighted card, since Mate is a cloud trial there", () => {
    expect(wizardSteps(SELF_HOSTED, "workspace")).toEqual(["profile", "goal", "ai", "template", "prompt"]);
    expect(wizardSteps(SELF_HOSTED, "followup")).toEqual(["profile", "goal", "ai", "template", "prompt"]);
  });

  it("gives an invited member only the profile, team and AI steps", () => {
    expect(wizardSteps({ setupAvailable: false, chooseAvailable: false, templatesAvailable: false }, "agent")).toEqual([
      "profile",
      "invite",
      "ai",
    ]);
  });

  it("verifies the connection only where the owner chooses how to set up", () => {
    expect(connectsAgentWithVerification(CLOUD, "agent")).toBe(true);
    expect(connectsAgentWithVerification(CLOUD, "workspace")).toBe(false);
    expect(connectsAgentWithVerification({ setupAvailable: true }, "agent")).toBe(false);
    expect(connectsAgentWithVerification({ setupAvailable: false }, "agent")).toBe(false);
  });

  it("saves the steps a reload can resume and folds the others into the team step", () => {
    expect(persistedWizardStep("ai")).toBe("ai");
    expect(persistedWizardStep("template")).toBe("template");
    expect(persistedWizardStep("prompt")).toBe("prompt");
    expect(persistedWizardStep("goal")).toBe("goal");
    expect(persistedWizardStep("setup")).toBe("invite");
    expect(persistedWizardStep("playbook")).toBe("invite");
  });
});

describe("resuming the wizard", () => {
  const owner = { ...CLOUD, profileCompleted: true, isInvited: false };

  it("opens on the goal step until the owner chose", () => {
    expect(resolveWizardResume({ ...owner, setupStepCompleted: false, jobSelected: false, job: "agent" })).toEqual({
      steps: ["profile", "goal", "ai", "template", "prompt"],
      resumeStepIndex: 1,
      flow: "agent",
    });
  });

  it("starts a new owner without a profile on the profile step with the agent flow highlighted", () => {
    expect(
      resolveWizardResume({
        ...CLOUD,
        profileCompleted: false,
        isInvited: false,
        setupStepCompleted: false,
        job: "agent",
      }),
    ).toEqual({ steps: ["profile", "goal", "ai", "template", "prompt"], resumeStepIndex: 0, flow: "agent" });
  });

  it("resumes the agent flow on the saved step and defaults to the connect step", () => {
    const agent = { ...owner, setupStepCompleted: true, jobSelected: true, job: "agent" as const };

    expect(resolveWizardResume({ ...agent, savedStep: "prompt" }).resumeStepIndex).toBe(4);
    expect(resolveWizardResume({ ...agent, savedStep: "template" }).resumeStepIndex).toBe(3);
    expect(resolveWizardResume({ ...agent, savedStep: "ai" }).resumeStepIndex).toBe(2);
    expect(resolveWizardResume({ ...agent, savedStep: "invite" }).resumeStepIndex).toBe(2);
    expect(resolveWizardResume({ ...agent, savedStep: undefined }).flow).toBe("agent");
  });

  it("resumes on the goal step after Back to it, whatever flow the choice there leads to", () => {
    const back = { ...owner, setupStepCompleted: true, jobSelected: true, savedStep: "goal" as const };

    expect(resolveWizardResume({ ...back, job: "agent" })).toMatchObject({ resumeStepIndex: 1, flow: "agent" });
    expect(resolveWizardResume({ ...back, job: "workspace" })).toMatchObject({
      steps: ["profile", "goal", "template", "setup", "invite", "ai"],
      resumeStepIndex: 1,
      flow: "workspace",
    });
    expect(resolveWizardResume({ ...back, job: "followup" }).resumeStepIndex).toBe(1);
    expect(resolveWizardResume({ ...back, setupStepCompleted: false, job: "agent" }).resumeStepIndex).toBe(1);
    expect(resolveWizardResume({ ...back, jobSelected: false })).toMatchObject({ resumeStepIndex: 1, flow: "empty" });
  });

  it("resumes on the goal step behind the source question, never in front of it", () => {
    const withSource = {
      ...owner,
      sourceAvailable: true,
      setupStepCompleted: true,
      jobSelected: true,
      job: "agent" as const,
    };

    expect(resolveWizardResume({ ...withSource, savedStep: "goal" })).toMatchObject({
      steps: ["profile", "source", "goal", "ai", "template", "prompt"],
      resumeStepIndex: 2,
    });
    expect(
      resolveWizardResume({
        ...withSource,
        setupStepCompleted: false,
        jobSelected: false,
        sourceResolved: false,
        savedStep: "goal",
      }).resumeStepIndex,
    ).toBe(1);
  });

  it("ignores a saved goal step where the flow has none", () => {
    expect(
      resolveWizardResume({
        setupAvailable: false,
        chooseAvailable: false,
        profileCompleted: true,
        isInvited: false,
        setupStepCompleted: true,
        savedStep: "goal",
      }),
    ).toMatchObject({ steps: ["profile", "invite", "ai"], resumeStepIndex: 1 });
    expect(
      resolveWizardResume({ ...owner, isInvited: true, setupStepCompleted: true, jobSelected: true, savedStep: "goal" }),
    ).toMatchObject({ steps: ["profile", "invite", "ai"], resumeStepIndex: 1 });
  });

  it("resumes the agent flow before the choice is saved on the connect step", () => {
    expect(
      resolveWizardResume({ ...owner, setupStepCompleted: false, jobSelected: true, job: "agent" }).resumeStepIndex,
    ).toBe(2);
  });

  it("resumes Mate's flow on the template step until the setup started, then on the setup", () => {
    const mate = { ...owner, setupStepCompleted: false, jobSelected: true, job: "workspace" as const };

    expect(resolveWizardResume(mate)).toMatchObject({
      steps: ["profile", "goal", "template", "setup", "invite", "ai"],
      resumeStepIndex: 2,
    });
    expect(resolveWizardResume({ ...mate, setupStarted: true }).resumeStepIndex).toBe(3);
    expect(resolveWizardResume({ ...mate, templatesAvailable: false }).resumeStepIndex).toBe(2);
  });

  it("resumes on the team step once Mate's setup was completed and keeps a saved AI step", () => {
    const done = { ...owner, setupStepCompleted: true, jobSelected: true, job: "workspace" as const };

    expect(resolveWizardResume(done)).toMatchObject({
      steps: ["profile", "goal", "template", "setup", "invite", "ai"],
      resumeStepIndex: 4,
      flow: "workspace",
    });
    expect(resolveWizardResume({ ...done, savedStep: "ai" }).resumeStepIndex).toBe(5);
    expect(resolveWizardResume({ ...done, savedStep: "template" }).resumeStepIndex).toBe(4);
  });

  it("resumes the empty workspace path on the team step", () => {
    expect(resolveWizardResume({ ...owner, setupStepCompleted: true, jobSelected: false })).toEqual({
      steps: ["profile", "goal", "invite", "ai"],
      resumeStepIndex: 2,
      flow: "empty",
    });
  });

  it("falls back to the empty path for a configured workspace where Mate's setup is gone", () => {
    expect(
      resolveWizardResume({
        ...owner,
        setupAvailable: false,
        setupStepCompleted: true,
        jobSelected: true,
        job: "workspace",
      }),
    ).toMatchObject({ steps: ["profile", "goal", "invite", "ai"], resumeStepIndex: 2, flow: "empty" });
  });

  it("opens a self-hosted owner on the goal step and later on the connect step", () => {
    const hosted = { ...SELF_HOSTED, profileCompleted: true, isInvited: false };

    expect(
      resolveWizardResume({ ...hosted, setupStepCompleted: false, jobSelected: false, job: "agent" }),
    ).toMatchObject({ resumeStepIndex: 1, flow: "agent" });
    expect(
      resolveWizardResume({ ...hosted, setupStepCompleted: true, jobSelected: true, job: "agent", savedStep: "ai" }),
    ).toMatchObject({ steps: ["profile", "goal", "ai", "template", "prompt"], resumeStepIndex: 2 });
  });

  it("never offers an invited member the owner's steps", () => {
    expect(
      resolveWizardResume({
        ...CLOUD,
        profileCompleted: true,
        isInvited: true,
        setupStepCompleted: false,
        job: "agent",
      }),
    ).toEqual({ steps: ["profile", "invite", "ai"], resumeStepIndex: 1, flow: "agent" });
  });

  it("keeps the follow-up path at the playbook", () => {
    expect(resolveWizardResume({ ...owner, setupStepCompleted: false, jobSelected: true, job: "followup" })).toEqual({
      steps: ["profile", "goal", "playbook"],
      resumeStepIndex: 2,
      flow: "followup",
    });
  });
});

describe("the optional source question", () => {
  const CLOUD_WITH_SOURCE = { ...CLOUD, sourceAvailable: true };

  it("adds exactly one step after the profile for a cloud owner on every path", () => {
    expect(wizardSteps(CLOUD_WITH_SOURCE, "agent")).toEqual(["profile", "source", "goal", "ai", "template", "prompt"]);
    expect(wizardSteps(CLOUD_WITH_SOURCE, "workspace")).toEqual([
      "profile",
      "source",
      "goal",
      "template",
      "setup",
      "invite",
      "ai",
    ]);
    expect(wizardSteps(CLOUD_WITH_SOURCE, "followup")).toEqual(["profile", "source", "goal", "playbook"]);
    expect(wizardSteps(CLOUD_WITH_SOURCE, "empty")).toEqual(["profile", "source", "goal", "invite", "ai"]);
    expect(wizardSteps(CLOUD_WITH_SOURCE, "empty")).toHaveLength(wizardSteps(CLOUD, "empty").length + 1);
  });

  it("leaves the steps untouched unless the question is offered", () => {
    expect(wizardSteps(CLOUD, "empty")).toEqual(["profile", "goal", "invite", "ai"]);
    expect(wizardSteps({ ...SELF_HOSTED, sourceAvailable: false }, "agent")).toEqual([
      "profile",
      "goal",
      "ai",
      "template",
      "prompt",
    ]);
  });

  it("never asks an invited member", () => {
    expect(
      wizardSteps(
        { setupAvailable: false, chooseAvailable: false, templatesAvailable: false, sourceAvailable: true },
        "agent",
      ),
    ).toEqual(["profile", "invite", "ai"]);
    expect(
      resolveWizardResume({
        ...CLOUD_WITH_SOURCE,
        profileCompleted: true,
        isInvited: true,
        setupStepCompleted: false,
        sourceResolved: false,
        jobSelected: false,
      }).steps,
    ).not.toContain("source");
  });

  it("saves the source step as a step a reload folds into the team step", () => {
    expect(persistedWizardStep("source")).toBe("invite");
  });

  describe("resuming", () => {
    const owner = { ...CLOUD_WITH_SOURCE, profileCompleted: true, isInvited: false, setupStepCompleted: false };

    it("opens on the question right after the profile while it is neither answered nor skipped", () => {
      expect(resolveWizardResume({ ...owner, jobSelected: false, sourceResolved: false, job: "agent" })).toEqual({
        steps: ["profile", "source", "goal", "ai", "template", "prompt"],
        resumeStepIndex: 1,
        flow: "agent",
      });
    });

    it("moves on to the goal step once the question was answered or skipped", () => {
      expect(
        resolveWizardResume({ ...owner, jobSelected: false, sourceResolved: true, job: "agent" }).resumeStepIndex,
      ).toBe(2);
    });

    it("does not bring the question back after the owner went past the goal step", () => {
      expect(
        resolveWizardResume({ ...owner, jobSelected: true, sourceResolved: false, job: "agent", savedStep: "ai" })
          .resumeStepIndex,
      ).toBe(3);
      expect(
        resolveWizardResume({
          ...owner,
          jobSelected: true,
          sourceResolved: false,
          job: "workspace",
          setupStarted: true,
        }).resumeStepIndex,
      ).toBe(4);
    });

    it("does not resume on the question when the state of it is unknown", () => {
      expect(resolveWizardResume({ ...owner, jobSelected: false, job: "agent" }).resumeStepIndex).toBe(2);
    });

    it("keeps a first visit on the profile step", () => {
      expect(
        resolveWizardResume({ ...owner, profileCompleted: false, sourceResolved: false, job: "agent" }).resumeStepIndex,
      ).toBe(0);
    });
  });
});
