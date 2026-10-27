import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { WikiSynthesisBriefTopic } from "@/ee/wiki-crawl/wiki-synthesis-brief";
import type { WikiSynthesisDraft } from "@/ee/wiki-crawl/wiki-synthesis.schema";
import type { WikiPageInput } from "@/features/wiki/wiki.schema";
import type { SetupCatalogPart } from "./workspace-setup-prompts";
import type { SetupPageTitle } from "./workspace-setup-knowledge";
import type { SetupPageCopy } from "./workspace-setup-knowledge-brief";

import { z } from "zod";

import { wikiSynthesisSectionMarkdown } from "@/ee/wiki-crawl/wiki-synthesis-markdown";
import { wikiPageMarkdownLink } from "@/features/wiki/wiki-links";
import { WIKI_WHEN_TO_USE_MAX_LENGTH, wikiPageKindIssue } from "@/features/wiki/wiki.schema";

import { setupAnswerDigest } from "./workspace-setup-prompts";
import { setupKnowledgeBrief } from "./workspace-setup-knowledge";

export const SETUP_ANSWERS_SOURCE_KEY = "answers";
export const SETUP_ANSWER_GUIDE_KEY = "operating_guide";
const MIN_QUOTE_LENGTH = 3;

export const SetupAnswerPagesSchema = z
  .object({
    planned: z.number().int().nonnegative(),
    titles: z.array(z.string().min(1)).optional(),
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

export function setupAnswerGuide(args: {
  pages: Array<{ title: string; pageId: string }>;
  copy: SetupPageCopy;
}): WikiPageInput | null {
  if (args.pages.length === 0) return null;
  return {
    title: args.copy.operatingGuide,
    kind: "guide",
    markdown: `## ${args.copy.pagesHeading}\n\n${args.pages.map(({ title, pageId }) => `- ${wikiPageMarkdownLink(title, pageId)}`).join("\n")}`,
  };
}
