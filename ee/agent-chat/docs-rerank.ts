import type { ClassifierResult, ClassifierSpec, ClassifierState } from "./classifier";
import type { DocsRankEvidenceContext } from "./docs-rank-evidence";
import type {
  RankableSection,
  RetrievalCorpus,
  SectionRanker,
  SectionRankerFactory,
  SectionRanking,
} from "@/core/retrieval/retrieval-context";

import { docsRankEvidence } from "./docs-rank-evidence";

import { agentContextFromProviderText } from "./agent-context";
import { classifyMetered, hostedDocsRerankModel } from "./classifier/metered";

export const DOCS_RERANK_USER_MESSAGE_CHARS = 1_000;
const DOCS_RERANK_OPTION_CHARS = 800;
const DOCS_RERANK_EVIDENCE_CHARS = 16_000;
export const DOCS_RERANK_NONE = "none";

export function docsRerankPlainText(value: string): string {
  return value
    .replace(/\*\*Link:\*\*.*$/gm, "")
    .replace(/[`*_>#|]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function docsRerankChoice(result: ClassifierResult | null): number | null {
  const answer = result?.answers.best;
  if (!answer || !/^s\d+$/.test(answer.choice)) return null;
  return Number(answer.choice.slice(1));
}

const RANK_INSTRUCTIONS: Record<RetrievalCorpus, string> = {
  docs: "The user wrote `latest_user_message`; `agent_query` names the searched detail. Which documentation section directly answers the requested workflow, action and current state? Prefer the feature's own procedure or governing rule over an overview, a cross-reference, a consequence elsewhere, or a caveat about another action. A recovery that assumes an unreported failure cause or an existing item does not answer an initial setup question. For navigation, prefer the specific destination over a directory that merely contains it. Judge the section's own heading and bounded Content excerpt; Page context identifies scope. If none answers fully, pick the closest; choose none only if no section answers it at all.",
  wiki: "The user wrote `latest_user_message` (in any language) and the assistant searched the Knowledge Base with `agent_query`. Which Knowledge Base section best answers what the user needs? If none answers it fully, pick the closest one; choose none only if no section answers it at all.",
};

export function docsRankExcerpt(
  markdown: string,
  query: string,
  maxChars = DOCS_RERANK_OPTION_CHARS,
  ownHeading?: string,
  context: DocsRankEvidenceContext = {},
): string {
  const link = markdown.match(/^\*\*Link:\*\*([^\n]*)$/m)?.[1].split("**Mate:**")[0] ?? "";
  const routes = link.match(/`\/[^`]+`/gu) ?? [];
  const routeBudget = Math.min(128, Math.floor(maxChars / 3));
  let navigation = "";
  for (const route of routes) {
    const proposed = navigation ? `${navigation}, ${route}` : `Link: ${route}`;
    if (proposed.length <= routeBudget) navigation = proposed;
  }
  const leading = markdown.match(/^#{1,6} ([^\n]*)(?:\n|$)/u);
  const body =
    leading && ownHeading && docsRerankPlainText(leading[1]) === docsRerankPlainText(ownHeading)
      ? markdown.slice(leading[0].length)
      : markdown;
  const plainNavigation = navigation.replace(/`/gu, "");
  const focused = docsRankEvidence(
    body.replace(/^\*\*Link:\*\*.*$/gm, ""),
    query,
    Math.max(0, maxChars - plainNavigation.length - (plainNavigation ? 1 : 0)),
    context,
  );
  return [focused, plainNavigation].filter(Boolean).join(" ");
}

export function docsRankSpec(
  candidates: readonly RankableSection[],
  corpus: RetrievalCorpus = "docs",
  query = "",
): ClassifierSpec {
  const weights = candidates.map((_, index) => (index < 20 ? 5 : 1));
  const totalWeight = Math.max(
    1,
    weights.reduce((total, weight) => total + weight, 0),
  );
  const options = Object.fromEntries(
    candidates.map(({ id, section, locale }, index) => {
      const optionChars = Math.min(
        DOCS_RERANK_OPTION_CHARS,
        Math.floor((DOCS_RERANK_EVIDENCE_CHARS * weights[index]) / totalWeight),
      );
      const heading = section.headingPath.at(-1) || section.pageTitle;
      const title = `${section.pageTitle} > ${section.headingPath.slice(0, -1).join(" > ")}`.replace(/ > $/u, "");
      const content = section.text
        ? docsRankExcerpt(section.text, query, optionChars, section.headingPath.at(-1), {
            label: `${section.pageTitle} > ${section.headingPath.join(" > ")}`,
            locale,
          })
        : "";
      return [
        `s${id}`,
        [`Section: ${heading}`, content ? `Content: ${content}` : "", `Page context: ${title}`]
          .filter(Boolean)
          .join("\n"),
      ];
    }),
  );
  return {
    id: `${corpus}-rank`,
    questions: [
      {
        id: "best",
        type: "choice",
        instruction: RANK_INSTRUCTIONS[corpus],
        options: {
          ...options,
          [DOCS_RERANK_NONE]: "None of these sections answers what the user needs.",
        },
      },
    ],
  };
}

export function docsRankState(query: string, userMessage: string | null): ClassifierState {
  return userMessage ? { latest_user_message: userMessage, agent_query: query } : { agent_query: query };
}

export function docsRankOrder(
  result: ClassifierResult | null,
  candidates: readonly { id: number }[],
  limit = 3,
): SectionRanking | null {
  const abstained = result?.answers.best?.choice === DOCS_RERANK_NONE;
  const chosen = docsRerankChoice(result);
  if (!abstained && (chosen === null || !candidates.some((candidate) => candidate.id === chosen))) return null;
  const probabilities = result?.answers.best?.probabilities ?? null;
  const rest = candidates.map((candidate) => candidate.id).filter((id) => id !== chosen);
  const ordered = probabilities
    ? rest
        .map((id, index) => ({
          id,
          index,
          probability: probabilities[`s${id}`] ?? 0,
        }))
        .sort((left, right) => right.probability - left.probability || left.index - right.index)
        .map(({ id }) => id)
    : rest;
  return {
    order: (chosen === null ? ordered : [chosen, ...ordered]).slice(0, limit),
    abstained,
  };
}

export function docsRankUserMessage(text: string | null | undefined): string | null {
  const body = text ? agentContextFromProviderText(text).body.trim() : "";
  return body ? body.slice(0, DOCS_RERANK_USER_MESSAGE_CHARS) : null;
}

function hostedSectionRanking(userMessage: string | null, corpus: RetrievalCorpus): SectionRanker | undefined {
  const model = hostedDocsRerankModel();
  if (!model) return undefined;
  const message = docsRankUserMessage(userMessage);
  return async (query, candidates) => {
    const { result } = await classifyMetered(
      corpus === "docs" ? "docs_rerank" : "wiki_rerank",
      docsRankSpec(candidates, corpus, query),
      docsRankState(query, message),
      model,
    );
    return docsRankOrder(result, candidates);
  };
}

export function hostedSectionRankers(userMessage: string | null = null): SectionRankerFactory | undefined {
  if (!hostedDocsRerankModel()) return undefined;
  const rankers = new Map<RetrievalCorpus, SectionRanker | undefined>();
  return (corpus) => {
    if (!rankers.has(corpus)) rankers.set(corpus, hostedSectionRanking(userMessage, corpus));
    return rankers.get(corpus);
  };
}
