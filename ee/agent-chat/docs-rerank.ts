import type { ClassifierResult, ClassifierSpec } from "./classifier";
import type { DocsRerankCandidate, DocsSectionReranker } from "@/features/mcp-tools/docs.mcp-tools";

import { classifyMetered, hostedClassifierModelFor } from "./classifier/metered";

export const DOCS_RERANK_TIMEOUT_MS = 800;
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

export function hostedDocsReranker(): DocsSectionReranker | undefined {
  const model = hostedClassifierModelFor("docs_rerank");
  if (!model) return undefined;
  return async (query, candidates) => {
    const { result } = await classifyMetered("docs_rerank", docsRerankSpec(candidates), { question: query }, model, {
      jev: { timeoutMs: DOCS_RERANK_TIMEOUT_MS },
      gemini: { timeoutMs: DOCS_RERANK_TIMEOUT_MS },
    });
    return docsRerankChoice(result);
  };
}
