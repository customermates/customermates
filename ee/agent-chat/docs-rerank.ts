import type { ClassifierResult, ClassifierSpec, ClassifierState } from "./classifier";
import type {
  RankableSection,
  RetrievalCorpus,
  SectionRanker,
  SectionRankerFactory,
  SectionRanking,
} from "@/core/retrieval/retrieval-context";

import { agentContextFromProviderText } from "./agent-context";
import { classifyMetered, hostedDocsRerankModel } from "./classifier/metered";

export const DOCS_RERANK_USER_MESSAGE_CHARS = 1_000;
const DOCS_RERANK_OPTION_CHARS = 400;
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
  docs: "The user wrote `latest_user_message` (in any language) and the assistant searched the documentation with `agent_query`. Which documentation section best answers what the user needs? Some options show only a page and heading. If none answers it fully, pick the closest one; choose none only if no section answers it at all.",
  wiki: "The user wrote `latest_user_message` (in any language) and the assistant searched the Workspace Wiki with `agent_query`. Which Wiki section best answers what the user needs? If none answers it fully, pick the closest one; choose none only if no section answers it at all.",
};

export function docsRankSpec(candidates: readonly RankableSection[], corpus: RetrievalCorpus = "docs"): ClassifierSpec {
  const options = Object.fromEntries(
    candidates.map(({ id, section, titleOnly }) => {
      const title = `${section.pageTitle} > ${section.headingPath.join(" > ")}`;
      return [
        `s${id}`,
        titleOnly ? title : `${title}: ${docsRerankPlainText(section.text).slice(0, DOCS_RERANK_OPTION_CHARS)}`,
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
        options: { ...options, [DOCS_RERANK_NONE]: "None of these sections answers what the user needs." },
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
        .map((id, index) => ({ id, index, probability: probabilities[`s${id}`] ?? 0 }))
        .sort((left, right) => right.probability - left.probability || left.index - right.index)
        .map(({ id }) => id)
    : rest;
  return { order: (chosen === null ? ordered : [chosen, ...ordered]).slice(0, limit), abstained };
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
      docsRankSpec(candidates, corpus),
      docsRankState(query, message),
      model,
    );
    return docsRankOrder(result, candidates);
  };
}

export function hostedSectionRankers(userMessage: string | null = null): SectionRankerFactory | undefined {
  if (!hostedDocsRerankModel()) return undefined;
  return (corpus) => hostedSectionRanking(userMessage, corpus);
}
