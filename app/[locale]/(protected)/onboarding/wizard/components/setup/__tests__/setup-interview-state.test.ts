import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";

import { describe, expect, it } from "vitest";

import { setupPart } from "@/features/workspace-setup/setup-interview";

import {
  displayedAnswerValue,
  mergeServerAnswers,
  partVisible,
  resolveSetupStage,
  resumeScreenIndex,
  screenAnswersPayload,
  screenComplete,
} from "../setup-interview-state";
import { setupView } from "./setup-view-fixture";

function part(id: string) {
  const found = setupPart(id);
  if (!found) throw new Error(`Unknown part ${id}`);
  return found;
}

const user = (value: NonNullable<SetupAnswers[string]>["value"]) => ({ source: "user" as const, confidence: 1, value });
const website = (value: NonNullable<SetupAnswers[string]>["value"]) => ({
  source: "website" as const,
  confidence: 0.9,
  value,
});

const COMPANY_SCREEN: SetupAnswers = {
  companyName: user({ format: "shortText", value: "Acme" }),
  country: user({ format: "singleChoice", value: "DE" }),
  language: user({ format: "singleChoice", value: "de" }),
  currency: user({ format: "singleChoice", value: "EUR" }),
  offeringKinds: user({ format: "multipleChoice", values: ["services"], custom: [] }),
  offerings: user({ format: "orderedList", items: [{ label: "Consulting" }] }),
  customerKind: user({ format: "singleChoice", value: "consumers" }),
  industries: user({ format: "multipleChoice", values: [], custom: [] }),
  teamSize: user({ format: "singleChoice", value: "solo" }),
  teamRoles: user({ format: "multipleChoice", values: [], custom: [] }),
};

describe("resolveSetupStage", () => {
  it("skips the step when the setup is unavailable", () => {
    expect(resolveSetupStage({ available: false, reason: "selfHosted", setup: null })).toBe("unavailable");
    expect(resolveSetupStage({ available: false, reason: "demo", setup: null })).toBe("unavailable");
    expect(resolveSetupStage(null)).toBe("unavailable");
  });

  it("asks for a website when no setup exists yet", () => {
    expect(resolveSetupStage({ available: true, setup: null })).toBe("start");
  });

  it.each([
    ["planning", "planning"],
    ["planned", "plan"],
    ["building", "build"],
    ["completed", "build"],
    ["failed", "build"],
    ["rolledBack", "start"],
  ] as const)("maps a %s setup to the %s view", (status, stage) => {
    expect(resolveSetupStage({ available: true, setup: setupView({ status }) })).toBe(stage);
  });

  it("shows a completed setup as built and lets a rolled-back setup start over", () => {
    expect(resolveSetupStage({ available: true, setup: setupView({ status: "completed" }) })).toBe("build");
    expect(resolveSetupStage({ available: true, setup: setupView({ status: "rolledBack" }) })).toBe("start");
  });

  it("reopens open follow-up questions and the failed plan from the persisted status", () => {
    const followUp = { id: "followUp1" as const, label: "Which?", format: "shortText" as const, maxLength: 80 };
    const asked = setupView({
      interview: { ...setupView().interview, followUps: "completed", followUpQuestions: [followUp] },
    });
    expect(resolveSetupStage({ available: true, setup: asked })).toBe("followUps");

    const answered = setupView({
      interview: {
        ...asked.interview,
        followUpAnswers: [{ id: "followUp1", value: { format: "shortText", value: "This" } }],
      },
    });
    expect(resolveSetupStage({ available: true, setup: answered })).toBe("interview");

    const failed = setupView({ plan: { status: "failed", error: "generation", revision: 1, plan: null } });
    expect(resolveSetupStage({ available: true, setup: failed })).toBe("planFailed");
  });
});

describe("resumeScreenIndex", () => {
  it("starts on the first screen while website guesses are unconfirmed", () => {
    expect(resumeScreenIndex({})).toBe(0);
    expect(resumeScreenIndex({ companyName: website({ format: "shortText", value: "Acme" }) })).toBe(0);
  });

  it("lands on the first screen the owner has not confirmed yet", () => {
    expect(resumeScreenIndex(COMPANY_SCREEN)).toBe(1);
  });
});

describe("mergeServerAnswers", () => {
  it("takes late website guesses for untouched questions but never overwrites a touched answer", () => {
    const local: SetupAnswers = { companyName: user({ format: "shortText", value: "Typed by owner" }) };
    const server: SetupAnswers = {
      companyName: website({ format: "shortText", value: "From website" }),
      teamSize: website({ format: "singleChoice", value: "small" }),
    };

    const merged = mergeServerAnswers(local, new Set(["companyName"]), server);

    expect(merged.companyName?.value).toEqual({ format: "shortText", value: "Typed by owner" });
    expect(merged.teamSize).toEqual(server.teamSize);
  });

  it("keeps answers the owner confirmed earlier", () => {
    const server: SetupAnswers = { teamSize: user({ format: "singleChoice", value: "medium" }) };
    expect(mergeServerAnswers({}, new Set(), server).teamSize).toEqual(server.teamSize);
  });
});

describe("visibility, completeness and payload", () => {
  it("shows the customer size only for business customers, including both", () => {
    const size = part("customerSize");
    expect(partVisible(size, {})).toBe(false);
    expect(partVisible(size, { customerKind: user({ format: "singleChoice", value: "both" }) })).toBe(true);
    expect(partVisible(size, { customerKind: user({ format: "singleChoice", value: "consumers" }) })).toBe(false);
  });

  it("defaults pre-ticked options and the interface language", () => {
    expect(displayedAnswerValue(part("knowledgePages"), {}, "de")).toMatchObject({
      values: ["overview", "productsPricing", "idealCustomer", "salesPlaybook", "faq", "processes"],
    });
    expect(displayedAnswerValue(part("language"), {}, "de")).toEqual({ format: "singleChoice", value: "de" });
  });

  it("requires every visible required answer before Looks right", () => {
    expect(screenComplete("company", {}, "en")).toBe(false);
    expect(screenComplete("company", COMPANY_SCREEN, "en")).toBe(true);
  });

  it("clears answers to hidden questions and drops blank list entries", () => {
    const answers: SetupAnswers = {
      ...COMPANY_SCREEN,
      customerSize: user({ format: "singleChoice", value: "small" }),
      offerings: user({ format: "orderedList", items: [{ label: " Consulting " }, { label: "  " }] }),
    };

    const payload = screenAnswersPayload("company", answers, "en");

    expect(payload.customerSize).toBeNull();
    expect(payload.offerings).toEqual({ format: "orderedList", items: [{ label: "Consulting" }] });
    expect(payload.companyName).toEqual({ format: "shortText", value: "Acme" });
  });
});
