import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";

import { describe, expect, it } from "vitest";

import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";

import {
  setupAnswerDraftIssues,
  setupAnswerGuide,
  setupAnswerPage,
  setupAnswerTopics,
  setupAnswersSourceText,
} from "../workspace-setup-answer-pages";
import { setupInterviewCatalog } from "../workspace-setup-prompts";

const plan = SetupPlanSchema.parse(agencyPlan);
const user = { source: "user" as const, confidence: 1 };
const answers: SetupAnswers = {
  companyName: { ...user, value: { format: "shortText", value: "Studio Example" } },
  currency: { ...user, value: { format: "singleChoice", value: "EUR" } },
  workWith: { ...user, value: { format: "singleChoice", value: "ownWork" } },
  mainSteps: { ...user, value: { format: "orderedList", items: [{ label: "Briefing" }, { label: "Done" }] } },
};
const t = (key: string, values?: Record<string, string>) =>
  values ? `${key}(${Object.values(values).join(",")})` : key;
const copy = {
  t,
  title: (kind: string) => kind,
  operatingGuide: "Guide",
  sourcesHeading: "sourcesHeading",
  gapsHeading: "gapsHeading",
  pagesHeading: "pagesHeading",
  answersSource: (date: string) => `answers of ${date}`,
};
const title = (kind: string, competitor?: string) => (competitor ? `${kind}:${competitor}` : kind);

describe("Knowledge Base pages from the setup answers", () => {
  it("renders each answer as one line the page can quote", async () => {
    const source = setupAnswersSourceText(answers, await setupInterviewCatalog());
    const lines = source.split("\n");
    expect(lines.every((line) => line.startsWith("- "))).toBe(true);
    expect(lines.some((line) => line.endsWith(" Studio Example"))).toBe(true);
    expect(lines.some((line) => line.includes("Briefing"))).toBe(true);
  });

  it("writes the pages for the workspace without the FAQ and adds the voice page", () => {
    const topics = setupAnswerTopics(plan, answers, title);
    expect(topics.map((topic) => topic.role)).toEqual(["company_overview", "procedure", "voice_and_tone"]);
    expect(topics[0]).toMatchObject({ title: "About the agency", outline: ["What we do", "How we work"] });
  });

  it("drops every section whose evidence is not an answer line", () => {
    const source = "- Company name: Studio Example\n- Currency: EUR";
    const section = (quote: string, key = "answers") => ({
      heading: "Who we are",
      evidence: [{ source: key, quote }],
      content: "Studio Example.",
    });
    const draft = {
      whenToUse: "",
      sections: [
        section("Company name: Studio Example"),
        section("EUR"),
        section("We design websites"),
        section("Currency: EUR", "website"),
        { ...section("x"), evidence: [] },
      ],
      gaps: [],
    };
    expect(setupAnswerDraftIssues(draft, source)).toEqual([2, 3, 4]);
  });

  it("cites the setup answers and keeps owner sections when no section is supported", () => {
    const [overview, voice] = setupAnswerTopics(plan, answers, title);
    const page = setupAnswerPage({
      topic: overview,
      draft: {
        whenToUse: "",
        sections: [{ heading: "Who we are", evidence: [], content: "We design websites." }],
        gaps: ["Who are the main customers?"],
      },
      copy,
      source: "answers of 2026-10-16",
    });
    expect(page).toMatchObject({ title: "About the agency", kind: "knowledge" });
    expect(page?.markdown).toContain("## Who we are\n\nWe design websites.");
    expect(page?.markdown).toContain("## sourcesHeading\n\n- answers of 2026-10-16");
    expect(page?.markdown).toContain("## gapsHeading\n\n- Who are the main customers?");
    expect(setupAnswerPage({ topic: overview, draft: null, copy, source: "answers of 2026-10-16" })).toBeNull();
    expect(setupAnswerPage({ topic: voice, draft: null, copy, source: "answers of 2026-10-16" })).toBeNull();
  });

  it("links the written pages from an Operating Guide", () => {
    const pageId = "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f70";
    expect(setupAnswerGuide({ addressForm: null, pages: [], copy })).toBeNull();
    const guide = setupAnswerGuide({ addressForm: "informal", pages: [{ title: "About", pageId }], copy });
    expect(guide).toMatchObject({ title: "Guide", kind: "guide" });
    expect(guide?.markdown).toContain("address.informal");
    expect(guide?.markdown).toContain(pageId);
  });
});
