import type { ClassifierResult, ClassifierSpec, ClassifierState } from "./classifier";
import type {
  DocsRankCandidate,
  DocsRerankCandidate,
  DocsSectionRanker,
  DocsSectionReranker,
} from "@/features/mcp-tools/docs.mcp-tools";

import { env } from "@/env";

import { agentContextFromProviderText } from "./agent-context";
import { classifyMetered, hostedClassifierModelFor } from "./classifier/metered";

export const DOCS_RERANK_TIMEOUT_MS = 800;
export const DOCS_RERANK_USER_MESSAGE_CHARS = 1_000;
const DOCS_RERANK_OPTION_CHARS = 400;

export function docsRerankPlainText(value: string): string {
  return value
    .replace(/\*\*Link:\*\*.*$/gm, "")
    .replace(/[`*_>#|]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function docsRerankSpec(candidates: readonly DocsRerankCandidate[]): ClassifierSpec {
  const options = Object.fromEntries(
    candidates.map(({ id, section }) => [
      `s${id}`,
      `${section.pageTitle} > ${section.headingPath.join(" > ")}: ${docsRerankPlainText(section.text).slice(0, DOCS_RERANK_OPTION_CHARS)}`,
    ]),
  );
  return {
    id: "docs-rerank",
    questions: [
      {
        id: "best",
        type: "choice",
        instruction:
          "Which documentation section best answers `question`? If none answers it fully, pick the closest one.",
        options,
      },
    ],
  };
}

export function docsRerankChoice(result: ClassifierResult | null): number | null {
  const answer = result?.answers.best;
  if (answer?.type !== "choice" || !/^s\d+$/.test(answer.choice)) return null;
  return Number(answer.choice.slice(1));
}

export function docsRankSpec(candidates: readonly DocsRankCandidate[]): ClassifierSpec {
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
    id: "docs-rank",
    questions: [
      {
        id: "best",
        type: "choice",
        instruction:
          "The user wrote `latest_user_message` (in any language) and the assistant searched the documentation with `agent_query`. Which documentation section best answers what the user needs? Some options show only a page and heading. If none answers it fully, pick the closest one.",
        options,
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
): number[] | null {
  const chosen = docsRerankChoice(result);
  if (chosen === null || !candidates.some((candidate) => candidate.id === chosen)) return null;
  const answer = result?.answers.best;
  const probabilities = answer?.type === "choice" ? answer.probabilities : null;
  const rest = candidates.map((candidate) => candidate.id).filter((id) => id !== chosen);
  const ordered = probabilities
    ? rest
        .map((id, index) => ({ id, index, probability: probabilities[`s${id}`] ?? 0 }))
        .sort((left, right) => right.probability - left.probability || left.index - right.index)
        .map(({ id }) => id)
    : rest;
  return [chosen, ...ordered].slice(0, limit);
}

export function docsRankUserMessage(text: string | null | undefined): string | null {
  const body = text ? agentContextFromProviderText(text).body.trim() : "";
  return body ? body.slice(0, DOCS_RERANK_USER_MESSAGE_CHARS) : null;
}

export type HostedDocsRanking =
  | { version: "v1"; rerank: DocsSectionReranker }
  | { version: "v2"; rank: DocsSectionRanker };

export function hostedDocsRanking(userMessage: string | null = null): HostedDocsRanking | undefined {
  const model = hostedClassifierModelFor("docs_rerank");
  if (!model) return undefined;
  const options = { jev: { timeoutMs: DOCS_RERANK_TIMEOUT_MS }, gemini: { timeoutMs: DOCS_RERANK_TIMEOUT_MS } };
  if (env.AGENT_DOCS_RERANK_VERSION === "v1") {
    return {
      version: "v1",
      rerank: async (query, candidates) => {
        const { result } = await classifyMetered(
          "docs_rerank",
          docsRerankSpec(candidates),
          { question: query },
          model,
          options,
        );
        return docsRerankChoice(result);
      },
    };
  }
  const message = docsRankUserMessage(userMessage);
  return {
    version: "v2",
    rank: async (query, candidates) => {
      const { result } = await classifyMetered(
        "docs_rerank",
        docsRankSpec(candidates),
        docsRankState(query, message),
        model,
        options,
      );
      return docsRankOrder(result, candidates);
    },
  };
}
