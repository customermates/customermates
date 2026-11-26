import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";

import { describe, expect, it } from "vitest";

import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";

import { extractWikiLinkTargets } from "@/features/wiki/wiki-link-targets";

import {
  SETUP_PAGE_RELATIONS,
  setupAnswerDraftIssues,
  setupAnswerGuide,
  setupAnswerPage,
  setupAnswerTopics,
  setupAnswersSourceText,
  setupBuiltLists,
  setupPageLists,
  setupRelatedSection,
  type SetupLinkedList,
  type SetupLinkedPage,
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
const copy = {
  title: (kind: string) => kind,
  operatingGuide: "Guide",
  sourcesHeading: "sourcesHeading",
  gapsHeading: "gapsHeading",
  pagesHeading: "pagesHeading",
  guidesHeading: "guidesHeading",
  proceduresHeading: "proceduresHeading",
  knowledgeHeading: "knowledgeHeading",
  listsHeading: "listsHeading",
  relatedHeading: "relatedHeading",
  answersSource: (date: string) => `answers of ${date}`,
};
const ids = {
  overview: "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f71",
  ideal: "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f72",
  pricing: "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f73",
  playbook: "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f74",
  processes: "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f75",
  voice: "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f76",
  guide: "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f77",
  contacts: "1f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f71",
  organizations: "1f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f72",
  deals: "1f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f73",
  services: "1f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f74",
  tasks: "1f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f75",
};
const linkedPages: SetupLinkedPage[] = [
  { key: "overview", title: "Overview", pageId: ids.overview, kind: "overview", wikiKind: "knowledge" },
  { key: "idealCustomer", title: "Ideal customer", pageId: ids.ideal, kind: "idealCustomer", wikiKind: "knowledge" },
  { key: "pricing", title: "Pricing", pageId: ids.pricing, kind: "productsPricing", wikiKind: "knowledge" },
  { key: "salesPlaybook", title: "Playbook", pageId: ids.playbook, kind: "salesPlaybook", wikiKind: "knowledge" },
  { key: "processes", title: "Processes", pageId: ids.processes, kind: "processes", wikiKind: "procedure" },
  { key: "toneOfVoice", title: "Voice", pageId: ids.voice, kind: "toneOfVoice", wikiKind: "knowledge" },
];
const builtLists: SetupLinkedList[] = [
  { key: "contact", id: ids.contacts, label: "Contacts" },
  { key: "organization", id: ids.organizations, label: "Organizations" },
  { key: "deal", id: ids.deals, label: "Opportunities" },
  { key: "service", id: ids.services, label: "Services" },
  { key: "task", id: ids.tasks, label: "Tasks" },
];
const BASE_URL = "https://app.example.test";

function targets(markdown: string) {
  return extractWikiLinkTargets(markdown, { baseUrl: BASE_URL, workspaceSlug: null });
}
const title = (kind: string) => kind;

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

  it("cites the setup answers and writes no page when no section is supported", () => {
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

  it("lists every written page grouped by kind and every built list in the Operating Guide", () => {
    expect(setupAnswerGuide({ pages: [], lists: builtLists, copy })).toBeNull();
    const guide = setupAnswerGuide({ pages: linkedPages, lists: builtLists, copy });
    expect(guide).toMatchObject({ title: "Guide", kind: "guide" });
    const markdown = guide?.markdown ?? "";
    expect(markdown).not.toContain("## guidesHeading");
    expect(markdown.indexOf("## proceduresHeading")).toBeLessThan(markdown.indexOf("## knowledgeHeading"));
    expect(markdown.indexOf("## knowledgeHeading")).toBeLessThan(markdown.indexOf("## listsHeading"));
    const linked = targets(markdown);
    expect(linked.pages.sort()).toEqual(linkedPages.map((page) => page.pageId).sort());
    expect(linked.lists.sort()).toEqual(builtLists.map((list) => list.id).sort());
    expect(markdown.split("## knowledgeHeading")[0]).toContain(ids.processes);
  });

  it("relates the pages by the static map, in both directions where the map says so", () => {
    expect(SETUP_PAGE_RELATIONS.overview).toEqual(expect.arrayContaining(["idealCustomer", "faq"]));
    expect(SETUP_PAGE_RELATIONS.faq).toContain("overview");
    expect(SETUP_PAGE_RELATIONS.idealCustomer).toEqual(
      expect.arrayContaining(["overview", "productsPricing", "salesPlaybook"]),
    );
    expect(SETUP_PAGE_RELATIONS.productsPricing).toContain("idealCustomer");
    expect(SETUP_PAGE_RELATIONS.salesPlaybook).toEqual(
      expect.arrayContaining(["idealCustomer", "processes", "toneOfVoice"]),
    );
    expect(SETUP_PAGE_RELATIONS.processes).toEqual(expect.arrayContaining(["salesPlaybook", "toneOfVoice"]));
    expect(SETUP_PAGE_RELATIONS.toneOfVoice).toEqual([]);
  });

  it("links the guide, the related pages and the page's lists in the Related section", () => {
    const lists = setupPageLists(plan, builtLists);
    const playbook = linkedPages.find((page) => page.kind === "salesPlaybook");
    if (!playbook) throw new Error("missing page");
    const section = setupRelatedSection({
      page: playbook,
      pages: linkedPages,
      guide: { title: "Guide", pageId: ids.guide },
      lists: lists.salesPlaybook,
      copy,
    });
    expect(section.startsWith("## relatedHeading\n\n")).toBe(true);
    const linked = targets(section);
    expect(linked.pages.sort()).toEqual([ids.guide, ids.ideal, ids.processes, ids.voice].sort());
    expect(linked.lists).toEqual([ids.deals]);
    const voice = linkedPages.find((page) => page.kind === "toneOfVoice");
    if (!voice) throw new Error("missing page");
    const voiceSection = setupRelatedSection({
      page: voice,
      pages: linkedPages,
      guide: { title: "Guide", pageId: ids.guide },
      lists: [],
      copy,
    });
    expect(targets(voiceSection).pages).toEqual([ids.guide]);
  });

  it("maps each page kind to the lists it concerns", () => {
    const lists = setupPageLists(plan, builtLists);
    expect(lists.salesPlaybook.map((list) => list.key)).toEqual(["deal"]);
    expect(lists.processes.map((list) => list.key)).toEqual(["deal"]);
    expect(lists.productsPricing.map((list) => list.key)).toEqual(["service"]);
    expect(lists.idealCustomer.map((list) => list.key)).toEqual(["contact", "organization"]);
    expect(lists.overview).toEqual([]);
    expect(lists.toneOfVoice).toEqual([]);
    expect(setupPageLists(null, builtLists).salesPlaybook).toEqual([]);
  });

  it("names the built lists by their plural name", () => {
    expect(
      setupBuiltLists({
        lists: [{ id: ids.deals, key: "deal", name: "Deal", pluralName: "Deals", icon: null, color: null, stages: [] }],
        views: [],
        records: [],
        widgets: [],
        pages: [],
      } as never),
    ).toEqual([{ key: "deal", id: ids.deals, label: "Deals" }]);
  });
});
