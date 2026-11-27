import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { WikiSynthesisBriefTopic } from "@/ee/wiki-crawl/wiki-synthesis-brief";
import type { WikiSynthesisDraft } from "@/ee/wiki-crawl/wiki-synthesis.schema";
import type { WikiPageInput, WikiPageKind } from "@/features/wiki/wiki.schema";
import type { SetupCatalogPart } from "./workspace-setup-prompts";
import type { SetupPageCopy, SetupPageKind, SetupPageTitle } from "./workspace-setup-knowledge";
import type { StoredSetupResults } from "./workspace-setup.schema";

import { z } from "zod";

import { wikiSynthesisSectionMarkdown } from "@/ee/wiki-crawl/wiki-synthesis-markdown";
import { recordListMarkdownLink, wikiPageMarkdownLink } from "@/features/wiki/wiki-links";
import { WIKI_WHEN_TO_USE_MAX_LENGTH, wikiPageKindIssue } from "@/features/wiki/wiki.schema";
import { setupRoleList } from "@/features/workspace-setup/setup-anchors";

import { setupAnswerDigest } from "./workspace-setup-prompts";
import { setupKnowledgeBrief } from "./workspace-setup-knowledge";

export const SETUP_ANSWERS_SOURCE_KEY = "answers";
export const SETUP_ANSWER_GUIDE_KEY = "operating_guide";
const MIN_QUOTE_LENGTH = 3;

export const SetupAnswerPagesSchema = z
  .object({
    planned: z.number().int().nonnegative(),
    titles: z.array(z.string().min(1)).optional(),
    linked: z.array(z.string().min(1)).optional(),
    pages: z.array(
      z
        .object({
          key: z.string().min(1),
          title: z.string().min(1),
          pageId: z.uuid().nullable(),
          intendedAt: z.iso.datetime().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type SetupAnswerPages = z.infer<typeof SetupAnswerPagesSchema>;

function answerText(answer: unknown): string {
  if (typeof answer === "string" || typeof answer === "number") return String(answer);
  if (Array.isArray(answer)) return answer.map(answerText).filter(Boolean).join(", ");
  if (!answer || typeof answer !== "object") return "";
  if ("label" in answer && typeof answer.label === "string") return answer.label;
  if ("chosen" in answer) {
    const own = "own" in answer && Array.isArray(answer.own) ? answer.own : [];
    return answerText([...(answer.chosen as unknown[]), ...own]);
  }
  if ("min" in answer && "max" in answer)
    return answer.min === answer.max ? answerText(answer.min) : `${answerText(answer.min)}–${answerText(answer.max)}`;
  return "";
}

export function setupAnswersSourceText(answers: SetupAnswers, catalog: SetupCatalogPart[]): string {
  return setupAnswerDigest(answers, catalog)
    .flatMap(({ question, answer }) => {
      const text = answerText(answer).replace(/\s+/gu, " ").trim();
      return text ? [`- ${question}${/[?:]$/u.test(question) ? "" : ":"} ${text}`] : [];
    })
    .join("\n");
}

export function setupAnswerTopics(
  plan: SetupPlan | null,
  answers: SetupAnswers,
  title: SetupPageTitle,
): WikiSynthesisBriefTopic[] {
  return setupKnowledgeBrief(plan, answers, title).topics.filter((topic) => topic.role !== "faq");
}

export function setupAnswerDraftIssues(draft: WikiSynthesisDraft, source: string): number[] {
  const lines = source.split("\n");
  return draft.sections.flatMap((section, index) =>
    section.evidence.length === 0 ||
    section.evidence.some(({ source: key, quote }) => {
      const passage = quote.trim();
      return (
        key.trim() !== SETUP_ANSWERS_SOURCE_KEY ||
        passage.length < MIN_QUOTE_LENGTH ||
        !lines.some((line) => line.includes(passage))
      );
    })
      ? [index]
      : [],
  );
}

export function setupAnswerPage(args: {
  topic: WikiSynthesisBriefTopic;
  draft: WikiSynthesisDraft | null;
  copy: SetupPageCopy;
  source: string;
}): WikiPageInput | null {
  const { topic, draft, copy } = args;
  const sections = (draft?.sections ?? [])
    .filter(({ heading, content }) => heading.trim() && content.trim())
    .map(({ heading, content }) => `## ${heading.trim()}\n\n${wikiSynthesisSectionMarkdown(content.trim())}`);
  if (sections.length === 0) return null;
  const gaps = (draft?.gaps ?? []).map((gap) => gap.trim()).filter(Boolean);
  const markdown = [
    ...sections,
    `## ${copy.sourcesHeading}\n\n- ${args.source}`,
    ...(gaps.length ? [`## ${copy.gapsHeading}\n\n${gaps.map((gap) => `- ${gap}`).join("\n")}`] : []),
  ].join("\n\n");
  const whenToUse = (draft?.whenToUse ?? "").trim().slice(0, WIKI_WHEN_TO_USE_MAX_LENGTH);
  const procedure =
    topic.role === "procedure" &&
    Boolean(whenToUse) &&
    wikiPageKindIssue({ kind: "procedure", whenToUse, markdown }) === null;
  return procedure
    ? { title: topic.title, kind: "procedure", whenToUse, markdown }
    : { title: topic.title, kind: "knowledge", markdown };
}

export const SETUP_PAGE_RELATIONS: Record<SetupPageKind, readonly SetupPageKind[]> = {
  overview: ["idealCustomer", "faq"],
  idealCustomer: ["overview", "productsPricing", "salesPlaybook"],
  productsPricing: ["idealCustomer"],
  salesPlaybook: ["idealCustomer", "processes", "toneOfVoice"],
  processes: ["salesPlaybook", "toneOfVoice"],
  toneOfVoice: [],
  faq: ["overview"],
};

export type SetupLinkedPage = {
  key: string;
  title: string;
  pageId: string;
  kind: SetupPageKind | null;
  wikiKind: WikiPageKind;
};
export type SetupLinkedList = { key: string; id: string; label: string };

function linkList(links: string[]): string {
  return links.map((link) => `- ${link}`).join("\n");
}

export function setupAnswerGuide(args: {
  pages: SetupLinkedPage[];
  lists: SetupLinkedList[];
  copy: SetupPageCopy;
}): WikiPageInput | null {
  if (args.pages.length === 0) return null;
  const groups: Array<{ heading: string; kind: WikiPageKind }> = [
    { heading: args.copy.guidesHeading, kind: "guide" },
    { heading: args.copy.proceduresHeading, kind: "procedure" },
    { heading: args.copy.knowledgeHeading, kind: "knowledge" },
  ];
  const sections = groups.flatMap(({ heading, kind }) => {
    const pages = args.pages.filter((page) => page.wikiKind === kind);
    return pages.length
      ? [`## ${heading}\n\n${linkList(pages.map(({ title, pageId }) => wikiPageMarkdownLink(title, pageId)))}`]
      : [];
  });
  const lists = args.lists.length
    ? [
        `## ${args.copy.listsHeading}\n\n${linkList(args.lists.map(({ label, id }) => recordListMarkdownLink(label, id)))}`,
      ]
    : [];
  return { title: args.copy.operatingGuide, kind: "guide", markdown: [...sections, ...lists].join("\n\n") };
}

export function setupRelatedSection(args: {
  page: SetupLinkedPage;
  pages: SetupLinkedPage[];
  guide: { title: string; pageId: string };
  lists: SetupLinkedList[];
  copy: SetupPageCopy;
}): string {
  const related = args.page.kind ? SETUP_PAGE_RELATIONS[args.page.kind] : [];
  const neighbours = args.pages.filter(
    (candidate) => candidate.pageId !== args.page.pageId && candidate.kind !== null && related.includes(candidate.kind),
  );
  const links = [
    wikiPageMarkdownLink(args.guide.title, args.guide.pageId),
    ...neighbours.map(({ title, pageId }) => wikiPageMarkdownLink(title, pageId)),
    ...args.lists.map(({ label, id }) => recordListMarkdownLink(label, id)),
  ];
  return `## ${args.copy.relatedHeading}\n\n${linkList(links)}`;
}

export function setupBuiltLists(results: StoredSetupResults): SetupLinkedList[] {
  return results.lists.map((list) => ({ key: list.key, id: list.id, label: list.pluralName }));
}

export function setupPageLists(
  plan: SetupPlan | null,
  lists: SetupLinkedList[],
): Record<SetupPageKind, SetupLinkedList[]> {
  const byKey = (key: string | null) => lists.filter((list) => list.key === key);
  const people = plan ? setupRoleList(plan, "people") : null;
  const roled = new Set(plan?.recordModel.lists.flatMap((list) => (list.role ? [list.key] : [])) ?? []);
  const organizations = (plan?.recordModel.relationships ?? []).flatMap(({ source, target }) => {
    const other = source === people ? target : target === people ? source : null;
    return other && !roled.has(other) ? [other] : [];
  });
  const deals = byKey(plan ? setupRoleList(plan, "deals") : null);
  return {
    overview: [],
    idealCustomer: [...byKey(people), ...lists.filter((list) => organizations.includes(list.key))],
    productsPricing: byKey(plan ? setupRoleList(plan, "offerings") : null),
    salesPlaybook: deals,
    processes: deals,
    toneOfVoice: [],
    faq: [],
  };
}
