import { describe, expect, it } from "vitest";

import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";

import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";

import { setupKnowledgeBrief, setupPageKinds, setupPageTitles } from "../workspace-setup-knowledge";

const plan = SetupPlanSchema.parse(agencyPlan);
const answers: SetupAnswers = {
  workWith: {
    source: "user",
    confidence: 1,
    value: { format: "singleChoice", value: "ownWork" },
  },
};
const title = (kind: string) => `Default ${kind}`;

describe("Knowledge Base brief from the setup plan and answers", () => {
  it("writes the overview, FAQ and process pages with the plan's outlines and tone of voice without customers", () => {
    const brief = setupKnowledgeBrief(plan, answers, title);
    expect(brief.topics).toEqual([
      { key: "overview", role: "company_overview", title: "About the agency", outline: ["What we do", "How we work"] },
      { key: "faq", role: "faq", title: "Default faq", outline: [] },
      {
        key: "processes",
        role: "procedure",
        title: "Default processes",
        outline: [],
      },
      {
        key: "toneOfVoice",
        role: "voice_and_tone",
        title: "Default toneOfVoice",
        outline: [],
      },
    ]);
    expect(brief.extraRoles).toEqual(["procedure"]);
    expect(brief.addressForm).toBeNull();
  });

  it("adds the pages about offerings, customers and selling when the owner has customers or clients", () => {
    const clients: SetupAnswers = {
      workWith: { source: "user", confidence: 1, value: { format: "singleChoice", value: "clients" } },
    };
    const brief = setupKnowledgeBrief(null, clients, title);
    expect(brief.topics.map(({ key }) => key)).toEqual([
      "overview",
      "productsPricing",
      "idealCustomer",
      "salesPlaybook",
      "faq",
      "processes",
      "toneOfVoice",
    ]);
    expect(brief.extraRoles).toEqual(["offering", "procedure"]);
    expect(setupPageKinds({})).toEqual(["overview", "faq", "processes"]);
  });

  it("keeps page keys unique when a planned key repeats a fallback key", () => {
    const repeated = SetupPlanSchema.parse({
      ...agencyPlan,
      knowledgeBase: { pages: [{ key: "faq", kind: "overview", title: "About", sections: ["What"] }] },
    });
    const brief = setupKnowledgeBrief(repeated, answers, title);
    expect(brief.topics.map(({ key }) => key)).toEqual(["faq", "faq2", "processes", "toneOfVoice"]);
  });

  it("titles fallback pages in the workspace language", async () => {
    const english = await setupPageTitles("en");
    expect(setupKnowledgeBrief(plan, answers, english.title).topics.map(({ title: pageTitle }) => pageTitle)).toEqual([
      "About the agency",
      "Frequently asked questions",
      "Processes",
      "Voice and tone",
    ]);
    const german = await setupPageTitles("de");
    expect(setupKnowledgeBrief(plan, answers, german.title).topics.map(({ title: pageTitle }) => pageTitle)).toEqual([
      "About the agency",
      "Häufig gestellte Fragen",
      "Abläufe",
      "Sprache und Tonalität",
    ]);
  });
});
