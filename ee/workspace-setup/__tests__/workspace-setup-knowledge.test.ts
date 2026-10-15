import { describe, expect, it, vi } from "vitest";

import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { WorkspaceSetupRecord } from "../workspace-setup.schema";

import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";

import { setupKnowledgeBrief } from "../workspace-setup-knowledge";
import { WorkspaceSetupKnowledgeBrief } from "../workspace-setup-knowledge-brief";
import {
  StoredSetupCreatedSchema,
  StoredSetupInterviewSchema,
  StoredSetupResultsSchema,
} from "../workspace-setup.schema";

const plan = SetupPlanSchema.parse(agencyPlan);
const user = (value: SetupAnswers[string]) => value;
const answers: SetupAnswers = {
  knowledgePages: user({
    source: "user",
    confidence: 1,
    value: { format: "multipleChoice", values: ["overview", "faq"], custom: [] },
  }),
  addressForm: user({ source: "user", confidence: 1, value: { format: "singleChoice", value: "formal" } }),
  competitors: user({
    source: "user",
    confidence: 1,
    value: {
      format: "orderedList",
      items: [{ label: "Studio North" }, { label: "Pixel & Co" }, { label: "studio north" }],
    },
  }),
};
const title = (kind: string, competitor?: string) => (competitor ? `Compared with ${competitor}` : `Default ${kind}`);

function setup(overrides: Partial<WorkspaceSetupRecord> = {}): WorkspaceSetupRecord {
  return {
    id: "setup-1",
    userId: "user-1",
    status: "building",
    websiteUrl: "https://example.com/",
    crawlId: "crawl-1",
    answers,
    interview: StoredSetupInterviewSchema.parse({}),
    plan,
    planRevision: 1,
    phases: {},
    artifacts: {},
    created: StoredSetupCreatedSchema.parse({}),
    results: StoredSetupResultsSchema.parse({}),
    spreadsheetName: null,
    hasSpreadsheet: false,
    startedAt: new Date(),
    confirmedAt: new Date(),
    finishedAt: null,
    ...overrides,
  };
}

describe("Knowledge Base brief from the setup plan and answers", () => {
  it("keeps the chosen pages with the plan's outlines, adds tone of voice and one comparison per competitor", () => {
    const brief = setupKnowledgeBrief(plan, answers, title);
    expect(brief.topics).toEqual([
      { key: "overview", role: "company_overview", title: "About the agency", outline: ["What we do", "How we work"] },
      { key: "faq", role: "faq", title: "Default faq", outline: [] },
      { key: "toneOfVoice", role: "voice_and_tone", title: "Default toneOfVoice", outline: [] },
      {
        key: "competitorA",
        role: "competitor",
        title: "Compared with Studio North",
        outline: ["Where we win"],
        competitor: "Studio North",
      },
      {
        key: "competitor2",
        role: "competitor",
        title: "Compared with Pixel & Co",
        outline: [],
        competitor: "Pixel & Co",
      },
    ]);
    expect(brief.extraRoles).toEqual([]);
    expect(brief.addressForm).toBe("formal");
  });

  it("writes every page kind and lets the website add offerings and processes when nothing was chosen yet", () => {
    const brief = setupKnowledgeBrief(null, {}, title);
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
    expect(brief.addressForm).toBeNull();
  });

  it("keeps page keys unique when a fallback key repeats a planned key", () => {
    const repeated = SetupPlanSchema.parse({
      ...agencyPlan,
      knowledgeBase: { pages: [{ key: "competitor1", kind: "overview", title: "About", sections: ["What"] }] },
    });
    const brief = setupKnowledgeBrief(repeated, { competitors: answers.competitors }, title);
    expect(brief.topics.filter(({ role }) => role === "competitor").map(({ key }) => key)).toEqual([
      "competitor12",
      "competitor2",
    ]);
  });
});

describe("Workspace setup brief for its website import", () => {
  const crawl = { id: "crawl-1", payer: "workspaceSetup" as const, locale: "en" };
  const source = (record: WorkspaceSetupRecord | null) =>
    new WorkspaceSetupKnowledgeBrief({ findCurrent: vi.fn(() => Promise.resolve(record)) });

  it("leaves imports the requester pays for alone", async () => {
    expect(await source(setup()).brief({ ...crawl, payer: "requester" }, false)).toEqual({ status: "none" });
  });

  it("waits until the plan is confirmed, and writes nothing without a confirmed plan after the wait", async () => {
    expect(await source(setup({ status: "planned" })).brief(crawl, false)).toEqual({ status: "wait" });
    expect(await source(setup({ status: "planned" })).brief(crawl, true)).toEqual({ status: "cancelled" });
    expect(await source(setup({ status: "interview", plan: null })).brief(crawl, true)).toEqual({
      status: "cancelled",
    });
  });

  it("cancels the import's pages for an abandoned crawl", async () => {
    expect(await source(setup({ crawlId: "crawl-2" })).brief(crawl, false)).toEqual({ status: "wait" });
    expect(await source(setup({ crawlId: "crawl-2" })).brief(crawl, true)).toEqual({ status: "cancelled" });
    expect(await source(null).brief(crawl, false)).toEqual({ status: "cancelled" });
  });

  it("hands over the confirmed plan's pages with translated fallback titles", async () => {
    const state = await source(setup()).brief(crawl, false);
    if (state.status !== "ready") throw new Error(state.status);
    expect(state.brief.topics.map(({ title: pageTitle }) => pageTitle)).toEqual([
      "About the agency",
      "Frequently asked questions",
      "Voice and tone",
      "Compared with Studio North",
      "Compared with Pixel & Co",
    ]);
  });

  it("titles fallback pages in the workspace language even when the website import started in another one", async () => {
    const german = setup({
      answers: {
        ...answers,
        language: { source: "user", confidence: 1, value: { format: "singleChoice", value: "de" } },
      },
    });
    const state = await source(german).brief({ ...crawl, locale: "en" }, false);
    if (state.status !== "ready") throw new Error(state.status);
    expect(state.brief.topics.map(({ title: pageTitle }) => pageTitle)).toEqual([
      "About the agency",
      "Häufig gestellte Fragen",
      "Sprache und Tonalität",
      "Compared with Studio North",
      "Im Vergleich: Pixel & Co",
    ]);
  });
});
