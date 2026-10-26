import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";

import { describe, expect, it } from "vitest";

import { setupPart } from "@/features/workspace-setup/setup-interview";

import {
  answersPayload,
  displayedAnswerValue,
  mergeServerAnswers,
  missingParts,
  partVisible,
  resolveSetupStage,
} from "../setup-interview-state";
import { PLAN_PROGRESS, setupView } from "./setup-view-fixture";

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

const purpose = (...values: string[]) => user({ format: "multipleChoice", values, custom: [] });

const ANSWERS: SetupAnswers = {
  workWith: user({ format: "singleChoice", value: "clients" }),
  purpose: purpose("deals", "projects"),
  mainSteps: user({ format: "orderedList", items: [{ label: "Inquiry" }, { label: "Won" }] }),
  pricing: user({ format: "singleChoice", value: "timeBased" }),
  teamSize: user({ format: "singleChoice", value: "solo" }),
  existingData: user({ format: "singleChoice", value: "sampleData" }),
  companyName: user({ format: "shortText", value: "Acme" }),
  country: user({ format: "singleChoice", value: "DE" }),
  language: user({ format: "singleChoice", value: "de" }),
  currency: user({ format: "singleChoice", value: "EUR" }),
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
  ] as const)("maps a %s setup to the %s view", (status, stage) => {
    expect(resolveSetupStage({ available: true, setup: setupView({ status }) })).toBe(stage);
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

    const failed = setupView({
      plan: { status: "failed", error: "generation", revision: 1, plan: null, ...PLAN_PROGRESS },
    });
    expect(resolveSetupStage({ available: true, setup: failed })).toBe("planFailed");
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
    const server: SetupAnswers = { teamSize: user({ format: "singleChoice", value: "large" }) };
    expect(mergeServerAnswers({}, new Set(), server).teamSize).toEqual(server.teamSize);
  });
});

describe("visibility, completeness and payload", () => {
  it("asks for steps and pricing only when they fit what the owner tracks and who they work with", () => {
    const ownWork = { workWith: user({ format: "singleChoice", value: "ownWork" }), purpose: purpose("finances") };
    expect(partVisible(part("mainSteps"), ownWork)).toBe(false);
    expect(partVisible(part("pricing"), ownWork)).toBe(false);
    expect(partVisible(part("teamSize"), ownWork)).toBe(true);
    expect(partVisible(part("mainSteps"), ANSWERS)).toBe(true);
    expect(partVisible(part("pricing"), ANSWERS)).toBe(true);
  });

  it("defaults the language to the interface and the currency to the interface's usual one", () => {
    expect(displayedAnswerValue(part("language"), {}, "de")).toEqual({ format: "singleChoice", value: "de" });
    expect(displayedAnswerValue(part("currency"), {}, "de")).toEqual({ format: "singleChoice", value: "EUR" });
    expect(displayedAnswerValue(part("currency"), {}, "en")).toEqual({ format: "singleChoice", value: "USD" });
  });

  it("lists every visible required answer still missing", () => {
    expect(missingParts({}, "en")).toEqual(["workWith", "purpose", "existingData"]);
    expect(missingParts(ANSWERS, "en")).toEqual([]);
    expect(missingParts({ ...ANSWERS, purpose: purpose() }, "en")).toEqual(["purpose"]);
    const withoutName = Object.fromEntries(Object.entries(ANSWERS).filter(([id]) => id !== "companyName"));
    expect(missingParts(withoutName, "en")).toEqual([]);
  });

  it("clears answers to hidden questions and drops blank list entries", () => {
    const answers: SetupAnswers = {
      ...ANSWERS,
      workWith: user({ format: "singleChoice", value: "ownWork" }),
      mainSteps: user({ format: "orderedList", items: [{ label: " Inquiry " }, { label: "  " }] }),
    };

    const payload = answersPayload(answers, "en");

    expect(payload.pricing).toBeNull();
    expect(payload.mainSteps).toEqual({ format: "orderedList", items: [{ label: "Inquiry" }] });
    expect(payload.companyName).toEqual({ format: "shortText", value: "Acme" });
  });
});
